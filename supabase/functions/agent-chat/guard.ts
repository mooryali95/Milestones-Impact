// ════════════════════════════════════════════════════════════════
// حارس المخرج بعد النموذج: الأسعار والادعاءات والبيانات الحساسة، بالجملة كاملة
// ════════════════════════════════════════════════════════════════
// sanitizeOutput (redact.ts) يحجب الرموز (بريد، رابط، هاتف). وهذا يحرس المعنى: كل جملة فيها مبلغ بعملة ليس في المعرفة
// ولا في السعر الحي، أو ادعاء محظور (claims.ts)، تُستبدل كلها بالحقيقة المعتمدة بلغة الرد، وكل رقم هوية أو بطاقة أو آيبان
// يُحجب. حتمي ونقي، فيعمل أثناء البث (StreamSanitizer بالجمل) وبعده، ويُختبر وحده. الحارس هو الضمان، والتعليمات تقلل
// الحاجة إليه: المخالفة تُسجَّل، ويُعاد توليد الرد مرة واحدة بملاحظة تصحيح (handler.ts).
import { FAQ, KNOWLEDGE, TOPIC_FACTS } from './knowledge.js';
import { claimKinds, type ClaimKind } from './claims.ts';
import { AMOUNT, normalizeDigits, redactInput, SENTENCE_END } from './redact.ts';
import type { Product } from './faq.ts';
import type { Topic } from './router.ts';

// hours: رقم ساعات أو ساعات عمل الفريق في رد عن ساعات التدريب (تُستبدل الجملة بالحقيقة، بلا إعادة توليد)
export type Violation = 'price' | ClaimKind | 'pii' | 'marker' | 'hours';

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

// حقيقة الموضوع من مصدرها (facts.json عبر knowledge.js) بلغة الرد
export const topicFact = (t: Topic | 'org_quote_open', lang: 'ar' | 'en'): string => (TOPIC_FACTS as Record<string, { ar: string; en: string }>)[t][lang];
// في رد عن ساعات التدريب: رقم ساعات، أو وقت (9:00)، أو ساعات عمل الفريق ودوامه. «4 أيام تدريبية» مدة مرحلة تبقى
export const HOURS_BAD = /\d+\s*ساع|\b\d+\s*(?:[A-Za-z-]+\s+){0,2}hours?\b|\b\d{1,2}:\d{2}\b|\b(?:office|working|business|opening|team)\s+hours\b|ساعات\s+(?:ال)?عمل|[اأ]وقات\s+(?:ال)?عمل|الدوام/i;

export type GuardCtx = { allow: ReadonlySet<number>; lang: 'ar' | 'en'; product?: Product; topics?: readonly Topic[] };
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
    const hours = !!o.topics?.includes('training_hours') && HOURS_BAD.test(s);
    if (hours) v.add('hours');
    if (!kinds.length && !hours) {
      // جملة سليمة تحيل إلى شاشة الدفع: جملة سعر مخالفة بعدها تُحذف بلا تكرار الحقيقة
      if (!amounts.length && CHECKOUT.test(s)) used.add(FACTS.price[o.lang]);
      return s;
    }
    kinds.forEach((k) => v.add(k));
    const trail = s.match(/\s*$/)?.[0] ?? '';
    const lead = s.match(/^\s*/)?.[0] ?? '';
    const priceFact = o.product === 'matrix' || inMatrix ? MATRIX_PRICE_FACT : FACTS.price;
    const facts = [...kinds.map((k) => (k === 'price' ? priceFact : FACTS[k])[o.lang]), ...(hours ? [topicFact('training_hours', o.lang)] : [])].filter((f) => !used.has(f));
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
  hours: 'ذكرت رقم ساعات أو ساعات عمل الفريق في جواب عن ساعات التدريب: ساعات التدريب تُضبط مع كل جهة وفق برنامجها بلا رقم، وساعات عمل الفريق ليست مواعيد التدريب.',
};

// ما يثبت أن الرد حمل حقيقة الموضوع، وإلا أُلحقت به من مصدرها (ensureTopics)
const TOPIC_MUST: Record<Topic, { ar: RegExp; en: RegExp }> = {
  training_hours: { ar: /جه[ةه]|الجهات/, en: /organi[sz]ation/i },
  assessment_vs_program: { ar: /مستشار|يومي عمل/, en: /advisor|two working days/i },
  projects_start: { ar: /تقييم[\s\u0640]*مبدئي/, en: /initial assessment/i },
  identity: { ar: /آلي|مساعد/, en: /automated|assistant/i },
};
// الرد النهائي يحمل حقيقة كل موضوع عُرف في السؤال: إن غابت دلالتها أُلحقت الحقيقة بنصها المعتمد. حتمي، بعد الحارس
export function ensureTopics(text: string, topics: readonly Topic[], lang: 'ar' | 'en'): { text: string; added: Topic[] } {
  let out = String(text ?? '').trim();
  const added: Topic[] = [];
  for (const t of topics) {
    if (TOPIC_MUST[t][lang].test(out)) continue;
    const f = topicFact(t, lang);
    out = out ? `${out}\n\n${f}` : f;
    added.push(t);
  }
  return { text: out, added };
}
export const correctionNote = (vs: Violation[]) => `- تصحيح من الخادم: ردك السابق خالف القواعد، فأعد كتابته كاملًا. ${vs.map((x) => NOTE[x]).join(' ')}`;
