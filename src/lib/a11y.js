// ════════════════════════════════════════════════════════════════
// سهولة الوصول: عنصر غير زر يتصرف كزر، ونافذة حوارية تدير التركيز وتُغلق بـ Esc
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';

// <span {...pressable(fn)}> ← يُضغط بالفأرة وبـ Enter أو المسافة، ويقرؤه قارئ الشاشة زرًا
export const pressable = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } },
});

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// النوافذ المفتوحة بترتيب فتحها: Tab وEsc للعليا وحدها (تأكيد فوق التحليل الديموغرافي مثلًا)
const openDialogs = [];

// نافذة حوارية واحدة المصدر لنوافذ المصفوفة كلها (العملية، والتأكيد، والتحليل الديموغرافي):
// <div ref={box} role="dialog" aria-modal="true" tabIndex={-1}>
// - عند الفتح ينتقل التركيز إليها: إلى النافذة نفسها إن كان opts.self (فيُقرأ عنوانها أولًا)،
//   وإلا إلى [data-autofocus] أو أول عنصر قابل للتركيز.
// - opts.key: إذا تغيّر محتواها (عملية أخرى في النافذة نفسها) يعود التركيز إليها بالقاعدة نفسها.
// - Tab يدور داخلها ولا يخرج إلى الصفحة خلفها، وEsc يستدعي onClose، وكلاهما للنافذة العليا وحدها.
// - عند الإغلاق يعود التركيز إلى ما فتحها، وإن زال من الصفحة (شريحة «ينقصه موعد» تختفي بعد حفظ
//   موعدها) فإلى opts.fallback()، فلا يعود مستخدم لوحة المفاتيح إلى أول الصفحة.
export function useDialog(box, onClose, opts = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  const back = useRef(opts.fallback);
  back.current = opts.fallback;
  const self = !!opts.self;
  const start = () => {
    const el = box.current;
    if (!el) return;
    (self ? el : (el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE) || el)).focus();
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const opener = document.activeElement;
    const me = {};
    openDialogs.push(me);
    const items = () => [...el.querySelectorAll(FOCUSABLE)];
    start();
    const onKey = (e) => {
      if (openDialogs[openDialogs.length - 1] !== me) return;
      if (e.key === 'Escape') { close.current?.(); return; }
      if (e.key !== 'Tab') return;
      const all = items();
      if (!all.length) { e.preventDefault(); el.focus(); return; }
      const at = all.indexOf(document.activeElement);
      const last = all.length - 1;
      if (at === -1 || (e.shiftKey && at === 0) || (!e.shiftKey && at === last)) {
        e.preventDefault();
        all[e.shiftKey ? last : 0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(me), 1);
      const to = opener && opener !== document.body && opener.isConnected ? opener : back.current?.();
      to?.focus?.();
    };
  }, [box]);
  // تغيّر المحتوى بعد الفتح: يعود التركيز إلى النافذة (الأول يتولاه أثر الفتح)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    start();
  }, [opts.key]);
}
