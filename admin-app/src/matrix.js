// منطق شاشة مصفوفة التأثير في لوحة الإدارة، بلا واجهة: يُختبر في matrix.test.js
// العمليات من مصدرها الواحد (src/lib/procs.js)، والأيام بتوقيت الرياض من dates.js
import { daysAr, daysSince } from './dates.js';
import { encodeState } from './filters.js';
import { formatRoute } from './route.js';

/**
 * عتبة التوقف في المصفوفة: جهة لم تقدّم خطتها ومرّ على آخر تعديل لسجلها IDLE_DAYS يومًا فأكثر.
 * ثابت مسمى واحد يقرأ منه مرشح «متوقفة» (MATRIX_PRESETS.idle) وقسم «متوقفون وطلبات إعادة فتح»
 * وأي عدد يُعرض خارج المصفوفة (النظرة العامة لاحقًا تقرأ idleRegs من هنا لا تعيد حسابها).
 * يختلف عن STALE_DAYS=7 في today.js: ذاك عمر بند ينتظر المدير في صندوق المهام، وهذا خمول جهة في خطتها.
 */
export const IDLE_DAYS = 14;
// مدة التوقف تُلوَّن تحذيرًا فوق 30 يومًا وخطرًا فوق 90، مع أيقونة ونص لا بلون وحده
export const IDLE_WARN = 30;
export const IDLE_BAD = 90;

/**
 * قاعدة العد (على نمط counted في leaders-api/counting.ts): حساب الاختبار (is_test، يكتبه admin-api وحده)
 * يُستبعد من الإحصاءات و«متوقفون وطلبات إعادة فتح» ومرشحات الحالة التي تطابق أرقامها، ويبقى في القوائم بشارة «اختبار».
 * لا يُحذف أي صف، ولا قرار هنا غير القراءة.
 */
export const isTest = (r) => r?.is_test === true;
export const counted = (regs) => regs.filter((r) => !isTest(r));
export const testCount = (regs) => regs.length - counted(regs).length;
export const testsAr = (n) => (n === 1 ? 'حساب اختبار واحد' : n === 2 ? 'حسابا اختبار' : n >= 3 && n <= 10 ? `${n} حسابات اختبار` : `${n} حساب اختبار`);
export const excludedLine = (n) => (n ? `استُبعد ${testsAr(n)} من الأعداد` : '');

export const booked = (r) => Object.keys(r?.dates || {}).length;

// الأيام منذ آخر تعديل (updatedAt يتغير بكتابات المدير أيضًا، لذا الصياغة «منذ آخر تعديل» لا «منذ آخر نشاط»)
export const idleDays = (r, now = new Date()) => daysSince(r?.updatedAt || r?.registeredAt, now);
// طلب إعادة الفتح قرار ينتظر المدير، لا يُحسب توقفًا
export const isIdle = (r, now = new Date()) => !r?.submitted && !r?.reopenRequested && (idleDays(r, now) ?? -1) >= IDLE_DAYS;
export const idleTone = (d) => (d > IDLE_BAD ? 'bad' : d > IDLE_WARN ? 'warn' : '');
export const idleSince = (d) => `منذ آخر تعديل ${daysAr(d)}`;

export const idleRegs = (regs, now = new Date()) => counted(regs).filter((r) => isIdle(r, now));

// ── عدد المتوقفين خارج المصفوفة (المرحلة 8، النظرة العامة البند 6) ──
// النظرة العامة لا تطلب list-regs عند فتحها (لا طلب شبكة جديد) ولا تعيد الحساب: تقرأ آخر عدد حسبته المصفوفة بـidleRegs
// نفسها في هذه الجلسة (ذاكرة الصفحة وحدها، لا تخزين). قبل فتح المصفوفة العدد مجهول (null)، فيُعرض السطر رابطًا بلا رقم.
let idleMemo = null;
export function rememberIdle(regs, now = new Date()) { idleMemo = { n: idleRegs(regs || [], now).length, at: Date.now() }; return idleMemo; }
export const idleCount = () => idleMemo;
export const IDLE_HREF = () => regsHref({ view: 'idle' });

