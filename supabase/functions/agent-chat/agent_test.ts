// المساعد الآلي (agent-chat) على مخزن في الذاكرة ونموذج وشبكة محاكاة: لا اتصال بـ Anthropic ولا Slack ولا Resend.
// الحجب والفحص، والأجوبة الجاهزة، والسقف اليومي، والبث، والتحويل، والرفض، وشكل الطلب إلى Claude.
import { assert, assertEquals, assertMatch, assertNotMatch } from 'jsr:@std/assert@1';
import { redactInput, sanitizeOutput, StreamSanitizer, luhn, normalizeDigits, ALLOWED_HOSTS } from './redact.ts';
import { matchFaq, normalizeText, productOf } from './faq.ts';
import { capState, costMicros, PRICES, worstCaseMicros } from './pricing.ts';
import { buildMessages, HISTORY_TURNS, MAX_TOKENS, requestParams, resetClient, streamAnswer, type ModelResult, type Turn } from './model.ts';
import { HANDOFF_MARK, SYSTEM_BLOCKS, SYSTEM_RULES } from './prompt.ts';
import { type Deps, type Env, handle, LIMITS, riyadhDay, TEXT } from './handler.ts';
import type { Conversation, MessageRow, Price, Store } from './store.ts';
import { Unavailable } from './store.ts';
import { inServiceHours, promiseNow, PROMISE_AR } from '../_shared/hours.js';
import { formOnly, AGENT_CONTEXT_PREFIX } from '../_shared/contact.ts';
import { SITES } from '../_shared/sites.js';

// ── الحجب والفحص ──
Deno.test('الأرقام العربية الهندية تُوحَّد، ورقم الهوية والبطاقة والآيبان تُحجب ولو بمسافات', () => {
  assertEquals(normalizeDigits('١٢٣٤٥'), '12345');
  assert(luhn('4111111111111111'));
  assert(!luhn('4111111111111112'));
  const r = redactInput('هويتي ١٠٢٣ ٤٥٦ ٧٨٩ وبطاقتي 4111-1111-1111-1111 والآيبان SA03 8000 0000 6080 1016 7519');
  assertNotMatch(r.text, /1023|4111|6080/);
  assertEquals(r.hits.sort(), ['card', 'iban', 'id']);
  // أعداد عادية لا تُمس
  assertEquals(redactInput('15 قائدًا في 2026 بتكلفة 5,000').text, '15 قائدًا في 2026 بتكلفة 5,000');
});

Deno.test('فحص المخرج: لا بريد غير بريد الشركة، ولا هاتف، ولا رابط خارج مواقع المنظومة (ولا لوحة الإدارة)', () => {
  assert(ALLOWED_HOSTS.has('leaders.sunkvalue.com') && !ALLOWED_HOSTS.has('admin.sunkvalue.com'));
  const r = sanitizeOutput(`راسل mi@sunkvalue.com أو ali@gmail.com أو اتصل +966 55 123 4567 وزر ${SITES.leaders}/v وhttps://evil.example.com/x وadmin.sunkvalue.com و ${SITES.matrix}.`);
  assertMatch(r.text, /mi@sunkvalue\.com/);
  assertMatch(r.text, /https:\/\/leaders\.sunkvalue\.com\/v/);
  assertMatch(r.text, /https:\/\/matrix\.sunkvalue\.com\./);
  assertNotMatch(r.text, /ali@gmail|123 4567|evil\.example|admin\.sunkvalue/);
  assertEquals(new Set(r.hits), new Set(['email', 'phone', 'link']));
  // المبالغ والسنوات ليست هواتف
  assertEquals(sanitizeOutput('200 دولار، و5,000 دولار، للدورة 2026/2027').text, '200 دولار، و5,000 دولار، للدورة 2026/2027');
});

Deno.test('البث لا يُخرج بريدًا أو رابطًا قبل اكتماله، والنهاية تطابق الفحص الكامل', () => {
  const s = new StreamSanitizer(48, (t) => t.split(HANDOFF_MARK).join(''));
  const parts = ['أهلًا، هذا نص تمهيدي طويل بما يكفي ليتجاوز الحد المحبوس في البث. ', 'راسل ali', '@gmail.com', ' للمزيد، ثم ', 'شكرًا جزيلًا لك على وقتك اليوم. [[HAND', 'OFF]]'];
  let out = '';
  for (const p of parts) out += s.push(p);
  const fin = s.finish();
  out += fin.tail;
  assertNotMatch(out, /gmail|HANDOFF/);
  assertEquals(out, fin.text);
});

