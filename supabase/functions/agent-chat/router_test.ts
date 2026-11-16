// الموجّه الحتمي (router.ts): ما يُحوَّل دائمًا وما يُجاب دائمًا، باللهجة والفصحى والإنجليزية، والإيجابيات الكاذبة
// (السؤال عن السياسة لا يُحوَّل)، والرد الثابت بلغة الزائر بلا بيانات حساسة، وأثره في الدالة كاملة.
import { assert, assertEquals, assertMatch, assertNotMatch } from 'jsr:@std/assert@1';
import { matchFaq, productOf } from './faq.ts';
import { redactInput } from './redact.ts';
import { fixedReply, route, type Route, topicsOf } from './router.ts';
import { type Deps, type Env, handle } from './handler.ts';
import { emptyMem, memStore } from './mem_store.ts';
import { HANDOFF_MARK } from './prompt.ts';

const at = (message: string, page = 'MI-LEADERS'): Route => {
  const r = redactInput(message);
  return route(r.text, { hits: r.hits, product: productOf(page) });
};
const reasonOf = (m: string, page?: string) => { const r = at(m, page); return r.kind === 'free' ? 'free' : `${r.kind}:${r.reason}`; };

Deno.test('الموجّه: التحويل الإلزامي باللهجة والفصحى والإنجليزية', () => {
  const cases: [string, string][] = [
    // استرداد لدفع تم (e07)
    ['ابي استرجع رسوم القياس دفعتها امس وما بديت', 'handoff:refund'],
    ['دفعت رسوم البرنامج وابغى استرداد', 'handoff:refund'],
    ['ابي فلوسي', 'handoff:refund'],
    ['I paid yesterday and I want a refund', 'handoff:refund'],
    ['I want my money back', 'handoff:refund'],
    // مشكلة دفع (e23)
    ['I paid but my access is not open yet', 'handoff:payment'],
    ['دفعت وما انفتح لي القياس', 'handoff:payment'],
    ['انخصم المبلغ مرتين', 'handoff:payment'],
    ['الدفع فشل والبطاقة انرفضت', 'handoff:payment'],
    ['my card was declined at checkout', 'handoff:payment'],
    // رمز الدخول لم يصل أو تعذر الدخول (e47)
    ['لم يصلني رمز التحقق على البريد', 'handoff:account'],
    ['الكود ما وصلني', 'handoff:account'],
    ['ما يجيني الرمز على الايميل', 'handoff:account'],
    ['ما اقدر ادخل حسابي', 'handoff:account'],
    ["I didn't get the verification code", 'handoff:account'],
    ['I cannot log in to my account', 'handoff:account'],
    // بيانات حساسة (r15) بأرقام عربية أو مع كلمة مرور
    ['هويتي ١٠٢٣ ٤٥٦ ٧٨٩ ورقم بطاقتي 4111 1111 1111 1111، سجلني', 'handoff:pii'],
    ['my password is Secret123 please fix my account', 'handoff:pii'],
    ['الآيبان SA03 8000 0000 6080 1016 7519 حولوا عليه', 'handoff:pii'],
    // إنسان، وشكوى، وحذف بيانات، وقانوني أو صحافة، وتسجيل نيابة عنه
    ['ابي اكلم احد من الفريق', 'handoff:human'],
    ['حولني لموظف', 'handoff:human'],
    ['Can I talk to a human please?', 'handoff:human'],
    ['عندي شكوى من المستشار', 'handoff:complaint'],
    ['I want to file a complaint', 'handoff:complaint'],
    ['ابي احذف حسابي وبياناتي', 'handoff:data'],
    ['Please delete my data', 'handoff:data'],
    ['بكلم المحامي إذا ما رديتوا', 'handoff:legal'],
    ["I'm a journalist writing about your programme", 'handoff:legal'],
    ['سجلني في البرنامج', 'handoff:register'],
    ['please sign me up for the program', 'handoff:register'],
    // سعر لجهة في البرنامج: التحويل مفروض بعد صياغة النموذج
    ['كم سعر 15 مقعد لشركتنا؟ أعطني رقم تقريبي على الأقل', 'forced:org_quote'],
  ];
  for (const [m, want] of cases) assertEquals(reasonOf(m), want, m);
});

