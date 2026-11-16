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

// الطلب الصريح: ذكر اللغة ملاصقًا لفعل رد موجه إلينا («جاوبني بالإنجليزي»، «اكتب لي بالفرنسية»، «رد علي بالإنجليزي»)
// أو لعبارة تأدب («بالعربي لو سمحت»)، لا يفصل بينهما إلا ضمير المخاطَب («لي»، «علي»، «معي»). ذكرها في سؤال عنها
// («هل البرنامج متاح بالإنجليزي؟»، «لو سمحت هل الشهادة بالإنجليزي؟»، «هل يمكن التحدث بالإنجليزي مع المدرب؟»،
// «رد الفريق بالإنجليزي ولا بالعربي؟») ليس طلبًا: الطلب يبقى ساريًا في المحادثة، فالخطأ فيه يقلب لغة ما بعده كله.
const AR_ASK = ['جاوب', 'اجب', 'رد', 'اكتب', 'كلمني', 'كلمنا', 'تكلم', 'حدثني', 'تحدث', 'خاطب', 'ترجم', 'اشرح', 'تواصل', 'ترد', 'تجاوب', 'تكتب', 'تشرح', 'تكلمني'];
// الاسم المعرف من الفعل («الرد»، «التحدث») طلب فقط بعد فعل إرادة: «ابي الرد باللغة الإنجليزية»
const AR_WANT = ['ابي', 'ابغي', 'ابغا', 'ابغى', 'اريد', 'ودي', 'نبي', 'نبغي', 'نريد', 'بغيت', 'ابيك', 'اريدك', 'ابغاك'].map(normalizeText);
const AR_PLEASE = ['لو سمحت', 'لوسمحت', 'من فضلك', 'فضلا', 'رجاء', 'رجاءا', 'ياليت', 'يا ليت'].map((p) => normalizeText(p).split(' '));
const AR_FILLER = new Set(['لي', 'علي', 'عليا', 'معي', 'معاي', 'لنا', 'علينا', 'معنا', 'كل', 'كلامك', 'الكلام', 'الرد', 'ردك', 'ردودك', 'فقط', 'بس', 'الحين', 'الان']);
const AR_LANG_PREFIX = ['ب', 'بال', 'باللغه ال', 'بلغه', 'لل', 'الي ال', 'ل', '', 'ال'];
const EN_NAMES = Object.entries(LANGS).flatMap(([code, l]) => l.words.map((w) => [w, code as ReplyLang] as const));
const EN_ALT = EN_NAMES.map(([w]) => w).join('|');
// فعل الرد موجه إلينا: في أول الجملة، أو بعد please أو you («Can you reply...»)، لا بعد فاعل آخر ("Can the trainer speak in Arabic?")
const EN_LEAD = String.raw`(?:^|[.?!:;,\n]|\b(?:please|pls|kindly|you|u|and|now|just|then|also|only)\b)\s*`;
const EN_RX = [
  new RegExp(`${EN_LEAD}(?:reply|respond|answer|write|speak|talk|explain|translate|continue|switch|chat|communicate)\\b[^.?!\\n]{0,24}?\\b(?:in|into|to)\\s+(${EN_ALT})\\b`, 'i'),
  new RegExp(`\\b(?:in|use)\\s+(${EN_ALT})\\s*,?\\s*(?:please|pls|only)\\b`, 'i'),
  new RegExp(`\\bplease\\s+(?:in|use)\\s+(${EN_ALT})\\b`, 'i'),
];

// ذكر لغة في الموضع i (كلمة أو كلمتان، «باللغة الفرنسية»): رمزها وعدد كلماتها، أو null
function langAt(tokens: string[], i: number): [ReplyLang, number] | null {
  const two = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : '';
  for (const [code, l] of Object.entries(LANGS) as [ReplyLang, (typeof LANGS)[ReplyLang]][]) {
    for (const s of l.stems) {
      for (const p of AR_LANG_PREFIX) {
        if (p.includes(' ') ? two === p + s : tokens[i] === p + s) return [code, p.includes(' ') ? 2 : 1];
      }
    }
  }
  return null;
}

const isAskVerb = (t: string) => { const b = t.replace(/^(و|ف)/, ''); return AR_ASK.some((s) => b.startsWith(s)); };
const isVerbNoun = (t: string) => { const b = t.replace(/^(وال|فال|ال)/, ''); return t !== b && AR_ASK.some((s) => b.startsWith(s)); };
// طول عبارة التأدب التي تبدأ عند i، أو 0
function pleaseAt(tokens: string[], i: number) {
  for (const p of AR_PLEASE) if (p.every((w, k) => tokens[i + k] === w)) return p.length;
  return 0;
}