// ── الأجوبة الجاهزة ──
Deno.test('الأجوبة الجاهزة: مطابقة واضحة باللهجة والإنجليزية، والمنتج من الصفحة، والطويل يذهب للنموذج', () => {
  assertEquals(normalizeText('أَسْعَارُ المصفوفة؟'), 'اسعار المصفوفه');
  assertEquals(matchFaq('كم سعر المصفوفة؟', 'MI-HOME')?.id, 'matrix_price');
  assertEquals(matchFaq('how much is the impact matrix', 'MI-HOME')?.lang, 'en');
  assertEquals(matchFaq('وين تنحفظ بياناتنا', 'MI-LEADERS')?.id, 'data_location');
  assertEquals(matchFaq('ابي اتحقق من شهادة', 'MI-HOME')?.id, 'certificate_verify');
  // الاسترداد بحسب منتج الصفحة، والصفحة المشتركة لا تطابق منتجًا بعينه
  assertEquals(matchFaq('سياسة الاسترداد', 'MI-LEADERS')?.id, 'refund_leaders');
  assertEquals(matchFaq('سياسة الاسترداد', 'MI-LEGAL')?.id, 'refund_matrix');
  assertEquals(matchFaq('سياسة الاسترداد', 'MI-HOME'), null);
  assertEquals(productOf('MI-PRICING'), 'matrix');
  // سؤال طويل مركب لا يُجاب بجواب جاهز
  assertEquals(matchFaq('نبي نرشح 15 قائدًا من شركتنا، كم التكلفة الإجمالية وهل البيانات تبقى في السعودية؟', 'MI-LEADERS'), null);
  // لا جواب جاهز يذكر سعرًا لبرنامج القادة
  assertEquals(matchFaq('كم سعر برنامج القادة', 'MI-LEADERS'), null);
});

// ── التكلفة والسقف ──
Deno.test('التكلفة من usage بأسعار الجدول وضريبة الموقع الأمريكي، والسقف قبل الاستدعاء', () => {
  assert(PRICES['claude-haiku-5-5']);
  // مليون رمز دخل في Haiku 5.5 = 0.10 دولار = 100000 ميكرو، ثم 1.1 للموقع
  assertEquals(costMicros('claude-haiku-5-5', { input_tokens: 1e6 }), 110000);
  assertEquals(costMicros('claude-haiku-5-5', { output_tokens: 1000, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0, input_tokens: 500 }), Math.ceil((500 * 0.1 + 1000 * 0.5 + 6000 * 0.01) * 1.1));
  // نموذج غير معروف يُحسب بأغلى سعر
  assert(costMicros('claude-unknown', { input_tokens: 1000 }) > costMicros('claude-haiku-5-5', { input_tokens: 1000 }));
  assertEquals(capState(0, 1000, 200), 'ok');
  assertEquals(capState(1_700_000, 1000, 200), 'warn');
  assertEquals(capState(1_999_500, 1000, 200), 'capped');
  // أسوأ دور بـ Haiku أقل من سنت، فيتسع السقف لمئات الأدوار في اليوم
  assert(worstCaseMicros('claude-haiku-5-5', 7000, 3000, MAX_TOKENS) < 10_000);
});

// ── الطلب إلى Claude ──
Deno.test('الطلب: موجه ثابت ومعرفة بنقطة ذاكرة مؤقتة أولًا، والمتغير رسالة نظام أخيرة، وeffort منخفض وus و700', () => {
  const hist: Turn[] = [];
  for (let i = 0; i < 10; i++) hist.push({ role: 'visitor', body: `سؤال ${i}` }, { role: 'agent', body: `جواب ${i}` });
  hist.push({ role: 'visitor', body: 'الأخير' });
  const ctx = { product: 'leaders' as const, page: 'MI-LEADERS', promise: 'سيرد', inHours: true, droppedTurns: 0, leadersPrice: null };
  const { messages, dropped } = buildMessages(hist, ctx);
  assertEquals(messages.filter((m) => m.role === 'user').length, HISTORY_TURNS);
  assertEquals(dropped, 6);
  assertEquals(messages[0].role, 'user');
  const last = messages[messages.length - 1];
  assertEquals(last.role, 'system');
  assertMatch(String(last.content), /حُذفت من السجل 6 رسالة/);
  assertMatch(String(last.content), /لا تذكر رقمًا/);
  const p = requestParams('claude-haiku-5-5', messages);
  assertEquals(p.max_tokens, 700);
  assertEquals(p.output_config, { effort: 'low' });
  assertEquals(p.inference_geo, 'us');
  assertEquals(p.system[p.system.length - 1].cache_control, { type: 'ephemeral' });
  assert(!('temperature' in p) && !('thinking' in p));
  // الموجه لا يحمل وقتًا ولا تاريخًا ولا صفحة (يكسر الذاكرة المؤقتة)
  assertNotMatch(SYSTEM_RULES, /\d{4}-\d{2}-\d{2}|MI-LEADERS/);
  assertEquals(SYSTEM_BLOCKS.length, 2);
});

