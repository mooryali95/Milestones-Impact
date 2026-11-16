// طابور البريد بلا ترك أعمى (ترحيل 20261116140000): ما لا موعد له ينتظر يومًا بعد يوم حتى يُرسل، والمؤرخ يُترك حين يمضي
// موعده، والإشعار قبل الجماعي، والتوقف عند الحصة، والممسَك ممسَك، والعمل قبل الترحيل، وسطر الترحيل اليومي مرة في اليوم.
// قاعدة في الذاكرة وشبكة محاكاة (_fake_db.ts)، ولا يخرج طلب حقيقي.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1';
import { hoursAgo, installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG, carryoverAlert, CARRYOVER_HOUR_RIYADH, drainMailQueue, enqueueMail, sendMail, stuckQueueAlert } = await import('./core.ts');
const core = await import('./core.ts');

type Row = Record<string, any>;
const cap = 80;   // السقف الساري (LEADERS_MAIL_DAILY_CAP غير مضبوط)، ونصيب غير الرموز 40
// n رسالة غير رمز أُرسلت قبل h ساعة: تملأ نصيب الإشعارات في نافذة الـ24 ساعة
const sentNonCode = (n: number, h: number) => Array.from({ length: n }, () => ({ id: crypto.randomUUID(), kind: 'notify', status: 'sent', source: 'leaders-api', created_at: hoursAgo(h) }));
const q = (id: string, o: Row = {}) => ({ id, kind: 'notify', to_email: `${id}@x.sa`, subject: `رسالة ${id}`, html: '<p>x</p>', ref: null, attempts: 0, last_error: null, sent_at: null, gave_up_at: null, reason: 'mail_share', expires_at: null, created_at: hoursAgo(1), ...o });

function withMail<T>(fn: () => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: cap, alertEmail: '' });
  return fn().finally(() => Object.assign(CONFIG, saved));
}
const state = (r: Row) => (r.sent_at ? 'sent' : r.gave_up_at ? `gave_up:${r.last_error}` : 'waiting');

Deno.test('الطابور: إشعار بلا موعد انتظر 72 ساعة لا يُترك، ويُرحَّل يومًا بعد يوم، ويخرج حين تتحرر الحصة', async () => {
  const tables: Record<string, Row[]> = { mail_queue: [q('a1', { created_at: hoursAgo(72) })], mail_events: sentNonCode(40, 2), audit_log: [] };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async (calls) => {
      // اليوم ممتلئ: لا إرسال ولا ترك، ويبقى منتظرًا
      assertEquals((await drainMailQueue()).sent, 0);
      assertEquals(state(tables.mail_queue[0]), 'waiting');
      assertEquals(resendCalls(calls).length, 0);
      // الغد: ما ملأ الحصة تجاوز 24 ساعة، فيخرج في التشغيلة التالية
      for (const e of tables.mail_events) e.created_at = hoursAgo(25);
      assertEquals((await drainMailQueue()).sent, 1);
      assertEquals(state(tables.mail_queue[0]), 'sent');
      assertEquals(resendCalls(calls).length, 1);
    }));
  } finally { w.restore(); }
});

Deno.test('الطابور: المؤرخ الذي مضى موعده يُترك «فات أوانه»، والمؤرخ الذي لم يمض يخرج', async () => {
  const tables: Record<string, Row[]> = {
    mail_queue: [
      q('old', { kind: 'bulk', subject: 'جلستك التدريبية بعد ساعة', expires_at: hoursAgo(0.5), created_at: hoursAgo(2) }),
      q('ok', { kind: 'bulk', subject: 'جلستك التدريبية غدًا', expires_at: hoursAgo(-20), created_at: hoursAgo(3) }),
    ],
    mail_events: [], audit_log: [],
  };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await drainMailQueue();
      assertEquals([r.sent, r.expired], [1, 1]);
      assertEquals(tables.mail_queue.map((m) => [m.id, state(m)]), [['old', 'gave_up:stale'], ['ok', 'sent']]);
      assertEquals(resendCalls(calls).map((c) => c.body.subject), ['جلستك التدريبية غدًا']);
    }));
  } finally { w.restore(); }
});

Deno.test('الطابور: الإشعار الفردي قبل الجماعي ولو كان أحدث، ثم الأقدم', async () => {
  const tables: Record<string, Row[]> = {
    mail_queue: [q('bulk-old', { kind: 'bulk', created_at: hoursAgo(10) }), q('n-new', { created_at: hoursAgo(1) }), q('n-old', { created_at: hoursAgo(5) })],
    mail_events: sentNonCode(38, 2), audit_log: [],   // بقي مكانان
  };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async () => {
      assertEquals((await drainMailQueue()).sent, 2);
      assertEquals(Object.fromEntries(tables.mail_queue.map((m) => [m.id, state(m)])), { 'bulk-old': 'waiting', 'n-new': 'sent', 'n-old': 'sent' });
    }));
  } finally { w.restore(); }
});

