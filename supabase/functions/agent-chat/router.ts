// ════════════════════════════════════════════════════════════════
// الموجّه الحتمي قبل النموذج: ما يُحوَّل دائمًا، وما يُجاب دائمًا، وما يُترك للنموذج
// ════════════════════════════════════════════════════════════════
// كان قرار التحويل كله بيد النموذج (إشارة [[HANDOFF]])، فكل تعديل في صياغة القاعدة 11 يرجّح «حوّل» أو «لا تحوّل»
// فيتأرجح (تقييم 2026-11-16 بعد #369). الموجّه يأخذ القرار في الحالات التي لا تحتمل الاجتهاد:
//   handoff: بيانات حساسة في الرسالة، وطلب استرداد لدفع تم، ومشكلة دفع، ورمز دخول لم يصل أو تعذر الدخول، وطلب صريح
//            لإنسان، والشكوى، وطلب حذف البيانات أو الاطلاع عليها، والتهديد القانوني أو الصحافة، وطلب التسجيل نيابة عنه.
//            يُرد برد ثابت بلغة الزائر بلا نموذج (لا تكلفة ولا تذبذب)، وتُعرض نافذة التحويل.
//   forced:  طلب سعر لجهة في برنامج القادة: النموذج يكتب الصياغة، والتحويل مفروض بعده مهما كتب.
//   answer:  سؤال عن سياسة أو لغتها، أو عن رمز الجهة الراعية، أو سعر لفرد: يُجاب، وإشارة التحويل من النموذج تُهمل.
//   free:    ما سوى ذلك: إشارة النموذج وحدها.
// الإيجابيات الكاذبة أخطر من السلبيات هنا (التحويل الخاطئ يقطع جوابًا كان متاحًا)، فكل فئة تشترط دلالتين معًا: فعل
// استرداد مع دفع تم، ورمز مع «لم يصل»، وفعل كلام مع شخص. السؤال عن السياسة («ما سياسة الاسترداد») لا يُحوَّل.
import { hasWord, mentionedProduct, messageIsArabic, normalizeText, type Product } from './faq.ts';
import { orgQuote } from './intent.ts';
import { SITES } from '../_shared/sites.js';

export type HandoffReason = 'pii' | 'refund' | 'payment' | 'account' | 'human' | 'complaint' | 'data' | 'legal' | 'register';
export type AnswerReason = 'policy' | 'nomination' | 'price';
export type Route =
  | { kind: 'handoff'; reason: HandoffReason }
  | { kind: 'forced'; reason: 'org_quote' }
  | { kind: 'answer'; reason: AnswerReason }
  | { kind: 'free' };

// النفي بعد واو العطف («دفعت وما انفتح»): العبارة المتصلة تُطابق بالمسافات، فتُضاف صيغتها بالواو
const withWaw = (xs: string[]) => xs.flatMap((x) => (/^(ما|لم|لا|مو) /.test(x) ? [x, `و${x}`] : [x]));

// ── الدلالات (تُوحَّد بـ normalizeText، والمطابقة بالكلمة وسوابقها ولواحقها في hasWord، أو بالعبارة المتصلة) ──
// دفع تم: أفعال ماضية وحدها («قبل ما أدفع» ليس دفعًا)
// الفرنسية في الفئات الأشد (الاسترداد والدفع وطلب إنسان): لغة ثالثة يكتب فيها النموذج والتحويل مفروض (handler.ts).
// لغات أخرى لا كلمات لها هنا: إشارة النموذج وحدها
const PAID = ['دفعت', 'دفعنا', 'سددت', 'سددنا', 'انخصم', 'انسحب المبلغ', 'خصم مني', 'خصمتوا', 'سحبتوا', 'حولت المبلغ', 'اشتريت', 'اشتركت',
  'paid', 'i was charged', 'been charged', 'got charged', 'charged me', 'you charged', 'bought', 'purchased', 'payment went through',
  'j ai payé', 'j ai paye', 'nous avons payé', 'j ai été débité', 'j ai acheté'];
