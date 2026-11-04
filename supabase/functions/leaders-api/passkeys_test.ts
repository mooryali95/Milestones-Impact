// مفاتيح المرور: الجزء النقي (الخيارات، قراءة التحدي، رفض الردود المشوّهة) بلا قاعدة ولا مصادق
import './_test_env.ts';
import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
const { authenticationOptionsFor, challengeOf, registrationOptionsFor, verifyAuthentication, verifyRegistration } = await import('./passkeys.ts');
const { CONFIG, Fail } = await import('./core.ts');

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

Deno.test('خيارات التسجيل: النطاق المضبوط، مفتاح مقيم، واستثناء المفاتيح المسجلة', async () => {
  const o = await registrationOptionsFor({ id: 'p1', email: 'sara@x.sa', full_name: 'سارة' }, [{ credential_id: 'cred-1', transports: ['internal'] }]);
  assertEquals(o.rp.id, CONFIG.rpId);
  assertEquals(o.rp.id, 'leaders.test');
  assertEquals(o.user.name, 'sara@x.sa');
  assertEquals(o.authenticatorSelection?.residentKey, 'required');
  assertEquals(o.excludeCredentials?.[0]?.id, 'cred-1');
  assert(o.challenge.length >= 32);
});

Deno.test('خيارات الدخول: النطاق المضبوط وتحدٍّ جديد في كل مرة', async () => {
  const a = await authenticationOptionsFor(), b = await authenticationOptionsFor();
  assertEquals(a.rpId, 'leaders.test');
  assert(a.challenge !== b.challenge);
});

Deno.test('التحدي يُقرأ من clientDataJSON، والرد المشوّه يُرفض', () => {
  assertEquals(challengeOf({ response: { clientDataJSON: b64url(JSON.stringify({ challenge: 'abc-123', type: 'webauthn.create' })) } }), 'abc-123');
  assertThrows(() => challengeOf({}), Fail);
  assertThrows(() => challengeOf({ response: { clientDataJSON: b64url('{}') } }), Fail);
});

Deno.test('رد تسجيل أو دخول لا يطابق التحدي أو النطاق يُرفض برسالة واحدة', async () => {
  const fake = { id: 'x', rawId: 'eA', type: 'public-key', response: { clientDataJSON: b64url(JSON.stringify({ challenge: 'other', origin: 'https://leaders.test', type: 'webauthn.create' })), attestationObject: 'AA' }, clientExtensionResults: {} };
  const e = await assertRejects(() => verifyRegistration(fake, 'expected'), Fail);
  assertEquals((e as InstanceType<typeof Fail>).message, 'تعذّر التحقق من مفتاح المرور');
  const fakeAuth = { ...fake, response: { ...fake.response, authenticatorData: 'AA', signature: 'AA' } };
  await assertRejects(() => verifyAuthentication(fakeAuth, 'expected', { id: 'x', publicKey: new Uint8Array(8), counter: 0 } as any), Fail);
});
