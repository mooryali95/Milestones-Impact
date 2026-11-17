// مكتب اليوم 3ب (admin.today): قراءات متوازية، وتعذّر مصدر يُسمّى في skipped ولا يُسقط الرد، والعضوية بلا حسابات العرض،
// ولا كتابة. والمنطق الخالص (today-desk.js) يُختبر هنا وفي vitest (admin-app/src/today-desk.test.js).
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { installFake } from './_fake_db.ts';
const TD = await import('./today-desk.ts');
const { deskOf } = await import('./today-desk.js');

const NOW = Date.now();
const inDays = (d: number) => new Date(NOW + d * 864e5).toISOString();
const day = (d: number) => new Date(NOW + d * 864e5).toISOString().slice(0, 10);
const cohort = { id: 'c1', name: 'دفعة الخريف', status: 'running', organization_id: null, program_id: 'p1', starts_on: day(-10), ends_on: day(60), created_at: day(-30) };

Deno.test('admin.today: مصدر متعذر يُسمّى في skipped، والباقي يُبنى، ولا يسقط الرد', async () => {
  const r: any = await TD.today({}, {
    orgs: async () => [{ id: 'o1', name: 'جهة', status: 'active', seats: 5, seats_used: 5, invite_code: 'X', contract_ends: '2099-01-01', logo: 'l', access: { state: 'active', n: 1 }, stats: { total: 5 } }],
    programs: async () => ({ cohorts: [cohort], organizations: [], programs: [{ id: 'p1', name: 'ب', requirements: 2, versions: [] }] }),
    inbox: async () => ({ items: [{ kind: 'approval', id: 'a', participant_id: 'a' }], skipped: [] }),
    experts: async () => { throw new Error('experts down'); },
    sessions: async () => ({ workshops: [], coaching: [] }),
    members: async () => ({ a: 'c1' }),
  });
  assertEquals(r.success, true);
  assertEquals(r.skipped, ['experts']);
  assertEquals(r.unchecked, ['expert_over']);
  assertEquals(r.alerts.map((a: any) => a.kind), ['seats_full', 'cohort_no_session']);
  assertEquals(r.pulse.length, 1);
  assertEquals(r.pulse[0].waiting, 1);
});

Deno.test('admin.today: العضوية بقاعدة pickCohort بلا حسابات العرض، والجلسات المؤرخة القادمة، ولا كتابة', async () => {
  const fake = installFake({
    participants: [{ id: 'p1', organization_id: null, is_demo: false }, { id: 'demo', organization_id: null, is_demo: true }],
    enrollments: [{ participant_id: 'p1', cohort_id: 'c1', status: 'active', created_at: day(-5) }, { participant_id: 'demo', cohort_id: 'c1', status: 'active', created_at: day(-5) }],
    cohorts: [cohort],
    workshop_sessions: [{ cohort_id: 'c1', active: true, starts_at: inDays(4), ends_at: null }, { cohort_id: 'c1', active: true, starts_at: inDays(-20), ends_at: null }],
    coaching_sessions: [{ participant_id: 'p1', status: 'booked', starts_at: inDays(2), ends_at: null }, { participant_id: 'p1', status: 'cancelled', starts_at: inDays(1), ends_at: null }],
  });
  try {
    const m = await TD.LOADERS.members();
    assertEquals(m, { p1: 'c1' });
    const s = await TD.LOADERS.sessions();
    assertEquals(s.workshops.length, 1);
    assertEquals(s.coaching.length, 1);
    const d: any = deskOf({ programs: { cohorts: [cohort], organizations: [], programs: [] }, sessions: s, members: m, orgs: [], experts: [], inbox: { items: [] } });
    assertEquals(d.pulse[0].next_at, inDays(2));
    assertEquals(d.alerts, []);
    assertEquals(fake.writes, []);
  } finally { fake.restore(); }
});

Deno.test('admin.today مسجلة بصلاحية الصندوق نفسها (قراءة لكل مدير)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes("'admin.today': (_a, b) => TD.today(b),"));
  assert(src.includes("'admin.inbox': (_a, b) => A.inbox(b),"));
});
