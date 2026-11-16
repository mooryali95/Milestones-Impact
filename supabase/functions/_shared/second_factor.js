// العامل الثاني لجلسة الإدارة: مصدر واحد لحارسي الكتابة في admin-api (writeAccess ورد «me») وleaders-api (requireWrite)،
// ولحكم اللوحة قبل وصول «me» (admin-app/src/write-access.js).
// ما عدا مفتاح المرور وتطبيق المصادقة (رمز البريد، أو جلسة قديمة بلا طريقة مسجلة) عامل واحد: يقرأ ولا يكتب حتى يفعّل الكتابة.
export const SECOND_FACTOR_METHODS = Object.freeze(['passkey', 'totp']);
/** @param {unknown} method @returns {boolean} */
export const hasSecondFactor = (method) => SECOND_FACTOR_METHODS.includes(String(method ?? ''));
