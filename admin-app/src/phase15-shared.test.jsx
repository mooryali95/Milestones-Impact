// @vitest-environment jsdom
// المرحلة 15 من تصور الشاشات الخمس: المشترك (ExportButton عند الصفر، firstNonEmpty، الأسلوب الموحد لحقول FilterBar،
// Missing وMove، NO_TITLE وlevelFrom)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportButton, { EXPORT_EMPTY, exportLabel } from './ExportButton.jsx';
import FilterBar, { useFilters } from './FilterBar.jsx';
import { activeChips, firstNonEmpty, startState, startWith } from './filters.js';
import { Missing, MISSING_SR, Move, moveKeys, moveTitle } from './ui.jsx';
import { levelFrom, NO_TITLE } from '../../supabase/functions/leaders-api/labels.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); sessionStorage.clear(); window.location.hash = '#/leaders/x'; });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el) => act(() => root.render(el));
const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

describe('ExportButton عند الصفر', () => {
  it('صفر في العرض: معطل بسببه في title، وبلا «(0)»', () => {
    expect(exportLabel({ label: 'تصدير Excel', all: 5, filtered: 0 })).toEqual({ text: 'تصدير Excel', empty: true });
    expect(exportLabel({ label: 'تصدير Excel', all: 0, filtered: 0 })).toEqual({ text: 'تصدير Excel', empty: true });
    expect(exportLabel({ label: 'تصدير Excel', all: 5, filtered: 2 })).toEqual({ text: 'تصدير Excel (2)', empty: false });
    expect(exportLabel({ label: 'تصدير Excel', all: 5, filtered: 5 })).toEqual({ text: 'تصدير Excel', empty: false });
    expect(exportLabel({ label: 'تصدير Excel', all: 5, filtered: 0, selected: 3 })).toEqual({ text: 'تصدير Excel (3 محدد)', empty: false });
    render(<ExportButton scope="t" meta={{ kind: 'X', title: 't', file: 'f' }} columns={[]} all={[1, 2]} filtered={[]} />);
    const b = host.querySelector('button');
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.title).toBe(EXPORT_EMPTY);
    expect(b.querySelector('.sr-only').textContent).toContain(EXPORT_EMPTY);
    act(() => b.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(b.textContent).not.toContain('(0)');
    render(<ExportButton scope="t" meta={{ kind: 'X', title: 't', file: 'f' }} columns={[]} all={[1, 2]} filtered={[1]} />);
    expect(host.querySelector('button').disabled).toBe(false);
    expect(host.querySelector('button').title).toBe('');
  });
});

