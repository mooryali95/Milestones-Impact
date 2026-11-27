// @vitest-environment jsdom
// المرحلة 9 من تصور تطبيق القادة: المشاركون (trackName، «بانتظار»، الكثافة، التقدم بـMeter، حسابات الاختبار،
// التحديد خارج القائمة، افتراضات التصدير، roving tabindex)، ومعها الاختبار المؤجل من المرحلة 6: التركيز بعد «امسح الكل»
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, trackName } from '../../supabase/functions/leaders-api/labels.js';
import FilterBar from './FilterBar.jsx';
import { ExportDialog } from './ExportButton.jsx';
import { chosenColumns } from './exports.js';
import { UIProvider } from './ui.jsx';
import { DENSITY_KEY, pickedOutside, readDensity, rovingNext, TEST_VIEW, visibleBase, Waiting, Where, writeDensity } from './screens/Participants.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const render = (el) => act(() => root.render(el));
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

describe('trackName: اسم المسار من مصدر واحد', () => {
  it('الاسم من الخادم أولًا، وإلا من مستويات الأطر بترتيبها، والرمز غير الصالح كما هو', () => {
    expect(trackName('M1I2L3', { M1I2L3: 'القائد المنفذ' })).toBe('القائد المنفذ');
    expect(trackName('M1I2L3')).toBe(LEVELS.map((l) => l.title).join(' · '));
    expect(trackName('M3I3L3', {})).toBe([LEVELS[2].title, LEVELS[2].title, LEVELS[2].title].join(' · '));
    expect(trackName('X9')).toBe('X9');
    expect(trackName('')).toBe('');
    expect(trackName(null)).toBe('');
  });
  it('الخلية والمرشح والتصدير ولوحة الجهة كلها بـtrackName، والرمز في title وsr-only وعمود ثانٍ', () => {
    const p = src('screens/Participants.jsx');
    expect(p).toMatch(/options: tracks\.map\(\(k\) => \[k, tn\(k\)\]\)/);
    expect(p).toMatch(/title=\{code\}>\{tn\(code\)\}<span className="sr-only"> \(\{code\}\)<\/span>/);
    expect(p).toMatch(/key: 'track_code', label: 'رمز المسار'/);
    expect(p).toMatch(/tk\(p\), tn\(tk\(p\)\)\]\.join/);   // البحث بالرمز والاسم
    const o = src('screens/Orgs.jsx');
    expect(o).toMatch(/\[k, trackName\(k, tt\)\]/);
    expect(o).toMatch(/key: 'track', label: 'رمز المسار'/);
    for (const f of [p, o]) expect(f).not.toMatch(/dangerouslySetInnerHTML/);
  });
});

describe('«بانتظار» الفارغة', () => {
  it('شرطة خافتة مخفية عن قارئ الشاشة، ونص sr-only «لا شيء»', () => {
    render(<Waiting w={{ who: null }} />);
    expect(host.querySelector('[aria-hidden="true"]').textContent).toBe('—');
    expect(host.querySelector('.sr-only').textContent).toBe('لا شيء');
    render(<Waiting w={{ who: 'admin', n: 2, text: 'x' }} />);
    expect(host.textContent).toBe('الإدارة · 2');
  });
  it('العمود يُخفى إن لم ينتظر أحد من الظاهرين، والفرز به باقٍ في SORTS', () => {
    const p = src('screens/Participants.jsx');
    expect(p).toMatch(/const showWaiting = shown\.some\(\(p\) => p\.waiting\?\.who\)/);
    expect(p).toMatch(/\{showWaiting && <SortTh k="waiting"/);
    expect(p).toMatch(/waiting: \(p\) =>/);
  });
});

describe('التقدم بمكون Meter', () => {
  it('من يجيب على القياس يرى Meter بمقامه بدل progress', () => {
    render(<Where o={{ step: 'assessment_doing', label: 'يجيب', total: 30, answered: 12, remaining: 'بقي 18' }} />);
    const m = host.querySelector('[role="meter"]');
    expect(m.getAttribute('aria-valuenow')).toBe('12');
    expect(m.getAttribute('aria-valuemax')).toBe('30');
    expect(host.querySelector('progress')).toBeNull();
  });
});

describe('الكثافة في localStorage داخل try/catch', () => {
  it('تُحفظ وتُقرأ، والتخزين المحجوب لا يكسر الشاشة', () => {
    writeDensity('compact');
    expect(localStorage.getItem(DENSITY_KEY)).toBe('compact');
    expect(readDensity()).toBe('compact');
    writeDensity('comfy');
    expect(readDensity()).toBe('comfy');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readDensity()).toBe('comfy');
    expect(() => writeDensity('compact')).not.toThrow();
  });
});