function sseBody(events: Record<string, unknown>[]) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}
function anthropicStream(text: string[], stop = 'end_turn') {
  return sseBody([
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 80 } },
    { type: 'message_stop' },
  ]);
}

Deno.test('streamAnswer: SDK الرسمي إلى api.anthropic.com بالمعاملات المقررة، ويجمع النص والاستخدام', async () => {
  resetClient();
  const real = globalThis.fetch;
  let seen: { url: string; body: Record<string, unknown> } | null = null;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url instanceof Request ? url.url : url), body: JSON.parse(String(init?.body)) };
    return Promise.resolve(new Response(anthropicStream(['أهلًا ', 'بك']), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  }) as typeof fetch;
  try {
    const deltas: string[] = [];
    const r = await streamAnswer('sk-test', 'claude-haiku-5-5', [{ role: 'user', content: 'مرحبا' }], (t) => deltas.push(t));
    assertEquals(r.text, 'أهلًا بك');
    assertEquals(deltas.join(''), 'أهلًا بك');
    assertEquals(r.usage.cache_read_input_tokens, 6000);
    assertEquals(r.usage.output_tokens, 80);
    assert(seen);
    const s = seen as { url: string; body: Record<string, unknown> };
    assert(s.url.startsWith('https://api.anthropic.com/v1/messages'));
    assertEquals(s.body.inference_geo, 'us');
    assertEquals(s.body.output_config, { effort: 'low' });
    assertEquals(s.body.max_tokens, 700);
    assertEquals(s.body.stream, true);
    assert(!('temperature' in s.body) && !('thinking' in s.body));
  } finally { globalThis.fetch = real; resetClient(); }
});