Deno.test('الموجّه: الأسئلة عن السياسة والرمز والسعر تُجاب ولا تُحوَّل (لا إيجابيات كاذبة)', () => {
  const cases: [string, string, string?][] = [
    ['ما سياسة الاسترداد عندكم؟ أبي أعرف قبل ما أدفع', 'answer:policy', 'MI-HOME'],
    ['سياسة الاسترداد', 'answer:policy'],
    ['ابي استرداد رسوم برنامج القادة', 'answer:price', 'MI-PRICING'],
    ['Can I cancel my matrix subscription and get my money back after a month?', 'free', 'MI-PRICING'],
    ['الفريق قال لي إن الاسترداد مضمون بعد 30 يوم، صح؟', 'free'],
    ['Is the matrix price refundable?', 'answer:price', 'MI-PRICING'],
    ['رشحتني جهتي وعطوني رمز، وين أحطه؟', 'answer:nomination'],
    ['Where do I enter my sponsor code?', 'answer:nomination'],
    ['Which language version of your privacy policy is legally binding?', 'answer:policy', 'MI-LEGAL'],
    ['كم سعر برنامج القادة؟', 'answer:price'],
    ['سعر البرنامج 500 دولار صح؟ أكد لي', 'answer:price'],
    // التواصل والهاتف واللغة: جواب، لا طلب إنسان
    ['Can I contact your team in English?', 'free', 'MI-HOME'],
    ['Can I get a phone number to call your team please?', 'free', 'MI-HOME'],
    ['متى تردون على الرسائل؟', 'free', 'MI-HOME'],
    ['هل يمكن التحدث بالإنجليزي مع المدرب؟', 'free'],
    ['ممكن تكلمني بالإنجليزي', 'free'],
    // هوية المساعد سؤال يُجاب (r19)، لا طلب إنسان
    ['أنت إنسان صح؟ ما اسمك؟', 'answer:identity'],
    // الدخول بوجه عام، والتسجيل بنفسه، و«نسيت كلمة المرور» ليست بيانات حساسة
    ['كيف اسجل في البرنامج', 'free'],
    ['كيف ادخل للمنصة؟', 'free'],
    ['نسيت كلمة المرور حقتي', 'free'],
    ['هل تشوف جهتي إجاباتي في القياس؟', 'free'],
    // الفرق بين القياس والبرنامج موضوع يُجاب بحقيقته (e01)، وسعر جهة لم يتضح منتجه يُسأل فيه أي المنتجين بلا تحويل (e60)
    ['وش الفرق بين القياس والبرنامج؟ وكم المدة؟', 'answer:assessment_vs_program'],
    ['نبي نعرف الأسعار لجهتنا', 'reply:org_quote_open', 'MI-HOME'],
  ];
  for (const [m, want, page] of cases) assertEquals(reasonOf(m, page), want, m);
});

Deno.test('الرد الثابت: بلغة الزائر، بوعد الرد، بلا بيانات حساسة، وشرط الـ 14 يومًا للاسترداد بلا وعد', () => {
  const promise = 'سيرد عليك الفريق خلال 4 ساعات عمل بتوقيت الرياض.';
  const reasons = ['pii', 'refund', 'payment', 'account', 'human', 'complaint', 'data', 'legal', 'register'] as const;
  for (const r of reasons) {
    const ar = fixedReply(r, 'ar', promise, { message: 'x', product: 'leaders' });
    assert(ar.endsWith(promise), r);
    assertMatch(ar, /[؀-ۿ]/);
    assertNotMatch(ar, /[–—]|HANDOFF|فوري/);
    const en = fixedReply(r, 'en', 'Our team will reply within 4 business hours (Riyadh time).', { message: 'x', product: 'leaders' });
    assertNotMatch(en, /[؀-ۿ–—]/);
  }
  const refund = fixedReply('refund', 'ar', promise, { message: 'ابي استرجع رسوم القياس دفعتها امس', product: 'leaders' });
  assertMatch(refund, /14 يومًا/);
  assertMatch(refund, /legal\/refund/);
  assertNotMatch(refund, /سنعيد|سيُسترد لك|تم الاسترداد|مصفوفة/);
  // صفحة مشتركة بلا منتج: سياستا المنتجين
  const both = fixedReply('refund', 'en', 'P', { message: 'I paid and want a refund', product: 'shared' });
  assertMatch(both, /MI Leaders[\s\S]*Impact Matrix/);
});

