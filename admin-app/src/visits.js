// ════════════════════════════════════════════════════════════════
// زيارات الموقع واتجاه البرنامج: دوال خالصة بلا واجهة (يحرسها visits.test.js)
// ════════════════════════════════════════════════════════════════
// تصور صفحة الزيارات 2026-11-26 (المرحلة 2): ملء الأيام الفارغة، ومقارنة آخر أسبوعين مكتملين، وتطبيع المسارات
// والمصادر نصًّا لا روابط، وضغط الأسابيع الصفرية في الوسط، وإخفاء الأعداد الصغيرة لمن لا يرى المشاركين.

const DAY = 864e5;
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

export const SITES = [['', 'كل المواقع'], ['mi-home', 'الموقع الرئيسي'], ['mi-matrix', 'مصفوفة التأثير'], ['mi-leaders', 'صفحة القادة']];
export const siteName = (id) => (SITES.find(([k]) => k && k === id)?.[1]) || id || '';
export const VISIT_DAYS = [7, 30, 90];
/** المدة من الرابط: إحدى الثلاث وإلا 30 */
export const pickDays = (v) => (VISIT_DAYS.includes(Number(v)) ? Number(v) : 30);
/** الموقع من الرابط: معرّف معروف وإلا «كل المواقع» */
export const pickSite = (v) => (SITES.some(([k]) => k && k === v) ? v : '');
/** «آخر 30 يومًا · كل المواقع» */
export const rangeLabel = (days, site) => `${days === 7 ? 'آخر 7 أيام' : `آخر ${days} يومًا`} · ${siteName(site) || 'كل المواقع'}`;

/**
 * يوم لكل تاريخ في مدى الخادم (من اليوم ناقص days إلى اليوم، بتوقيت UTC كما يجمع analytics_daily)،
 * واليوم الغائب صفر. ما يصل خارج المدى يُضاف في موضعه فلا يضيع رقم.
 */
export function fillDays(daily, days, now = Date.now()) {
  const by = new Map();
  for (const r of daily || []) {
    const k = String(r.day || '').slice(0, 10);
    if (!k) continue;
    const o = by.get(k) || { visits: 0, views: 0 };
    o.visits += Number(r.visits || 0); o.views += Number(r.views || 0);
    by.set(k, o);
  }
  const end = utcDay(now);
  const out = [];
  for (let i = days; i >= 0; i--) {
    const k = utcDay(Date.parse(`${end}T00:00:00Z`) - i * DAY);
    out.push({ day: k, visits: by.get(k)?.visits || 0, views: by.get(k)?.views || 0 });
    by.delete(k);
  }
  // ما خارج المدى المطلوب يُسقط: لا يغير عدد الأيام ولا المتوسط اليومي ولا مدى المحور
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** هل الأسبوع الذي يبدأ في start (الأحد، weekStart في الخادم) لم ينته بعد؟ */
export const isPartialWeek = (start, now = Date.now()) => Date.parse(`${start}T00:00:00Z`) + 7 * DAY > now;

// دون هذا العدد في الطرفين تُعرض المقارنة بلون محايد: الفرق بين 1 و2 ليس «نموًا 100%»
export const SMALL_N = 5;
/**
 * مقارنة آخر أسبوعين مكتملين لمقياس k. weeks مرتبة تصاعديًا كما يعيدها admin.trends، وآخرها قد يكون جاريًا.
 * { cur, prev, diff, pct (null إن كان السابق صفرًا), dir: up|down|same, neutral, week } أو null إن لم يكتمل أسبوعان.
 */
export function weekCompare(weeks, k, now = Date.now()) {
  const done = (weeks || []).filter((w) => !isPartialWeek(w.week, now));
  if (done.length < 2) return null;
  const a = done.at(-1), b = done.at(-2);
  const cur = Number(a[k] || 0), prev = Number(b[k] || 0);
  const diff = cur - prev;
  return {
    cur, prev, diff, week: a.week,
    pct: prev ? Math.round((diff / prev) * 100) : null,
    dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    neutral: Math.max(cur, prev) < SMALL_N,
  };
}
/** نص قارئ الشاشة للمقارنة */
export function compareText(c) {
  if (!c) return 'لا أسبوعان مكتملان للمقارنة بعد';
  if (c.dir === 'same') return `${c.cur}، مثل الأسبوع السابق`;
  const by = `${c.dir === 'up' ? 'زيادة' : 'نقص'} ${Math.abs(c.diff)}${c.pct == null ? '' : ` (${Math.abs(c.pct)}%)`}`;
  return `${c.cur}، ${by} عن الأسبوع السابق (${c.prev})`;
}

/**
 * صفوف الجدول الأسبوعي من الأحدث: الأسابيع الصفرية كلها في الوسط (بين أسبوعين فيهما نشاط) تصير صف
 * { gap: n, from, to } ولا تُحذف، والصفرية في الطرفين تبقى كما هي.
 */
export function weekRows(weeks, keys) {
  const list = [...(weeks || [])].reverse();
  const zero = (w) => keys.every((k) => !Number(w[k] || 0));
  const first = list.findIndex((w) => !zero(w));
  const last = list.length - 1 - [...list].reverse().findIndex((w) => !zero(w));
  if (first < 0) return list;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (i > first && i < last && zero(list[i])) {
      let j = i;
      while (j + 1 < last && zero(list[j + 1])) j++;
      if (j > i) { out.push({ gap: j - i + 1, from: list[j].week, to: list[i].week }); i = j; continue; }
    }
    out.push(list[i]);
  }
  return out;
}
/** «N أسابيع بلا نشاط» */
export const gapLabel = (n) => (n === 2 ? 'أسبوعان بلا نشاط' : n <= 10 ? `${n} أسابيع بلا نشاط` : `${n} أسبوعًا بلا نشاط`);