// شرط قبل فعل الدفع («لو دفعت...»، "If I paid...") سؤال قبل الشراء لا دفع تم. «لما دفعت» و«بعد أن دفعت» و"when/after I paid"
// سرد لدفع تم، فليست شرطًا هنا
const CONDITIONAL = new Set(['لو', 'اذا', 'حال', 'if', 'suppose', 'supposing', 'si']);
const SUBJECT = new Set(['i', 'we', 'you', 'انا', 'احنا', 'نحن', 'already', 'have', 'had', 'je', 'j', 'ai', 'nous', 'avons', 'ما']);
const REFUND = ['استرداد', 'استرجاع', 'استرجع', 'استرد', 'نسترد', 'نسترجع', 'ارجاع', 'ترجعون', 'ترجعوا', 'refund', 'refunded', 'money back',
  'remboursement', 'rembourser', 'remboursé', 'rembourse'];
// مطالبة صريحة باسترداد قائم ولو بلا فعل دفع
const REFUND_DEMAND = ['ابي فلوسي', 'ابغي فلوسي', 'ابغا فلوسي', 'رجعوا فلوسي', 'ارجعوا فلوسي', 'رجعوا لي فلوسي', 'ارجعوا لي فلوسي', 'ابي ارجع فلوسي',
  'i want my money back', 'give me my money back', 'i want a refund', 'i need a refund', 'process my refund', 'refund me', 'refund my',
  'je veux un remboursement', 'je veux être remboursé', 'remboursez moi', 'rendez moi mon argent'];
const PAY_PROBLEM = withWaw(['ما انفتح', 'ما فتح', 'مافتح', 'لم يفتح', 'لم ينفتح', 'ما تفعل', 'ماتفعل', 'لم يتفعل', 'ما اشتغل', 'ما يشتغل', 'ما ظهر', 'لم يظهر',
  'ما اشوف', 'ما شفت', 'ما يطلع', 'ما وصلني', 'لم يصلني', 'ما وصل', 'لم يصل', 'not open', 'not opened', 'not active', 'not activated', 'no access', 'still locked',
  'not unlocked', 'double charged', 'not showing', 'not received', 'didn t receive', 'did not receive', 'not working', 'isn t working', 'doesn t work',
  'does not work', 'can t see', 'cannot see', 'can t access', 'cannot access', 'don t see', 'pas accès', 'ne fonctionne pas', 'ne marche pas']);
// مرتين مع دفع: خصم مكرر، إلا إن كان عن الإعادة («أعيده مرتين»)
const TWICE = ['مرتين', 'twice', 'deux fois'];
const RETAKE = ['اعيد', 'اعيده', 'اعيدها', 'اكرر', 'اكرره', 'اعاده', 'retake', 'repeat', 'redo', 'again'];
const PAY_WORDS = ['الدفع', 'دفعه', 'الدفعه', 'بطاقه', 'بطاقتي', 'البطاقه', 'payment', 'pay', 'card', 'checkout'];
const PAY_FAIL = withWaw(['فشل', 'فشلت', 'ما مشي', 'مامشي', 'ما نجح', 'لم ينجح', 'مرفوض', 'انرفض', 'رفضت', 'رفض', 'خطا', 'ما يقبل', 'مايقبل', 'ما قبل', 'معلق', 'تعلق',
  'failed', 'fails', 'failing', 'declined', 'rejected', 'error', 'not going through', 'doesn t go through', 'didn t go through', 'won t go through', 'stuck']);