// ── الدالة كاملة على مخزن في الذاكرة ──
type Mem = { convs: (Conversation & { public_token_hash: string; ip: string | null; rating?: number })[]; msgs: MessageRow[]; spend: Map<string, number>; alerts: Set<string>; contacts: Record<string, unknown>[]; price: Price | null; missing?: boolean };
function memStore(m: Mem): Store {
  const guard = () => { if (m.missing) throw new Unavailable('conversations'); };
  return {
    client: () => null,
    countConversations: async (since, ip) => { guard(); return m.convs.filter((c) => c.created_at >= since && (!ip || c.ip === ip)).length; },
    countModelCalls: async () => m.msgs.filter((x) => x.role === 'agent').length,
    createConversation: async (row) => { guard(); const id = crypto.randomUUID(); m.convs.push({ id, status: 'bot', visitor_messages: 0, contact_request_id: null, created_at: new Date().toISOString(), ...row }); return id; },
    findConversation: async (h) => { guard(); return m.convs.find((c) => c.public_token_hash === h) ?? null; },
    history: async (id) => m.msgs.filter((x) => x.conversation_id === id && x.role !== 'system').map((x) => ({ role: x.role as Turn['role'], body: x.body })),
    addMessage: async (row) => { m.msgs.push(row); },
    updateConversation: async (id, patch) => { Object.assign(m.convs.find((c) => c.id === id)!, patch); },
    spentToday: async (day) => m.spend.get(day) ?? 0,
    addSpend: async (day, micros) => { m.spend.set(day, (m.spend.get(day) ?? 0) + micros); return m.spend.get(day)!; },
    markAlert: async (day, level) => { const k = `${day}|${level}`; if (m.alerts.has(k)) return false; m.alerts.add(k); return true; },
    leadersPrice: async () => m.price,
    insertContact: async (row) => { const data = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }; m.contacts.push(data); return { data, error: null }; },
    purgeExpired: async () => {},
  };
}
const ENV: Env = { apiKey: 'sk-test', model: 'claude-haiku-5-5', capCents: 200, enabled: true, turnstileSecret: 's', turnstileSite: 'site', adminEmail: 'owner@example.test' };
function setup(over: Partial<Mem> = {}, env: Partial<Env> = {}, reply: Partial<ModelResult> & { chunks?: string[] } = {}) {
  const m: Mem = { convs: [], msgs: [], spend: new Map(), alerts: new Set(), contacts: [], price: null, ...over };
  const calls = { model: 0, notify: 0, alerts: [] as string[], lastMessages: null as unknown };
  const deps: Deps = {
    store: memStore(m), env: { ...ENV, ...env }, clientIp: () => '203.0.113.9',
    turnstile: async (t) => t === 'ok-token-123',
    model: async (messages, onText) => {
      calls.model++; calls.lastMessages = messages;
      const chunks = reply.chunks ?? ['برنامج القادة رحلة تطوير تبدأ بقياس مبدئي. ', `التفاصيل في ${SITES.mi}/leaders/ .`];
      for (const c of chunks) onText(c);
      return { text: chunks.join(''), stopReason: 'end_turn', model: 'claude-haiku-5-5', usage: { input_tokens: 300, output_tokens: 120, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 }, ...reply };
    },
    notifyAdmin: async () => { calls.notify++; },
    alert: async (kind) => { calls.alerts.push(kind); return true; },
  };
  return { m, deps, calls };
}
const post = (d: Deps, body: Record<string, unknown>) => handle(new Request('http://x/agent-chat', { method: 'POST', body: JSON.stringify(body) }), d);
async function events(res: Response) {
  const text = await res.text();
  return text.trim().split('\n\n').map((blk) => {
    const ev = blk.match(/^event: (.+)$/m)?.[1] ?? '';
    return { ev, data: JSON.parse(blk.match(/^data: (.+)$/m)?.[1] ?? 'null') };
  });
}
async function started(d: Deps) {
  const r = await (await post(d, { action: 'start', captcha: 'ok-token-123', page: 'MI-LEADERS', source_url: `${SITES.mi}/leaders/`, locale: 'ar' })).json();
  assert(r.success, JSON.stringify(r));
  return r.token as string;
}

Deno.test('مطفأ أو بلا مفاتيح Turnstile: لا محادثة، والحالة تقول ذلك', async () => {
  const off = setup({}, { enabled: false });
  assertEquals((await (await post(off.deps, { action: 'status' })).json()).enabled, false);
  assertEquals((await post(off.deps, { action: 'start', captcha: 'ok-token-123' })).status, 503);
  const noKeys = setup({}, { turnstileSecret: '' });
  assertEquals((await (await post(noKeys.deps, { action: 'start', captcha: 'ok-token-123' })).json()).code, 'captcha_unconfigured');
  const bad = setup();
  assertEquals((await (await post(bad.deps, { action: 'start', captcha: 'wrong-token-xx' })).json()).code, 'captcha');
});

Deno.test('غياب الجداول قبل الترحيل: agent_unavailable لا خطأ داخلي', async () => {
  const s = setup({ missing: true });
  const r = await post(s.deps, { action: 'start', captcha: 'ok-token-123' });
  assertEquals(r.status, 503);
  assertEquals((await r.json()).code, 'agent_unavailable');
});

Deno.test('حد المحادثات لكل شبكة في الساعة', async () => {
  const s = setup();
  for (let i = 0; i < LIMITS.convPerIpHour; i++) await started(s.deps);
  assertEquals((await post(s.deps, { action: 'start', captcha: 'ok-token-123' })).status, 429);
});

