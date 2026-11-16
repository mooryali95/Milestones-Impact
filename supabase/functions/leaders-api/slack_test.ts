// قناة سلاك (#mi-ops) على قاعدة مزيفة وشبكة محاكاة: سلسلة واحدة لكل فئة في يوم الرياض، والرمز لا يُنشر،
// والبريد مقنّع، وتعطل سلاك لا يُفشل المستدعي، وغياب الجدول ينشر بلا سلاسل، والفيض يُجمع، ورسالة الربط مرة.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
const S = await import('../_shared/slack.ts');
const { sendCounted, alertWebhook } = await import('../_shared/mail.ts');
const { db, raiseAlert, sendMail, CONFIG } = await import('./core.ts');
const { MIGRATIONS, MIGRATION_GATES } = await import('./migrations.js');

type Row = { day: string; category: string; ts: string };
function fakeDb({ missing = false, insertError = null as null | { code: string; message: string } } = {}) {
  const rows = new Map<string, Row>();
  const from = (table: string) => {
    const st = { op: 'select', filters: {} as Record<string, unknown>, payload: null as any, single: false };
    const exec = () => {
      if (table !== 'slack_threads') return { data: [], count: 0, error: null };
      if (missing) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'leaders.slack_threads'" } };
      const match = [...rows.values()].filter((r: any) => Object.entries(st.filters).every(([k, v]) => r[k] === v));
      if (st.op === 'insert') {
        if (insertError) return { error: insertError };
        const k = `${st.payload.day}|${st.payload.category}`;
        if (rows.has(k)) return { error: { code: '23505', message: 'duplicate key' } };
        rows.set(k, { ...st.payload });
        return { error: null };
      }
      if (st.op === 'update') { match.forEach((r) => Object.assign(r, st.payload)); return { error: null }; }
      if (st.op === 'delete') { for (const [k, r] of rows) if (match.includes(r)) rows.delete(k); return { error: null }; }
      return { data: st.single ? (match[0] ?? null) : match, error: null };
    };
    const q: any = {
      select: () => q, gte: () => q, not: () => q, in: () => q, limit: () => q, order: () => q,
      eq: (k: string, v: unknown) => { st.filters[k] = v; return q; },
      maybeSingle: () => { st.single = true; return q; },
      insert: (p: unknown) => { st.op = 'insert'; st.payload = p; return q; },
      update: (p: unknown) => { st.op = 'update'; st.payload = p; return q; },
      delete: () => { st.op = 'delete'; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(exec).then(ok, bad),
    };
    return q;
  };
  return { from, schema: () => ({ from }), rows };
}

type Call = { url: string; body: any };
type SlackMode = 'ok' | 'hang' | 'error' | 'throw' | 'rate' | 'rate1';
async function withNet<T>(fn: (calls: Call[]) => Promise<T>, { slack = 'ok' as SlackMode } = {}) {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  let n = 0;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: u, body });
    if (u.includes('resend.com')) return Promise.resolve(new Response('{"id":"re_1"}', { status: 200 }));
    if (!u.startsWith('https://slack.com/api/')) return Promise.resolve(new Response('ok'));
    if (slack === 'hang') {
      return new Promise((_ok, bad) => init?.signal?.addEventListener('abort', () => bad(new DOMException('aborted', 'AbortError'))));
    }
    if (slack === 'throw') return Promise.reject(new TypeError('network down'));
    if (slack === 'error') return Promise.resolve(new Response('{"ok":false,"error":"channel_not_found"}', { status: 200 }));
    if (slack === 'rate1' && n === 0) { n = -1; return Promise.resolve(new Response('{"ok":false}', { status: 429, headers: { 'Retry-After': '30' } })); }
    if (slack === 'rate1' && n < 0) n = 0;
    if (slack === 'rate') return Promise.resolve(new Response('{"ok":false,"error":"ratelimited"}', { status: 429, headers: { 'Retry-After': '30' } }));
    n += 1;
    return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: `17000.${n}` }), { status: 200 }));
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const slackCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith('https://slack.com/api/'));

function setup() {
  S.resetSlack();
  Object.assign(S.SLACK, { timeoutMs: 4000, gapMs: 0, maxLines: 20, maxPending: 60, claimWaitMs: 1, claimTries: 3 });
  Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test');
  Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST');
}
function teardown() {
  S.resetSlack();
  Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
  Deno.env.delete('LEADERS_SLACK_CHANNEL');
}

