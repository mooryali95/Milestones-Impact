// عميل أقدم من الحد الأدنى (تصور تحديث المنصة، المرحلة 5 البند 7): على الموجّه الحقيقي (index.ts). مستوى معروف أقل من
// MIN_CLIENT_LEVEL يرد update_required برمز 426 وبترويسات CORS، والعميل بلا مستوى يُخدم كما كان، والرصد من جهة العميل معفى.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { installFake } from './_fake_db.ts';
import { CLIENT_LEVEL, MIN_CLIENT_LEVEL, clientLevelOf, needsUpdate } from '../_shared/client-compat.js';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
await import('./index.ts');

const post = (body: unknown, query = '') => handler(new Request(`https://x.test/leaders-api?forceFunctionRegion=ap-south-1${query}`, {
  method: 'POST',
  headers: { origin: 'https://leaders.test', 'content-type': 'application/json' },
  body: JSON.stringify(body),
}));

Deno.test('المستوى من الرابط: عدد صحيح صغير وحده', () => {
  assertEquals(clientLevelOf('https://x.test/f?cl=3'), 3);
  assertEquals(clientLevelOf('https://x.test/f?a=1&cl=0'), 0);
  for (const bad of ['https://x.test/f', 'https://x.test/f?cl=', 'https://x.test/f?cl=-1', 'https://x.test/f?cl=1.5', 'https://x.test/f?cl=99999', 'https://x.test/f?cl=abc', 'not a url']) {
    assertEquals(clientLevelOf(bad), null, bad);
  }
  assert(MIN_CLIENT_LEVEL <= CLIENT_LEVEL, 'الحد الأدنى لا يتجاوز مستوى الواجهة المبنية من الإيداع نفسه');
  assertEquals(needsUpdate(null, 'me'), false);
  assertEquals(needsUpdate(1, 'me', 2), true);
  assertEquals(needsUpdate(2, 'me', 2), false);
  assertEquals(needsUpdate(1, 'client.event', 2), false);
});

Deno.test('مستوى أقل من الحد الأدنى: update_required برمز 426 وترويسات CORS، قبل أي قراءة أو جلسة', async () => {
  const f = installFake({ audit_log: [] });
  try {
    const r = await post({ action: 'me', token: 'tok-0000000000000000000000000000' }, '&cl=0');
    assertEquals(r.status, 426);
    const j = await r.json();
    assertEquals(j.success, false);
    assertEquals(j.code, 'update_required');
    assert(/تحديث/.test(j.message));
    assert(r.headers.get('access-control-allow-origin'), 'الرد مقروء في المتصفح');
    // فعل غير معروف من عميل قديم: الرد نفسه (الدعوة إلى التحديث) لا «إجراء غير معروف»
    const u = await post({ action: 'gone.action' }, '&cl=0');
    assertEquals((await u.json()).code, 'update_required');
  } finally { f.restore(); }
});

Deno.test('بلا مستوى أو بمستوى الواجهة الحالية: يُخدم كما كان، وفعل غير معروف يبقى unknown_action', async () => {
  const f = installFake({ audit_log: [] });
  try {
    const plain = await post({ action: 'system.nope' });
    assertEquals((await plain.json()).code, 'unknown_action');
    const cur = await post({ action: 'system.nope' }, `&cl=${CLIENT_LEVEL}`);
    assertEquals((await cur.json()).code, 'unknown_action');
  } finally { f.restore(); }
});

Deno.test('الرصد من جهة العميل يُقبل من العميل القديم أيضًا', async () => {
  const f = installFake({ client_events: [], audit_log: [] });
  try {
    const r = await post({ action: 'client.event', events: [{ kind: 'TypeError', act: 'me', tries: 1, build: 'B1abc', at: new Date().toISOString() }] }, '&cl=0');
    const j = await r.json();
    assert(j.code !== 'update_required', JSON.stringify(j));
  } finally { f.restore(); }
});
