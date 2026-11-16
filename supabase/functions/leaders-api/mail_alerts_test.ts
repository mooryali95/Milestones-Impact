// P1-12 على قاعدة مزيفة بلا شبكة: تنبيه الطابور المتأخر مرة لكل رسالة، وأرقام البريد في تقرير الأسبوع،
// وتجربة قناة التنبيه للمدير الأعلى وحده بلا كشف قيم القناتين.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { CONFIG, db, QUEUE_ALERT_HOURS, raiseAlert, stuckQueueAlert } = await import('./core.ts');
const { alertTest, weeklyHealth } = await import('./system.ts');
const { MIGRATIONS } = await import('./migrations.js');

type Op = { k: string; args: unknown[] };
type Res = { data?: unknown; error?: unknown; count?: number | null };
const has = (ops: Op[], k: string, ...args: unknown[]) => ops.some((o) => o.k === k && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));
const arg = (ops: Op[], k: string, i = 1) => ops.find((o) => o.k === k)?.args[i];

function install(route: (table: string, ops: Op[]) => Res) {
  const from = (table: string) => {
    const ops: Op[] = [];
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
  return () => { delete (db as any).from; (db as any).schema = saved; };
}

// الشبكة محاكاة: Resend والرابط، ولا يخرج طلب حقيقي
async function withFetch<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, { hookStatus = 200, resendStatus = 200 } = {}) {
  const real = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), body });
    if (String(url).includes('resend.com')) return Promise.resolve(new Response(resendStatus === 200 ? '{"id":"re_1"}' : '{"message":"down"}', { status: resendStatus }));
    return Promise.resolve(new Response('ok', { status: hookStatus }));
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
type Call = { url: string; body: any };
const hooks = (calls: Call[]) => calls.filter((c) => c.url.includes('hooks.example'));
const resend = (calls: Call[]) => calls.filter((c) => c.url.includes('resend.com'));
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString();

