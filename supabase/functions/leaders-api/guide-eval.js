// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» G4a: تقييم الدقة قبل الإطلاق (قرار المالك: 99٪ على مجموعة تعتمدها لجنة المحتوى)
// ════════════════════════════════════════════════════════════════
// نقي: تصحيح الحالة بقواعد مكتوبة، والبصمة، وحكم البوابة. الخادم (guide-eval.ts) يشغّل الحالات بالمسار نفسه الذي يجيب به
// المشارك (guide.ts generate)، فما يُقيَّم هو ما يعمل. المراجعة البشرية لعينة الردود تبقى لازمة، والردود محفوظة لها.
import { GUIDE_MODEL, GUIDE_RULES, quizLeak, routeQuestion } from './guide.js';

export const EVAL_THRESHOLD = 0.99;
export const EVAL_KINDS = ['answer', 'unsure', 'refuse_model', 'refuse_route'];
// ما يُمنع في كل رد أيًا كانت الحالة: بريد ورابط ورقم اتصال، ووسم ظاهر لم يُقرأ
export const EVAL_FORBIDDEN = [/[\w.+-]+@[\w-]+\.[\w.]+/, /https?:\/\//i, /(?:\+?966|05)\d{8}/, /\[\[(answered|unsure|refused)\]\]/];

const ok = (re, text) => new RegExp(re, 'i').test(String(text || ''));

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
    if (r.verdict !== want && !(c.kind === 'refuse_model' && r.verdict === 'unsure')) reasons.push(`الحكم ${r.verdict || 'بلا وسم'} وكان المتوقع ${want}`);
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

// بصمة ما يُقيَّم: النموذج والقواعد ونسخة المجموعة ومحتواها. أي تغيير فيها يُسقط نجاحًا سابقًا
export async function evalFingerprint(set, model = GUIDE_MODEL) {
  const data = new TextEncoder().encode(JSON.stringify({ model, rules: GUIDE_RULES, cases: set?.cases || [] }));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${model}|${set?.version || '?'}|${hash.slice(0, 16)}`;
}

// حكم البوابة: المجموعة معتمدة من اللجنة، وآخر تشغيل منتهٍ لهذه البصمة ناجح بكل حالاته وبنسبة لا تقل عن الحد
export function evalGate(set, runs, fingerprint) {
  if (!set?.approved_by || !set?.approved_at) return { ok: false, reason: 'unapproved' };
  const latest = [...(runs || [])].filter((r) => r.fingerprint === fingerprint && ['passed', 'failed'].includes(r.status))
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
  if (!latest) return { ok: false, reason: 'none' };
  const total = set.cases.length;
  if (latest.status !== 'passed' || latest.done_cases < total || latest.passed_cases / total < EVAL_THRESHOLD) return { ok: false, reason: 'failed', run: latest };
  return { ok: true, reason: null, run: latest };
}

export const EVAL_GATE_AR = {
  unapproved: 'مجموعة التقييم لم تعتمدها لجنة المحتوى بعد.',
  none: 'لم يُشغَّل تقييم الدقة على النسخة الحالية بعد.',
  failed: `آخر تقييم للنسخة الحالية دون ${EVAL_THRESHOLD * 100}٪.`,
};
