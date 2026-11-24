// تدقيق اللوحة 2026-11-23 (المرحلة 4): قيمة فارغة لا تُطبع نصًا برمجيًا. المجهول «—» بدل undefined وnull وNaN، والصفر رقم.
export const DASH = '—';
export const isBlank = (v) => v == null || (typeof v === 'number' && !Number.isFinite(v)) || v === '' || v === 'undefined' || v === 'null' || v === 'NaN';
export const dash = (v, fallback = DASH) => (isBlank(v) ? fallback : v);
// قالب نصي بقيم قد تكون فارغة: يُعيد البديل كله إن غاب أي جزء، فلا يظهر «undefined ← 3»
export const joinOr = (parts, sep = ' ', fallback = DASH) => (parts.some(isBlank) ? fallback : parts.join(sep));
