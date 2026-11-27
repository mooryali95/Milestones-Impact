// مكتب اليوم 3ب (admin.today): قراءات متوازية، وتعذّر مصدر يُسمّى في skipped ولا يُسقط الرد، والعضوية بلا حسابات العرض،
// ولا كتابة. والمنطق الخالص (today-desk.js) يُختبر هنا وفي vitest (admin-app/src/today-desk.test.js).
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const TD = await import('./today-desk.ts');
const { deskOf } = await import('./today-desk.js');

const NOW = Date.now();
const inDays = (d: number) => new Date(NOW + d * 864e5).toISOString();
const day = (d: number) => new Date(NOW + d * 864e5).toISOString().slice(0, 10);
const cohort = { id: 'c1', name: 'دفعة الخريف', status: 'running', organization_id: null, program_id: 'p1', starts_on: day(-10), ends_on: day(60), created_at: day(-30) };

Deno.test('admin.today: مصدر متعذر يُسمّى في skipped، والباقي يُبنى، ولا يسقط الرد', async () => {
  const r: any = await TD.today({}, {
    orgs: async () => ({ rows: [{ id: 'o1', name: 'جهة', status: 'active', seats: 5, seats_used: 5, invite_code: 'X', contract_ends: '2099-01-01', logo: 'l', access: { state: 'active', n: 1 }, stats: { total: 5 } }], setups_failed: false }),
    programs: async () => ({ cohorts: [cohort], organizations: [], programs: [{ id: 'p1', name: 'ب', requirements: 2, versions: [] }], desk: { member_of: { a: 'c1' }, workshops: [] } }),
    inbox: async () => ({ items: [{ kind: 'approval', id: 'a', participant_id: 'a' }], skipped: [] }),
    experts: async () => { throw new Error('experts down'); },
    sessions: async () => [],
    // لقطة الدفعات اليومية (المرحلة 3 من تشغيل الدفعة): مصدر تنبيه المتأخرين الجدد، وله اختباره في cohort_pulse_test.ts
    snapshots: async () => [],
  });
  assertEquals(r.success, true);
  assertEquals(r.skipped, ['experts']);
  assertEquals(r.unchecked, ['expert_over']);
  assertEquals(r.alerts.map((a: any) => a.kind), ['seats_full', 'cohort_no_session']);
  assertEquals(r.pulse.length, 1);
  assertEquals(r.pulse[0].waiting, 1);
});

Deno.test('admin.today: العضوية والورش من رد الدفعات نفسه، وتعذّر جزء منه أو من جاهزية الجهات يُسمّى', async () => {
  const base = {
    orgs: async () => ({ rows: [], setups_failed: true }),
    programs: async () => ({ cohorts: [cohort], organizations: [], programs: [], desk: { member_of: null, workshops: null } }),
    inbox: async () => ({ items: [], skipped: [] }),
    experts: async () => [],
    sessions: async () => [],
    snapshots: async () => [],
  };
  const r: any = await TD.today({}, base);
  assertEquals(r.skipped, ['org_setups', 'members', 'sessions']);
  assertEquals(r.unchecked, ['cohort_no_session', 'cohort_undated', 'org_readiness']);
  assertEquals(r.pulse[0].waiting, null);
  assertEquals(r.pulse[0].next_at, null);
  // تعذّر الدفعات كلها يكفي اسمه: لا يُضاف إليه الأعضاء والجلسات
  const r2: any = await TD.today({}, { ...base, orgs: async () => ({ rows: [], setups_failed: false }), programs: async () => { throw new Error('down'); } });
  assertEquals(r2.skipped, ['programs']);
  assertEquals(r2.pulse_known, false);
});

