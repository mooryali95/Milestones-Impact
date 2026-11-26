// ════════════════════════════════════════════════════════════════
// أيقونات اللوحة الموحدة: SVG بخط واحد (1.75) ولون النص (currentColor)، بدل رموز اليونيكود (✉ ↻ ✓ ✕).
// زخرفية دائمًا (aria-hidden): المعنى في نص الزر أو aria-label. الاستعمال: <Icon name="mail" />
// تستعملها طلبات التواصل، ومراحل الزيارات والمصفوفة لاحقًا. أضف الشكل هنا لا في الشاشة.
// ════════════════════════════════════════════════════════════════
import React from 'react';

const PATHS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3.5L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.9 3.5L20 15" /><path d="M20 20v-5h-5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  chevron: <path d="m14.5 6-6 6 6 6" />,   // يشير يسارًا؛ ico-prev تقلبه في RTL
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  same: <path d="M5 12h14" />,
  unread: <><circle cx="12" cy="12" r="3.5" /><rect x="3" y="5" width="18" height="14" rx="2" opacity=".55" /></>,
};
export const ICONS = Object.keys(PATHS);

export function Icon({ name, size = 16, className = '' }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg className={`ico${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{p}</svg>
  );
}
