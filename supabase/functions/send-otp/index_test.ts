// send-otp (نموذج التواصل): التحقق البشري يفشل مغلقًا، وحدود البريد والشبكة والجميع، وتعذّر العد يرفض،
// والصف المحفوظ وحده مصدر الرسالتين، والمساران القديمان مغلقان. المعالج الحقيقي على PostgREST في الذاكرة
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { captureServe, GOOD_CAPTCHA, installRest, post } from '../_shared/_fake_rest.ts';

Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
Deno.env.set('LEADERS_TURNSTILE_SECRET', 'ts-secret');
Deno.env.set('LEADERS_TURNSTILE_SITE_KEY', 'ts-site');
Deno.env.set('CONTACT_NOTIFY_EMAIL', 'owner@example.test');
Deno.env.delete('RESEND_API_KEY');

const handle = await captureServe(() => import('./index.ts'));
const URL_ = 'https://x.test/functions/v1/send-otp';
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString();
const form = (o: Record<string, unknown> = {}) => ({ action: 'contact', name: 'سارة', email: 'Sara@Example.com', captcha: GOOD_CAPTCHA, product: 'MI-HOME', ...o });
const ip = { 'cf-connecting-ip': '203.0.113.7' };

async function run(body: unknown, tables: Record<string, any[]> = {}, opts = {}, headers: Record<string, string> = ip) {
  const net = installRest(tables, opts);
  try {
    const r = await handle(post(URL_, body, headers));
    return { status: r.status, body: await r.json(), ...net };
  } finally { net.restore(); }
}
const contactRows = (n: number, o: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, email: `x${i}@example.com`, ip: `198.51.100.${i}`, context: null, created_at: hoursAgo(0.1), ...o }));

