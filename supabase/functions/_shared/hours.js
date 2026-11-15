// ساعات عمل الفريق ووعد الرد: المصدر الواحد لنص الوعد في المساعد الآلي (agent-chat) وفي بريد تأكيد
// نموذج التواصل (send-otp) وفي صفحات الموقع (يحرسها اختبار). قرار المالك 2026-11-15: الأحد إلى الخميس
// 9:00 إلى 17:00 بتوقيت الرياض (UTC+3 بلا توقيت صيفي)، والرد خلال 4 ساعات عمل، وخارجها يوم العمل التالي.
export const SERVICE_HOURS = Object.freeze({ days: [0, 1, 2, 3, 4], open: 9, close: 17, replyHours: 4, tzOffsetHours: 3 });

export const HOURS_AR = 'الأحد إلى الخميس، من 9:00 إلى 17:00 بتوقيت الرياض';
export const HOURS_EN = 'Sunday to Thursday, 9:00 to 17:00 Riyadh time';
// الوعد بصيغته الثابتة (البريد والصفحات): لا يتغير بالوقت، فيصدق في الحالين
export const PROMISE_AR = `يرد عليكم الفريق خلال 4 ساعات عمل (${HOURS_AR})، وما يصل خارجها يُرد عليه في يوم العمل التالي`;
export const PROMISE_EN = `Our team replies within 4 business hours (${HOURS_EN}); messages received outside these hours are answered on the next business day`;

const riyadh = (now) => new Date(now + SERVICE_HOURS.tzOffsetHours * 36e5);

// هل الآن داخل ساعات العمل؟
export function inServiceHours(now = Date.now()) {
  const d = riyadh(now);
  return SERVICE_HOURS.days.includes(d.getUTCDay()) && d.getUTCHours() >= SERVICE_HOURS.open && d.getUTCHours() < SERVICE_HOURS.close;
}

// الوعد بحسب لحظة الطلب: داخل الساعات «خلال 4 ساعات عمل»، وخارجها «في يوم العمل التالي». لا وعد برد فوري أبدًا
export function promiseNow(lang = 'ar', now = Date.now()) {
  const open = inServiceHours(now);
  if (lang === 'en') return open ? 'Our team will reply within 4 business hours (Riyadh time).' : 'Our team will reply on the next business day (Sunday to Thursday, Riyadh time).';
  return open ? 'سيرد عليك الفريق خلال 4 ساعات عمل بتوقيت الرياض.' : 'سيرد عليك الفريق في يوم العمل التالي (الأحد إلى الخميس) بتوقيت الرياض.';
}
