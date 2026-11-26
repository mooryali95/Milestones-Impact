// مركز رسائل المشارك (ترحيل 20261128200000): بريد الفئة القابلة للكتم يُسجَّل ويحمل ترويستي الإلغاء بنقرة، والمكتوم
// لا يُرسل ويبقى في المركز، والضروري يمر بلا ترويسة ولا تسجيل، والإلغاء بنقرة يكتم الفئة الموقَّعة وحدها.
// قاعدة في الذاكرة وشبكة محاكاة (_fake_db.ts)، ولا يخرج طلب حقيقي.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
import { unsubToken } from './mail-prefs.js';
const { CONFIG, sendMail, unsubscribeRequest } = await import('./core.ts');
const MS = await import('./messages.ts');

type Row = Record<string, any>;
const PID = '0b6f2a52-6a3e-4c1e-9d55-1f1e2a3b4c5d';
const base = (): Record<string, Row[]> => ({ participants: [{ id: PID, email: 'sara@x.sa', is_demo: false }], participant_mail_prefs: [], participant_notifications: [], mail_events: [], mail_queue: [], audit_log: [] });
function withMail<T>(fn: () => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 80, alertEmail: '' });
  return fn().finally(() => Object.assign(CONFIG, saved));
}
const HTML = '<html><body><p>x</p></body></html>';

Deno.test('فئة قابلة للكتم: تُرسل بترويستي RFC 8058 ورابط التفضيلات، وتُسجَّل في المركز', async () => {
  const t = base();
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('sara@x.sa', 'جلستك غدًا', HTML, [], { category: 'sessions' });
      const [c] = resendCalls(calls);
      assertEquals(c.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
      assert(/^<https?:\/\/[^>]+\/functions\/v1\/leaders-api\?unsubscribe=[^>]+>, <mailto:/.test(c.body.headers['List-Unsubscribe']));
      assert(c.body.html.includes('tab=messages&prefs=sessions'));
      assertEquals(t.participant_notifications.map((n) => [n.category, n.title, n.emailed]), [['sessions', 'جلستك غدًا', true]]);
    }));
  } finally { w.restore(); }
});

Deno.test('الفئة المكتومة: لا بريد، ويبقى الإشعار في المركز بعلامة أنه لم يُرسل', async () => {
  const t = base();
  t.participant_mail_prefs.push({ participant_id: PID, muted: ['reminders'] });
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('sara@x.sa', 'خطوتك التالية', HTML, [], { kind: 'bulk', category: 'reminders' });
      assertEquals(resendCalls(calls).length, 0);
      assertEquals(t.participant_notifications.map((n) => [n.category, n.emailed]), [['reminders', false]]);
    }));
  } finally { w.restore(); }
});

Deno.test('الضروري وبريد الفريق والرمز: بلا ترويسة ولا تسجيل، ولو كتم المشارك كل شيء', async () => {
  const t = base();
  t.participant_mail_prefs.push({ participant_id: PID, muted: ['journey', 'sessions', 'experts', 'reminders', 'essential'] });
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('sara@x.sa', 'وصلنا دفعك', HTML, [], { category: 'essential' });
      await sendMail('sara@x.sa', 'رمز', HTML, [], { kind: 'code' });
      await sendMail('xp@x.sa', 'طلب خدمة', HTML, [], { category: 'expert_work' });
      const r = resendCalls(calls);
      assertEquals(r.length, 3);
      for (const c of r) assertEquals(c.body.headers, undefined);
      assertEquals(t.participant_notifications.length, 0);
    }));
  } finally { w.restore(); }
});

Deno.test('الإلغاء بنقرة: POST برمز صحيح يكتم فئته، وGET يحوّل إلى التفضيلات بلا كتابة، والرمز المزوّر يُرفض', async () => {
  const t = base();
  const w = installFake(t);
  try {
    const tok = await unsubToken(CONFIG.pepper, PID, 'journey');
    const url = `https://api.example.test/functions/v1/leaders-api?unsubscribe=${encodeURIComponent(tok)}`;
    const g = await unsubscribeRequest(new Request(url), tok);
    assertEquals(g.status, 303);
    assert(String(g.headers.get('Location')).includes('tab=messages&prefs=journey'));
    assertEquals(t.participant_mail_prefs.length, 0);
    const bad = await unsubscribeRequest(new Request(url, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), tok.slice(0, -3) + 'abc');
    assertEquals(bad.status, 400);
    const ok = await unsubscribeRequest(new Request(url, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), tok);
    assertEquals(ok.status, 200);
    assertEquals(t.participant_mail_prefs.at(-1)?.muted, ['journey']);
  } finally { w.restore(); }
});

