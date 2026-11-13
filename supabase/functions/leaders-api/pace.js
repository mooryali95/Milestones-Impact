// ════════════════════════════════════════════════════════════════
// تنبيه وقائي أثناء القياس: إجابات متتالية أسرع من زمن القراءة (منطق خالص، يعمل في المتصفح)
// ════════════════════════════════════════════════════════════════
// الوقاية قبل الوسم: مؤشر الجهد يُحسب بعد التسليم (answer-review.js effortOf)، وهنا يُنبَّه المشارك وهو يجيب،
// بحدود القراءة نفسها (إعدادات answer_review، يمررها الخادم في assessment.get). لطيف وغير حاجب، ومرتين على الأكثر
// في القياس الواحد حتى لا يصير إزعاجًا. لا يُرسل شيئًا للخادم ولا يدخل الدرجة.
export const PACE_MAX_NOTICES = 2;
export const PACE_TITLE = 'خذ وقتك';
export const PACE_TEXT = 'إجاباتك الأخيرة جاءت أسرع من الوقت اللازم لقراءة السؤال. نتيجة هذا القياس تحدد مسارك في البرنامج، وإجاباتك محفوظة فلا عجلة.';

/**
 * متتبع الإيقاع. shown(now) عند ظهور سؤال، وanswered(kind, now) عند أول إجابة عنه: يعيد true حين يحين التنبيه.
 * @param {{ floor_choice?: number, floor_likert?: number, streak?: number }|null} cfg
 */
export function paceTracker(cfg) {
  const floorChoice = Number(cfg?.floor_choice) || 5, floorLikert = Number(cfg?.floor_likert) || 2;
  const need = Math.max(2, Number(cfg?.streak) || 4);
  let at = null, run = 0, notices = 0;
  return {
    shown(now) { at = now; },
    answered(kind, now) {
      if (at == null) return false;
      const sec = (now - at) / 1000;
      at = null;
      if (sec >= (kind === 'likert' ? floorLikert : floorChoice)) { run = 0; return false; }
      run += 1;
      if (run < need || notices >= PACE_MAX_NOTICES) return false;
      run = 0; notices += 1;
      return true;
    },
  };
}
