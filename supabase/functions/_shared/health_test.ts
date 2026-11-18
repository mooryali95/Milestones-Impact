// فحص الصحة: GET وHEAD وحدهما، بلا قراءة لجسم الطلب، والرد اسم الدالة وحده
import { assertEquals } from 'jsr:@std/assert@1';
import { healthCheck } from './health.ts';

Deno.test('GET يعيد نجاحًا باسم الدالة وحده، بلا تخزين', async () => {
  const r = healthCheck(new Request('https://x.test/functions/v1/creem-webhook', { method: 'GET' }), 'creem-webhook');
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals(await r?.json(), { success: true, fn: 'creem-webhook' });
});

Deno.test('HEAD بلا جسم', async () => {
  const r = healthCheck(new Request('https://x.test/', { method: 'HEAD' }), 'leaders-hooks');
  assertEquals(r?.status, 200);
  assertEquals(await r?.text(), '');
});

Deno.test('POST وOPTIONS يمران إلى الخطاف كما هما', () => {
  for (const method of ['POST', 'OPTIONS', 'PUT']) {
    assertEquals(healthCheck(new Request('https://x.test/', { method, body: method === 'OPTIONS' ? undefined : '{}' }), 'x'), null);
  }
});
