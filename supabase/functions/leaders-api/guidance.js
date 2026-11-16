// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: متى يُتاح التوجيه للمشارك (تصور 2026-11-16 v2، المرحلة G1)
// ════════════════════════════════════════════════════════════════
// قاعدة المالك: من لم يبدأ القراءة ولم يحل سؤالًا ولم يبدأ المبادرة لا يوجد ما يوجَّه إليه بعد.
// دالة نقية: الخادم (guidance.ts) يجمع الإشارات من مصادرها القائمة (reading_progress وhandbook_progress
// وmodel_submissions والمبادرة)، والواجهة ترسم من الناتج وحده، والمحادثة (G2) تفتح بالحكم نفسه.
// «اطلب استشارة» وأسئلة الفريق متاحة دائمًا ولا تمر بهذه القاعدة.

// أقل قراءة فعلية تُعد بداية: دقيقتان نشطتان في أي باب (عدّاد القراءة نفسه في activities.ts)
export const GUIDANCE_READ_SECONDS = 120;

export const GUIDANCE_SIGNALS = {
  reading: 'بدأت قراءة كتابك',
  quiz: 'حللت اختبار باب',
  initiative: 'بدأت مبادرتك',
  model: 'سلّمت نموذجًا',
};

export const GUIDANCE_TEXT = {
  title: 'التوجيه والإرشاد',
  lead: 'استشارة مع خبير، أو سؤال لفريقك وزملائك، من مكان واحد.',
  start: 'ابدأ بقراءة الباب الأول من كتابك، وسيكون التوجيه معك من هناك.',
  start_hint: 'التوجيه يُبنى على ما قرأته وما بدأته، فلا يوجد ما يوجَّه إليه قبل البداية. الاستشارة مع خبير متاحة لك الآن.',
};

/**
 * @param {{ read_seconds?: number, quizzes?: number, initiative?: boolean, models?: number } | null} s
 * @returns {{ ready: boolean, signals: string[] }}
 */
export function guidanceState(s) {
  const signals = [];
  if (Number(s?.read_seconds) >= GUIDANCE_READ_SECONDS) signals.push('reading');
  if (Number(s?.quizzes) > 0) signals.push('quiz');
  if (s?.initiative) signals.push('initiative');
  if (Number(s?.models) > 0) signals.push('model');
  return { ready: signals.length > 0, signals };
}
