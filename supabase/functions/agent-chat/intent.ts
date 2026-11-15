// ════════════════════════════════════════════════════════════════
// قرارات الخادم قبل النموذج: لغة الرد، وهل السؤال عن سعر، وهل هو طلب سعر لجهة أو لعدة مقاعد
// ════════════════════════════════════════════════════════════════
// حتمية بلا نموذج، فتُختبر وحدها. لغة الرد تُحسب في الخادم وتُمرَّر إلى النموذج صراحة في سياق الخادم (كان النموذج
// يستنتجها وآخر ما يقرؤه سياق عربي، فينجرف إلى العربية في الرد على سؤال إنجليزي). الأصل لغة رسالة الزائر، فإن طلب
// الزائر صراحة لغة بعينها («جاوبني بالإنجليزي»، "please answer in Arabic"، "reply in French") فهي لغة الرد، ويبقى
// طلبه ساريًا في المحادثة حتى يطلب غيرها (قرار المالك 15 نوفمبر 2026: كن مرنًا). تغيير اللغة لا يغير شيئًا من القواعد.
import { hasWord, mentionedProduct, messageIsArabic, normalizeText, type Product } from './faq.ts';

// لغة النصوص الثابتة في الواجهة (الوعد والسقف والخطأ): عربية أو إنجليزية
export type Lang = 'ar' | 'en';

// اللغات التي يُستجاب لطلبها الصريح: اسمها بالعربية وبالإنجليزية، وجذورها بعد التوحيد (بلا «ال» ولا «ب»)
export const LANGS = {
  ar: { ar: 'العربية', en: 'Arabic', stems: ['عربي', 'عربيه'], words: ['arabic'] },
  en: { ar: 'الإنجليزية', en: 'English', stems: ['انجليزي', 'انجليزيه', 'انقليزي', 'انقليزيه', 'انكليزي', 'انكليزيه', 'انجلش', 'انقلش', 'انجلزي'], words: ['english'] },
  fr: { ar: 'الفرنسية', en: 'French', stems: ['فرنسي', 'فرنسيه', 'فرنساوي'], words: ['french'] },
  es: { ar: 'الإسبانية', en: 'Spanish', stems: ['اسباني', 'اسبانيه'], words: ['spanish'] },
  de: { ar: 'الألمانية', en: 'German', stems: ['الماني', 'المانيه'], words: ['german'] },
  tr: { ar: 'التركية', en: 'Turkish', stems: ['تركي', 'تركيه'], words: ['turkish'] },
  ur: { ar: 'الأردية', en: 'Urdu', stems: ['اردو', 'اورديه', 'ارديه'], words: ['urdu'] },
  hi: { ar: 'الهندية', en: 'Hindi', stems: ['هندي', 'هنديه'], words: ['hindi'] },
  fa: { ar: 'الفارسية', en: 'Persian', stems: ['فارسي', 'فارسيه'], words: ['persian', 'farsi'] },
  id: { ar: 'الإندونيسية', en: 'Indonesian', stems: ['اندونيسي', 'اندونيسيه'], words: ['indonesian'] },
  ms: { ar: 'الملايوية', en: 'Malay', stems: ['ملايو', 'ماليزي', 'ماليزيه'], words: ['malay'] },
  zh: { ar: 'الصينية', en: 'Chinese', stems: ['صيني', 'صينيه'], words: ['chinese', 'mandarin'] },
  ru: { ar: 'الروسية', en: 'Russian', stems: ['روسي', 'روسيه'], words: ['russian'] },
  it: { ar: 'الإيطالية', en: 'Italian', stems: ['ايطالي', 'ايطاليه'], words: ['italian'] },
  pt: { ar: 'البرتغالية', en: 'Portuguese', stems: ['برتغالي', 'برتغاليه'], words: ['portuguese'] },
  bn: { ar: 'البنغالية', en: 'Bengali', stems: ['بنغالي', 'بنغاليه'], words: ['bengali', 'bangla'] },
} as const;
export type ReplyLang = keyof typeof LANGS;
export const uiLang = (l: ReplyLang): Lang => (l === 'ar' ? 'ar' : 'en');