Deno.test('الطابور: حجب الحصة يوقف التفريغ عند أول رسالة (النوعان حصة واحدة)، بلا محاولة تُعد ولا ترك', async () => {
  const tables: Record<string, Row[]> = { mail_queue: [q('n1'), q('n2'), q('b1', { kind: 'bulk' })], mail_events: sentNonCode(40, 1), audit_log: [] };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async () => {
      const r: any = await drainMailQueue();
      assertEquals([r.sent, r.pending], [0, 3]);
      // محاولة واحدة حُجبت وسُجّلت، ولا كتابة على الطابور
      assertEquals(w.writes.filter((x) => x.table === 'mail_events').length, 1);
      assertEquals(w.writes.filter((x) => x.table === 'mail_queue'), []);
      assertEquals(tables.mail_queue.map((m) => m.attempts), [0, 0, 0]);
    }));
  } finally { w.restore(); }
});

Deno.test('الطابور: بريد 360 الممسَك يبقى ممسَكًا ولا يحجب ما بعده، ولا يُعد في سطر الترحيل', async () => {
  const tables: Record<string, Row[]> = { mail_queue: [q('held', { created_at: hoursAgo(9), reason: 'f360_off', kind: 'bulk' }), q('free', { created_at: hoursAgo(1) })], mail_events: [], audit_log: [] };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async () => {
      const r: any = await drainMailQueue(40, new Set(['held']));
      assertEquals([r.sent, r.held], [1, 1]);
      assertEquals(Object.fromEntries(tables.mail_queue.map((m) => [m.id, state(m)])), { held: 'waiting', free: 'sent' });
      assertEquals(tables.mail_queue[0].attempts, 0);
      assertEquals(await stuckQueueAlert(new Set(['held'])), { stuck: 0, alerted: 0 });
    }));
  } finally { w.restore(); }
});

Deno.test('الطابور قبل ترحيل الموعد: القراءة بلا expires_at، ولا شيء ينتهي، والإدراج يعاد بلا العمود', async () => {
  const noCol = (_t: string, op: { kind: string; cols?: string; value?: any }) =>
    (op.kind === 'select' && op.cols?.includes('expires_at')) || (op.kind === 'insert' && op.value && 'expires_at' in op.value) ? { code: '42703', message: 'column mail_queue.expires_at does not exist' } : null;
  const tables: Record<string, Row[]> = { mail_queue: [q('a', { created_at: hoursAgo(80) })], mail_events: [], audit_log: [] };
  const w = installFake(tables, { fail: (t, op) => (t === 'mail_queue' ? noCol(t, op) : null) });
  try {
    await withMail(() => withNet(async () => {
      assertEquals((await drainMailQueue()).sent, 1);
      assertEquals(await enqueueMail('b@x.sa', 'تذكير', '<p>x</p>', null, 'bulk', 'mail_share', hoursAgo(-5)), true);
      const row = tables.mail_queue.find((m) => m.to_email === 'b@x.sa')!;
      assertEquals([row.reason, 'expires_at' in row], ['mail_share', false]);
    }));
  } finally { w.restore(); }
});

Deno.test('sendMail: المؤرخ المحجوب يدخل الطابور بموعده، وqueue:false لا يدخله ويرمي، وforce يتجاوز حصة الإشعارات', async () => {
  const tables: Record<string, Row[]> = { mail_queue: [], mail_events: sentNonCode(40, 1), audit_log: [] };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async (calls) => {
      const at = hoursAgo(-6);
      await sendMail('r@x.sa', 'تذكير: تقديرك', '<p>x</p>', [], { kind: 'bulk', ref: 'rater:1', expiresAt: at });
      assertEquals(tables.mail_queue.map((m) => [m.to_email, m.kind, m.reason, m.expires_at]), [['r@x.sa', 'bulk', 'mail_share', at]]);
      let threw = false;
      await sendMail('gone@x.sa', 'نُفّذ', '<p>x</p>', [], { queue: false }).catch(() => { threw = true; });
      assertEquals([threw, tables.mail_queue.length], [true, 1]);
      await sendMail('gone@x.sa', 'نُفّذ', '<p>x</p>', [], { force: true, queue: false });
      assertEquals(resendCalls(calls).length, 1);
    }));
  } finally { w.restore(); }
});

