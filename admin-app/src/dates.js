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
/** 2:30 م */
export const timeOnly = (d) => (valid(d) ? new Date(d).toLocaleTimeString(DLOC, { hour: 'numeric', minute: '2-digit' }) : '');
