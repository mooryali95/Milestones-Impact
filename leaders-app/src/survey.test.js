import { describe, expect, it } from 'vitest';
import { buildJourney, cleanSurvey, surveyQuestions, surveySummary } from '../../supabase/functions/leaders-api/logic.js';

const cfg = { questions: 'ما مدى إفادتك؟\n(نص) ما أكثر ما أفادك؟\n(نص اختياري) ما تقترح؟' };

describe('الاستبانة تكتمل من إجاباتها', () => {
  it('تُقرأ الأسئلة من سطورها بأنواعها', () => {
    expect(surveyQuestions(cfg).map((q) => [q.type, q.required])).toEqual([['rating', true], ['text', true], ['text', false]]);
  });
  it('الإجابة الناقصة تُرفض، والكاملة تُنظَّف', () => {
    expect(cleanSurvey(cfg, { q1: 4 }).error).toMatch('أجب عن');
    expect(cleanSurvey(cfg, { q1: 9, q2: 'كثير' }).error).toMatch('ما مدى إفادتك');
    expect(cleanSurvey(cfg, { q1: '5', q2: ' الأمثلة ', q3: '' }).answers).toEqual({ q1: 5, q2: 'الأمثلة' });
  });
  it('إجاباتها تصل إلى بندها في الرحلة', () => {
    const j = buildJourney({
      stages: [{ key: 'training', sort: 1 }],
      requirements: [{ id: 'r1', stage_key: 'training', code: 'T-REACT', kind: 'survey', required: false, sort: 1, config: cfg }],
      progress: { r1: { status: 'done', answers: { q1: 5, q2: 'x' } } }, levels: {}, state: {},
    });
    expect(j[0].items[0]).toMatchObject({ status: 'done', answers: { q1: 5, q2: 'x' } });
  });
});

import { workshopStatus } from '../../supabase/functions/leaders-api/logic.js';
describe('الحضور الآلي لدفعة الجهة', () => {
  it('تُحتسب الجلسة المنتهية لكل عضو دون مسح رمز، ولا تُحتسب القادمة', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    const s = [{ id: 'a', starts_at: '2026-11-04T06:00:00Z', ends_at: '2026-11-04T10:00:00Z' }, { id: 'b', starts_at: '2026-11-20T06:00:00Z', ends_at: '2026-11-20T10:00:00Z' }];
    const st = workshopStatus({ verify: 'auto', sessions_required: 2 }, s, new Set(), now);
    expect([st.count, st.done]).toEqual([1, false]);
  });
});

describe('تجميع استبانة رد الفعل (كيركباتريك 1)', () => {
  it('لكل تقدير عدده ومتوسطه وتوزيعه ونسبة أعلى تقديرين، ولكل نص إجاباته', () => {
    const cfg = { questions: 'أفادتك؟\n(نص) ما أكثر ما أفادك؟\n(نص اختياري) اقتراح' };
    const s = surveySummary(cfg, [{ q1: 5, q2: 'المثال الحي' }, { q1: 4, q2: 'الورشة', q3: 'وقت أطول' }, { q1: 2, q2: '' }, null]);
    expect(s.n).toBe(3);
    expect(s.questions[0]).toMatchObject({ type: 'rating', n: 3, mean: 3.7, top2_pct: 67, dist: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 } });
    expect(s.questions[1]).toMatchObject({ type: 'text', n: 2, texts: ['المثال الحي', 'الورشة'] });
    expect(s.questions[2].texts).toEqual(['وقت أطول']);
    expect(surveySummary(cfg, []).questions[0].mean).toBeNull();
  });
});
