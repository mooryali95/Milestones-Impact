// قواعد العامل الخالصة (تُختبر بلا Chromium): ما يُسمح بطلبه أثناء الطباعة، وخيارات الطباعة
export const PDF_OPTIONS = Object.freeze({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, tagged: true, outline: true });

/** الطلب الفرعي مسموح؟ أصل التطبيق وحده (الخطوط والصور)، وdata: وabout: وblob: */
export function allowedRequest(url, appOrigin) {
  if (/^(data|about|blob):/i.test(url)) return true;
  try { return new URL(url).origin === new URL(appOrigin).origin; } catch { return false; }
}
