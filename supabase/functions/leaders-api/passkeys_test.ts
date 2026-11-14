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

// ── M3 وM9: الدخول الحديث شرط إضافة المفتاح، والسقف المطلق للجلسة ──
Deno.test('إضافة مفتاح: جلسة حديثة بوسيلة تثبت صاحب الحساب وحدها', async () => {
  const { stepUpOk } = await import('./passkeys.ts');
  const now = Date.parse('2026-11-14T12:00:00Z');
  const at = (min: number) => new Date(now - min * 6e4).toISOString();
  assert(stepUpOk({ method: 'email_code', created_at: at(5) }, now));
  assert(stepUpOk({ method: 'passkey', created_at: at(CONFIG.passkeyStepUpMinutes) }, now));
  assert(!stepUpOk({ method: 'email_code', created_at: at(CONFIG.passkeyStepUpMinutes + 1) }, now), 'جلسة قديمة');
  assert(!stepUpOk({ method: 'demo', created_at: at(1) }, now), 'جلسة العرض');
  assert(!stepUpOk({ method: 'switch', created_at: at(1) }, now), 'تبديل الدور');
  assert(!stepUpOk(null, now));
});

Deno.test('سقف الجلسة: 30 يومًا من الدخول، و8 ساعات لجلسة العرض، مهما تجددت', async () => {
  const { sessionHardEnd } = await import('./participant.ts');
  const t0 = '2026-11-01T00:00:00Z';
  assertEquals(sessionHardEnd({ created_at: t0, method: 'email_code' }), Date.parse(t0) + CONFIG.sessionMaxDays * 864e5);
  assertEquals(sessionHardEnd({ created_at: t0, method: 'demo' }), Date.parse(t0) + CONFIG.demoSessionHours * 36e5);
  assertEquals(CONFIG.sessionMaxDays, 30);
  assert(CONFIG.demoSessionHours <= 8);
});
