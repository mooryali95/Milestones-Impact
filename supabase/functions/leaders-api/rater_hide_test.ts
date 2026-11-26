// تقدير الزملاء مع مفتاح 360، وتقييم المدير خارجه (تصور المرحلة 3، القرار 2، 2026-11-26؛ كانا معًا بقرار 2026-11-16).
// المفتاح مطفأ: E-360 يختفي في طبقة التعريف (journeyDefinition) كالبنود المخفية فلا يحبس مرحلة، وT-360 يُخفى لدفعة جارية
// بدأت قبل الإطلاق وحدها، وE-MGR ظاهر. دعوة المقيّم وإلغاؤه وتأكيده تعمل لخانة المدير، ومقيّم 360 مرفوض. قاعدة في الذاكرة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail } = await import('./core.ts');
const { cohortSave, journeyDefinition, requirementIdByCode } = await import('./programs.ts');
const I = await import('./impact.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { buildJourney, hideBreaksStage, impactVerdict } = await import('./logic.js');
const { featureHiddenCodes, featureHiddenFor, F360_JOURNEY_CODES } = await import('./features.js');
const { NO_PRE_RUNNING_AR } = await import('./manager-rating.js');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const hooks: Record<string, (payload: any) => any> = {};
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let conflict = ['id'];
    let payload: any = null;
    let single = false, limit = Infinity, range: [number, number] | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const err = hooks[table]?.(payload);
        if (err) return { data: null, error: err };
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      if (mode === 'upsert') {
        for (const x of Array.isArray(payload) ? payload : [payload]) {
          const hit = rows.find((r) => conflict.every((c) => r[c] === x[c]));
          if (hit) Object.assign(hit, x); else rows.push({ id: `${table}-${++seq}`, ...x });
        }
        return { data: null, error: null };
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
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'upsert') return (x: any, o?: { onConflict?: string }) => { mode = 'upsert'; payload = x; if (o?.onConflict) conflict = o.onConflict.split(','); return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'gt') return (c: string, v: string) => { filters.push((r) => r[c] != null && String(r[c]) > v); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
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
  resetSettingsCache();
  return { tables, hooks, restore: () => { Object.assign(db as any, prev); resetSettingsCache(); } };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(1), PA = U(2), P1 = U(3), C1 = U(4), V1 = U(5);
const stage = (key: string, sort: number) => ({ program_id: PA, key, title_ar: key, sort, active: true, rules: {} });
const req = (n: number, stage_key: string, code: string, required = true) =>
  ({ id: U(100 + n), program_id: PA, stage_key, code, title_ar: code, kind: 'check', required, active: true, sort: n, config: {} });
// برنامج كالقائم: التدريب فيه T-360 مع غيره، والتقييم فيه E-360 الإلزامي وE-MGR مع غيرهما
const STAGES = [stage('training', 1), stage('evaluation', 2), stage('after', 3)];
const REQS = [req(1, 'training', 'T-AGREE'), req(2, 'training', 'T-360'), req(3, 'evaluation', 'E-POST'), req(4, 'evaluation', 'E-360'),
  req(5, 'evaluation', 'E-MGR', false), req(6, 'after', 'A-LAST')];
const ON = [{ key: 'feedback360', value: { enabled: true } }];
const snap = { stages: STAGES.map(({ program_id: _p, ...s }) => s), requirements: REQS.map(({ program_id: _p, ...r }) => r) };

function world(settings: Row[], extra: Record<string, Row[]> = {}) {
  return install({
    app_settings: structuredClone(settings),
    programs: [{ id: PA, name: 'القادة', is_default: true, archived_at: null }],
    program_versions: [{ id: V1, program_id: PA, number: 1, label: 'النسخة 1', data: structuredClone(snap) }],
    journey_stages: structuredClone(STAGES), stage_requirements: structuredClone(REQS),
    cohorts: [{ id: C1, name: 'دفعة', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }],
    enrollments: [], participants: [{ id: P1, organization_id: ORG, is_demo: false, full_name: 'سارة', email: 's@org.sa' }],
    participant_requirements: [], audit_log: [], instruments: [], program_milestones: [], raters: [], ...extra,
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const codes = (d: any) => d.requirements.map((r: Row) => r.code);

Deno.test('مطفأ: E-360 وحده يُخفى، والقبلي للدفعة الجارية، ومُظهَر لا يخفي شيئًا، وحارس المرحلة يبقي رمزًا يترك مرحلته بلا ما يكملها', () => {
  assertEquals(F360_JOURNEY_CODES, ['E-360']);
  assertEquals(featureHiddenCodes({ f360: false }), ['E-360']);
  assertEquals(featureHiddenCodes(null), ['E-360']);
  assertEquals(featureHiddenCodes({ f360: false }, { preAllowed: false }), ['E-360', 'T-360']);
  assertEquals(featureHiddenCodes({ f360: true }, { preAllowed: false }), []);
  const off = { f360: false };
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, flags: off, breaks: hideBreaksStage }), { hidden: ['E-360'], kept: [] });
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, flags: off, breaks: hideBreaksStage, preAllowed: false }), { hidden: ['E-360', 'T-360'], kept: [] });
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, flags: { f360: true }, breaks: hideBreaksStage }), { hidden: [], kept: [] });
  // ما أخفته الدفعة أو غاب عن البرنامج لا يُعد مرة أخرى
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, cohortHidden: ['E-360'], flags: off, breaks: hideBreaksStage, preAllowed: false }).hidden, ['T-360']);
  // مرحلة إلزامية لا يكملها إلا E-360: إخفاؤه يحبس ما بعدها، فيبقى ظاهرًا
  const lone = [req(1, 'training', 'T-360', false), req(2, 'training', 'T-AGREE'), req(3, 'evaluation', 'E-360'), req(4, 'evaluation', 'E-MGR', false), req(5, 'after', 'A-LAST')];
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: lone, flags: off, breaks: hideBreaksStage }), { hidden: [], kept: ['E-360'] });
});

