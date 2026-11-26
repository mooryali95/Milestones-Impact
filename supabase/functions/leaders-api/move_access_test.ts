// تصور المرحلة 1، البند 1: الوصول يتبع العلاقة الحالية. نقل مشارك إلى دفعة أخرى (cohortEnroll) يُخرجه من نطاق مستشار
// دفعته القديمة ومن نطاق خبير مجموعته القديمة، ويُدخله في نطاق مستشار الجديدة. وعضوية مجموعة عالقة لا تعيد الوصول.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const { Fail } = await import('./core.ts');
const { cohortEnroll } = await import('./programs.ts');
const { myParticipantIds, reviewBulk } = await import('./advisor.ts');

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OLD = '00000000-0000-4000-8000-0000000000c1';
const NEW = '00000000-0000-4000-8000-0000000000c2';
const P = '00000000-0000-4000-8000-0000000000b1';
const STAY = '00000000-0000-4000-8000-0000000000b2';
const G_OLD = '00000000-0000-4000-8000-0000000000d1';
const admin = { email: 'admin@example.com' } as any;
const ex = (id: string) => ({ id, status: 'active', roles: ['advisor'], full_name: id, email: `${id}@example.com` });

function world() {
  const tables: Record<string, any[]> = {
    programs: [{ id: 'prog', is_default: true }],
    cohorts: [
      { id: OLD, name: 'قديمة', program_id: 'prog', organization_id: ORG, is_default: false, status: 'running', advisor_expert_id: 'prev', starts_on: '2026-10-01' },
      { id: NEW, name: 'جديدة', program_id: 'prog', organization_id: ORG, is_default: false, status: 'running', advisor_expert_id: 'cur', starts_on: '2026-09-01' },
    ],
    participants: [{ id: P, organization_id: ORG, is_demo: false }, { id: STAY, organization_id: ORG, is_demo: false }],
    enrollments: [
      { id: 'e1', participant_id: P, cohort_id: OLD, status: 'active', created_at: '2026-10-02' },
      { id: 'e2', participant_id: STAY, cohort_id: OLD, status: 'active', created_at: '2026-10-02' },
    ],
    cohort_groups: [{ id: G_OLD, cohort_id: OLD, name: 'أ', advisor_expert_id: 'gold' }],
    cohort_group_members: [
      { cohort_id: OLD, participant_id: P, group_id: G_OLD },
      { cohort_id: OLD, participant_id: STAY, group_id: G_OLD },
    ],
    cohort_roles: [{ cohort_id: OLD, participant_id: P, team: 'lead' }, { cohort_id: OLD, participant_id: STAY, team: 'lead' }],
    experts: [ex('prev'), ex('cur'), ex('gold')],
    participant_requirements: [], audit_log: [], cohort_placements: [],
  };
  const f = installFake(tables, {
    embed: (t, r, all) => (t === 'cohort_group_members' ? { cohort_groups: (all.cohort_groups || []).find((g) => g.id === r.group_id) ?? null } : null),
  });
  return { tables: f.tables, restore: f.restore };
}

Deno.test('النقل: المستشار السابق وخبير المجموعة السابق يفقدان المشارك، والحالي يراه، والباقي في المجموعة لا يتأثر', async () => {
  const w = world();
  try {
    assertEquals((await myParticipantIds('gold')).includes(P), true);
    await cohortEnroll(admin, { cohort_id: NEW, participant_ids: [P], confirm_move: true });
    assertEquals((await myParticipantIds('prev')).includes(P), false);
    assertEquals((await myParticipantIds('gold')).includes(P), false);
    assertEquals((await myParticipantIds('cur')).includes(P), true);
    assertEquals((await myParticipantIds('gold')).includes(STAY), true);
    // صفوف المجموعة والأدوار في الدفعة القديمة حُذفت للمنقول وحده
    assertEquals(w.tables.cohort_group_members.map((m: any) => m.participant_id), [STAY]);
    assertEquals(w.tables.cohort_roles.map((m: any) => m.participant_id), [STAY]);
    // طلب المستشار السابق على المشارك يُرفض 403
    const e = await assertRejects(() => reviewBulk(ex('prev'), { participant_id: P }), Fail) as any;
    assertEquals(e.status, 403);
  } finally { w.restore(); }
});

Deno.test('الفلتر الدفاعي: عضوية مجموعة عالقة بلا تسجيل نشط في دفعتها لا تعيد الوصول لخبيرها', async () => {
  const w = world();
  try {
    // نقل كُتب بمسار آخر: سُحب التسجيل وبقي صف المجموعة
    w.tables.enrollments[0].status = 'withdrawn';
    w.tables.enrollments.push({ id: 'e3', participant_id: P, cohort_id: NEW, status: 'active', created_at: '2026-11-02' });
    assertEquals((await myParticipantIds('gold')).includes(P), false);
    assertEquals((await myParticipantIds('gold')).includes(STAY), true);
    assertEquals((await myParticipantIds('prev')).includes(P), false);
  } finally { w.restore(); }
});

Deno.test('النقل بلا مجموعات: مستشار الدفعة القديمة يفقده بعد النقل، ومستشار الجديدة يراه', async () => {
  const w = world();
  try {
    w.tables.cohort_groups = [];
    w.tables.cohort_group_members = [];
    assertEquals((await myParticipantIds('prev')).includes(P), true);
    assertEquals((await myParticipantIds('cur')).includes(P), false);
    await cohortEnroll(admin, { cohort_id: NEW, participant_ids: [P], confirm_move: true });
    assertEquals((await myParticipantIds('prev')).includes(P), false);
    assertEquals((await myParticipantIds('prev')).includes(STAY), true);
    assertEquals((await myParticipantIds('cur')).includes(P), true);
  } finally { w.restore(); }
});