Deno.test('سلاك: عنوان السلسلة بيوم الرياض بالعربية، والبريد مقنّع بحرفه الأول ونطاقه', () => {
  const sunday = Date.parse('2026-11-15T10:00:00Z');
  assertEquals(S.parentText('codes', sunday), '🔐 رموز الدخول · الأحد 15 نوفمبر');
  assertEquals(S.parentText('alerts', sunday), '⚠️ التنبيهات · الأحد 15 نوفمبر');
  assertEquals(S.parentText('mail', sunday), '📨 بريد لم يصل · الأحد 15 نوفمبر');
  // 22:00 بتوقيت غرينتش بعد منتصف الليل في الرياض: يوم جديد
  assertEquals(S.riyadhDay(Date.parse('2026-11-15T22:00:00Z')), '2026-11-16');
  assertEquals(S.parentText('codes', Date.parse('2026-11-15T22:00:00Z')), '🔐 رموز الدخول · الاثنين 16 نوفمبر');
  assertEquals(S.maskEmail('Mona.Ali@Gmail.com'), 'm***@gmail.com');
  assertEquals(S.maskEmail('bad'), '***');
});

Deno.test('سلاك: غير مضبوط لا ينشر شيئًا', async () => {
  teardown();
  await withNet(async (calls) => {
    await S.slackPost('alerts', 'x', { client: fakeDb() });
    assertEquals(await S.slackHello(fakeDb()), 'off');
    assertEquals(slackCalls(calls).length, 0);
  });
});

Deno.test('سلاك: رسالة أم واحدة لكل فئة في اليوم، والأحداث ردود فيها، وتُعاد من الجدول في نسخة جديدة وتتجدد في اليوم التالي', async () => {
  setup();
  const client = fakeDb();
  const realNow = Date.now;
  try {
    await withNet(async (calls) => {
      await S.slackPost('codes', 'one', { client });
      await S.slackPost('codes', 'two', { client });
      await S.slackIdle();
      let sc = slackCalls(calls);
      assertEquals(sc.length, 3);
      assertEquals(sc[0].body.text, S.parentText('codes'));
      assertEquals(sc[0].body.thread_ts, undefined);
      assertEquals(sc[0].body.channel, 'C0TEST');
      assertEquals(sc[1].body, { ...sc[1].body, text: 'one', thread_ts: '17000.1' });
      assertEquals(sc[2].body.thread_ts, '17000.1');
      assertEquals(client.rows.get(`${S.riyadhDay()}|codes`)?.ts, '17000.1');

      // فئة أخرى: سلسلتها
      await S.slackPost('mail', 'm1', { client });
      sc = slackCalls(calls);
      assertEquals(sc.length, 5);
      assertEquals(sc[3].body.text, S.parentText('mail'));
      assertEquals(sc[4].body.thread_ts, sc[3].body.thread_ts ?? '17000.4');

      // نسخة جديدة من الدالة: السلسلة من الجدول، بلا أم جديدة
      S.resetSlack();
      await S.slackPost('codes', 'three', { client });
      sc = slackCalls(calls);
      assertEquals(sc.length, 6);
      assertEquals(sc[5].body.thread_ts, '17000.1');

      // اليوم التالي في الرياض: أم جديدة
      const tomorrow = realNow() + 864e5;
      Date.now = () => tomorrow;
      await S.slackPost('codes', 'four', { client });
      sc = slackCalls(calls);
      assertEquals(sc.length, 8);
      assertEquals(sc[6].body.text, S.parentText('codes', tomorrow));
      assertEquals(sc[7].body.thread_ts, sc[6].body.thread_ts ?? '17000.7');
      assertEquals(sc[7].body.thread_ts, '17000.7');
    });
  } finally { Date.now = realNow; teardown(); }
});

