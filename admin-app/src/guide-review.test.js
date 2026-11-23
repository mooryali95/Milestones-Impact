// المرحلة د (قرار المالك 2026-11-23): مراجعة الأسبوع تجمع ما يستحق التعلم بالموضع، بالسؤال السابق للرد في محادثته،
// وتعدّ التكرار، ولا تحمل اسمًا ولا بريدًا ولا معرّف مشارك
import { describe, expect, it } from 'vitest';
import { buildReview, normQuestion, REPEAT_MIN, reviewReason, weekRates } from '../../supabase/functions/leaders-api/guide-review.js';

const R = (id, pid, o = {}) => ({ id, participant_id: pid, context: 'program', chapter_id: null, verdict: 'answered', guard: null, confirmed_at: null, created_at: `2026-11-2${id % 9}T10:00:00Z`, ...o });
const Q = (id, pid, body) => ({ id, participant_id: pid, body });

describe('سبب المراجعة', () => {
  it('الحارس أولًا، ثم لم يتأكد، ثم اعتذر، ثم طلب خبير؛ والإجابة السليمة لا تُراجع', () => {
    expect(reviewReason(R(1, 'a', { guard: 'quiz', verdict: 'unsure' }))).toBe('guard');
    expect(reviewReason(R(1, 'a', { verdict: 'unsure' }))).toBe('unsure');
    expect(reviewReason(R(1, 'a', { verdict: 'refused' }))).toBe('refused');
    expect(reviewReason(R(1, 'a', { confirmed_at: 'x' }))).toBe('confirmed');
    expect(reviewReason(R(1, 'a'))).toBe(null);
    expect(reviewReason(R(1, 'a', { verdict: 'error' }))).toBe(null);
  });
});

describe('بناء المراجعة', () => {
  const qs = [Q(1, 'a', 'ما المعلم؟'), Q(3, 'a', 'ما البوابة'), Q(5, 'b', 'ما البوابة؟'), Q(7, 'c', 'ما  البوابةُ ؟'), Q(9, 'b', 'سؤال آخر')];
  const reps = [R(2, 'a'), R(4, 'a', { verdict: 'unsure' }), R(6, 'b', { verdict: 'unsure' }), R(8, 'c', { guard: 'ungrounded', context: 'handbook', chapter_id: 'm3' }), R(10, 'b', { confirmed_at: 'x' })];
  const out = buildReview(reps, qs, (id) => (id === 'm3' ? 'المعلم: الفصل 3' : `باب ${id}`));
  it('يربط كل رد بسؤاله السابق في محادثة صاحبه وحدها', () => {
    const all = out.groups.flatMap((g) => g.cases);
    expect(all.find((x) => x.message_id === 4).question).toBe('ما البوابة');
    expect(all.find((x) => x.message_id === 6).question).toBe('ما البوابة؟');
    expect(all.find((x) => x.message_id === 10).question).toBe('سؤال آخر');
    expect(all.some((x) => x.message_id === 2)).toBe(false);
  });
  it('يجمع بالموضع باسم الباب، ويعد التكرار بعد التوحيد، ويحسب الأسباب', () => {
    expect(out.groups.map((g) => g.label)).toEqual(['الرحلة والبرنامج', 'المعلم: الفصل 3']);
    expect(out.groups[0].cases[0].repeats).toBe(3);
    expect(out.repeated).toBe(REPEAT_MIN === 3 ? 1 : out.repeated);
    expect(out.reasons).toEqual({ guard: 1, unsure: 2, refused: 0, confirmed: 1 });
    expect(out.total).toBe(4);
  });
  it('لا يحمل معرّف المشارك في الناتج', () => {
    expect(JSON.stringify(out)).not.toMatch(/participant_id|"a"|"b"|"c"/);
  });
  it('توحيد الأسئلة: الهمزات والتشكيل والترقيم', () => expect(normQuestion('ما البوابةُ ؟')).toBe(normQuestion('ما البوابه')));
});

describe('نسب الأسبوع', () => {
  it('الإجابة السليمة بلا حارس، ولا قسمة على صفر', () => {
    expect(weekRates([])).toEqual({ replies: 0, answered_pct: null, unsure_pct: null, guard_pct: null });
    expect(weekRates([{ verdict: 'answered' }, { verdict: 'answered', guard: 'quiz' }, { verdict: 'unsure' }, { verdict: 'answered' }]))
      .toEqual({ replies: 4, answered_pct: 50, unsure_pct: 25, guard_pct: 25 });
  });
});

import { weekLine } from '../../supabase/functions/leaders-api/guide-review.js';
describe('سطر Slack الأسبوعي (د3)', () => {
  it('أعداد ونسب بفرق الأسبوع السابق، بلا نص سؤال', () => {
    const l = weekLine({ replies: 40, answered_pct: 80, unsure_pct: 12.5, guard_pct: 5 }, { replies: 30, answered_pct: 70, unsure_pct: 20, guard_pct: 5 }, 6);
    expect(l).toContain('40 ردًا، أجاب 80٪ (+10)');
    expect(l).toContain('لم يتأكد 12.5٪ (-7.5)');
    expect(l).toContain('أوقفه الحارس 5٪.');
    expect(l).toContain('6 حالة تنتظر مراجعتك');
    expect(weekLine({ replies: 3, answered_pct: 100, unsure_pct: 0, guard_pct: 0 }, { replies: 0, answered_pct: null, unsure_pct: null, guard_pct: null }, 0)).toContain('لا حالة تنتظر المراجعة');
  });
});
