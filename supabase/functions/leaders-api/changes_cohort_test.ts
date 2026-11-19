// «ماذا تغيّر» بفلتر الدفعة ومجال «الحضور والجلسات» (admin.changes، تصور تشغيل الدفعة 2026-11-19، 4.6): ما جرى على أعضاء الدفعة
// وما فعلوه هم (بمعرّفهم أو بريدهم كما يكتبهما السجل)، وما جرى على الدفعة وجلساتها، ولا شيء من دفعة أخرى. بقاعدة في الذاكرة
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const IN = await import('./insight.ts');
const { Fail } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(660001), COHORT = U(660002), OTHER = U(660003), WS = U(660004), WS_OTHER = U(660005);
const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 6e4).toISOString();

function world(extraMembers = 0) {
  const who = (n: number, org: string | null, extra: Row = {}) => ({ id: U(660100 + n), full_name: `مشارك ${n}`, email: `c${n}@example.sa`, organization_id: org, is_demo: false, is_test: false, ...extra });
  // 1 و2 في دفعة الجهة، 3 في الأخرى، 4 حساب اختبار في دفعة الجهة (خارج أعضائها كما في الخريطة)
  const ps = [who(1, ORG), who(2, ORG, { email: 'second.one+x@example.sa' }), who(3, null), who(4, ORG, { is_test: true }),
    ...Array.from({ length: extraMembers }, (_, i) => who(10 + i, ORG))];
  let n = 0;
  const ev = (min: number, actor_type: string, actor: string, action: string, entity: string, entity_id: string, after: Row | null = null) =>
    ({ id: `e${(n += 1)}`, actor_type, actor, action, entity, entity_id, before: null, after, created_at: ago(min) });
  return {
    ps,
    tables: {
      participants: ps,
      cohorts: [
        { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01' },
        { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02' },
      ],
      enrollments: [{ participant_id: ps[2].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' }],
      workshop_sessions: [{ id: WS, cohort_id: COHORT }, { id: WS_OTHER, cohort_id: OTHER }],
      audit_log: [
        ev(1, 'admin', 'a@example.sa', 'workshop.mark', 'participants', ps[0].id, { session_id: WS, reason: 'تعطل الرمز' }),      // e1: على عضو
        ev(2, 'participant', ps[1].email, 'workshop.checkin', 'workshop_sessions', WS, { via: 'code' }),                           // e2: فعله عضو (ببريده) على جلسة الدفعة
        ev(3, 'participant', ps[0].id, 'assessment.submit', 'assessments', U(5), null),                                           // e3: فعله عضو (بمعرّفه)
        ev(4, 'admin', 'a@example.sa', 'cohort.save', 'cohorts', COHORT, null),                                                   // e4: على الدفعة نفسها
        ev(5, 'admin', 'a@example.sa', 'workshop.save', 'workshop_sessions', WS, null),                                           // e5: على جلسة الدفعة
        ev(6, 'admin', 'a@example.sa', 'workshop.mark', 'participants', ps[2].id, { session_id: WS_OTHER }),                      // e6: عضو دفعة أخرى
        ev(7, 'participant', ps[2].email, 'workshop.checkin', 'workshop_sessions', WS_OTHER, { via: 'qr' }),                      // e7: دفعة أخرى
        ev(8, 'admin', 'a@example.sa', 'settings.save', 'app_settings', 'x', null),                                               // e8: لا علاقة له بدفعة
        ev(9, 'admin', 'a@example.sa', 'participant.status', 'participants', ps[3].id, { status: 'suspended' }),                  // e9: حساب اختبار
        ev(10, 'admin', 'a@example.sa', 'coaching.attended', 'coaching_sessions', U(6), null),                                    // e10: جلسة فردية
        ev(60 * 24 * 10, 'admin', 'a@example.sa', 'participant.status', 'participants', ps[1].id, { status: 'enrolled' }),        // e11: على عضو قبل 10 أيام
      ],
    } as Record<string, Row[]>,
  };
}
const ids = (r: any) => r.changes.map((c: Row) => c.id);

Deno.test('فلتر الدفعة: ما جرى على أعضائها وما فعلوه وما جرى عليها وعلى جلساتها، الأحدث أولًا، ولا شيء من غيرها', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    const r: any = await IN.adminChanges({ cohort_id: COHORT });
    assertEquals(ids(r), ['e1', 'e2', 'e3', 'e4', 'e5', 'e11']);
    assertEquals([r.more, r.next], [false, w.tables.audit_log.find((x) => x.id === 'e11')!.created_at]);
    // السبب يظهر تفصيلًا، واسم المشارك من ملفه
    assertEquals([r.changes[0].who, r.changes[0].detail, r.changes[0].area, r.changes[0].area_ar], ['مشارك 1', 'تعطل الرمز', 'workshop', 'الحضور والجلسات']);
    assertEquals(ids(await IN.adminChanges({ cohort_id: OTHER })), ['e6', 'e7']);
    // بلا فلتر: السجل كله كما كان
    assertEquals(ids(await IN.adminChanges({})).length, 11);
  } finally { f.restore(); }
});

Deno.test('فلتر الدفعة مع بقية الفلاتر: المدة والفاعل والمجال والصفحة التالية', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    assertEquals(ids(await IN.adminChanges({ cohort_id: COHORT, days: 7 })), ['e1', 'e2', 'e3', 'e4', 'e5']);
    assertEquals(ids(await IN.adminChanges({ cohort_id: COHORT, actor_type: 'participant' })), ['e2', 'e3']);
    assertEquals(ids(await IN.adminChanges({ cohort_id: COHORT, area: 'workshop' })), ['e1', 'e2', 'e5']);
    assertEquals(ids(await IN.adminChanges({ cohort_id: COHORT, area: 'cohort' })), ['e4']);
    const e3 = w.tables.audit_log.find((x) => x.id === 'e3')!.created_at;
    assertEquals(ids(await IN.adminChanges({ cohort_id: COHORT, before: e3 })), ['e4', 'e5', 'e11']);
  } finally { f.restore(); }
});

