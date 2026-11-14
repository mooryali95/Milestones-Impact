// ════════════════════════════════════════════════════════════════
// دليل الحقل في فصول وثيقة المبادرة: العون بقدر الحاجة، يتلاشى بالمستوى
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md (المرحلة 4أ، اعتمدها المالك).
// أثر المثال المحلول وانعكاس الخبرة: ما يعين المبتدئ يثقل على الخبير، فالعون نفسه يُعرض بثلاث صور:
//   التأسيسي: المعنى والخطأ الشائع مفتوحان بجانب الحقل
//   المتوسط: «كيف أكتبه؟» مطويًا، وفيه سؤال يرفع الجودة
//   المتقدم: «سؤال الخبير» مطويًا: تحدٍّ لا شرح
// المحتوى في المستودع (supabase/content/initiative-guide)، غير مُقاس، يراجعه خبير المحتوى.
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';

export const GUIDE_MODES = Object.freeze({ beginner: 'open', intermediate: 'collapsed', advanced: 'expert' });

/**
 * عون الحقل بمستوى المشارك في إطار الفصل، أو null إن لم يكن للحقل دليل
 * @param {string} modelKey @param {string} fieldKey @param {string | null | undefined} level
 */
export function guideFor(modelKey, fieldKey, level) {
  const g = FIELDS[modelKey]?.[fieldKey];
  if (!g || typeof g !== 'object') return null;
  const mode = GUIDE_MODES[level] || 'collapsed';
  return { mode, meaning: g.meaning, mistake: g.mistake, challenge: g.challenge };
}

export const hasGuide = (modelKey) => !!FIELDS[modelKey] && typeof FIELDS[modelKey] === 'object';
