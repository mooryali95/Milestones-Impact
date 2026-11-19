// بلاغ المالك (2026-11-15): وصل التنبيه التجريبي بالبريد وسلاك، وبقيت أرقام البطاقة على حالها («أرسل 9 من 80»
// و«لم يُنشر شيء بعد»). هنا المسار كله بعميل supabase-js الحقيقي (لا عميل مزيف) والشبكة محاكاة على مستوى fetch:
//   1) الكتابة صحيحة على السلك: ops_status في مخطط leaders، upsert على channel بعمود النتيجة وحده، ومن عميل core.ts
//      الذي سُجّل عند الإقلاع (slackUse(db))، فلا عميل غائب في مسار التنبيه.
//   2) بريد التنبيه يدخل العداد: يُسجَّل sent بنوع alert، وعدّ «أُرسل» بلا مرشح نوع.
//   3) السبب: حالة سلاك تُكتب بعد رد admin.alert-test (الضخ لا يُنتظر)، فالبطاقة التي لا تعيد السؤال بعد التجربة، أو تعيده
//      فورًا مرة واحدة، تبقى على الأرقام القديمة. العلاج في المتصفح (ops-watch.js refreshAfterTest): سؤال فوري ثم بعد ثوانٍ.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const S = await import('../_shared/slack.ts');
const { CONFIG, mailUsage, db } = await import('./core.ts');
const { alertTest } = await import('./system.ts');

type Req = { method: string; path: string; profile: string | null; prefer: string | null; body: any };

Deno.test('التنبيه التجريبي: حالة سلاك تُكتب بعد الرد، صحيحة على السلك، وبريده في العداد', async () => {
  S.resetSlack();
  // كالإنتاج: core.ts يسجل عميله عند الإقلاع (slackUse(db))، فيمر الضخ بقراءة سلسلة اليوم وحجزها ثم الأم ثم الرد
  S.slackUse(db);
  const savedSlack = { ...S.SLACK };
  Object.assign(S.SLACK, { timeoutMs: 4000, gapMs: 0 });
  Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test');
  Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST');
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
  const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
  Object.assign(CONFIG, { alertEmail: 'owner@example.test', resendKey: 're_test' });
  const reqs: Req[] = [];
  // سلاك يرد حين نسمح، كما يتأخر في الإنتاج بعد رد الدالة
  let releaseSlack!: () => void;
  const slackGate = new Promise<void>((r) => { releaseSlack = r; });
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input instanceof Request ? input.url : input));
    const h = new Headers(init?.headers);
    if (u.hostname === 'slack.com') { await slackGate; return new Response('{"ok":true,"ts":"1700000000.000100"}'); }
    if (u.hostname === 'api.resend.com') return new Response('{"id":"re_1"}');
    const method = init?.method || 'GET';
    reqs.push({ method, path: u.pathname + u.search, profile: h.get('content-profile') || h.get('accept-profile'), prefer: h.get('prefer'), body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = { 'content-type': 'application/json' };
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { ...json, 'content-range': u.pathname.endsWith('/mail_events') ? '*/9' : '*/0' } });
    if (method === 'GET') return new Response(u.pathname.endsWith('/slack_threads') ? 'null' : '[]', { status: 200, headers: json });
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const statusWrites = () => reqs.filter((r) => r.path.startsWith('/rest/v1/ops_status'));
  try {
    const r: any = await alertTest({ email: 'super@example.test', role: 'super_admin', method: 'passkey' } as any);
    assertEquals(r.success, true);
    assertEquals(r.delivered.email, true);
    // (3) الرد خرج وسلاك لم يرد بعد: لا حالة سلاك مكتوبة، فسؤال البطاقة الآن يرى «لم يُنشر شيء بعد»
    assertEquals(statusWrites().length, 0);

    // (2) بريد التنبيه سُجّل مرسلًا بنوعه، والعدّ الذي تقرؤه البطاقة (mailUsage) لا يستثني نوعًا
    assert(reqs.some((q) => q.method === 'POST' && q.path === '/rest/v1/mail_events' && q.body?.kind === 'alert' && q.body?.status === 'sent' && q.profile === 'leaders'));
    const before = reqs.length;
    assertEquals(await mailUsage(), 9);
    const count = reqs.slice(before).find((q) => q.method === 'HEAD' && q.path.startsWith('/rest/v1/mail_events'))!;
    assert(count.path.includes('status=eq.sent') && !count.path.includes('kind='), count.path);

    // (1) سلاك رد: الكتابة تصل بالعميل الحقيقي إلى leaders.ops_status بعمود النجاح وحده
    releaseSlack();
    await S.slackIdle();
    // مسار السلسلة نفسه الذي يمر به الإنتاج: قراءة سلسلة اليوم ثم حجزها
    assert(reqs.some((q) => q.method === 'GET' && q.path.startsWith('/rest/v1/slack_threads')), 'قُرئت سلسلة اليوم');
    assert(reqs.some((q) => q.method === 'POST' && q.path.startsWith('/rest/v1/slack_threads')), 'حُجزت سلسلة اليوم');
    const w = statusWrites();
    assert(w.length >= 1, 'كُتبت حالة سلاك بعد رده');
    for (const q of w) {
      assertEquals(q.method, 'POST');
      assertEquals(q.path, '/rest/v1/ops_status?on_conflict=channel');
      assertEquals(q.profile, 'leaders');
      assert(q.prefer?.includes('resolution=merge-duplicates'), String(q.prefer));
      assertEquals(Object.keys(q.body).sort(), ['channel', 'ok_at', 'updated_at']);
      assertEquals(q.body.channel, 'slack');
    }
  } finally {
    releaseSlack();
    await S.slackIdle();
    globalThis.fetch = real;
    Object.assign(CONFIG, saved);
    Object.assign(S.SLACK, savedSlack);
    S.resetSlack();
    Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
    Deno.env.delete('LEADERS_SLACK_CHANNEL');
  }
});

