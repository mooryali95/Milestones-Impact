// leaders-hooks (حجوزات Cal.com وCalendly): فحص الصحة، والمزود المجهول 404، والتوقيع قبل أي كتابة، وتوقيع Calendly
// القديم (أكثر من 5 دقائق) يُرفض، والحدث المتكرر لا يكرر الجلسة. المعالج الحقيقي على قاعدة في الذاكرة
import '../leaders-api/_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { captureServe } from '../_shared/_fake_rest.ts';

Deno.env.set('LEADERS_CALCOM_SECRET', 'cal-secret');
Deno.env.set('LEADERS_CALENDLY_KEY', 'calendly-secret');
const { installFake, withNet } = await import('../leaders-api/_fake_db.ts');
const handle = await captureServe(() => import('./index.ts'));
const base = 'https://x.test/functions/v1/leaders-hooks';

async function hmac(key: string, raw: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function call(req: Request, tables: Record<string, any[]> = {}) {
  const fake = installFake(tables);
  try {
    return await withNet(async () => { const r = await handle(req); return { status: r.status, body: await r.json(), writes: fake.writes }; });
  } finally { fake.restore(); }
}
const req = (p: string, raw: string, headers: Record<string, string> = {}) => new Request(`${base}?p=${p}`, { method: 'POST', body: raw, headers });

Deno.test('GET فحص صحة بمزود أو بلا مزود، وغير POST 405', async () => {
  for (const u of [base, `${base}?p=calcom`]) {
    const r = await call(new Request(u));
    assertEquals([r.status, r.body], [200, { success: true, fn: 'leaders-hooks' }]);
  }
  assertEquals((await call(new Request(base, { method: 'DELETE' }))).status, 405);
});

Deno.test('مزود مجهول أو غائب: 404 قبل قراءة الجسم', async () => {
  for (const p of ['', 'zoom']) {
    const r = await call(req(p, '{}'));
    assertEquals([r.status, r.body.message], [404, 'unknown provider']);
  }
});

Deno.test('Cal.com: توقيع غائب أو خاطئ 401 signature ولا كتابة', async () => {
  const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'b1' } });
  for (const h of [{}, { 'x-cal-signature-256': await hmac('other', raw) }] as Record<string, string>[]) {
    const r = await call(req('calcom', raw, h));
    assertEquals([r.status, r.body], [401, { success: false, code: 'signature' }]);
    assertEquals(r.writes, []);
  }
});

Deno.test('Cal.com: موقّع لكن جسم غير JSON 400، وحدث غير معني يُتجاهل', async () => {
  const bad = 'not json';
  const r = await call(req('calcom', bad, { 'x-cal-signature-256': await hmac('cal-secret', bad) }));
  assertEquals(r.status, 400);
  const raw = JSON.stringify({ triggerEvent: 'MEETING_ENDED', payload: {} });
  const ok = await call(req('calcom', raw, { 'x-cal-signature-256': await hmac('cal-secret', raw) }));
  assertEquals([ok.status, ok.body.success], [200, true]);
  assertEquals(ok.writes, []);
});

Deno.test('Calendly: توقيع صحيح لكن أقدم من 5 دقائق يُرفض (منع الإعادة)، والحديث يُقبل', async () => {
  const raw = JSON.stringify({ event: 'invitee.created', payload: {} });
  const old = Math.floor(Date.now() / 1000) - 600;
  const stale = await call(req('calendly', raw, { 'calendly-webhook-signature': `t=${old},v1=${await hmac('calendly-secret', `${old}.${raw}`)}` }));
  assertEquals([stale.status, stale.body], [401, { success: false, code: 'signature' }]);
  assertEquals(stale.writes, []);
  const now = Math.floor(Date.now() / 1000);
  const fresh = await call(req('calendly', raw, { 'calendly-webhook-signature': `t=${now},v1=${await hmac('calendly-secret', `${now}.${raw}`)}` }));
  assertEquals([fresh.status, fresh.body.success], [200, true]);
});

Deno.test('إلغاء موقّع يكرر بلا أثر ثانٍ: الجلسة الملغاة لا تُلغى مرة أخرى', async () => {
  const tables: Record<string, any[]> = { coaching_sessions: [{ id: 's1', external_id: 'calcom:b1', status: 'booked' }] };
  const raw = JSON.stringify({ triggerEvent: 'BOOKING_CANCELLED', payload: { uid: 'b1' } });
  const h = { 'x-cal-signature-256': await hmac('cal-secret', raw) };
  const a = await call(req('calcom', raw, h), tables);
  assertEquals(a.status, 200);
  assertEquals(tables.coaching_sessions[0].status, 'cancelled');
  tables.coaching_sessions[0].updated_at = '2000-01-01T00:00:00.000Z';
  const b = await call(req('calcom', raw, h), tables);
  assertEquals(b.status, 200);
  assertEquals(tables.coaching_sessions[0].updated_at, '2000-01-01T00:00:00.000Z');
  assertEquals(b.writes.filter((w: any) => w.kind === 'update' && w.ids?.length), []);
});