// رمز الدخول أو بريده لم يصل
const CODE = ['رمز', 'الرمز', 'كود', 'الكود', 'رمز التحقق', 'رساله التحقق', 'ايميل', 'الايميل', 'البريد', 'بريد', 'otp', 'code', 'verification', 'email', 'login link', 'magic link'];
const NOT_ARRIVED = withWaw(['ما وصل', 'ماوصل', 'لم يصل', 'لم يصلني', 'ما وصلني', 'ماوصلني', 'ما جاني', 'ماجاني', 'ما يجيني', 'مايجيني', 'ما يوصل', 'مايوصل', 'لا يصل',
  'لا يصلني', 'ما يصلني', 'مايصلني', 'ما يوصلني', 'مايوصلني', 'didn t arrive', 'did not arrive', 'not received', 'never received', 'haven t received',
  'have not received', 'didn t get', 'did not get', 'not getting', 'never arrived', 'not arriving', 'isn t arriving', 'doesn t arrive', 'not coming', 'never came']);
// «ما يمديني» ضيق وقت لا تعذر دخول
const CANT = withWaw(['ما اقدر', 'ماقدر', 'ما قدرت', 'ماقدرت', 'لا استطيع', 'لا اقدر', 'مو قادر', 'تعذر', 'ما يدخلني', 'مايدخلني', 'ما يفتح حسابي',
  'can t', 'cannot', 'unable to', 'not able to', 'couldn t', 'won t let me']);
const LOGIN = ['ادخل', 'الدخول', 'دخول', 'تسجيل الدخول', 'حسابي', 'log in', 'login', 'sign in', 'signin', 'my account', 'access my account'];
const LOCKED = ['حسابي مقفل', 'حسابي موقوف', 'حسابي مغلق', 'انقفل حسابي', 'account locked', 'account is locked', 'locked out'];
// طلب إنسان: فعل كلام مع شخص، أو طلب مباشر
// «ابي اتواصل مع الفريق» طلب إنسان، و«كيف التواصل معكم» سؤال يُجاب: الرغبة المتكلمة وحدها
const TALK = ['اكلم', 'اتكلم', 'احكي', 'اتحدث', 'نكلم', 'نتكلم', 'ابي اتواصل', 'ابغي اتواصل', 'ابغا اتواصل', 'ابي التواصل', 'ابغي التواصل',
  'اريد التواصل', 'اريد ان اتواصل', 'ودي اتواصل', 'نبي نتواصل', 'نبغي نتواصل', 'talk to', 'speak to', 'speak with', 'talk with', 'chat with',
  'parler à', 'parler avec'];
const PERSON = ['احد', 'شخص', 'موظف', 'انسان', 'بشر', 'بشري', 'الفريق', 'فريق', 'مسؤول', 'خدمه العملاء', 'human', 'person', 'someone', 'somebody',
  'representative', 'agent', 'real person', 'your team', 'the team', 'staff', 'support', 'manager', 'quelqu un', 'humain', 'conseiller', 'équipe'];
// شخص الزائر نفسه («مديري»، "my manager") ليس طلب إنسان منا
const OWN_PERSON = /\b(?:my|our) (?:manager|boss|supervisor|team|staff)\b|(?:^|\s)(?:مديري|مسؤولي|مديرنا|فريقي|موظفيني|موظفينا)(?=\s|$)/g;
const HUMAN_DIRECT = ['حولني', 'حولوني', 'كلموني', 'اتصلوا علي', 'اتصلوا فيني', 'تواصلوا معي', 'يتواصل معي', 'يكلمني', 'call me', 'contact me', 'get back to me',
  'have someone contact me', 'connect me', 'transfer me', 'real human', 'live agent'];
const COMPLAINT = ['شكوي', 'اشتكي', 'اشكي', 'complaint', 'complain', 'complaining'];
// حذف الحساب أو البيانات بعبارة متصلة (الفعل ثم مفعوله): «أحذف خطة من حسابي» ليس طلب حذف بيانات
const DELETE_MINE = ['احذف حسابي', 'حذف حسابي', 'امسح حسابي', 'مسح حسابي', 'احذفوا حسابي', 'تحذفون حسابي', 'الغاء حسابي', 'حذف الحساب', 'احذف الحساب',
  'احذف بياناتي', 'حذف بياناتي', 'امسح بياناتي', 'مسح بياناتي', 'احذفوا بياناتي', 'حذف معلوماتي', 'احذف معلوماتي', 'delete my account', 'delete my data',
  'erase my data', 'remove my data', 'delete my information', 'delete my personal data', 'remove my account', 'close my account', 'delete all my data',
  'delete account', 'delete the account'];
