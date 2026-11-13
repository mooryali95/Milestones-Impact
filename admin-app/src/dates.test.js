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
