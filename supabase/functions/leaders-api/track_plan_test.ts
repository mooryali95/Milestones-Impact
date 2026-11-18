// المسار المستمر في خطة الدفعة (T1، تصور 2026-11-18 ب5.1): admin.cohort-plan يقبل until لمسار مستمر بمعاينة أثره وحفظه
// وسجله، ويرفض until لمرحلة متتابعة وقيمته المجهولة، وما زال يرفض الحقول المجهولة (start وend وschedule). والمسار يبدأ بعد
// التدريب بيوم وينتهي بنهاية الدفعة، فلا يحرك ما بعده، ومعلم نهايته بنهاية الدفعة. قاعدة في الذاكرة بنمط cohort_plan_test.ts.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { cohortPlanAction } = await import('./cohort-plan.ts');
const { journeyDefinition } = await import('./programs.ts');
const { trackWindows } = await import('./stage-windows.js');

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
const ORG = U(1), PA = U(2), C1 = U(3), V1 = U(4), P1 = U(5);
const admin = { email: 'a@x.sa', role: 'admin' as const, method: 'passkey' } as any;
const SEED = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'report' };
const stages = [
  { key: 'profile', title_ar: 'الملف', sort: 1, active: true, duration_days: 0, phase: 'admission', rules: {} },
  { key: 'training', title_ar: 'التدريب', sort: 2, active: true, duration_days: 14, phase: 'qualification', rules: {} },
  { key: 'ojt_coaching', title_ar: 'التوجيه على رأس العمل', sort: 3, active: true, duration_days: 28, phase: 'qualification', rules: SEED },
  { key: 'support', title_ar: 'الدعم', sort: 4, active: true, duration_days: 30, phase: 'impact', rules: {} },
  { key: 'report', title_ar: 'التقرير النهائي', sort: 5, active: true, duration_days: 7, phase: 'impact', rules: {} },
];
const requirements = stages.map((s, i) => ({ id: U(10 + i), stage_key: s.key, code: `X-${i}`, kind: 'check', title_ar: `بند ${s.title_ar}`, required: true, active: true, sort: 1 }));
function world(cohort: Row = {}) {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null, name: 'البرنامج' }],
    program_versions: [{ id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: { stages, requirements } }],
    journey_stages: stages.map((s) => ({ ...s, program_id: PA })), stage_requirements: requirements.map((r) => ({ ...r, program_id: PA })),
    cohorts: [{ id: C1, name: 'دفعة', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: '2026-11-01', ends_on: '2027-03-31',
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', hidden_requirements: [], schedule: {}, ...cohort }],
    enrollments: [], participants: [],
    program_milestones: [{ id: U(20), program_id: PA, title_ar: 'نهاية التوجيه', stage_key: 'ojt_coaching', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, sort: 1 }],
    audit_log: [], participant_stage_overrides: [], participant_observations: [], coaching_sessions: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;

Deno.test('المعاينة: المسار من التدريب +1 حتى نهاية الدفعة، وما بعده كما هو، ونهايته لهذه الدفعة بأثرها', async () => {
  const w = world();
  try {
    const p: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview' });
    const by = Object.fromEntries(p.plan.stages.map((s: any) => [s.key, s]));
    assertEquals([by.ojt_coaching.lane, by.ojt_coaching.from, by.ojt_coaching.to], ['track', '2026-11-02', '2027-03-31']);
    // الدعم يبدأ بعد التدريب مباشرة، والرحلة تنتهي بنهاية التقرير لا بنهاية المسار
    assertEquals([by.support.from, p.plan.end], ['2026-11-15', '2026-12-21']);
    assert(p.plan.issues.some((x: any) => x.code === 'chain_end_mismatch'));
    const r: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', until: { ojt_coaching: 'stage:support' } });
    assertEquals(r.changed, true);
    assertEquals(r.impact.changes.map((x: any) => [x.key, x.track, x.after.to]), [['ojt_coaching', true, '2026-12-14']]);
    assertEquals(r.impact.end.shift, 0);
    assertEquals(r.impact.milestones.map((m: any) => [m.before, m.after]), [['2027-03-31', '2026-12-14']]);
    assertEquals(w.tables.cohorts[0].schedule, {});
  } finally { w.restore(); }
});

Deno.test('الحفظ: until في cohorts.schedule، والسجل يسمي المعلم الذي تحرك (moved_ids لحارس البريد)، ورحلة الدفعة تقرؤه', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'save', until: { ojt_coaching: 'phase:impact' }, base_updated_at: '2026-11-01T00:00:00Z' });
    assertEquals(r.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { ojt_coaching: { until: 'phase:impact' } });
    const [row] = w.tables.audit_log;
    assertEquals(row.after.moved_ids, [U(20)]);
    assertEquals(row.after.summary.changes[0], { key: 'ojt_coaching', before: 150, after: 50, track: true, until: ['journey_end', 'phase:impact'] });
    const def: any = await journeyDefinition({}, w.tables.cohorts[0]);
    assertEquals(trackWindows(def.stages, def.cohort).ojt_coaching.to, '2026-12-21');
  } finally { w.restore(); }
});

