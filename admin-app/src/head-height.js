// ارتفاع الترويسة الملتصقة في متغير واحد --la-head-h على :root (المرحلة 6).
// كل ملتصق تحتها (.la-tabs-grouped و.pf-head و.org-tabs و.st-index و.ct-pane) يقرؤه بدل أرقام ثابتة،
// وscroll-padding-top على html يقرؤه فلا يختفي هدف scrollIntoView تحت الترويسة.
// يتبع ResizeObserver تغير الارتفاع (التفاف الهاتف، تكبير الخط؛ لذا ارتفاع .dash-header حد أدنى لا ثابت). شريط القراءة فقط شقيق قبلها لا داخلها فلا يدخل في القياس.
import { useLayoutEffect } from 'react';

export const HEAD_VAR = '--la-head-h';

export function setHeadHeight(el, root = typeof document === 'undefined' ? null : document.documentElement) {
  if (!el || !root) return null;
  const h = Math.round(el.getBoundingClientRect().height);
  if (!(h > 0)) return null;
  root.style.setProperty(HEAD_VAR, `${h}px`);
  return h;
}

export function useHeadHeight(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setHeadHeight(el);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setHeadHeight(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