Deno.test('سلاك: رمز الدخول يُبلَّغ بحالته وغرضه وبريد مقنّع، ولا يحمل الرمز ولا البريد الكامل ولا متن الرسالة', async () => {
  setup();
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      const r = await sendCounted(client, 'mona.ali@gmail.com', 'رمز الدخول: 987654', '<p>رمزك 987654</p>', { kind: 'code', source: 'admin-api', cap: 80, key: 'k', purpose: 'دخول الإدارة' });
      assertEquals(r.ok, true);
      await S.slackIdle();
      const sc = slackCalls(calls);
      assertEquals(sc.length, 2);
      const all = JSON.stringify(sc.map((c) => c.body));
      assert(!all.includes('987654'), 'الرمز لا يصل سلاك');
      assert(!all.includes('mona.ali'), 'البريد الكامل لا يصل سلاك');
      assert(!all.includes('رمزك'), 'متن الرسالة لا يصل سلاك');
      assertEquals(sc[0].body.text, S.parentText('codes'));
      assertEquals(sc[1].body.text, '✅ أُرسل · دخول الإدارة · m***@gmail.com · admin-api');
      // سطر الرمز يطمس ستة أرقام متتالية احتياطًا حتى لو مُرّرت خطأ
      assert(!S.codeLine({ status: 'sent', purpose: 'x 123456', to: 'a@b.co', source: 's' }).includes('123456'));
    });
  } finally { teardown(); }
});

Deno.test('سلاك: رمز تعذّر إرساله يُبلَّغ تعذّرًا، والبريد غير الرمز المحجوب بالسقف سطر في سلسلة البريد، والمرسل لا يُبلَّغ', async () => {
  setup();
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      // بلا مفتاح Resend: تعذّر
      const r = await sendCounted(client, 'sara@org.sa', 'رمز', '<p>111222</p>', { kind: 'code', source: 'user-api', cap: 80, key: '', purpose: 'مصفوفة التأثير' });
      assertEquals(r.ok, false);
      // إشعار بنصيب مصدر ممتلئ: محجوب
      const full = fakeDb();
      const fullFrom = full.from;
      (full as any).from = (t: string) => {
        const q = fullFrom(t);
        if (t !== 'mail_events') return q;
        const then = q.then;
        q.then = (ok: any, bad: any) => then((x: any) => ok({ ...x, count: 999 }), bad);
        return q;
      };
      (full as any).schema = () => ({ from: (full as any).from });
      const b = await sendCounted(full, 'khalid@corp.com', 'تذكير', '<p>x</p>', { kind: 'notify', source: 'leaders-api', cap: 80, key: 'k' });
      assertEquals(b.ok, false);
      // إشعار أُرسل: لا سطر
      assertEquals((await sendCounted(client, 'ok@corp.com', 'تذكير', '<p>x</p>', { kind: 'notify', source: 'leaders-api', cap: 80, key: 'k' })).ok, true);
      await S.slackIdle();
      const texts = slackCalls(calls).map((c) => c.body.text);
      assert(texts.includes('❌ تعذّر · مصفوفة التأثير · s***@org.sa · user-api · mail_unconfigured'), texts.join('\n'));
      assert(texts.some((t) => t.startsWith('notify · k***@corp.com · leaders-api · mail_')), texts.join('\n'));
      assert(!texts.some((t) => t.includes('o***@corp.com')));
      assert(!texts.some((t) => t.includes('111222')));
    });
  } finally { teardown(); }
});

Deno.test('سلاك: تعطله أو بطؤه أو رفضه لا يُفشل المستدعي ولا يؤخره، ولا إعادة محاولة', async () => {
  for (const mode of ['hang', 'throw', 'error'] as const) {
    setup();
    S.SLACK.timeoutMs = 60;
    const client = fakeDb();
    try {
      await withNet(async (calls) => {
        let settled = false;
        const p = S.slackPost('codes', 'x', { client }).then(() => { settled = true; });
        const r = await sendCounted(client, 'a@b.co', 's', '<p>x</p>', { kind: 'notify', source: 'leaders-api', cap: 80, key: 'k' });
        assertEquals(r.ok, true);
        if (mode === 'hang') assertEquals(settled, false, 'المستدعي لم ينتظر سلاك');
        await p;   // لا يرمي
        await S.slackIdle();
        // أم فشلت: لا رد ولا إعادة. الرفض الصريح يحرر الحجز، والمهلة الغامضة تبقيه فارغًا فلا أم ثانية
        assertEquals(slackCalls(calls).length, 1, mode);
        const left = [...client.rows.values()];
        assertEquals(left.length, mode === 'hang' ? 1 : 0, mode);
        assert(left.every((r) => r.ts === ''));
      }, { slack: mode });
    } finally { teardown(); }
  }
});