// صلاحية مرفوضة على ops_status ليست غيابًا: لا توقف الكتابة دقائق، فالنشر التالي يكتب. والغياب الحق يوقفها دقيقة لا عشرًا
Deno.test('ops_status: رفض الصلاحية لا يوقف الكتابة، والغياب يوقفها مدة statusMissingMs', async () => {
  assertEquals(S.isMissing({ code: '42501', message: 'permission denied for table ops_status' }, 'ops_status'), false);
  assertEquals(S.isMissing({ message: 'permission denied for table ops_status' }, 'ops_status'), false);
  assertEquals(S.isMissing({ code: 'PGRST205', message: "Could not find the table 'leaders.ops_status'" }, 'ops_status'), true);
  assertEquals(S.isMissing({ message: 'relation "leaders.ops_status" does not exist' }, 'ops_status'), true);
  assertEquals(S.SLACK.statusMissingMs, 60e3);

  S.resetSlack();
  const savedSlack = { ...S.SLACK };
  Object.assign(S.SLACK, { gapMs: 0 });
  Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test');
  Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST');
  let writes = 0;
  const denied = { error: { code: '42501', message: 'permission denied for table ops_status' } };
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), insert: async () => ({ error: null }), update: () => q, delete: () => q, then: (ok: any) => ok({ data: null, error: null }) };
  const client: any = { schema: () => client, from: (t: string) => (t === 'ops_status' ? { upsert: async () => { writes++; return denied; } } : q) };
  const real = globalThis.fetch;
  const realErr = console.error;
  globalThis.fetch = (async () => new Response('{"ok":true,"ts":"1700000000.000100"}')) as typeof fetch;
  console.error = () => {};
  try {
    S.slackPost('mail', 'سطر أول', { client });
    await S.slackIdle();
    const first = writes;
    assert(first >= 1);
    S.slackPost('mail', 'سطر ثان', { client });
    await S.slackIdle();
    assert(writes > first, 'كُتبت حالة النشر التالي رغم رفض الصلاحية قبله');
  } finally {
    globalThis.fetch = real;
    console.error = realErr;
    Object.assign(S.SLACK, savedSlack);
    S.resetSlack();
    Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
    Deno.env.delete('LEADERS_SLACK_CHANNEL');
  }
});
