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

import { MATCH_WEIGHTS, matchScore, rankExperts } from '../../supabase/functions/leaders-api/logic.js';
describe('الإسناد: ترشيح الخبير', () => {
  const base = { status: 'active', roles: ['coach'], dimensions: ['impact'], levels: ['intermediate'], sectors: ['حكومي'], weekly_hours: 4, load: { requests: 0, upcoming: 0 } };
  const need = { role: 'coach', dimension: 'impact', level: 'intermediate', sector: 'حكومي' };
  it('الأوزان مجموعها 100، والمطابقة الكاملة بلا تقييم = 88', () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, n) => a + n, 0)).toBe(100);
    expect(matchScore(base, need).total).toBe(35 + 25 + 12 + 10);
    expect(matchScore({ ...base, served: true, rating: { avg: 5, count: 6 } }, need).total).toBe(100);
  });
  it('التقييم لا يُحتسب قبل خمسة تقييمات', () => {
    expect(matchScore({ ...base, rating: { avg: 1, count: 4 } }, need).parts.quality).toBe(12);
    expect(matchScore({ ...base, rating: { avg: 1, count: 5 } }, need).parts.quality).toBe(0);
  });
  it('المستوى الأعلى يخدم ما دونه بنصف الدرجة، والأدنى لا', () => {
    expect(matchScore({ ...base, levels: ['advanced'] }, need).parts.fit).toBe(35 * (0.6 + 0.2));
    expect(matchScore({ ...base, levels: ['beginner'] }, need).parts.fit).toBe(35 * 0.6);
  });
  it('يستبعد غير النشط وغير صاحب الدور ومن عُرض عليه ومن اكتملت طاقته، ويرتب بالنقاط', () => {
    const list = rankExperts([
      { ...base, id: 'a', dimensions: ['milestone'] },
      { ...base, id: 'b' },
      { ...base, id: 'c', status: 'paused' },
      { ...base, id: 'd', roles: ['advisor'] },
      { ...base, id: 'e' },
      { ...base, id: 'f', load: { requests: 3, upcoming: 1 } },
    ], need, ['e']);
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('الحِمل يُنقص السعة', () => {
    expect(matchScore({ ...base, load: { requests: 1, upcoming: 1 } }, need).parts.capacity).toBe(12.5);
  });
});

import { cleanRating, ratingSummary } from '../../supabase/functions/leaders-api/logic.js';
it('التقييم: كل المعايير من 1 إلى 5، والمتوسط مرئي بعد خمسة', () => {
  expect(cleanRating({ a: 5, b: 4, c: 3, x: 9 }, ['a', 'b', 'c'])).toEqual({ scores: { a: 5, b: 4, c: 3 }, overall: 4 });
  expect(cleanRating({ a: 5, b: 0, c: 3 }, ['a', 'b', 'c'])).toBeNull();
  expect(cleanRating({ a: 5, b: 4 }, ['a', 'b', 'c'])).toBeNull();
  expect(ratingSummary([{ overall: 4 }, { overall: 5 }])).toEqual({ avg: 4.5, count: 2, visible: false });
  expect(ratingSummary(Array.from({ length: 5 }, () => ({ overall: 3 }))).visible).toBe(true);
  expect(ratingSummary([])).toEqual({ avg: null, count: 0, visible: false });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = join(__dirname, '../..');
import { expertFieldError } from '../../supabase/functions/leaders-api/logic.js';
// links-expert-5 وadmin-eval-10: ما كُتب في ملف الخبير لا يُمحى بصمت
describe('ملف الخبير: لا إسقاط صامت', () => {
  it('رابط LinkedIn بلا https أو بـhttp يُكمَّل، وغير رابط LinkedIn يُرد بخطأ', () => {
    expect(cleanExpert({ linkedin_url: 'www.linkedin.com/in/x' }).linkedin_url).toBe('https://www.linkedin.com/in/x');
    expect(cleanExpert({ linkedin_url: ' linkedin.com/in/x ' }).linkedin_url).toBe('https://linkedin.com/in/x');
    expect(cleanExpert({ linkedin_url: 'http://sa.linkedin.com/in/x' }).linkedin_url).toBe('https://sa.linkedin.com/in/x');
    expect(cleanExpert({ linkedin_url: 'https://www.linkedin.com/in/x' }).linkedin_url).toBe('https://www.linkedin.com/in/x');
    expect(cleanExpert({ linkedin_url: 'https://evil.com/linkedin.com/' }).linkedin_url).toBeNull();
    expect(expertFieldError({ linkedin_url: 'javascript:alert(1)' })).toMatch(/LinkedIn/);
    expect(expertFieldError({ linkedin_url: 'linkedin.com/in/x' })).toBeNull();
  });
  it('الأرقام المشرقية تُقبل، وما خرج عن المدى أو لم يكن رقمًا يُرد بخطأ لا يُحفظ فارغًا', () => {
    expect(cleanExpert({ hourly_rate: '٣٠٠' }, { withAdmin: true }).hourly_rate).toBe(300);
    expect(expertFieldError({ weekly_hours: '١٠', years_experience: '١٥' })).toBeNull();
    expect(expertFieldError({ years_experience: '75' })).toMatch(/سنوات الخبرة/);
    expect(expertFieldError({ weekly_hours: 'abc' })).toMatch(/الساعات/);
    expect(expertFieldError({ weekly_hours: '-50' })).toMatch(/الساعات/);
    expect(expertFieldError({ hourly_rate: 'abc' })).toBeNull();
    expect(expertFieldError({ hourly_rate: 'abc' }, { withAdmin: true })).toMatch(/سعر الساعة/);
    expect(expertFieldError({ weekly_hours: '', years_experience: null, linkedin_url: '  ' })).toBeNull();
  });
  it('حفظ الملف من الطلب والبوابة والإدارة يمر على التحقق قبل الكتابة', () => {
    const src = readFileSync(join(root, 'supabase/functions/leaders-api/experts.ts'), 'utf8');
    expect(src.match(/expertFieldError\(b[,)]/g)?.length).toBe(3);
  });
  it('ساعات الشهادة في اللوحة تقبل الأرقام المشرقية', () => {
    const src = readFileSync(join(root, 'admin-app/src/screens/Certificates.jsx'), 'utf8');
    expect(src).toMatch(/hours: latinDigits\(e\.target\.value\)/);
  });
});