Deno.test('سلاك: الجدول غائب (قبل الترحيل) فينشر بلا سلاسل، ويبقى يعمل', async () => {
  setup();
  const client = fakeDb({ missing: true });
  try {
    await withNet(async (calls) => {
      await S.slackPost('alerts', '*mail_cap* {}', { client });
      await S.slackPost('alerts', '*mail_rejected* {}', { client });
      const sc = slackCalls(calls);
      assertEquals(sc.length, 2);
      assertEquals(sc[0].body.thread_ts, undefined);
      assertEquals(sc[0].body.text, '⚠️ التنبيهات\n*mail_cap* {}');
      assertEquals(sc[1].body.thread_ts, undefined);
      assertEquals(await S.slackHello(client), 'no_table');
      assertEquals(slackCalls(calls).length, 2);
    });
  } finally { teardown(); }
});

Deno.test('سلاك: الفيض يُجمع في رسائل قليلة، وما فاض يُترك ويُذكر عدده، و429 يوقف النشر بلا إعادة', async () => {
  setup();
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      for (let i = 0; i < 100; i++) S.slackPost('codes', `line ${i}`, { client });
      await S.slackIdle();
      const sc = slackCalls(calls);
      assertEquals(sc.length, 3);   // الأم، والسطر الأول، ثم دفعة مجمّعة
      const last = sc[2].body.text as string;
      assertEquals(last.split('\n').filter((l) => l.startsWith('line ')).length, 20);
      assert(last.includes('(و40 أخرى من النوع نفسه)'), last);
      assert(last.includes('(تُرك 39 سطرًا لازدحام القناة)'), last);
    });
    S.resetSlack();
    await withNet(async (calls) => {
      await S.slackPost('codes', 'a', { client: fakeDb() });
      for (let i = 0; i < 10; i++) await S.slackPost('codes', `b${i}`, { client: fakeDb() });
      await S.slackIdle();
      assertEquals(slackCalls(calls).length, 1, 'بعد 429 لا طلب حتى Retry-After');
    }, { slack: 'rate' });
  } finally { teardown(); }
});

Deno.test('سلاك: رسالة الربط مرة واحدة، وتُعاد في الساعة التالية إن لم تصل', async () => {
  setup();
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      assertEquals(await S.slackHello(client), 'failed');
      assertEquals(client.rows.size, 0, 'لا علامة لما لم يصل');
    }, { slack: 'error' });
    await withNet(async (calls) => {
      assertEquals(await S.slackHello(client), 'sent');
      assertEquals(await S.slackHello(client), 'exists');
      S.resetSlack();
      assertEquals(await S.slackHello(client), 'exists');
      const sc = slackCalls(calls);
      assertEquals(sc.length, 1);
      assertEquals(sc[0].body.text, S.SLACK_HELLO);
      assertEquals(S.SLACK_HELLO, '✅ تم ربط Milestone Impact بسلاك');
      const row = [...client.rows.values()].find((r) => r.category === 'hello');
      assertEquals(row?.ts, '17000.1');
    });
  } finally { teardown(); }
});

Deno.test('سلاك: alertOps ومسار تنبيه البريد المشترك ينشران في سلسلة التنبيهات، والرابط يبقى كما هو', async () => {
  setup();
  const fake = fakeDb();
  Object.assign(db as any, { from: fake.from, schema: () => ({ from: fake.from }) });
  S.slackUse(db);
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  try {
    await withNet(async (calls) => {
      const r = await raiseAlert('slack_probe_kind', { note: 'x' });
      assertEquals(r.webhook, true);
      await alertWebhook('mail_cap', { source: 'user-api' });
      await S.slackIdle();
      const sc = slackCalls(calls);
      assertEquals(sc[0].body.text, S.parentText('alerts'));
      assertEquals(sc.slice(1).map((c) => c.body.thread_ts), ['17000.1', '17000.1']);
      assertEquals(sc[1].body.text, '*slack_probe_kind* {"note":"x"}');
      assertEquals(sc[2].body.text, '*mail_cap* {"source":"user-api"}');
      assertEquals(calls.filter((c) => c.url.includes('hooks.example')).length, 2);
    });
  } finally {
    delete (db as any).from; delete (db as any).schema;
    Deno.env.delete('LEADERS_ALERT_WEBHOOK');
    teardown();
  }
});