/** عدد أسبوعي صغير (1 أو 2) يُعرض «أقل من 3» لمن لا يرى المشاركين، فلا يُستدل به على شخص */
export const maskSmall = (n, hide) => (hide && Number(n) > 0 && Number(n) < 3 ? 'أقل من 3' : String(Number(n) || 0));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** مسار صفحة نصًّا مطبَّعًا: بلا استعلام ولا وسم، والمعرّف الطويل أو UUID أو الرقم الطويل يصير :id */
export function normPath(p) {
  const s = String(p || '').split(/[?#]/)[0].trim() || '/';
  return s.split('/').map((seg) => (UUID.test(seg) || /^\d{5,}$/.test(seg) || (seg.length >= 16 && /\d/.test(seg) && /^[\w-]+$/.test(seg)) ? ':id' : seg)).join('/');
}
/** صفحات بعد التطبيع: ما صار مسارًا واحدًا يُجمع */
export function mergePages(pages) {
  const by = new Map();
  for (const p of pages || []) {
    const path = normPath(p.path);
    const k = `${p.site}\u0000${path}`;
    const o = by.get(k) || { site: p.site, path, visits: 0, views: 0 };
    o.visits += Number(p.visits || 0); o.views += Number(p.views || 0);
    by.set(k, o);
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits || b.views - a.views);
}

export const DIRECT = 'مباشر أو غير معروف';
/** المصدر مضيفًا وحده (بلا بروتوكول ولا www ولا مسار)، والفارغ أو «مباشر» يصير DIRECT */
export function refHost(label) {
  const s = String(label || '').trim();
  if (!s || s === 'مباشر') return DIRECT;
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#:]/)[0].replace(/^www\./i, '').toLowerCase();
  return host || DIRECT;
}
export function mergeRefs(refs) {
  const by = new Map();
  for (const r of refs || []) { const k = refHost(r.label); by.set(k, (by.get(k) || 0) + Number(r.visits || 0)); }
  return [...by].map(([label, visits]) => ({ label, visits })).sort((a, b) => b.visits - a.visits);
}
/** النسبة المئوية مقربة، وصفر حين لا مجموع */
export const pct = (n, total) => (total > 0 ? Math.round((Number(n || 0) / total) * 100) : 0);
