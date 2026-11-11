// org-15: لوحة الجهة تحسب رحلة كل مشارك عند كل فتح. الحساب الخفيف (lite) يترك المجموعة والتقييم المستمر
// اللذين لا تأخذهما اللوحة، والرحلة والتقدم والمعالم وما تبني عليه خريطة الرحلة كما هي بلا فرق
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
const { db } = await import('./core.ts');
const { journeyFor } = await import('./participant.ts');

type Row = Record<string, any>;
// جداول في الذاكرة: eq وin وis وnot(is null)، وما سواها من المرشحات لا يغيّر النتيجة هنا
function install(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false, single = false;
    const run = () => {
      reads.push(table);
      const out = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      if (head) return { data: null, count: out.length, error: null };
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = (db as any).from;
  Object.assign(db as any, { from });
  return { reads, restore: () => { (db as any).from = prev; } };
}

const P = { id: 'p1', full_name: 'سارة', status: 'enrolled', organization_id: null, profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-09-30T08:00:00Z' };
const world = () => ({
  participants: [P],
  programs: [{ id: 'prog', is_default: true, name: 'البرنامج', final_eval: null }],
  cohorts: [{ id: 'c1', name: 'الدفعة', is_default: true, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-10-01' }],
  placements: [
    { participant_id: 'p1', dimension: 'milestone', level: 'L2', approved_at: '2026-10-05T08:00:00Z' },
    { participant_id: 'p1', dimension: 'impact', level: 'L1', approved_at: '2026-10-05T08:00:00Z' },
    { participant_id: 'p1', dimension: 'leadership', level: 'L2', approved_at: '2026-10-05T08:00:00Z' },
  ],
  assessments: [{ id: 'a1', participant_id: 'p1', status: 'submitted', submitted_at: '2026-10-03T08:00:00Z', instruments: { kind: 'baseline' } }],
  cohort_group_members: [{ cohort_id: 'c1', participant_id: 'p1', group_id: 'g1', cohort_groups: { name: 'المجموعة أ' } }],
  handbook_progress: [{ participant_id: 'p1', quiz_score: 4, quiz_total: 5, completed_at: '2026-10-10T08:00:00Z', handbook_modules: { title_ar: 'وحدة' } }],
});
// ما تأخذه لوحة الجهة من الرحلة (coordinator.ts: dashboardFor وخريطة الرحلة)
const used = (j: any) => ({ journey: j.journey, progress: j.progress, milestones: j.milestones, pl: j.pl, baselineAt: j.baselineAt, levels: j.levels, approved: j.approved });

Deno.test('الرحلة الخفيفة للوحة الجهة: النتيجة نفسها بلا استعلامات المجموعة والتقييم المستمر', async () => {
  const full = install(world());
  let a: any;
  try { a = await journeyFor(P); } finally { full.restore(); }
  const lite = install(world());
  let b: any;
  try { b = await journeyFor(P, { lite: true }); } finally { lite.restore(); }

  assertEquals(used(b), used(a));
  assert(a.journey.length > 0, 'الرحلة محسوبة فعلًا لا فارغة');
  assertEquals([b.group, b.continuous], [null, null]);
  for (const t of ['cohort_group_members', 'handbook_progress', 'model_submissions', 'expert_ratings', 'lab_attempts', 'peer_answers']) {
    assert(full.reads.includes(t), `الحساب الكامل يقرأ ${t}`);
    assert(!lite.reads.includes(t), `الحساب الخفيف لا يقرأ ${t}`);
  }
  assert(lite.reads.length < full.reads.length);
});