const DATA_ACCESS = ['نسخه من بياناتي', 'اطلع علي بياناتي', 'الاطلاع علي بياناتي', 'export my data', 'copy of my data', 'access to my data', 'what data do you have on me'];
// تهديد قانوني أو استفسار صحفي بفعله، لا اسم جهة أو مهنة: «أعمل في النيابة العامة» و"I work at the Supreme Court" و«أنا إعلامي»
// زوار مرشحون للبرنامج
const LEGAL = ['المحامي', 'محاميي', 'محامينا', 'اوكل محامي', 'بوكل محامي', 'وكلت محامي', 'دعوي', 'مقاضاه', 'اقاضيكم', 'نقاضيكم', 'ارفع قضيه', 'رفع قضيه',
  'ارفع عليكم', 'اشتكيكم', 'my lawyer', 'our lawyer', 'my attorney', 'our attorney', 'lawsuit', 'sue you', 'sue', 'suing', 'legal action', 'take you to court',
  'see you in court', 'court case', 'استفسار صحفي', 'استفسار اعلامي', 'مقابله صحفيه', 'تصريح صحفي', 'اكتب تقرير عن', 'اكتب مقال عن', 'press inquiry',
  'media inquiry', 'press enquiry', 'media enquiry', 'journalist writing', 'writing about your', 'writing an article', 'for an article', 'for a story', 'interview request', 'avocat'];
const REGISTER_ME = ['سجلني', 'سجلوني', 'سجل لي', 'سجلو لي', 'اشترك لي', 'اشتركوا لي', 'register me', 'sign me up', 'enrol me', 'enroll me', 'sign up for me', 'register for me'];
// يُجاب دائمًا (السعر بكلماته الصريحة وحدها: «كم» وhow much تسأل عن المدة والعدد كذلك)
const POLICY = ['سياسه', 'سياسات', 'السياسه', 'شروط', 'الشروط', 'الخصوصيه', 'policy', 'policies', 'terms', 'privacy'];
const NOMINATION_CODE = ['رمز', 'الرمز', 'كود', 'الكود', 'رابط', 'code', 'link'];
const NOMINATION_ORG = ['جهه', 'جهتي', 'جهتنا', 'الجهه', 'الراعيه', 'رشحتني', 'رشحني', 'رشحوني', 'ترشيح', 'ترشيحي', 'sponsor', 'sponsoring', 'nominated', 'nomination', 'employer'];
// جانب الجهة («كيف نحصل على رمز لموظفينا»): يصدره الفريق، فلا يُجاب بجواب المرشح الجاهز (المعرفة للنموذج)
const NOMINATION_ISSUER = ['نحصل', 'نصدر', 'نطلب', 'موظفي', 'موظفينا', 'منسوبي', 'منسوبينا', 'موظفيها', 'منسوبيها', 'نرشح', 'our staff', 'our employees',
  'our team', 'our leaders', 'how do we', 'can we get', 'we are an employer', 'we are a company', 'issue a code', 'issue codes'];
const PRICE = ['سعر', 'اسعار', 'تكلفه', 'بكم', 'رسوم', 'رسم', 'مبلغ', 'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees'];

