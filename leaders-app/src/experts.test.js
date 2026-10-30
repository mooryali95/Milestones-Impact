// ملف الخبير: ما يُقبل من الطلب، وما لا يخرج لغير الإدارة
import { describe, expect, it } from 'vitest';
import { cleanExpert, expertPublic } from '../../supabase/functions/leaders-api/logic.js';

describe('ملف الخبير', () => {
  it('يقبل القيم المعروفة وحدها ويقص الطويل', () => {
    const x = cleanExpert({ full_name: '  سارة  ', roles: ['coach', 'hacker', 'coach'], dimensions: ['impact', 'x'], levels: ['advanced'],
      languages: [], sectors: 'حكومي، طاقة , صحة', weekly_hours: '8', years_experience: '99', linkedin_url: 'javascript:alert(1)', bio: 'a'.repeat(4000) });
    expect(x.full_name).toBe('سارة');
    expect(x.roles).toEqual(['coach']);
    expect(x.dimensions).toEqual(['impact']);
    expect(x.languages).toEqual(['ar']);
    expect(x.sectors).toEqual(['حكومي', 'طاقة', 'صحة']);
    expect(x.weekly_hours).toBe(8);
    expect(x.years_experience).toBeNull();
    expect(x.linkedin_url).toBeNull();
    expect(x.bio.length).toBe(3000);
  });
  it('طلب الانضمام لا يكتب السعر ولا الملاحظة الداخلية', () => {
    const x = cleanExpert({ full_name: 'سارة', hourly_rate: 500, admin_note: 'x' });
    expect(x).not.toHaveProperty('hourly_rate');
    expect(x).not.toHaveProperty('admin_note');
    expect(cleanExpert({ hourly_rate: '250.555' }, { withAdmin: true }).hourly_rate).toBe(250.56);
    expect(cleanExpert({ hourly_rate: '-3' }, { withAdmin: true }).hourly_rate).toBeNull();
  });
  it('ما يخرج لغير الإدارة بلا سعر ولا ملاحظة ولا عنوان شبكة', () => {
    const out = expertPublic({ id: 'e1', full_name: 'سارة', hourly_rate: 300, admin_note: 'n', applied_ip: '1.1.1.1', approved_by: 'a@x' });
    expect(out).toEqual({ id: 'e1', full_name: 'سارة' });
  });
});

import { expertStats } from '../../supabase/functions/leaders-api/logic.js';
it('خدمات الخبير: المنعقدة وحدها ساعات وتكلفة، والمدد الشاذة لا تُحتسب', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  const s = (status, start, mins, pid = 'p1') => ({ status, participant_id: pid, starts_at: start, ends_at: new Date(Date.parse(start) + mins * 6e4).toISOString() });
  const st = expertStats([
    s('attended', '2026-10-01T10:00:00Z', 60), s('attended', '2026-10-02T10:00:00Z', 45, 'p2'), s('attended', '2026-10-03T10:00:00Z', 900),
    s('no_show', '2026-10-04T10:00:00Z', 60), s('cancelled', '2026-10-05T10:00:00Z', 60), s('booked', '2026-11-05T10:00:00Z', 60),
  ], 300, now);
  expect(st).toEqual({ sessions: 5, attended: 3, no_show: 1, upcoming: 1, participants: 2, hours: 1.8, cost: 540 });
  expect(expertStats([], null, now).cost).toBeNull();
});
