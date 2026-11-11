// ════════════════════════════════════════════════════════════════
// سهولة الوصول: عنصر غير زر يتصرف كزر، ونافذة تُغلق بـ Esc ويأخذ التركيز
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';

// <span {...pressable(fn)}> ← يُضغط بالفأرة وبـ Enter أو المسافة، ويقرؤه قارئ الشاشة زرًا
export const pressable = (fn) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } },
});

export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, active]);
}

// نافذة حوارية: ينتقل التركيز إليها عند فتحها وكلما تغيّر محتواها (key)، ويعود عند
// إغلاقها إلى ما فتحها، فيكمل مستخدم لوحة المفاتيح من حيث كان لا من أعلى الصفحة.
// العنصر المشار إليه يحمل tabIndex={-1}.
export function useDialogFocus(ref, key) {
  const opener = useRef(null);
  useEffect(() => {
    opener.current = document.activeElement;
    return () => { const el = opener.current; if (el && el.isConnected && el.focus) el.focus(); };
  }, []);
  useEffect(() => { ref.current?.focus(); }, [ref, key]);
}
