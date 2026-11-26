// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageHeader, docTitle, APP_TITLE, __resetPageHeaderFocus } from './PageHeader.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { __resetPageHeaderFocus(); document.title = APP_TITLE; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el) => act(() => root.render(el));

describe('PageHeader', () => {
  it('عنوان h1 واحد قابل للتركيز، والوصف والشارة والإجراءات اختيارية', () => {
    render(<PageHeader title="زيارات الموقع" />);
    const h = host.querySelectorAll('h1');
    expect(h).toHaveLength(1);
    expect(h[0].getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('.page-title-ar')).toBeNull();
    expect(host.querySelector('.page-status')).toBeNull();
    expect(host.querySelector('.page-actions')).toBeNull();
    render(<PageHeader title="س" desc="وصف" status="عرض فقط" actions={<button>تحديث</button>} />);
    expect(host.querySelector('.page-title-ar').textContent).toBe('وصف');
    expect(host.querySelector('.page-status').textContent).toBe('عرض فقط');
    expect(host.querySelector('.page-actions button').textContent).toBe('تحديث');
  });

  it('التحميل الأول وإعادة تركيب الشاشة نفسها لا يسحبان التركيز، والانتقال يضعه على h1', () => {
    render(<PageHeader key="a" title="أ" />);
    expect(document.activeElement).not.toBe(host.querySelector('h1'));
    render(<PageHeader key="w" title="أ" />);
    expect(document.activeElement).not.toBe(host.querySelector('h1'));
    window.location.hash = '#ctx=contacts';
    render(<PageHeader key="b" title="ب" />);
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('انتقال من شاشة بلا ترويسة (النظرة العامة) إلى شاشة بها يضع التركيز على h1', () => {
    window.location.hash = '#ctx=overview';
    __resetPageHeaderFocus();
    window.location.hash = '#ctx=contacts2';
    render(<PageHeader title="جهات التواصل" />);
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('شارة الحالة خارج الجزء الأيسر في طرف الترويسة', () => {
    render(<PageHeader title="س" desc="وصف" status="عرض فقط" />);
    expect(host.querySelector('.page-header-left .page-status')).toBeNull();
    expect(host.querySelector('.page-header > .page-status')).not.toBeNull();
  });

  it('النطاق في عنوان المستند لا في الترويسة، ويُستعاد العنوان عند الخروج', () => {
    render(<PageHeader title="تطبيق القادة" domain="leaders.sunkvalue.com" />);
    expect(document.title).toBe(docTitle('تطبيق القادة', 'leaders.sunkvalue.com'));
    expect(document.title).toContain('leaders.sunkvalue.com');
    expect(host.textContent).not.toContain('sunkvalue');
    act(() => root.render(null));
    expect(document.title).toBe(APP_TITLE);
  });

  it('docTitle بلا عنوان يعيد اسم اللوحة', () => {
    expect(docTitle('')).toBe(APP_TITLE);
    expect(docTitle('س')).toBe(`س · ${APP_TITLE}`);
  });
});

describe('الشاشات الأربع تستعمل الترويسة الموحدة', () => {
  for (const f of ['Contacts', 'Visits', 'Matrix', 'Leaders']) {
    it(f, () => {
      const src = readFileSync(resolve(process.cwd(), `admin-app/src/screens/${f}.jsx`), 'utf8');
      expect(src).toContain('<PageHeader');
      expect(src).not.toMatch(/className="page-header"/);
      expect(src).not.toMatch(/<h1/);
    });
  }
  it('سطر النطاق ووصف الأقسام محذوفان من تطبيق القادة', () => {
    const src = readFileSync(resolve(process.cwd(), 'admin-app/src/screens/Leaders.jsx'), 'utf8');
    expect(src).not.toContain('المنهجية والمسارات والمشاركون والجهات والشهادات');
  });
});
