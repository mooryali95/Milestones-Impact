import { describe, expect, it } from 'vitest';
import { PACE_MAX_NOTICES, PACE_TEXT, paceTracker } from '../../supabase/functions/leaders-api/pace.js';

const run = (t, kind, seconds) => { t.shown(0); return t.answered(kind, seconds * 1000); };

describe('التنبيه الوقائي أثناء القياس', () => {
  it('ينبّه بعد العدد المضبوط من إجابات متتالية أسرع من حد القراءة، لا قبله', () => {
    const t = paceTracker({ floor_choice: 5, floor_likert: 2, streak: 4 });
    expect([1, 2, 3].map(() => run(t, 'choice', 1))).toEqual([false, false, false]);
    expect(run(t, 'choice', 1)).toBe(true);
  });
  it('إجابة بزمن قراءة طبيعي تقطع السلسلة، وعبارة التقدير بحدّها الأقصر', () => {
    const t = paceTracker({ floor_choice: 5, floor_likert: 2, streak: 3 });
    run(t, 'choice', 1); run(t, 'choice', 1);
    expect(run(t, 'choice', 20)).toBe(false);
    expect(run(t, 'likert', 3)).toBe(false);      // 3 ثوانٍ كافية لعبارة تقدير
    expect([1, 2].map(() => run(t, 'likert', 1))).toEqual([false, false]);
    expect(run(t, 'likert', 1)).toBe(true);
  });
  it('مرتان على الأكثر في القياس الواحد، وبلا إعداد يعمل بالافتراضي', () => {
    const t = paceTracker(null);
    let n = 0;
    for (let i = 0; i < 40; i += 1) if (run(t, 'choice', 1)) n += 1;
    expect(n).toBe(PACE_MAX_NOTICES);
  });
  it('إجابة بلا ظهور مسجَّل لا تُحسب، والنص لا يتهم', () => {
    const t = paceTracker({ streak: 2 });
    expect(t.answered('choice', 1000)).toBe(false);
    expect(PACE_TEXT).not.toMatch(/غش|اكتشف|يدخل في تقييمك/);
  });
});