Deno.test('سلاك: ترحيل الجدول في القائمة ومتسامح بتعليل', () => {
  const name = '20261115130000_leaders_slack_threads';
  assert(MIGRATIONS.includes(name));
  assertEquals((MIGRATION_GATES as Record<string, string[]>)[name][0], 'tolerant');
  assert((MIGRATION_GATES as Record<string, string[]>)[name][1].length > 20);
});

Deno.test('سلاك: نص المستخدم لا يصير أمرًا (<!channel> ورابط مقنّع)، والنطاق غير السليم يُطمس', async () => {
  assertEquals(S.maskEmail('a@<!channel>.co'), 'a***@***');
  assertEquals(S.maskEmail('a@<https://x|y>.co'), 'a***@***');
  assertEquals(S.maskEmail('<x@b.co'), '****@b.co');
  assertEquals(S.slackEscape('a & <!here> <https://x|y>'), 'a &amp; &lt;!here&gt; &lt;https://x|y&gt;');
  setup();
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      for (const to of ['a@<!channel>.co', 'a@<https://evil.example/login|verify-ops>.co']) {
        await sendCounted(client, to, 'رمز', '<p>x</p>', { kind: 'code', source: 'leaders-api', cap: 80, key: 'k', purpose: 'دخول مشارك' });
      }
      S.slackPost('alerts', S.alertLine('mail_failed', { error: 'bad <!channel> <https://x|y>' }), { client });
      S.slackPost('mail', S.mailLine({ kind: 'notify', to: 'b@c.co', source: 's', reason: '<!here>' }), { client });
      await S.slackIdle();
      const sc = slackCalls(calls);
      const replies = sc.filter((c) => c.body.thread_ts).map((c) => c.body.text as string);
      assert(replies.length >= 3, replies.join('\n'));
      for (const t of replies) assert(!/[<>]/.test(t), t);
      assert(replies.some((t) => t.includes('a***@***')), replies.join('\n'));
      assert(!JSON.stringify(sc.map((c) => c.body)).includes('evil.example'));
      assert(replies.some((t) => t.includes('&lt;!channel&gt;')), replies.join('\n'));
    });
  } finally { teardown(); }
});

Deno.test('سلاك: الحجز قبل نشر الأم: نسخة أخرى حجزت فلا أم ثانية، وتُستعمل سلسلتها حين يظهر ts', async () => {
  setup();
  Object.assign(S.SLACK, { claimWaitMs: 5, claimTries: 20 });
  const client = fakeDb();
  const key = `${S.riyadhDay()}|codes`;
  client.rows.set(key, { day: S.riyadhDay(), category: 'codes', ts: '' });
  setTimeout(() => { client.rows.get(key)!.ts = '999.1'; }, 20);
  try {
    await withNet(async (calls) => {
      await S.slackPost('codes', 'one', { client });
      await S.slackIdle();
      const sc = slackCalls(calls);
      assertEquals(sc.length, 1, 'لا أم ثانية');
      assertEquals(sc[0].body.thread_ts, '999.1');
      assertEquals(sc[0].body.text, 'one');
    });
  } finally { teardown(); }
});

Deno.test('سلاك: حجز لا يكتمل ينشر الدفعة بلا سلسلة، وإدراج يفشل لا ينشر أمًّا لا يعرفها الجدول', async () => {
  setup();
  Object.assign(S.SLACK, { claimWaitMs: 1, claimTries: 3 });
  const stuck = fakeDb();
  stuck.rows.set(`${S.riyadhDay()}|mail`, { day: S.riyadhDay(), category: 'mail', ts: '' });
  try {
    await withNet(async (calls) => {
      await S.slackPost('mail', 'm1', { client: stuck });
      await S.slackIdle();
      let sc = slackCalls(calls);
      assertEquals(sc.length, 1);
      assertEquals(sc[0].body.thread_ts, undefined);
      assertEquals(sc[0].body.text, '📨 بريد لم يصل\nm1');
      S.resetSlack();
      const broken = fakeDb({ insertError: { code: 'XX000', message: 'boom' } });
      await S.slackPost('codes', 'c1', { client: broken });
      await S.slackPost('codes', 'c2', { client: broken });
      await S.slackIdle();
      sc = slackCalls(calls).slice(1);
      assertEquals(sc.map((c) => c.body.text), ['🔐 رموز الدخول\nc1', '🔐 رموز الدخول\nc2']);
      assert(sc.every((c) => c.body.thread_ts === undefined));
    });
  } finally { teardown(); }
});

