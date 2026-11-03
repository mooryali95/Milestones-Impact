import { describe, expect, it } from 'vitest';
import { KATON_ENABLED } from '../../supabase/functions/leaders-api/labels.js';
import { cleanRubricScores, continuousAssessment, rubricPct } from '../../supabase/functions/leaders-api/logic.js';

describe('التقييم المستمر', () => {
  it('بلا أحداث: لا مؤشر، ولكل مصدر سبب', () => {
    const c = continuousAssessment({});
    expect(c.index).toBeNull();
    expect(c.components.every((x) => x.value == null && x.reason)).toBe(true);
  });

  it('يجمع المصادر الأربعة بأوزان متساوية، ويشرح كل مكوّن', () => {
    const c = continuousAssessment({
      quizzes: [{ quiz_score: 8, quiz_total: 10, completed_at: '2026-01-01', title: 'ب1' }],
      models: [{ rating: 5, reviewed_at: '2026-01-02', title: 'نموذج' }],
      ratings: [{ overall: 3, created_at: '2026-01-03', comment: 'جيد' }],
      milestones: [{ scores: { understanding: 4, structure: 2 }, done_at: '2026-01-04', title_ar: 'م1' }],
    });
    const by = Object.fromEntries(c.components.map((x) => [x.key, x.value]));
    // «كاتون» مخفي (KATON_ENABLED) فلا يدخل التقييم حتى يُعاد
    expect(by).toEqual({ quizzes: 80, models: 100, experts: 50, milestones: 67, ...(KATON_ENABLED ? { katon: null } : {}) });
    expect(c.index).toBe(74);
    expect(c.events[0].label).toBe('م1');
    expect(c.trend.dir).toBe('down');
  });

  it('يرفع علامة لمكوّن دون المنتصف', () => {
    const c = continuousAssessment({ quizzes: [{ quiz_score: 2, quiz_total: 10, completed_at: '2026-01-01', title: 'ب' }] });
    expect(c.flags[0]).toContain('اختبارات الكتيب');
  });

  it('ينظف معيار المعلم ويحسب نسبته', () => {
    expect(cleanRubricScores({ understanding: '3', structure: 9, ghost: 2, impact: '' })).toEqual({ understanding: 3 });
    expect(rubricPct({ understanding: 4, execution: 1 })).toBe(50);
    expect(rubricPct({})).toBeNull();
  });
});
