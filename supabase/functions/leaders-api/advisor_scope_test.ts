// نطاق مستشار الدفعة (server-sec-7) على قاعدة مزيفة تطبّق المرشحات فعلًا: myParticipantIds يعطي من كانت تعطيه
// الحلقة القديمة (cohortOf لكل مرشح) بأعيانهم، وعدد استعلاماته ثابت لا يكبر بعدد المشاركين.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1';
const { db } = await import('./core.ts');
const { myParticipantIds } = await import('./advisor.ts');
const { cohortOf } = await import('./programs.ts');

type Row = Record<string, any>;
// جداول في الذاكرة، والاستعلام يطبّق eq وin وnot(is null) وorder وrange كما يفعل PostgREST
function install(tables: Record<string, Row[]>) {
  let queries = 0;
  const from = (table: string) => {
    queries += 1;
    const filters: ((r: Row) => boolean)[] = [];
    let range: [number, number] | null = null;
    let single = false;
    const run = () => {
      let rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const q: any = {
      select: () => q, order: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v || (v === false && !r[c])); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      not: (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; },
      range: (f: number, t: number) => { range = [f, t]; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  Object.assign(db as any, { from });
  return { count: () => queries, reset: () => { queries = 0; }, restore: () => { delete (db as any).from; } };
}

// الحلقة القديمة بنصها (قبل الإصلاح)، لمقارنة الأعيان
async function before(expertId: string) {
  const { data: cohorts } = await db.from('cohorts').select('id, organization_id, is_default').eq('advisor_expert_id', expertId);
  const ids = new Set<string>();
  for (const c of cohorts || []) {
    const { data: enr } = await db.from('enrollments').select('participant_id').eq('cohort_id', c.id);
    (enr || []).forEach((x: any) => ids.add(x.participant_id));
    const base = c.organization_id
      ? await db.from('participants').select('id, organization_id').eq('organization_id', c.organization_id).eq('is_demo', false)
      : c.is_default ? await db.from('participants').select('id, organization_id').eq('is_demo', false) : { data: [] as any[] };
    for (const p of (base.data || [])) {
      if (ids.has(p.id)) continue;
      const { cohort } = await cohortOf(p);
      if ((cohort as any)?.id === c.id) ids.add(p.id);
    }
  }
  return [...ids].sort();
}

function world(n: number): Record<string, Row[]> {
  const orgs = ['A', 'B'];
  const participants = Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}`, organization_id: i % 3 === 0 ? null : orgs[i % 2], is_demo: i === 5 }));
  return {
    cohorts: [
      { id: 'open', is_default: true, organization_id: null, status: 'running', advisor_expert_id: 'x', created_at: '2026-10-01' },
      { id: 'cA', is_default: false, organization_id: 'A', status: 'running', advisor_expert_id: 'x', starts_on: '2026-11-01' },
      { id: 'cB', is_default: false, organization_id: 'B', status: 'open', advisor_expert_id: 'y', starts_on: '2026-11-01' },
      { id: 'free', is_default: false, organization_id: null, status: 'running', advisor_expert_id: 'z' },
    ],
    participants,
    enrollments: participants.filter((_, i) => i % 7 === 0).map((p, i) => ({ id: `e${i}`, participant_id: p.id, cohort_id: ['free', 'cB', 'cA', 'open'][i % 4], status: i % 5 === 0 ? 'withdrawn' : 'active', created_at: '2026-11-05' })),
    cohort_groups: [], cohort_group_members: [], experts: [],
  };
}

Deno.test('نطاق المستشار: الأعيان أنفسهم كما في الحلقة القديمة، لكل خبير', async () => {
  const f = install(world(120));
  try {
    for (const x of ['x', 'y', 'z', 'nobody']) assertEquals((await myParticipantIds(x)).sort(), await before(x), x);
  } finally { f.restore(); }
});

Deno.test('نطاق المستشار: عدد الاستعلامات ثابت لا يكبر بعدد المشاركين (كان 2N متتابعة)', async () => {
  const counts: number[] = [];
  for (const n of [30, 600]) {
    const f = install(world(n));
    try { await myParticipantIds('x'); counts.push(f.count()); } finally { f.restore(); }
  }
  assertEquals(counts[0], counts[1]);
  // دفعات الخبير، ثم الدفعات والتسجيلات والمرشحون، ثم المجموعات (اثنان)
  assertEquals(counts[0] <= 6, true, `استعلامات: ${counts[0]}`);
});