describe('حسابات الاختبار مخفية افتراضيًا', () => {
  const list = [{ id: 'a' }, { id: 'b', is_test: true }, { id: 'c', is_test: false }];
  it('القائمة بلاها إلا في عرض «حسابات اختبار»', () => {
    expect(visibleBase(list, '').map((p) => p.id)).toEqual(['a', 'c']);
    expect(visibleBase(list, 'approval').map((p) => p.id)).toEqual(['a', 'c']);
    expect(visibleBase(list, TEST_VIEW).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(src('screens/Participants.jsx')).toMatch(/key: TEST_VIEW, label: 'حسابات اختبار', test: \(p\) => p\.is_test === true/);
  });
});

describe('التحديد خارج القائمة وroving tabindex', () => {
  it('pickedOutside يعد المحددين غير الظاهرين', () => {
    expect(pickedOutside(new Set(['a', 'b', 'x']), [{ id: 'a' }, { id: 'b' }])).toBe(1);
    expect(pickedOutside(new Set(), [{ id: 'a' }])).toBe(0);
    const p = src('screens/Participants.jsx');
    expect(p).toMatch(/اقصر على الظاهر/);
    expect(p).toMatch(/منهم \$\{outside\} خارج القائمة الظاهرة/);   // التأكيد يذكر العدد الفعلي
  });
  it('الأسهم وHome وEnd داخل الحدود، وغيرها لا شيء', () => {
    expect(rovingNext('ArrowDown', 0, 3)).toBe(1);
    expect(rovingNext('ArrowDown', 2, 3)).toBe(2);
    expect(rovingNext('ArrowUp', 0, 3)).toBe(0);
    expect(rovingNext('Home', 2, 3)).toBe(0);
    expect(rovingNext('End', 0, 3)).toBe(2);
    expect(rovingNext('a', 0, 3)).toBeNull();
    expect(rovingNext('ArrowDown', 0, 0)).toBeNull();
    expect(src('screens/Participants.jsx')).toMatch(/tabIndex=\{i === roveAt \? 0 : -1\}/);
  });
});

describe('افتراضات التصدير', () => {
  const columns = [
    { key: 'name', label: 'الاسم', get: (p) => p.n }, { key: 'email', label: 'البريد', sensitive: true, get: (p) => p.e },
    { key: 'phone', label: 'الجوال', sensitive: true, get: (p) => p.ph },
  ];
  it('البريد والجوال غير مختارين افتراضيًا', () => {
    expect(chosenColumns(columns, null).map((c) => c.key)).toEqual(['name']);
    const p = src('screens/Participants.jsx');
    expect(p).toMatch(/key: 'email', label: 'البريد', width: 30, sensitive: true/);
    expect(p).toMatch(/key: 'phone', label: 'الجوال', width: 16, sensitive: true/);
  });
  it('«تضمين حسابات الاختبار» مطفأ، وتشغيله يعيدها إلى العدد', () => {
    localStorage.clear();
    const all = [{ id: 1, n: 'أ' }, { id: 2, n: 'ب', is_test: true }];
    render(<UIProvider><ExportDialog scope="t9" meta={{ title: 'ت', file: 'x', kind: 'K' }} columns={columns} sets={{ selected: [], filtered: all, all }} noun="مشارك" isTest={(r) => r.is_test === true} onClose={() => {}} /></UIProvider>);
    const box = [...document.querySelectorAll('.exp-test input')][0];
    expect(box.checked).toBe(false);
    const submit = () => document.querySelector('.exp-form button[type="submit"]').textContent;
    expect(submit()).toBe('صدّر 1 مشارك');
    const cols = [...document.querySelectorAll('.exp-cols input')].map((i) => i.checked);
    expect(cols).toEqual([true, false, false]);
    act(() => box.click());
    expect(submit()).toBe('صدّر 2 مشارك');
  });
});

describe('FilterBar: «امسح الكل» يعيد التركيز إلى البحث (المؤجل من المرحلة 6)', () => {
  it('بعد المسح يختفي الزر والتركيز على حقل البحث', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
    function Harness() {
      const [s, setS] = useState({ q: 'سارة', view: '' });
      return <FilterBar scope="t9f" state={s} set={(p) => setS((x) => ({ ...x, ...p }))} clear={() => setS({ q: '', view: '' })} replace={setS} shown={1} total={5} noun="عنصر" />;
    }
    render(<Harness />);
    const btn = host.querySelector('.flt-chip-clear');
    btn.focus();
    await act(async () => { btn.click(); });
    expect(host.querySelector('.flt-chip-clear')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
  });
});
