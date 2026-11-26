import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { date, dateOnly, dateTime, dayMonth, timeOnly, weekTime } from './dates.js';

describe('صيغة التاريخ الواحدة في لوحة الإدارة', () => {
  it('ميلادي بأرقام لاتينية، والفارغ والتالف نص فارغ', () => {
    expect(date('2026-11-13T09:00:00Z')).toMatch(/13.*2026/);
    expect(date('2026-11-13T09:00:00Z')).not.toMatch(/[٠-٩]|1448/);
    expect(dateTime('2026-11-13T09:00:00Z')).toMatch(/2026/);
    expect([date(null), date(''), date('x'), dateTime(undefined), dayMonth(null), timeOnly('nope'), weekTime(''), dateOnly('')]).toEqual(['', '', '', '', '', '', '', '']);
  });
  it('اليوم المخزّن بلا وقت لا ينزاح عن يومه', () => {
    expect(dateOnly('2026-11-13')).toMatch(/13/);
    expect(dateOnly('2026-01-01')).toMatch(/2026/);
  });
  it('لا شاشة تعرّف صيغة تاريخ لنفسها: المصدر dates.js وحده', () => {
    const files = [];
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.(jsx?|js)$/.test(e.name) && !/\.test\.js$/.test(e.name) && e.name !== 'dates.js') files.push(join(dir, e.name));
    });
    walk(__dirname);
    const bad = files.filter((f) => /toLocaleDateString|toLocaleTimeString|Intl\.DateTimeFormat|new Date\([^)]*\)\.toLocaleString/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => f.replace(__dirname, ''))).toEqual([]);
  });
});

describe('relDate والأيام (مشتركة بين الشاشات)', async () => {
  const { relDate, daysAr, daysSince, riyadhFull } = await import('./dates.js');
  const now = new Date('2026-11-26T09:00:00Z'); // 12:00 بتوقيت الرياض
  it('نسبي لسبعة أيام فأقل', () => {
    expect(relDate('2026-11-26T08:59:40Z', now)).toBe('الآن');
    expect(relDate('2026-11-26T08:55:00Z', now)).toBe('قبل 5 دقائق');
    expect(relDate('2026-11-26T06:00:00Z', now)).toBe('قبل 3 ساعات');
    expect(relDate('2026-11-25T23:00:00Z', now)).toBe('قبل 10 ساعات'); // 02:00 اليوم في الرياض
    expect(relDate('2026-11-25T20:00:00Z', now)).toBe('أمس'); // 23:00 أمس في الرياض;
    expect(relDate('2026-11-25T08:00:00Z', now)).toBe('أمس');
    expect(relDate('2026-11-22T08:00:00Z', now)).toBe('قبل 4 أيام');
    expect(relDate('2026-11-19T08:00:00Z', now)).toBe('قبل 7 أيام');
  });
  it('بعد سبعة أيام: بلا سنة في السنة الجارية، وبها فيما قبلها، ولا أرقام هندية', () => {
    expect(relDate('2026-11-10T08:00:00Z', now)).toMatch(/^10 نوفمبر$/);
    expect(relDate('2025-11-10T08:00:00Z', now)).toMatch(/10.*2025/);
    expect(relDate('2025-11-10T08:00:00Z', now)).not.toMatch(/[٠-٩]/);
    expect([relDate(null), relDate('x')]).toEqual(['', '']);
  });
  it('الأيام بتقويم الرياض، والجمع العربي', () => {
    expect(daysSince('2026-11-25T20:59:00Z', now)).toBe(1); // 23:59 أمس في الرياض
    expect(daysSince('2026-11-25T21:01:00Z', now)).toBe(0); // 00:01 اليوم
    expect([1, 2, 3, 10, 11, 100].map(daysAr)).toEqual(['يوم واحد', 'يومين', '3 أيام', '10 أيام', '11 يومًا', '100 يومًا']);
    expect(riyadhFull('2026-11-26T09:00:00Z')).toMatch(/26 نوفمبر 2026/);
  });
});