// اللغة التي طلبها الزائر صراحة في رسالته، أو null
export function requestedLang(message: string): ReplyLang | null {
  const raw = String(message ?? '');
  for (const rx of EN_RX) {
    const m = raw.match(rx);
    if (m) return EN_NAMES.find(([w]) => w === m[1].toLowerCase())?.[1] ?? null;
  }
  const tokens = normalizeText(raw).split(' ').filter(Boolean);
  const question = tokens.includes('هل');
  for (let i = 0; i < tokens.length; i++) {
    // بعد فعل رد موجه إلينا، أو اسمه المعرف بعد فعل إرادة، ولا يفصل إلا ضمير المخاطب
    const verb = isAskVerb(tokens[i]) || (isVerbNoun(tokens[i]) && i > 0 && AR_WANT.includes(tokens[i - 1]));
    if (verb) {
      let j = i + 1;
      while (j < tokens.length && AR_FILLER.has(tokens[j]) && !langAt(tokens, j)) j++;
      const hit = j < tokens.length ? langAt(tokens, j) : null;
      // في سؤال لا يُعد إلا الفعل الموجه إلينا بضميره («هل ممكن تكلمني بالإنجليزي»)، و«بالعربي ولا بالإنجليزي؟» تخيير لا طلب
      const toUs = j > i + 1 || /(ني|نا)$/.test(tokens[i]);
      const choice = hit && ['ولا', 'او', 'or'].includes(tokens[j + hit[1]] ?? '');
      if (hit && !choice && (!question || toUs)) return hit[0];
    }
    // ملاصقًا لعبارة تأدب، قبلها أو بعدها، في غير سؤال («هل الشهادة بالإنجليزي لو سمحت؟» سؤال)
    const pl = question ? 0 : pleaseAt(tokens, i);
    if (pl) {
      const after = langAt(tokens, i + pl);
      if (after) return after[0];
      for (const back of [1, 2]) {
        const before = i - back >= 0 ? langAt(tokens, i - back) : null;
        if (before && before[1] === back) return before[0];
      }
    }
  }
  return null;
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
const PRICE_WORDS = ['سعر', 'اسعار', 'تكلفه', 'تكلفت', 'بكم', 'رسوم', 'رسم', 'مبلغ', 'يكلف', 'يكلفنا', 'يكلفني', 'تكلف', 'تكلفنا', 'تكلفني',
  'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees'];
// «كم» وhow much وحدهما تسألان عن المدة والعدد كذلك («وكم المدة؟»، «كم ساعات البرنامج»، "how much time"): ليستا سؤال سعر إن
// تلتهما مباشرة كلمة مدة أو عدد (المسؤول عنه). المدة في غير هذا الموضع ظرف للسعر («كم يكلفنا لمدة شهر؟»، «كم الاشتراك في
// السنة؟»، "how much per month"): سؤال سعر
const DURATION_WORDS = new Set(['مده', 'طول', 'يوم', 'ايام', 'اسبوع', 'اسابيع', 'شهر', 'اشهر', 'شهور', 'سنه', 'سنوات', 'ساعه', 'ساعات', 'دقيقه', 'دقائق',
  'مرحله', 'مراحل', 'عدد', 'جلسه', 'جلسات', 'يوما', 'ساعتين', 'يومين', 'time', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months']);
// الكلمة بلا «ال» وبلا لاحقة الضمير («المدة»، «مدته»، «مدتها»): ة صارت ه بالتوحيد، فـ«مدته» ← «مده»
const durationToken = (t: string | undefined) => {
  if (!t) return false;
  const b = t.replace(/^(ال|وال)/, '');
  return DURATION_WORDS.has(b) || DURATION_WORDS.has(b.replace(/(ته|تها|تهم)$/, 'ه'));
};
function howMuchAsksPrice(q: string) {
  const tokens = normalizeText(q).split(' ');
  for (let i = 0; i < tokens.length; i++) {
    if (['كم', 'وكم', 'فكم'].includes(tokens[i])) {
      if (!durationToken(tokens[i + 1])) return true;
    } else if (tokens[i] === 'how' && tokens[i + 1] === 'much') {
      if (!durationToken(tokens[i + 2])) return true;
    }
  }
  return false;
}
export const asksPrice = (q: string) => hasWord(q, PRICE_WORDS) || howMuchAsksPrice(q);

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
const PROGRAM_ONLY = ['برنامج', 'program', 'programme'];
export function orgQuote(q: string, product: Product): OrgQuote {
  if (!asksPrice(q) || !orgSignal(q)) return false;
  const named = mentionedProduct(q);
  if (named === 'matrix') return false;
  if (named === 'leaders') return 'leaders';
  if (named === 'both') return 'open';
  // «البرنامج» وحده اسم برنامج القادة (المصفوفة منصة لا برنامج): «أسعار البرنامج لجهتنا» في الرئيسية طلب سعر فيه
  if (hasWord(q, PROGRAM_ONLY)) return 'leaders';
  if (product === 'matrix') return false;
  return product === 'leaders' ? 'leaders' : 'open';
}
