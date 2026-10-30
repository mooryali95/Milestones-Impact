import { describe, expect, it } from 'vitest';
import { activeChips, applyFilters, decodeState, encodeState, inPeriod, isFiltered, presetCounts } from './filters.js';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const day = (n) => new Date(NOW - n * 864e5).toISOString();
const people = [
  { id: 1, name: 'سارة', status: 'placed', org: 'a', tags: ['x', 'y'], seen: day(2) },
  { id: 2, name: 'خالد', status: 'enrolled', org: 'b', tags: ['y'], seen: day(40) },
  { id: 3, name: 'منى', status: 'placed', org: '', tags: [], seen: null },
];
const fields = [
  { key: 'status', label: 'الحالة', get: (p) => p.status, options: [['placed', 'معتمد'], ['enrolled', 'في البرنامج']] },
  { key: 'org', label: 'الجهة', get: (p) => p.org || 'none' },
  { key: 'tag', label: 'الوسم', get: (p) => p.tags },
  { key: 'seen', label: 'آخر دخول', type: 'period', get: (p) => p.seen },
];
const presets = [{ key: 'orphan', label: 'بلا جهة', test: (p) => !p.org }];
const spec = { fields, presets, text: (p) => p.name };
const ids = (state) => applyFilters(people, spec, state, NOW).map((p) => p.id);

describe('الفلترة الموحّدة', () => {
  it('بلا فلاتر يمر الجميع', () => expect(ids({})).toEqual([1, 2, 3]));
  it('الحقول تتراكب (و)', () => {
    expect(ids({ status: 'placed' })).toEqual([1, 3]);
    expect(ids({ status: 'placed', org: 'none' })).toEqual([3]);
  });
  it('الحقل متعدد القيم يطابق إن احتوى القيمة', () => expect(ids({ tag: 'y' })).toEqual([1, 2]));
  it('الفترات الزمنية', () => {
    expect(ids({ seen: '7' })).toEqual([1]);
    expect(ids({ seen: 'older30' })).toEqual([2]);
    expect(ids({ seen: 'never' })).toEqual([3]);
    expect(inPeriod(null, '30', NOW)).toBe(false);
  });
  it('العرض السريع والبحث', () => {
    expect(ids({ view: 'orphan' })).toEqual([3]);
    expect(ids({ q: 'سار' })).toEqual([1]);
    expect(presetCounts(people, presets, NOW)).toEqual({ orphan: 1 });
  });
  it('الرقائق بأسماء القيم', () => {
    expect(activeChips({ status: 'placed', seen: '7', org: '' }, fields)).toEqual([
      { key: 'status', label: 'الحالة: معتمد' }, { key: 'seen', label: 'آخر دخول: آخر 7 أيام' }]);
  });
  it('الحالة تُحفظ في العنوان وتعود كما هي', () => {
    const st = { q: 'سارة أحمد', status: 'placed', org: '', view: 'orphan' };
    const back = decodeState(encodeState(st), ['q', 'status', 'org', 'view']);
    expect(back).toEqual(st);
    expect(encodeState({ a: '', b: null })).toBe('');
    expect(isFiltered(back)).toBe(true);
    expect(isFiltered({ a: '' })).toBe(false);
  });
});