Deno.test('OPTIONS يرد بترويسات CORS بلا جسم ولا قاعدة', async () => {
  const net = installRest({});
  try {
    const r = await handle(new Request(URL_, { method: 'OPTIONS' }));
    assertEquals(r.status, 200);
    assertEquals(r.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    assertEquals(net.calls.length, 0);
  } finally { net.restore(); }
});

Deno.test('جسم غير JSON: 500 بلا تفاصيل', async () => {
  const r = await run('not json');
  assertEquals([r.status, r.body], [500, { error: 'خطأ داخلي' }]);
});

Deno.test('send وverify القديمان مغلقان (410) ولا يلمسان القاعدة', async () => {
  for (const action of ['send', 'verify']) {
    const r = await run({ action, email: 'a@b.co' });
    assertEquals(r.status, 410);
    assertEquals(r.calls.length, 0);
  }
});

Deno.test('ping يمر بالقاعدة قراءةً، وتعذّرها 500', async () => {
  const ok = await run({ action: 'ping' });
  assertEquals([ok.status, ok.body.success, ok.body.fn], [200, true, 'send-otp']);
  assertEquals(ok.calls.map((c) => [c.method, c.table]), [['GET', 'contact_requests']]);
  const bad = await run({ action: 'ping' }, {}, { fail: () => ({ message: 'down' }) });
  assertEquals(bad.status, 500);
});

Deno.test('فعل غير معروف: 400', async () => {
  const r = await run({ action: 'nope' });
  assertEquals([r.status, r.body.error], [400, 'Invalid action']);
});

Deno.test('اسم قصير أو بريد غير صالح: 400 invalid قبل التحقق البشري', async () => {
  const a = await run(form({ name: 'س' }));
  assertEquals([a.status, a.body.code], [400, 'invalid']);
  const b = await run(form({ email: 'not-an-email' }));
  assertEquals([b.status, b.body.code], [400, 'invalid']);
  assertEquals(b.calls.length, 0);
});

Deno.test('تحقق بشري غائب أو خاطئ: 400 captcha مع مفتاح الموقع، ولا إدراج', async () => {
  const none = await run(form({ captcha: undefined }));
  assertEquals([none.status, none.body.code, none.body.site_key], [400, 'captcha', 'ts-site']);
  const wrong = await run(form({ captcha: 'turnstile-wrong-token' }));
  assertEquals(wrong.body.code, 'captcha');
  assert(!wrong.calls.some((c) => c.method === 'POST' && c.table === 'contact_requests'));
});

Deno.test('حد البريد في الساعة (3): الرابع 429 rate ولا إدراج', async () => {
  const tables = { contact_requests: contactRows(3, { email: 'sara@example.com' }) };
  const r = await run(form(), tables);
  assertEquals([r.status, r.body.code], [429, 'rate']);
  assertEquals(tables.contact_requests.length, 3);
  const below = await run(form(), { contact_requests: contactRows(2, { email: 'sara@example.com' }) });
  assertEquals(below.body.success, true);
});

Deno.test('حد الشبكة في الساعة (5)، والطلبات الأقدم من ساعة لا تُحسب', async () => {
  const hit = await run(form(), { contact_requests: contactRows(5, { ip: '203.0.113.7' }) });
  assertEquals([hit.status, hit.body.code], [429, 'rate']);
  const below = await run(form(), { contact_requests: contactRows(4, { ip: '203.0.113.7' }) });
  assertEquals(below.body.success, true);
  const old = await run(form(), { contact_requests: contactRows(5, { ip: '203.0.113.7', created_at: hoursAgo(2) }) });
  assertEquals(old.body.success, true);
});

Deno.test('الحد العام (60)، وصفوف المساعد الآلي لا تأكله', async () => {
  const full = await run(form(), { contact_requests: contactRows(60) });
  assertEquals([full.status, full.body.code], [429, 'rate']);
  const below = await run(form(), { contact_requests: contactRows(59) });
  assertEquals(below.body.success, true);
  const agent = await run(form(), { contact_requests: contactRows(60, { context: '[agent] تحويل' }) });
  assertEquals(agent.body.success, true);
});

Deno.test('تعذّر العد يفشل مغلقًا: 429 rate بلا إدراج', async () => {
  const r = await run(form(), {}, { fail: (t: string, m: string) => (t === 'contact_requests' && m === 'HEAD' ? { message: 'down' } : null) });
  assertEquals([r.status, r.body.code], [429, 'rate']);
  assert(!r.calls.some((c) => c.method === 'POST' && c.table === 'contact_requests'));
});

Deno.test('طلب سليم: يُحفظ بالبريد مصغّرًا وعنوان الشبكة، والبادئة [agent] تُنزع، والرسالتان تُحجزان مرة', async () => {
  const tables: Record<string, any[]> = {};
  const r = await run(form({ context: '[agent] أريد عرضًا' }), tables, { unique: { mail_log: ['kind', 'ref'] } });
  assertEquals([r.status, r.body], [200, { success: true }]);
  const row = tables.contact_requests[0];
  assertEquals([row.email, row.ip, row.context, row.status], ['sara@example.com', '203.0.113.7', 'أريد عرضًا', 'new']);
  assertEquals(tables.mail_log.map((m) => m.kind).sort(), ['confirm', 'notify']);
});

Deno.test('تعذّر الإدراج: 500 db', async () => {
  const r = await run(form(), {}, { fail: (t: string, m: string) => (t === 'contact_requests' && m === 'POST' ? { message: 'down' } : null) });
  assertEquals([r.status, r.body.code], [500, 'db']);
});

Deno.test('notify وconfirm القديمان: الطلب الحديث وحده (10 دقائق)، ومرة واحدة لكل نوع', async () => {
  const tables: Record<string, any[]> = { contact_requests: [{ id: 'old', email: 'a@b.co', created_at: hoursAgo(1) }] };
  const stale = await run({ action: 'notify', email: 'a@b.co' }, tables, { unique: { mail_log: ['kind', 'ref'] } });
  assertEquals(stale.body.success, true);
  assertEquals(tables.mail_log ?? [], []);
  tables.contact_requests.push({ id: 'new', email: 'a@b.co', name: 'سارة', created_at: new Date().toISOString() });
  await run({ action: 'notify', emailContact: 'A@B.co' }, tables, { unique: { mail_log: ['kind', 'ref'] } });
  await run({ action: 'notify', email: 'a@b.co' }, tables, { unique: { mail_log: ['kind', 'ref'] } });
  await run({ action: 'confirm', email: 'a@b.co' }, tables, { unique: { mail_log: ['kind', 'ref'] } });
  assertEquals(tables.mail_log.map((m) => `${m.kind}:${m.ref}`).sort(), ['confirm:new', 'notify:new']);
});

Deno.test('بلا مفتاحي Turnstile يُغلق النموذج: 503 captcha_unconfigured', async () => {
  Deno.env.delete('LEADERS_TURNSTILE_SECRET');
  try {
    const closed = await captureServe(() => import('./index.ts?no-turnstile'));
    const net = installRest({});
    try {
      const r = await closed(post(URL_, form(), ip));
      assertEquals([r.status, (await r.json()).code], [503, 'captcha_unconfigured']);
    } finally { net.restore(); }
  } finally { Deno.env.set('LEADERS_TURNSTILE_SECRET', 'ts-secret'); }
});
