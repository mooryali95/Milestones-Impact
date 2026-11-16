// ════════════════════════════════════════════════════════════════
// مفاتيح الميزات في واجهات المشارك والخبير (تصور 2026-11-16 اعتمده المالك، المرحلة P3)
// ════════════════════════════════════════════════════════════════
// القيم من حمولة الخادم وحدها (me.features، ولوحة الخبير xp.dashboard، وحمولة المنسق)، لا من ثابت يُبنى مع الحزمة:
// زر المدير يعمل بلا إعادة بناء. ما غاب أو لم يكن true فمخفي، فحمولة قديمة أو ناقصة لا تُظهر ميزة.
// الخادم هو الحارس (features.js على الخادم)، وهنا الإخفاء وحده: لا عنصر تنقل ولا بطاقة ولا خطوة جولة ولا رابط يقود إلى ميزة مخفية.
import { FEATURE_OFF_CODE } from '../../supabase/functions/leaders-api/features.js';

/** @typedef {{ hall: boolean, katon: boolean, f360: boolean }} Flags */

/** المفاتيح من حمولة فيها features (me أو لوحة الخبير أو حمولة المنسق)
 * @returns {Flags} */
export function flagsOf(payload) {
  const f = payload?.features;
  return { hall: f?.hall === true, katon: f?.katon === true, f360: f?.f360 === true };
}

// الشاشات التي تحكمها ميزة: الشاشة المخفية تقع على الرحلة، ورابط /?tab=hall كذلك
const VIEW_FEATURE = { hall: 'hall', katon: 'katon', f360: 'f360' };

/** هل تُفتح هذه الشاشة الآن؟ ما لا ميزة له يُفتح دائمًا
 * @param {string} view @param {Flags} flags */
export const viewShown = (view, flags) => !VIEW_FEATURE[view] || !!flags?.[VIEW_FEATURE[view]];

/** الشاشة المعروضة فعلًا: المخفية تقع على الرحلة
 * @param {string} view @param {Flags} flags */
export const shownView = (view, flags) => (viewShown(view, flags) ? view : 'home');

// رموز الرفض hall_off وkaton_off وf360_off نهائية: الميزة أُخفيت، فلا إعادة محاولة ولا رسالة خطأ، بل عودة إلى الرحلة
const OFF_CODES = new Set(Object.values(FEATURE_OFF_CODE));
/** هل هذا الرد رفض ميزة مخفية؟ */
export const isFeatureOff = (r) => !!r && r.success === false && OFF_CODES.has(r.code);

/** خطوات الجولة الحيّة بلا خطوة ميزة مخفية، قبل العداد («الخطوة 3 من 9»)، وبنص لا يذكر القاعة حين تُخفى (noHall)
 * @template {{ key: string, d?: string, noHall?: string }} T @param {T[]} steps @param {Flags} flags @returns {T[]} */
export const tourStepsFor = (steps, flags) => steps
  .filter((s) => viewShown(s.key, flags))
  .map((s) => (flags?.hall || !s.noHall ? s : { ...s, d: s.noHall }));

/** ما يُفتح بعد الاعتماد كما يُقال للمشارك: لا يُذكر ما أُخفي
 * @param {Flags} flags */
export function afterApprovalAr(flags) {
  const items = ['كتابك', 'ومبادرتك', flags?.hall && 'والقاعة', 'وطلبات التوجيه'].filter(Boolean);
  return items.join('، ');
}

/** نص باقة البرنامج في بوابة الدفع: الكتاب و«كاتون» والقاعة بمفاتيحها، ثم الثابت
 * @param {Flags} flags */
export function programPackageAr(flags) {
  const parts = ['الكتاب', flags?.katon && '«كاتون»', flags?.hall && 'القاعة', 'المبادرة', 'التقييم', 'الشهادة'].filter(Boolean);
  return parts.slice(0, -1).join(' و') + ` و${parts[parts.length - 1]}`;
}
