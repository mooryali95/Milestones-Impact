// الدفع: توقيع إشعار Creem (HMAC-SHA256) يُفحص قبل أي كتابة، ووضع المفتاح من بادئته
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { modeOf, webhook } = await import('./payments.ts');
const { Fail } = await import('./core.ts');

const SECRET = 'whsec-test';
async function sign(raw: string, key = SECRET) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
}
const headers = (sig: string) => new Headers({ 'creem-signature': sig });
type F = InstanceType<typeof Fail>;
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as F;

Deno.test('وضع المفتاح من بادئته', () => {
  assertEquals(modeOf('creem_test_abc'), 'test');
  assertEquals(modeOf('creem_live_abc'), 'live');
});

Deno.test('بلا سر للإشعار: 503 config قبل أي قراءة', async () => {
  Deno.env.delete('CREEM_WEBHOOK_SECRET'); Deno.env.delete('CAREEM_WEBHOOK_SECRET');
  const e = await failOf(() => webhook('{"id":"evt"}', headers('00')));
  assertEquals([e.status, e.code], [503, 'config']);
});

Deno.test('توقيع خاطئ أو غائب: 401 signature', async () => {
  Deno.env.set('CREEM_WEBHOOK_SECRET', SECRET);
  const raw = JSON.stringify({ id: 'evt_1', type: 'checkout.completed' });
  const other = await sign(raw, 'other');
  const bad = await failOf(() => webhook(raw, headers(other)));
  assertEquals([bad.status, bad.code], [401, 'signature']);
  const none = await failOf(() => webhook(raw, new Headers()));
  assertEquals(none.code, 'signature');
});

Deno.test('توقيع صحيح لكن الحمولة بلا معرّف أو غير JSON: 400 payload (لم تُمس القاعدة)', async () => {
  Deno.env.set('CREEM_WEBHOOK_SECRET', SECRET);
  const raw = JSON.stringify({ type: 'checkout.completed' });
  const sig = await sign(raw), sigNot = await sign('not json');
  const e = await failOf(() => webhook(raw, headers(sig)));
  assertEquals([e.status, e.code], [400, 'payload']);
  const j = await failOf(() => webhook('not json', headers(sigNot)));
  assertEquals(j.code, 'payload');
  // الاسم البديل للسر يُقبل أيضًا
  Deno.env.delete('CREEM_WEBHOOK_SECRET'); Deno.env.set('CAREEM_WEBHOOK_SECRET', SECRET);
  const alias = await failOf(() => webhook(raw, headers(sig)));
  assertEquals(alias.code, 'payload');
});
