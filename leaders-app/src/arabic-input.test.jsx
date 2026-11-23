// حقل البريد يرفض الحرف العربي بتنبيه، والأرقام العربية تتحول إلى إنجليزية في كل حقل بلا تنبيه
import React, { useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import EmailInput, { EMAIL_ARABIC_HINT, stripArabic } from '../../shared/ui/EmailInput.jsx';
import { installLatinDigits, latinDigits } from '../../shared/ui/latin-digits.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const setNative = (el, v) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
let root, host, off;
afterEach(() => { act(() => root?.unmount()); host?.remove(); off?.(); off = null; });
const mount = (ui) => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(ui)); return host; };
const type = (el, v) => act(() => { setNative(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });

describe('الأرقام العربية', () => {
  it('تتحول كلها', () => expect(latinDigits('٠٥٠١٢٣٤٥٦٧٨٩ ۰۹')).toBe('050123456789 09'));
  it('في حقل عادي تصل الشاشة إنجليزية بلا تنبيه', () => {
    off = installLatinDigits(document);
    let seen = '';
    function T() { const [v, setV] = useState(''); seen = v; return <input value={v} onChange={(e) => setV(e.target.value)} />; }
    const h = mount(<T />);
    type(h.querySelector('input'), '٠٥٥');
    expect(seen).toBe('055');
    expect(h.querySelector('input').value).toBe('055');
  });
});

describe('حقل البريد', () => {
  function Box() { const [v, setV] = useState(''); return <EmailInput value={v} onChange={(e) => setV(e.target.value)} />; }
  it('يحذف العربي ويظهر التنبيه ثم يختفي', () => {
    const h = mount(<Box />);
    const el = h.querySelector('input');
    type(el, 'ؤشةث');
    expect(el.value).toBe('');
    expect(h.textContent).toContain(EMAIL_ARABIC_HINT);
    type(el, 'a');
    expect(h.textContent).not.toContain(EMAIL_ARABIC_HINT);
  });
  it('يحوّل الأرقام بصمت', () => {
    const h = mount(<Box />);
    const el = h.querySelector('input');
    type(el, 'ali٢٠@x.com');
    expect(el.value).toBe('ali20@x.com');
    expect(h.textContent).not.toContain(EMAIL_ARABIC_HINT);
  });
  it('stripArabic', () => expect(stripArabic('aبb')).toBe('ab'));
});
