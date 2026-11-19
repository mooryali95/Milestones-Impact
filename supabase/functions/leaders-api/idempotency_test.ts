// مفتاح منع التكرار (idempotency.ts، ش9): الإعادة بالمفتاح نفسه تعيد النتيجة الأولى ولا تنفذ الفعل ثانية، والمفتاح نفسه
// بجسم آخر يُرفض، والتنفيذ الجاري يُنتظر، وخطأ الخادم يحرر المفتاح، والرفض يُحفظ، ولا سر في الجدول، وقبل الترحيل يُتجاهل.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const { Fail } = await import('./core.ts');
const IK = await import('./idempotency.ts');

type Row = Record<string, any>;
const req = () => new Request('https://x.test/leaders-api', { method: 'POST', headers: { origin: 'https://leaders.test' } });
const KEY = 'k-1234567890abcdef';
// القيد الفريد (actor, key) كما في الترحيل: الإدراج المكرر يرد 23505
function fake(tables: Record<string, Row[]> = { idempotency_keys: [] }, missing = false) {
  IK.resetIdemState();
  return installFake(tables, {
    fail: (t, op) => {
      if (t !== 'idempotency_keys') return null;
      if (missing) return { code: 'PGRST205', message: 'relation leaders.idempotency_keys not found' };
      if (op.kind === 'insert' && (tables.idempotency_keys || []).some((r) => r.actor === op.value.actor && r.key === op.value.key)) return { code: '23505', message: 'duplicate key' };
      return null;
    },
  });
}
const actor = () => IK.actorHash('participant', 'p1');

Deno.test('الإعادة بالمفتاح نفسه تعيد النتيجة الأولى ولا تنفذ الفعل ثانية', async () => {
  const f = fake();
  try {
    let runs = 0;
    const run = () => { runs += 1; return Promise.resolve({ success: true, saved: runs }); };
    const b = { action: 'models.save', token: 't', fields: { a: 1 } };
    const r1 = await IK.withIdempotency(req(), 'models.save', b, KEY, await actor(), run);
    assertEquals(r1.headers.get('x-idem'), 'stored');
    assertEquals(await r1.json(), { success: true, saved: 1 });
    const r2 = await IK.withIdempotency(req(), 'models.save', b, KEY, await actor(), run);
    assertEquals(r2.headers.get('x-idem'), 'replayed');
    assertEquals(await r2.json(), { success: true, saved: 1 });
    assertEquals(runs, 1);
    // الصف: بصمات لا هوية، ولا توكن في الجدول
    const row = f.tables.idempotency_keys[0];
    assertEquals(row.actor.length, 64);
    assertEquals(row.req_hash.length, 64);
    assert(!JSON.stringify(row).includes('"t"'));
    assert(!JSON.stringify(row).includes('p1'));
    // فاعل آخر بالمفتاح نفسه: تنفيذ مستقل
    const r3 = await IK.withIdempotency(req(), 'models.save', b, KEY, await IK.actorHash('participant', 'p2'), run);
    assertEquals((await r3.json()).saved, 2);
  } finally { f.restore(); }
});

Deno.test('المفتاح نفسه بجسم آخر يُرفض ولا يعيد نتيجة غيره', async () => {
  const f = fake();
  try {
    const a = await actor();
    await IK.withIdempotency(req(), 'models.save', { fields: { a: 1 } }, KEY, a, () => Promise.resolve({ success: true }));
    await assertRejects(() => IK.withIdempotency(req(), 'models.save', { fields: { a: 2 } }, KEY, a, () => Promise.resolve({ success: true })), Fail, 'مفتاح الطلب');
  } finally { f.restore(); }
});

Deno.test('التنفيذ الجاري يرد 409 pending، والجاري منذ أطول من حد الدالة يُستعاد', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  const f = fake(tables);
  try {
    const a = await actor();
    const hash = await IK.requestHash('lab.answer', { x: 1 });
    tables.idempotency_keys.push({ actor: a, key: KEY, action: 'lab.answer', req_hash: hash, status: null, response: null, created_at: new Date().toISOString() });
    let runs = 0;
    const run = () => { runs += 1; return Promise.resolve({ success: true }); };
    const r = await IK.withIdempotency(req(), 'lab.answer', { x: 1 }, KEY, a, run);
    assertEquals(r.status, 409);
    assertEquals(r.headers.get('x-idem'), 'pending');
    assertEquals((await r.json()).code, 'busy');
    assertEquals(runs, 0);
    tables.idempotency_keys[0].created_at = new Date(Date.now() - IK.IDEM_STALE_MS - 1000).toISOString();
    const r2 = await IK.withIdempotency(req(), 'lab.answer', { x: 1 }, KEY, a, run);
    assertEquals(r2.status, 200);
    assertEquals(runs, 1);
    assertEquals(tables.idempotency_keys[0].status, 200);
  } finally { f.restore(); }
});