Deno.test('الرفض: الحقول المجهولة كما كانت، وuntil لمرحلة متتابعة، وقيمة مجهولة، و«لا شيء» لمرجع المسار', async () => {
  const w = world();
  try {
    const B = { base_updated_at: '2026-11-01T00:00:00Z', cohort_id: C1 };
    for (const k of ['start', 'end', 'schedule']) assertEquals((await failOf(() => cohortPlanAction(admin, { ...B, op: 'save', [k]: { training: '2027-01-01' } }))).code, 'plan_field');
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B, op: 'save', until: 'journey_end' }))).code, 'plan_invalid');
    const codes = async (b: any) => ((await failOf(() => cohortPlanAction(admin, { ...B, op: 'preview', ...b }))).extra.errors as any[]).map((x) => x.code);
    assertEquals(await codes({ until: { support: 'journey_end' } }), ['until_alone']);
    assertEquals(await codes({ until: { ojt_coaching: 'forever' } }), ['until_value']);
    assertEquals(await codes({ with: { ojt_coaching: false } }), ['track_with']);
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

// الحارس في الاتجاهين (ب5.1): القياس البعدي لا يصل إلى مسار مستمر بأي ترتيب للخطوات: لا يُضاف إليه ولا يُنقل إليه ولا يُظهر
// فيه، ومرحلة فيها قياس بعدي ولو مخفي لا تصير مسارًا. والمسموح يمر
Deno.test('القياس البعدي والمسار: يُرفض من جهة المتطلب كما من جهة المرحلة، والمخفي يمنع المسار', async () => {
  const { save } = await import('./admin.ts');
  const w = world();
  const POST = U(30), HIDDEN = U(31);
  w.tables.stage_requirements.push(
    { id: POST, program_id: PA, stage_key: 'support', code: 'E-POST', kind: 'check', title_ar: 'القياس البعدي', required: true, active: true, sort: 2 },
    { id: HIDDEN, program_id: PA, stage_key: 'report', code: 'E-POST', kind: 'check', title_ar: 'القياس البعدي القديم', required: true, active: false, sort: 2 },
  );
  try {
    const msg = 'لا يوضع القياس البعدي في مسار مستمر: عليه يُبنى التقييم والتقرير';
    const no = async (b: any) => { const f = await failOf(() => save(admin, b)); assertEquals([f.code, f.message], ['rules', msg]); };
    // إنشاء E-POST جديد وتغيير رمز متطلب إليه مرفوضان أصلًا بقفل المحتوى (رمز نظامي، والرمز ثابت بعد إنشائه)
    const locked = async (b: any) => assertEquals((await failOf(() => save(admin, b))).code, 'content_locked');
    await locked({ entity: 'stage_requirements', row: { program_id: PA, stage_key: 'ojt_coaching', code: 'E-POST', kind: 'check', title_ar: 'القياس البعدي' } });
    await locked({ entity: 'stage_requirements', row: { id: U(12), code: 'E-POST' } });
    // نقل القائم إلى المسار
    await no({ entity: 'stage_requirements', row: { id: POST, stage_key: 'ojt_coaching' } });
    assertEquals(w.tables.stage_requirements.find((r) => r.id === POST)?.stage_key, 'support');
    // إظهار مخفي داخل المسار
    w.tables.stage_requirements.find((r) => r.id === HIDDEN)!.stage_key = 'ojt_coaching';
    await no({ entity: 'stage_requirements', row: { id: HIDDEN, active: true } });
    assertEquals(w.tables.stage_requirements.find((r) => r.id === HIDDEN)?.active, false);
    w.tables.stage_requirements.find((r) => r.id === HIDDEN)!.stage_key = 'report';
    // مرحلة فيها E-POST مخفي لا تصير مسارًا، فإظهاره لاحقًا لا يعيد الحال الممنوعة
    w.tables.stage_requirements.find((r) => r.id === POST)!.active = false;
    const f = await failOf(() => save(admin, { entity: 'journey_stages', row: { program_id: PA, key: 'support', rules: SEED } }));
    assertEquals(f.code, 'rules');
    assert(/القياس البعدي/.test(f.message), f.message);
  } finally { w.restore(); }
});
