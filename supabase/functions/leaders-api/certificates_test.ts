// D05: مفتاح توقيع الشهادات مستقل عن الفلفل بمعرّف مفتاح، فتدويره لا يبطل ما صدر، وتدوير الفلفل لا يمس الجديد.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { checkCertificate, signCertificate, PASSING } = await import('./certificates.ts');
const { Fail } = await import('./core.ts');

const K1 = 'k1-'.padEnd(40, 'a');
const K2 = 'k2-'.padEnd(40, 'b');
async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('التوقيع بالمفتاح الحالي ومعرّفه، ويُرفض نص معدّل', async () => {
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', K2); Deno.env.set('LEADERS_CERT_KEY_ID', 'k2'); Deno.env.set('LEADERS_CERT_PREVIOUS_KEYS', JSON.stringify({ k1: K1 }));
  const sig = await signCertificate('MI-LDR-2026-ABCDEF|سارة');
  assert(sig.startsWith('k2:'));
  assertEquals(await checkCertificate('MI-LDR-2026-ABCDEF|سارة', sig), true);
  assertEquals(await checkCertificate('MI-LDR-2026-ABCDEF|سارة أخرى', sig), false);
});

Deno.test('بعد التدوير: ما وُقّع بالمفتاح السابق يبقى صحيحًا، والمعرّف المجهول مرفوض', async () => {
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', K2); Deno.env.set('LEADERS_CERT_KEY_ID', 'k2'); Deno.env.set('LEADERS_CERT_PREVIOUS_KEYS', JSON.stringify({ k1: K1 }));
  assertEquals(await checkCertificate('نص', `k1:${await hmac(K1, 'نص')}`), true);
  assertEquals(await checkCertificate('نص', `k9:${await hmac(K1, 'نص')}`), false);
  assertEquals(await checkCertificate('نص', 'k1:zz'), false);
});

Deno.test('ما صدر قبل الفصل (بلا معرّف) يُتحقق منه بالفلفل كما كان', async () => {
  assertEquals(await checkCertificate('قديم', await hmac('cert:test-pepper', 'قديم')), true);
  assertEquals(await checkCertificate('قديم', await hmac('cert:other-pepper', 'قديم')), false);
});

Deno.test('بلا مفتاح مستقل لا تصدر شهادة (503)، والشهادة لقراري الاجتياز وحدهما', async () => {
  Deno.env.delete('LEADERS_CERT_SIGNING_KEY');
  const e = (await assertRejects(() => signCertificate('x'), Fail)) as InstanceType<typeof Fail>;
  assertEquals([e.status, e.code], [503, 'cert_key_missing']);
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', 'short');
  assertEquals(((await assertRejects(() => signCertificate('x'), Fail)) as InstanceType<typeof Fail>).code, 'cert_key_missing');
  assertEquals(PASSING, ['pass', 'pass_notes']);
});