Deno.test('الرفض (4xx) يُحفظ ويُعاد كما هو، وخطأ الخادم يحرر المفتاح فتُنفذ الإعادة', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  const f = fake(tables);
  try {
    const a = await actor();
    await assertRejects(() => IK.withIdempotency(req(), 'capstone.submit', {}, KEY, a, () => Promise.reject(new Fail('أكمل الفصول أولًا', 400, 'incomplete'))), Fail);
    const again = await IK.withIdempotency(req(), 'capstone.submit', {}, KEY, a, () => Promise.resolve({ success: true }));
    assertEquals(again.status, 400);
    assertEquals(again.headers.get('x-idem'), 'replayed');
    assertEquals((await again.json()).code, 'incomplete');
    const K2 = 'k2-1234567890abcdef';
    await assertRejects(() => IK.withIdempotency(req(), 'capstone.submit', {}, K2, a, () => Promise.reject(new Error('db down'))));
    assertEquals(tables.idempotency_keys.filter((r) => r.key === K2).length, 0);
    await assertRejects(() => IK.withIdempotency(req(), 'capstone.submit', {}, K2, a, () => Promise.reject(new Fail('مشغول', 503, 'busy'))), Fail);
    assertEquals(tables.idempotency_keys.filter((r) => r.key === K2).length, 0);
    const ok = await IK.withIdempotency(req(), 'capstone.submit', {}, K2, a, () => Promise.resolve({ success: true, done: 1 }));
    assertEquals((await ok.json()).done, 1);
  } finally { f.restore(); }
});

Deno.test('لا سر ولا رد كبير في الجدول: يُحفظ المختصر', () => {
  assertEquals(IK.storable({ success: true, token: 'abc', participant: {} }), { success: true, replayed: true });
  assertEquals(IK.storable({ success: true, url: 'https://x/verify?e=a&t=secret' }).replayed, true);
  assertEquals(IK.storable({ success: true, path: 'a/b' }), { success: true, path: 'a/b' });
  const big = IK.storable({ success: true, code: 'ok', message: 'تم', blob: 'x'.repeat(IK.IDEM_MAX_RESPONSE) });
  assertEquals(big, { success: true, code: 'ok', message: 'تم', replayed: true });
});

Deno.test('قبل الترحيل: المفتاح يُتجاهل والفعل ينفذ كما كان، ولا إعلان x-idem', async () => {
  const f = fake({}, true);
  try {
    let runs = 0;
    const run = () => { runs += 1; return Promise.resolve({ success: true }); };
    const r = await IK.withIdempotency(req(), 'models.save', {}, KEY, await actor(), run);
    await IK.withIdempotency(req(), 'models.save', {}, KEY, await actor(), run);
    assertEquals(runs, 2);
    assertEquals(r.headers.get('x-idem'), null);
    assertEquals(IK.advertise(new Response('{}')).headers.get('x-idem'), null);
  } finally { f.restore(); }
});

Deno.test('بعد الترحيل: كل رد يعلن x-idem: on، والمفتاح يُؤخذ من الجسم للكتابة وحدها', async () => {
  const f = fake();
  try {
    assertEquals(await IK.idemReady(), true);
    assertEquals(IK.advertise(new Response('{}')).headers.get('x-idem'), 'on');
    const b: Row = { action: 'models.save', idem: KEY, x: 1 };
    assertEquals(IK.takeKey('models.save', b), KEY);
    assertEquals('idem' in b, false);
    assertEquals(IK.takeKey('me', { idem: KEY }), null);
    assertEquals(IK.takeKey('auth.verify', { idem: KEY }), null);
    assertEquals(IK.takeKey('models.save', { idem: 'short' }), null);
    // بلا مفتاح: تنفيذ عادي بلا صف
    let runs = 0;
    await IK.withIdempotency(req(), 'models.save', {}, null, await actor(), () => { runs += 1; return Promise.resolve({ success: true }); });
    assertEquals(runs, 1);
    assertEquals(f.tables.idempotency_keys.length, 0);
  } finally { f.restore(); }
});

Deno.test('التنظيف يحذف المفاتيح بعد 24 ساعة', async () => {
  const S = await import('./system.ts');
  const old = new Date(Date.now() - 25 * 36e5).toISOString();
  const tables: Record<string, Row[]> = { idempotency_keys: [{ id: 'a', actor: 'x'.repeat(64), key: KEY, created_at: old }, { id: 'b', actor: 'x'.repeat(64), key: 'k-new-123456789012', created_at: new Date().toISOString() }] };
  const f = installFake(tables);
  try {
    const out = await S.purge();
    assertEquals(out.idempotency_keys, 1);
    assertEquals(tables.idempotency_keys.map((r) => r.id), ['b']);
  } finally { f.restore(); }
});