Deno.test('مركز الرسائل: القائمة وعدد غير المقروء، والتعليم مقروءًا، والضروري لا يُكتم', async () => {
  const t = base();
  t.participant_notifications.push(
    { id: 'n1', participant_id: PID, category: 'journey', title: 'أ', read_at: null, created_at: '2026-11-20T10:00:00Z' },
    { id: 'n2', participant_id: PID, category: 'sessions', title: 'ب', read_at: null, created_at: '2026-11-21T10:00:00Z' },
    { id: 'n3', participant_id: 'other', category: 'journey', title: 'ج', read_at: null, created_at: '2026-11-21T10:00:00Z' },
  );
  const w = installFake(t);
  try {
    const p = { id: PID };
    const l: any = await MS.list(p);
    assertEquals([l.items.map((i: Row) => i.id), l.unread], [['n2', 'n1'], 2]);
    assert(l.categories.find((c: Row) => c.key === 'essential').locked);
    assertEquals(l.categories.some((c: Row) => c.key === 'expert_work' || c.key === 'expert_digest' || c.key === 'ops'), false);
    await MS.markRead(p, { ids: ['n1'] });
    assertEquals(await MS.unreadCount(p), 1);
    await MS.markRead(p, { all: true });
    assertEquals(await MS.unreadCount(p), 0);
    assertEquals(t.participant_notifications.find((n) => n.id === 'n3')?.read_at, null);
    const s: any = await MS.savePrefs(p, { muted: ['essential', 'experts'] });
    assertEquals(s.muted, ['experts']);
  } finally { w.restore(); }
});

// ── بريد الخبراء والمنسقين (ترحيل 20261129130000، المرحلة 1ب) ──
const XID = '5a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const CID = '7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a';

Deno.test('ملخص الخبير القابل للكتم: يُرسل بالرمز رباعي الأجزاء ورابط /x، ويُسجَّل في صندوقه بالمشارك الذي يذكره', async () => {
  const t = base();
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('xp@x.sa', 'تقرير 360 جاهز', HTML, [], { category: 'expert_digest', recipient: { kind: 'expert', id: XID }, about: PID });
      const [c] = resendCalls(calls);
      const tok = decodeURIComponent(String(c.body.headers['List-Unsubscribe']).match(/unsubscribe=([^>]+)>/)?.[1] || '');
      assertEquals(tok.split('.').slice(0, 3), ['e', XID, 'expert_digest']);
      assert(c.body.html.includes('/x?tab=messages&prefs=expert_digest'));
      assertEquals(t.participant_notifications.map((n) => [n.expert_id, n.participant_id, n.about_participant_id, n.emailed]), [[XID, undefined, PID, true]]);
    }));
  } finally { w.restore(); }
});

Deno.test('ملخص المنسق المكتوم لا يُرسل ويبقى في صندوقه، وعمل الخبير المقفل يمر بلا ترويسة ويُسجَّل، وبلا recipient كما كان', async () => {
  const t = base();
  t.participant_mail_prefs.push({ coordinator_id: CID, muted: ['coord_digest'] });
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('org@x.sa', 'ملخص الجهة', HTML, [], { kind: 'bulk', category: 'coord_digest', recipient: { kind: 'coordinator', id: CID } });
      await sendMail('xp@x.sa', 'طلب توجيه', HTML, [], { category: 'expert_work', recipient: { kind: 'expert', id: XID } });
      await sendMail('xp@x.sa', 'ملخص النماذج', HTML, [], { category: 'expert_digest' });
      // recipient من جمهور آخر لا يُقبل: يمر كما كان
      await sendMail('xp@x.sa', 'ملخص النماذج', HTML, [], { category: 'expert_digest', recipient: { kind: 'coordinator', id: CID } });
      const r = resendCalls(calls);
      assertEquals(r.length, 3);
      for (const c of r) assertEquals(c.body.headers, undefined);
      // عمل الخبير المقفل يُسجَّل في صندوقه بلا ترويسة (المرحلة 2ب)، والمنسق بلا صندوق لتشغيليّه
      assertEquals(t.participant_notifications.map((n) => [n.coordinator_id ?? n.expert_id, n.category, n.emailed]), [[CID, 'coord_digest', false], [XID, 'expert_work', true]]);
    }));
  } finally { w.restore(); }
});