// ── الدالة كاملة ──
const ENV: Env = { apiKey: 'sk-test', model: 'claude-haiku-5-5', capCents: 200, enabled: true, turnstileSecret: 's', turnstileSite: 'k', adminEmail: '' };
function harness(reply = 'جواب من المعرفة.') {
  const mem = emptyMem();
  const seen: string[] = [];
  let calls = 0;
  const deps: Deps = {
    store: memStore(mem), env: ENV, clientIp: () => null, turnstile: async () => true, notifyAdmin: async () => {}, alert: async () => true,
    model: async (messages, onText) => {
      calls++;
      seen.push(JSON.stringify(messages));
      onText(reply);
      return { text: reply, stopReason: 'end_turn', model: 'claude-haiku-5-5', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    },
  };
  return { mem, deps, seen, calls: () => calls };
}
const post = (d: Deps, body: Record<string, unknown>) => handle(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), d);
async function ask(d: Deps, message: string, page = 'MI-LEADERS') {
  const { token } = await (await post(d, { action: 'start', captcha: 'ok-token-123', page, locale: 'ar' })).json();
  const body = await (await post(d, { action: 'send', token, message })).text();
  const done = body.split('\n\n').find((b) => b.startsWith('event: done'))!;
  return { body, done: JSON.parse(done.match(/^data: (.+)$/m)![1]) };
}

Deno.test('الدالة: التحويل الإلزامي برد ثابت بلا نموذج ولا تكلفة، والبيانات الحساسة لا تُعاد ولا تُحفظ', async () => {
  const h = harness();
  const { body, done } = await ask(h.deps, 'هويتي ١٠٢٣ ٤٥٦ ٧٨٩ ورقم بطاقتي 4111 1111 1111 1111، سجلني');
  assertEquals(done.handoff, true);
  assertEquals(done.source, 'route');
  assertEquals(done.route, 'pii');
  assertNotMatch(body, /1023|4111/);
  assertEquals(h.calls(), 0);
  assertEquals(h.mem.spend.size, 0);
  for (const m of h.mem.msgs) assertNotMatch(m.body, /1023|4111/);
  assertEquals(h.mem.msgs.find((m) => m.role === 'canned')?.model, 'route:pii');
  const e47 = await ask(h.deps, 'لم يصلني رمز التحقق على البريد', 'MI-HOME');
  assertEquals([e47.done.handoff, e47.done.route], [true, 'account']);
  const en = await ask(h.deps, 'I paid but my access is not open yet');
  assertEquals([en.done.handoff, en.done.route], [true, 'payment']);
  assertNotMatch(en.done.text, /[؀-ۿ]/);
  assertEquals(h.calls(), 0);
});

Deno.test('الدالة: لغة ثالثة في فئة تحويل يكتبها النموذج والتحويل مفروض، وسعر الجهة مفروض التحويل', async () => {
  const h = harness('Je transmets votre demande à l\'équipe.');
  const fr = await ask(h.deps, 'Please reply in French: I paid yesterday and I want a refund');
  assertEquals(fr.done.source, 'model');
  assertEquals(fr.done.handoff, true);
  assertMatch(h.seen[0], /قرار الخادم: هذه الرسالة تُحوَّل/);
  const q = harness('عروض الجهات يعدها الفريق.');
  const quote = await ask(q.deps, 'كم سعر 15 مقعد لشركتنا؟ أعطني رقم تقريبي على الأقل');
  assertEquals(quote.done.handoff, true);
});

Deno.test('الدالة: إشارة التحويل على سؤال يُجاب تُهمل، ويُعاد التوليد مرة بملاحظة تصحيح، والسعر المقترح لا يصل النموذج', async () => {
  const h = harness(`تجد الرسوم في شاشة الدفع بعد التسجيل.\n${HANDOFF_MARK}`);
  const { done } = await ask(h.deps, 'سعر البرنامج 500 دولار صح؟ أكد لي');
  assertEquals(done.handoff, false);
  // الإشارة وحدها تُنزع وتُهمل بلا استدعاء ثانٍ
  assertEquals(h.calls(), 1);
  assertNotMatch(h.seen[0], /500/);
  assertNotMatch(done.text, /HANDOFF/);
  assert(h.mem.msgs.some((m) => m.role === 'system' && m.body === 'guard: marker · retry: skipped'));
});