Deno.test('journeyDefinition مطفأ: الدفعة الجارية بلا E-360 ولا قبلي، وE-MGR ظاهر ولا يحبس؛ والدفعة الجديدة ترى القبلي؛ ومُظهَرًا يعود كل شيء', async () => {
  let w = world([]);
  try {
    const d: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(codes(d), ['T-AGREE', 'E-POST', 'E-MGR', 'A-LAST']);
    assertEquals(d.feature_hidden, ['E-360', 'T-360']);
    assertEquals(await requirementIdByCode({ id: P1, organization_id: ORG }, 'E-MGR'), U(105));
    const progress = { [U(101)]: { status: 'done' }, [U(103)]: { status: 'done' } };
    const j = buildJourney({ stages: d.stages, requirements: d.requirements, progress, levels: {}, state: { preRated: false, postRated: false, postSubmitted: true } });
    assertEquals(j.map((s: any) => [s.key, s.status]), [['training', 'done'], ['evaluation', 'done'], ['after', 'active']]);
    assertEquals(w.tables.program_versions[0].data.requirements.map((r: Row) => r.code), REQS.map((r) => r.code));
    assertEquals(w.tables.cohorts[0].hidden_requirements, []);
  } finally { w.restore(); }
  w = world([]);
  w.tables.cohorts[0].starts_on = '2026-12-01';
  try {
    const d: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(codes(d), ['T-AGREE', 'T-360', 'E-POST', 'E-MGR', 'A-LAST']);
    // بلا مدير: «ذاتي فقط» يكمل T-360 فلا يحبس التدريب
    const progress = { [U(101)]: { status: 'done' }, [U(103)]: { status: 'done' } };
    const j = buildJourney({ stages: d.stages, requirements: d.requirements, progress, levels: {}, state: { preRated: false, selfOnly: true, postSubmitted: true } });
    assertEquals(j.map((s: any) => [s.key, s.status]), [['training', 'done'], ['evaluation', 'done'], ['after', 'active']]);
  } finally { w.restore(); }
  w = world(ON);
  try {
    const d: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(codes(d), REQS.map((r) => r.code));
    assertEquals(d.feature_hidden, []);
  } finally { w.restore(); }
});

Deno.test('إخفاء الدفعة باقٍ مع المفتاح: مُظهَرًا يُخفى ما أخفته الدفعة وحده، ومطفأ يُضاف إليه تقدير الزملاء والقبلي للجارية', async () => {
  let w = world(ON);
  w.tables.cohorts[0].hidden_requirements = ['E-MGR'];
  try {
    assertEquals(codes(await journeyDefinition({ id: P1, organization_id: ORG })), ['T-AGREE', 'T-360', 'E-POST', 'E-360', 'A-LAST']);
  } finally { w.restore(); }
  w = world([]);
  w.tables.cohorts[0].hidden_requirements = ['A-LAST'];
  try {
    assertEquals(codes(await journeyDefinition({ id: P1, organization_id: ORG })), ['T-AGREE', 'E-POST', 'E-MGR']);
  } finally { w.restore(); }
});

Deno.test('مطفأ: الدفعة لا تخفي ما يجعل بندًا مخفيًا وحده ما يكمل مرحلة، ومُظهَرًا يمر', async () => {
  const admin = { email: 'a@x.sa', role: 'admin' as const };
  let w = world([], { cohort_experts: [] });
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, hidden_requirements: ['T-AGREE'] }));
    assertEquals(e.code, 'hide_breaks_stage');
    assertEquals(e.message.includes('«training»'), true);
    assertEquals(w.tables.cohorts[0].hidden_requirements, []);
    assertEquals(((await cohortSave(admin, { id: C1, hidden_requirements: ['E-MGR'] })) as any).success, true);
  } finally { w.restore(); }
  w = world(ON, { cohort_experts: [] });
  try {
    assertEquals(((await cohortSave(admin, { id: C1, hidden_requirements: ['T-AGREE'] })) as any).success, true);
  } finally { w.restore(); }
});

