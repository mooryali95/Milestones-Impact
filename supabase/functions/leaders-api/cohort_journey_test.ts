// أعضاء الدفعة لخريطتها في ملفها (cohortMemberIds وadminCohortJourney، R0 في تصور محرر رحلة الدفعة): القاعدة نفسها
// التي تعدّ بها memberCounts (pickCohort)، بلا حساب العرض ولا حساب الاختبار، والقراءة بصفحات فلا يسقط عضو عند 1000 صف.
// قاعدة في الذاكرة بنمط cohort_guard_test.ts، بلا شبكة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail } = await import('./core.ts');
const { cohortMemberIds } = await import('./programs.ts');
const { adminCohortJourney, COHORT_JOURNEY_MAX } = await import('./coordinator.ts');

type Row = Record<string, any>;
const MAX_ROWS = 1000;
function install(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false, limit = Infinity, range: [number, number] | null = null;
    const run = () => {
      const out = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      // كالإنتاج: القراءة الواحدة تقف عند max_rows (1000) بلا خطأ، فما لا يقرأ بصفحات range يُقتطع
      const cut = range ? out.slice(range[0], Math.min(range[1] + 1, range[0] + MAX_ROWS)) : out.slice(0, Math.min(limit, MAX_ROWS));
      return { data: single ? cut[0] ?? null : cut, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'range') return (f: number, t: number) => { range = [f, t]; return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from };
  Object.assign(db as any, { from });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const OPEN = 'open', C1 = 'c1', C2 = 'c2', ORG = 'org-a';
const cohorts = [
  { id: OPEN, name: 'الدفعة المفتوحة', is_default: true, organization_id: null, status: 'open', created_at: '2026-01-01' },
  { id: C1, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', starts_on: '2026-11-01', created_at: '2026-10-01' },
  { id: C2, name: 'دفعة أفراد', is_default: false, organization_id: null, status: 'running', starts_on: '2026-11-01', created_at: '2026-10-01' },
];
const admin = { email: 'a@x.sa', role: 'admin' as const } as any;

Deno.test('أعضاء الدفعة بـpickCohort: الجهة تلقائيًا، والإلحاق يغلب، والمنسحب يعود، والعرض والاختبار خارجها', async () => {
  const w = install({
    cohorts,
    participants: [
      { id: 'org-member', organization_id: ORG, is_demo: false },
      { id: 'org-enrolled-elsewhere', organization_id: ORG, is_demo: false },
      { id: 'withdrawn', organization_id: ORG, is_demo: false },
      { id: 'demo', organization_id: ORG, is_demo: true },
      { id: 'tester', organization_id: ORG, is_demo: false, is_test: true },
      { id: 'enrolled', organization_id: null, is_demo: false },
      { id: 'loner', organization_id: null, is_demo: false },
    ],
    enrollments: [
      { participant_id: 'org-enrolled-elsewhere', cohort_id: C2, status: 'active', created_at: '2026-11-02' },
      { participant_id: 'withdrawn', cohort_id: C2, status: 'withdrawn', created_at: '2026-11-02' },
      { participant_id: 'enrolled', cohort_id: C1, status: 'active', created_at: '2026-11-02' },
    ],
  });
  try {
    const a = await cohortMemberIds(C1);
    assertEquals(a?.cohort.id, C1);
    assertEquals(a?.ids.sort(), ['enrolled', 'org-member', 'withdrawn']);
    assertEquals((await cohortMemberIds(C2))?.ids, ['org-enrolled-elsewhere']);
    // الدفعة المفتوحة: من ليس له جهة ولا إلحاق
    assertEquals((await cohortMemberIds(OPEN))?.ids, ['loner']);
    assertEquals(await cohortMemberIds('nope'), null);
  } finally { w.restore(); }
});

Deno.test('القراءة بصفحات: لا يسقط عضو بعد 1000 مشارك أو 1000 إلحاق', async () => {
  const people = Array.from({ length: 1200 }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}`, organization_id: null, is_demo: false }));
  const enrollments = people.slice(0, 1100).map((p) => ({ participant_id: p.id, cohort_id: C2, status: 'active', created_at: '2026-11-02' }));
  const w = install({ cohorts, participants: people, enrollments });
  try {
    assertEquals((await cohortMemberIds(C2))?.ids.length, 1100);
    assertEquals((await cohortMemberIds(OPEN))?.ids.length, 100);
  } finally { w.restore(); }
});

Deno.test('adminCohortJourney: بلا دفعة 400، ودفعة غير موجودة 404، وأكبر من السقف رسالة صريحة 413 قبل حساب أي رحلة', async () => {
  const people = Array.from({ length: COHORT_JOURNEY_MAX + 1 }, (_, i) => ({ id: `q${i}`, organization_id: null, is_demo: false }));
  const w = install({ cohorts, participants: people, enrollments: [] });
  try {
    const none = await assertRejects(() => adminCohortJourney(admin, {}), Fail) as any;
    assertEquals(none.status, 400);
    const missing = await assertRejects(() => adminCohortJourney(admin, { cohort_id: 'nope' }), Fail) as any;
    assertEquals(missing.status, 404);
    const big = await assertRejects(() => adminCohortJourney(admin, { cohort_id: OPEN }), Fail) as any;
    assertEquals(big.status, 413);
    assertEquals(big.message.includes(String(COHORT_JOURNEY_MAX)), true);
  } finally { w.restore(); }
});