const any = (q: string, words: string[]) => hasWord(q, words);
// دفع تم: فعل دفع لا يسبقه شرط بكلمتين على الأكثر («لو دفعت»، «إذا أنا دفعت»، "if I paid", "once we have paid")
export function paidSignal(q: string): boolean {
  const tokens = normalizeText(q).split(' ');
  const keys = PAID.map(normalizeText);
  for (let i = 0; i < tokens.length; i++) {
    const rest = ` ${tokens.slice(i).join(' ')} `;
    if (!keys.some((k) => (k.includes(' ') ? rest.startsWith(` ${k} `) : hasWord(tokens[i], [k])))) continue;
    let j = i - 1;
    while (j >= 0 && i - j <= 3 && SUBJECT.has(tokens[j])) j--;
    const cond = j >= 0 && i - j <= 3 && (CONDITIONAL.has(tokens[j]) || /^[وف](?:لو|اذا)$/.test(tokens[j]));
    if (!cond) return true;
  }
  return false;
}

// hits: ما حجبه redactInput من الرسالة (هوية أو بطاقة أو آيبان أو كلمة مرور)
export function route(message: string, o: { hits?: string[]; product: Product }): Route {
  const q = String(message ?? '');
  if (o.hits?.length) return { kind: 'handoff', reason: 'pii' };
  if (!normalizeText(q)) return { kind: 'free' };
  const paid = paidSignal(q);
  // سؤال عن السياسة بلا مطالبة صريحة («ما سياسة الاسترداد إن دفعت؟») يُجاب
  if ((any(q, REFUND) && paid && !any(q, POLICY)) || any(q, REFUND_DEMAND)) return { kind: 'handoff', reason: 'refund' };
  const twice = any(q, TWICE) && !any(q, RETAKE);
  if ((paid && (any(q, PAY_PROBLEM) || twice)) || (any(q, PAY_WORDS) && any(q, PAY_FAIL))) return { kind: 'handoff', reason: 'payment' };
  if ((any(q, CODE) && any(q, NOT_ARRIVED)) || (any(q, CANT) && any(q, LOGIN)) || any(q, LOCKED)) return { kind: 'handoff', reason: 'account' };
  if (any(q, DATA_ACCESS) || any(q, DELETE_MINE)) return { kind: 'handoff', reason: 'data' };
  if (any(q, LEGAL)) return { kind: 'handoff', reason: 'legal' };
  if (any(q, COMPLAINT)) return { kind: 'handoff', reason: 'complaint' };
  const others = normalizeText(q).replace(OWN_PERSON, ' ');
  if ((any(q, TALK) && any(others, PERSON)) || any(q, HUMAN_DIRECT)) return { kind: 'handoff', reason: 'human' };
  if (any(q, REGISTER_ME)) return { kind: 'handoff', reason: 'register' };
  if (orgQuote(q, o.product) === 'leaders') return { kind: 'forced', reason: 'org_quote' };
  if (any(q, NOMINATION_CODE) && any(q, NOMINATION_ORG)) return any(q, NOMINATION_ISSUER) ? { kind: 'free' } : { kind: 'answer', reason: 'nomination' };
  if (any(q, POLICY)) return { kind: 'answer', reason: 'policy' };
  if (any(q, PRICE) && !orgQuote(q, o.product)) return { kind: 'answer', reason: 'price' };
  return { kind: 'free' };
}

// ── الردود الثابتة للتحويل: بلغة الزائر (العربية أو الإنجليزية)، وتنتهي بوعد الرد كما هو ──
const L = SITES.leaders;
const REFUND_FACTS = {
  leaders: {
    ar: `في برنامج إدارة المشروعات للقادة يُسترد رسم القياس المبدئي خلال 14 يومًا من الدفع وقبل بدء القياس، ورسم إكمال البرنامج خلال 14 يومًا من الدفع وقبل فتح الرحلة، والتفاصيل في ${L}/legal/refund .`,
    en: `In MI Leaders, the initial assessment fee is refundable within 14 days of payment and before the assessment starts, and the programme completion fee within 14 days of payment and before your journey opens. Details: ${L}/legal/refund .`,
  },
  matrix: {
    ar: `في مصفوفة التأثير استرداد كامل خلال 14 يومًا من الاشتراك إن لم يتم الوصول الكامل للمنهجية أو البدء في إنشاء خطة، والتفاصيل في ${SITES.mi}/refund.html .`,
    en: `In the Impact Matrix, a full refund is available within 14 days of subscribing if full access to the methodology has not been used and no plan has been started. Details: ${SITES.mi}/refund.html .`,
  },
};
const FORM = { ar: 'اترك اسمك وبريدك في النموذج أدناه وأحوله إلى الفريق مع هذه المحادثة.', en: 'Leave your name and email in the form below and I will pass it to our team with this conversation.' };
const FORM_ACCOUNT = { ar: 'اترك اسمك وبريد حسابك في النموذج أدناه وأحوله إلى الفريق مع هذه المحادثة.', en: 'Leave your name and your account email in the form below and I will pass it to our team with this conversation.' };

