// بقايا محرر رحلة الدفعة (الجولة الخامسة): «اجعل نهاية الدفعة …» بمسار admin.cohort-plan نفسه (المعاينة والحفظ والتراجع وحارس
// البريد بmoved_ids)، و«خارج نافذة المرحلة» في «الحضور والجلسات» من علامة الخط نفسه (outsideByCohort). قاعدة في الذاكرة
// بنمط cohort_plan_test.ts.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail } = await import('./core.ts');
const { writer } = await import('./admin.ts');
const { cohortPlanAction } = await import('./cohort-plan.ts');
const { outsideByCohort } = await import('./activities.ts');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let single = false, limit = Infinity, range: [number, number] | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      const cut = range ? out.slice(range[0], range[1] + 1) : out.slice(0, limit);
      return { data: single ? cut[0] ?? null : cut, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'upsert') return (x: any) => { mode = 'insert'; payload = x; return q; };
        if (k === 'gte') return (c: string, v: any) => { filters.push((r) => String(r[c] ?? '') >= String(v)); return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
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

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(1), PA = U(2), C1 = U(3), V1 = U(4), P1 = U(5), OPEN = U(6), MS_END = U(21), REQ_W = U(13);
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const START = iso(-10);
const admin = { email: 'a@x.sa', role: 'admin' as const, method: 'passkey' } as any;
const viewer = { email: 'v@x.sa', role: 'viewer', method: 'passkey' } as any;
// الملف يومان ثم التدريب 14 يومًا ثم الدعم 30: تنتهي السلسلة اليوم 46 من البداية، أي iso(35)
const stages = [
  { key: 'profile', title_ar: 'الملف', sort: 1, active: true, duration_days: 2, rules: {}, phase: 'admission' },
  { key: 'training', title_ar: 'التدريب', sort: 2, active: true, duration_days: 14, rules: {}, phase: 'qualification' },
  { key: 'support', title_ar: 'الدعم', sort: 3, active: true, duration_days: 30, rules: {}, phase: 'impact' },
];
const requirements = [
  { id: U(10), stage_key: 'profile', code: 'P-INFO', kind: 'auto', title_ar: 'الملف', required: true, active: true, sort: 1 },
  { id: REQ_W, stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', title_ar: 'الأيام التدريبية', required: true, active: true, sort: 1, config: { sessions_required: 2 } },
  { id: U(12), stage_key: 'support', code: 'S-ONE', kind: 'check', title_ar: 'بند الدعم', required: true, active: true, sort: 1 },
];
const CHAIN_END = iso(35);
function world(cohort: Row = {}) {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null, name: 'البرنامج' }],
    program_versions: [{ id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: { stages, requirements } }],
    journey_stages: stages.map((s) => ({ ...s, program_id: PA })), stage_requirements: requirements.map((r) => ({ ...r, program_id: PA })),
    cohorts: [
      { id: C1, name: 'دفعة يناير', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: START, ends_on: iso(80),
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', hidden_requirements: [], schedule: {}, ...cohort },
      { id: OPEN, name: 'المفتوحة', is_default: true, organization_id: null, program_id: PA, program_version_id: null, status: 'open', created_at: '2026-01-01T00:00:00Z', schedule: {}, starts_on: START },
    ],
    enrollments: [],
    participants: [{ id: P1, organization_id: ORG, is_demo: false, status: 'enrolled', full_name: 'سارة', profile_completed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' }],
    program_milestones: [
      { id: U(20), program_id: PA, title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, sort: 1 },
      { id: MS_END, program_id: PA, title_ar: 'قبل نهاية الدفعة', stage_key: null, anchor: 'cohort_end', offset_days: -7, complete: 'manual', active: true, sort: 2 },
    ],
    audit_log: [], participant_stage_overrides: [], participant_observations: [], coaching_sessions: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const B = (w: any) => ({ base_updated_at: w.tables.cohorts[0].updated_at });

Deno.test('«اجعل نهاية الدفعة …»: المعاينة تسمي النهاية الجديدة ومعالم «نهاية الدفعة» التي يتحرك موعدها، بلا كتابة', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(viewer, { cohort_id: C1, op: 'preview', ends_on: CHAIN_END });
    assertEquals(r.changed, true);
    assertEquals(r.impact.ends, { before: iso(80), after: CHAIN_END });
    assertEquals(r.impact.milestones.map((m: any) => [m.id, m.after]), [[MS_END, iso(28)]]);
    assertEquals(r.impact.changes, []);
    assertEquals(w.tables.cohorts[0].ends_on, iso(80));
    assertEquals(w.tables.audit_log.length, 0);
    // النهاية نفسها لا تعديل، وبلا الحقل كما كان
    assertEquals(((await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', ends_on: iso(80) })) as any).changed, false);
  } finally { w.restore(); }
});

Deno.test('«اجعل نهاية الدفعة …»: الحفظ للكاتب وحده يكتب ends_on مع الخطة، وسطر السجل قبل وبعد وmoved_ids لحارس البريد، والتراجع يعيدها', async () => {
  const w = world();
  try {
    assertEquals((await failOf(() => Promise.resolve().then(() => writer(viewer, cohortPlanAction, { ...B(w), cohort_id: C1, op: 'save', ends_on: CHAIN_END })))).status, 403);
    assertEquals(w.tables.cohorts[0].ends_on, iso(80));
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', ends_on: CHAIN_END });
    assertEquals([r.saved, r.cohort.ends_on], [true, CHAIN_END]);
    assertEquals(w.tables.cohorts[0].ends_on, CHAIN_END);
    assertEquals(w.tables.cohorts[0].schedule, {});
    const [row] = w.tables.audit_log;
    assertEquals(row.action, 'cohort.plan');
    assertEquals(row.before, { schedule: {}, ends_on: iso(80) });
    assertEquals([row.after.ends_on, row.after.summary.ends], [CHAIN_END, [iso(80), CHAIN_END]]);
    assert(row.after.moved_ids.includes(MS_END));
    // الحفظ نفسه مرة ثانية لا يكتب شيئًا
    assertEquals(((await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', ends_on: CHAIN_END })) as any).unchanged, true);
    const u: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals(u.saved, true);
    assertEquals(w.tables.cohorts[0].ends_on, iso(80));
    assertEquals(w.tables.audit_log.at(-1)!.after.ends_on, iso(80));
  } finally { w.restore(); }
});

Deno.test('«اجعل نهاية الدفعة …»: لا تراجع بعد تغيّر النهاية من غيره، والحراس (قبل البداية، والمحو، والمفتوحة، والقيمة)', async () => {
  const w = world();
  try {
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', ends_on: CHAIN_END });
    w.tables.cohorts[0].ends_on = iso(60);
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' }))).code, 'plan_changed');
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'preview', ends_on: iso(-20) }))).code, 'plan_invalid');
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'preview', ends_on: null }))).code, 'plan_invalid');
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'preview', ends_on: '2027-13-40' }))).code, 'plan_invalid');
    const open = await failOf(() => cohortPlanAction(admin, { cohort_id: OPEN, op: 'preview', ends_on: CHAIN_END }));
    assertEquals([open.code, (open.extra as any).code], ['plan_invalid', 'ends_open']);
  } finally { w.restore(); }
});

