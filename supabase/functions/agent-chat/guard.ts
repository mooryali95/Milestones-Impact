// ════════════════════════════════════════════════════════════════
// حارس المخرج بعد النموذج: الأسعار والادعاءات والبيانات الحساسة، بالجملة كاملة
// ════════════════════════════════════════════════════════════════
// sanitizeOutput (redact.ts) يحجب الرموز (بريد، رابط، هاتف). وهذا يحرس المعنى: كل جملة فيها مبلغ بعملة ليس في المعرفة
// ولا في السعر الحي، أو ادعاء محظور (claims.ts)، تُستبدل كلها بالحقيقة المعتمدة بلغة الرد، وكل رقم هوية أو بطاقة أو آيبان
// يُحجب. حتمي ونقي، فيعمل أثناء البث (StreamSanitizer بالجمل) وبعده، ويُختبر وحده. الحارس هو الضمان، والتعليمات تقلل
// الحاجة إليه: المخالفة تُسجَّل، ويُعاد توليد الرد مرة واحدة بملاحظة تصحيح (handler.ts).
import { FAQ, KNOWLEDGE } from './knowledge.js';
import { claimKinds, type ClaimKind } from './claims.ts';
import { AMOUNT, normalizeDigits, redactInput, SENTENCE_END } from './redact.ts';
import type { Product } from './faq.ts';

export type Violation = 'price' | ClaimKind | 'pii' | 'marker';

const value = (s: string) => Number(String(s).replace(/,/g, ''));
export function amountsIn(text: string): number[] {
  return [...normalizeDigits(String(text ?? '')).matchAll(AMOUNT)].map((m) => value(m[1] ?? m[2])).filter((n) => Number.isFinite(n));
}
// المبالغ المنشورة في المعرفة والأجوبة الجاهزة (أسعار المصفوفة). مسموحة في سياق المصفوفة وحده: في محادثة المصفوفة،
// أو بعد ذكرها في الرد حتى هذه الجملة. فلا يمر «برنامج القادة بـ 200 دولار» في محادثة البرنامج
export const PUBLISHED_AMOUNTS: ReadonlySet<number> = new Set(amountsIn([KNOWLEDGE, ...(FAQ as { ar: string; en: string }[]).flatMap((e) => [e.ar, e.en])].join('\n')));
// المسموح لهذا الرد في كل جملة: السعر الحي إن مُرِّر في سياق الخادم
export const allowedAmounts = (live: string | null): ReadonlySet<number> => new Set(amountsIn(live ?? ''));
const MATRIX = /مصفوف|matrix/i;
const CHECKOUT = /شاشة الدفع|checkout/i;

type Fact = { ar: string; en: string };
export const FACTS: Record<'price' | ClaimKind, Fact> = {
  price: { ar: 'تظهر رسوم البرنامج في شاشة الدفع بعد التسجيل.', en: 'The programme fees are shown on the checkout screen after registration.' },
  accreditation: {
    ar: 'شهادة البرنامج «شهادة إتمام بنجاح» يصدرها البرنامج نفسه برقم تحقق عام، وليس لها اعتماد خارجي.',
    en: 'The programme certificate is a certificate of successful completion issued by the programme itself with a public verification number, and it has no external accreditation.',
  },
  residency: { ar: 'تُحفظ بيانات المنصة اليوم في مومباي بالهند، خارج المملكة العربية السعودية.', en: 'Platform data is stored today in Mumbai, India, outside Saudi Arabia.' },
  guarantee: { ar: 'لا أعد بنتيجة ولا استرداد ولا خصم، والمرجع السياسات المنشورة.', en: 'I cannot promise any outcome, refund or discount; the published policies apply.' },
};
// حقيقة السعر في سياق المصفوفة: أسعارها المنشورة (لا «شاشة الدفع» التي تخص البرنامج)
export const MATRIX_PRICE_FACT: Fact = {
  ar: 'أسعار مصفوفة التأثير المنشورة: الخطة الفردية 200 دولار أمريكي سنويًا، وخطة المؤسسات 5,000 دولار أمريكي سنويًا.',
  en: 'Impact Matrix published prices: Individual 200 USD per year, and Organisations 5,000 USD per year.',
};

