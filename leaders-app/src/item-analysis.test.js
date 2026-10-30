import { describe, it, expect } from 'vitest';
import { itemAnalysis } from '../../supabase/functions/leaders-api/logic.js';

const opt = (...scores) => scores.map((score, i) => ({ label: `خيار ${i}`, score }));
const qs = [
  { id: 'a', dimension: 'milestone', kind: 'mcq', code: 'M1', options: opt(0, 2) },
  { id: 'b', dimension: 'milestone', kind: 'mcq', code: 'M2', options: opt(0, 2) },
  { id: 'c', dimension: 'milestone', kind: 'mcq', code: 'M3', options: opt(0, 2, 0) },
];
// خمسة مجيبين: a وb يسيران معًا، وc يعاكسهما
const people = [[1, 1, 0], [1, 1, 0], [0, 0, 1], [0, 0, 1], [1, 1, 1]];
const rows = people.flatMap((ks, i) => ks.map((k, j) => ({ assessment_id: `s${i}`, question_id: qs[j].id, k, score: qs[j].options[k].score })));

describe('itemAnalysis', () => {
  it('يحسب الصعوبة والتمييز وتوزيع الخيارات', () => {
    const r = itemAnalysis(qs, rows, { minN: 3 });
    expect(r.respondents).toBe(5);
    const a = r.items.find((x) => x.id === 'a');
    expect(a.n).toBe(5);
    expect(a.p).toBe(0.6);
    expect(a.options.map((o) => o.share)).toEqual([0.4, 0.6]);
    const c = r.items.find((x) => x.id === 'c');
    expect(c.discrimination).toBeLessThan(0);
    expect(c.flags).toContain('low_discrimination');
    // الخيار الثالث في c لم يختره أحد
    expect(c.flags).toContain('dead_option');
  });
  it('الثبات منخفض حين يعاكس سؤال بقية بُعده', () => {
    const r = itemAnalysis(qs, rows, { minN: 3 });
    const d = r.dimensions[0];
    expect(d.complete).toBe(5);
    expect(d.alpha).toBeLessThan(0.5);
  });
  it('لا أعلام قبل حد أدنى من المجيبين، ويُستبعد «لا ينطبق»', () => {
    const r = itemAnalysis(qs, [...rows, { assessment_id: 's9', question_id: 'a', k: 0, score: -1 }]);
    expect(r.items.every((x) => x.flags.length === 0)).toBe(true);
    expect(r.items.find((x) => x.id === 'a').n).toBe(5);
  });
});

import { weeklySeries, weekStart } from '../../supabase/functions/leaders-api/logic.js';

describe('weeklySeries', () => {
  it('الأسبوع يبدأ الأحد', () => {
    expect(weekStart('2026-10-25T10:00:00Z')).toBe('2026-10-25');   // أحد
    expect(weekStart('2026-10-31T23:00:00Z')).toBe('2026-10-25');   // سبت
  });
  it('يعد الأحداث في أسابيعها، والنشطون مرة لكل مشارك', () => {
    const s = weeklySeries({
      joined: ['2026-10-26T08:00:00Z', '2026-10-19T08:00:00Z', '2025-01-01T00:00:00Z'],
      assessed: ['2026-10-27T08:00:00Z'], approved: [],
      active: [['2026-10-26T08:00:00Z', 'p1'], ['2026-10-27T08:00:00Z', 'p1'], ['2026-10-27T09:00:00Z', 'p2']],
    }, { weeks: 3, now: Date.parse('2026-10-28T12:00:00Z') });
    expect(s.map((r) => r.week)).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
    expect(s.at(-1)).toEqual({ week: '2026-10-25', joined: 1, assessed: 1, approved: 0, active: 2 });
    expect(s[1].joined).toBe(1);
  });
  it('يكشف تداخل إطارين يسيران معًا ويفصل المستقلين', () => {
    const q3 = [
      { id: 'm1', dimension: 'milestone', kind: 'mcq', options: opt(0, 1) }, { id: 'm2', dimension: 'milestone', kind: 'mcq', options: opt(0, 1) },
      { id: 'l1', dimension: 'leadership', kind: 'mcq', options: opt(0, 1) }, { id: 'l2', dimension: 'leadership', kind: 'mcq', options: opt(0, 1) },
      { id: 'i1', dimension: 'impact', kind: 'mcq', options: opt(0, 1) }, { id: 'i2', dimension: 'impact', kind: 'mcq', options: opt(0, 1) },
    ];
    // القيادة نسخة من المعالم، والأثر مستقل عنهما
    const ms = [[1, 1], [1, 0], [0, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 0], [1, 0], [0, 0], [1, 1], [0, 1]];
    const im = [[1, 0], [0, 0], [1, 1], [0, 1], [1, 1], [0, 0], [0, 0], [1, 1], [1, 1], [0, 1], [1, 0], [0, 0]];
    const r3 = ms.flatMap((m, i) => [
      ...['m1', 'm2'].map((id, j) => ({ assessment_id: `p${i}`, question_id: id, score: m[j] })),
      ...['l1', 'l2'].map((id, j) => ({ assessment_id: `p${i}`, question_id: id, score: m[j] })),
      ...['i1', 'i2'].map((id, j) => ({ assessment_id: `p${i}`, question_id: id, score: im[i][j] })),
    ]);
    const r = itemAnalysis(q3, r3, { minN: 10 });
    const pair = (a, b) => r.correlations.find((c) => [c.a, c.b].sort().join() === [a, b].sort().join());
    expect(pair('milestone', 'leadership').r).toBe(1);
    expect(pair('milestone', 'leadership').overlap).toBe(true);
    expect(pair('milestone', 'impact').overlap).toBe(false);
    expect(pair('milestone', 'impact').n).toBe(12);
  });
});
