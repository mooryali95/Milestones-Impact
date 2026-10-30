// ════════════════════════════════════════════════════════════════
// الفلترة الموحّدة في لوحة الإدارة: منطق واحد لكل الجداول
// ════════════════════════════════════════════════════════════════
// كل شاشة تعرّف حقولها (fields) وعروضها السريعة (presets)، والمكوّن FilterBar
// يعرضها بالشكل نفسه. الحالة كائن بسيط { مفتاح: قيمة } يُحفظ في عنوان الصفحة
// (يُشارك ويعود مع زر الرجوع) وتُحفظ منه عروض باسم في المتصفح.

const DAY = 864e5;

// فترات زمنية مشتركة لحقول التاريخ
export const PERIODS = [
  ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا'], ['older30', 'أقدم من 30 يومًا'], ['never', 'لم يحدث'],
];

export function inPeriod(iso, period, now = Date.now()) {
  if (!period) return true;
  if (period === 'never') return !iso;
  if (!iso) return false;
  const age = now - Date.parse(iso);
  if (period === 'older30') return age > 30 * DAY;
  return age <= Number(period) * DAY;
}

// حقل واحد: { key, label, get(item), options: [[v, l]] } أو { type: 'period' } لحقول التاريخ.
// get قد يعيد مصفوفة (عنصر له أكثر من قيمة) فيطابق إن احتوى القيمة.
export function matchField(item, field, value, now) {
  if (value === '' || value == null) return true;
  const v = field.get(item);
  if (field.type === 'period') return inPeriod(v, value, now);
  if (Array.isArray(v)) return v.map(String).includes(String(value));
  return String(v ?? '') === String(value);
}

// العنصر يمر إن طابق كل حقل مفعّل، والعرض السريع المختار، ونص البحث
export function applyFilters(list, { fields = [], presets = [], text = (x) => '' }, state, now = Date.now()) {
  const preset = presets.find((p) => p.key === state.view);
  const q = String(state.q || '').trim().toLowerCase();
  return list.filter((x) => (!preset || preset.test(x, now))
    && fields.every((f) => matchField(x, f, state[f.key], now))
    && (!q || text(x).toLowerCase().includes(q)));
}

// عدد العناصر في كل عرض سريع: يظهر على الرقاقة قبل الضغط
export const presetCounts = (list, presets, now = Date.now()) =>
  Object.fromEntries(presets.map((p) => [p.key, list.filter((x) => p.test(x, now)).length]));

// الفلاتر المفعّلة بأسمائها للعرض («الحالة: معتمد المستوى») ولإزالة كل واحد منها
export function activeChips(state, fields) {
  return fields.filter((f) => state[f.key] !== '' && state[f.key] != null).map((f) => {
    const opts = f.type === 'period' ? PERIODS : f.options || [];
    const hit = opts.find(([v]) => String(v) === String(state[f.key]));
    return { key: f.key, label: `${f.label}: ${hit ? hit[1] : state[f.key]}` };
  });
}

export const isFiltered = (state) => Object.entries(state).some(([, v]) => v !== '' && v != null);

// ── الحفظ في عنوان الصفحة: #/leaders/participants?status=placed&view=idle ──
export function encodeState(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== '' && v != null) p.set(k, v);
  return p.toString();
}
export function decodeState(qs, keys) {
  const p = new URLSearchParams(qs || '');
  return Object.fromEntries(keys.map((k) => [k, p.get(k) || '']));
}

// ── العروض المحفوظة باسم (في هذا المتصفح) ──
const savedKey = (scope) => `mi_admin_views_${scope}`;
export function loadViews(scope) {
  try { return JSON.parse(localStorage.getItem(savedKey(scope))) || []; } catch { return []; }
}
export function saveView(scope, name, state) {
  const list = loadViews(scope).filter((v) => v.name !== name).concat([{ name, state }]).slice(-12);
  try { localStorage.setItem(savedKey(scope), JSON.stringify(list)); } catch { /* التخزين محجوب: يبقى العرض للجلسة */ }
  return list;
}
export function deleteView(scope, name) {
  const list = loadViews(scope).filter((v) => v.name !== name);
  try { localStorage.setItem(savedKey(scope), JSON.stringify(list)); } catch { /* */ }
  return list;
}
