// الخدمة في خطة الدفعة وحفظ البرنامج (T2، تصور 2026-11-18 ب5.2): الاستشارة خدمة من بعد اعتماد المستوى حتى نهاية الرحلة.
// admin.cohort-plan يعرضها بلا تواريخ ولا أيام، فما بعدها كما لو كانت موقوفة، ويرفض مدة لها و«تسير مع» عليها. وحفظ قاعدة
// المرحلة يقبل «خدمة» منذ T2 ويرفضها لمرحلة فيها القياس البعدي. والحل (resolveStages) يبقيها في الرحلة بحقل lane.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { cohortPlanAction } = await import('./cohort-plan.ts');
const { cohortPlan } = await import('./stage-windows.js');
const { resolveStages, journeyProgress } = await import('./logic.js');

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
const ORG = U(1), PA = U(2), C1 = U(3), V1 = U(4);
const admin = { email: 'a@x.sa', role: 'admin' as const, method: 'passkey' } as any;
const SEED = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const stages = [
  { key: 'profile', title_ar: 'الملف', sort: 1, active: true, duration_days: 0, phase: 'admission', rules: {} },
  { key: 'approval', title_ar: 'اعتماد المستوى', sort: 2, active: true, duration_days: 2, phase: 'admission', rules: {} },
  { key: 'training', title_ar: 'التدريب', sort: 3, active: true, duration_days: 14, phase: 'qualification', rules: {} },
  { key: 'consulting', title_ar: 'الاستشارة', sort: 4, active: true, duration_days: 14, phase: 'qualification', rules: SEED },
  { key: 'support', title_ar: 'الدعم', sort: 5, active: true, duration_days: 30, phase: 'impact', rules: {} },
];
const requirements = stages.map((s, i) => ({ id: U(10 + i), stage_key: s.key, code: s.key === 'consulting' ? 'C-MEET' : `X-${i}`, kind: s.key === 'consulting' ? 'coaching' : 'check',
  title_ar: `بند ${s.title_ar}`, required: s.key !== 'consulting', active: true, sort: 1, config: s.key === 'consulting' ? { sessions_required: 1, minutes: 90, max_sessions: 2 } : {} }));
function world(cohort: Row = {}) {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null, name: 'البرنامج' }],
    program_versions: [{ id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: { stages, requirements } }],
    journey_stages: stages.map((s) => ({ ...s, program_id: PA })), stage_requirements: requirements.map((r) => ({ ...r, program_id: PA })),
    cohorts: [{ id: C1, name: 'دفعة', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: '2026-11-01', ends_on: '2027-03-31',
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', hidden_requirements: [], schedule: {}, ...cohort }],
    enrollments: [], participants: [], program_milestones: [],
    audit_log: [], participant_stage_overrides: [], participant_observations: [], coaching_sessions: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;

Deno.test('المعاينة: الخدمة بلا تواريخ ولا أيام، وما بعدها كما لو كانت موقوفة', async () => {
  const w = world();
  try {
    const p: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview' });
    const by = Object.fromEntries(p.plan.stages.map((s: any) => [s.key, s]));
    assertEquals([by.consulting.lane, by.consulting.days, by.consulting.from, by.consulting.to], ['service', 0, null, null]);
    const off: any = cohortPlan(stages, { starts_on: '2026-11-01', ends_on: '2027-03-31', schedule: { consulting: { off: true } } });
    assertEquals([by.support.from, by.support.to, p.plan.end, p.plan.total_days], [off.byKey.support.from, off.byKey.support.to, off.end, off.total_days]);
    assertEquals(p.plan.issues.filter((x: any) => x.stage === 'consulting'), []);
  } finally { w.restore(); }
});

Deno.test('الرفض: مدة للخدمة و«تسير مع» عليها، والإيقاف لهذه الدفعة يُحفظ', async () => {
  const w = world();
  try {
    const B = { base_updated_at: '2026-11-01T00:00:00Z', cohort_id: C1 };
    const codes = async (b: any) => ((await failOf(() => cohortPlanAction(admin, { ...B, op: 'preview', ...b }))).extra.errors as any[]).map((x) => x.code);
    assertEquals(await codes({ days: { consulting: 10 } }), ['service_days']);
    assert((await codes({ with: { support: 'consulting' } })).includes('with_service'));
    assertEquals(w.tables.cohorts[0].schedule, {});
    const r: any = await cohortPlanAction(admin, { ...B, op: 'save', off: { consulting: true } });
    assertEquals(r.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { consulting: { off: true } });
  } finally { w.restore(); }
});

Deno.test('حفظ القاعدة: «خدمة» تُقبل منذ T2 بإتاحتها، وتُرفض لمرحلة فيها القياس البعدي ولبوابة القبول', async () => {
  const { save } = await import('./admin.ts');
  const w = world();
  try {
    await save(admin, { entity: 'journey_stages', row: { program_id: PA, key: 'consulting', rules: { lane: 'service', mode: 'required', unlock: 'stages', after: ['approval'] } } });
    assertEquals(w.tables.journey_stages.find((s) => s.key === 'consulting')?.rules, { mode: 'on_demand', unlock: 'stages', after: ['approval'], lane: 'service' });
    w.tables.stage_requirements.push({ id: U(40), program_id: PA, stage_key: 'support', code: 'E-POST', kind: 'check', title_ar: 'القياس البعدي', required: true, active: false, sort: 2 });
    const f = await failOf(() => save(admin, { entity: 'journey_stages', row: { program_id: PA, key: 'support', rules: SEED } }));
    assertEquals(f.code, 'rules');
    assert(/القياس البعدي/.test(f.message), f.message);
    const g = await failOf(() => save(admin, { entity: 'journey_stages', row: { program_id: PA, key: 'approval', rules: { lane: 'service', unlock: 'always' } } }));
    assertEquals(g.code, 'rules');
    // و«بعد خدمة» لمرحلة أخرى مرفوض: الخدمة لا يُشترط اكتمالها
    const h = await failOf(() => save(admin, { entity: 'journey_stages', row: { program_id: PA, key: 'support', rules: { unlock: 'stages', after: ['consulting'] } } }));
    assert(/خدمة لمن يريد/.test(h.message), h.message);
  } finally { w.restore(); }
});

Deno.test('الحل: الخدمة في الرحلة بحقل lane فيجدها الحجز، ومتاحة بعد الاعتماد، وخارج التقدم وما قبل غيرها', () => {
  const items = (s: any, done: boolean) => (requirements.filter((r) => r.stage_key === s.key).map((r) => ({ ...r, status: done ? 'done' : 'pending' })));
  const run = (doneKeys: string[], list = stages): any[] => resolveStages(list.map((s) => ({ ...s, items: items(s, doneKeys.includes(s.key)), done: 0, total: 1 })), { overrides: {}, cohortStart: '2026-11-01' as any, today: new Date('2026-12-01T00:00:00Z') });
  const j: any[] = run(['profile', 'approval']);
  const c = j.find((s) => s.key === 'consulting');
  assertEquals([c.lane, c.status, c.items.length], ['service', 'available', 1]);
  assertEquals(run(['profile']).find((s: any) => s.key === 'consulting').status, 'locked');
  // الدعم لا ينتظرها
  const k: any[] = run(['profile', 'approval', 'training']);
  assertEquals(k.find((s) => s.key === 'support').status, 'active');
  assertEquals(journeyProgress(k), journeyProgress(run(['profile', 'approval', 'training'], stages.filter((s) => s.key !== 'consulting'))));
});
