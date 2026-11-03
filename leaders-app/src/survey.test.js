import { describe, expect, it } from 'vitest';
import { buildJourney, cleanSurvey, surveyQuestions } from '../../supabase/functions/leaders-api/logic.js';

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
