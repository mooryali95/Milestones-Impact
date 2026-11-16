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
import { contextLine, GUIDE_CHAPTER_CHARS, GUIDE_MODEL, REFUSAL_AR, routeQuestion } from './guide.js';
import { applyCaseEdit, EVAL_GATE_AR, EVAL_THRESHOLD, evalFingerprint, evalGate, gradeCase, nextVersion, validateCases } from './guide-eval.js';
import { GD, generate, worstFor } from './guide.ts';
import SEED from './guide-eval/cases.json' with { type: 'json' };

type Body = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /guidance_eval/.test(String(e.message || '')));
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
    const fp = await evalFingerprint(set);
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

// حالة واحدة بالمسار الحقيقي: الموجّه أولًا ثم النموذج
export async function runCase(c: any, key: string) {
  const route = routeQuestion(c.question);
  if (route.kind === 'refuse') {
    const text = (REFUSAL_AR as Record<string, string>)[route.reason];
    return { ...gradeCase(c, { source: 'route', verdict: 'refused', text }), verdict: 'route', text, cost: 0 };
  }
  const chapter = await chapterOf(c);
  if (chapter?.missing) return { pass: false, reasons: [`الباب ${c.dimension}/${c.chapter_key} غير موجود في الكتاب`], verdict: 'error', text: '', cost: 0 };
  const ctx = contextLine({ stage: null, progress: NaN, initiative: false, where: c.context, chapter: chapter?.title || null, chapters: [] });
  try {
    const g = await generate({ key, chapter, ctx, text: c.question, past: [] });
    const r = gradeCase(c, { source: g.verdict === 'error' ? 'error' : 'model', verdict: g.verdict, text: g.text, quiz: chapter?.quiz || [] });
    return { ...r, verdict: g.verdict, text: g.text, cost: g.cost };
  } catch (e) {
    const status = (e as any)?.status ?? null;
    return { pass: false, reasons: [`تعذّر النموذج${status ? ` (${status})` : ''}`], verdict: 'error', text: '', cost: 0, transient: status === 429 || status >= 500 || status === null };
  }
}

export async function evalState(a: Admin) {
  requireAgentRead(a);
  const set = await evalSet();
  const fp = await evalFingerprint(set);
  const { data: runs, error } = await db.from('guidance_eval_runs').select('*').order('started_at', { ascending: false }).limit(10);
  if (error) { if (missing(error)) return { success: true, ready: false }; throw error; }
  const kinds: Record<string, number> = {};
  for (const c of set.cases) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const gate = evalGate(set, runs || [], fp);
  return {
    success: true, ready: true, model: GUIDE_MODEL, threshold: EVAL_THRESHOLD, fingerprint: fp,
    set: { version: set.version, status: set.status, source: set.source, total: set.cases.length, kinds, approved_by: set.approved_by || null, approved_at: set.approved_at || null, errors: validateCases(set) },
    gate: { ok: gate.ok, reason: gate.reason, message: gate.reason ? (EVAL_GATE_AR as Record<string, string>)[gate.reason] : null },
    runs: (runs || []).map((r: any) => ({ ...r, current: r.fingerprint === fp })),
  };
}

export async function evalStart(a: Admin) {
  requireAgentRead(a);
  const set = await evalSet();
  const errors = validateCases(set);
  if (errors.length) throw new Fail(`مجموعة التقييم فيها أخطاء: ${errors.slice(0, 3).join('؛ ')}`, 409, 'bad_cases');
  if (!(await GD.key().catch(() => ''))) throw new Fail('لا مفتاح للنموذج: اضبطه من قسم «المفتاح»', 409, 'no_key');
  const fp = await evalFingerprint(set);
  const { data, error } = await db.from('guidance_eval_runs').insert({
    fingerprint: fp, cases_version: set.version, total_cases: set.cases.length, max_micros: EVAL.maxMicros, started_by: a.email,
  }).select('id').single();
  if (error) {
    if (missing(error)) throw new Fail('جداول التقييم لم تُرحَّل بعد (20261116140000)', 409, 'not_migrated');
    if (error.code === '23505') throw new Fail('يجري تقييم آخر الآن', 409, 'eval_running');
    throw error;
  }
  await audit('admin', a.email, 'guide.eval-start', 'guidance_eval_runs', (data as any).id, null, { fingerprint: fp, cases: set.cases.length });
  resetEvalGate();
  return { success: true, run_id: (data as any).id, total: set.cases.length };
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
  const fp = await evalFingerprint(set);
  const finish = async (status: string, stop: string | null, extra: Record<string, unknown> = {}) => {
    await db.from('guidance_eval_runs').update({ status, stop_reason: stop, finished_at: new Date().toISOString(), lease_until: null, ...extra }).eq('id', id).eq('status', 'running');
    resetEvalGate();
    return progress();
  };
  if (run.fingerprint !== fp) return finish('stopped', 'stale');
  const key = await GD.key().catch(() => '');
  if (!key) return finish('error', 'key');
  const { data: doneRows } = await db.from('guidance_eval_results').select('case_id, ok, cost_micros').eq('run_id', id);
  const done = new Set((doneRows || []).map((r: any) => r.case_id));
  const pending = set.cases.filter((c: any) => !done.has(c.id)).slice(0, EVAL.batch);
  let cost = Number(run.cost_micros || 0);
  // حارس التشغيل: لا تبدأ دفعة قد تتجاوز حده
  const worst = pending.reduce((s: number, c: any) => s + worstFor({ chapter: c.context === 'handbook' ? { title: '', md: 'x'.repeat(GUIDE_CHAPTER_CHARS), quiz: [] } : null, ctx: '', text: c.question, past: [] }), 0);
  if (cost + worst > Number(run.max_micros)) return finish('stopped', 'max_cost');
  const outcomes = await Promise.all(pending.map(async (c: any) => ({ c, o: await runCase(c, key) })));
  for (const { c, o } of outcomes) {
    // خطأ عابر لا يُحسب راسبًا: تُعاد الحالة في الدفعة التالية
    if ((o as any).transient) continue;
    cost += o.cost;
    await db.from('guidance_eval_results').insert({ run_id: id, case_id: c.id, ok: o.pass, verdict: o.verdict, reasons: o.reasons, reply: String(o.text || '').slice(0, 6000), cost_micros: o.cost });
  }
  const { data: all } = await db.from('guidance_eval_results').select('ok').eq('run_id', id);
  const doneCount = (all || []).length;
  const passed = (all || []).filter((r: any) => r.ok).length;
  const update = { done_cases: doneCount, passed_cases: passed, cost_micros: cost };
  if (doneCount >= set.cases.length) {
    const pass = passed / set.cases.length >= EVAL_THRESHOLD;
    return finish(pass ? 'passed' : 'failed', null, update);
  }
  await db.from('guidance_eval_runs').update({ ...update, lease_until: null }).eq('id', id);
  return progress();
}

