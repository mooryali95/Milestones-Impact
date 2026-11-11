// ════════════════════════════════════════════════════════════════
// تقييم 360 للتطوير: المنطق الصافي (تصور 2026-11-11، اعتمده المالك)
// ════════════════════════════════════════════════════════════════
// docs/content/2026-11-11-تصور-تقييم-360-v1.md. بلا قاعدة ولا Deno، يُختبر في vitest (leaders-app/src/eval360.test.js).
// 360 للتطوير وحده: لا يدخل التقييم الختامي ولا الشهادة ولا ما تراه الجهة عن الفرد.
import { CONTACT_FREQ_AR, FEEDBACK_OPEN_AR, FEEDBACK_OPEN_MAX } from './labels.js';

// ── المرحلة 1: نموذج المقيّم ──
// مجموعات المقيّمين، والذات تجيب على ما يجيب عليه المقيّم حرفيًا
export const FEEDBACK_GROUPS = ['manager', 'peer', 'report', 'stakeholder'];

// عبارة معكوسة: أعلى درجاتها لأول خياراتها (M-B5 وI-B5 وL-B5 في v5). تبقى في القياس الذاتي لضبط ميل الموافقة،
// ولا تُعرض على المقيّم لأنها تربكه أكثر مما تضبطه
export function reversedItem(q) {
  const s = (q?.options || []).map((o) => Number(o.score)).filter((n) => Number.isFinite(n) && n >= 0);
  return s.length > 1 && s[0] > s[s.length - 1];
}

// ما يُعرض على مقيّم من مجموعة relation: observable_by إن عُلِّم (null = الجميع)، وإلا كل عبارة غير معكوسة.
// العكس يُستثنى بالترتيب نفسه ولو لم يُطبَّق ترحيل العمود بعد
export function raterItems(questions = [], relation) {
  return questions.filter((q) => (Array.isArray(q.observable_by) ? q.observable_by.includes(relation) : !reversedItem(q)));
}

export const CONTACT_FREQ = Object.keys(CONTACT_FREQ_AR);
export const OPEN_KEYS = Object.keys(FEEDBACK_OPEN_AR);

// الأسئلة المفتوحة: نص مقصوص لكل مفتاح معروف، وnull إن خلت كلها
export function cleanOpenAnswers(o) {
  const out = {};
  for (const k of OPEN_KEYS) {
    const v = String(o?.[k] ?? '').trim().slice(0, FEEDBACK_OPEN_MAX);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
