// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» G4a: تشغيل تقييم الدقة من لوحة الإدارة، وحكم البوابة (قرار المالك: 99٪)
// ════════════════════════════════════════════════════════════════
// المجموعة في guide-eval/cases.json (مسودة بانتظار اعتماد المالك: approved_by وapproved_at). كل حالة تمر بالمسار
// نفسه الذي يجيب به المشارك (routeQuestion ثم generate في guide.ts) بنص الباب الحقيقي من الكتاب، وتُصحَّح بقواعد
// guide-eval.js. التشغيل على دفعات من اللوحة (كل طلب بضع حالات متوازية) فلا يتجاوز حد زمن الدالة، بحجز يمنع دفعتين.
// للمدير الأعلى والمالك وحدهما، وكل بدء يُسجَّل. الأسئلة مصطنعة من الكتاب فلا بيانات مشارك في الردود المحفوظة.
import { audit, db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { requireAgentRead } from './agent-admin.ts';
import { filterHandbookMd, quizFor } from './logic.js';
import { contextLine, GUIDE_CHAPTER_CHARS, GUIDE_MODEL, REFUSAL_AR, routeQuestion, rulesWith } from './guide.js';
import { appSettings } from './settings.ts';
import {
  applyCaseEdit, diagFingerprint, EVAL_GATE_AR, EVAL_THRESHOLD, evalFingerprint, evalGate, gateChecklist, gradeCase, isDiagnostic, nextVersion, parseDiag, setHash, validateCases,
} from './guide-eval.js';
import { missingColumn } from './missing-column.ts';
import { GD, generate, worstFor } from './guide.ts';
import SEED from './guide-eval/cases.json' with { type: 'json' };
// المرحلة أ من تقوية المساعد (2026-11-22): حالات مقترحة في المستودع، لا تدخل المجموعة إلا بزر في اللوحة ثم باعتماد المالك
import PROPOSED from './guide-eval/cases-proposed.json' with { type: 'json' };

type Body = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: any) => e && e.code !== '23505' && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /guidance_eval\S* does not exist|Could not find the (table|function)/.test(String(e.message || '')));
// القواعد الفعلية كما يجيب بها المشارك (H4: الثابتة وتوجيهات المالك)، فالبصمة والتشغيل بالقواعد نفسها
export const rulesNow = async () => rulesWith(((await appSettings()).guidance as any)?.extra_rules);
// ومرجع البرنامج نفسه الذي يصل السؤال من خارج الأبواب (guide.ts programBriefNow)، فتعديل أقسامه في الكتاب يُسقط النجاح
// تعذر قراءته يُرمى ولا يصير مرجعًا فارغًا، فلا تُحسب بصمة لا تطابق ما يُقيَّم. ومن يملك القواعد والمرجع لخطوته يمررهما،
// فتشهد البصمة على اللقطة نفسها التي تُصحَّح بها الدفعة
export const briefNow = () => GD.brief();
export const fingerprintNow = async (set: any, rules?: string, brief?: string) =>
  evalFingerprint(set, GUIDE_MODEL, rules ?? await rulesNow(), brief ?? await briefNow());
export const EVAL = { batch: 3, leaseSeconds: 140, maxMicros: 12_000_000 };
// المجموعة الحالية: أحدث نسخة في القاعدة (H2). القاعدة الفارغة تُبذر مرة من الملف مسودةً، وغياب الجدول (قبل ترحيله)
// يعمل من الملف كما كان. تُخزَّن دقيقة في النسخة، وكل تعديل أو اعتماد يمسحها
type EvalSet = { id: string | null; version: string; cases: any[]; status: 'draft' | 'approved'; approved_by: string | null; approved_at: string | null; source: 'db' | 'file'; updated_by?: string | null; updated_at?: string | null };
export const seedSet = (): EvalSet => ({ id: null, version: (SEED as any).version, cases: (SEED as any).cases, status: 'draft', approved_by: null, approved_at: null, source: 'file' });
let setCache: { at: number; value: EvalSet } | null = null;
export const resetSet = () => { setCache = null; };
export async function evalSet(): Promise<EvalSet> {
  if (setCache && Date.now() - setCache.at < 60e3) return setCache.value;
  let value = seedSet();
  const read = () => db.from('guidance_eval_sets').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let { data, error } = await read();
  if (!error && !data) {
    // أول قراءة: تُبذر نسخة الملف مسودة (الرقم فريد، فبذر نسختين متوازيتين يُرفض أحدهما بلا ضرر)
    await db.from('guidance_eval_sets').insert({ version: value.version, cases: value.cases, status: 'draft', updated_by: 'seed' });
    ({ data, error } = await read());
  }
  if (!error && data) value = { ...(data as any), source: 'db' };
  else if (error && !missing(error)) console.error('guide eval set', (error as any).code || 'error');
  setCache = { at: Date.now(), value };
  return value;
}