Deno.test('سلاك: ما في الطابور حين يصل 429 يُحسب في المتروك ويُذكر بعد التوقف', async () => {
  setup();
  const client = fakeDb();
  const day = S.riyadhDay();
  client.rows.set(`${day}|codes`, { day, category: 'codes', ts: '1.1' });
  client.rows.set(`${day}|mail`, { day, category: 'mail', ts: '2.2' });
  const realNow = Date.now;
  try {
    await withNet(async (calls) => {
      S.slackPost('codes', 'c1', { client });
      S.slackPost('codes', 'c2', { client });
      S.slackPost('mail', 'm1', { client });
      await S.slackIdle();
      assertEquals(slackCalls(calls).length, 1, 'بعد 429 لا طلب');
      const later = realNow() + 31e3;
      Date.now = () => later;
      await S.slackPost('codes', 'c3', { client });
      await S.slackIdle();
      const sc = slackCalls(calls);
      assertEquals(sc.length, 2);
      assert((sc[1].body.text as string).includes('(تُرك 3 سطرًا لازدحام القناة)'), sc[1].body.text);
    }, { slack: 'rate1' });
  } finally { Date.now = realNow; teardown(); }
});

Deno.test('سلاك: رسالة ربط انتهت مهلتها (قد تكون وصلت) يبقى حجزها فلا تتكرر', async () => {
  setup();
  S.SLACK.timeoutMs = 30;
  const client = fakeDb();
  try {
    await withNet(async (calls) => {
      assertEquals(await S.slackHello(client), 'failed');
      assertEquals(await S.slackHello(client), 'exists');
      assertEquals(slackCalls(calls).length, 1);
    }, { slack: 'hang' });
  } finally { teardown(); }
});

Deno.test('سلاك: رمز leaders-api بلا مفتاح البريد يُبلَّغ تعذّرًا في سلسلة الرموز، وغير الرمز في سلسلة البريد', async () => {
  setup();
  const fake = fakeDb();
  Object.assign(db as any, { from: fake.from, schema: () => ({ from: fake.from }) });
  const key = CONFIG.resendKey;
  (CONFIG as any).resendKey = '';
  try {
    await withNet(async (calls) => {
      let err: any = null;
      try { await sendMail('Pat@Corp.com', 'رمز', '<p>123456</p>', [], { kind: 'code', purpose: 'دخول مشارك' }); } catch (e) { err = e; }
      assertEquals(err?.code, 'mail_unconfigured', 'يبقى الخطأ للمستدعي');
      try { await sendMail('lee@corp.com', 'تذكير', '<p>x</p>', [], { kind: 'notify' }); } catch { /* متوقع */ }
      await S.slackIdle();
      const texts = slackCalls(calls).map((c) => c.body.text);
      assert(texts.includes('❌ تعذّر · دخول مشارك · p***@corp.com · leaders-api · mail_unconfigured'), texts.join('\n'));
      assert(texts.includes('notify · l***@corp.com · leaders-api · mail_unconfigured'), texts.join('\n'));
      assert(!texts.some((t) => t.includes('123456')));
    });
  } finally {
    (CONFIG as any).resendKey = key;
    delete (db as any).from; delete (db as any).schema;
    teardown();
  }
});

// يعدّ قراءات slack_threads على القاعدة المزيفة
function counting(client: ReturnType<typeof fakeDb>) {
  const n = { reads: 0 };
  const from = client.from;
  const wrapped = (t: string) => { const q = from(t); if (t === 'slack_threads') { const s = q.select; q.select = (...a: unknown[]) => { n.reads++; return s(...a); }; } return q; };
  return { client: { ...client, from: wrapped, schema: () => ({ from: wrapped }) }, n };
}

