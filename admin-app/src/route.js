// ════════════════════════════════════════════════════════════════
// المسار في عنوان الصفحة: لكل شاشة رابط، والتحديث وزر الرجوع يعملان
// ════════════════════════════════════════════════════════════════
// #/contacts · #/visits · #/leaders/<tab>[/<id>] — المعرّف مشارك أو جهة أو مسار بحسب التبويب.
// نستعمل الـhash لأن اللوحة تُخدم من مجلد ثابت (/next/) بلا إعادة توجيه على الخادم.
import { useEffect, useState } from 'react';

export const CTXS = ['contacts', 'leaders', 'matrix', 'visits'];

export function parseRoute(hash) {
  const [ctx, tab, ...rest] = String(hash || '').split('?')[0].replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
  if (!CTXS.includes(ctx)) return { ctx: null, tab: null, id: null };
  return { ctx, tab: tab || null, id: rest.join('/') || null };
}

export const formatRoute = ({ ctx, tab, id }) => `#/${[ctx, tab, id].filter(Boolean).map(encodeURIComponent).join('/')}`;

// يدفع إلى سجل المتصفح (زر الرجوع يعيد الشاشة السابقة) ما لم يكن replace
export function navigate(to, { replace = false } = {}) {
  const next = formatRoute(to);
  if (next === window.location.hash) return;
  if (replace) window.history.replaceState(null, '', next);
  else window.location.hash = next;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// الفلاتر بعد «?» في العنوان: تُقرأ عند فتح الشاشة وتُكتب بلا إضافة إلى سجل المتصفح
export const readQuery = () => String(window.location.hash || '').split('?')[1] || '';
export function writeQuery(qs) {
  const base = String(window.location.hash || '').split('?')[0] || '#/';
  const next = qs ? `${base}?${qs}` : base;
  if (next !== window.location.hash) window.history.replaceState(null, '', next);
}

export function useRoute() {
  const [r, setR] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setR(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
