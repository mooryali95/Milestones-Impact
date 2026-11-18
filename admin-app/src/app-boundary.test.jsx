// الحاجز الأخير حول لوحة الإدارة (main.jsx): أي سياق أو نافذة يسقط يعرض رسالة بدل صفحة بيضاء، وخطأ ملف قديم بعد نشر
// يعيد التحميل مرة واحدة (reloadOnce من lazy-retry.js)
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenBoundary } from './ui.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const mount = (el) => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); act(() => root.render(el)); return host; };
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.restoreAllMocks(); });

const Boom = ({ error }) => { throw error; };

describe('الحاجز الأخير حول اللوحة', () => {
  it('main.jsx يلف التطبيق كله بالحاجز', () => {
    const src = readFileSync(join(__dirname, 'main.jsx'), 'utf8');
    expect(src).toMatch(/<ScreenBoundary scope="app"><UpdateBar \/><Suspense[^>]*>.*<App \/><\/Suspense><\/ScreenBoundary>/s);
  });

  it('خطأ رسم في أي شاشة: رسالة بزرين ونوع الخطأ، لا صفحة بيضاء', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = mount(<ScreenBoundary scope="app"><Boom error={new TypeError('x is undefined')} /></ScreenBoundary>);
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('تعذّر عرض اللوحة');
    expect(alert.textContent).toContain('TypeError: x is undefined');
    expect([...alert.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['حاول مرة أخرى', 'أعد تحميل الصفحة']);
  });

  it('خطأ ملف قديم بعد نشر: إعادة تحميل واحدة تلقائيًا، ورسالة التحديث', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadPage = vi.fn(() => true);
    const el = mount(<ScreenBoundary scope="app" reloadPage={reloadPage}><Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/Matrix-abc.js')} /></ScreenBoundary>);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role="alert"]').textContent).toContain('صدر تحديث للوحة');
  });

  it('حاجز الشاشة (بلا scope) كما كان: لا يعيد التحميل بنفسه', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadPage = vi.fn(() => true);
    const el = mount(<ScreenBoundary reloadPage={reloadPage}><Boom error={new TypeError('Failed to fetch dynamically imported module: /a.js')} /></ScreenBoundary>);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]').textContent).toContain('لتفتح هذه الشاشة');
  });
});
