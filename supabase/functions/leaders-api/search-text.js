// ════════════════════════════════════════════════════════════════
// مطابقة نص البحث: توحيد الحروف العربية ورقم الجوال بأي صيغة (منطق خالص، للخادم واللوحة معًا)
// ════════════════════════════════════════════════════════════════
// المصدر الوحيد لثلاثة أشياء (تصور تشغيل الدفعة 2026-11-19، المرحلة 0):
// 1. foldText: «اسامه» تجد «أسامة» في قائمة المشاركين كما في البحث الشامل (Ctrl K).
// 2. phoneNeedle: الجوال محفوظ دوليًا (+9665XXXXXXXX من normalizePhone)، ويُكتب في البحث 05 أو 5 أو 9665 أو +9665،
//    بمسافات أو شرطات أو أرقام عربية. تعيد الأرقام التي تُطابَق بها أرقام الرقم المحفوظ، في المتصفح وفي بحث الخادم.
// 3. digitQuery: نص بحث يشبه رقمًا لا يُكتب في عنوان الصفحة ولا يُحفظ للزيارة التالية (قرار الخصوصية في التصور، 2.7).
// البحث بالجوال للإدارة وحدها: لا يستعمل هذا الملف بحث المنسق ولا الخبير.
import { latinDigits } from './digits.js';

// علامات الاتجاه والمسافة غير المنكسرة: تأتي مع رقم منسوخ من تطبيقات المراسلة
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const clean = (s) => latinDigits(s).replace(INVISIBLE, '').replace(/\u00a0/g, ' ');

/** نص للمطابقة: بلا تشكيل ولا تطويل، والهمزات ألفًا، والتاء المربوطة هاءً، والألف المقصورة ياءً، والأرقام لاتينية */
export function foldText(s) {
  return clean(s).toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}

const PHONE_ONLY = /^[\d\s+\-().]+$/;
export const PHONE_MIN_DIGITS = 3;
const digitsOf = (s) => clean(s).replace(/\D/g, '');

/**
 * ما يُبحث به في أرقام الجوال المحفوظة، أو '' إن لم يكن النص رقمًا (حروف، أو أقل من ثلاثة أرقام).
 * 05XXXXXXXX ← 9665XXXXXXXX، و00966… و+966… ← 966…، و5512 تبقى كما هي فتطابق أي موضع من الرقم.
 */
export function phoneNeedle(q) {
  const s = clean(q).trim();
  if (!s || !PHONE_ONLY.test(s)) return '';
  let d = s.replace(/\D/g, '');
  if (d.length < PHONE_MIN_DIGITS) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `966${d.slice(1)}`;
  return d;
}

/** هل يطابق نص البحث هذا الرقم المحفوظ */
export function phoneMatches(q, phone) {
  const n = phoneNeedle(q);
  return !!n && !!phone && digitsOf(phone).includes(n);
}

/** نص بحث يشبه رقمًا (جوال أو جزء منه)، أو فيه خمسة أرقام فأكثر مع حروف («سارة 055123»): لا يُكتب في العنوان ولا يُحفظ */
export function digitQuery(q) {
  return !!phoneNeedle(q) || digitsOf(q).length >= 5;
}

/**
 * مطابِق لنص بحث واحد: يُبنى مرة ويُسأل عن كل عنصر.
 * @param {string} q
 * @returns {(text: string, phone?: string|null) => boolean}
 */
export function searchMatcher(q) {
  const f = foldText(q);
  const n = phoneNeedle(q);
  if (!f) return () => true;
  return (text, phone) => foldText(text).includes(f) || (!!n && !!phone && digitsOf(phone).includes(n));
}