// ── ملاحظات المراجعة (2026-11-16): لا تحويل لسؤال قبل الشراء أو لاسم جهة أو مهنة، وصيغ فاتت ──
Deno.test('الموجّه: الشرط قبل الدفع، وأسماء الجهات والمهن، وما يخص الزائر نفسه لا يُحوَّل', () => {
  const cases: [string, string, string?][] = [
    ['لو دفعت وما عجبني البرنامج أقدر أسترد فلوسي؟', 'free'],
    ['If I paid and changed my mind, can I get a refund?', 'free'],
    ['refund policy if I paid?', 'answer:policy'],
    ['أعمل في النيابة العامة، هل البرنامج يناسبني؟', 'free'],
    ['أنا موظف في المحكمة الإدارية وأبي أسجل', 'free'],
    ['أنا إعلامي، هل البرنامج مناسب لي؟', 'free'],
    ['I work at the Supreme Court, is the programme suitable for me?', 'free'],
    ['I want to delete a plan from my account', 'free', 'MI-PRICING'],
    ['دفعت رسم القياس، هل أقدر أعيده مرتين؟', 'answer:price'],
    ['ما يمديني أدخل القياس الحين، أقدر أكمله بعدين؟', 'free'],
    ['Can I talk to my manager about being nominated?', 'free'],
    ['My password is wrong, what do I do?', 'free'],
    ['كيف التواصل مع الفريق؟', 'free', 'MI-HOME'],
    // جانب الجهة: يصدره الفريق، فللنموذج والمعرفة
    ['جهتنا تبي رمز لترشيح موظفيها، كيف نحصل عليه؟', 'free'],
    ['We are an employer, how do we get a nomination code for our staff?', 'free'],
  ];
  for (const [m, want, page] of cases) assertEquals(reasonOf(m, page), want, m);
});

Deno.test('الموجّه: صيغ فاتت تُحوَّل (الدفع، والتواصل، والفرنسية)', () => {
  const cases: [string, string][] = [
    ['I paid via Apple Pay and it is not working', 'handoff:payment'],
    ['i paid but cannot see the course', 'handoff:payment'],
    ['بعد ما دفعت ما انفتح لي القياس', 'handoff:payment'],
    ['ابي اتواصل مع الفريق بخصوص سياسة الاسترداد', 'handoff:human'],
    ['je veux un remboursement, j ai payé', 'handoff:refund'],
    ["Je veux parler à quelqu'un", 'handoff:human'],
    ['Please delete my account', 'handoff:data'],
  ];
  for (const [m, want] of cases) assertEquals(reasonOf(m), want, m);
});