Deno.test('P1-12: رسالة بقيت في الطابور أكثر من ست ساعات تنبيه واحد، ولكل رسالة مرة، ويُعاد إن لم يصل', async () => {
  assertEquals(QUEUE_ALERT_HOURS, 6);
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const queue = [
    { id: 'q1', created_at: hoursAgo(9), kind: 'notify', reason: 'mail_cap' },
    { id: 'q2', created_at: hoursAgo(7), kind: 'bulk', reason: 'mail_share' },
    { id: 'q5', created_at: hoursAgo(5), kind: 'bulk', reason: 'mail_share' },   // دون الست ساعات: لا تنبيه
  ];
  const marks = new Set<string>();
  const restore = install((t, ops) => {
    if (t === 'mail_queue') {
      const before = String(arg(ops, 'lt'));
      return { data: queue.filter((m) => m.created_at < before).sort((a, b) => a.created_at.localeCompare(b.created_at)), error: null };
    }
    if (t === 'audit_log' && has(ops, 'insert')) {
      const rows = ([] as any[]).concat(arg(ops, 'insert', 0));
      for (const r of rows) if (r.action === 'mail.queue-stuck') marks.add(r.entity_id);
      return { error: null };
    }
    if (t === 'audit_log' && has(ops, 'eq', 'action', 'mail.queue-stuck')) {
      const ids = arg(ops, 'in') as string[];
      return { data: ids.filter((id) => marks.has(id)).map((entity_id) => ({ entity_id })), error: null };
    }
    return { data: [], count: 0, error: null };
  });
  try {
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 2, alerted: 2 });
      assertEquals(hooks(calls).length, 1);
      assertEquals(hooks(calls)[0].body.kind, 'mail_queue_stuck');
      assertEquals(hooks(calls)[0].body.detail.messages, 2);
      assertEquals(hooks(calls)[0].body.detail.oldest_hours, 9);
      assertEquals([...marks].sort(), ['q1', 'q2']);
      // الساعة التالية: الرسائل نفسها لا تنبّه ثانية
      assertEquals(await stuckQueueAlert(), { stuck: 2, alerted: 0 });
      assertEquals(hooks(calls).length, 1);
      // رسالة جديدة تجاوزت الست ساعات: تنبيه لها وحدها
      queue.push({ id: 'q3', created_at: hoursAgo(6.5), kind: 'notify', reason: 'mail_cap' });
      assertEquals(await stuckQueueAlert(), { stuck: 3, alerted: 1 });
      assertEquals(hooks(calls).length, 2);
      assertEquals(hooks(calls)[1].body.detail.messages, 1);
    });
    // التنبيه لم يصل من أي قناة: لا علامة، فيُعاد في الساعة التالية
    queue.push({ id: 'q4', created_at: hoursAgo(8), kind: 'notify', reason: null as any });
    await withFetch(async () => assertEquals((await stuckQueueAlert()).alerted, 0), { hookStatus: 500 });
    assertEquals(marks.has('q4'), false);
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 4, alerted: 1 });
      assertEquals(hooks(calls).length, 1);
    });
    assertEquals(marks.has('q4'), true);
  } finally { restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

// قبل اختبار البريد الناجح: الفشل يرفع المهلة فلا يبقى في النسخة ما يحجب ما بعده
Deno.test('P1-12: بريد الطابور المتأخر فشل: تعيده الساعة التالية ولا تحجبه مهلة الست ساعات', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const queue = [{ id: 'f1', created_at: hoursAgo(7), kind: 'notify', reason: 'mail_share' }];
  const marks = new Set<string>();
  const restore = install((t, ops) => {
    if (t === 'mail_queue') return { data: queue.filter((m) => m.created_at < String(arg(ops, 'lt'))), error: null };
    if (t === 'audit_log' && has(ops, 'insert')) {
      for (const r of ([] as any[]).concat(arg(ops, 'insert', 0))) if (r.action === 'mail.queue-stuck') marks.add(r.entity_id);
      return { error: null };
    }
    if (t === 'audit_log' && has(ops, 'eq', 'action', 'mail.queue-stuck')) return { data: (arg(ops, 'in') as string[]).filter((id) => marks.has(id)).map((entity_id) => ({ entity_id })), error: null };
    return { data: [], count: 0, error: null };
  });
  try {
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 1, alerted: 0 });
      assertEquals(await stuckQueueAlert(), { stuck: 1, alerted: 0 });
      // محاولتا بريد لا واحدة: الثانية لم تحجبها مهلة الأولى الفاشلة
      assertEquals(resend(calls).length, 2);
    }, { hookStatus: 500, resendStatus: 500 });
    assertEquals(marks.has('f1'), false);
  } finally { restore(); Object.assign(CONFIG, saved); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('P1-12: دفعة متزامنة من تنبيه mail_cap رابط واحد وبريد واحد، فلا يُستنفد احتياط البريد', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const restore = install(() => ({ data: [], count: 0, error: null }));
  try {
    await withFetch(async (calls) => {
      const rs = await Promise.all(Array.from({ length: 10 }, () => raiseAlert('mail_cap', { source: 'leaders-api', kind: 'code' })));
      assertEquals(rs.filter((r) => !r.cooled).length, 1);
      assertEquals([hooks(calls).length, resend(calls).length], [1, 1]);
    });
  } finally { restore(); Object.assign(CONFIG, saved); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('P1-12: بريد الطابور المتأخر احتياط: لا يُرسل إن وصل الرابط، ومرة في ست ساعات إن لم يصل، وما لم يصل يُعاد', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const queue = [{ id: 'm1', created_at: hoursAgo(7), kind: 'notify', reason: 'mail_share' }];
  const marks = new Set<string>();
  const restore = install((t, ops) => {
    if (t === 'mail_queue') return { data: queue.filter((m) => m.created_at < String(arg(ops, 'lt'))), error: null };
    if (t === 'audit_log' && has(ops, 'insert')) {
      for (const r of ([] as any[]).concat(arg(ops, 'insert', 0))) if (r.action === 'mail.queue-stuck') marks.add(r.entity_id);
      return { error: null };
    }
    if (t === 'audit_log' && has(ops, 'eq', 'action', 'mail.queue-stuck')) return { data: (arg(ops, 'in') as string[]).filter((id) => marks.has(id)).map((entity_id) => ({ entity_id })), error: null };
    return { data: [], count: 0, error: null };
  });
  try {
    // الرابط وصل: لا بريد يأخذ من نصيب الرموز
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 1, alerted: 1 });
      assertEquals([hooks(calls).length, resend(calls).length], [1, 0]);
    });
    // الرابط معطل: بريد واحد، ثم رسائل الساعات التالية لا بريد لها في المهلة ولا تُعلَّم، فتُعاد
    queue.push({ id: 'm2', created_at: hoursAgo(6.5), kind: 'notify', reason: 'mail_share' });
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 2, alerted: 1 });
      assertEquals(resend(calls).length, 1);
      queue.push({ id: 'm3', created_at: hoursAgo(6.2), kind: 'notify', reason: 'mail_share' });
      assertEquals(await stuckQueueAlert(), { stuck: 3, alerted: 0 });
      assertEquals(resend(calls).length, 1);
    }, { hookStatus: 500 });
    assertEquals(marks.has('m3'), false);
    await withFetch(async (calls) => {
      assertEquals(await stuckQueueAlert(), { stuck: 3, alerted: 1 });
      assertEquals([hooks(calls).length, resend(calls).length], [1, 0]);
    });
    assertEquals(marks.has('m3'), true);
  } finally { restore(); Object.assign(CONFIG, saved); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

// قاعدة تقرير الأسبوع: الترحيلات كلها مطبقة، والطابور والسجل بأرقام معروفة
function weekDb(mailQueueError = false) {
  return (t: string, ops: Op[]): Res => {
    if (t === 'schema_migrations') return { data: MIGRATIONS.map((name) => ({ name })), error: null };
    if (t === 'mail_events') {
      if (has(ops, 'insert')) return { error: null };
      if (has(ops, 'eq', 'status', 'blocked')) return { count: 3, error: null };
      if (has(ops, 'eq', 'status', 'failed')) return { count: 2, error: null };
      return { count: has(ops, 'not') ? 4 : 10, error: null };
    }
    if (t === 'mail_queue') {
      if (mailQueueError) return { data: null, count: null, error: { message: 'down' } };
      if (has(ops, 'order')) return { data: [{ created_at: hoursAgo(9.2) }], error: null };
      if (has(ops, 'eq', 'last_error', 'stale')) return { count: 2, error: null };
      if (has(ops, 'not', 'last_error', 'in', '(stale,cancelled)')) return { count: 1, error: null };
      return { count: 4, error: null };
    }
    return { data: [], count: 0, error: null };
  };
}

Deno.test('P1-12: تقرير الأسبوع يعرض الطابور وأقدم منتظر وما تُرك وما حُجب وما رُفض، وعداد البريد بكل أنواعه', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  const restore = install(weekDb());
  try {
    await withFetch(async (calls) => {
      const r: any = await weeklyHealth();
      assertEquals(r.sent, true);
      assertEquals(r.mail, { waiting: 4, oldest_hours: 9, expired: 2, dropped: 1, blocked: 3, rejected: 2 });
      const html = String(resend(calls)[0].body.html);
      for (const s of ['في طابور البريد الآن', '4، أقدمها منذ 9 ساعات', 'تُرك من الطابور هذا الأسبوع', 'حُجب بحصة البريد هذا الأسبوع', 'رفضه مزوّد البريد هذا الأسبوع',
        'البريد المرسل آخر 24 ساعة (كل الأنواع)', '10 من 80',
        'طابور البريد: 4 تنتظر، أقدمها منذ 9 ساعات', 'تُرك من طابور البريد هذا الأسبوع بلا إرسال: 3', 'رفض مزوّد البريد هذا الأسبوع: 2', 'حُجب بحصة البريد اليومية هذا الأسبوع: 3']) {
        assertEquals(html.includes(s), true, s);
      }
      // العداد يعد كل الأنواع: التسمية القديمة «رسائل الرموز» كانت تقول غير ما يُعد
      assertEquals(html.includes('رسائل الرموز'), false);
    });
  } finally { restore(); Object.assign(CONFIG, saved); }
});

