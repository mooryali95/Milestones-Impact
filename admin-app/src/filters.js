// ════════════════════════════════════════════════════════════════
// الفلترة الموحّدة في لوحة الإدارة: منطق واحد لكل الجداول
// ════════════════════════════════════════════════════════════════
// كل شاشة تعرّف حقولها (fields) وعروضها السريعة (presets)، والمكوّن FilterBar
// يعرضها بالشكل نفسه. الحالة كائن بسيط { مفتاح: قيمة } يُحفظ في عنوان الصفحة
// (يُشارك ويعود مع زر الرجوع) وتُحفظ منه عروض باسم في المتصفح.

import { digitQuery, searchMatcher } from '../../supabase/functions/leaders-api/search-text.js';

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

// العنصر يمر إن طابق كل حقل مفعّل، والعرض السريع المختار، ونص البحث.
// البحث بتوحيد الحروف العربية («اسامه» تجد «أسامة») كالبحث الشامل، وphone(x) إن عرّفته الشاشة يُطابق الجوال بأي صيغة
// (05 و5 و9665 و+9665 بمسافات أو شرطات أو أرقام عربية) من search-text.js، المصدر نفسه لبحث الخادم
export function applyFilters(list, { fields = [], presets = [], text = (x) => '', phone = null }, state, now = Date.now()) {
  const preset = presets.find((p) => p.key === state.view);
  const hit = searchMatcher(state.q);
  return list.filter((x) => (!preset || preset.test(x, now))
    && fields.every((f) => matchField(x, f, state[f.key], now))
    && hit(text(x), phone ? phone(x) : null));
}

// عدد العناصر في كل عرض سريع: يظهر على الرقاقة قبل الضغط
export const presetCounts = (list, presets, now = Date.now()) =>
  Object.fromEntries(presets.map((p) => [p.key, list.filter((x) => p.test(x, now)).length]));

// الفلاتر المفعّلة بأسمائها للعرض («الحالة: معتمد المستوى») ولإزالة كل واحد منها
export function activeChips(state, fields) {
  return fields.filter((f) => state[f.key] !== '' && state[f.key] != null).map((f) => {
    const opts = f.type === 'period' ? PERIODS : f.options || [];
    const hit = opts.find(([v]) => String(v) === String(state[f.key]));
    // chip: اسم الحقل بالمفرد في الرقاقة حين يكون label جمعًا للقائمة («كل الجهات» ← «الجهة: …»)
    return { key: f.key, label: `${f.chip || f.label}: ${hit ? hit[1] : state[f.key]}` };
  });
}

// الفرز ليس فلترة: لا يُظهر «مسح الكل» ولا يغيّر العدّ
export const isFiltered = (state) => Object.entries(state).some(([k, v]) => k !== 'sort' && v !== '' && v != null);

// ── الفرز بالأعمدة: sort = 'name' تصاعدي، و'-name' تنازلي، وفارغ = ترتيب الخادم ──
// النقرة الأولى تصاعدي، والثانية تنازلي، والثالثة تعيد ترتيب الخادم
export const nextSort = (sort, key) => (sort === key ? `-${key}` : sort === `-${key}` ? '' : key);
const blank = (v) => v == null || v === '';
// cols: { مفتاح: (عنصر) => قيمة }. الأرقام تُقارن أرقامًا، والنصوص بترتيب العربية، والفارغ آخرًا في الاتجاهين
export function sortRows(list, cols, sort) {
  if (!sort) return list;
  const desc = sort[0] === '-';
  const get = cols[desc ? sort.slice(1) : sort];
  if (!get) return list;
  const coll = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
  return list.map((x, i) => [x, i, get(x)]).sort((a, b) => {
    if (blank(a[2]) || blank(b[2])) return blank(a[2]) && blank(b[2]) ? a[1] - b[1] : blank(a[2]) ? 1 : -1;
    const c = typeof a[2] === 'number' && typeof b[2] === 'number' ? a[2] - b[2] : coll.compare(String(a[2]), String(b[2]));
    return (desc ? -c : c) || a[1] - b[1];
  }).map((r) => r[0]);
}

// ── الخصوصية: نص بحث يشبه رقمًا (جوال) يبقى في الخانة وحدها ──
// لا يُكتب في عنوان الصفحة (فلا يبقى في سجل المتصفح ولا يُنسخ مع الرابط)، ولا يُحفظ للزيارة التالية، ولا في عرض محفوظ باسم
export const shareable = (state) => (state && digitQuery(state.q) ? { ...state, q: '' } : state);

