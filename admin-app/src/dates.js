// ════════════════════════════════════════════════════════════════
// التاريخ في لوحة الإدارة: مصدر واحد للصيغة (يحرسه dates.test.js)
// ════════════════════════════════════════════════════════════════
// ── صيغة التاريخ الواحدة في اللوحة: ميلادي بأرقام لاتينية وأشهر عربية، ولا تعريف آخر في أي شاشة ──
const DLOC = 'ar-SA-u-ca-gregory-nu-latn';
const valid = (d) => d && !Number.isNaN(new Date(d).getTime());
/** 13 نوفمبر 2026 */
export const date = (d) => (valid(d) ? new Date(d).toLocaleDateString(DLOC, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
/** 13 نوفمبر 2026، 2:30 م */
export const dateTime = (d) => (valid(d) ? new Date(d).toLocaleString(DLOC, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
/** 13 نوفمبر (بلا سنة: لمهلة قريبة) */
export const dayMonth = (d) => (valid(d) ? new Date(d).toLocaleDateString(DLOC, { month: 'long', day: 'numeric' }) : '');
/** يوم بلا وقت مخزّن نصًّا (2026-11-13): يُقرأ بتوقيت UTC فلا ينزاح يومًا */
export const dateOnly = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString(DLOC, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
/** الخميس، 13 نوفمبر، 2:30 م (موعد جلسة: اليوم أهم من السنة) */
export const weekTime = (d) => (valid(d) ? new Date(d).toLocaleString(DLOC, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
/** الأحد، 15 نوفمبر، 9:00 ص بتوقيت الرياض أيًّا كانت منطقة المتصفح (موعد ورشة يُقترح من الخط الزمني، وتأكيد حفظها) */
export const riyadhWhen = (d) => (valid(d) ? new Date(d).toLocaleString(DLOC, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }) : '');
/** يوم اللحظة بتوقيت الرياض بصيغة 2026-11-15 (للمقارنة بنوافذ المراحل، لا للعرض) */
export const riyadhDay = (d) => (valid(d) ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }) : '');
/** الأحد 15 نوفمبر: يوم بلا وقت مخزّن نصًّا، باسم يومه (علامة اليوم على الخط الزمني) */
export const weekDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString(DLOC, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
/** 2:30 م */
export const timeOnly = (d) => (valid(d) ? new Date(d).toLocaleTimeString(DLOC, { hour: 'numeric', minute: '2-digit' }) : '');
/** الثلاثاء، 17 نوفمبر 2026 بتقويم الرياض (رأس مكتب اليوم) */
export const dayFull = (d = new Date()) => (valid(d) ? new Date(d).toLocaleDateString(DLOC, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh' }) : '');
/** الاثنين، 4 يناير 2027: يوم بلا وقت مخزّن نصًّا (رأس رحلة الدفعة)، يُقرأ بتوقيت UTC فلا ينزاح يومًا */
export const dayLong = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString(DLOC, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');

// ── التاريخ النسبي (مشترك: طلبات التواصل الآن، والزيارات والمصفوفة لاحقًا) ──
const DAY = 86400000;
/** عدد الأيام بجمع عربي صحيح: يوم، يومين، 3 أيام، 11 يومًا */
export const daysAr = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يومًا`);
/** الأيام الكاملة بين لحظتين بتقويم الرياض (لا بفرق الساعات): أمس 23:00 واليوم 01:00 يوم واحد */
export const daysSince = (d, now = new Date()) => (valid(d) ? Math.max(0, Math.round((new Date(riyadhDay(now)) - new Date(riyadhDay(d))) / DAY)) : null);
/** 13 نوفمبر 2026، 2:30 م بتوقيت الرياض: للوصف الكامل (aria-label وtitle) */
export const riyadhFull = (d) => (valid(d) ? new Date(d).toLocaleString(DLOC, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Riyadh' }) : '');
/**
 * نسبي لسبعة أيام فأقل (الآن، قبل 5 دقائق، قبل 3 ساعات، أمس، قبل 4 أيام)،
 * وبعدها مختصر: «13 نوفمبر» في السنة الجارية، و«13 نوف 2025» فيما قبلها. الكامل في riyadhFull.
 */
export function relDate(d, now = new Date()) {
  if (!valid(d)) return '';
  const t = new Date(d).getTime();
  const ms = new Date(now).getTime() - t;
  const days = daysSince(d, now);
  if (ms < 60000 && ms > -60000) return 'الآن';
  if (ms > 0 && days === 0) {
    const m = Math.floor(ms / 60000);
    if (m < 60) return m === 1 ? 'قبل دقيقة' : m === 2 ? 'قبل دقيقتين' : m <= 10 ? `قبل ${m} دقائق` : `قبل ${m} دقيقة`;
    const h = Math.floor(m / 60);
    return h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : h <= 10 ? `قبل ${h} ساعات` : `قبل ${h} ساعة`;
  }
  if (days === 1) return 'أمس';
  if (days > 1 && days <= 7) return `قبل ${daysAr(days)}`;
  const sameYear = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(0, 4) === riyadhDay(now).slice(0, 4);
  return new Date(t).toLocaleDateString(DLOC, sameYear ? { day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' });
}