Deno.test('مجال «الحضور والجلسات»: حضور الورش والجلسات الفردية معًا، وبقية المجالات ببادئتها كما كانت', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    const r: any = await IN.adminChanges({ area: 'workshop' });
    assertEquals(ids(r), ['e1', 'e2', 'e5', 'e6', 'e7', 'e10']);
    assertEquals([...new Set(r.changes.map((c: Row) => c.area_ar))], ['الحضور والجلسات']);
    assertEquals(ids(await IN.adminChanges({ area: 'participant' })), ['e9', 'e11']);
    assertEquals(ids(await IN.adminChanges({ area: 'settings' })), ['e8']);
  } finally { f.restore(); }
});

Deno.test('دفعة كبيرة: الأعضاء على أكثر من طلب، والصفحة مئة والأقدم بعدها', async () => {
  const w = world(130);
  // حدث على كل عضو إضافي، أحدث من كل ما سبق
  w.ps.slice(4).forEach((p, i) => w.tables.audit_log.push({ id: `m${i}`, actor_type: 'admin', actor: 'a@example.sa', action: 'participant.status', entity: 'participants', entity_id: p.id, before: null, after: { status: 'enrolled' }, created_at: new Date(NOW - 1000 - i).toISOString() }));
  const f = installFake(w.tables);
  try {
    const r: any = await IN.adminChanges({ cohort_id: COHORT });
    assertEquals([r.changes.length, r.more], [100, true]);
    assertEquals(ids(r).slice(0, 3), ['m0', 'm1', 'm2']);
    const next: any = await IN.adminChanges({ cohort_id: COHORT, before: r.next });
    assertEquals([next.changes.length, next.more, ids(next).slice(0, 2), ids(next).at(-1)], [36, false, ['m100', 'm101'], 'e11']);
    assertEquals(new Set([...ids(r), ...ids(next)]).size, 136);
  } finally { f.restore(); }
});

Deno.test('دفعة غير موجودة أو معرّف فاسد: 404 لا سجل كامل', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    for (const cohort_id of [U(1), 'x', "a' or 1=1"]) assertEquals((await assertRejects(() => IN.adminChanges({ cohort_id }), Fail) as any).status, 404);
  } finally { f.restore(); }
});