Deno.test('سلاك: حجز عالق قديم يُحكم عليه فورًا بلا انتظار، ويُذكر القرار فلا تعيد الدفعات التالية القراءة', async () => {
  setup();
  Object.assign(S.SLACK, { claimWaitMs: 200, claimTries: 4 });
  const base = fakeDb();
  const day = S.riyadhDay();
  base.rows.set(`${day}|codes`, { day, category: 'codes', ts: '', created_at: new Date(Date.now() - 60e3).toISOString() } as Row);
  const { client, n } = counting(base);
  try {
    await withNet(async (calls) => {
      const t0 = Date.now();
      await S.slackPost('codes', 'c1', { client });
      await S.slackIdle();
      await S.slackPost('codes', 'c2', { client });
      await S.slackIdle();
      await S.slackPost('codes', 'c3', { client });
      await S.slackIdle();
      assert(Date.now() - t0 < 200, 'لا انتظار للحجز العالق');
      assertEquals(n.reads, 1, 'قراءة واحدة ثم يُذكر القرار');
      const sc = slackCalls(calls);
      assertEquals(sc.map((c) => c.body.text), ['🔐 رموز الدخول\nc1', '🔐 رموز الدخول\nc2', '🔐 رموز الدخول\nc3']);
      assert(sc.every((c) => c.body.thread_ts === undefined));
    });
  } finally { teardown(); }
});

Deno.test('سلاك: حجز حديث لا يكتمل ينتظر مرة واحدة ثم يُذكر قراره، ومهلة أم هذه النسخة لا تعيد الانتظار', async () => {
  setup();
  Object.assign(S.SLACK, { claimWaitMs: 1, claimTries: 3 });
  const base = fakeDb();
  const day = S.riyadhDay();
  base.rows.set(`${day}|mail`, { day, category: 'mail', ts: '', created_at: new Date().toISOString() } as Row);
  const { client, n } = counting(base);
  try {
    await withNet(async () => {
      await S.slackPost('mail', 'm1', { client });
      await S.slackIdle();
      assertEquals(n.reads, 4, 'قراءة ثم ثلاث محاولات');
      await S.slackPost('mail', 'm2', { client });
      await S.slackIdle();
      assertEquals(n.reads, 4, 'الدفعة التالية لا تقرأ ولا تنتظر');
    });
  } finally { teardown(); }
  // مهلة أم هذه النسخة: يبقى الحجز، والدفعة التالية بلا سلسلة دون قراءة
  setup();
  S.SLACK.timeoutMs = 30;
  const h = counting(fakeDb());
  try {
    await withNet(async (calls) => {
      await S.slackPost('alerts', 'a1', { client: h.client });
      await S.slackIdle();
      const reads = h.n.reads;
      await S.slackPost('alerts', 'a2', { client: h.client });
      await S.slackIdle();
      assertEquals(h.n.reads, reads);
      assertEquals(slackCalls(calls).length, 2, 'لا أم ثانية');
      assertEquals(slackCalls(calls)[1].body.thread_ts, undefined);
    }, { slack: 'hang' });
  } finally { teardown(); }
});

Deno.test('سلاك: رسالة في الطابور تعيدها المهمة الساعية فتُحجب بالحصة لا تُنشر مرة أخرى، وحجبها الأول يُنشر', async () => {
  setup();
  const full = fakeDb();
  const fullFrom = full.from;
  (full as any).from = (t: string) => {
    const q = fullFrom(t);
    if (t !== 'mail_events') return q;
    const then = q.then;
    q.then = (ok: any, bad: any) => then((x: any) => ok({ ...x, count: 999 }), bad);
    return q;
  };
  (full as any).schema = () => ({ from: (full as any).from });
  try {
    await withNet(async (calls) => {
      const opts = { kind: 'bulk' as const, source: 'leaders-api', cap: 80, key: 'k' };
      assertEquals((await sendCounted(full, 'first@corp.com', 's', '<p>x</p>', opts)).ok, false);
      assertEquals((await sendCounted(full, 'again@corp.com', 's', '<p>x</p>', { ...opts, queued: true })).ok, false);
      assertEquals((await sendCounted(full, 'share@corp.com', 's', '<p>x</p>', { ...opts, sourceShare: 0.5, queued: true })).reason, 'mail_share');
      await S.slackIdle();
      const texts = slackCalls(calls).map((c) => c.body.text).join('\n');
      assert(texts.includes('f***@corp.com'), texts);
      assert(!texts.includes('a***@corp.com'), texts);
      assert(!texts.includes('s***@corp.com'), texts);
    });
  } finally { teardown(); }
});

