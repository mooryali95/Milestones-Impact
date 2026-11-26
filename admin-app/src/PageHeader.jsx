import React, { useEffect, useRef } from 'react';

// ترويسة الصفحة الموحدة لكل شاشات لوحة الإدارة (المرحلة 4 من تصور 2026-11-26):
// عنوان h1 يستقبل التركيز عند الانتقال إلى الشاشة، ووصف خاص بها اختياري، ومنطقة إجراءات، وشارة حالة اختيارية.
// النطاق (مثل leaders.sunkvalue.com) لا يُكتب في الترويسة، بل في عنوان المستند.
export const APP_TITLE = 'لوحة الإدارة — Milestone Impact';

export function docTitle(title, domain) {
  const t = String(title || '').trim();
  const d = String(domain || '').trim();
  if (!t) return APP_TITLE;
  return `${t}${d ? ` (${d})` : ''} · ${APP_TITLE}`;
}

// أول ترويسة في الجلسة لا تسحب التركيز (تحميل الصفحة يبدأ من أعلاها طبيعيًا)، وما بعدها انتقال بين الشاشات فيستقبل h1 التركيز
// القرار يقوم على تغير موضع الصفحة لا على أول تركيب: إعادة تركيب الشاشة نفسها (تغير الصلاحية) لا تسحب التركيز
const here = () => (typeof location === 'undefined' ? '' : location.href);
let lastHref = here();
export function __resetPageHeaderFocus() { lastHref = here(); }

export function PageHeader({ title, eyebrow, desc, actions, status, domain }) {
  const h1 = useRef(null);
  useEffect(() => {
    const h = here();
    if (h !== lastHref) h1.current?.focus({ preventScroll: true });
    lastHref = h;
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prev = document.title;
    document.title = docTitle(title, domain);
    return () => { document.title = prev; };
  }, [title, domain]);
  return (
    <header className="page-header">
      <div className="page-header-left">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title" tabIndex={-1} ref={h1}>{title}</h1>
        {desc && <div className="page-title-ar" title={typeof desc === 'string' ? desc : undefined}>{desc}</div>}
      </div>
      {status && <span className="la-chip page-status">{status}</span>}
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