describe('firstNonEmpty والعرض الآلي', () => {
  const P = [{ key: 'attention', label: 'ينتظرني' }, { key: 'open', label: 'مفتوحة' }, { key: 'done', label: 'منتهية' }];
  it('المفضل إن كان فيه شيء، وإلا أول غير فارغ، وإلا المفضل؛ وnull قبل تحميل العدادات', () => {
    expect(firstNonEmpty(P, { attention: 2, open: 3, done: 0 }, 'attention')).toBe('attention');
    expect(firstNonEmpty(P, { attention: 0, open: 0, done: 4 }, 'attention')).toBe('done');
    expect(firstNonEmpty(P, { attention: 0, open: 0, done: 0 }, 'attention')).toBe('attention');
    expect(firstNonEmpty(P, {}, 'attention')).toBeNull();
    expect(firstNonEmpty(P, { attention: 0 }, 'attention')).toBeNull();
  });
  it('startWith يسمي المصدر: الرابط والتنقل والمحفوظ صريحة، والافتراضي آلي', () => {
    const keys = ['q', 'view'];
    expect(startWith(keys, { fromUrl: 'view=attention', defaults: { view: 'open' } })).toMatchObject({ from: 'url', viewIsAuto: false, state: { view: 'attention' } });
    expect(startWith(keys, { initial: { view: 'done' } })).toMatchObject({ from: 'initial', viewIsAuto: false });
    expect(startWith(keys, { kept: { q: '', view: '' }, defaults: { view: 'open' } })).toMatchObject({ from: 'kept', viewIsAuto: false, state: { view: '' } });
    expect(startWith(keys, { kept: { q: 'س' }, defaults: { view: 'open' } })).toMatchObject({ from: 'kept', viewIsAuto: true, state: { q: 'س', view: 'open' } });
    expect(startWith(keys, { defaults: { view: 'open' } })).toMatchObject({ from: 'defaults', viewIsAuto: true });
    expect(startState(keys, { defaults: { view: 'open' } })).toEqual({ q: '', view: 'open' });
  });

  function Screen({ counts }) {
    const [f, set, clear, replace, auto] = useFilters(['q', 'view'], {}, { scope: 'p15', defaults: { view: 'attention' }, autoView: { presets: P, counts } });
    return <FilterBar scope="p15" state={f} set={set} clear={clear} replace={replace} presets={P} counts={counts} shown={0} total={0} noun="طلب" auto={auto} autoNote="لا شيء يحتاج تدخلك الآن" />;
  }
  const pressed = () => host.querySelector('.flt-preset[aria-pressed="true"]')?.textContent || '';
  it('الافتراضي الفارغ يُستبدل بأول عرض غير فارغ، ويُعلن، ولا يُكتب في الرابط', () => {
    render(<Screen counts={{}} />);
    expect(pressed()).toMatch(/^ينتظرني/);
    render(<Screen counts={{ attention: 0, open: 2, done: 1 }} />);
    expect(pressed()).toMatch(/^مفتوحة/);
    const note = host.querySelector('.flt-auto');
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toBe('لا شيء يحتاج تدخلك الآن، فيُعرض «مفتوحة».');
    expect(window.location.hash).not.toContain('view=');
    expect(JSON.parse(sessionStorage.getItem('mi_admin_flt_p15')).view).toBeUndefined();
  });
  it('لا قفز ثانٍ بعد أن تتغير العدادات، والاختيار الصريح ينهي الآلي ويُكتب في الرابط', () => {
    render(<Screen counts={{ attention: 0, open: 2, done: 1 }} />);
    render(<Screen counts={{ attention: 0, open: 0, done: 1 }} />);
    expect(pressed()).toMatch(/^مفتوحة/);
    act(() => host.querySelectorAll('.flt-preset')[2].click());
    expect(pressed()).toMatch(/^منتهية/);
    expect(host.querySelector('.flt-auto').textContent).toBe('');
    expect(window.location.hash).toContain('view=done');
  });
  it('عرض صريح في الرابط يُحترم ولو كان فارغًا', () => {
    window.location.hash = '#/leaders/x?view=attention';
    render(<Screen counts={{ attention: 0, open: 2, done: 1 }} />);
    expect(pressed()).toMatch(/^ينتظرني/);
    expect(host.querySelector('.flt-auto').textContent).toBe('');
  });
  it('الشاشات التي لا تطلب autoView لا يتغير سلوكها', () => {
    function Plain() {
      const [f, set, clear, replace, auto] = useFilters(['view'], {}, { defaults: { view: 'attention' } });
      return <FilterBar scope="pl" state={f} set={set} clear={clear} replace={replace} presets={P} counts={{ attention: 0, open: 3, done: 0 }} shown={0} total={0} noun="طلب" auto={auto} />;
    }
    render(<Plain />);
    expect(pressed()).toMatch(/^ينتظرني/);
    expect(window.location.hash).toContain('view=attention');
  });
});

describe('الأسلوب الموحد لحقول FilterBar', () => {
  it('الحقل المطبق يغير لون الخلفية وحده فلا يسقط سهم القائمة، والبحث والحقول بقاعدة واحدة', () => {
    const css = src('admin.css');
    expect(css).not.toMatch(/\.filter-select\.on\s*\{[^}]*background:/);
    expect(css).toMatch(/\.flt \.search-input, \.flt \.filter-select \{[^}]*min-block-size: 40px/);
  });
  it('القيمة المطبقة رقاقة قابلة للإزالة، باسم الحقل المفرد إن عُرّف chip', () => {
    const fields = [{ key: 'org', label: 'الجهات', chip: 'الجهة', options: [['n', 'جهة النور']], get: (x) => x }];
    expect(activeChips({ org: 'n' }, fields)).toEqual([{ key: 'org', label: 'الجهة: جهة النور' }]);
    const set = vi.fn();
    render(<FilterBar scope="u" state={{ q: '', org: 'n' }} set={set} clear={() => {}} replace={() => {}} fields={fields} shown={1} total={2} noun="وثيقة" />);
    const sel = host.querySelector('select.filter-select');
    expect(sel.className).toContain(' on');
    const x = host.querySelector('.flt-chip button');
    expect(x.getAttribute('aria-label')).toBe('إزالة الجهة: جهة النور');
    act(() => x.click());
    expect(set).toHaveBeenCalledWith({ org: '' });
  });
});