Deno.test('admin.today: جلسة التوجيه المحجوزة التي لم ينتهِ (والجاري منذ أيام)، لا المنتهي ولا الملغى، ولا كتابة', async () => {
  const fake = installFake({
    coaching_sessions: [
      { participant_id: 'p1', status: 'booked', starts_at: inDays(2), ends_at: null },
      { participant_id: 'p1', status: 'booked', starts_at: inDays(-3), ends_at: inDays(1) },
      { participant_id: 'p1', status: 'booked', starts_at: inDays(-3), ends_at: inDays(-2) },
      { participant_id: 'p1', status: 'cancelled', starts_at: inDays(1), ends_at: null },
      { participant_id: 'p1', status: 'booked', starts_at: inDays(400), ends_at: null },
    ],
  });
  try {
    const c = await TD.LOADERS.sessions();
    assertEquals(c.length, 2);
    const d: any = deskOf({ programs: { cohorts: [cohort], organizations: [], programs: [] }, sessions: { workshops: [], coaching: c }, members: { p1: 'c1' }, orgs: [], experts: [], inbox: { items: [] } });
    assertEquals(d.pulse[0].next_at, inDays(-3));
    assertEquals(d.alerts, []);
    assertEquals(fake.writes, []);
  } finally { fake.restore(); }
});

Deno.test('memberOf: دفعة كل مشارك بقاعدة pickCohort، وmemberCounts يعدّها هي نفسها', async () => {
  const G = await import('./programs.ts');
  const enr = [{ participant_id: 'p1', cohort_id: 'c1', status: 'active', created_at: day(-5) }];
  const m = G.memberOf([{ id: 'p1', organization_id: null }, { id: 'p2', organization_id: null }], enr, [cohort]);
  assertEquals(m.p1, 'c1');
  assertEquals(G.memberCounts([{ id: 'p1', organization_id: null }, { id: 'p2', organization_id: null }], enr, [cohort]), Object.values(m).reduce((o: any, id) => (id ? { ...o, [id]: (o[id] || 0) + 1 } : o), {}));
});

Deno.test('حِمل الخبراء: طلبات حسابات العرض وجلساتها لا تُحسب، وتعذّر قراءة يُفشله فيُسمّى في skipped', async () => {
  const live = { is_demo: false }, demo = { is_demo: true };
  const tables = {
    experts: [{ id: 'e1', full_name: 'خبير', status: 'active', roles: ['coach'], weekly_hours: 1 }],
    expert_requests: [{ expert_id: 'e1', participant_id: 'd', status: 'accepted', participants: demo }, { expert_id: 'e1', participant_id: 'd2', status: 'offered', participants: demo }],
    coaching_sessions: [{ expert_id: 'e1', participant_id: 'd', status: 'booked', starts_at: inDays(2), participants: demo }],
  };
  const { expertLoadNow } = await import('./insight.ts');
  let fake = installFake(structuredClone(tables));
  try {
    const rows: any[] = await expertLoadNow();
    assertEquals(rows.length, 1);
    assert(rows[0].state !== 'over', 'حساب العرض لا يرفع الخبير فوق طاقته');
  } finally { fake.restore(); }
  fake = installFake(structuredClone({ ...tables, expert_requests: [...tables.expert_requests, { expert_id: 'e1', participant_id: 'p', status: 'accepted', participants: live }, { expert_id: 'e1', participant_id: 'q', status: 'offered', participants: live }] }));
  try { const rows: any[] = await expertLoadNow(); assertEquals(rows[0].state, 'over'); } finally { fake.restore(); }
  fake = installFake(structuredClone(tables), { fail: (t) => (t === 'coaching_sessions' ? { message: 'down' } : null) });
  try {
    const r: any = await TD.today({}, { ...TD.LOADERS, orgs: async () => [], programs: async () => null, inbox: async () => ({ items: [] }), sessions: async () => [] });
    assert(r.skipped.includes('experts'));
    assert(r.unchecked.includes('expert_over'));
  } finally { fake.restore(); }
});

Deno.test('admin.today مسجلة بصلاحية الصندوق نفسها (قراءة لكل مدير)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes("'admin.today': (_a, b) => TD.today(b),"));
  assert(src.includes("'admin.inbox': (_a, b) => A.inbox(b),"));
});