export async function evalResults(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.run_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const { data, error } = await db.from('guidance_eval_results').select('case_id, ok, verdict, reasons, reply, cost_micros').eq('run_id', id);
  if (error) throw error;
  const byId = new Map(((await evalSet()).cases as any[]).map((c) => [c.id, c]));
  return { success: true, results: (data || []).map((r: any) => ({ ...r, question: byId.get(r.case_id)?.question || null, kind: byId.get(r.case_id)?.kind || null }))
    .sort((x: any, y: any) => Number(x.ok) - Number(y.ok) || String(x.case_id).localeCompare(String(y.case_id))) };
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
  return { success: true, set: { ...set, errors: validateCases(set) }, can_edit: set.source === 'db', can_approve: !!a.owner && set.source === 'db' };
}

// تعديل حالة: في المسودة الحالية، أو في مسودة جديدة منسوخة من المعتمدة (المعتمدة لا تتغير، حارس في القاعدة)
export async function caseSave(a: Admin, b: Body) {
  requireAgentRead(a);
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  const r: any = applyCaseEdit(set.cases, String(b.case_id || ''), b.patch || {});
  if (!r.ok) throw new Fail(String(r.error), 400, 'invalid');
  const now = new Date().toISOString();
  let version = set.version;
  if (set.status === 'approved') {
    version = nextVersion(set.version, now.slice(0, 10));
    const { error } = await db.from('guidance_eval_sets').insert({ version, cases: r.cases, status: 'draft', updated_by: a.email, updated_at: now });
    if (error) throw error;
  } else {
    const { error } = await db.from('guidance_eval_sets').update({ cases: r.cases, updated_by: a.email, updated_at: now }).eq('id', set.id).eq('status', 'draft');
    if (error) throw error;
  }
  const before = set.cases.find((c: any) => c.id === b.case_id);
  await audit('admin', a.email, 'guide.eval-case', 'guidance_eval_sets', version, { case: before }, { case: r.cases.find((c: any) => c.id === b.case_id) });
  resetSet(); resetEvalGate();
  return { success: true, version, new_draft: version !== set.version };
}

// الاعتماد للمالك وحده، باسمه، والمجموعة بلا أخطاء
export async function setApprove(a: Admin, b: Body) {
  requireAgentRead(a);
  if (!a.owner) throw new Fail('اعتماد مجموعة التقييم للمالك وحده', 403, 'owner_only');
  const set = await evalSet();
  if (set.source !== 'db') throw new Fail('جدول المجموعة لم يُرحَّل بعد (20261116170000)', 409, 'not_migrated');
  if (set.status === 'approved') return { success: true, version: set.version, already: true };
  if (String(b.version || '') !== set.version) throw new Fail('تغيرت المجموعة منذ فتحتها، فراجعها مجددًا', 409, 'stale');
  const errors = validateCases(set);
  if (errors.length) throw new Fail(`في المجموعة أخطاء: ${errors.slice(0, 3).join('؛ ')}`, 409, 'bad_cases');
  const at = new Date().toISOString();
  const { data, error } = await db.from('guidance_eval_sets').update({ status: 'approved', approved_by: a.email, approved_at: at })
    .eq('id', set.id).eq('status', 'draft').select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Fail('تغيرت المجموعة منذ فتحتها، فراجعها مجددًا', 409, 'stale');
  await audit('admin', a.email, 'guide.eval-approve', 'guidance_eval_sets', set.version, null, { version: set.version, cases: set.cases.length });
  resetSet(); resetEvalGate();
  return { success: true, version: set.version, approved_at: at };
}
