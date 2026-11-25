// ════════════════════════════════════════════════════════════════
// شكل وثيقة المبادرة التي تخرج لصاحب القرار، لكل ملف تعريف (المصدر الواحد، يحرره المالك)
// يسكن بجانب دوال المسار لا في supabase/content: حزمة الدالة لا تصل ما خارج supabase/functions، وهو بيانات محتوى يحررها المالك كملفات المسارات.
// ════════════════════════════════════════════════════════════════
// قرار المالك 2026-11-25: النسخة المؤسسية منتج واحد اسمه وحجمه يتبعان مسار المشارك، لا متوسط مستوياته.
// المسارات الـ27 (M{m}I{i}L{l}، logic.js trackKey) تُطوى إلى تسعة ملفات تعريف (profiles.json: إطار الأولوية × مستواه فيه).
// الحل بالترتيب (leaders-api/doc-form.js docFormFor):
//   1. tracks[مفتاح المسار] إن ضبطه المالك لمسار بعينه
//   2. profiles[مفتاح ملف التعريف]
//   3. القاعدة الافتراضية: مستوى المشارك في إطار أولويته (تأسيسي ← بطاقة، متوسط ← ميثاق، احترافي ← حالة عمل)
// القيم المسموحة لـ form: card | charter | case (الأسماء والصفحات في FORMS أدناه). داخل الوثيقة يبقى كل فصل بعمق مستوى إطاره.
export const FORMS = Object.freeze({
  card: Object.freeze({ key: 'card', name: 'بطاقة المبادرة', en: 'Initiative Card', pages: [3, 5] }),
  charter: Object.freeze({ key: 'charter', name: 'ميثاق المبادرة', en: 'Initiative Charter', pages: [8, 12] }),
  case: Object.freeze({ key: 'case', name: 'حالة العمل', en: 'Business Case', pages: [18, 25] }),
});

export const DEFAULT_BY_LEVEL = Object.freeze({ beginner: 'card', intermediate: 'charter', advanced: 'case' });

export const PROFILE_FORMS = Object.freeze({
  'milestone-beginner': 'card',
  'impact-beginner': 'card',
  'leadership-beginner': 'card',
  'milestone-intermediate': 'charter',
  'impact-intermediate': 'charter',
  'leadership-intermediate': 'charter',
  'milestone-advanced': 'case',
  'impact-advanced': 'case',
  'leadership-advanced': 'case',
});

// استثناء لمسار بعينه (فارغ افتراضًا): { 'M1I3L3': 'charter' }
export const TRACK_FORMS = Object.freeze({});