Deno.test('رفض 409 و429 يُقصد أن يُعاد بعد تصحيح: لا يُحفظ، والإعادة بالمفتاح نفسه تنفذ الفعل', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  const f = fake(tables);
  try {
    const a = await actor();
    for (const [status, code] of [[409, 'seats_over'], [429, 'rate']] as const) {
      const K = `k-${code}-1234567890abcdef`;
      await assertRejects(() => IK.withIdempotency(req(), 'admin.sponsor-decide', { id: 'r1' }, K, a, () => Promise.reject(new Fail('المقاعد لا تكفي', status, code))), Fail);
      assertEquals(tables.idempotency_keys.filter((r) => r.key === K).length, 0);
      const ok = await IK.withIdempotency(req(), 'admin.sponsor-decide', { id: 'r1' }, K, a, () => Promise.resolve({ success: true, approved: 1 }));
      assertEquals(ok.headers.get('x-idem'), 'stored');
      assertEquals((await ok.json()).approved, 1);
    }
  } finally { f.restore(); }
});

Deno.test('الحماية لا تُؤكد (فحص الجدول أو حجز المفتاح يتعذّر لسبب غير غيابه): لا تنفيذ، 503 busy وx-idem: off', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  // الفحص يتعذّر بعطل عابر
  IK.resetIdemState();
  let f = installFake(tables, { fail: (t) => (t === 'idempotency_keys' ? { code: '57014', message: 'canceling statement due to statement timeout' } : null) });
  try {
    let runs = 0;
    const run = () => { runs += 1; return Promise.resolve({ success: true }); };
    const r = await IK.withIdempotency(req(), 'models.save', {}, KEY, await actor(), run);
    assertEquals(r.status, 503);
    assertEquals(r.headers.get('x-idem'), 'off');
    const body = await r.json();
    assertEquals(body.success, false);
    assertEquals(body.code, 'busy');
    assertEquals(runs, 0);
  } finally { f.restore(); }
  // الفحص سليم والحجز يتعذّر
  IK.resetIdemState();
  f = installFake(tables, { fail: (t, op) => (t === 'idempotency_keys' && op.kind === 'insert' ? { code: '53300', message: 'too many connections' } : null) });
  try {
    let runs = 0;
    const r = await IK.withIdempotency(req(), 'models.save', {}, KEY, await actor(), () => { runs += 1; return Promise.resolve({ success: true }); });
    assertEquals(r.status, 503);
    assertEquals(r.headers.get('x-idem'), 'off');
    assertEquals(runs, 0);
  } finally { f.restore(); }
});

Deno.test('صف أقدم من 24 ساعة لم يحذفه التنظيف بعد: يُعامل غائبًا، فلا يُعاد رده القديم ولا يُرفض بجسم آخر', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  const f = fake(tables);
  try {
    const a = await actor();
    const old = new Date(Date.now() - (IK.IDEM_TTL_HOURS * 36e5 + 60_000)).toISOString();
    tables.idempotency_keys.push({ actor: a, key: KEY, action: 'models.save', req_hash: await IK.requestHash('models.save', { x: 1 }), status: 200, response: { success: true, saved: 'old' }, created_at: old });
    let runs = 0;
    const r = await IK.withIdempotency(req(), 'models.save', { x: 2 }, KEY, a, () => { runs += 1; return Promise.resolve({ success: true, saved: 'new' }); });
    assertEquals(r.headers.get('x-idem'), 'stored');
    assertEquals((await r.json()).saved, 'new');
    assertEquals(runs, 1);
    assertEquals(tables.idempotency_keys.length, 1);
    assertEquals(tables.idempotency_keys[0].response.saved, 'new');
    assert(Date.parse(tables.idempotency_keys[0].created_at) > Date.parse(old));
  } finally { f.restore(); }
});

Deno.test('تنفيذ قرار الحذف يمحو صفوف المشارك: forgetActor يحذف صفوف فاعله وحده', async () => {
  const tables = { idempotency_keys: [] as Row[] };
  const f = fake(tables);
  try {
    const mine = await IK.actorHash('participant', 'p1');
    const other = await IK.actorHash('participant', 'p2');
    tables.idempotency_keys.push({ actor: mine, key: KEY, status: 200, response: { success: true } }, { actor: other, key: KEY, status: 200, response: { success: true } });
    await IK.forgetActor('participant', 'p1');
    assertEquals(tables.idempotency_keys.map((r) => r.actor), [other]);
  } finally { f.restore(); }
});