// جمع «جهة» بالعربية الصحيحة
export const apptsAr = (n) => (n === 1 ? 'موعد واحد' : n === 2 ? 'موعدان' : n >= 3 && n <= 10 ? `${n} مواعيد` : `${n} موعدًا`);
export const orgsAr = (n) => (n === 1 ? 'جهة واحدة' : n === 2 ? 'جهتان' : n >= 3 && n <= 10 ? `${n} جهات` : `${n} جهة`);

/** القسم كله من مصدر واحد: طلبات إعادة الفتح، ثم المتوقفون مقسومين «لم تبدأ» و«توقفت في المنتصف»، تنازليًا بالأيام */
export function attention(regs, now = new Date()) {
  const withDays = (r) => ({ r, days: idleDays(r, now) ?? 0 });
  const desc = (a, b) => b.days - a.days;
  const reopen = counted(regs).filter((r) => r.reopenRequested).map(withDays).sort(desc);
  const idle = idleRegs(regs, now).map(withDays).sort(desc);
  return { reopen, idle, notStarted: idle.filter((x) => !booked(x.r)), midway: idle.filter((x) => booked(x.r) > 0) };
}

/** سطر الخلاصة مشتق من القائمة نفسها */
export function attentionSummary({ reopen, idle }, total) {
  if (!reopen.length && !idle.length) return 'لا جهات متوقفة ولا طلبات معلقة';
  const parts = [];
  if (reopen.length) parts.push(`${reopen.length === 1 ? 'طلب واحد' : reopen.length === 2 ? 'طلبان' : `${reopen.length} طلبات`} إعادة فتح بانتظار قرارك`);
  if (idle.length) {
    const oldest = idle[0].days;
    parts.push(`${idle.length === total ? `كل الجهات (${orgsAr(total)}) متوقفة` : `${orgsAr(idle.length)} متوقفة من ${total}`}، أقدمها منذ ${daysAr(oldest)}`);
  }
  return parts.join(' · ');
}

// عدد مواعيد كل مسار بربط مفتاح العملية بمسارها (trackId) من procs، لا بمطابقة بادئة الاسم
export function trackCounts(regs, procs, tracks) {
  const of = Object.fromEntries(procs.map((p) => [p.key, p.trackId]));
  const real = counted(regs);
  const n = real.length;
  return tracks.map((tr) => {
    const per = procs.filter((p) => p.trackId === tr.id).length;
    const count = real.reduce((a, r) => a + Object.keys(r.dates || {}).filter((k) => of[k] === tr.id).length, 0);
    const cap = per * n;
    return { track: tr, count, cap, pct: cap ? Math.round((count / cap) * 100) : 0 };
  });
}
export const regTracks = (r, procs) => {
  const of = Object.fromEntries(procs.map((p) => [p.key, p.trackId]));
  return [...new Set(Object.keys(r.dates || {}).map((k) => of[k]).filter(Boolean))];
};

export const MATRIX_PRESETS = [
  // مرشحات الحالة بقاعدة العد نفسها، فيطابق عددها البطاقة التي تفتحها؛ وحسابات الاختبار مرشح وحدها
  { key: 'real', label: 'المحسوبة', test: (r) => !isTest(r) },
  { key: 'reopen', label: 'تطلب إعادة الفتح', test: (r) => !isTest(r) && !!r.reopenRequested },
  { key: 'submitted', label: 'خطط مكتملة', test: (r) => !isTest(r) && !!r.submitted },
  { key: 'progress', label: 'قيد التخطيط', test: (r) => !isTest(r) && !r.submitted && booked(r) > 0 },
  { key: 'idle', label: `متوقفة ${IDLE_DAYS} يومًا`, test: (r, now) => !isTest(r) && isIdle(r, new Date(now)) },
  { key: 'test', label: 'حسابات اختبار', test: (r) => isTest(r) },
];

// رابط التسجيلات مرشحة: يكتب في العنوان وحده فيقرؤه useFilters، فيطابق التصدير ما يُرى
export const regsHref = (state = {}) => {
  const qs = encodeState(state);
  return `${formatRoute({ ctx: 'matrix', tab: 'regs' })}${qs ? `?${qs}` : ''}`;
};
export const regHref = (id) => formatRoute({ ctx: 'matrix', tab: 'regs', id: String(id) });
