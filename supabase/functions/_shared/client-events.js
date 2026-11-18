// ════════════════════════════════════════════════════════════════
// أحداث الإخفاق من جهة العميل (تصور التحديث بلا أثر، المرحلة 4): المصدر الواحد لشكل الحدث، يقرؤه العميل
// (leaders-app/src/telemetry.js) والخادم (leaders-api/client-events.ts) وقيد الجدول (الترحيل 20261118150000)
// ════════════════════════════════════════════════════════════════
// الأنواع: بلا اتصال، وTypeError (fetch رمى: انقطاع أو رد بلا CORS)، ومهلة، ومشغول (502/503/504 من البوابة)، و5xx (خطأ
// الدالة نفسها)، وملف قسم غائب (chunk)، وأخطاء الصفحة: error (window.onerror) وrejection (unhandledrejection) وrender (حاجز الأخطاء)
export const CLIENT_EVENT_KINDS = Object.freeze(['offline', 'TypeError', 'timeout', 'busy', '5xx', 'chunk', 'error', 'rejection', 'render']);
// أنواع الصفحة وحدها تحمل نصًا قصيرًا منقّى، وأنواع الشبكة بلا نص
export const MESSAGE_KINDS = Object.freeze(['chunk', 'error', 'rejection', 'render']);
// اسم الفعل: حروف لاتينية صغيرة وأرقام ونقطة وشرطة، كأسماء أفعال leaders-api. ما سواه يُفرغ
export const ACT_RE = /^[a-z0-9._-]{0,60}$/;
export const cleanAct = (a) => { const s = String(a ?? '').slice(0, 60); return ACT_RE.test(s) ? s : ''; };
export const BUILD_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const cleanBuild = (b) => { const s = String(b ?? ''); return BUILD_RE.test(s) ? s : ''; };
