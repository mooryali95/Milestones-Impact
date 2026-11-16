// تقدير المدير والزملاء مع مفتاح 360 (قرار المالك 2026-11-16: يُدمج لاحقًا مع 360). المفتاح مطفأ: بنود الرحلة T-360 وE-360
// وE-MGR تختفي في طبقة التعريف (journeyDefinition) كالبنود المخفية فلا تحبس مرحلة، ودعوة مقيّمي الأثر وإلغاؤها وتأكيدهم
// تُرفض برمز f360_off، وما أُرسل من تقديرات باقٍ لا يُمس. ومُظهَرًا يعود كل شيء. قاعدة في الذاكرة بلا شبكة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { journeyDefinition, requirementIdByCode } = await import('./programs.ts');
const I = await import('./impact.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { buildJourney, hideBreaksStage, impactVerdict } = await import('./logic.js');
const { featureHiddenCodes, featureHiddenFor, F360_JOURNEY_CODES } = await import('./features.js');

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

Deno.test('الرموز الثلاثة: مطفأ يخفيها ومُظهَر لا يخفي شيئًا، وحارس المرحلة يبقي رمزًا يترك مرحلته بلا ما يكملها', () => {
  assertEquals(F360_JOURNEY_CODES, ['T-360', 'E-360', 'E-MGR']);
  assertEquals(featureHiddenCodes({ f360: false }), ['T-360', 'E-360', 'E-MGR']);
  assertEquals(featureHiddenCodes(null), ['T-360', 'E-360', 'E-MGR']);
  assertEquals(featureHiddenCodes({ f360: true }), []);
  const off = { f360: false };
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, flags: off, breaks: hideBreaksStage }), { hidden: ['T-360', 'E-360', 'E-MGR'], kept: [] });
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS, flags: { f360: true }, breaks: hideBreaksStage }), { hidden: [], kept: [] });
  // ما أخفته الدفعة أو غاب عن البرنامج لا يُعد مرة أخرى
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: REQS.filter((r) => r.code !== 'E-MGR'), cohortHidden: ['T-360'], flags: off, breaks: hideBreaksStage }).hidden, ['E-360']);
  // مرحلة إلزامية لا يكملها إلا E-360: إخفاؤه يحبس ما بعدها، فيبقى ظاهرًا، وغيره يُخفى
  const lone = [req(1, 'training', 'T-360', false), req(2, 'training', 'T-AGREE'), req(3, 'evaluation', 'E-360'), req(4, 'evaluation', 'E-MGR', false), req(5, 'after', 'A-LAST')];
  assertEquals(featureHiddenFor({ stages: STAGES, requirements: lone, flags: off, breaks: hideBreaksStage }), { hidden: ['T-360'], kept: ['E-360', 'E-MGR'] });
});

Deno.test('journeyDefinition مطفأ: البنود الثلاثة خارج الرحلة ولا تحبس المرحلة، ونسخة البرنامج وصفوفه لا تُمس؛ ومُظهَرًا تعود', async () => {
  let w = world([]);
  try {
    const d: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(codes(d), ['T-AGREE', 'E-POST', 'A-LAST']);
    assertEquals(d.feature_hidden, ['T-360', 'E-360', 'E-MGR']);
    assertEquals(await requirementIdByCode({ id: P1, organization_id: ORG }, 'E-MGR'), null);
    // ما بقي إلزاميًا منجز: التدريب والتقييم يكتملان وما بعدهما يُفتح، بلا انتظار تقدير المدير
    const progress = { [U(101)]: { status: 'done' }, [U(103)]: { status: 'done' } };
    const j = buildJourney({ stages: d.stages, requirements: d.requirements, progress, levels: {}, state: { preRated: false, postRated: false, postSubmitted: true } });
    assertEquals(j.map((s: any) => [s.key, s.status, s.total]), [['training', 'done', 1], ['evaluation', 'done', 1], ['after', 'active', 1]]);
    assertEquals(w.tables.program_versions[0].data.requirements.map((r: Row) => r.code), REQS.map((r) => r.code));
    assertEquals(w.tables.stage_requirements.length, 6);
    assertEquals(w.tables.cohorts[0].hidden_requirements, []);
  } finally { w.restore(); }
  w = world(ON);
  try {
    const d: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(codes(d), REQS.map((r) => r.code));
    assertEquals(d.feature_hidden, []);
    assertEquals(await requirementIdByCode({ id: P1, organization_id: ORG }, 'E-MGR'), U(105));
    // مُظهَرًا يعود E-360 يحبس التقييم كما كان
    const progress = { [U(101)]: { status: 'done' }, [U(103)]: { status: 'done' } };
    const j = buildJourney({ stages: d.stages, requirements: d.requirements, progress, levels: {}, state: { preRated: true, postRated: false, postSubmitted: true } });
    assertEquals(j.map((s: any) => [s.key, s.status]), [['training', 'done'], ['evaluation', 'active'], ['after', 'locked']]);
  } finally { w.restore(); }
});

