// نص بحث يشبه رقمًا (جوال) لا يصل إلى عنوان الصفحة ولا إلى تخزين المتصفح، من الخانة الحقيقية (FilterBar وuseFilters).
// تصور تشغيل الدفعة 2026-11-19، 2.7: كان الرقم يبقى في سجل المتصفح ويُنسخ مع الرابط
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import FilterBar, { useFilters } from './FilterBar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
function Screen() {
  const [f, setF, clearF, replaceF] = useFilters(['q', 'status'], {}, { scope: 'url-test' });
  return <FilterBar scope="url-test" state={f} set={setF} clear={clearF} replace={replaceF} fields={[{ key: 'status', label: 'الحالات', get: () => '', options: [['placed', 'معتمد']] }]} shown={0} total={0} noun="مشارك" />;
}
const mount = () => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); act(() => root.render(<Screen />)); };
const type = (value) => {
  const input = host.querySelector('input[type="search"]');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  return input;
};
const stored = () => [...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i))).join('|')
  + [...Array(localStorage.length)].map((_, i) => localStorage.getItem(localStorage.key(i))).join('|');

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); window.location.hash = '#/leaders/participants'; });
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; });

describe('خانة البحث وعنوان الصفحة', () => {
  it('الاسم يُكتب في العنوان كما كان', () => {
    mount();
    type('سارة');
    expect(decodeURIComponent(window.location.hash)).toBe('#/leaders/participants?q=سارة');
  });

  it('الجوال بكل صيغه يبقى في الخانة: لا في العنوان ولا في التخزين، حرفًا حرفًا أثناء الكتابة', () => {
    mount();
    for (const phone of ['0551234567', '+966 55 123 4567', '٠٥٥١٢٣٤٥٦٧', '055-123-4567', '551234567']) {
      for (let n = 1; n <= phone.length; n++) {
        const input = type(phone.slice(0, n));
        expect(input.value).toBe(phone.slice(0, n));
        // ثلاثة أرقام متتالية فأكثر (بأي من الأرقام) لا تظهر في العنوان ولا في التخزين
        expect(decodeURIComponent(window.location.hash), phone.slice(0, n)).not.toMatch(/[0-9٠-٩]{3}/);
        expect(stored(), phone.slice(0, n)).not.toMatch(/[0-9٠-٩]{3}/);
      }
      expect(window.location.hash).toBe('#/leaders/participants');
    }
  });

  it('رابط وصل برقم في بحثه يُنظَّف عند الفتح، والخانة تحتفظ به', () => {
    window.location.hash = '#/leaders/participants?q=0551234567&status=placed';
    mount();
    expect(host.querySelector('input[type="search"]').value).toBe('0551234567');
    expect(window.location.hash).toBe('#/leaders/participants?status=placed');
  });
});
