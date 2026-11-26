// نقل الجهة انتقال واحد (تصور المرحلة 4، م4): من له إلحاق بدفعة جهة أخرى لا يُنقل بلا تأكيد، وبعده تُنقل جهته ودفعته
// معًا بالدالة الذرية transfer_participant (دلالتها على قاعدة حقيقية في admin-app/src/single-cohort-sql.test.js، وهنا محاكاتها)،
// فيبقى له إلحاق واحد ولا عضوية مجموعة قديمة ولا يراه مستشار دفعته القديمة. والإلحاق بالدفعة العامة لا يُعد تعارضًا.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const { assignOrg } = await import('./admin.ts');
const { cohortEnroll } = await import('./programs.ts');
const { Fail } = await import('./core.ts');
const { advisorCohortParticipantIds } = await import('./logic.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG_A = U(1), ORG_B = U(2), CA = U(10), CB = U(11), DEF = U(12), P1 = U(20), P2 = U(21), G1 = U(30), ADV_A = U(40);
const ADMIN = { email: 'a@x.sa', role: 'admin' as const, method: 'passkey' };

function world() {
  return {
    organizations: [{ id: ORG_A, name: 'جهة أ', status: 'active' }, { id: ORG_B, name: 'جهة ب', status: 'active' }],
    cohorts: [
      { id: CA, name: 'دفعة أ', organization_id: ORG_A, is_default: false, status: 'running', program_id: 'prog', advisor_expert_id: ADV_A, created_at: '2026-09-01' },
      { id: CB, name: 'دفعة ب', organization_id: ORG_B, is_default: false, status: 'running', program_id: 'prog', created_at: '2026-09-01' },
      { id: DEF, name: 'المنصة العامة', organization_id: null, is_default: true, status: 'open', program_id: 'prog', created_at: '2026-01-01' },
    ],
    participants: [
      { id: P1, full_name: 'سارة', organization_id: ORG_A, organization_name: 'جهة أ', is_demo: false },
      { id: P2, full_name: 'هدى', organization_id: null, organization_name: null, is_demo: false },
    ],
    enrollments: [
      { participant_id: P1, cohort_id: CA, status: 'active', created_at: '2026-09-02' },
      { participant_id: P2, cohort_id: DEF, status: 'active', created_at: '2026-09-02' },
    ],
    cohort_group_members: [{ cohort_id: CA, participant_id: P1, group_id: G1 }],
    cohort_roles: [{ cohort_id: CA, participant_id: P1, team: 'lead' }],
    cohort_placements: [], entitlements: [], audit_log: [], participant_observations: [],
  } as Record<string, Row[]>;
}
// محاكاة transfer_participant بدلالة الترحيل: الجهة، وسحب الإلحاقات، والإلحاق بدفعة الجهة الجارية أو المنصة العامة، وحذف المجموعات والأدوار
const transfer = (calls: any[]) => (name: string, args: any, t: Record<string, Row[]>) => {
  if (name !== 'transfer_participant') return null;
  calls.push(args);
  const p = t.participants.find((x) => x.id === args.p_participant)!;
  if (args.p_set_org) p.organization_id = args.p_org;
  for (const e of t.enrollments) if (e.participant_id === p.id && e.status !== 'withdrawn' && e.cohort_id !== args.p_cohort) e.status = 'withdrawn';
  const got = args.p_cohort || t.cohorts.find((c) => c.organization_id === p.organization_id && !c.is_default && ['open', 'running'].includes(c.status))?.id || DEF;
  const had = t.enrollments.find((e) => e.participant_id === p.id && e.cohort_id === got);
  if (had) had.status = 'active'; else t.enrollments.push({ participant_id: p.id, cohort_id: got, status: 'active', created_at: '2026-11-26' });
  t.cohort_group_members = t.cohort_group_members.filter((m) => m.participant_id !== p.id || m.cohort_id === got);
  t.cohort_roles = t.cohort_roles.filter((m) => m.participant_id !== p.id || m.cohort_id === got);
  return { data: [{ cohort_id: got, outcome: 'placed' }], error: null };
};
const active = (t: Record<string, Row[]>, pid: string) => t.enrollments.filter((e) => e.participant_id === pid && e.status !== 'withdrawn').map((e) => e.cohort_id);

Deno.test('نقل جهة من له إلحاق بدفعة جهة أخرى بلا تأكيد يرد 409 confirm_move بالأثر، ولا يُكتب شيء', async () => {
  const tables = world();
  const calls: any[] = [];
  const f = installFake(tables, { rpc: transfer(calls) });
  try {
    const e: any = await assertRejects(() => assignOrg(ADMIN, { participant_ids: [P1], organization_id: ORG_B }), Fail);
    assertEquals([e.status, e.code, e.extra.affected], [409, 'confirm_move', 1]);
    assertEquals(e.extra.from, [{ id: CA, name: 'دفعة أ' }]);
    assertEquals(e.extra.to, [{ id: CB, name: 'دفعة ب' }]);
    assertEquals([tables.participants[0].organization_id, active(tables, P1), calls.length, tables.audit_log.length], [ORG_A, [CA], 0, 0]);
  } finally { f.restore(); }
});

Deno.test('بعد التأكيد: الجهة والدفعة معًا، إلحاق واحد، ولا عضوية مجموعة قديمة، ولا يراه مستشار دفعته القديمة', async () => {
  const tables = world();
  const calls: any[] = [];
  const f = installFake(tables, { rpc: transfer(calls) });
  try {
    const r: any = await assignOrg(ADMIN, { participant_ids: [P1], organization_id: ORG_B, confirm_move: true });
    assertEquals(r.moved, 1);
    assertEquals(calls.map((c) => [c.p_participant, c.p_org, c.p_set_org]), [[P1, ORG_B, true]]);
    assertEquals([tables.participants[0].organization_id, active(tables, P1)], [ORG_B, [CB]]);
    assertEquals([tables.cohort_group_members.length, tables.cohort_roles.length], [0, 0]);
    const seen = advisorCohortParticipantIds([tables.cohorts[0]], tables.cohorts, tables.enrollments, tables.participants);
    assertEquals(seen.includes(P1), false);
  } finally { f.restore(); }
});

Deno.test('الإلحاق بالدفعة العامة لا يُعد تعارضًا: الربط بجهة يمضي بلا سؤال ولا دالة النقل', async () => {
  const tables = world();
  const calls: any[] = [];
  const f = installFake(tables, { rpc: transfer(calls) });
  try {
    const r: any = await assignOrg(ADMIN, { participant_ids: [P2], organization_id: ORG_A });
    assertEquals([r.moved, calls.length, tables.participants[1].organization_id], [1, 0, ORG_A]);
  } finally { f.restore(); }
});

// 20261129240000 مطبّق: تعذّر الدالة خطأ صريح لا «غير مفعّل بعد»، ولا يكتب شيئًا
Deno.test('تعذّر دالة النقل: النقل المؤكد لمن له إلحاق بدفعة جهة أخرى يرمي خطأ الدالة ولا يكتب شيئًا', async () => {
  const tables = world();
  const f = installFake(tables);
  try {
    const e: any = await assertRejects(() => assignOrg(ADMIN, { participant_ids: [P1, P2], organization_id: ORG_B, confirm_move: true }));
    assert(e.code !== 'not_migrated');
    assertEquals([tables.participants[0].organization_id, tables.participants[1].organization_id, active(tables, P1)], [ORG_A, null, [CA]]);
  } finally { f.restore(); }
});

Deno.test('النقل بين الدفعات بالدالة نفسها حين تُطبَّق: إلحاق واحد بالهدف، والجهة لا تتغير', async () => {
  const tables = world();
  const calls: any[] = [];
  const f = installFake(tables, { rpc: transfer(calls) });
  try {
    assertEquals(((await cohortEnroll(ADMIN, { cohort_id: CB, participant_ids: [P1], confirm_move: true })) as any).enrolled, 1);
    assertEquals(calls.map((c) => [c.p_cohort, !!c.p_set_org]), [[CB, false]]);
    assertEquals([tables.participants[0].organization_id, active(tables, P1), tables.cohort_group_members.length], [ORG_A, [CB], 0]);
  } finally { f.restore(); }
});