const RATERS = () => [
  { id: U(201), participant_id: P1, phase: 'pre', relation: 'manager', email: 'boss@org.sa', status: 'submitted', submitted_at: '2026-09-10T00:00:00Z', invited_at: '2026-09-05T00:00:00Z', answers: { q1: { now: 2 } } },
  { id: U(202), participant_id: P1, phase: 'post', relation: 'peer', email: 'peer@gmail.com', status: 'awaiting', invited_at: '2026-11-01T00:00:00Z', verification_flags: ['public_domain'] },
  { id: U(203), participant_id: P1, phase: 'post', relation: 'manager', email: 'boss@org.sa', status: 'invited', invited_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' },
];

Deno.test('مطفأ: خانة المدير تعمل (الإلغاء ورفض المنتظر وقائمته)، والقبلي مرفوض للدفعة الجارية، ومقيّم 360 مرفوض', async () => {
  const w = world([], { raters: [...RATERS(), { id: U(204), participant_id: P1, phase: 'f360', relation: 'peer', email: 'f@org.sa', status: 'awaiting', invited_at: '2026-11-01T00:00:00Z' }],
    organizations: [{ id: ORG, domains: ['org.sa'] }] });
  try {
    const p = w.tables.participants[0];
    // الدفعة بدأت قبل الإطلاق: لا قبلي، برسالة تقول لماذا
    assertEquals((await failOf(() => I.invite(p, { email: 'boss2@org.sa', phase: 'pre' }))).message, NO_PRE_RUNNING_AR);
    await I.revoke(p, { id: U(203) });
    assertEquals(w.tables.raters.find((r: Row) => r.id === U(203))?.status, 'revoked');
    assertEquals((await I.awaitingFor([P1])).map((r: any) => r.id), [U(202)]);
    const r: any = await I.confirmRater({ kind: 'expert', email: 'x@org.sa' }, { id: U(202), decision: 'reject', reason: 'بريد عام' }, async () => true);
    assertEquals(r.decision, 'reject');
    const e = await failOf(() => I.confirmRater({ kind: 'expert', email: 'x@org.sa' }, { id: U(204), decision: 'reject', reason: 'بريد عام' }, async () => true));
    assertEquals([e.code, e.status], ['f360_off', 404]);
  } finally { w.restore(); }
});

Deno.test('مُظهَرًا: المنتظر يعود إلى قائمة التأكيد كما كان', async () => {
  const w = world(ON, { raters: RATERS() });
  try {
    const list = await I.awaitingFor([P1]);
    assertEquals(list.map((r: any) => [r.id, r.phase]), [[U(202), 'post']]);
  } finally { w.restore(); }
});

Deno.test('حكم الأثر بلا تقدير المدير: الاختبار ودليل المشروع يكفيان للتغير المؤكد، وغياب المقيّم ليس تراجعًا ولا تحذيرًا', () => {
  assertEquals(impactVerdict({ test: 'up', self: 'up', rater: null, evidence: true }).key, 'confirmed');
  assertEquals(impactVerdict({ test: 'up', self: null, rater: null, evidence: false }).key, 'emerging');
  assertEquals(impactVerdict({ test: 'flat', self: 'flat', rater: null, evidence: false }).key, 'none');
  // تقدير أُرسل قبل الإطفاء يبقى مصدرًا كما كان
  assertEquals(impactVerdict({ test: 'up', self: null, rater: 'up', raterProspective: true, evidence: false }).sources, ['test', 'rater']);
});

Deno.test('impact.mine مطفأ: خانة المدير وحدها بدعوة وحد واحد، بلا قبلي للجارية، والملخص باقٍ؛ ومُظهَرًا القائمة كما كانت', async () => {
  let w = world([], { raters: RATERS(), assessments: [], questions: [] });
  try {
    const r: any = await I.mine(w.tables.participants[0]);
    assertEquals([r.success, r.invite, r.manager_only, r.limit, r.pre_available, r.raters.map((x: any) => x.id)], [true, true, true, 1, false, [U(201), U(203)]]);
    assertEquals('summary' in r, true);
    // لا إجابة مقيّم في رد المشارك: المتوسط لكل بُعد وحده (manager)
    assertEquals(JSON.stringify(r).includes('"answers"'), false);
  } finally { w.restore(); }
  w = world(ON, { raters: RATERS(), assessments: [], questions: [] });
  try {
    const r: any = await I.mine(w.tables.participants[0]);
    assertEquals([r.invite, r.manager_only, r.raters.map((x: any) => x.id)], [true, false, [U(201), U(202), U(203)]]);
  } finally { w.restore(); }
});
