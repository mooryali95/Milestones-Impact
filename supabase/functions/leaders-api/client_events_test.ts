// أحداث الإخفاق من جهة العميل (client.event، تصور التحديث بلا أثر، المرحلة 4): على الموجّه الحقيقي (index.ts) بقاعدة في
// الذاكرة. الشكل والحقول المسموحة وحدها، وسقف الحجم والعدد، وحد المعدل لكل شبكة ببصمتها، ولا بيانات شخصية ولا عنوان في
// الصف، وnot_migrated قبل الترحيل، وتنبيه أجهزة كثيرة أخفق فتحها، وترويسة x-client-build معلنة ومقبولة في CORS.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
await import('./index.ts');
const CE = await import('./client-events.ts');
const S = await import('./system.ts');

type Row = Record<string, any>;
const IP = '203.0.113.7';
const post = (body: unknown, { ip = IP, build = '' } = {}) => handler(new Request('https://x.test/leaders-api', {
  method: 'POST',
  headers: { origin: 'https://leaders.test', 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(build && { 'x-client-build': build }) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));
const ev = (over: Row = {}) => ({ kind: 'TypeError', act: 'me', tries: 3, build: 'B1abc', at: new Date().toISOString(), ...over });
function fake(tables: Record<string, Row[]> = { client_events: [], audit_log: [] }, missing = false) {
  return installFake(tables, { fail: (t) => (missing && t === 'client_events' ? { code: 'PGRST205', message: 'relation leaders.client_events not found' } : null) });
}

Deno.test('يحفظ الحقول المسموحة وحدها: لا رمز ولا بريد ولا رابط باستعلام ولا عنوان الشبكة نفسه', async () => {
  const f = fake();
  try {
    const r = await post({
      action: 'client.event', token: 'tok-secret-0000000000000000000000',
      events: [
        ev({ participant_id: 'p-1', email: 'sara@x.sa', url: 'https://leaders.test/verify?t=SECRET' }),
        ev({ kind: 'error', act: '', message: 'boom sara@x.sa at https://leaders.test/verify?e=a&t=SECRET 0661234567' }),
        ev({ kind: 'busy', act: 'Bad Act?x=1', message: 'لا نص لأنواع الشبكة' }),
      ],
    }, { build: 'hdrBuild' });
    assertEquals(r.status, 200);
    assertEquals((await r.json()).stored, 3);
    const rows = f.tables.client_events;
    assertEquals(rows.length, 3);
    const keys = new Set(rows.flatMap((x) => Object.keys(x)));
    for (const k of keys) assert(['id', 'created_at', 'kind', 'act', 'tries', 'build', 'message', 'at', 'ip_hash'].includes(k), k);
    const all = JSON.stringify(rows);
    for (const s of ['tok-secret', 'sara@x.sa', 'p-1', 'SECRET', '0661234567', IP, '?e=']) assert(!all.includes(s), s);
    assertEquals(rows[1].message, 'boom [email] at https://leaders.test/verify #');
    assertEquals(rows[2].act, '');
    assertEquals(rows[2].message, null);
    assertEquals(rows[0].ip_hash.length, 64);
    assertEquals(rows[0].build, 'B1abc');
  } finally { f.restore(); }
});

Deno.test('الشكل: نوع غير معروف يُتجاهل، ولا حدث صالحًا أو دفعة كبيرة أو جسم كبير يُرفض', async () => {
  const f = fake();
  try {
    assertEquals((await post({ action: 'client.event', events: [ev({ kind: 'nope' })] })).status, 400);
    assertEquals((await post({ action: 'client.event', events: [] })).status, 400);
    assertEquals((await post({ action: 'client.event', events: Array.from({ length: CE.CLIENT_EVENT_LIMITS.batch + 1 }, () => ev()) })).status, 400);
    const big = await post({ action: 'client.event', events: [ev({ kind: 'error', message: 'x'.repeat(9_000) })] });
    assertEquals(big.status, 413);
    assertEquals((await big.json()).code, 'too_large');
    assertEquals(f.tables.client_events.length, 0);
    // وقت جهاز بعيد يُستبدل بوقت الخادم، والمحاولات بين 1 و50
    const r = await post({ action: 'client.event', events: [ev({ at: '1999-01-01T00:00:00Z', tries: 999 })] });
    assertEquals(r.status, 200);
    const row = f.tables.client_events[0];
    assert(Date.parse(row.at) > Date.now() - 60_000);
    assertEquals(row.tries, 50);
  } finally { f.restore(); }
});

Deno.test('حد المعدل لكل شبكة ببصمتها، والشبكة الأخرى لا تتأثر', async () => {
  const f = fake();
  try {
    const batch = Array.from({ length: 20 }, () => ev());
    for (let i = 0; i < CE.CLIENT_EVENT_LIMITS.perIp10Min / 20; i += 1) assertEquals((await post({ action: 'client.event', events: batch })).status, 200);
    const over = await post({ action: 'client.event', events: [ev()] });
    assertEquals(over.status, 429);
    assertEquals((await over.json()).code, 'rate');
    assertEquals((await post({ action: 'client.event', events: [ev()] }, { ip: '198.51.100.9' })).status, 200);
    assertEquals(f.tables.client_events.length, CE.CLIENT_EVENT_LIMITS.perIp10Min + 1);
  } finally { f.restore(); }
});

Deno.test('قبل الترحيل: not_migrated بلا خطأ داخلي ولا تنبيه', async () => {
  const f = fake({ audit_log: [] }, true);
  try {
    const r = await post({ action: 'client.event', events: [ev()] });
    assertEquals(r.status, 503);
    assertEquals((await r.json()).code, 'not_migrated');
    assertEquals(f.tables.audit_log.length, 0);
    // التنظيف الأسبوعي يكمل ويسجّل الخطأ
    const out: any = await S.purge();
    assert(String(out.client_events).startsWith('error'));
  } finally { f.restore(); }
});

Deno.test('تنبيه بالمعدل: أكثر من 10 أجهزة أخفق فتحها في 5 دقائق، لا جهاز واحد يكرر', async () => {
  const f = fake();
  try {
    for (let i = 0; i < 30; i += 1) await post({ action: 'client.event', events: [ev({ tries: 1 + (i % 3) })] });
    assertEquals(await CE.bootAlert(), false);
    assertEquals(f.tables.audit_log.filter((a) => a.action === 'system.alert').length, 0);
    for (let i = 0; i < CE.CLIENT_ALERT.bootDevices + 1; i += 1) await post({ action: 'client.event', events: [ev()] }, { ip: `198.51.100.${i + 10}` });
    const alerts = f.tables.audit_log.filter((a) => a.action === 'system.alert');
    assertEquals(alerts.length, 1);
    assertEquals(alerts[0].entity_id, 'client_boot_failures');
  } finally { f.restore(); }
});

Deno.test('تنبيه الفتح لا يعدّ offline (الجهاز نفسه بلا شبكة) ولا طابورًا قديمًا أُرسل بعد العودة، ومهلته ساعة', async () => {
  const f = fake();
  try {
    for (let i = 0; i < CE.CLIENT_ALERT.bootDevices + 1; i += 1) await post({ action: 'client.event', events: [ev({ kind: 'offline' })] }, { ip: `198.51.100.${i + 40}` });
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    for (let i = 0; i < CE.CLIENT_ALERT.bootDevices + 1; i += 1) await post({ action: 'client.event', events: [ev({ at: old })] }, { ip: `198.51.100.${i + 80}` });
    assertEquals(f.tables.client_events.length, 2 * (CE.CLIENT_ALERT.bootDevices + 1));
    assertEquals(await CE.bootAlert(), false);
    assertEquals(f.tables.audit_log.filter((a) => a.action === 'system.alert').length, 0);
    const core = await import('./core.ts');
    assertEquals(core.alertCooldown('client_boot_failures'), 36e5);
  } finally { f.restore(); }
});

Deno.test('حد المعدل بعد الكتابة: طلبات متزامنة من شبكة واحدة قرأت العدّ نفسه لا تتجاوز الحد', async () => {
  const f = fake();
  try {
    const batch = Array.from({ length: 20 }, () => ev({ act: 'x' }));
    const rs = await Promise.all(Array.from({ length: 20 }, () => post({ action: 'client.event', events: batch })));
    const ok = rs.filter((r) => r.status === 200).length;
    assert(rs.every((r) => r.status === 200 || r.status === 429));
    assert(f.tables.client_events.length <= CE.CLIENT_EVENT_LIMITS.perIp10Min, String(f.tables.client_events.length));
    assertEquals(f.tables.client_events.length, ok * 20);
  } finally { f.restore(); }
});

Deno.test('التنظيف يحذف ما مضى عليه 30 يومًا', async () => {
  const old = new Date(Date.now() - 31 * 864e5).toISOString();
  const f = fake({ client_events: [{ id: 1, kind: 'busy', act: 'me', at: old, created_at: old }, { id: 2, kind: 'busy', act: 'me', at: old, created_at: new Date().toISOString() }], audit_log: [] });
  try {
    const out: any = await S.purge();
    assertEquals(out.client_events, 1);
    assertEquals(f.tables.client_events.map((r) => r.id), [2]);
  } finally { f.restore(); }
});

Deno.test('x-client-build: مقبولة في CORS ومعلنة في كل رد، ومعرّف غير صالح لا يُسجَّل', async () => {
  const f = fake();
  try {
    const pre = await handler(new Request('https://x.test/leaders-api', { method: 'OPTIONS', headers: { origin: 'https://leaders.test' } }));
    assert(pre.headers.get('access-control-allow-headers')!.includes('x-client-build'));
    assert(pre.headers.get('access-control-expose-headers')!.includes('x-client-build'));
    const r = await post({ action: 'client.event', events: [{ kind: 'busy', act: 'me', at: new Date().toISOString() }] }, { build: 'bad/build?x' });
    assertEquals(r.headers.get('x-client-build'), 'on');
    assertEquals(f.tables.client_events[0].build, null);
    const unknown = await post({ action: 'no.such' });
    assertEquals(unknown.headers.get('x-client-build'), 'on');
  } finally { f.restore(); }
});