Deno.test('الإلغاء بنقرة للخبير: الرمز رباعي الأجزاء يكتم فئته في صفه، وGET يحوّل إلى /x، ورمز المشارك القديم يبقى صالحًا', async () => {
  const t = base();
  const w = installFake(t);
  try {
    const tok = await unsubToken(CONFIG.pepper, XID, 'expert_digest', 'expert');
    const url = `https://api.example.test/functions/v1/leaders-api?unsubscribe=${encodeURIComponent(tok)}`;
    const g = await unsubscribeRequest(new Request(url), tok);
    assert(String(g.headers.get('Location')).includes('/x?tab=messages&prefs=expert_digest'));
    const ok = await unsubscribeRequest(new Request(url, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), tok);
    assertEquals(ok.status, 200);
    assertEquals([t.participant_mail_prefs.at(-1)?.expert_id, t.participant_mail_prefs.at(-1)?.participant_id, t.participant_mail_prefs.at(-1)?.muted], [XID, undefined, ['expert_digest']]);
    // رمز خبير لفئة مقفلة أو لفئة المشارك يُرفض
    const locked = `e.${XID}.expert_work.${tok.split('.')[3]}`;
    assertEquals((await unsubscribeRequest(new Request(url, { method: 'POST' }), locked)).status, 400);
    const old = await unsubToken(CONFIG.pepper, PID, 'journey');
    assertEquals(old.split('.').length, 3);
    assertEquals((await unsubscribeRequest(new Request(url, { method: 'POST' }), old)).status, 200);
    assertEquals(t.participant_mail_prefs.at(-1)?.participant_id, PID);
  } finally { w.restore(); }
});

Deno.test('مركز الخبير وتفضيلات المنسق (المرحلة 1ج): كلٌّ بعموده، والمقفل لا يُكتم، ولا يرى أحد صندوق غيره', async () => {
  const t = base();
  const OTHER = '9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0';
  t.participant_notifications.push(
    { id: 'x1', expert_id: XID, category: 'expert_digest', title: 'ملخص', read_at: null, created_at: '2026-11-20T10:00:00Z' },
    { id: 'x2', expert_id: OTHER, category: 'expert_digest', title: 'لغيره', read_at: null, created_at: '2026-11-21T10:00:00Z' },
    { id: 'p1', participant_id: PID, category: 'journey', title: 'للمشارك', read_at: null, created_at: '2026-11-21T10:00:00Z' },
  );
  const w = installFake(t);
  try {
    const me = MS.expertOwner({ id: XID });
    const l: any = await MS.list(me);
    assertEquals([l.items.map((i: Row) => i.id), l.unread], [['x1'], 1]);
    assertEquals(l.categories.map((c: Row) => [c.key, c.locked]), [['expert_work', true], ['expert_digest', false]]);
    await MS.markRead(me, { all: true });
    assertEquals(t.participant_notifications.filter((n) => n.read_at).map((n) => n.id), ['x1']);
    const s: any = await MS.savePrefs(me, { muted: ['expert_work', 'expert_digest', 'journey'] });
    assertEquals(s.muted, ['expert_digest']);
    assertEquals(t.participant_mail_prefs.at(-1)?.expert_id, XID);
    const c = MS.coordinatorOwner({ id: CID });
    const r: any = await MS.prefs(c);
    assertEquals([r.items, r.muted, r.categories.map((x: Row) => x.key)], [[], [], ['coord_work', 'coord_digest']]);
    const saved: any = await MS.prefs(c, { muted: ['coord_digest', 'coord_work'] });
    assertEquals(saved.muted, ['coord_digest']);
    assertEquals(t.participant_mail_prefs.at(-1)?.coordinator_id, CID);
  } finally { w.restore(); }
});

Deno.test('notify بلا بريد (المرحلة 2أ): يكتب الإشعار في الصندوق ولا يرسل، للمشارك والخبير', async () => {
  const t = base();
  const w = installFake(t);
  try {
    const { notify } = await import('./core.ts');
    await withMail(() => withNet(async (calls) => {
      const a = await notify({ subject: 'مسار ينتظر اعتمادك', html: HTML, category: 'expert_work', recipient: { kind: 'expert', id: XID }, about: PID, mail: false, actionUntil: '2026-12-01T00:00:00Z', ref: `track:${PID}` });
      const b = await notify({ to: 'sara@x.sa', subject: 'خطوتك', html: HTML, category: 'journey', mail: false });
      assertEquals([a.send, b.send], [false, false]);
      assertEquals(resendCalls(calls).length, 0);
      assertEquals(t.participant_notifications.map((n) => [n.expert_id ?? n.participant_id, n.emailed, n.action_until ?? null]),
        [[XID, false, '2026-12-01T00:00:00Z'], [PID, false, null]]);
    }));
  } finally { w.restore(); }
});

