import { describe, expect, it } from 'vitest';
import { compareText, fillDays, gapLabel, isPartialWeek, maskSmall, mergePages, mergeRefs, normPath, pct, pickDays, pickSite, rangeLabel, refHost, siteName, weekCompare, weekRows } from './visits.js';

const NOW = Date.parse('2026-11-26T10:00:00Z'); // خميس

describe('fillDays', () => {
  it('يملأ كل أيام المدى بصفر ويحفظ الموجود', () => {
    const r = fillDays([{ day: '2026-11-24', visits: 3, views: 5 }], 7, NOW);
    expect(r).toHaveLength(8);
    expect(r[0].day).toBe('2026-11-19');
    expect(r.at(-1)).toEqual({ day: '2026-11-26', visits: 0, views: 0 });
    expect(r.find((x) => x.day === '2026-11-24')).toEqual({ day: '2026-11-24', visits: 3, views: 5 });
    expect(r.reduce((a, x) => a + x.visits, 0)).toBe(3);
  });
  it('يسقط ما خارج المدى ولا يغير عدد الأيام', () => {
    const r = fillDays([{ day: '2026-11-01T00:00:00Z', visits: 2 }], 7, NOW);
    expect(r.some((x) => x.day === '2026-11-01')).toBe(false);
    expect(r).toHaveLength(8);
  });
  it('رد فارغ أو null', () => { expect(fillDays(null, 30, NOW).every((x) => x.visits === 0)).toBe(true); });
});

const W = (week, joined) => ({ week, joined, assessed: 0, approved: 0, active: 0 });
describe('weekCompare', () => {
  it('يقارن آخر أسبوعين مكتملين ويتجاهل الجاري', () => {
    const weeks = [W('2026-11-08', 10), W('2026-11-15', 20), W('2026-11-22', 1)];
    expect(isPartialWeek('2026-11-22', NOW)).toBe(true);
    expect(weekCompare(weeks, 'joined', NOW)).toMatchObject({ cur: 20, prev: 10, diff: 10, pct: 100, dir: 'up', neutral: false, week: '2026-11-15' });
  });
  it('محايد عند الأعداد الصغيرة، وبلا نسبة إن كان السابق صفرًا', () => {
    const c = weekCompare([W('2026-11-08', 0), W('2026-11-15', 2), W('2026-11-22', 0)], 'joined', NOW);
    expect(c).toMatchObject({ pct: null, neutral: true, dir: 'up' });
    expect(compareText(c)).toBe('2، زيادة 2 عن الأسبوع السابق (0)');
  });
  it('null إن لم يكتمل أسبوعان', () => {
    expect(weekCompare([W('2026-11-15', 2), W('2026-11-22', 0)], 'joined', NOW)).toBeNull();
    expect(compareText(null)).toMatch('لا أسبوعان');
  });
  it('النقص والتساوي', () => {
    expect(compareText(weekCompare([W('2026-11-08', 10), W('2026-11-15', 5)], 'joined', NOW))).toBe('5، نقص 5 (50%) عن الأسبوع السابق (10)');
    expect(compareText(weekCompare([W('2026-11-08', 5), W('2026-11-15', 5)], 'joined', NOW))).toBe('5، مثل الأسبوع السابق');
  });
});

describe('weekRows', () => {
  it('يضغط الأسابيع الصفرية في الوسط ويبقي الطرفين', () => {
    const weeks = [W('a', 0), W('b', 1), W('c', 0), W('d', 0), W('e', 0), W('f', 2), W('g', 0)];
    const r = weekRows(weeks, ['joined']);
    expect(r.map((x) => x.gap ? `gap${x.gap}` : x.week)).toEqual(['g', 'f', 'gap3', 'b', 'a']);
    expect(r[2]).toMatchObject({ from: 'c', to: 'e' });
  });
  it('صفري واحد في الوسط يبقى صفًا', () => {
    expect(weekRows([W('a', 1), W('b', 0), W('c', 1)], ['joined']).map((x) => x.week)).toEqual(['c', 'b', 'a']);
  });
  it('كله صفر يبقى كما هو', () => { expect(weekRows([W('a', 0), W('b', 0)], ['joined'])).toHaveLength(2); });
  it('gapLabel', () => { expect(gapLabel(2)).toBe('أسبوعان بلا نشاط'); expect(gapLabel(3)).toBe('3 أسابيع بلا نشاط'); expect(gapLabel(11)).toBe('11 أسبوعًا بلا نشاط'); });
});

describe('maskSmall', () => {
  it('يخفي 1 و2 لمن لا يرى المشاركين فقط', () => {
    expect(maskSmall(1, true)).toBe('أقل من 3');
    expect(maskSmall(2, true)).toBe('أقل من 3');
    expect(maskSmall(0, true)).toBe('0');
    expect(maskSmall(3, true)).toBe('3');
    expect(maskSmall(2, false)).toBe('2');
  });
});

describe('المسارات والمصادر', () => {
  it('normPath', () => {
    expect(normPath('/p/3f2a1b4c-1111-2222-3333-444455556666/edit?x=1#h')).toBe('/p/:id/edit');
    expect(normPath('/order/1234567')).toBe('/order/:id');
    expect(normPath('/t/abcdef0123456789xyz')).toBe('/t/:id');
    expect(normPath('/leaders/participants')).toBe('/leaders/participants');
    expect(normPath('')).toBe('/');
  });
  it('mergePages يجمع ما صار مسارًا واحدًا', () => {
    const r = mergePages([{ site: 's', path: '/p/11111111-1111-1111-1111-111111111111', visits: 1, views: 2 }, { site: 's', path: '/p/22222222-2222-2222-2222-222222222222', visits: 2, views: 2 }, { site: 's', path: '/', visits: 5, views: 9 }]);
    expect(r).toEqual([{ site: 's', path: '/', visits: 5, views: 9 }, { site: 's', path: '/p/:id', visits: 3, views: 4 }]);
  });
  it('refHost وmergeRefs', () => {
    expect(refHost('https://www.Google.com/search?q=1')).toBe('google.com');
    expect(refHost('t.co')).toBe('t.co');
    expect(refHost('')).toBe('مباشر أو غير معروف');
    expect(refHost('مباشر')).toBe('مباشر أو غير معروف');
    expect(mergeRefs([{ label: 'www.x.com', visits: 1 }, { label: 'x.com', visits: 2 }, { label: '', visits: 1 }])).toEqual([{ label: 'x.com', visits: 3 }, { label: 'مباشر أو غير معروف', visits: 1 }]);
  });
  it('pct واسم الموقع والرابط', () => {
    expect(pct(1, 3)).toBe(33); expect(pct(1, 0)).toBe(0);
    expect(siteName('mi-home')).toBe('الموقع الرئيسي'); expect(siteName('other')).toBe('other');
    expect(pickDays('90')).toBe(90); expect(pickDays('5')).toBe(30); expect(pickDays(undefined)).toBe(30);
    expect(pickSite('mi-matrix')).toBe('mi-matrix'); expect(pickSite('<x>')).toBe('');
    expect(rangeLabel(30, '')).toBe('آخر 30 يومًا · كل المواقع'); expect(rangeLabel(7, 'mi-home')).toBe('آخر 7 أيام · الموقع الرئيسي');
  });
});