describe('Missing', () => {
  it('ثلاث حالات: يحمّل، ولا قيمة بسبب، ولم يحدث بعد؛ وبلا «·»', () => {
    render(<Missing state="loading" />);
    expect(host.querySelector('.la-missing').getAttribute('aria-busy')).toBe('true');
    expect(host.textContent).toBe('جارٍ التحميل');
    render(<Missing reason="لم تُسلَّم" />);
    const m = host.querySelector('.la-missing');
    expect(m.title).toBe('لم تُسلَّم');
    expect(m.querySelector('.sr-only').textContent).toBe(`${MISSING_SR}: لم تُسلَّم`);
    render(<Missing state="later" text="لم يُقيَّم بعد" />);
    expect(host.textContent).toBe('لم يُقيَّم بعد');
    expect(src('ui.jsx').match(/export function Missing[\s\S]*?\n}\n/)[0]).not.toContain('·');
  });
});

describe('Move', () => {
  it('يظهر لمن يملك canWrite فقط، وهدفه 32px، واسمه المقروء مطابق للـtitle المرئي ويعلن الموضع', async () => {
    render(<Move name="الباب الأول" canWrite={false} onMove={() => 1} />);
    expect(host.querySelector('button')).toBeNull();
    const onMove = vi.fn(async (d) => (d < 0 ? 1 : 3));
    render(<Move name="الباب الأول" canWrite onMove={onMove} total={4} first />);
    const [up, down] = host.querySelectorAll('button');
    expect(up.disabled).toBe(false);
    expect(up.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { up.click(); });
    expect(onMove).not.toHaveBeenCalled();
    expect(down.title).toBe('انقل الباب الأول لأسفل');
    expect(down.getAttribute('aria-label')).toBeNull();
    expect(down.querySelector('.sr-only').textContent).toBe(down.title);
    await act(async () => { down.click(); });
    expect(onMove).toHaveBeenCalledWith(1);
    expect(host.querySelector('[aria-live="polite"]').textContent).toBe('الباب الأول صار في الموضع 3 من 4');
    expect(src('leaders-admin.css')).toMatch(/\.la-move-btn \{[^}]*min-inline-size: 32px; min-block-size: 32px/);
    expect(moveTitle('الباب X', -1)).toBe('انقل الباب X لأعلى');
  });
  it('Alt مع الأسهم على الصف', () => {
    const go = vi.fn();
    const h = moveKeys(go);
    const ev = (key, altKey) => ({ key, altKey, preventDefault: vi.fn() });
    h(ev('ArrowUp', false));
    expect(go).not.toHaveBeenCalled();
    h(ev('ArrowUp', true)); h(ev('ArrowDown', true));
    expect(go.mock.calls).toEqual([[-1], [1]]);
  });
  it('Alt مع السهم على الصف يمر بالمعلن نفسه، والفشل يمسح الإعلان', async () => {
    const keys = { current: null };
    let fail = false;
    const onMove = vi.fn(async () => { if (fail) throw new Error('x'); return 2; });
    render(<Move name="الباب الأول" canWrite onMove={onMove} total={4} keysRef={keys} />);
    const h = moveKeys(keys);
    await act(async () => { h({ key: 'ArrowDown', altKey: true, preventDefault: () => {} }); });
    expect(host.querySelector('[aria-live="polite"]').textContent).toBe('الباب الأول صار في الموضع 2 من 4');
    fail = true;
    await act(async () => { h({ key: 'ArrowUp', altKey: true, preventDefault: () => {} }); });
    expect(host.querySelector('[aria-live="polite"]').textContent).toBe('');
  });
});

describe('NO_TITLE وlevelFrom', () => {
  it('صياغة واحدة للمستوى', () => {
    expect(levelFrom('beginner')).toBe('للمستويات كلها');
    expect(levelFrom('')).toBe('للمستويات كلها');
    expect(levelFrom(undefined)).toBe('للمستويات كلها');
    expect(levelFrom('intermediate')).toBe('للمستوى المتوسط فأعلى');
    expect(levelFrom('advanced')).toBe('للمستوى الاحترافي');
  });
  it('NO_TITLE', () => expect(NO_TITLE).toBe('لم تُسمَّ بعد'));
});
