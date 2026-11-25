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