Deno.test('send: البث ثم done بالنص المفحوص، والاستخدام في سجل اليوم، والرسالة محفوظة بعد الحجب', async () => {
  const s = setup({}, {}, { chunks: ['هذا رد طويل بما يكفي لبدء البث للزائر قبل نهايته، ', 'وراسل x@evil.test للمزيد.'] });
  const token = await started(s.deps);
  const evs = await events(await post(s.deps, { action: 'send', token, message: 'وش الفرق بين القياس والبرنامج؟ هويتي 1023456789' }));
  const done = evs.find((e) => e.ev === 'done')!;
  assertEquals(done.data.source, 'model');
  assertNotMatch(done.data.text, /evil\.test/);
  const streamed = evs.filter((e) => e.ev === 'delta').map((e) => e.data.t).join('');
  assertNotMatch(streamed, /evil\.test/);
  assertEquals(streamed.trim(), done.data.text);
  const visitor = s.m.msgs.find((x) => x.role === 'visitor')!;
  assertNotMatch(visitor.body, /1023456789/);
  // ما أُرسل إلى النموذج محجوب أيضًا
  assertNotMatch(JSON.stringify(s.calls.lastMessages), /1023456789/);
  const agent = s.m.msgs.find((x) => x.role === 'agent')!;
  assertEquals(agent.cache_read_tokens, 6000);
  assert((agent.cost_micros ?? 0) > 0);
  assertEquals(s.m.spend.get(riyadhDay(Date.now())), agent.cost_micros);
});

Deno.test('الجواب الجاهز بلا استدعاء نموذج ولا تكلفة', async () => {
  const s = setup();
  const token = await started(s.deps);
  const evs = await events(await post(s.deps, { action: 'send', token, message: 'كم سعر المصفوفة؟' }));
  assertEquals(evs.find((e) => e.ev === 'done')!.data.source, 'canned');
  assertEquals(s.calls.model, 0);
  assertEquals(s.m.spend.size, 0);
});

Deno.test('السقف اليومي: لا استدعاء حين يتجاوز التالي السقف، و«اترك رسالتك»، وتنبيه واحد عند 100%', async () => {
  const s = setup({ spend: new Map([[riyadhDay(Date.now()), 1_999_000]]) });
  const token = await started(s.deps);
  for (let i = 0; i < 2; i++) {
    const evs = await events(await post(s.deps, { action: 'send', token, message: `سؤال عن البرنامج رقم ${i} بتفصيل أطول` }));
    assertEquals(evs[0].ev, 'capped');
    assertEquals(evs[0].data.text, TEXT.capped.ar);
  }
  assertEquals(s.calls.model, 0);
  assertEquals(s.calls.alerts, ['agent_spend_cap']);
});

Deno.test('تنبيه 80% مرة واحدة حين يعبره المجموع', async () => {
  const s = setup({ spend: new Map([[riyadhDay(Date.now()), 1_600_500]]) });
  const token = await started(s.deps);
  await events(await post(s.deps, { action: 'send', token, message: 'ما مراحل الرحلة في البرنامج بالتفصيل؟' }));
  await events(await post(s.deps, { action: 'send', token, message: 'وكم مدة كل مرحلة منها تقريبًا؟' }));
  assertEquals(s.calls.alerts, ['agent_spend_80']);
});

Deno.test('السعر الحي لبرنامج القادة من إعداد الدفع حين يكون مفعّلًا وحده', async () => {
  const on = setup({ price: { enabled: true, currency: 'USD', assessment_cents: 199, program_cents: 9900 } });
  const t1 = await started(on.deps);
  await events(await post(on.deps, { action: 'send', token: t1, message: 'كم رسوم برنامج القادة للفرد؟' }));
  assertMatch(JSON.stringify(on.calls.lastMessages), /99\.00 USD/);
  const off = setup({ price: { enabled: false, currency: 'USD', assessment_cents: 199, program_cents: 9900 } });
  const t2 = await started(off.deps);
  await events(await post(off.deps, { action: 'send', token: t2, message: 'كم رسوم برنامج القادة للفرد؟' }));
  assertNotMatch(JSON.stringify(off.calls.lastMessages), /99\.00/);
});

Deno.test('امتناع النموذج (refusal) يصير نص تحويل مهذبًا لا ردًا فارغًا', async () => {
  const s = setup({}, {}, { chunks: [''], text: '', stopReason: 'refusal' });
  const token = await started(s.deps);
  const done = (await events(await post(s.deps, { action: 'send', token, message: 'سؤال يمتنع عنه النموذج هنا' }))).find((e) => e.ev === 'done')!;
  assertEquals(done.data.text, TEXT.refusal.ar);
  assertEquals(done.data.handoff, true);
});

