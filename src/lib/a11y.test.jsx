import React, { useRef, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pressable, useDialog } from './a11y';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('pressable', () => {
  it('يستجيب لـ Enter والمسافة ويتجاهل غيرهما', () => {
    const fn = vi.fn();
    const p = pressable(fn);
    const ev = (key) => ({ key, preventDefault: () => {} });
    p.onKeyDown(ev('Enter')); p.onKeyDown(ev(' ')); p.onKeyDown(ev('a'));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(p.role).toBe('button');
    expect(p.tabIndex).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// useDialog: نوافذ المصفوفة (العملية، التأكيد، التحليل الديموغرافي)
// ════════════════════════════════════════════════════════════════
// كان التركيز يبقى على body عند الفتح، وTab يخرج إلى الصفحة خلف النافذة،
// وEsc يعيد التركيز إلى body لا إلى ما فتحها.

function Dialog({ name, onClose, autofocus }) {
  const box = useRef(null);
  useDialog(box, onClose);
  return (
    <div ref={box} role="dialog" aria-label={name} tabIndex={-1}>
      <button id={`${name}-a`}>أ</button>
      <button id={`${name}-b`} data-autofocus={autofocus || undefined}>ب</button>
      <button id={`${name}-c`}>ج</button>
    </div>
  );
}

let root;
function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.appendChild(opener);
  root = createRoot(container);
  return opener;
}
const render = (el) => act(() => { root.render(el); });
const key = (k, shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  act(() => { document.activeElement.dispatchEvent(e); });
  return e;
};
const active = () => document.activeElement?.id;

describe('useDialog', () => {
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('ينقل التركيز إلى أول عنصر، ويحصر Tab داخل النافذة في الاتجاهين', () => {
    const opener = mount();
    opener.focus();
    render(<Dialog name="d" onClose={() => {}} />);
    expect(active()).toBe('d-a');
    document.getElementById('d-c').focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(active()).toBe('d-a');
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(active()).toBe('d-c');
    // تركيز هارب خارج النافذة يعود إليها مع أول Tab
    opener.focus();
    key('Tab');
    expect(active()).toBe('d-a');
  });

  it('يبدأ بـ [data-autofocus] إن وُجد', () => {
    mount();
    render(<Dialog name="d" onClose={() => {}} autofocus />);
    expect(active()).toBe('d-b');
  });

  it('Esc وTab للنافذة العليا وحدها، والتركيز يعود إلى ما فتح كل نافذة', () => {
    const opener = mount();
    const closeLow = vi.fn();
    const closeTop = vi.fn();
    opener.focus();
    render(<Dialog name="low" onClose={closeLow} />);
    document.getElementById('low-c').focus();
    render(<><Dialog name="low" onClose={closeLow} /><Dialog name="top" onClose={closeTop} /></>);
    expect(active()).toBe('top-a');
    key('Escape');
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeLow).not.toHaveBeenCalled();
    // السفلى لا تسحب التركيز إليها وتأكيد فوقها
    document.getElementById('top-c').focus();
    key('Tab');
    expect(active()).toBe('top-a');

    render(<Dialog name="low" onClose={closeLow} />);
    expect(active()).toBe('low-c');
    key('Escape');
    expect(closeLow).toHaveBeenCalledTimes(1);
    render(null);
    expect(active()).toBe('opener');
  });
});

// نافذة العملية (الجولة أ، visitor-2): التركيز على النافذة نفسها فيُقرأ اسم العملية، ويعود إليها إن عُرضت
// عملية أخرى فيها، وإن زال ما فتحها من الصفحة يذهب التركيز عند الإغلاق إلى البديل لا إلى أول الصفحة.
describe('useDialog: النافذة نفسها والمحتوى المتغير والبديل', () => {
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });
  function Proc({ id, fallback }) {
    const box = useRef(null);
    useDialog(box, () => {}, { self: true, key: id, fallback });
    return <div ref={box} role="dialog" tabIndex={-1} data-id={id}><button id="x">✕</button><input id="date" type="date" /></div>;
  }

  it('self: التركيز على النافذة عند الفتح وعند تغيّر محتواها، ويعود إلى ما فتحها عند الإغلاق', () => {
    const opener = mount();
    opener.focus();
    render(<Proc id="a" />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);
    document.getElementById('date').focus();
    render(<Proc id="b" />);
    expect(document.activeElement).toBe(dialog);
    render(null);
    expect(active()).toBe('opener');
  });

  it('إن زال ما فتح النافذة يذهب التركيز إلى البديل', () => {
    const opener = mount();
    const cell = document.createElement('div');
    cell.tabIndex = 0; cell.id = 'cell';
    document.body.appendChild(cell);
    opener.focus();
    render(<Proc id="a" fallback={() => cell} />);
    opener.remove();   // شريحة «ينقصه موعد» تختفي بعد حفظ موعدها
    render(null);
    expect(active()).toBe('cell');
  });
});

// لوحة «إجابات القياس» في بوابة الخبير (2026-11-11): آخر عناصرها زر للجوال وحده (display:none على الحاسوب)
// وأقسام مطوية بـhidden. كانت تدخل قائمة Tab ولا يقع عليها التركيز، فلا يدور Tab من آخر ظاهر ويخرج من النافذة.
describe('useDialog: العناصر المخفية خارج دورة Tab', () => {
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });
  function Panel() {
    const box = useRef(null);
    useDialog(box, () => {});
    return (
      <div ref={box} role="dialog" tabIndex={-1}>
        <button id="first">✕</button>
        <button id="last">آخر ظاهر</button>
        <ol hidden><li><button id="in-hidden">داخل قسم مطوي</button></li></ol>
        <button id="mobile-only" style={{ display: 'none' }}>للجوال وحده</button>
      </div>
    );
  }
  it('Tab من آخر عنصر ظاهر يعود إلى الأول، وShift+Tab من الأول إلى آخر ظاهر', () => {
    mount();
    render(<Panel />);
    expect(active()).toBe('first');
    document.getElementById('last').focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(active()).toBe('first');
    key('Tab', true);
    expect(active()).toBe('last');
  });
});