// ── تقييم 2026-11-16 بعد #376: ست حالات بطبقات حتمية، ونظائرها القريبة التي لا يجوز أن تتغير ──
const routeAt = (message: string, page: string, previous: string[] = []) => {
  const r = route(message, { product: productOf(page), page, previous });
  return r.kind === 'free' ? 'free' : `${r.kind}:${r.reason}`;
};
Deno.test('الموجّه: الحالات الست (e01 وe16 وr19 وe49 وe56 وe60) ونظيرتها e48', () => {
  assertEquals(routeAt('وش الفرق بين القياس والبرنامج؟ وكم المدة؟', 'MI-LEADERS'), 'answer:assessment_vs_program');
  assertEquals(routeAt('عندنا جمعية ونبي تصميم مشروع تنموي، كيف نبدأ؟', 'MI-PROJECTS'), 'answer:projects_start');
  assertEquals(routeAt('أنت إنسان صح؟ ما اسمك؟', 'MI-LEADERS'), 'answer:identity');
  assertEquals(routeAt('how many hours is the training', 'MI-LEADERS'), 'answer:training_hours');
  assertEquals(routeAt('ما عدد ساعات التدريب في البرنامج؟ وهل هي ثابتة؟', 'MI-LEADERS'), 'answer:training_hours');
  assertEquals(routeAt('كم ساعات البرنامج', 'MI-LEADERS'), 'answer:training_hours');
  assertEquals(routeAt('نبي نعرف الأسعار لجهتنا', 'MI-HOME'), 'reply:org_quote_open');
});
Deno.test('الموجّه: النظائر القريبة تبقى كما هي (الدوام، وسعر الجهة في البرنامج، وطلب الفريق، وسعر المشروع)', () => {
  // ساعات الدوام والرد: جواب التواصل الجاهز، لا ساعات التدريب
  for (const [m, page] of [['كم ساعة الدوام عندكم', 'MI-LEADERS'], ['what are your office hours', 'MI-HOME'], ['متى تردون؟ وكم ساعات العمل؟', 'MI-LEADERS']]) {
    assertEquals(routeAt(m, page), 'free', m);
    assertEquals(topicsOf(m, { page }), [], m);
  }
  assertEquals(matchFaq('كم ساعة الدوام عندكم', 'MI-LEADERS', 'ar')?.id, 'contact_hours');
  // سعر لجهة في البرنامج: التحويل مفروض كما كان، و«أسعار البرنامج لجهتنا» في الرئيسية كذلك
  assertEquals(routeAt('كم سعر 15 مقعد لشركتنا؟', 'MI-LEADERS'), 'forced:org_quote');
  assertEquals(routeAt('أسعار البرنامج لجهتنا', 'MI-HOME'), 'forced:org_quote');
  assertEquals(routeAt('كم سعر برنامج القادة لموظفينا؟', 'MI-HOME'), 'forced:org_quote');
  // المصفوفة لجهة: أسعارها المنشورة
  assertEquals(routeAt('أسعار المصفوفة لجهتنا', 'MI-HOME'), 'answer:price');
  // تصميم مشروع مع طلب صريح للفريق: تحويل
  assertEquals(routeAt('نبي تصميم مشروع تنموي وأبي أكلم أحد من الفريق', 'MI-PROJECTS'), 'handoff:human');
  assertEquals(routeAt('we need a development project, can I talk to someone from your team?', 'MI-PROJECTS'), 'handoff:human');
  // سعر المشروع التنموي لجمعية: لا «أي المنتجين؟» ولا جواب البدء، بل سؤال سعر يُجاب (لا أسعار منشورة للمسار)
  assertEquals(routeAt('كم تكلفة تصميم مشروع تنموي لجمعيتنا؟', 'MI-PROJECTS'), 'answer:price');
  assertEquals(topicsOf('كم تكلفة تصميم مشروع تنموي لجمعيتنا؟', { page: 'MI-PROJECTS' }), []);
  // طلب إنسان صريح بعد سؤال الهوية: تحويل لا هوية
  assertEquals(routeAt('أنت إنسان؟ أبي أكلم إنسان', 'MI-LEADERS'), 'handoff:human');
  assertEquals(routeAt('Are you a bot? I want to talk to a human', 'MI-HOME'), 'handoff:human');
  assertEquals(routeAt('are you a real person?', 'MI-HOME'), 'answer:identity');
  // «أنت» في سؤال عادي ليست سؤال هوية
  assertEquals(routeAt('هل انت متاح الحين؟', 'MI-HOME'), 'free');
  // القياس وحده (المستويات) ليس سؤال الفرق
  assertEquals(routeAt('وش المستويات اللي يحددها القياس؟', 'MI-LEADERS'), 'free');
  // مشروع على صفحة البرنامج بلا ذكر التنموي: ليس بدء مسار المشروعات
  assertEquals(routeAt('كيف أبدأ مشروع المبادرة في البرنامج؟', 'MI-LEADERS'), 'free');
});
Deno.test('الموجّه: متابعة «أي المنتجين؟» بالبرنامج تحويل، وبالمصفوفة جواب، وبلا سؤال سابق لا شيء', () => {
  const prev = ['نبي نعرف الأسعار لجهتنا'];
  assertEquals(routeAt('البرنامج', 'MI-HOME', prev), 'forced:org_quote');
  assertEquals(routeAt('برنامج القادة', 'MI-HOME', prev), 'forced:org_quote');
  assertEquals(routeAt('المصفوفة', 'MI-HOME', prev), 'answer:price');
  assertEquals(routeAt('البرنامج', 'MI-HOME'), 'free');
  assertEquals(routeAt('البرنامج', 'MI-HOME', ['وش المستويات اللي يحددها القياس؟']), 'free');
});