Deno.test('P1-12: تعذّر قراءة الطابور في تقرير الأسبوع «غير مقروء» لا صفر', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  const restore = install(weekDb(true));
  try {
    await withFetch(async (calls) => {
      const r: any = await weeklyHealth();
      assertEquals(r.mail, { waiting: null, oldest_hours: null, expired: null, dropped: null, blocked: 3, rejected: 2 });
      const html = String(resend(calls)[0].body.html);
      assertEquals(html.includes('تعذّرت قراءة طابور البريد أو سجله'), true);
      assertEquals(html.includes('غير مقروء'), true);
    });
  } finally { restore(); Object.assign(CONFIG, saved); }
});

Deno.test('P1-12: admin.alert-test للمدير الأعلى وحده، يرسل تنبيهًا عبر القناتين ويعيد ما ضُبط بلا قيمه', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner-secret@x.sa', resendKey: 're_test' });
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/secret-path');
  const audits: any[] = [];
  const restore = install((t, ops) => {
    if (t === 'audit_log' && has(ops, 'insert')) { audits.push(arg(ops, 'insert', 0)); return { error: null }; }
    return { data: [], count: 0, error: null };
  });
  try {
    await withFetch(async (calls) => {
      for (const [role, method, code] of [['viewer', 'passkey', 'forbidden'], ['admin', 'passkey', 'super_required'], ['super_admin', 'email', 'mfa_required']] as const) {
        const e: any = await assertRejects(() => alertTest({ email: `${role}@x.sa`, role, method }));
        assertEquals([e.status, e.code], [403, code], role);
      }
      assertEquals(calls.length, 0);   // لا تنبيه ولا بريد لمن لا يملك الإجراء
      assertEquals(audits.length, 0);
      const r: any = await alertTest({ email: 'boss@x.sa', role: 'super_admin', method: 'passkey' });
      // سلاك غير مضبوط في بيئة الاختبار: قناة ثالثة تُذكر بلا نتيجة (لا يُنتظر)
      assertEquals(r, { success: true, channels: { webhook: true, email: true, slack: false }, mail_key: true, delivered: { webhook: true, email: true, slack: false } });
      assertEquals(hooks(calls).length, 1);
      assertEquals(hooks(calls)[0].body.kind, 'alert_test');
      assertEquals(resend(calls).length, 1);
      assertEquals(resend(calls)[0].body.to, ['owner-secret@x.sa']);
      // الرد لا يحمل الرابط ولا العنوان
      assertEquals(/secret|hooks\.example|owner/.test(JSON.stringify(r)), false);
      assertEquals(audits.map((a) => a.action), ['system.alert', 'system.alert-test']);
      // مرة في الدقيقة
      const again: any = await assertRejects(() => alertTest({ email: 'boss@x.sa', role: 'super_admin', method: 'passkey' }));
      assertEquals([again.status, again.code], [429, 'rate']);
      assertEquals(hooks(calls).length, 1);
    });
  } finally { restore(); Object.assign(CONFIG, saved); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
  // موضعه في خريطة إجراءات الإدارة: خلف superWriter كذلك (طبقتان)
  const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assertEquals(index.includes("'admin.alert-test': (a, b) => A.superWriter(a, S.alertTest, b),"), true);
});

