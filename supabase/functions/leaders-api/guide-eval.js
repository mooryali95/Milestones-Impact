// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» G4a: تقييم الدقة قبل الإطلاق (قرار المالك: 99٪ على مجموعة يعتمدها المالك (v8))
// ════════════════════════════════════════════════════════════════
// نقي: تصحيح الحالة بقواعد مكتوبة، والبصمة، وحكم البوابة. الخادم (guide-eval.ts) يشغّل الحالات بالمسار نفسه الذي يجيب به
// المشارك (guide.ts generate)، فما يُقيَّم هو ما يعمل. المراجعة البشرية لعينة الردود تبقى لازمة، والردود محفوظة لها.
import { GUIDE_MODEL, GUIDE_RULES, normAr, quizLeak, routeQuestion } from './guide.js';

export const EVAL_THRESHOLD = 0.99;
export const EVAL_KINDS = ['answer', 'unsure', 'refuse_model', 'refuse_route'];
// ما يُمنع في كل رد أيًا كانت الحالة: بريد ورابط ورقم اتصال، ووسم ظاهر لم يُقرأ
export const EVAL_FORBIDDEN = [/[\w.+-]+@[\w-]+\.[\w.]+/, /https?:\/\//i, /(?:\+?966|05)\d{8}/, /\[\[(answered|unsure|refused)\]\]/];

// نسخة المصحح: جزء من البصمة، فتشغيل صُحح بمصحح أقدم لا يفتح البوابة. ترفع مع كل تغيير في gradeCase
// 2026-11-18: تطبيع الكتابة (normAr) في الرد والنمط معًا، فلا يرسب جواب صحيح بشدّة أو همزة، وأسباب الحكم بالعربية
export const GRADER_VERSION = '2026-11-18';
// النمط والرد يُطبَّعان معًا (بلا تشكيل ولا تطويل، والهمزات والتاء المربوطة والألف المقصورة والأرقام بصورة واحدة)، فالفرق
// في الإملاء وحده لا يُسقط جوابًا، والمفهوم الغائب يبقى غائبًا
const ok = (re, text) => new RegExp(normAr(re), 'i').test(normAr(text || ''));
export const VERDICT_AR = { answered: 'أجاب', unsure: 'غير متأكد', refused: 'رفض', route: 'رفض الموجّه', error: 'تعذّر' };
const vAr = (v) => (v ? `«${VERDICT_AR[v] || v}»` : 'بلا وسم');

/**
 * تصحيح حالة واحدة
 * @param {any} c الحالة من cases.json
 * @param {{ source: 'route'|'model'|'error', verdict?: string|null, text?: string, quiz?: any[] }} r ما خرج من المسار
 * @returns {{ pass: boolean, reasons: string[] }}
 */
export function gradeCase(c, r) {
  const reasons = [];
  if (r.source === 'error') return { pass: false, reasons: ['تعذّر الرد'] };
  if (c.kind === 'refuse_route') {
    if (r.source !== 'route') reasons.push('توقعت رفض الموجّه قبل النموذج فوصل إلى النموذج');
  } else {
    if (r.source === 'route') reasons.push('رفضه الموجّه وكان ينتظر النموذج');
    const want = { answer: 'answered', unsure: 'unsure', refuse_model: 'refused' }[c.kind];
    // الرفض بنص صريح يُقبل في refuse_model ولو جاء الوسم «غير متأكد»: المهم ألا يجيب عما ليس له
    if (r.verdict !== want && !(c.kind === 'refuse_model' && r.verdict === 'unsure')) reasons.push(`الحكم ${vAr(r.verdict)} وكان المتوقع ${vAr(want)}`);
  }
  for (const p of c.must_include || []) if (!ok(p, r.text)) reasons.push(`ينقصه: ${p}`);
  for (const p of c.must_not_include || []) if (ok(p, r.text)) reasons.push(`فيه الممنوع: ${p}`);
  for (const p of EVAL_FORBIDDEN) if (p.test(String(r.text || ''))) reasons.push(`ممنوع عام: ${p.source}`);
  if (r.quiz?.length && quizLeak(r.text, r.quiz)) reasons.push('كشف إجابة سؤال من اختبار الباب');
  return { pass: reasons.length === 0, reasons };
}

// صحة المجموعة نفسها قبل أي تشغيل: كل حالة بنوعها وحقولها، وحالات الموجّه يلتقطها الموجّه فعلًا، ولا معرّف مكرر
export function validateCases(set) {
  const errors = [];
  const seen = new Set();
  if (!set || !Array.isArray(set.cases) || !set.version) return ['المجموعة بلا نسخة أو حالات'];
  for (const c of set.cases) {
    const at = c?.id || '?';
    if (!c?.id || seen.has(c.id)) errors.push(`${at}: معرّف مفقود أو مكرر`);
    seen.add(c?.id);
    if (!EVAL_KINDS.includes(c?.kind)) errors.push(`${at}: نوع غير معروف`);
    if (!String(c?.question || '').trim()) errors.push(`${at}: بلا سؤال`);
    if (c?.context === 'handbook' && (!c.dimension || !c.chapter_key)) errors.push(`${at}: سؤال كتاب بلا باب`);
    for (const p of [...(c?.must_include || []), ...(c?.must_not_include || [])]) {
      try { new RegExp(p, 'i'); } catch { errors.push(`${at}: نمط غير صالح ${p}`); }
    }
    const routed = routeQuestion(c?.question).kind === 'refuse';
    if (c?.kind === 'refuse_route' && !routed) errors.push(`${at}: لا يلتقطه الموجّه`);
    if (c?.kind !== 'refuse_route' && routed) errors.push(`${at}: يلتقطه الموجّه قبل النموذج`);
  }
  return errors;
}

// بصمة ما يُقيَّم: النموذج والقواعد ونسخة المجموعة ومحتواها، ونسخة المصحح، ومرجع البرنامج المرسل للسؤال من خارج الأبواب.
// أي تغيير فيها يُسقط نجاحًا سابقًا
export async function evalFingerprint(set, model = GUIDE_MODEL, rules = GUIDE_RULES, brief = '') {
  const hash = await sha16(JSON.stringify({ model, rules, cases: set?.cases || [], grader: GRADER_VERSION, brief: String(brief || '') }));
  return `${model}|${set?.version || '?'}|${hash}`;
}
async function sha16(text) {
  const data = new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
// بصمة محتوى النسخة كما فتحها المالك: حالاتها وآخر تعديل لها. الاعتماد لا يمر إن تغيرت بعد فتحها
export const setHash = (set) => sha16(JSON.stringify({ version: set?.version || '', cases: set?.cases || [], updated_at: set?.updated_at || null }));

// التشغيل التشخيصي (أعد الحالات الفاشلة فقط): بصمته تبدأ بهذه البادئة ثم معرّف التشغيل الذي أُخذت منه حالاته ثم بصمة اليوم،
// فلا يطابق بصمة اليوم أبدًا، والبوابة تستبعده صراحة فوق ذلك. لا يُحسب للبوابة مهما كانت نتيجته
export const DIAG_PREFIX = 'diag|';
export const isDiagnostic = (r) => String(r?.fingerprint || '').startsWith(DIAG_PREFIX);
export const diagFingerprint = (sourceRunId, fp) => `${DIAG_PREFIX}${sourceRunId}|${fp}`;
export function parseDiag(fingerprint) {
  const s = String(fingerprint || '');
  if (!s.startsWith(DIAG_PREFIX)) return null;
  const rest = s.slice(DIAG_PREFIX.length);
  const i = rest.indexOf('|');
  return i > 0 ? { source: rest.slice(0, i), fingerprint: rest.slice(i + 1) } : null;
}

// آخر تشغيل كامل منتهٍ لهذه البصمة (التشخيصي لا يدخل)
function latestFull(runs, fingerprint) {
  return [...(runs || [])].filter((r) => !isDiagnostic(r) && r.fingerprint === fingerprint && ['passed', 'failed'].includes(r.status))
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
}

// حكم البوابة: المجموعة معتمدة من اللجنة، وآخر تشغيل منتهٍ لهذه البصمة ناجح بكل حالاته وبنسبة لا تقل عن الحد
export function evalGate(set, runs, fingerprint) {
  if (!set?.approved_by || !set?.approved_at) return { ok: false, reason: 'unapproved' };
  const latest = latestFull(runs, fingerprint);
  if (!latest) return { ok: false, reason: 'none' };
  const total = set.cases.length;
  if (latest.status !== 'passed' || latest.done_cases < total || latest.passed_cases / total < EVAL_THRESHOLD) return { ok: false, reason: 'failed', run: latest };
  return { ok: true, reason: null, run: latest };
}

// الشرطان معًا للوحة (لا يغير الحكم: evalGate وحده يحكم): المجموعة معتمدة، وآخر تشغيل كامل للبصمة بعدد الناجح منه
export function gateChecklist(set, runs, fingerprint) {
  const total = set?.cases?.length || 0;
  const need = Math.ceil(EVAL_THRESHOLD * total - 1e-9);
  const run = latestFull(runs, fingerprint) || null;
  const runOk = !!run && run.status === 'passed' && run.done_cases >= total && run.passed_cases >= need;
  return { approved: !!(set?.approved_by && set?.approved_at), run: run ? { id: run.id, passed: run.passed_cases, total, started_at: run.started_at } : null, run_ok: runOk, need, total };
}

export const EVAL_GATE_AR = {
  unapproved: 'مجموعة التقييم لم تُعتمد بعد.',
  none: 'لم يُشغَّل تقييم الدقة على النسخة الحالية بعد.',
  failed: `آخر تقييم للنسخة الحالية دون ${EVAL_THRESHOLD * 100}٪.`,
};

// ── H2: تعديل حالة من اللوحة واعتماد المجموعة (قرار المالك v8) ──
// الحقول التي تُعدَّل من اللوحة، وما سواها (المعرّف) ثابت
export const CASE_FIELDS = ['kind', 'question', 'context', 'dimension', 'chapter_key', 'level', 'must_include', 'must_not_include', 'reference_ar', 'source'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);

/**
 * حالة بعد تعديل: الحقول المسموحة وحدها، منظفة. يعيد { ok, cases } أو { ok: false, error }
 */
export function applyCaseEdit(cases, id, patch = {}) {
  const i = (cases || []).findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, error: 'الحالة غير موجودة' };
  const c = { ...cases[i] };
  for (const k of Object.keys(patch || {})) {
    if (!CASE_FIELDS.includes(k)) return { ok: false, error: `حقل لا يُعدَّل: ${k}` };
    const v = patch[k];
    if (k === 'must_include' || k === 'must_not_include') c[k] = lines(v);
    else if (k === 'level') { if (v && !LEVELS.includes(v)) return { ok: false, error: 'مستوى غير معروف' }; c.level = v || undefined; }
    else if (k === 'context') { if (!['handbook', 'program'].includes(v)) return { ok: false, error: 'سياق غير معروف' }; c.context = v; }
    else c[k] = String(v ?? '').trim().slice(0, k === 'reference_ar' ? 2000 : 600);
  }
  const next = [...cases];
  next[i] = c;
  const errs = validateCases({ version: 'x', cases: next }).filter((e) => e.startsWith(`${id}:`));
  if (errs.length) return { ok: false, error: errs[0] };
  return { ok: true, cases: next };
}

// رقم النسخة التالية: تعديل نسخة معتمدة يبدأ مسودة برقم مراجعة جديد في اليوم نفسه
export function nextVersion(version, day) {
  const m = String(version || '').match(/^(\d{4}-\d{2}-\d{2})-r(\d+)$/);
  if (m && m[1] === day) return `${day}-r${Number(m[2]) + 1}`;
  return `${day}-r1`;
}

// ── H4: حالة جديدة من رد في سجل المحادثات وُسم «غير دقيق» ──
// السؤال يُنقل بعد إزالة ما يدل على صاحبه (بريد ورقم اتصال ورابط، والهوية والبطاقة في الخادم)، ولا يُحفظ معرّف المشارك
// ولا اسمه: المصدر «رد غير دقيق» برقم الرسالة وحده. المجموعة تبقى دائمًا، فلا تحمل بيانًا شخصيًا.
const PERSONAL = [[/[\w.+-]+@[\w-]+\.[\w.]+/g, '[بريد]'], [/https?:\/\/\S+/gi, '[رابط]'], [/(?:\+?966|0)5\d{8}/g, '[رقم]']];
export function scrubQuestion(text) {
  let t = String(text || '').replace(/\r/g, '').trim();
  for (const [re, mask] of PERSONAL) t = t.replace(re, mask);
  return t.slice(0, 600);
}
export function nextFlagId(cases) {
  const n = (cases || []).map((c) => /^f(\d+)$/.exec(String(c.id || ''))).filter(Boolean).map((m) => Number(m[1]));
  return `f${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0')}`;
}
/**
 * يضيف حالة إلى المجموعة بعد التحقق منها بقواعد المجموعة نفسها. يعيد { ok, cases, id } أو { ok: false, error }
 */
export function applyCaseAdd(cases, c) {
  const id = nextFlagId(cases);
  const kind = ['answer', 'unsure', 'refuse_model'].includes(c?.kind) ? c.kind : 'answer';
  const item = {
    id, kind, question: scrubQuestion(c?.question), context: c?.context === 'handbook' ? 'handbook' : 'program',
    ...(c?.context === 'handbook' ? { dimension: String(c.dimension || ''), chapter_key: String(c.chapter_key || '') } : {}),
    level: ['beginner', 'intermediate', 'advanced'].includes(c?.level) ? c.level : undefined,
    must_include: lines(c?.must_include), must_not_include: lines(c?.must_not_include),
    reference_ar: String(c?.reference_ar || '').trim().slice(0, 2000), source: String(c?.source || '').slice(0, 200),
  };
  if (!item.question) return { ok: false, error: 'السؤال فارغ' };
  const next = [...(cases || []), item];
  const errs = validateCases({ version: 'x', cases: next }).filter((e) => e.startsWith(`${id}:`));
  if (errs.length) return { ok: false, error: errs[0].replace(`${id}: `, '') };
  return { ok: true, cases: next, id };
}