Deno.test('إخفاء الدفعة باقٍ مع المفتاح: مُظهَرًا يُخفى ما أخفته الدفعة وحده، ومطفأ يُضاف إليه الثلاثة', async () => {
  let w = world(ON);
  w.tables.cohorts[0].hidden_requirements = ['E-MGR'];
  try {
    assertEquals(codes(await journeyDefinition({ id: P1, organization_id: ORG })), ['T-AGREE', 'T-360', 'E-POST', 'E-360', 'A-LAST']);
  } finally { w.restore(); }
  w = world([]);
  w.tables.cohorts[0].hidden_requirements = ['A-LAST'];
  try {
    assertEquals(codes(await journeyDefinition({ id: P1, organization_id: ORG })), ['T-AGREE', 'E-POST']);
  } finally { w.restore(); }
});

const RATERS = () => [
  { id: U(201), participant_id: P1, phase: 'pre', relation: 'manager', email: 'boss@org.sa', status: 'submitted', submitted_at: '2026-09-10T00:00:00Z', invited_at: '2026-09-05T00:00:00Z', answers: { q1: { now: 2 } } },
  { id: U(202), participant_id: P1, phase: 'post', relation: 'peer', email: 'peer@gmail.com', status: 'awaiting', invited_at: '2026-11-01T00:00:00Z', verification_flags: ['public_domain'] },
  { id: U(203), participant_id: P1, phase: 'post', relation: 'manager', email: 'boss@org.sa', status: 'invited', invited_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' },
];

Deno.test('مطفأ: دعوة مقيّم الأثر وإعادة إرسالها وإلغاؤه وتأكيده مرفوضة برمز f360_off، والقائمة المنتظرة فارغة، والصفوف لا تُمس', async () => {
  const w = world([], { raters: RATERS() });
  const before = structuredClone(w.tables.raters);
  try {
    const p = w.tables.participants[0];
    for (const [name, fn] of [
      ['invite pre', () => I.invite(p, { email: 'boss@org.sa', phase: 'pre' })],
      ['invite post', () => I.invite(p, { email: 'peer2@org.sa', phase: 'post', relation: 'peer' })],
      ['resend', () => I.invite(p, { email: 'boss@org.sa', phase: 'post' })],
      ['revoke', () => I.revoke(p, { id: U(203) })],
      ['confirm', () => I.confirmRater({ kind: 'coordinator', email: 'c@org.sa' }, { id: U(202) }, async () => true)],
      ['reject', () => I.confirmRater({ kind: 'expert', email: 'x@org.sa' }, { id: U(202), decision: 'reject', reason: 'بريد عام' }, async () => true)],
    ] as [string, () => Promise<unknown>][]) {
      const e = await failOf(fn);
      assertEquals([name, e.code, e.status, e.message], [name, 'f360_off', 404, 'هذا غير متاح الآن.']);
    }
    assertEquals(await I.awaitingFor([P1]), []);
    assertEquals(w.tables.raters, before);
    assertEquals(w.tables.audit_log.filter((l: Row) => String(l.action).startsWith('rater.')), []);
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

Deno.test('impact.mine مطفأ: لا دعوة ولا قائمة ولا تقدير قبل البرنامج، والملخص باقٍ؛ ومُظهَرًا القائمة كما كانت', async () => {
  let w = world([], { raters: RATERS(), assessments: [], questions: [] });
  try {
    const r: any = await I.mine(w.tables.participants[0]);
    assertEquals([r.success, r.invite, r.pre_available, r.raters], [true, false, false, []]);
    assertEquals('summary' in r, true);
  } finally { w.restore(); }
  w = world(ON, { raters: RATERS(), assessments: [], questions: [] });
  try {
    const r: any = await I.mine(w.tables.participants[0]);
    assertEquals([r.invite, r.raters.map((x: any) => x.id)], [true, [U(201), U(202), U(203)]]);
  } finally { w.restore(); }
});
