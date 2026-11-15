// صحة البريد والتنبيه على قاعدة مزيفة بلا شبكة: حقائق admin.ops-health للمدير ذي الكتابة وحده بلا قيم الأسرار،
// وحكم الألوان والشريط من العتبات نفسها، وتسجيل آخر نجاح وخطأ لسلاك في ops_status بلا انتظار ومرة في الدقيقة لكل نتيجة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const S = await import('../_shared/slack.ts');
const { db, QUEUE_ALERT_HOURS } = await import('./core.ts');
const { opsHealth } = await import('./system.ts');
const { codeStreak, minutesAr, opsVerdict, OPS, slackHint } = await import('./ops-health.js');
const { MIGRATIONS, MIGRATION_GATES } = await import('./migrations.js');

type Op = { k: string; args: unknown[] };
type Res = { data?: unknown; error?: unknown; count?: number | null };
const has = (ops: Op[], k: string, ...args: unknown[]) => ops.some((o) => o.k === k && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));
function install(route: (table: string, ops: Op[]) => Res) {
  const seen: { table: string; ops: Op[] }[] = [];
  const from = (table: string) => {
    const ops: Op[] = [];
    seen.push({ table, ops });
    const q: any = new Proxy({}, {
      get(_t, k: string) {
        if (k === 'then') return (ok: (x: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(() => route(table, ops)).then(ok, bad);
        return (...args: unknown[]) => { ops.push({ k, args }); return q; };
      },
    });
    return q;
  };
  const saved = (db as any).schema;
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return { seen, restore: () => { delete (db as any).from; (db as any).schema = saved; } };
}
const minsAgo = (m: number) => new Date(Date.now() - m * 6e4).toISOString();

Deno.test('صحة البريد: الحقائق للمدير ذي الكتابة وحده، بأسماء الأسرار لا قيمها، وبلا مسح كامل', async () => {
  Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-secret-value');
  Deno.env.delete('LEADERS_SLACK_CHANNEL');
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/secret');
  const codes = [{ status: 'failed', created_at: minsAgo(2) }, { status: 'blocked', created_at: minsAgo(9) }, { status: 'failed', created_at: minsAgo(20) }, { status: 'sent', created_at: minsAgo(40) }];
  const { seen, restore } = install((t, ops) => {
    if (t === 'mail_events' && has(ops, 'order')) return { data: codes, error: null };
    if (t === 'mail_events' && has(ops, 'eq', 'kind', 'code') && has(ops, 'eq', 'status', 'failed')) return { count: 2, error: null };
    if (t === 'mail_events' && has(ops, 'eq', 'kind', 'code') && has(ops, 'eq', 'status', 'blocked')) return { count: 1, error: null };
    if (t === 'mail_events' && has(ops, 'eq', 'kind', 'code')) return { count: 7, error: null };
    if (t === 'mail_events' && has(ops, 'eq', 'status', 'sent')) return { count: 30, error: null };
    if (t === 'mail_events' && has(ops, 'eq', 'status', 'failed')) return { count: 4, error: null };
    if (t === 'mail_events') return { count: 5, error: null };
    if (t === 'mail_queue' && has(ops, 'order')) return { data: [{ created_at: minsAgo(90) }], error: null };
    if (t === 'mail_queue') return { count: 3, error: null };
    if (t === 'ops_status') return { data: { ok_at: minsAgo(30), error_at: minsAgo(5), error: 'not_in_channel' }, error: null };
    return { data: [], count: 0, error: null };
  });
  try {
    for (const role of ['viewer'] as const) {
      const e: any = await assertRejects(() => opsHealth({ email: 'v@x.sa', role }));
      assertEquals(e.code, 'forbidden');
    }
    // المدير بلا عامل ثان يقرأ (قراءة لا تعديل)
    const r: any = await opsHealth({ email: 'a@x.sa', role: 'admin', method: 'email' });
    assertEquals(r.mail.codes, { sent: 7, failed: 2, blocked: 1 });
    assertEquals(r.mail.code_streak.count, 3);
    assertEquals(r.mail.failed_24h, 4);
    assertEquals(r.mail.blocked_24h, 5);
    assertEquals(r.mail.queue.waiting, 3);
    assert(r.mail.queue.oldest_minutes >= 89 && r.mail.queue.oldest_minutes <= 91);
    assertEquals(r.slack.configured, false);
    assertEquals(r.slack.missing, ['LEADERS_SLACK_CHANNEL']);
    assertEquals(r.slack.error, 'not_in_channel');
    assertEquals(r.alerts.webhook, true);
    const text = JSON.stringify(r);
    assertEquals(text.includes('xoxb-secret-value') || text.includes('hooks.example'), false);
    // كل قراءة من mail_events مقيدة بنافذة 24 ساعة، وقائمة الرموز محدودة
    for (const s of seen.filter((x) => x.table === 'mail_events')) assert(s.ops.some((o) => o.k === 'gte' && o.args[0] === 'created_at'));
    assert(seen.some((s) => s.table === 'mail_events' && has(s.ops, 'limit', OPS.codeWindow)));
    // والحكم من الحقائق نفسها: ثلاثة رموز متتالية لم تصل خلال الساعة أحمر
    // (المفتاح غير مضبوط في بيئة الاختبار فيُضبط هنا، وإلا تقدّمه في الشريط)
    assertEquals(opsVerdict(r).issues[0].key, 'mail_key');
    const v = opsVerdict({ ...r, mail: { ...r.mail, key: true } });
    assertEquals(v.level, 'red');
    assertEquals(v.banner, 'البريد متوقف: رموز الدخول لا تصل منذ 20 دقيقة');
  } finally {
    restore();
    Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
    Deno.env.delete('LEADERS_ALERT_WEBHOOK');
  }
});

Deno.test('صحة البريد: جدول ops_status غائب (قبل الترحيل) لا يُسقط البطاقة', async () => {
  const { restore } = install((t) => (t === 'ops_status' ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'leaders.ops_status'" } } : { data: [], count: 0, error: null }));
  try {
    const r: any = await opsHealth({ email: 's@x.sa', role: 'super_admin' });
    assertEquals(r.slack.readable, false);
    assertEquals(r.slack.ok_at, null);
    assertEquals(r.mail.queue, { waiting: 0, oldest_minutes: 0 });
    assertEquals(r.mail.code_streak.count, 0);
  } finally { restore(); }
});

Deno.test('صحة البريد: العتبات من مصدر واحد', () => {
  assertEquals(OPS.queueWatchHours, QUEUE_ALERT_HOURS);
  assertEquals(codeStreak([{ status: 'blocked', created_at: 'b' }, { status: 'failed', created_at: 'a' }]).open, true);
  assertEquals(minutesAr(20), '20 دقيقة');
  assert(slackHint('invalid_auth').includes('LEADERS_SLACK_BOT_TOKEN'));
});

Deno.test('صحة البريد: ترحيل ops_status في القائمة ومتسامح بتعليل', () => {
  assert(MIGRATIONS.includes('20261115140000_leaders_ops_status'));
  assertEquals((MIGRATION_GATES as any)['20261115140000_leaders_ops_status'][0], 'tolerant');
});

// سلاك: آخر نجاح وآخر خطأ يُكتبان في ops_status، بلا انتظار، ومرة في الدقيقة لكل نتيجة، والتغير يُكتب فورًا
Deno.test('سلاك: نتيجة النشر تُسجَّل في ops_status حين تتغير ومرة في الدقيقة للنتيجة نفسها', async () => {
  S.resetSlack();
  Object.assign(S.SLACK, { timeoutMs: 4000, gapMs: 0, statusMs: 60e3 });
  Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test');
  Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST');
  const writes: any[] = [];
  const from = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, maybeSingle: () => q, limit: () => q,
      insert: () => ({ then: (ok: any) => ok({ error: { code: 'PGRST205', message: 'no slack_threads' } }) }),
      upsert: (row: any, opt: any) => { writes.push({ table, row, opt }); return Promise.resolve({ error: null }); },
      then: (ok: any) => ok({ data: null, error: { code: 'PGRST205', message: 'no slack_threads' } }),
    };
    return q;
  };
  const client = { from, schema: () => ({ from }) };
  let mode = 'ok';
  const real = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response(mode === 'ok' ? '{"ok":true,"ts":"1.1"}' : '{"ok":false,"error":"channel_not_found"}'))) as typeof fetch;
  try {
    for (let i = 0; i < 3; i++) { await S.slackPost('alerts', `حدث ${i}`, { client }); await S.slackIdle(); }
    assertEquals(writes.length, 1);
    assertEquals(writes[0].table, 'ops_status');
    assertEquals(writes[0].opt, { onConflict: 'channel' });
    assert(writes[0].row.ok_at && !('error' in writes[0].row));
    mode = 'error';
    await S.slackPost('alerts', 'حدث خطأ', { client }); await S.slackIdle();
    await S.slackPost('alerts', 'حدث خطأ ثان', { client }); await S.slackIdle();
    assertEquals(writes.length, 2);
    assertEquals(writes[1].row.error, 'channel_not_found');
    assert(writes[1].row.error_at && !('ok_at' in writes[1].row));
    mode = 'ok';
    await S.slackPost('alerts', 'عاد', { client }); await S.slackIdle();
    assertEquals(writes.length, 3);
  } finally {
    globalThis.fetch = real;
    S.resetSlack();
    Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
    Deno.env.delete('LEADERS_SLACK_CHANNEL');
  }
});
