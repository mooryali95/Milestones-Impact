import { describe, expect, it } from 'vitest';
import { activeChips, applyFilters, decodeState, encodeState, inPeriod, isFiltered, nextSort, presetCounts, sortRows, startState } from './filters.js';

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

describe('الفرز بالأعمدة', () => {
  const rows = [{ n: 'منى', h: 4, at: '2026-10-02' }, { n: 'أحمد', h: null, at: '2026-10-09' }, { n: 'سارة', h: 12, at: '' }, { n: 'خالد', h: 4, at: '2026-09-01' }];
  const cols = { n: (x) => x.n, h: (x) => x.h, at: (x) => x.at };
  it('نقرة تصاعدي، ثم تنازلي، ثم ترتيب الخادم', () => {
    expect([nextSort('', 'n'), nextSort('n', 'n'), nextSort('-n', 'n'), nextSort('h', 'n')]).toEqual(['n', '-n', '', 'n']);
  });
  it('النص بترتيب العربية، والرقم رقمًا لا نصًّا', () => {
    expect(sortRows(rows, cols, 'n').map((x) => x.n)).toEqual(['أحمد', 'خالد', 'سارة', 'منى']);
    expect(sortRows(rows, cols, '-h').map((x) => x.h)).toEqual([12, 4, 4, null]);
  });
  it('الفارغ آخرًا في الاتجاهين، والمتساوي يحفظ ترتيب الخادم', () => {
    expect(sortRows(rows, cols, 'at').map((x) => x.n)).toEqual(['خالد', 'منى', 'أحمد', 'سارة']);
    expect(sortRows(rows, cols, '-at').map((x) => x.n)).toEqual(['أحمد', 'منى', 'خالد', 'سارة']);
    expect(sortRows(rows, cols, 'h').map((x) => x.n)).toEqual(['منى', 'خالد', 'سارة', 'أحمد']);
  });
  it('بلا فرز أو بعمود مجهول: القائمة كما هي، والأصل لا يتغير', () => {
    expect(sortRows(rows, cols, '')).toBe(rows);
    expect(sortRows(rows, cols, 'zzz')).toBe(rows);
    sortRows(rows, cols, 'n');
    expect(rows[0].n).toBe('منى');
  });
  it('الفرز ليس فلترة: لا يُظهر «مسح الكل»', () => {
    expect(isFiltered({ q: '', sort: '-n' })).toBe(false);
  });
});

describe('ما تبدأ به الشاشة', () => {
  const keys = ['q', 'status', 'sort'];
  it('العنوان أولًا، ثم ما جاء به التنقل، ثم ما تُرك آخر مرة، ثم الافتراضي', () => {
    const kept = { q: 'سارة', status: 'placed', sort: 'n' };
    expect(startState(keys, { fromUrl: 'status=enrolled', initial: { status: 'x' }, kept, defaults: { status: 'd' } }).status).toBe('enrolled');
    expect(startState(keys, { initial: { status: 'x' }, kept, defaults: { status: 'd' } })).toEqual({ q: '', status: 'x', sort: '' });
    expect(startState(keys, { kept, defaults: { status: 'd' } })).toEqual(kept);
    expect(startState(keys, { defaults: { status: 'd' } })).toEqual({ q: '', status: 'd', sort: '' });
  });
  it('من مسح الفلاتر ثم عاد يجدها ممسوحة، لا الافتراضي', () => {
    expect(startState(keys, { kept: { q: '', status: '', sort: '' }, defaults: { status: 'd' } }).status).toBe('');
  });
  it('مفتاح محفوظ لم يعد من مفاتيح الشاشة يُهمل', () => {
    expect(startState(keys, { kept: { old: '1', q: 'a' } })).toEqual({ q: 'a', status: '', sort: '' });
  });
});
