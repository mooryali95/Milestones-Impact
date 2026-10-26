// ════════════════════════════════════════════════════════════════
// استوديو كتاب القائد: منطق بلا واجهة
// ════════════════════════════════════════════════════════════════
// صيغة الاختبار وحذف كتل المستوى ونقاط الباب تأتي من logic.js على الخادم
// نفسه، فما تراه الإدارة في المعاينة هو ما يصل المشارك حرفيًا.
import { filterHandbookMd, handbookModulesFor, modelsFor, parseQuiz, POINTS } from '../../supabase/functions/leaders-api/logic.js';

export { filterHandbookMd, parseQuiz };
export const RANK = { beginner: 1, intermediate: 2, advanced: 3 };
export const FTYPE = { text: 'نص قصير', textarea: 'نص طويل', select: 'اختيار', table: 'جدول' };
export const HB_VIEWS = [['chapters', 'الأبواب'], ['models', 'النماذج التعليمية'], ['preview', 'الكتاب الأصلي والكتب الـ27'], ['reviews', 'التقييم']];
export const SUB_FILTER = [['submitted', 'بانتظار تقييمك'], ['reviewed', 'قُيّمت'], ['returned', 'أُعيدت للتطوير'], ['', 'الكل']];
export const QUIZ_TEMPLATE = 'س: نص السؤال\n- خيار\n* الخيار الصحيح\n- خيار\nلماذا: شرح قصير';

export const words = (md) => (String(md || '').replace(/^:::.*$/gm, '').match(/\S+/g) || []).length;
export const tiered = (md) => /^:::(min|only)=/m.test(md || '');
export const stars = (n) => '★★★★★'.slice(0, n || 0) + '☆☆☆☆☆'.slice(0, 5 - (n || 0));
export const maxPoints = (quizCount, hasReflection) => POINTS.chapter + quizCount * POINTS.perCorrect + (hasReflection ? POINTS.reflection : 0);
// أسئلة كُتبت لكن لن تظهر: بلا خيار صحيح أو بأقل من خيارين
export const badQuiz = (md) => String(md || '').split('\n').filter((l) => /^س\s*[:：]/.test(l.trim())).length - parseQuiz(md).length;
export const nextSort = (rows, dim) => Math.max(0, ...rows.filter((x) => x.dimension === dim).map((x) => x.sort || 0)) + 1;
export const splitList = (v) => String(v).split(/[,،]/).map((x) => x.trim()).filter(Boolean);

// ── الكتاب الأصلي الكامل: مصدر الكتب الـ27 ──
// كل الأبواب والنماذج بكل كتلها، وكل كتلة موسومة بمن يقرؤها، فيرى المحرر
// الأصل كاملًا وما يصل كل مسار منه. يُبنى من بيانات اللوحة بلا طلب للخادم.
export const MASTER = 'MASTER';
const TIER = {
  min: { beginner: 'لكل المستويات', intermediate: 'للمتوسط فأعلى', advanced: 'للاحترافي' },
  only: { beginner: 'للتأسيسي فقط', intermediate: 'للمتوسط فقط', advanced: 'للاحترافي فقط' },
  scope: { project: 'لكل النطاقات', program: 'لقادة البرامج والمحافظ', portfolio: 'لقادة المحافظ' },
};
export const tierLabel = (spec) => String(spec).trim().split(/\s+/)
  .map((t) => { const [k, v] = t.split('='); return TIER[k]?.[v] || t; }).join(' · ');
const ALL = { milestone: 'advanced', impact: 'advanced', leadership: 'advanced' };
export function masterBook(modules, models) {
  return {
    success: true, master: true, levels: ALL,
    chapters: handbookModulesFor(modules || [], ALL).map((m) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, min_level: m.min_level,
      md: m.body_md, reflection: m.reflection_ar || '', quiz: parseQuiz(m.quiz_md),
    })),
    models: modelsFor(models || [], ALL),
  };
}

// أدوات المحرر: [ما يُدرج، التسمية، النمط] · line يُدرج أول السطر · wrap يحيط التحديد · block كتلة مستوى
export const HB_TOOLS = [
  ['## ', 'عنوان', 'line'], ['### ', 'عنوان فرعي', 'line'], ['- ', 'بند', 'line'], ['1. ', 'ترقيم', 'line'], ['**', 'غامق', 'wrap'], ['> ', 'خلاصة', 'line'],
  [':::min=intermediate\n', 'فقرة للمتوسط فأعلى', 'block'], [':::min=advanced\n', 'فقرة للاحترافي', 'block'], [':::only=beginner\n', 'فقرة للتأسيسي فقط', 'block'],
  [':::scope=program\n', 'فقرة لقادة البرامج والمحافظ', 'block'], [':::scope=portfolio\n', 'فقرة لقادة المحافظ', 'block'],
];
// يعيد النص الجديد وموضع المؤشر بعد تطبيق الأداة على التحديد [s0, s1]
export function applyTool(value, s0, s1, [ins, , mode]) {
  if (mode === 'line') {
    const ls = value.lastIndexOf('\n', s0 - 1) + 1;
    return { value: value.slice(0, ls) + ins + value.slice(ls), caret: s1 + ins.length };
  }
  const sel = value.slice(s0, s1);
  const text = mode === 'wrap' ? `**${sel || 'نص غامق'}**`
    : `${s0 && value[s0 - 1] !== '\n' ? '\n' : ''}${ins}${sel || 'اكتب الفقرة هنا'}\n:::\n`;
  return { value: value.slice(0, s0) + text + value.slice(s1), caret: s0 + text.length };
}

// ── مسودات المحررين: تُحفظ في هذا المتصفح حتى يُحفظ الباب أو النموذج ──
// المفتاح لكل سجل (أو لكل إطار حين يكون جديدًا)، وأي خلل في التخزين لا يوقف المحرر
export const draftKey = (entity, m, dim) => `mi_draft_${entity}_${m?.id || `new_${dim}`}`;
export function readDraft(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
export function writeDraft(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }
export function clearDraft(key) { try { localStorage.removeItem(key); } catch { /* */ } }