// ── حكم البوابة للمساعد: يُخزَّن دقيقة في النسخة، والتعذر يغلق (يفشل مغلقًا) ──
let gateCache: { at: number; value: { ok: boolean; reason: string | null } } | null = null;
export const resetEvalGate = () => { gateCache = null; };
export async function evalGateNow() {
  if (gateCache && Date.now() - gateCache.at < 60e3) return gateCache.value;
  let value: { ok: boolean; reason: string | null } = { ok: false, reason: 'none' };
  try {
    const set = await evalSet();
    const fp = await fingerprintNow(set);
    const { data, error } = await db.from('guidance_eval_runs').select('fingerprint, status, done_cases, passed_cases, started_at')
      .eq('fingerprint', fp).order('started_at', { ascending: false }).limit(5);
    if (error) throw error;
    const g = evalGate(set, data || [], fp);
    value = { ok: g.ok, reason: g.reason };
  } catch (e) {
    if (!missing(e)) console.error('guide eval gate', (e as any)?.code || 'error');
  }
  gateCache = { at: Date.now(), value };
  return value;
}

// باب الحالة من الكتاب نفسه بمستواها: النص المرسل للنموذج وأسئلة الباب للحارس
async function chapterOf(c: any) {
  if (c.context !== 'handbook') return null;
  const { data: m } = await db.from('handbook_modules').select('dimension, chapter_key, title_ar, body_md, quiz_md')
    .eq('dimension', c.dimension).eq('chapter_key', c.chapter_key).maybeSingle();
  if (!m) return { missing: true } as any;
  const level = c.level || 'intermediate';
  return { title: m.title_ar, md: String(filterHandbookMd(m.body_md, level, null) || '').slice(0, GUIDE_CHAPTER_CHARS), quiz: quizFor(m.quiz_md, level, null) };
}

// حالة واحدة بالمسار الحقيقي: الموجّه أولًا ثم النموذج. الرد الفارغ أو تعطل عابر يُعاد مرة واحدة في الحال (لا يرسب بسببه
// جواب)، والجواب الخاطئ لا يُعاد. ما بقي عابرًا بعد الإعادة يُعاد في الدفعة التالية ولا يُحسب راسبًا
const transientStatus = (status: any) => status === 429 || status >= 500 || status === null;
export async function runCase(c: any, key: string, rules?: string, brief?: string) {
  const route = routeQuestion(c.question);
  if (route.kind === 'refuse') {
    const text = (REFUSAL_AR as Record<string, string>)[route.reason];
    return { ...gradeCase(c, { source: 'route', verdict: 'refused', text }), verdict: 'route', text, cost: 0 };
  }
  const chapter = await chapterOf(c);
  if (chapter?.missing) return { pass: false, reasons: [`الباب ${c.dimension}/${c.chapter_key} غير موجود في الكتاب`], verdict: 'error', text: '', cost: 0 };
  const ctx = contextLine({ stage: null, progress: NaN, initiative: false, where: c.context, chapter: chapter?.title || null, chapters: [] });
  rules = rules ?? await rulesNow();
  // مرجع البرنامج كما يصل المشارك الذي يسأل من رحلته: للحالة بلا باب وحدها
  if (!chapter) brief = brief ?? await briefNow();
  else brief = '';
  let cost = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const g = await generate({ key, chapter, ctx, text: c.question, past: [], rules, brief });
      cost += g.cost;
      if (g.verdict === 'error' && attempt === 0) continue;
      const r = gradeCase(c, { source: g.verdict === 'error' ? 'error' : 'model', verdict: g.verdict, text: g.text, quiz: chapter?.quiz || [] });
      return { ...r, verdict: g.verdict, text: g.text, cost, retried: attempt > 0 };
    } catch (e) {
      const status = (e as any)?.status ?? null;
      const transient = transientStatus(status);
      if (transient && attempt === 0) continue;
      return { pass: false, reasons: [`تعذّر النموذج${status ? ` (${status})` : ''}`], verdict: 'error', text: '', cost, transient };
    }
  }
}