Deno.test('سلاك: تنبيه تعذّر العداد في نسخة باردة (user-api) يصل في سلسلة التنبيهات لا خارجها', async () => {
  setup();
  const base = fakeDb();
  const baseFrom = base.from;
  const from = (t: string) => {
    const q = baseFrom(t);
    if (t !== 'mail_events') return q;
    const then = q.then;
    q.then = (ok: any, bad: any) => then(() => ok({ data: null, count: null, error: { message: 'boom' } }), bad);
    return q;
  };
  const client = { ...base, from, schema: () => ({ from }) };
  const realNow = Date.now;
  const later = realNow() + 3 * 36e5;   // بعد تهدئة تنبيه العداد في النسخة
  Date.now = () => later;
  try {
    await withNet(async (calls) => {
      await sendCounted(client, 'u@corp.com', 'رمز', '<p>x</p>', { kind: 'code', source: 'user-api', cap: 80, key: 'k', purpose: 'مصفوفة التأثير' });
      await S.slackIdle();
      const sc = slackCalls(calls);
      const alert = sc.find((c) => String(c.body.text).includes('mail_counter_unavailable'));
      assert(alert, sc.map((c) => c.body.text).join('\n'));
      assert(alert.body.thread_ts, 'رد في سلسلة التنبيهات');
      assertEquals(base.rows.get(`${S.riyadhDay()}|alerts`)?.ts, alert.body.thread_ts);
    });
  } finally { Date.now = realNow; teardown(); }
});

Deno.test('سلاك: تفاصيل التنبيه مطموسة: البريد مقنّع، والرموز والمفاتيح والهاتف لا تُنشر، والمعرّفات والتواريخ تبقى', () => {
  // القيم الشبيهة بالأسرار تُركَّب هنا فلا يلتقطها فاحص المستودع (single-source.test.js) نصًا منشورًا
  const jwt = ['ey', 'JhbGciOiJIUzI1NiJ9', '.payload.sig'].join('');
  const mobile = ['05', '51234567'].join('');
  const stripeKey = ['sk', 'live', 'abcdefghijklmnop'].join('_');
  const line = S.alertLine('creem-webhook', {
    message: `refund failed for Mona.Ali@Gmail.com (+966 55 123 4567) code 482913 key ${stripeKey}`,
    auth: `Bearer ${jwt}`,
    token: 'abc', webhook_secret: 'whsec_123', api_key: 'x',
    phone: mobile,
    nested: { to: 'x.y@company.sa', items: ['otp 123456', 'ok'] },
    cohort_id: '3f2b8c1e-9a4d-4b7e-8c2a-1d2e3f4a5b6c', day: '2026-11-16', at: '2026-11-16T08:30:00.000Z',
    sent: 80, cap: 120, numeric_code: 654321, status: 403, key_source: 'env',
    blob: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4',
  });
  for (const leak of ['Mona.Ali', 'mona.ali@gmail.com', '123 4567', '1234567', '482913', 'sk_live', 'eyJhbG', 'whsec_123', '"abc"', 'x.y@', '123456', '654321', 'A1b2C3d4E5f6']) {
    assert(!line.toLowerCase().includes(leak.toLowerCase()), `${leak} في: ${line}`);
  }
  for (const keep of ['m***@gmail.com', 'x***@company.sa', '3f2b8c1e-9a4d-4b7e-8c2a-1d2e3f4a5b6c', '"day":"2026-11-16"', '2026-11-16T08:30:00.000Z', '"sent":80', '"cap":120', '"status":403', '"key_source":"env"', '••••67', '"token":"[مخفي]"']) {
    assert(line.includes(keep), `${keep} غائب عن: ${line}`);
  }
  assert(line.startsWith('*creem-webhook* '));
  // أسماء الأحداث الطويلة بلا أرقام ليست أسرارًا
  assert(S.alertLine('mail_counter_unavailable', { reason: 'agent_model_config_unavailable' }).includes('agent_model_config_unavailable'));
  assert(S.alertLine('mail_counter_unavailable', {}).startsWith('*mail_counter_unavailable*'));
});