Deno.test('صندوق الخبير (المرحلة 2ب): عمله المقفل يصله بالبريد دائمًا ولو كتم، ويُسجَّل بمرجع الإشعار والمشارك الذي يذكره', async () => {
  const t = base();
  t.participant_mail_prefs.push({ expert_id: XID, muted: ['expert_work', 'expert_digest'] });
  const w = installFake(t);
  try {
    await withMail(() => withNet(async (calls) => {
      await sendMail('xp@x.sa', 'طلب توجيه من سارة', HTML, [], { category: 'expert_work', ref: `participant:${PID}`, noteRef: 'peer:r1', recipient: { kind: 'expert', id: XID }, about: PID });
      const r = resendCalls(calls);
      assertEquals(r.length, 1);
      assertEquals(r[0].body.headers, undefined);
      assertEquals(t.participant_notifications.map((n) => [n.expert_id, n.ref, n.about_participant_id, n.emailed]), [[XID, 'peer:r1', PID, true]]);
      // مرجع البريد يبقى للعدّ ومحو طابور المحذوف
      assertEquals(t.mail_events.at(-1)?.ref, `participant:${PID}`);
    }));
  } finally { w.restore(); }
});

Deno.test('«ينتظرك» (المرحلة 2ج): العنصر يحمل مهلته، ويُغلق بمرجعه في صندوق صاحبه وحده، والقائمة تعيد العمودين', async () => {
  const t = base();
  const OTHER = '9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0';
  const w = installFake(t);
  try {
    const { resolveNotes } = await import('./core.ts');
    await withMail(() => withNet(async () => {
      await sendMail('xp@x.sa', 'طلب توجيه', HTML, [], { category: 'expert_work', noteRef: 'peer:r1', actionUntil: '2026-12-01T00:00:00Z', recipient: { kind: 'expert', id: XID }, about: PID });
      await sendMail('o@x.sa', 'طلب توجيه', HTML, [], { category: 'expert_work', noteRef: 'peer:r1', actionUntil: '2026-12-01T00:00:00Z', recipient: { kind: 'expert', id: OTHER } });
    }));
    await resolveNotes('peer:r1', { kind: 'expert', id: XID });
    assertEquals(t.participant_notifications.map((n) => [n.expert_id, !!n.resolved_at]), [[XID, true], [OTHER, false]]);
    await resolveNotes('peer:r1');
    assert(t.participant_notifications.every((n) => n.resolved_at));
    const l: any = await MS.list(MS.expertOwner({ id: XID }));
    assertEquals(l.items[0].action_until, '2026-12-01T00:00:00Z');
    assert(l.items[0].resolved_at);
  } finally { w.restore(); }
});

Deno.test('«ينتظرك»: عنصر واحد لكل مرجع، الأحدث بين غير المغلق، والتذكير لا يضيف عنصرًا ثانيًا', async () => {
  const t = base();
  t.participant_notifications.push(
    { id: 'o1', expert_id: XID, category: 'expert_work', title: 'عرض', ref: 'offer:r1', action_until: '2026-12-01T00:00:00Z', resolved_at: null, created_at: '2026-11-20T10:00:00Z' },
    { id: 'o2', expert_id: XID, category: 'expert_work', title: 'عرض ثانٍ', ref: 'offer:r1', action_until: '2026-12-02T00:00:00Z', resolved_at: null, created_at: '2026-11-21T10:00:00Z' },
    { id: 'p1', expert_id: XID, category: 'expert_work', title: 'طلب توجيه', ref: 'peer:q1', action_until: '2026-12-03T00:00:00Z', resolved_at: null, created_at: '2026-11-19T10:00:00Z' },
  );
  const w = installFake(t);
  try {
    const l: any = await MS.list(MS.expertOwner({ id: XID }));
    const waiting = l.items.filter((i: Row) => i.action_until && !i.resolved_at).map((i: Row) => i.id).sort();
    assertEquals(waiting, ['o2', 'p1']);
    assertEquals(l.items.length, 3);
  } finally { w.restore(); }
  const src = await Deno.readTextFile(new URL('./experts.ts', import.meta.url));
  const remind = src.slice(src.indexOf('async function remindHalfway'), src.indexOf('export async function sweepOffers'));
  assert(/noteRef: `offer:\$\{r\.id\}`/.test(remind));
  assert(!/actionUntil/.test(remind));
});

Deno.test('«ينتظرك»: ما لم يُغلق لا يسقط من القائمة ولو تجاوزته مئة رسالة أحدث', async () => {
  const t = base();
  t.participant_notifications.push({ id: 'old', expert_id: XID, category: 'expert_work', title: 'قديم', ref: 'peer:q0', action_until: '2026-12-01T00:00:00Z', resolved_at: null, created_at: '2026-10-01T10:00:00Z' });
  for (let i = 0; i < 120; i++) t.participant_notifications.push({ id: `n${i}`, expert_id: XID, category: 'expert_digest', title: 'ملخص', created_at: `2026-11-${String(10 + (i % 15)).padStart(2, '0')}T10:00:00Z` });
  const w = installFake(t);
  try {
    const l: any = await MS.list(MS.expertOwner({ id: XID }));
    assert(l.items.some((i: Row) => i.id === 'old'));
    assertEquals(new Set(l.items.map((i: Row) => i.id)).size, l.items.length);
  } finally { w.restore(); }
});
