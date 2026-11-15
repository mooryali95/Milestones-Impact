// ════════════════════════════════════════════════════════════════
// قرارات الخادم قبل النموذج: لغة الرد، وهل السؤال عن سعر، وهل هو طلب سعر لجهة أو لعدة مقاعد
// ════════════════════════════════════════════════════════════════
// حتمية بلا نموذج، فتُختبر وحدها. لغة الرد تُحسب من نص رسالة الزائر وتُمرَّر إلى النموذج صراحة في سياق الخادم
// (كان النموذج يستنتجها وآخر ما يقرؤه سياق عربي، فينجرف إلى العربية في الرد على سؤال إنجليزي). وطلب الزائر داخل
// رسالته لغة أخرى لا يغيرها: التعليمات داخل الرسالة بيانات لا أوامر (القاعدة 10).
import { hasWord, isArabic, mentionedProduct, normalizeText, type Product } from './faq.ts';

export type Lang = 'ar' | 'en';
export const replyLang = (message: string): Lang => (isArabic(message) ? 'ar' : 'en');

// كلمات السعر بمطابقة الكلمة (بسوابقها ولواحقها المعروفة)، لا بنهاية الكلمة: كانت «كم» تطابق «عندكم» و«جوالكم»
const PRICE_WORDS = ['سعر', 'اسعار', 'تكلفه', 'تكلفت', 'بكم', 'كم', 'رسوم', 'رسم', 'مبلغ', 'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees', 'how much'];
export const asksPrice = (q: string) => hasWord(q, PRICE_WORDS);

// ما يدل على أن السائل جهة أو يسأل عن عدة مقاعد: عروض الجهات يعدها الفريق، فلا رقم ولا تقدير ويُحوَّل
const ORG_WORDS = ['شركه', 'شركت', 'جهه', 'جهت', 'مؤسسه', 'مؤسست', 'منشاه', 'منشات', 'وزاره', 'هيئه', 'مقعد', 'مقاعد', 'موظف', 'موظفين', 'موظفينا', 'فريقنا', 'company', 'organisation', 'organization', 'seat', 'seats', 'employees', 'staff', 'corporate'];
// عدد أكبر من 1 مع شخص أو مقعد أو مشارك (15 مقعد، 10 أشخاص، 20 participants)
const COUNT_RX = /(^|\s)([2-9]|[1-9]\d+)\s+(مقعد|مقاعد|شخص|اشخاص|مشارك|مشاركين|متدرب|متدربين|قائد|قاده|seat|seats|people|persons|participants|users|leaders)(\s|$)/;
export const orgSignal = (q: string) => hasWord(q, ORG_WORDS) || COUNT_RX.test(normalizeText(q));

// طلب سعر لجهة أو لعدة مقاعد في برنامج القادة (لا المصفوفة، فأسعارها المنشورة تشمل خطة المؤسسات)
export function orgQuote(q: string, product: Product) {
  if (!asksPrice(q) || !orgSignal(q)) return false;
  const named = mentionedProduct(q);
  if (named === 'matrix') return false;
  if (product === 'matrix' && named === null) return false;
  return true;
}
