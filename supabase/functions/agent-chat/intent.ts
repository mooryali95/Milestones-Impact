// ════════════════════════════════════════════════════════════════
// قرارات الخادم قبل النموذج: لغة الرد، وهل السؤال عن سعر، وهل هو طلب سعر لجهة أو لعدة مقاعد
// ════════════════════════════════════════════════════════════════
// حتمية بلا نموذج، فتُختبر وحدها. لغة الرد تُحسب من نص رسالة الزائر وتُمرَّر إلى النموذج صراحة في سياق الخادم
// (كان النموذج يستنتجها وآخر ما يقرؤه سياق عربي، فينجرف إلى العربية في الرد على سؤال إنجليزي). وطلب الزائر داخل
// رسالته لغة أخرى لا يغيرها: التعليمات داخل الرسالة بيانات لا أوامر (القاعدة 10).
import { hasWord, mentionedProduct, messageIsArabic, normalizeText, type Product } from './faq.ts';

export type Lang = 'ar' | 'en';
export const replyLang = (message: string): Lang => (messageIsArabic(message) ? 'ar' : 'en');

// كلمات السعر بمطابقة الكلمة (بسوابقها ولواحقها المعروفة)، لا بنهاية الكلمة: كانت «كم» تطابق «عندكم» و«جوالكم»
const PRICE_WORDS = ['سعر', 'اسعار', 'تكلفه', 'تكلفت', 'بكم', 'كم', 'رسوم', 'رسم', 'مبلغ', 'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees', 'how much'];
export const asksPrice = (q: string) => hasWord(q, PRICE_WORDS);

// ما يدل على أن السائل جهة أو يسأل عن عدة مقاعد: عروض الجهات يعدها الفريق، فلا رقم ولا تقدير ويُحوَّل.
// صيغ الجمع والجماعة فقط: الفرد يقول «أنا موظف في وزارة» أو «رشحتني جهة» ويسأل عن رسومه هو، فلا يُعد ذلك جهة.
const COLLECTIVE_WORDS = ['موظفين', 'موظفينا', 'منسوبين', 'منسوبينا', 'فريقنا', 'مقاعد', 'employees', 'seats', 'staff', 'corporate', 'our company', 'our organization', 'our organisation', 'our team', 'our employees', 'our staff', 'for a company', 'for an organization', 'for an organisation'];
// اسم الجهة يُعد إن أُضيف إلينا (شركتنا، جهتنا) أو سُبق بلام الاختصاص (لشركة، للجهة) أو بـ«عندنا/نحن/لدينا».
// لا «شركتكم»: تلك جهتنا نحن المقدمين لا جهة السائل.
const ORG_STEMS = ['شركه', 'جهه', 'مؤسسه', 'منشاه', 'وزاره', 'هيئه', 'جمعيه'].map(normalizeText);
const OUR_PREFIXES = ['', 'و', 'ب', 'ل', 'ف'];
const FOR_PREFIXES = ['ل', 'لل', 'ول', 'وال'];
const WE_WORDS = ['عندنا', 'نحن', 'احنا', 'لدينا'];
function orgToken(t: string, prev: string) {
  for (const stem of ORG_STEMS) {
    const ours = stem.slice(0, -1) + 'تنا'; // شركه ← شركتنا
    if (OUR_PREFIXES.some((p) => t === p + ours)) return true;
    if (FOR_PREFIXES.some((p) => t === p + stem)) return true;
    if ((t === stem || t === 'ال' + stem) && (WE_WORDS.includes(prev) || prev === 'ل')) return true; // «لـ شركة» بعد التوحيد «ل شركه»
  }
  return false;
}
// عدد أكبر من 1 مع شخص أو مقعد أو مشارك (15 مقعد، 10 أشخاص، 20 participants)
const COUNT_RX = /(^|\s)([2-9]|[1-9]\d+)\s+(مقعد|مقاعد|شخص|اشخاص|مشارك|مشاركين|متدرب|متدربين|قائد|قاده|seat|seats|people|persons|participants|users|leaders)(\s|$)/;
export function orgSignal(q: string) {
  const norm = normalizeText(q);
  const tokens = norm.split(' ');
  return hasWord(q, COLLECTIVE_WORDS) || COUNT_RX.test(norm) || tokens.some((t, i) => orgToken(t, tokens[i - 1] ?? ''));
}

// طلب سعر لجهة أو لعدة مقاعد، ونطاقه:
// 'leaders': برنامج القادة بعينه (سماه، أو صفحته ولم يسم غيره): لا رقم ولا تقدير ولا المصفوفة بديلًا، ويُحوَّل.
// 'open': لم يتضح المنتج (صفحة مشتركة بلا منتج مسمى، أو سمى المنتجين): لا رقم لبرنامج القادة، وتُسأل القاعدة 5 أي المنتجين،
//          وأسعار المصفوفة المنشورة (ومنها خطة المؤسسات) تُذكر إن قصدها.
// false: ليس طلب جهة، أو هو عن المصفوفة وحدها (أسعارها المنشورة تشمل خطة المؤسسات).
export type OrgQuote = false | 'leaders' | 'open';
export function orgQuote(q: string, product: Product): OrgQuote {
  if (!asksPrice(q) || !orgSignal(q)) return false;
  const named = mentionedProduct(q);
  if (named === 'matrix') return false;
  if (named === 'leaders') return 'leaders';
  if (named === 'both') return 'open';
  if (product === 'matrix') return false;
  return product === 'leaders' ? 'leaders' : 'open';
}
