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