// فعل يخص الرد أو الحديث، أو عبارة تأدب: بدونهما ذكر اللغة سؤال عنها («هل البرنامج بالإنجليزي؟») لا طلب
const AR_ASK = ['جاوب', 'اجب', 'رد', 'اكتب', 'كلمني', 'كلمنا', 'تكلم', 'حدثني', 'تحدث', 'خاطب', 'ترجم', 'اشرح', 'تواصل معي'];
const AR_PLEASE = ['لو سمحت', 'لوسمحت', 'من فضلك', 'فضلا', 'رجاء', 'ياليت', 'يا ليت'];
const AR_LANG_PREFIX = ['', 'ال', 'ب', 'بال', 'باللغه ال', 'بلغه', 'اللغه ال'];
const EN_NAMES = Object.entries(LANGS).flatMap(([code, l]) => l.words.map((w) => [w, code as ReplyLang] as const));
const EN_ALT = EN_NAMES.map(([w]) => w).join('|');
const EN_RX = [
  new RegExp(`\\b(?:reply|respond|answer|write|speak|talk|explain|translate|continue|switch|chat|communicate)\\b[^.?!\\n]{0,24}?\\b(?:in|into|to)\\s+(${EN_ALT})\\b`, 'i'),
  new RegExp(`\\b(?:in|use)\\s+(${EN_ALT})\\s*,?\\s*(?:please|pls|only)\\b`, 'i'),
  new RegExp(`\\bplease\\s+(?:in|use)\\s+(${EN_ALT})\\b`, 'i'),
];

// اللغة التي طلبها الزائر صراحة في رسالته، أو null
export function requestedLang(message: string): ReplyLang | null {
  const raw = String(message ?? '');
  for (const rx of EN_RX) {
    const m = raw.match(rx);
    if (m) return EN_NAMES.find(([w]) => w === m[1].toLowerCase())?.[1] ?? null;
  }
  const norm = normalizeText(raw);
  const tokens = norm.split(' ');
  const asks = tokens.some((t) => { const bare = t.replace(/^(وال|فال|ال|و|ف)/, ''); return AR_ASK.some((s) => !s.includes(' ') && (t.startsWith(s) || bare.startsWith(s))); })
    || [...AR_ASK, ...AR_PLEASE].some((p) => p.includes(' ') && ` ${norm} `.includes(` ${p} `));
  if (!asks) return null;
  // أول ذكر للغة مسبوق بالباء («بالإنجليزي»، «باللغة الفرنسية») أولى، فـ«اكتب بالإنجليزية وتجاهل العربية» إنجليزية
  let loose: ReplyLang | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const two = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : '';
    for (const [code, l] of Object.entries(LANGS) as [ReplyLang, (typeof LANGS)[ReplyLang]][]) {
      for (const s of l.stems) {
        for (const p of AR_LANG_PREFIX) {
          const hit = p.includes(' ') ? two === p + s : tokens[i] === p + s;
          if (!hit) continue;
          if (p.startsWith('ب')) return code;
          loose ??= code;
        }
      }
    }
  }
  return loose;
}

// لغة رسالة واحدة: المطلوبة صراحة، وإلا لغة نصها
export const replyLang = (message: string): ReplyLang => requestedLang(message) ?? (messageIsArabic(message) ? 'ar' : 'en');

// لغة الرد في المحادثة: طلب صريح في الرسالة الأخيرة، وإلا آخر طلب صريح في رسائل الزائر السابقة، وإلا لغة الرسالة الأخيرة
export function conversationLang(visitorMessages: string[]): ReplyLang {
  const last = visitorMessages[visitorMessages.length - 1] ?? '';
  for (let i = visitorMessages.length - 1; i >= 0; i--) {
    const r = requestedLang(visitorMessages[i]);
    if (r) return r;
  }
  return messageIsArabic(last) ? 'ar' : 'en';
}

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