// ما تُصحَّح به الحالة محفوظًا مع نتيجتها: النتيجة تُقرأ بسؤالها ونوعها وقت التشغيل، لا بما صارت إليه الحالة بعد تعديلها
const snapshotOf = (c: any) => ({
  question: c.question, kind: c.kind, context: c.context || null, dimension: c.dimension || null, chapter_key: c.chapter_key || null, level: c.level || null,
  must_include: c.must_include || [], must_not_include: c.must_not_include || [], reference_ar: c.reference_ar || '',
});

export async function evalState(a: Admin) {
  requireAgentRead(a);
  const set = await evalSet();
  const brief = await briefNow();
  const fp = await fingerprintNow(set, undefined, brief);
  const { data: runs, error } = await db.from('guidance_eval_runs').select('*').order('started_at', { ascending: false }).limit(10);
  if (error) { if (missing(error)) return { success: true, ready: false }; throw error; }
  const kinds: Record<string, number> = {};
  for (const c of set.cases) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const gate = evalGate(set, runs || [], fp);
  return {
    success: true, ready: true, model: GUIDE_MODEL, threshold: EVAL_THRESHOLD, fingerprint: fp,
    // الشرطان معًا للوحة، وحكم البوابة نفسه في gate
    checks: gateChecklist(set, runs || [], fp), brief_chars: brief.length,
    set: { version: set.version, status: set.status, source: set.source, total: set.cases.length, kinds, approved_by: set.approved_by || null, approved_at: set.approved_at || null, errors: validateCases(set) },
    gate: { ok: gate.ok, reason: gate.reason, message: gate.reason ? (EVAL_GATE_AR as Record<string, string>)[gate.reason] : null },
    runs: (runs || []).map((r: any) => {
      const d = parseDiag(r.fingerprint);
      return { ...r, diagnostic: !!d, source_run: d?.source || null, current: (d ? d.fingerprint : r.fingerprint) === fp };
    }),
  };
}

// الحالات الراسبة في تشغيل كامل منتهٍ: ما يعيده التشغيل التشخيصي، بترتيب المجموعة الحالية وبما بقي فيها منها
async function failedIn(runId: string, set: EvalSet) {
  const { data } = await db.from('guidance_eval_results').select('case_id, ok').eq('run_id', runId);
  const bad = new Set((data || []).filter((r: any) => !r.ok).map((r: any) => r.case_id));
  return set.cases.filter((c: any) => bad.has(c.id));
}

