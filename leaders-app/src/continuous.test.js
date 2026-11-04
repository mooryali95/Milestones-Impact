import { describe, expect, it } from 'vitest';
import { KATON_ENABLED, RATING_PCT, RUBRIC_PCT } from '../../supabase/functions/leaders-api/labels.js';
import { cleanRubricScores, continuousAssessment, rubricPct } from '../../supabase/functions/leaders-api/logic.js';

const quizzes = [
  { quiz_score: 4, quiz_total: 5, completed_at: '2026-01-01', title: 'ب1' },
  { quiz_score: 2, quiz_total: 2, completed_at: '2026-01-02', title: 'ب2' },
  { quiz_score: 2, quiz_total: 3, completed_at: '2026-01-03', title: 'ب3' },
];

describe('التقييم المستمر', () => {
  it('بلا أحداث: لا مؤشر، ولكل مصدر سبب', () => {
    const c = continuousAssessment({});
    expect(c.index).toBeNull();
    expect(c.components.every((x) => x.value == null && x.reason)).toBe(true);
    expect(c.engagement.value).toBeNull();
  });

  it('المقاييس موحدة بخريطة صريحة: الاختبارات مجموع الصواب على المجموع، والتقدير والمعيار من خريطتيهما', () => {
    const c = continuousAssessment({
      quizzes,
      models: [{ rating: 5, reviewed_at: '2026-01-02', title: 'ن1' }, { rating: 3, reviewed_at: '2026-01-05', title: 'ن2' }, { rating: 1, reviewed_at: '2026-01-06', title: 'ن3' }],
      milestones: [{ scores: { understanding: 4, structure: 2 }, done_at: '2026-01-04', title_ar: 'م1' }, { scores: { execution: 3 }, done_at: '2026-01-07', title_ar: 'م2' }, { scores: { impact: 1 }, done_at: '2026-01-08', title_ar: 'م3' }],
    });
    const by = Object.fromEntries(c.components.map((x) => [x.key, x.value]));
    // الاختبارات: 8 من 10 أسئلة = 80 لا متوسط (80، 100، 67) = 82
    expect(by).toEqual({ quizzes: 80, models: 50, milestones: 48, lab: null, ...(KATON_ENABLED ? { katon: null } : {}) });
    expect(RATING_PCT[3]).toBe(50);
    expect(RUBRIC_PCT[3]).toBe(75);
    expect(c.index).toBe(59);
    expect(c.components.find((x) => x.key === 'quizzes')).toMatchObject({ n: 3, items: 10, enough: true, in_index: true });
    expect(c.components.find((x) => x.key === 'models').se).toBe(28.9);
  });

  it('لا يدخل المصدر المؤشر قبل حده الأدنى من الأحداث (3) أو أسئلة الاختبارات (10)، ويُعلَن ذلك', () => {
    const c = continuousAssessment({ quizzes: quizzes.slice(0, 2), models: [{ rating: 5, reviewed_at: '2026-01-02' }] });
    const q = c.components.find((x) => x.key === 'quizzes'), m = c.components.find((x) => x.key === 'models');
    expect(q).toMatchObject({ value: 86, items: 7, enough: false, in_index: false });
    expect(q.reason).toContain('لا يدخل المؤشر قبل 10 أسئلة');
    expect(m).toMatchObject({ value: 100, n: 1, in_index: false });
    expect(m.reason).toContain('لا يدخل المؤشر قبل 3 أحداث');
    expect(c.index).toBeNull();
    expect(continuousAssessment({ models: [{ rating: 5, reviewed_at: '2026-01-02' }], min_events: 1 }).index).toBe(100);
  });

  it('تقدير الخبراء انخراط لا جدارة: يُعرض منفصلًا ولا يدخل المؤشر', () => {
    const c = continuousAssessment({ quizzes, ratings: [{ overall: 5, created_at: '2026-01-03', comment: 'جيد' }, { overall: 3, created_at: '2026-01-04' }] });
    expect(c.components.some((x) => x.key === 'experts')).toBe(false);
    expect(c.index).toBe(80);
    expect(c.engagement).toMatchObject({ value: 75, n: 2 });
    expect(c.engagement.reason).toContain('لا يدخل المؤشر');
    expect(c.engagement.events.find((e) => e.comment).comment).toBe('جيد');   // الأحدث أولًا
  });

  it('المختبر: متوسط أول محاولة منتهية وأفضلها لكل أداة، والجارية لا تُحسب', () => {
    const c = continuousAssessment({ lab: [
      { item_id: 'a', pct: 40, finished_at: '2026-01-01', title: 'أداة أ' },
      { item_id: 'a', pct: 90, finished_at: '2026-01-02', title: 'أداة أ' },
      { item_id: 'b', pct: 70, finished_at: '2026-01-03', title: 'أداة ب' },
      { item_id: 'c', pct: 10, finished_at: null, title: 'جارية' },
    ], min_events: 2 });
    const lab = c.components.find((x) => x.key === 'lab');
    expect(lab.value).toBe(68);   // (65 + 70) / 2
    expect(lab.n).toBe(2);
    expect(lab.reason).toContain('متوسط أول محاولة وأفضلها في 2');
    expect(c.events.find((e) => e.label === 'أداة أ')).toMatchObject({ first: 40, best: 90, pct: 65 });
    expect(c.index).toBe(68);
  });

  it('أوزان المصادر من إعداد البرنامج: الصفر يستبعد، والوزن يرجّح', () => {
    const src = { quizzes: [{ quiz_score: 10, quiz_total: 10, completed_at: '2026-01-01' }], models: [{ rating: 1, reviewed_at: '2026-01-02' }], min_events: 1 };
    expect(continuousAssessment(src).index).toBe(50);
    expect(continuousAssessment({ ...src, weights: { quizzes: 3, models: 1 } }).index).toBe(75);
    expect(continuousAssessment({ ...src, weights: { quizzes: 1, models: 0 } }).index).toBe(100);
  });

  it('يرفع علامة لمكوّن دون المنتصف', () => {
    const c = continuousAssessment({ quizzes: [{ quiz_score: 2, quiz_total: 10, completed_at: '2026-01-01', title: 'ب' }] });
    expect(c.flags[0]).toContain('اختبارات الكتيب');
  });

  it('ينظف معيار المعلم ويحسب نسبته بالخريطة', () => {
    expect(cleanRubricScores({ understanding: '3', structure: 9, ghost: 2, impact: '' })).toEqual({ understanding: 3 });
    expect(rubricPct({ understanding: 4, execution: 1 })).toBe(50);
    expect(rubricPct({ understanding: 3 })).toBe(75);
    expect(rubricPct({})).toBeNull();
  });
});
