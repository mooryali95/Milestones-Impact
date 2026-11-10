import { describe, expect, it } from 'vitest';
import { SUS_ITEMS, SUS_MIN_N, SUS_TARGET, susDue, susScore, susSummary, susValid } from '../../supabase/functions/leaders-api/sus.js';

const DAY = 864e5;
describe('مقياس سهولة الاستخدام SUS', () => {
  it('عشر عبارات، والاحتساب بقطبية الفردي والزوجي', () => {
    expect(SUS_ITEMS).toHaveLength(10);
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    // مثال Brooke المنشور: 4،1،5،2،4،1،5،1،4،2 = 87.5... (3+4+4+3+3+4+4+4+3+3)×2.5
    expect(susScore([4, 1, 5, 2, 4, 1, 5, 1, 4, 2])).toBe(87.5);
  });
  it('يرفض الإجابة الناقصة أو الخارجة عن المدى', () => {
    expect(susValid([1, 2, 3])).toBe(false);
    expect(susValid([1, 2, 3, 4, 5, 6, 1, 2, 3, 4])).toBe(false);
    expect(susValid([1, 2, 3, 4, 5, 0, 1, 2, 3, 4])).toBe(false);
    expect(susScore([1, 2, 3])).toBeNull();
  });
  it('يستحق بعد أسبوع، ولا يعود بعد الإجابة، ويؤجَّل ثلاثة أيام', () => {
    const now = Date.parse('2026-11-20T00:00:00Z');
    expect(susDue({ createdAt: new Date(now - 6 * DAY), now })).toBe(false);
    expect(susDue({ createdAt: new Date(now - 8 * DAY), now })).toBe(true);
    expect(susDue({ createdAt: new Date(now - 8 * DAY), answered: true, now })).toBe(false);
    expect(susDue({ createdAt: new Date(now - 8 * DAY), snoozedAt: new Date(now - DAY), now })).toBe(false);
    expect(susDue({ createdAt: new Date(now - 8 * DAY), snoozedAt: new Date(now - 4 * DAY), now })).toBe(true);
    expect(susDue({ createdAt: null, now })).toBe(false);
  });
  it('البوابة: خمسة فأكثر لكل دور ومتوسط فوق الهدف', () => {
    const rows = (role, n, score) => Array.from({ length: n }, () => ({ role, score }));
    const short = susSummary([...rows('participant', SUS_MIN_N, 80), ...rows('expert', SUS_MIN_N - 1, 90), ...rows('coordinator', SUS_MIN_N, 80)]);
    expect(short.met).toBe(false);
    expect(short.roles.find((r) => r.role === 'expert')).toMatchObject({ n: SUS_MIN_N - 1, met: false });
    const low = susSummary([...rows('participant', 6, SUS_TARGET), ...rows('expert', 6, 90), ...rows('coordinator', 6, 90)]);
    expect(low.roles[0].met).toBe(false);
    expect(susSummary([...rows('participant', 6, 80), ...rows('expert', 6, 90), ...rows('coordinator', 6, 77.5)]).met).toBe(true);
    expect(susSummary([]).roles.every((r) => r.n === 0 && r.mean === null)).toBe(true);
  });
});