// التشغيل الكامل وحده يُحسب للبوابة. «أعد الحالات الفاشلة فقط» (mode: 'failed') تشغيل تشخيصي على حالات آخر تشغيل كامل
// رسب فيها (أو التشغيل المسمى from_run)، بالقواعد والمرجع الحاليين، لا يفتح البوابة أبدًا (DIAG_PREFIX)
export async function evalStart(a: Admin, b: Body = {}) {
  requireAgentRead(a);
  const set = await evalSet();
  const errors = validateCases(set);
  if (errors.length) throw new Fail(`مجموعة التقييم فيها أخطاء: ${errors.slice(0, 3).join('؛ ')}`, 409, 'bad_cases');
  if (!(await GD.key().catch(() => ''))) throw new Fail('لا مفتاح للنموذج: اضبطه من قسم «المفتاح»', 409, 'no_key');
  const fp = await fingerprintNow(set);
  const diag = b?.mode === 'failed';
  let fingerprint = fp, total = set.cases.length, source: string | null = null;
  if (diag) {
    const want = b.from_run ? String(b.from_run) : null;
    if (want && !UUID.test(want)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
    const { data: runs, error: re } = await db.from('guidance_eval_runs').select('id, fingerprint, status, done_cases, passed_cases, started_at')
      .order('started_at', { ascending: false }).limit(20);
    if (re) { if (missing(re)) throw new Fail('جداول التقييم لم تُرحَّل بعد (20261116140000)', 409, 'not_migrated'); throw re; }
    const src = (runs || []).find((r: any) => !isDiagnostic(r) && ['passed', 'failed'].includes(r.status) && Number(r.passed_cases) < Number(r.done_cases) && (!want || r.id === want));
    if (!src) throw new Fail('لا تشغيل كامل فيه حالات راسبة لإعادتها', 409, 'no_failed');
    const cases = await failedIn(src.id, set);
    if (!cases.length) throw new Fail('حالات التشغيل الراسبة لم تعد في المجموعة الحالية', 409, 'no_failed');
    source = src.id; fingerprint = diagFingerprint(src.id, fp); total = cases.length;
  }
  const { data, error } = await db.from('guidance_eval_runs').insert({
    fingerprint, cases_version: set.version, total_cases: total, max_micros: EVAL.maxMicros, started_by: a.email,
  }).select('id').single();
  if (error) {
    // تشغيل قائم لم يكتمل (أُغلقت اللوحة أثناءه): يُستأنف هو نفسه بدل رفض البدء. ويُفحص قبل «لم تُرحَّل»
    // لأن رسالة قيد التشغيل الواحد تحمل اسم الجدول
    if (error.code === '23505') {
      const { data: cur } = await db.from('guidance_eval_runs').select('id, total_cases').eq('status', 'running').limit(1).maybeSingle();
      if (cur) return { success: true, run_id: (cur as any).id, total: Number((cur as any).total_cases), diagnostic: false, resumed: true };
      throw new Fail('يجري تقييم آخر الآن', 409, 'eval_running');
    }
    if (missing(error)) throw new Fail('جداول التقييم لم تُرحَّل بعد (20261116140000)', 409, 'not_migrated');
    throw error;
  }
  await audit('admin', a.email, diag ? 'guide.eval-diagnose' : 'guide.eval-start', 'guidance_eval_runs', (data as any).id, null, { fingerprint: fp, cases: total, ...(source ? { from_run: source } : {}) });
  resetEvalGate();
  return { success: true, run_id: (data as any).id, total, diagnostic: diag };
}

export async function evalStep(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const { data: leased, error: le } = await db.rpc('guidance_eval_lease', { p_id: id, p_seconds: EVAL.leaseSeconds });
  if (le) throw le;
  const run = Array.isArray(leased) ? leased[0] : leased;
  const progress = async () => {
    const { data } = await db.from('guidance_eval_runs').select('*').eq('id', id).maybeSingle();
    return { success: true, run: data, done: (data as any)?.status !== 'running' };
  };
  if (!run) return progress();
  const set = await evalSet();
  // القواعد والمرجع مرة واحدة للخطوة: البصمة والدفعة باللقطة نفسها. تعذر قراءة المرجع لا يُنهي التشغيل متقادمًا:
  // يُفك الحجز وتُعاد الخطوة التالية
  const rules = await rulesNow();
  let brief: string;
  try { brief = await briefNow(); } catch {
    await db.from('guidance_eval_runs').update({ lease_until: null }).eq('id', id).eq('status', 'running');
    return progress();
  }
  const fp = await fingerprintNow(set, rules, brief);
  const finish = async (status: string, stop: string | null, extra: Record<string, unknown> = {}) => {
    await db.from('guidance_eval_runs').update({ status, stop_reason: stop, finished_at: new Date().toISOString(), lease_until: null, ...extra }).eq('id', id).eq('status', 'running');
    resetEvalGate();
    return progress();
  };
  // التشخيصي: بصمة اليوم بعد معرّف مصدره، وحالاته ما رسب في مصدره
  const diag = parseDiag(run.fingerprint);
  if ((diag ? diag.fingerprint : run.fingerprint) !== fp) return finish('stopped', 'stale');
  const key = await GD.key().catch(() => '');
  if (!key) return finish('error', 'key');
  const { data: doneRows } = await db.from('guidance_eval_results').select('case_id, ok, cost_micros').eq('run_id', id);
  const done = new Set((doneRows || []).map((r: any) => r.case_id));
  const scope = diag ? await failedIn(diag.source, set) : set.cases;
  const total = diag ? Number(run.total_cases) : set.cases.length;
  const pending = scope.filter((c: any) => !done.has(c.id)).slice(0, EVAL.batch);
  let cost = Number(run.cost_micros || 0);
  // حارس التشغيل: لا تبدأ دفعة قد تتجاوز حده
  const worst = pending.reduce((s: number, c: any) => s + worstFor({ chapter: c.context === 'handbook' ? { title: '', md: 'x'.repeat(GUIDE_CHAPTER_CHARS), quiz: [] } : null, ctx: '', text: c.question, past: [], rules, brief }), 0);
  if (cost + worst > Number(run.max_micros)) return finish('stopped', 'max_cost');
  const outcomes = await Promise.all(pending.map(async (c: any) => ({ c, o: await runCase(c, key, rules, brief) })));
  for (const { c, o } of outcomes) {
    // ما أُنفق يُحسب على التشغيل دائمًا، ولو انتهت الحالة بخطأ عابر لا يُحسب راسبًا وتُعاد في الدفعة التالية
    cost += o.cost;
    if ((o as any).transient) continue;
    const row = { run_id: id, case_id: c.id, ok: o.pass, verdict: o.verdict, reasons: o.reasons, reply: String(o.text || '').slice(0, 6000), cost_micros: o.cost };
    // الحالة كما صُححت بها (20261118100000)، وقبل العمود تُحفظ النتيجة بلاها كما كانت
    const { error: ie } = await db.from('guidance_eval_results').insert({ ...row, case_snapshot: snapshotOf(c) });
    if (ie && missingColumn(ie)) await db.from('guidance_eval_results').insert(row);
  }
  const { data: all } = await db.from('guidance_eval_results').select('ok').eq('run_id', id);
  const doneCount = (all || []).length;
  const passed = (all || []).filter((r: any) => r.ok).length;
  const update = { done_cases: doneCount, passed_cases: passed, cost_micros: cost };
  if (doneCount >= total) {
    const pass = diag ? passed === total : passed / total >= EVAL_THRESHOLD;
    return finish(pass ? 'passed' : 'failed', null, update);
  }
  await db.from('guidance_eval_runs').update({ ...update, lease_until: null }).eq('id', id);
  return progress();
}

// نتائج تشغيل بحالاته كما كانت وقت التشغيل (case_snapshot)، والراسب أولًا. «فشلت في التشغيلين»: راسبة هنا وفي التشغيل
// الكامل المنتهي قبله. قبل العمود (20261118100000) تُقرأ الحالة من المجموعة الحالية، ويُوسم ذلك
export async function evalResults(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const cols = 'case_id, ok, verdict, reasons, reply, cost_micros';
  let { data, error }: { data: any[] | null; error: any } = await db.from('guidance_eval_results').select(`${cols}, case_snapshot`).eq('run_id', id);
  if (error && missingColumn(error)) ({ data, error } = await db.from('guidance_eval_results').select(cols).eq('run_id', id));
  if (error) throw error;
  const byId = new Map(((await evalSet()).cases as any[]).map((c) => [c.id, c]));
  const { data: run } = await db.from('guidance_eval_runs').select('id, fingerprint, started_at').eq('id', id).maybeSingle();
  let before = new Set<string>();
  if (run) {
    const { data: prev } = await db.from('guidance_eval_runs').select('id, fingerprint, status, started_at').lt('started_at', (run as any).started_at)
      .order('started_at', { ascending: false }).limit(10);
    const p = (prev || []).find((r: any) => !isDiagnostic(r) && ['passed', 'failed'].includes(r.status));
    if (p) {
      const { data: pr } = await db.from('guidance_eval_results').select('case_id, ok').eq('run_id', (p as any).id);
      before = new Set((pr || []).filter((r: any) => !r.ok).map((r: any) => r.case_id));
    }
  }
  return { success: true, diagnostic: run ? isDiagnostic(run) : false, results: (data || []).map((r: any) => {
    const snap = r.case_snapshot || null;
    const c = snap || byId.get(r.case_id) || {};
    const { case_snapshot: _s, ...rest } = r;
    return { ...rest, question: c.question || null, kind: c.kind || null, reference_ar: c.reference_ar || '', must_include: c.must_include || [],
      must_not_include: c.must_not_include || [], from_current: !snap, failed_before: !r.ok && before.has(r.case_id) };
  }).sort((x: any, y: any) => Number(x.ok) - Number(y.ok) || String(x.case_id).localeCompare(String(y.case_id))) };
}

// ── الدفعة التجريبية: المساعد لا يعمل إلا لأعضاء دفعة مفعّلة (قرار المالك: دفعة تجريبية أولًا) ──
export async function pilotList(a: Admin) {
  requireAgentRead(a);
  const { data, error } = await db.from('cohorts').select('id, name, status, is_default, guidance_pilot').neq('status', 'closed').order('name');
  if (error) { if (/guidance_pilot/.test(String(error.message || '')) || error.code === '42703') return { success: true, ready: false, cohorts: [] }; throw error; }
  return { success: true, ready: true, cohorts: (data || []).map((c: any) => ({ id: c.id, name: c.name, status: c.status, is_default: !!c.is_default, pilot: !!c.guidance_pilot })) };
}

export async function pilotSet(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.cohort_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const on = b.on === true;
  const { data, error } = await db.from('cohorts').update({ guidance_pilot: on }).eq('id', id).select('id, name, guidance_pilot').maybeSingle();
  if (error) throw error;
  if (!data) throw new Fail('الدفعة غير موجودة', 404);
  await audit('admin', a.email, on ? 'guide.pilot-on' : 'guide.pilot-off', 'cohorts', id, { guidance_pilot: !on }, { guidance_pilot: on });
  return { success: true, cohort: { id, name: (data as any).name, pilot: on } };
}

// ── H2: مراجعة المجموعة وتعديلها واعتمادها من اللوحة (قرار المالك v8: يعتمدها المالك باسمه) ──
export async function setGet(a: Admin) {
  requireAgentRead(a);
  const set = await evalSet();
  // hash: بصمة المحتوى كما فُتح، يعيدها الاعتماد فلا يغطي تعديلًا جرى بعد الفتح
  return { success: true, set: { ...set, errors: validateCases(set), hash: await setHash(set) }, can_edit: set.source === 'db', can_approve: !!a.owner && set.source === 'db', proposed: proposedNew(set).length };
}

// حفظ حالات المجموعة: في المسودة الحالية، أو في مسودة جديدة منسوخة من المعتمدة (المعتمدة لا تتغير، حارس في القاعدة)
export async function writeCases(a: Admin, set: EvalSet, cases: any[]) {
  const now = new Date().toISOString();
  let version = set.version;
  if (set.status === 'approved') {
    version = nextVersion(set.version, now.slice(0, 10));
    const { error } = await db.from('guidance_eval_sets').insert({ version, cases, status: 'draft', updated_by: a.email, updated_at: now });
    if (error) throw error;
  } else {
    const { error } = await db.from('guidance_eval_sets').update({ cases, updated_by: a.email, updated_at: now }).eq('id', set.id).eq('status', 'draft');
    if (error) throw error;
  }
  resetSet(); resetEvalGate();
  return version;
}

// تعديل حالة: في المسودة الحالية، أو في مسودة جديدة منسوخة من المعتمدة
export async function caseSave(a: Admin, b: Body) {
  requireAgentRead(a);
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  const r: any = applyCaseEdit(set.cases, String(b.case_id || ''), b.patch || {});
  if (!r.ok) throw new Fail(String(r.error), 400, 'invalid');
  const version = await writeCases(a, set, r.cases);
  const before = set.cases.find((c: any) => c.id === b.case_id);
  await audit('admin', a.email, 'guide.eval-case', 'guidance_eval_sets', version, { case: before }, { case: r.cases.find((c: any) => c.id === b.case_id) });
  return { success: true, version, new_draft: version !== set.version };
}

// الحالات المقترحة التي ليست في المجموعة بعد (بمعرّفها)، فإضافتها مرة ثانية لا تكرر شيئًا
export const proposedNew = (set: EvalSet, proposed: any[] = (PROPOSED as any).cases || []) => {
  const have = new Set((set.cases || []).map((c: any) => c.id));
  return proposed.filter((c: any) => c?.id && !have.has(c.id));
};
// إضافة المقترحة إلى المسودة (أو مسودة جديدة من المعتمدة): المجموعة كلها تُتحقق قبل الحفظ، وتلزمها مراجعة المالك واعتماده ثم تقييم جديد
export async function casesImport(a: Admin, _b: Body = {}) {
  requireAgentRead(a);
  resetSet();
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  const add = proposedNew(set);
  if (!add.length) return { success: true, added: 0, version: set.version };
  const cases = [...set.cases, ...add];
  const errors = validateCases({ version: set.version, cases });
  if (errors.length) throw new Fail(`في الحالات المقترحة أخطاء: ${errors.slice(0, 3).join('؛ ')}`, 400, 'bad_cases');
  const version = await writeCases(a, set, cases);
  await audit('admin', a.email, 'guide.eval-import', 'guidance_eval_sets', version, { cases: set.cases.length }, { cases: cases.length, added: add.map((c: any) => c.id) });
  return { success: true, added: add.length, version, new_draft: version !== set.version };
}

// الاعتماد للمالك وحده، باسمه، والمجموعة بلا أخطاء
export async function setApprove(a: Admin, b: Body) {
  requireAgentRead(a);
  if (!a.owner) throw new Fail('اعتماد مجموعة التقييم للمالك وحده', 403, 'owner_only');
  // قراءة طازجة لا من الذاكرة المؤقتة: الاعتماد يُحكم على النسخة كما هي في القاعدة الآن
  resetSet();
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  if (set.status === 'approved') return { success: true, version: set.version, already: true };
  if (String(b.version || '') !== set.version) throw new Fail('تغيرت المجموعة منذ فتحتها، فراجعها مجددًا', 409, 'stale');
  // النسخة نفسها قد تتغير حالاتها وهي مسودة: بصمة المحتوى وآخر تعديل كما فتحها المالك
  if (String(b.hash || '') !== (await setHash(set))) throw new Fail('تغيرت حالات المجموعة منذ فتحتها، فراجعها مجددًا', 409, 'stale');
  const errors = validateCases(set);
  if (errors.length) throw new Fail(`في المجموعة أخطاء: ${errors.slice(0, 3).join('؛ ')}`, 409, 'bad_cases');
  const at = new Date().toISOString();
  // التحديث مشروط بآخر تعديل نفسه: تعديل يسبق الاعتماد بلحظة يُسقطه بدل أن يدخل فيه
  let q = db.from('guidance_eval_sets').update({ status: 'approved', approved_by: a.email, approved_at: at }).eq('id', set.id).eq('status', 'draft');
  if (set.updated_at) q = q.eq('updated_at', set.updated_at);
  const { data, error } = await q.select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Fail('تغيرت المجموعة منذ فتحتها، فراجعها مجددًا', 409, 'stale');
  await audit('admin', a.email, 'guide.eval-approve', 'guidance_eval_sets', set.version, null, { version: set.version, cases: set.cases.length, hash: b.hash });
  resetSet(); resetEvalGate();
  return { success: true, version: set.version, approved_at: at };
}