export function fixedReply(reason: HandoffReason, lang: 'ar' | 'en', promise: string, ctx: { message: string; product: Product }): string {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => (ar ? a : e);
  let body: string;
  switch (reason) {
    case 'pii':
      body = t(
        `حجبتُ ما كتبته من بيانات حساسة (رقم هوية أو بطاقة أو آيبان أو كلمة مرور)، فلم يُحفظ ولم يصل إلى أحد. لا ترسل هذه البيانات في المحادثة، فلا نطلبها هنا أبدًا، والتسجيل والدفع تتمهما بنفسك في ${L} وصفحة الدفع الآمنة بعده. وإن أردت مساعدة الفريق ف${FORM.ar}`,
        `I have masked the sensitive data you typed (an ID, card, IBAN or password), so it was not stored and did not reach anyone. Please do not send such data in this chat; we never ask for it here, and registration and payment are done by you at ${L} and on the secure checkout page after it. If you would like help from our team, ${FORM.en.charAt(0).toLowerCase()}${FORM.en.slice(1)}`,
      );
      break;
    case 'refund': {
      const named = mentionedProduct(ctx.message);
      const which = named === 'leaders' || named === 'matrix' ? named : (hasWord(ctx.message, ['القياس', 'assessment']) ? 'leaders' : (ctx.product === 'shared' ? 'both' : ctx.product));
      const facts = which === 'both' ? `${REFUND_FACTS.leaders[lang]} ${REFUND_FACTS.matrix[lang]}` : REFUND_FACTS[which][lang];
      body = t(
        `طلب استرداد رسوم دفعتها يتولاه الفريق، ولا أستطيع تنفيذه أو الاطلاع على دفعتك من هنا. للعلم: ${facts} ${FORM_ACCOUNT.ar} وأرفق رقم الإيصال إن وجد.`,
        `A refund for a payment you have made is handled by our team; I cannot process it or see your payment from here. For reference: ${facts} ${FORM_ACCOUNT.en} Include your receipt number if you have it.`,
      );
      break;
    }
    case 'payment':
      body = t(
        `مشكلات الدفع وفتح الحق بعده يتولاها الفريق، ولا أستطيع الاطلاع على حالة دفعك من هنا. ${FORM_ACCOUNT.ar} وأرفق رقم الإيصال إن وجد.`,
        `Payment issues, and access not opening after payment, are handled by our team; I cannot see your payment status from here. ${FORM_ACCOUNT.en} Include your receipt number if you have it.`,
      );
      break;
    case 'account':
      body = t(
        `مشكلات الدخول ورمز التحقق يتولاها الفريق، ولا أستطيع الاطلاع على حسابك من هنا. تأكد أولًا من مجلد الرسائل غير المرغوب فيها ومن كتابة البريد كما سجلت به، وإن بقيت المشكلة ف${FORM_ACCOUNT.ar}`,
        `Sign in and verification code issues are handled by our team; I cannot see your account from here. First check your spam folder and that the email is typed exactly as registered. If the problem continues, ${FORM_ACCOUNT.en.charAt(0).toLowerCase()}${FORM_ACCOUNT.en.slice(1)}`,
      );
      break;
    case 'human':
      body = t(`بكل سرور. ${FORM.ar.replace('اسمك وبريدك', 'اسمك وبريدك (والجهة إن وجدت)')}`, `Of course. ${FORM.en.replace('your name and email', 'your name and email (and organisation, if any)')}`);
      break;
    case 'complaint':
      body = t(`نأسف لما واجهته، والشكوى يتولاها الفريق مباشرة. ${FORM.ar} وأضف ما تريد في الملاحظة.`, `We are sorry about your experience; complaints are handled by our team directly. ${FORM.en} Add any details in the note.`);
      break;
    case 'data':
      body = t(
        `طلب حذف حسابك أو بياناتك أو الاطلاع عليها يتولاه الفريق بعد التحقق من بريد الحساب، ولا أستطيع تنفيذه من هنا. ${FORM_ACCOUNT.ar}`,
        `A request to delete or access your account or data is handled by our team after verifying your account email; I cannot carry it out from here. ${FORM_ACCOUNT.en}`,
      );
      break;
    case 'legal':
      body = t(`هذا يتولاه الفريق مباشرة، ولا أستطيع الرد عليه هنا. ${FORM.ar.replace('اسمك وبريدك', 'اسمك وبريدك وجهتك')}`, `This is handled by our team directly; I cannot respond to it here. ${FORM.en.replace('your name and email', 'your name, email and organisation')}`);
      break;
    case 'register':
      body = t(
        `لا أستطيع التسجيل نيابة عنك. التسجيل في برنامج إدارة المشروعات للقادة تبدؤه بنفسك من ${L} بالبريد برمز يصلك أو بحساب Google، ومن رشحته جهة يكتب رمزها عند إنشاء الحساب. وإن احتجت مساعدة الفريق ف${FORM.ar}`,
        `I cannot register on your behalf. You start MI Leaders registration yourself at ${L}, with an email code or a Google account; if an organisation nominated you, enter its code when creating your account. If you need help from our team, ${FORM.en.charAt(0).toLowerCase()}${FORM.en.slice(1)}`,
      );
      break;
  }
  return `${body} ${promise}`;
}