// رقم بمسافات أو شرطات يُقرأ من اليسار كما يُكتب (في خانة عربية تنقلب مجموعاته)، ويبقى في جهة الخانة نفسها
export const ltrDigits = (q) => (digitQuery(q) ? { dir: 'ltr', style: { textAlign: 'right' } } : {});

// ── بقاء الفلاتر عند العودة للشاشة (في هذه الجلسة من المتصفح) ──
const keptKey = (scope) => `mi_admin_flt_${scope}`;
export function recallState(scope) {
  try { return JSON.parse(sessionStorage.getItem(keptKey(scope))); } catch { return null; }
}
export function rememberState(scope, state) {
  try { sessionStorage.setItem(keptKey(scope), JSON.stringify(shareable(state))); } catch { /* التخزين محجوب: تبقى للشاشة المفتوحة فقط */ }
}
// ما تبدأ به الشاشة، بالأولوية: العنوان (رابط مشارَك)، ثم ما جاء به التنقل (initial)، ثم ما تُرك آخر مرة، ثم الافتراضي
export function startState(keys, opts = {}) {
  return startWith(keys, opts).state;
}
// startState مع مصدرها: url أو initial أو kept أو defaults. viewIsAuto: العرض لم يأت من الرابط ولا من التنقل ولا مما تُرك
// ولا من اختيار صريح، فيجوز لـfirstNonEmpty أن تختار غيره (ما تُرك بلا view هو عرض اختير آليًا ولم يُحفظ)
export function startWith(keys, { fromUrl = '', initial = {}, kept = null, defaults = {} } = {}) {
  const empty = decodeState('', keys);
  const any = (o) => Object.values(o || {}).some((v) => v !== '' && v != null);
  const url = decodeState(fromUrl, keys);
  if (any(url)) return { state: url, from: 'url', viewIsAuto: false };
  if (any(initial)) return { state: { ...empty, ...initial }, from: 'initial', viewIsAuto: false };
  if (kept) {
    const state = { ...empty, ...Object.fromEntries(keys.filter((k) => kept[k] != null).map((k) => [k, String(kept[k])])) };
    const autoView = keys.includes('view') && kept.view == null;
    if (autoView && defaults.view != null) state.view = String(defaults.view);
    return { state, from: 'kept', viewIsAuto: autoView };
  }
  return { state: { ...empty, ...defaults }, from: 'defaults', viewIsAuto: keys.includes('view') };
}

// الافتراضي غير الفارغ (المرحلة 15، دالة واحدة للخبراء والمبادرات): المفضَّل إن كان فيه شيء، وإلا أول عرض سريع
// عداده أكبر من صفر بترتيب presets، وإلا المفضَّل نفسه. null ما دامت العدادات لم تُحمَّل (لا قفز قبل معرفة الأرقام).
// لا تُستدعى إلا حين يكون العرض آليًا (startWith().viewIsAuto)، فأي عرض صريح في الرابط يُحترم ولو كان فارغًا.
export function firstNonEmpty(presets = [], counts = {}, prefer = '') {
  if (!presets.length || presets.some((p) => typeof (counts || {})[p.key] !== 'number')) return null;
  if (prefer && counts[prefer] > 0) return prefer;
  const hit = presets.find((p) => counts[p.key] > 0);
  return hit ? hit.key : prefer;
}

// ── الحفظ في عنوان الصفحة: #/leaders/participants?status=placed&view=idle ──
export function encodeState(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(shareable(state))) if (v !== '' && v != null) p.set(k, v);
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
  const list = loadViews(scope).filter((v) => v.name !== name).concat([{ name, state: shareable(state) }]).slice(-12);
  try { localStorage.setItem(savedKey(scope), JSON.stringify(list)); } catch { /* التخزين محجوب: يبقى العرض للجلسة */ }
  return list;
}
export function deleteView(scope, name) {
  const list = loadViews(scope).filter((v) => v.name !== name);
  try { localStorage.setItem(savedKey(scope), JSON.stringify(list)); } catch { /* */ }
  return list;
}

// طي العروض السريعة الصفرية (المرحلة 6): العرض الذي عداده صفر وليس هو المختار يُطوى تحت «المزيد (n)»،
// والمختار يبقى ظاهرًا ولو صار صفرًا كي يُلغى. العداد غير المعروف (لم يُحمّل) لا يُطوى.
export function splitPresets(presets = [], counts = {}, active = '', collapseZero = false) {
  if (!collapseZero) return { shown: presets, folded: [] };
  const shown = []; const folded = [];
  for (const p of presets) {
    const n = counts[p.key];
    if (n === 0 && p.key !== active) folded.push(p); else shown.push(p);
  }
  return { shown, folded };
}