// تنبيه سقف إنفاق المساعد (agent-chat) يمر بالمسار الموحد: أثر في السجل، والرابط، وبريد المالك باسم الدالة
Deno.test('تنبيه سقف المساعد: سجل system.alert والرابط والبريد، بلا تهدئة ثانية فوق علامة المساعد اليومية', async () => {
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const audits: any[] = [];
  const restore = install((t, ops) => {
    if (t === 'audit_log' && has(ops, 'insert')) { audits.push(...([] as any[]).concat(arg(ops, 'insert', 0))); return { error: null }; }
    return { data: [], count: 0, error: null };
  });
  try {
    await withFetch(async (calls) => {
      const { alertOps } = await import('./core.ts');
      assertEquals(await alertOps('agent_spend_80', { fn: 'agent-chat', day: '2026-11-16', spent_usd: '4.0000', cap_usd: '5.00' }), true);
      assertEquals(await alertOps('agent_spend_cap', { fn: 'agent-chat', day: '2026-11-16', spent_usd: '5.0000', cap_usd: '5.00' }), true);
      assertEquals(audits.filter((r) => r.action === 'system.alert').map((r) => r.entity_id), ['agent_spend_80', 'agent_spend_cap']);
      assertEquals(hooks(calls).map((c) => c.body.kind), ['agent_spend_80', 'agent_spend_cap']);
      const mails = resend(calls);
      assertEquals(mails.length, 2);
      assertEquals(mails[1].body.to, ['owner@x.sa']);
      assertEquals(String(mails[1].body.html).includes('agent-chat'), true);
    });
  } finally { restore(); Object.assign(CONFIG, saved); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});
