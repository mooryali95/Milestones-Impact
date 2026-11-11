import { describe, it, expect, vi } from 'vitest';
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { pressable, useDialogFocus } from './a11y';

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

// نافذة العملية في المصفوفة: كان التركيز يبقى على الخلية خلف الغطاء، فلا يصل
// مستخدم لوحة المفاتيح إلى حقل التاريخ إلا بعبور الصفحة كلها.
describe('useDialogFocus', () => {
  function Dialog({ id }) {
    const ref = useRef(null);
    useDialogFocus(ref, id);
    return React.createElement('div', { ref, tabIndex: -1, role: 'dialog', 'data-id': id });
  }

  it('ينقل التركيز إلى النافذة عند فتحها وعند تغيّر محتواها، ويعيده إلى ما فتحها عند إغلاقها', () => {
    const opener = document.createElement('button');
    const container = document.createElement('div');
    document.body.append(opener, container);
    opener.focus();
    const root = createRoot(container);

    act(() => { root.render(React.createElement(Dialog, { id: 'a' })); });
    const dialog = container.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);

    // تركيز انتقل داخل النافذة ثم تغيّرت العملية المعروضة: يعود إلى النافذة
    opener.focus();
    act(() => { root.render(React.createElement(Dialog, { id: 'b' })); });
    expect(document.activeElement).toBe(dialog);

    act(() => { root.unmount(); });
    expect(document.activeElement).toBe(opener);
    opener.remove(); container.remove();
  });
});