export type GuardCtx = { allow: ReadonlySet<number>; lang: 'ar' | 'en'; product?: Product };
// يفحص الرد ويصلحه: الجمل المخالفة تُستبدل بالحقيقة (مرة واحدة لكل حقيقة)، والبيانات الحساسة تُحجب.
// كل جملة تُقرر بما قبلها وحده (لا نظر إلى ما بعدها)، فالبث بالجمل (StreamSanitizer) لا يغير جملة بعد بثها.
// product غائب: أسعار المصفوفة مسموحة دائمًا (الاستعمال بلا سياق محادثة)
export function guardReply(text: string, o: GuardCtx): { text: string; violations: Violation[] } {
  const v = new Set<Violation>();
  const used = new Set<string>();
  const parts = normalizeDigits(String(text ?? '')).split(SENTENCE_END);
  let matrixSeen = !o.product || o.product === 'matrix';
  const out = parts.map((s) => {
    const inMatrix = MATRIX.test(s);
    matrixSeen ||= inMatrix;
    const kinds: ('price' | ClaimKind)[] = claimKinds(s);
    const amounts = amountsIn(s);
    if (amounts.some((n) => !o.allow.has(n) && !(matrixSeen && PUBLISHED_AMOUNTS.has(n)))) kinds.push('price');
    if (!kinds.length) {
      // جملة سليمة تحيل إلى شاشة الدفع: جملة سعر مخالفة بعدها تُحذف بلا تكرار الحقيقة
      if (!amounts.length && CHECKOUT.test(s)) used.add(FACTS.price[o.lang]);
      return s;
    }
    kinds.forEach((k) => v.add(k));
    const trail = s.match(/\s*$/)?.[0] ?? '';
    const lead = s.match(/^\s*/)?.[0] ?? '';
    const priceFact = o.product === 'matrix' || inMatrix ? MATRIX_PRICE_FACT : FACTS.price;
    const facts = kinds.map((k) => (k === 'price' ? priceFact : FACTS[k])[o.lang]).filter((f) => !used.has(f));
    facts.forEach((f) => used.add(f));
    return facts.length ? `${lead}${facts.join(' ')}${trail}` : (trail.includes('\n') ? trail : '');
  }).join('');
  // رقم هوية أو بطاقة أو آيبان يُحجب. لا فحص كلمة مرور في المخرج: "No password is needed" جملة سليمة
  const r = redactInput(out, { secret: false });
  if (r.hits.length) v.add('pii');
  return { text: r.text, violations: [...v] };
}

// ملاحظة التصحيح لإعادة التوليد مرة واحدة: نوع المخالفة وحده، بلا نص الرد
const NOTE: Record<Violation, string> = {
  price: 'ذكرت مبلغًا ليس في المعرفة ولا في سياق الخادم، أو نسبت سعر المصفوفة إلى البرنامج: لا تذكر رقمًا لرسوم البرنامج إلا ما في سياق الخادم، وقل إن الرسوم تظهر في شاشة الدفع بعد التسجيل، وأسعار المصفوفة كما في المعرفة لها وحدها.',
  accreditation: 'نسبت إلى الشهادة اعتمادًا أو كررت ذكره: قل الحقيقة بصيغة موجبة فقط (شهادة إتمام بنجاح برقم تحقق عام، بلا اعتماد خارجي)، ولا تذكر كلمة الاعتماد الدولي أو المهني.',
  residency: 'ذكرت بقاء البيانات في المملكة: قل الحقيقة بصيغة موجبة فقط (تُحفظ اليوم في مومباي بالهند، خارج المملكة).',
  guarantee: 'وعدت أو ضمنت نتيجة أو استردادًا: لا وعد ولا ضمان، والمرجع السياسات المنشورة.',
  pii: 'كتبت رقم هوية أو بطاقة أو آيبان: لا تكتب أي رقم من هذا النوع.',
  marker: 'هذا السؤال يُجاب من المعرفة: أجب ولا تضع إشارة التحويل، ولك أن تذكر أن زر «تحدث مع الفريق» متاح.',
};
export const correctionNote = (vs: Violation[]) => `- تصحيح من الخادم: ردك السابق خالف القواعد، فأعد كتابته كاملًا. ${vs.map((x) => NOTE[x]).join(' ')}`;
