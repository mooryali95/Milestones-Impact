// ════════════════════════════════════════════════════════════════
// التصدير الموحد في لوحة الإدارة: منطق واحد لكل القوائم (بلا واجهة، ليُختبر وحده)
// ════════════════════════════════════════════════════════════════
// كل شاشة تعرّف أعمدتها مرة واحدة: [{ key, label, width?, get(صف) }]، والمكوّن ExportButton
// يسأل: ماذا تصدّر (المحدد، أو ما في القائمة الآن، أو الكل) وأي أعمدة، ثم يخرج ملف Excel
// بالهوية نفسها (src/lib/brand/xlsx.js). لا صيغة تصدير أخرى في اللوحة.

// ── ماذا يُصدَّر ──
export const WHICH_AR = { selected: 'المحدد', filtered: 'ما في القائمة الآن', all: 'الكل' };
/** الخيارات المتاحة بأعدادها: «المحدد» إن حُدّد شيء، و«الكل» إن كانت القائمة مفلترة */
export function whichOptions({ selected = [], filtered = [], all = [] }) {
  const out = [];
  if (selected.length) out.push({ key: 'selected', label: WHICH_AR.selected, n: selected.length });
  out.push({ key: 'filtered', label: all.length !== filtered.length ? WHICH_AR.filtered : WHICH_AR.all, n: filtered.length });
  if (all.length !== filtered.length) out.push({ key: 'all', label: WHICH_AR.all, n: all.length });
  return out;
}
export const rowsFor = (which, { selected = [], filtered = [], all = [] }) => (which === 'selected' ? selected : which === 'all' ? all : filtered);
/** السطر الذي يُكتب في ترويسة الملف: ماذا في هذا الملف من أصل كم */
export function subtitleFor(which, n, total, noun = 'سجل') {
  if (which === 'selected') return `${n} ${noun} محدد من ${total}`;
  return n === total ? `كل السجلات (${total})` : `${n} من ${total} حسب الفلاتر`;
}

// ── أي أعمدة ──
/** الأعمدة المختارة بترتيب تعريفها. بلا اختيار محفوظ أو باختيار لا يطابق شيئًا: الكل */
export function chosenColumns(columns, keys) {
  if (!Array.isArray(keys)) return columns;
  const picked = columns.filter((c) => keys.includes(c.key));
  return picked.length ? picked : columns;
}
const colsKey = (scope) => `mi_admin_cols_${scope}`;
export function loadColumns(scope) {
  try { const v = JSON.parse(localStorage.getItem(colsKey(scope))); return Array.isArray(v) ? v : null; } catch { return null; }
}
export function saveColumns(scope, keys) {
  try { localStorage.setItem(colsKey(scope), JSON.stringify(keys)); } catch { /* التخزين محجوب: الاختيار لهذه المرة فقط */ }
}

// ── الجدول الناتج: رأس وصفوف لـ exportWorkbook ──
const cell = (v) => (v == null ? '' : typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 'نعم' : '') : Array.isArray(v) ? v.join('، ') : String(v));
export function tableOf(rows, columns) {
  return {
    head: columns.map((c) => ({ label: c.label, width: c.width || 18 })),
    body: rows.map((r) => columns.map((c) => cell(c.get(r)))),
  };
}
