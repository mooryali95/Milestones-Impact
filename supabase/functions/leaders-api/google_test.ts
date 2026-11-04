// التحقق من رمز هوية Google محليًا: مفتاح RSA مولَّد في الاختبار، وJWKS مزيّفة عبر fetch
//   deno test --node-modules-dir=none --allow-env --allow-read supabase/functions/leaders-api/
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { verifyGoogleToken } = await import('./google.ts');
const { Fail } = await import('./core.ts');
type F = InstanceType<typeof Fail>;

const b64url = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
let fetches = 0;
globalThis.fetch = ((_input: unknown) => {
  fetches += 1;
  return Promise.resolve(new Response(JSON.stringify({ keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: 'k1', alg: 'RS256', use: 'sig' }] }), { headers: { 'cache-control': 'public, max-age=3600' } }));
}) as typeof fetch;

async function token(claims: Record<string, unknown>, { kid = 'k1', alg = 'RS256', tamper = false } = {}) {
  const h = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64url(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  const p2 = tamper ? b64url(JSON.stringify({ ...claims, email: 'evil@x.sa' })) : p;
  return `${h}.${p2}.${b64url(sig)}`;
}
const claims = { iss: 'https://accounts.google.com', aud: 'client', sub: '1', email: 'sara@x.sa', email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 };
const rejects = async (t: string) => (await assertRejects(() => verifyGoogleToken(t), Fail)) as F;

Deno.test('رمز موقّع بمفتاح معروف يعود بحمولته، والمفاتيح تُجلب مرة وتُحفظ', async () => {
  const c = await verifyGoogleToken(await token(claims));
  assertEquals(c.email, 'sara@x.sa');
  const before = fetches;
  await verifyGoogleToken(await token(claims));
  assertEquals(fetches, before);   // من الذاكرة
});

Deno.test('حمولة معدّلة بعد التوقيع تُرفض 401', async () => {
  const e = await rejects(await token(claims, { tamper: true }));
  assertEquals(e.status, 401);
});

Deno.test('خوارزمية غير RS256 تُرفض، والرمز المشوّه 400', async () => {
  const e = await rejects(await token(claims, { alg: 'HS256' }));
  assertEquals(e.status, 401);
  const m = await rejects('not.a-jwt');
  assertEquals(m.status, 400);
});

Deno.test('مفتاح غير معروف: يُعاد جلب المفاتيح مرة ثم يُرفض', async () => {
  const before = fetches;
  const e = await rejects(await token(claims, { kid: 'k-rotated' }));
  assertEquals(e.status, 401);
  assertEquals(fetches, before + 1);
});
