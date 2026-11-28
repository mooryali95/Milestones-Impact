// user-api (تسجيل المصفوفة ودخولها): حد الشبكة والتهدئة والتحقق البشري قبل الإرسال، والرمز هاش صالح 10 دقائق ولمرة،
// وسقف المحاولات الفاشلة، والجلسة لتسجيل هذا البريد وحده، والحفظ بحقول مسموحة، ومفتاح المرور بعد دخول حديث.
// المعالج الحقيقي على PostgREST في الذاكرة، وResend وTurnstile محاكاة
import { assert, assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@1.0.19';
import { captureServe, GOOD_CAPTCHA, installRest, post } from '../_shared/_fake_rest.ts';

Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
Deno.env.set('LEADERS_TURNSTILE_SECRET', 'ts-secret');
Deno.env.set('LEADERS_TURNSTILE_SITE_KEY', 'ts-site');
Deno.env.set('RESEND_API_KEY', 're_test_key');
Deno.env.delete('MATRIX_NOTIFY_EMAIL');

const handle = await captureServe(() => import('./index.ts'));
const URL_ = 'https://x.test/functions/v1/user-api';
// أرقام جوال اختبارية تُبنى ولا تُكتب نصًا (single-source.test.js يمنع رقمًا منشورًا)
const PHONE_A = ['05', '01234567'].join(''), PHONE_B = ['05', '09999999'].join('');
const ip = { 'cf-connecting-ip': '203.0.113.9' };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
type T = Record<string, any[]>;

async function run(body: unknown, tables: T = {}, opts = {}, headers: Record<string, string> = ip) {
  const net = installRest(tables, opts);
  try {
    const r = await handle(post(URL_, body, headers));
    return { status: r.status, body: await r.json(), ...net };
  } finally { net.restore(); }
}
const sentCode = (calls: { url: string; body?: any }[]) => {
  const m = calls.filter((c) => c.url.includes('api.resend.com')).map((c) => String(c.body?.subject || '').match(/(\d{6})/)?.[1]);
  return m[m.length - 1] || null;
};
const reg = { action: 'register-send', name: 'سارة', phone: PHONE_A, email: 'Sara@Example.com', captcha: GOOD_CAPTCHA };
async function session(tables: T, subject: string, meta: Record<string, unknown> = { method: 'email', auth_at: Date.now() }, expires = later(36e5)) {
  const token = 'a'.repeat(64);
  (tables.api_sessions ||= []).push({ token_hash: await sha(token), kind: 'user', subject, meta, expires_at: expires });
  return token;
}

Deno.test('OPTIONS بترويسات CORS ومهلة التخزين', async () => {
  const r = await handle(new Request(URL_, { method: 'OPTIONS' }));
  assertEquals(r.headers.get('Access-Control-Max-Age'), '86400');
});

Deno.test('ping يقرأ من القاعدة، وتعذّرها 500 خطأ داخلي، والفعل المجهول 400', async () => {
  const ok = await run({ action: 'ping' });
  assertEquals([ok.status, ok.body.fn], [200, 'user-api']);
  const bad = await run({ action: 'ping' }, {}, { fail: () => ({ message: 'down' }) });
  assertEquals([bad.status, bad.body.message], [500, 'خطأ داخلي']);
  const none = await run({ action: 'nope' });
  assertEquals(none.status, 400);
});

Deno.test('register-send: اسم أو جوال أو بريد غير صالح 400 قبل أي قاعدة', async () => {
  for (const o of [{ name: '' }, { phone: '12345' }, { email: 'a@b' }, { email: 'a"b@c.com' }]) {
    const r = await run({ ...reg, ...o });
    assertEquals(r.status, 400);
    assertEquals(r.calls.length, 0);
  }
});

Deno.test('register-send: تحقق بشري غائب أو خاطئ 400 captcha، ولا رمز', async () => {
  const tables: T = {};
  const none = await run({ ...reg, captcha: undefined }, tables);
  assertEquals([none.status, none.body.code, none.body.site_key], [400, 'captcha', 'ts-site']);
  const wrong = await run({ ...reg, captcha: 'turnstile-wrong-token' }, tables);
  assertEquals(wrong.body.code, 'captcha');
  assertEquals(tables.email_otps ?? [], []);
});

Deno.test('register-send: حد الشبكة في اليوم (60)، وتعذّر عدّه يفشل مغلقًا', async () => {
  const full = await run(reg, { email_otps: Array.from({ length: 60 }, () => ({ email: 'x@y.co', ip: '203.0.113.9', created_at: ago(36e5) })) });
  assertEquals([full.status, full.body.code], [429, 'rate']);
  const below = await run(reg, { email_otps: Array.from({ length: 59 }, () => ({ email: 'x@y.co', ip: '203.0.113.9', created_at: ago(36e5) })) });
  assertEquals([below.status, below.body.success], [200, true]);
  const blind = await run(reg, {}, { fail: (t: string, m: string) => (t === 'email_otps' && m === 'HEAD' ? { message: 'down' } : null) });
  assertEquals([blind.status, blind.body.code], [429, 'rate']);
});

Deno.test('register-send: تهدئة 60 ثانية لكل بريد', async () => {
  const r = await run(reg, { email_otps: [{ email: 'sara@example.com', created_at: ago(10_000) }] });
  assertEquals(r.status, 429);
  assertMatch(r.body.message, /يرجى الانتظار \d+ ثانية/);
  const later = await run(reg, { email_otps: [{ email: 'sara@example.com', created_at: ago(61_000) }] });
  assertEquals([later.status, later.body.success], [200, true]);
});

Deno.test('register-send سليم: الرمز يُحفظ هاشًا لا نصًا، صالحًا 10 دقائق، ولا يكشف الرد التسجيل', async () => {
  const tables: T = {};
  const r = await run(reg, tables);
  assertEquals([r.status, r.body], [200, { success: true, mode: 'new' }]);
  const code = sentCode(r.calls);
  assert(code);
  const row = tables.email_otps[0];
  assertNotEquals(row.otp_code, code);
  assertEquals(row.otp_code, await sha(`user-otp:sara@example.com:${code}`));
  assertEquals([row.email, row.ip, row.verified], ['sara@example.com', '203.0.113.9', false]);
  const ttl = new Date(row.expires_at).getTime() - Date.now();
  assert(ttl > 9 * 60e3 && ttl <= 10 * 60e3);
});

Deno.test('register-send: تعذّر البريد 502 ويُحذف الرمز فلا يُحسب في حد الشبكة', async () => {
  const tables: T = {};
  const r = await run(reg, tables, { resendStatus: 500 });
  assertEquals([r.status, r.body.code], [502, 'mail_failed']);
  assertEquals(tables.email_otps, []);
});

Deno.test('resume-send: الرد نفسه لجوال غير مسجّل، ولا رسالة', async () => {
  const r = await run({ action: 'resume-send', phone: PHONE_B, captcha: GOOD_CAPTCHA });
  assertEquals([r.status, r.body], [200, { success: true }]);
  assertEquals(sentCode(r.calls), null);
  const bad = await run({ action: 'resume-send', phone: '99' });
  assertEquals(bad.status, 400);
});

async function issued(tables: T) {
  const r = await run(reg, tables);
  return sentCode(r.calls)!;
}

Deno.test('verify: رمز خاطئ يُرفض ويُسجَّل، والصحيح يفتح جلسة لتسجيل جديد، ولا يصلح الرمز مرتين', async () => {
  const tables: T = {};
  const code = await issued(tables);
  const wrong = await run({ action: 'verify', otp: code === '000000' ? '111111' : '000000', email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, tables);
  assertEquals([wrong.status, wrong.body.success], [200, false]);
  assertEquals(tables.totp_attempts.map((a) => a.success), [false]);
  const ok = await run({ action: 'verify', otp: code, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, tables);
  assertEquals([ok.body.success, ok.body.mode], [true, 'new']);
  assertEquals(ok.body.token.length, 64);
  assertEquals(tables.registrations.length, 1);
  const s = tables.api_sessions[0];
  assertEquals([s.token_hash, s.subject, s.kind], [await sha(ok.body.token), ok.body.registration.id, 'user']);
  const again = await run({ action: 'verify', otp: code, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, tables);
  assertEquals(again.body.success, false);
});

Deno.test('verify: الرمز المنتهي يُرفض', async () => {
  const tables: T = {};
  const code = await issued(tables);
  tables.email_otps[0].expires_at = ago(1000);
  const r = await run({ action: 'verify', otp: code, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, tables);
  assertEquals(r.body.success, false);
  assertEquals(tables.registrations ?? [], []);
});

Deno.test('verify: خمس محاولات فاشلة في 15 دقيقة توقف حتى الرمز الصحيح (429)', async () => {
  const tables: T = { totp_attempts: Array.from({ length: 5 }, () => ({ email: 'sara@example.com', success: false, created_at: ago(60e3) })) };
  const code = await issued(tables);
  const r = await run({ action: 'verify', otp: code, email: 'sara@example.com' }, tables);
  assertEquals(r.status, 429);
  const four = { totp_attempts: Array.from({ length: 4 }, () => ({ email: 'sara@example.com', success: false, created_at: ago(60e3) })) } as T;
  const code4 = await issued(four);
  const r4 = await run({ action: 'verify', otp: code4, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, four);
  assertEquals(r4.body.success, true);
  const old = { totp_attempts: Array.from({ length: 5 }, () => ({ email: 'sara@example.com', success: false, created_at: ago(20 * 60e3) })) } as T;
  const code2 = await issued(old);
  const r2 = await run({ action: 'verify', otp: code2, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, old);
  assertEquals(r2.body.success, true);
});

Deno.test('verify: رمز بغير 6 أرقام أو بلا بريد ولا جوال 400', async () => {
  assertEquals((await run({ action: 'verify', otp: '12' })).status, 400);
  assertEquals((await run({ action: 'verify', otp: '123456' })).status, 400);
});

Deno.test('verify: جوال لصاحب بريد آخر لا يفتح جلسة (409)، والاستئناف بالجوال يفتح جلسة صاحبه', async () => {
  const tables: T = { registrations: [{ id: 'reg:1', name: 'ليلى', phone: PHONE_A, email: 'layla@example.com' }] };
  const code = await issued(tables);
  const r = await run({ action: 'verify', otp: code, email: 'sara@example.com', name: 'سارة', phone: PHONE_A }, tables);
  assertEquals(r.status, 409);
  assertEquals(tables.api_sessions ?? [], []);
  const net = await run({ action: 'resume-send', phone: PHONE_A, captcha: GOOD_CAPTCHA }, tables);
  const code2 = sentCode(net.calls)!;
  const ok = await run({ action: 'verify', otp: code2, phone: PHONE_A }, tables);
  assertEquals([ok.body.success, ok.body.mode, ok.body.registration.id], [true, 'resume', 'reg:1']);
});

Deno.test('get وsave: بلا جلسة أو بجلسة منتهية 401', async () => {
  const tables: T = { registrations: [{ id: 'reg:1', email: 'a@b.co' }] };
  for (const action of ['get', 'save']) assertEquals((await run({ action, token: 'short' }, tables)).status, 401);
  const token = await session(tables, 'reg:1', { method: 'email', auth_at: Date.now() }, ago(1000));
  assertEquals((await run({ action: 'get', token }, tables)).status, 401);
});

Deno.test('get يعيد تسجيل الجلسة وحده، وsave يكتب الحقول المسموحة فقط', async () => {
  const tables: T = { registrations: [{ id: 'reg:1', name: 'سارة', email: 'a@b.co', submitted: false, reopenRequested: false, dates: {} }, { id: 'reg:2', email: 'other@b.co' }] };
  const token = await session(tables, 'reg:1');
  const g = await run({ action: 'get', token }, tables);
  assertEquals(g.body.registration.id, 'reg:1');
  const s = await run({ action: 'save', token, fields: { dates: { a: 1 }, email: 'evil@x.co', name: 'غيره' } }, tables);
  assertEquals(s.body.success, true);
  assertEquals([tables.registrations[0].email, tables.registrations[0].name, tables.registrations[0].dates], ['a@b.co', 'سارة', { a: 1 }]);
  assertEquals((await run({ action: 'save', token, fields: { email: 'x' } }, tables)).status, 400);
  assertEquals((await run({ action: 'save', token, fields: { dates: 'x'.repeat(100_001) } }, tables)).status, 413);
});

Deno.test('save: المقدَّم لا يُلغى تقديمه من المسجل', async () => {
  const tables: T = { registrations: [{ id: 'reg:1', email: 'a@b.co', submitted: true, reopenRequested: false }] };
  const token = await session(tables, 'reg:1');
  await run({ action: 'save', token, fields: { submitted: false } }, tables);
  assertEquals(tables.registrations[0].submitted, true);
});

Deno.test('مفتاح المرور: بلا جلسة 401، ودخول غير حديث 403 reauth، ومن له مفتاح يضيف غيره بجلسة مفتاح وحدها', async () => {
  const tables: T = { registrations: [{ id: 'reg:1', email: 'a@b.co', name: 'سارة' }] };
  assertEquals((await run({ action: 'passkey-status', token: '' }, tables)).status, 401);
  const stale = await session(tables, 'reg:1', { method: 'email', auth_at: Date.now() - 11 * 60e3 });
  const r = await run({ action: 'passkey-register-options', token: stale }, tables);
  assertEquals([r.status, r.body.code], [403, 'reauth']);
  tables.api_sessions = [];
  tables.user_passkeys = [{ registration_id: 'reg:1', credential_id: 'cred1' }];
  const fresh = await session(tables, 'reg:1');
  assertEquals((await run({ action: 'passkey-status', token: fresh }, tables)).body.count, 1);
  const e = await run({ action: 'passkey-register-options', token: fresh }, tables);
  assertEquals([e.status, e.body.code], [403, 'reauth_passkey']);
});

Deno.test('مفتاح المرور: التحدي يُحفظ لخمس دقائق، والتحقق بلا تحدٍ صالح 400، وفيض التحديات 429', async () => {
  const tables: T = {};
  const o = await run({ action: 'passkey-login-options' }, tables);
  assertEquals(o.body.success, true);
  assertEquals(tables.webauthn_challenges[0].challenge, o.body.options.challenge);
  const v = await run({ action: 'passkey-login-verify', response: { id: 'x', response: { clientDataJSON: btoa(JSON.stringify({ challenge: 'unknown' })) } } }, tables);
  assertEquals(v.status, 400);
  const flood: T = { webauthn_challenges: Array.from({ length: 120 }, () => ({ scope: 'user', created_at: ago(1000) })) };
  assertEquals((await run({ action: 'passkey-login-options' }, flood)).status, 429);
});

Deno.test('بلا مفتاحي Turnstile يُغلق الإرسال برمز: 503 captcha_unconfigured', async () => {
  Deno.env.delete('LEADERS_TURNSTILE_SITE_KEY');
  try {
    const closed = await captureServe(() => import('./index.ts?no-turnstile'));
    const net = installRest({});
    try {
      const r = await closed(post(URL_, reg, ip));
      assertEquals([r.status, (await r.json()).code], [503, 'captcha_unconfigured']);
    } finally { net.restore(); }
  } finally { Deno.env.set('LEADERS_TURNSTILE_SITE_KEY', 'ts-site'); }
});
