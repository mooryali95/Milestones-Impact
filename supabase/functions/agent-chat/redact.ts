// ════════════════════════════════════════════════════════════════
// الحجب قبل النموذج، وفحص المخرج قبل الزائر
// ════════════════════════════════════════════════════════════════
// قبل النموذج (وقبل الحفظ): الأرقام تُوحَّد أولًا (العربية الهندية والفارسية إلى 0-9)، ثم يُحجب رقم الهوية
// أو الإقامة (10 أرقام تبدأ بـ 1 أو 2) ورقم البطاقة (13 إلى 19 رقمًا يجتاز فحص Luhn) والآيبان السعودي،
// ولو كُتبت بمسافات أو شرطات بينها، وكلمة المرور بعد ذكرها («كلمة المرور: ...»، "password is ...").
// بعد النموذج: لا بريد إلا بريد الشركة المنشور، ولا رقم هاتف (لا رقم منشور للشركة)، ولا رابط خارج مواقع
// المنظومة في SITES (بلا لوحة الإدارة). الحجب يستبدل ولا يحذف بصمت، فيرى الزائر أن شيئًا حُجب.
import { SITES } from '../_shared/sites.js';

export const COMPANY_EMAIL = 'mi@sunkvalue.com';
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  Object.entries(SITES).filter(([k]) => k !== 'admin').map(([, u]) => new URL(u as string).host),
);

const DIGITS: Record<string, string> = {};
'٠١٢٣٤٥٦٧٨٩'.split('').forEach((d, i) => { DIGITS[d] = String(i); });
'۰۱۲۳۴۵۶۷۸۹'.split('').forEach((d, i) => { DIGITS[d] = String(i); });
export const normalizeDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d]);

export function luhn(num: string) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return num.length >= 13 && sum % 10 === 0;
}

export const MASK = { id: '[رقم هوية محجوب]', card: '[رقم بطاقة محجوب]', iban: '[آيبان محجوب]', secret: '[كلمة مرور محجوبة]' };

// تسلسل أرقام تفصلها مسافات أو شرطات أو نقاط: يُجمع ثم يُفحص مجموعه
const DIGIT_RUN = /\d(?:[\s\-.]?\d){8,22}/g;
const IBAN = /\bSA\s?\d{2}(?:[\s-]?[0-9A-Z]){18,26}/gi;
// كلمة المرور بعد ذكرها وفاصل صريح (هي، is، النقطتان، =). السر رمز يشبه كلمة مرور: فيه رقم أو رمز، أو حرف كبير بعد صغير
// ("Secret123"، "p@ss"، "myPass"). الكلمة العادية لا تُحجب ("password is wrong"، "password is required"، «نسيت كلمة المرور»)،
// وكلمة مرور من حروف صغيرة وحدها ("sunshine") لا تُكشف: التحويل الخاطئ يقطع جوابًا كان متاحًا
const SECRET = /((?:كلمة|كلمه)\s+(?:المرور|السر|مروري|سري)|الباسورد|باسوردي|الرقم السري|\bpass(?:word|code)\b|\bpwd\b)(\s*(?:هي|هو|is|=|:)\s*)([^\s،,]{4,64})/gi;
const secretLike = (tok: string) => {
  const t = tok.replace(/[.!?؟:;)]+$/, '');
  if (t.length < 4 || /[؀-ۿ]/.test(t)) return false;
  return /\d/.test(t) || /[^\p{L}\p{N}]/u.test(t) || /\p{Ll}\p{Lu}/u.test(t);
};

// secret: false في المخرج (guard.ts): رد المساعد لا يحوي كلمة مرور، و"No password is needed" جملة سليمة
export function redactInput(text: string, o: { secret?: boolean } = {}): { text: string; hits: string[] } {
  const hits: string[] = [];
  let t = normalizeDigits(String(text ?? ''));
  t = t.replace(IBAN, () => { hits.push('iban'); return MASK.iban; });
  if (o.secret !== false) {
    t = t.replace(SECRET, (m, label: string, sep: string, tok: string) => {
      if (!secretLike(tok)) return m;
      hits.push('secret');
      return `${label}${sep}${MASK.secret}`;
    });
  }
  t = t.replace(DIGIT_RUN, (run) => {
    const d = run.replace(/\D/g, '');
    if (d.length === 10 && /^[12]/.test(d)) { hits.push('id'); return MASK.id; }
    if (d.length >= 13 && d.length <= 19 && luhn(d)) { hits.push('card'); return MASK.card; }
    return run;
  });
  return { text: t, hits };
}

// المبلغ بعملة كما يكتبه أحد: العملة قبل الرقم ($ وUSD وSAR و€ وEUR وAED و﷼، أو «ريال 1500») أو بعده (دولار وريال
// ودرهم وجنيه ويورو وUSD وSAR وEUR وAED). مصدر واحد لتحييد رقم الزائر هنا ولحارس الأسعار في المخرج (guard.ts).
// المبلغ بالكلمات ("fifteen hundred riyals") لا يُكشف.
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';
export const AMOUNT = new RegExp(
  `(?:(?:US\\$|\\$|€|﷼|\\bUSD|\\bSAR|\\bEUR|\\bAED|\\bSR|ريال|دولار|درهم|يورو)\\s?${NUM})|(?:${NUM}\\s?(?:دولار(?:ًا|ا)?|\\$|€|﷼|USD|SAR|EUR|AED|ريال(?:ًا|ا)?|ر\\.س|درهم(?:ًا|ا)?|د\\.إ|جنيه(?:ًا|ا)?|يورو|dollars?|riyals?|dirhams?|euros?|SR\\b))`,
  'gi',
);
export const NEUTRAL_AMOUNT = { ar: '[مبلغ ذكره الزائر]', en: '[an amount the visitor mentioned]' };
// قبل النموذج وحده (لا في الحفظ): المبلغ الذي يقترحه الزائر لا يصل النموذج، فلا يملك رقمًا يكرره ولو نافيًا (r04).
// المحفوظ للفريق يبقى كما كتبه الزائر بعد الحجب. الرمز بلغة الرد، فلا يدخل نص عربي ردًا إنجليزيًا.
export const neutralizeAmounts = (text: string, lang: 'ar' | 'en' = 'ar') => normalizeDigits(String(text ?? '')).replace(AMOUNT, () => NEUTRAL_AMOUNT[lang]);

