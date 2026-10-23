// ════════════════════════════════════════════════════════════════
// سهولة الوصول: عنصر غير زر يتصرف كزر، ونافذة تُغلق بـ Esc
// ════════════════════════════════════════════════════════════════
import { useEffect } from 'react';

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
