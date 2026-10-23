import { describe, it, expect } from 'vitest';
import { csvText, filterPeople, inviteUrl, trackOf, trackOfPlacements, validCampaign } from './leaders.js';

describe('trackOf', () => {
  it('يبني رمز المسار من المستويات الثلاثة', () => {
    expect(trackOf({ milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' })).toBe('M1I1L2');
    expect(trackOf({ milestone: 'advanced', impact: 'beginner' })).toBeNull();
  });
  it('يقرأ التسكين من قائمة الأبعاد', () => {
    expect(trackOfPlacements([{ dimension: 'milestone', level: 'advanced' }, { dimension: 'impact', level: 'advanced' }, { dimension: 'leadership', level: 'advanced' }])).toBe('M3I3L3');
  });
});

it('filterPeople يبحث ويصفّي بالمسار', () => {
  const pl = [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'beginner' }];
  const list = [{ full_name: 'سارة', email: 's@x', placements: pl }, { full_name: 'Omar', email: 'o@x', placements: [] }];
  expect(filterPeople(list, { q: 'omar' })).toHaveLength(1);
  expect(filterPeople(list, { track: 'M1I1L1' })[0].full_name).toBe('سارة');
});

it('روابط الدعوة والحملات', () => {
  expect(inviteUrl({ invite_code: 'abc' }, 'whatsapp')).toBe('https://leaders.sunkvalue.com/j/abc/whatsapp');
  expect(validCampaign('email_1')).toBe(true);
  expect(validCampaign('واتساب')).toBe(false);
});

it('csvText يبدأ بعلامة BOM ويهرّب علامات الاقتباس', () => {
  const t = csvText(['a'], [['x"y']]);
  expect(t.charCodeAt(0)).toBe(0xfeff);
  expect(t).toContain('"x""y"');
});