// ── فحص المخرج ──
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// رابط بمخطط، أو نطاق مجرد بلاحقة معروفة (example.com/x)
const URL_RE = /\bhttps?:\/\/[^\s<>()"'،]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|sa|ai|co|me|app|dev|info|biz|gov|edu)(?:\/[^\s<>()"'،]*)?/gi;
// رقم هاتف: 7 أرقام فأكثر مع فواصل، أو يبدأ بـ + أو 05 أو 9665
const PHONE = /(?:\+|00)?\d[\d\s\-()]{6,18}\d/g;

export const OUT_MASK = { email: '[بريد محجوب]', link: '[رابط محجوب]', phone: '[رقم محجوب]' };

function hostOf(u: string) {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.toLowerCase(); } catch { return ''; }
}

export function sanitizeOutput(text: string): { text: string; hits: string[] } {
  const hits: string[] = [];
  let t = normalizeDigits(String(text ?? ''));
  // بريد الشركة يُحفظ برمز مؤقت فلا يعامل نطاقه رابطًا، ثم يُعاد
  const KEEP = '\u0000CO\u0000';
  t = t.replace(EMAIL, (m) => {
    if (m.toLowerCase() === COMPANY_EMAIL) return KEEP;
    hits.push('email');
    return OUT_MASK.email;
  });
  t = t.replace(URL_RE, (m) => {
    const trail = m.match(/[.,;:!?]+$/)?.[0] ?? '';
    const core = trail ? m.slice(0, -trail.length) : m;
    if (ALLOWED_HOSTS.has(hostOf(core))) return m;
    hits.push('link');
    return OUT_MASK.link + trail;
  });
  t = t.replace(PHONE, (m) => {
    const d = m.replace(/\D/g, '');
    // أعداد وسنوات ومبالغ مثل 2026/2027 أو 5,000 ليست هواتف: الهاتف 9 أرقام فأكثر
    if (d.length < 9) return m;
    hits.push('phone');
    return OUT_MASK.phone;
  });
  // أوامر سلاك (<!channel> و<@U123>) لا تمر نصًا قد يُنشر لاحقًا
  t = t.replace(/<[!@#][^>\s]{1,40}>/g, () => { hits.push('mention'); return ''; });
  return { text: t.split(KEEP).join(COMPANY_EMAIL), hits };
}

// حد الجملة: بعد نقطة أو علامة استفهام أو تعجب تليها مسافة، أو بعد سطر جديد. نقطة الرابط (leaders.sunkvalue.com) ليست حدًا.
export const SENTENCE_END = /(?<=[.!?؟])(?=\s)|(?<=\n)/;
// آخر حد جملة في النص (موضع بعده)، أو 0
function lastSentenceEnd(t: string) {
  let end = 0;
  const rx = /[.!?؟](?=\s)|\n/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(t))) end = m.index + 1;
  return end;
}

// فحص المخرج أثناء البث: يُحبس ذيل قصير حتى أول فاصل بعده، فلا يخرج بريد أو رابط أو رقم قبل اكتماله.
// النص النهائي (finish) هو المحفوظ والمرسل في حدث done، فيستبدل الزائر ما بثه به.
// sentences: لا يخرج إلا ما تم من جمل، لأن حراس المخرج (guard.ts) تستبدل الجملة كلها، فلا تتغير جملة بعد بثها.
export class StreamSanitizer {
  private raw = '';
  private sent = 0;
  private out = '';
  // النص المفحوص لم يعد يبدأ بما بُث (تحويل غير ثابت على البادئة): يتوقف البث، والنص النهائي في done يستبدله
  private diverged = false;
  // pre: تحويل على النص الخام كله قبل الفحص (نزع علامة التحويل مثلًا، ولو وصلت مقسومة بين دفعتين)
  constructor(private readonly hold = 48, private readonly pre: (t: string) => string = (t) => t, private readonly sentences = false) {}
  push(delta: string): string {
    this.raw += delta;
    if (this.diverged) return '';
    const clean = sanitizeOutput(this.pre(this.raw)).text;
    if (!clean.startsWith(this.out)) { this.diverged = true; return ''; }
    let end = clean.length - this.hold;
    if (end <= this.sent) return '';
    // يقف عند آخر مسافة قبل الحد، أو عند آخر جملة تامة
    const ws = clean.lastIndexOf(' ', end);
    const nl = clean.lastIndexOf('\n', end);
    end = this.sentences ? Math.min(lastSentenceEnd(clean), Math.max(ws, nl)) : Math.max(ws, nl);
    if (end <= this.sent) return '';
    const out = clean.slice(this.sent, end);
    this.sent = end;
    this.out += out;
    return out;
  }
  finish(): { text: string; tail: string; hits: string[]; diverged: boolean } {
    const r = sanitizeOutput(this.pre(this.raw));
    if (!r.text.startsWith(this.out)) this.diverged = true;
    const tail = this.diverged ? '' : r.text.slice(this.sent);
    this.sent = r.text.length;
    return { text: r.text, tail, hits: r.hits, diverged: this.diverged };
  }
}