Deno.test('«الحضور والجلسات»: يوم خارج نافذة مرحلته يُوسم لكل دفعة مؤرخة من علامة الخط نفسه، والعامة في دفعات برنامجها', async () => {
  const w = world();
  try {
    const at = (d: number) => `${iso(d)}T06:00:00Z`;
    const S = (id: string, d: number | null, cohort_id: string | null = C1, extra: Row = {}) => ({ id, requirement_id: REQ_W, cohort_id, title_ar: id, active: true,
      starts_at: d == null ? null : at(d), ends_at: d == null ? null : `${iso(d)}T10:00:00Z`, ...extra });
    // التدريب من iso(-8) إلى iso(5)
    const sessions = [S('in', 0), S('out', 20), S('tbd', null), S('off', 30, C1, { active: false }), S('gen', 25, null), S('else', 40, U(77))];
    const out: any = await outsideByCohort(w.tables.cohorts, sessions);
    assertEquals(Object.keys(out).sort(), ['gen', 'out']);
    assertEquals(out.out.length, 1);
    assertEquals([out.out[0].cohort_id, out.out[0].cohort, out.out[0].stage], [C1, 'دفعة يناير', 'التدريب']);
    assert(out.out[0].window_ar.includes('إلى'));
    assert(out.out[0].text.startsWith('«الأيام التدريبية» يوم '));
    assert(out.out[0].text.includes('خارج نافذة «التدريب»'));
    // الدفعة المفتوحة بلا تواريخ: لا تُفحص
    assertEquals(out.gen.map((x: any) => x.cohort_id), [C1]);
  } finally { w.restore(); }
});