Deno.test('سطر الترحيل اليومي: بعد التاسعة مساءً بالرياض مرة واحدة بعدد المنتظر بالحصة وموعد فراغه، وقبلها لا شيء', async () => {
  assertEquals(CARRYOVER_HOUR_RIYADH, 21);
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const day = Date.parse('2026-11-16T00:00:00Z');
  const evening = day + 19 * 36e5;   // 22:00 بالرياض
  const tables: Record<string, Row[]> = {
    mail_queue: [...Array.from({ length: 14 }, (_, i) => q(`ap${i}`, { created_at: new Date(day + 5 * 36e5).toISOString() })), q('held', { reason: 'f360_off' }), q('failed', { attempts: 2, reason: 'mail_share' })],
    mail_events: [], audit_log: [],
  };
  const w = installFake(tables);
  try {
    await withMail(() => withNet(async (calls) => {
      assertEquals(await carryoverAlert(new Set(), day + 10 * 36e5), { waiting: null, alerted: false });   // 13:00 بالرياض
      const r = await carryoverAlert(new Set(['held']), evening);
      assertEquals(r, { waiting: 14, alerted: true });
      const hook = calls.filter((c) => c.url.includes('hooks.example'));
      assertEquals(hook.length, 1);
      assertEquals([hook[0].body.kind, hook[0].body.detail.waiting], ['mail_queue_carryover', 14]);
      assertEquals(typeof hook[0].body.detail.expected_clear_day, 'string');
      // التشغيلة التالية في الليلة نفسها: مهلة النوع تكبحه
      assertEquals((await carryoverAlert(new Set(['held']), evening + 36e5)).alerted, false);
      assertEquals(calls.filter((c) => c.url.includes('hooks.example')).length, 1);
    }));
  } finally { w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('raiseAlert بمفتاح: طلبا حذف في عشر دقائق تنبيهان، والطلب نفسه مرة', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const w = installFake({ audit_log: [] });
  try {
    await withNet(async (calls) => {
      assertEquals((await core.raiseAlert('erase_request', { request: 'r1' }, { key: 'r1' })).cooled, false);
      assertEquals((await core.raiseAlert('erase_request', { request: 'r2' }, { key: 'r2' })).cooled, false);
      assertEquals((await core.raiseAlert('erase_request', { request: 'r1' }, { key: 'r1' })).cooled, true);
      assertEquals(calls.filter((c) => c.url.includes('hooks.example')).length, 2);
      assertEquals(w.tables.audit_log.map((x) => x.entity_id), ['erase_request:r1', 'erase_request:r2']);
    });
  } finally { w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('المرسلون المؤرخون يمررون موعدهم، والمهمة الساعية تنبّه بالترحيل بعد التفريغ', async () => {
  const read = (f: string) => Deno.readTextFile(new URL(`./${f}`, import.meta.url));
  const [act, f360, exp, coord, index] = await Promise.all(['activities.ts', 'feedback360.ts', 'experts.ts', 'coordinator.ts', 'index.ts'].map(read));
  assertEquals(act.includes("{ kind: 'bulk', ref: s.id, expiresAt: s.starts_at }"), true);
  assertEquals(f360.includes('expiresAt: closes })'), true);
  assertEquals(f360.includes('expiresAt: c.closes_at })'), true);
  assertEquals(exp.includes('{ expiresAt: expires.toISOString() }'), true);
  assertEquals(/coordinator:\$\{c\.id\}`, expiresAt:/.test(coord), true);
  assertEquals(index.indexOf('drainMailQueue(40, hold, rewrite)') < index.indexOf('carryoverAlert(hold)'), true);
  // لا ترك بالعمر بعد اليوم
  assertEquals('QUEUE_STALE_HOURS' in core, false);
});

Deno.test('ترحيل 20261116140000: الإنقاذ للإشعار غير المؤرخ المتروك بقاعدة اليومين في الأسبوع الأخير، لا لعروض الخبراء', async () => {
  const sql = await Deno.readTextFile(new URL('../../migrations/20261116140000_leaders_mail_queue_expiry.sql', import.meta.url));
  const rescue = sql.match(/update leaders\.mail_queue set gave_up_at = null, last_error = null[\s\S]*?;/)?.[0] || '';
  for (const c of ["sent_at is null", "last_error = 'stale'", "kind = 'notify'", 'expires_at is null', "gave_up_at >= now() - interval '7 days'", "subject not like 'طلب خدمة:%'"]) assertEquals([c, rescue.includes(c)], [c, true]);
  assertEquals(sql.includes('add column if not exists expires_at timestamptz'), true);
  assertEquals(sql.startsWith('-- deploy-gate: tolerant'), true);
});