Deno.test('علامة التحويل من النموذج لا تظهر للزائر وتُرفع handoff', async () => {
  const s = setup({}, {}, { chunks: ['عروض الجهات يعدها الفريق بحسب عدد المرشحين. سيرد عليك الفريق خلال 4 ساعات عمل.\n', HANDOFF_MARK] });
  const token = await started(s.deps);
  const evs = await events(await post(s.deps, { action: 'send', token, message: 'نبي عرض سعر لـ 15 قائدًا من شركتنا' }));
  const done = evs.find((e) => e.ev === 'done')!;
  assertEquals(done.data.handoff, true);
  assertNotMatch(JSON.stringify(evs), /HANDOFF/);
});

Deno.test('حد الرسائل في المحادثة ثم عرض التحويل', async () => {
  const s = setup();
  const token = await started(s.deps);
  s.m.convs[0].visitor_messages = LIMITS.messagesPerConversation;
  const r = await post(s.deps, { action: 'send', token, message: 'سؤال إضافي' });
  assertEquals(r.status, 429);
  const j = await r.json();
  assertEquals(j.code, 'conv_cap');
  assertEquals(j.handoff, true);
  assertEquals((await post(s.deps, { action: 'send', token, message: 'x'.repeat(LIMITS.messageChars + 1) })).status, 400);
});

Deno.test('التحويل: صف تواصل موسوم بالمحادثة، وبريد الإدارة القائم، ومرة واحدة، والوعد الموحد', async () => {
  const s = setup();
  const token = await started(s.deps);
  await events(await post(s.deps, { action: 'send', token, message: 'أبي أكلم أحد من الفريق عن شراكة' }));
  const bad = await post(s.deps, { action: 'handoff', token, name: 'سارة', email: 'not-an-email' });
  assertEquals(bad.status, 400);
  const r = await (await post(s.deps, { action: 'handoff', token, name: 'سارة', email: 'Sara@Company.test', organization: 'شركة', interest: 'partnership', reason: 'request' })).json();
  assert(r.success);
  assert(r.promise === promiseNow('ar', Date.now()));
  assertEquals(s.m.contacts.length, 1);
  const c = s.m.contacts[0];
  assert(String(c.context).startsWith(`${AGENT_CONTEXT_PREFIX} conversation ${s.m.convs[0].id}`));
  assertEquals(c.email, 'sara@company.test');
  assertEquals(c.product, 'MI-LEADERS');
  assertEquals(s.calls.notify, 1);
  assertEquals(s.m.convs[0].status, 'waiting');
  assertEquals(s.m.convs[0].contact_request_id, c.id);
  assertEquals((await post(s.deps, { action: 'handoff', token, name: 'سارة', email: 'sara@company.test' })).status, 409);
  // بعد التحويل لا يرد المساعد
  assertEquals((await post(s.deps, { action: 'send', token, message: 'هل وصل طلبي؟' })).status, 409);
});

Deno.test('التقييم من 1 إلى 5 وحده', async () => {
  const s = setup();
  const token = await started(s.deps);
  assertEquals((await post(s.deps, { action: 'rate', token, rating: 9 })).status, 400);
  assertEquals((await post(s.deps, { action: 'rate', token, rating: 5 })).status, 200);
  assertEquals(s.m.convs[0].rating, 5);
  assertEquals((await post(s.deps, { action: 'rate', token: 'x'.repeat(40), rating: 5 })).status, 404);
});

// ── الوعد الموحد وحدود النموذج ──
Deno.test('الوعد: داخل الساعات 4 ساعات عمل، وخارجها يوم العمل التالي، ولا وعد برد فوري', () => {
  // الأحد 2026-11-15 الساعة 10:00 بتوقيت الرياض = 07:00 UTC
  const sunday10 = Date.parse('2026-11-15T07:00:00Z');
  const friday = Date.parse('2026-11-20T10:00:00Z');
  assert(inServiceHours(sunday10));
  assert(!inServiceHours(friday));
  assertMatch(promiseNow('ar', sunday10), /4 ساعات عمل/);
  assertMatch(promiseNow('ar', friday), /يوم العمل التالي/);
  assertMatch(PROMISE_AR, /4 ساعات عمل/);
  assertNotMatch(promiseNow('en', friday) + PROMISE_AR, /فوري|immediately|instant/);
});

Deno.test('صفوف المساعد لا تُحسب في حدود نموذج التواصل (formOnly)', () => {
  let filter = '';
  formOnly({ or: (f: string) => { filter = f; return null; } });
  assertEquals(filter, 'context.is.null,context.not.like.[agent]*');
});