// لغة الرد الثابت: العربية أو الإنجليزية من لغة الرد المحسوبة، وإلا من نص الرسالة
export const fixedLang = (reply: string, message: string): 'ar' | 'en' => (reply === 'ar' || reply === 'en' ? reply : (messageIsArabic(message) ? 'ar' : 'en'));

// سطر لسياق الخادم حين يكتب النموذج الرد والتحويل مفروض (لغة ثالثة، أو طلب سعر لجهة)
export const FORCED_LINE: Record<HandoffReason | 'org_quote', string> = {
  pii: 'في رسالة الزائر بيانات حساسة حُجبت: قل إنها حُجبت ولم تُحفظ، ولا تطلبها، ثم التحويل.',
  refund: 'هذه الرسالة طلب استرداد لدفع تم: اذكر شرط الـ 14 يومًا من المعرفة دون وعد، ثم التحويل.',
  payment: 'هذه الرسالة مشكلة في دفع: لا تخمن حالة الدفع، ثم التحويل.',
  account: 'هذه الرسالة مشكلة دخول أو رمز لم يصل: نصيحة واحدة (مجلد غير المرغوب) ثم التحويل.',
  human: 'الزائر طلب إنسانًا: التحويل.',
  complaint: 'هذه شكوى: اعتذار بجملة ثم التحويل.',
  data: 'هذا طلب حذف بيانات أو اطلاع عليها: التحويل.',
  legal: 'هذه مسألة قانونية أو صحفية: لا رأي ولا تعليق، ثم التحويل.',
  register: 'الزائر يطلب أن تسجله: لا تسجل أحدًا، اذكر رابط التسجيل ثم التحويل.',
  org_quote: 'التحويل مفروض لهذه الرسالة: اقترحه بجملة واذكر وعد الرد.',
};
