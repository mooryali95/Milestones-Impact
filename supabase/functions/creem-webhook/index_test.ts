// creem-webhook (الدفع): فحص الصحة وGET وحدهما بلا أثر، وغير POST 405، والتوقيع قبل أي كتابة، والحدث المعالَج لا يُعالج مرتين،
// وخطأ غير متوقع ينبّه التشغيل ويرد 500 فيعيد Creem المحاولة. المعالج الحقيقي (Deno.serve ملتقَط) على قاعدة في الذاكرة
import '../leaders-api/_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { captureServe } from '../_shared/_fake_rest.ts';
const { installFake, withNet } = await import('../leaders-api/_fake_db.ts');

const SECRET = 'whsec-test';
Deno.env.set('CREEM_WEBHOOK_SECRET', SECRET);
const handle = await captureServe(() => import('./index.ts'));
const URL_ = 'https://x.test/functions/v1/creem-webhook';

async function sign(raw: string, key = SECRET) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
}
const hook = (raw: string, sig: string | null) => new Request(URL_, { method: 'POST', body: raw, headers: sig === null ? {} : { 'creem-signature': sig } });
async function call(req: Request, tables: Record<string, any[]> = {}, opts = {}) {
  const fake = installFake(tables, opts);
  try {
    return await withNet(async (net) => { const r = await handle(req); return { status: r.status, body: await r.json(), writes: fake.writes, net }; });
  } finally { fake.restore(); }
}

Deno.test('GET فحص صحة بلا قاعدة، وغير POST 405', async () => {
  const g = await call(new Request(URL_));
  assertEquals([g.status, g.body], [200, { success: true, fn: 'creem-webhook' }]);
  assertEquals(g.writes, []);
  const p = await call(new Request(URL_, { method: 'PUT', body: '{}' }));
  assertEquals([p.status, p.body], [405, { success: false }]);
});

Deno.test('توقيع غائب أو بسر آخر: 401 signature ولا كتابة ولا تنبيه', async () => {
  const raw = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed', object: {} });
  for (const sig of [null, await sign(raw, 'other'), (await sign(raw)).slice(2)]) {
    const r = await call(hook(raw, sig));
    assertEquals([r.status, r.body], [401, { success: false, code: 'signature' }]);
    assertEquals(r.writes, []);
    assertEquals(r.net.length, 0);
  }
});

Deno.test('توقيع صحيح لجسم معدَّل يُرفض', async () => {
  const raw = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed' });
  const r = await call(hook(raw.replace('evt_1', 'evt_2'), await sign(raw)));
  assertEquals([r.status, r.body], [401, { success: false, code: 'signature' }]);
  assertEquals(r.writes, []);
  assertEquals(r.net.length, 0);
});

Deno.test('حمولة بلا معرّف: 400 payload', async () => {
  const raw = JSON.stringify({ eventType: 'checkout.completed' });
  const r = await call(hook(raw, await sign(raw)));
  assertEquals([r.status, r.body.code], [400, 'payload']);
});

Deno.test('حدث معالَج من قبل: نجاح duplicate بلا معالجة ثانية', async () => {
  const raw = JSON.stringify({ id: 'evt_dup', eventType: 'checkout.completed', object: {} });
  const tables = { payment_events: [{ event_id: 'evt_dup', processed_at: new Date().toISOString() }] };
  const r = await call(hook(raw, await sign(raw)), tables, { fail: (t: string, op: { kind: string }) => (t === 'payment_events' && op.kind === 'insert' ? { code: '23505', message: 'duplicate' } : null) });
  assertEquals([r.status, r.body], [200, { success: true, duplicate: true }]);
  assert(!r.writes.some((w) => w.kind === 'update'));
});

Deno.test('حدث سابق لم تكتمل معالجته يُعاد، وحدث غير معروف يُعلَّم معالجًا', async () => {
  const raw = JSON.stringify({ id: 'evt_retry', eventType: 'subscription.active', object: {} });
  const tables: Record<string, any[]> = { payment_events: [{ event_id: 'evt_retry', processed_at: null }] };
  const r = await call(hook(raw, await sign(raw)), tables, { fail: (t: string, op: { kind: string }) => (t === 'payment_events' && op.kind === 'insert' ? { code: '23505', message: 'duplicate' } : null) });
  assertEquals([r.status, r.body.success], [200, true]);
  assert(tables.payment_events[0].processed_at);
});

Deno.test('دفع لا تُعرف دفعته: 500 ويُنبَّه التشغيل ويُسجَّل الخطأ في صف الحدث', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.test/alert');
  try {
    const raw = JSON.stringify({ id: 'evt_missing', eventType: 'checkout.completed', object: { id: 'ch_x' } });
    const tables: Record<string, any[]> = {};
    const r = await call(hook(raw, await sign(raw)), tables);
    assertEquals([r.status, r.body], [500, { success: false }]);
    assertEquals(tables.payment_events[0].error, 'payment not found');
    assertEquals(tables.payment_events[0].processed_at ?? null, null);
  } finally { Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('بلا سر للإشعار: 503 config', async () => {
  Deno.env.delete('CREEM_WEBHOOK_SECRET');
  try {
    const r = await call(hook('{"id":"e"}', '00'));
    assertEquals([r.status, r.body.code], [503, 'config']);
  } finally { Deno.env.set('CREEM_WEBHOOK_SECRET', SECRET); }
});
