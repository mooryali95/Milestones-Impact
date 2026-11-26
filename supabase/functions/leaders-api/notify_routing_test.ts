// مركز الإشعارات، المرحلة 1 (التصور 2026-11-16، الأقسام 4 و6.4 و8): raiseAlert يقرر القناة بجدول التوجيه وحده،
// بكل طبقة وكل حال لسلاك (وصل، فشل، غير مضبوط)، ومفتاح المساعد بلا بريد ثانٍ، وبريد «Slack لا يستقبل» مرة كل ست ساعات،
// وتقرير الأسبوع في سلاك ولا بريد إلا بما يحتاج تدخلًا أو حين لا يصل سلاك، وطلب الاستعادة بنوع alert.
// قاعدة مزيفة وشبكة محاكاة، فلا يخرج طلب حقيقي.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const S = await import('../_shared/slack.ts');
const { CONFIG, db, raiseAlert, resetSlackDown } = await import('./core.ts');
const { weeklyHealth, weeklyLine } = await import('./system.ts');
const { MIGRATIONS } = await import('./migrations.js');
const { SLACK_DOWN_SUBJECT } = await import('../_shared/notify-routing.js');

type Op = { k: string; args: unknown[] };
type Res = { data?: unknown; error?: unknown; count?: number | null };
const has = (ops: Op[], k: string, ...args: unknown[]) => ops.some((o) => o.k === k && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));

// كل جدول عبر وكيل يسجل السلسلة ويرد بما تقرره دالة الاختبار
function install(answer: (table: string, ops: Op[]) => Res = () => ({ data: [], count: 0, error: null })) {
  const from = (table: string) => {
    const ops: Op[] = [];
    const q: any = new Proxy({}, {
      get(_t, k: string) {
        if (k === 'then') return (ok: (x: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(() => answer(table, ops)).then(ok, bad);
        return (...args: unknown[]) => { ops.push({ k, args }); return q; };
      },
    });
    return q;
  };
  const saved = (db as any).schema;
  Object.assign(db as any, { from, schema: () => ({ from }) });
  S.slackUse(db);
  return () => { delete (db as any).from; (db as any).schema = saved; };
}

type Call = { url: string; body: any };
type Mode = { slack?: 'ok' | 'error'; hook?: number };
async function withNet<T>(fn: (calls: Call[]) => Promise<T>, { slack = 'ok', hook = 200 }: Mode = {}) {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  let n = 0;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.includes('resend.com')) return Promise.resolve(new Response('{"id":"re_1"}', { status: 200 }));
    if (u.startsWith('https://slack.com/api/')) {
      if (slack === 'error') return Promise.resolve(new Response('{"ok":false,"error":"invalid_auth"}', { status: 200 }));
      n += 1;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: `17100.${n}` }), { status: 200 }));
    }
    return Promise.resolve(new Response('ok', { status: hook }));
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const resend = (calls: Call[]) => calls.filter((c) => c.url.includes('resend.com'));

const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey };
type Slack = 'ok' | 'failed' | 'unconfigured';
// حال سلاك في الاختبار: مضبوط ويقبل، أو مضبوط ويرفض، أو لا سلاك ولا رابط
function env(state: Slack) {
  S.resetSlack();
  resetSlackDown();
  Object.assign(S.SLACK, { gapMs: 0, claimWaitMs: 1, claimTries: 2 });
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test' });
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
  if (state === 'unconfigured') { Deno.env.delete('LEADERS_SLACK_BOT_TOKEN'); Deno.env.delete('LEADERS_SLACK_CHANNEL'); }
  else { Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test'); Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST'); }
  return { slack: state === 'failed' ? 'error' as const : 'ok' as const };
}
function done() {
  S.resetSlack();
  resetSlackDown();
  Object.assign(CONFIG, saved);
  Deno.env.delete('LEADERS_SLACK_BOT_TOKEN');
  Deno.env.delete('LEADERS_SLACK_CHANNEL');
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
}
const alertMails = (calls: Call[]) => resend(calls).filter((c) => c.body.subject !== SLACK_DOWN_SUBJECT);
const downMails = (calls: Call[]) => resend(calls).filter((c) => c.body.subject === SLACK_DOWN_SUBJECT);

// الجدول المتوقع لكل طبقة وكل حال: [بريد التنبيه، وصل سلاك]
const EXPECT: Record<string, Record<Slack, [boolean, boolean]>> = {
  critical: { ok: [true, true], failed: [true, false], unconfigured: [true, false] },
  important: { ok: [false, true], failed: [true, false], unconfigured: [true, false] },
};
const KIND = { critical: 'cert_key_missing', important: 'seat_check_unavailable' };
let seq = 0;
for (const tier of ['critical', 'important'] as const) {
  for (const state of ['ok', 'failed', 'unconfigured'] as const) {
    Deno.test(`التوجيه: تنبيه ${tier} وسلاك ${state}`, async () => {
      const mode = env(state);
      const restore = install();
      try {
        await withNet(async (calls) => {
          // مفتاح تهدئة فريد لكل حالة: المهلة في النسخة لا تحجب حالة عن أختها
          const r = await raiseAlert(KIND[tier], { note: 'x' }, { key: `t${seq++}` });
          assertEquals([r.email, !!r.slack], EXPECT[tier][state]);
          assertEquals(alertMails(calls).length, EXPECT[tier][state][0] ? 1 : 0);
          // بريد «Slack لا يستقبل» حين يُضبط سلاك ويفشل وحده
          assertEquals(downMails(calls).length, state === 'failed' ? 1 : 0);
          assertEquals(r.routed?.email, EXPECT[tier][state][0]);
        }, mode);
      } finally { restore(); done(); }
    });
  }
}

Deno.test('التوجيه: الرابط وحده قناة كافية: وصل فلا بريد للمهم، وفشل وسلاك غير مضبوط فالبريد', async () => {
  env('unconfigured');
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const restore = install();
  try {
    await withNet(async (calls) => {
      const r = await raiseAlert('mail_quota_70', { sent: 57, cap: 80 }, { key: 'hook-ok' });
      assertEquals([r.webhook, r.email], [true, false]);
      assertEquals(resend(calls).length, 0);
    });
    await withNet(async (calls) => {
      const r = await raiseAlert('mail_quota_70', { sent: 58, cap: 80 }, { key: 'hook-down' });
      assertEquals([r.webhook, r.email], [false, true]);
      // سلاك غير مضبوط: لا بريد «Slack لا يستقبل»
      assertEquals([alertMails(calls).length, downMails(calls).length], [1, 0]);
    }, { hook: 500 });
  } finally { restore(); done(); }
});

Deno.test('التوجيه: نوع لا يعرفه الفهرس «مهم» فلا يُسكت: سلاك، والبريد إن لم يصل', async () => {
  const restore = install();
  try {
    env('ok');
    await withNet(async (calls) => {
      const r = await raiseAlert('brand_new_kind', { note: 'x' });
      assertEquals([r.email, r.slack], [false, true]);
      assertEquals(resend(calls).length, 0);
    });
    env('failed');
    await withNet(async (calls) => {
      const r = await raiseAlert('brand_new_kind_2', { note: 'x' });
      assertEquals(r.email, true);
      assertEquals(alertMails(calls).length, 1);
    }, { slack: 'error' });
  } finally { restore(); done(); }
});

Deno.test('مفتاح المساعد: سطر التشغيل في سلاك وحده، ولا بريد احتياطي ولو فشل سلاك (بريد الملاك الأمني يغطيه)', async () => {
  const restore = install();
  try {
    for (const state of ['ok', 'failed', 'unconfigured'] as const) {
      const mode = env(state);
      await withNet(async (calls) => {
        const r = await raiseAlert('agent_key_changed', { by: 'own***@x.sa', last4_after: 'ab12' });
        assertEquals(r.email, false, state);
        assertEquals(alertMails(calls).length, 0, state);
        assertEquals(!!r.slack, state === 'ok', state);
      }, mode);
    }
    // والمصدر: بريد الملاك الأمني باقٍ في agent-admin.ts، وAG.alert يمر بـ raiseAlert
    const src = await Deno.readTextFile(new URL('./agent-admin.ts', import.meta.url));
    assert(src.includes('AG.mail(to, AGENT_KEY_MAIL_SUBJECT[kind], agentKeyMail(kind, rows))'));
    assert(src.includes("alert: (kind: string, detail: Record<string, unknown>) => raiseAlert(kind, detail),"));
  } finally { restore(); done(); }
});

Deno.test('Slack لا يستقبل: بريد واحد في ست ساعات مهما تكرر الفشل، ومن سجل البريد بين النسخ', async () => {
  const mode = env('failed');
  let sentDown = 0;
  const restore = install((t, ops) => {
    if (t === 'mail_events' && has(ops, 'eq', 'subject', SLACK_DOWN_SUBJECT)) return { count: sentDown, error: null };
    return { data: [], count: 0, error: null };
  });
  try {
    await withNet(async (calls) => {
      await raiseAlert('cert_key_missing', { n: 1 }, { key: 'd1' });
      await raiseAlert('cert_key_missing', { n: 2 }, { key: 'd2' });
      await raiseAlert('seat_check_unavailable', { n: 3 }, { key: 'd3' });
      assertEquals(downMails(calls).length, 1);
      assertEquals(alertMails(calls).length, 3);
      // نسخة جديدة (ذاكرة فارغة) وسجل البريد فيه البريد خلال الست ساعات: لا بريد ثانٍ
      resetSlackDown();
      sentDown = 1;
      await raiseAlert('cert_key_missing', { n: 4 }, { key: 'd4' });
      assertEquals(downMails(calls).length, 1);
      // مضت الست ساعات (لا سطر في السجل): يُعاد
      resetSlackDown();
      sentDown = 0;
      await raiseAlert('cert_key_missing', { n: 5 }, { key: 'd5' });
      assertEquals(downMails(calls).length, 2);
      // البريد لا يحمل تفاصيل التنبيه، فقط النوع
      assert(!String(downMails(calls)[0].body.html).includes('"n"'));
    }, mode);
  } finally { restore(); done(); }
});

Deno.test('mail_queue_stuck حالة من القاعدة العامة: سلاك وصل فلا بريد، وفشل فبريد مرة في ست ساعات', async () => {
  const restore = install();
  try {
    const ok = env('ok');
    await withNet(async (calls) => {
      const r = await raiseAlert('mail_queue_stuck', { messages: 1 });
      assertEquals([r.slack, r.email], [true, false]);
      assertEquals(resend(calls).length, 0);
    }, ok);
    const bad = env('failed');
    await withNet(async (calls) => {
      assertEquals((await raiseAlert('mail_queue_stuck', { messages: 2 })).email, true);
      assertEquals((await raiseAlert('mail_queue_stuck', { messages: 3 })).email, false);
      assertEquals(alertMails(calls).length, 1);
    }, bad);
  } finally { restore(); done(); }
});

// تقرير الأسبوع: قاعدة كل شيء فيها سليم (أو فيها منتظرون للاعتماد)، والأسرار كلها مضبوطة
function healthyDb(pending = 0) {
  return (t: string, ops: Op[]): Res => {
    if (t === 'schema_migrations') return { data: MIGRATIONS.map((name) => ({ name })), error: null };
    if (t === 'participants' && has(ops, 'eq', 'status', 'pending_approval')) return { count: pending, error: null };
    if (t === 'mail_queue' && has(ops, 'order')) return { data: [], error: null };
    return { data: [], count: 0, error: null };
  };
}
async function weekly(state: Slack, pending: number, extra: { sponsorExpired?: number } = {}) {
  const mode = env(state);
  // بلا سلاك يكفي الرابط قناةً للتنبيه (فلا يُعد غيابها أمرًا يحتاج تدخلًا)، والتقرير لا ينشر في الرابط
  if (state === 'unconfigured') Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const savedCfg = { cronSecret: CONFIG.cronSecret, turnstileSecret: CONFIG.turnstileSecret, turnstileSite: CONFIG.turnstileSite };
  Object.assign(CONFIG, { cronSecret: 'c', turnstileSecret: 't', turnstileSite: 's' });
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', 'k'.repeat(40));
  const restore = install(healthyDb(pending));
  try {
    return await withNet(async (calls) => ({ r: await weeklyHealth(extra) as any, calls }), mode);
  } finally { restore(); done(); Object.assign(CONFIG, savedCfg); Deno.env.delete('LEADERS_CERT_SIGNING_KEY'); }
}

Deno.test('تقرير الأسبوع: كل شيء على ما يرام وسلاك يعمل: سطر في سلاك ولا بريد', async () => {
  const { r, calls } = await weekly('ok', 0);
  assertEquals([r.issues, r.slack, r.email, r.sent], [0, true, false, true]);
  assertEquals(resend(calls).length, 0);
  assert(calls.some((c) => c.url.startsWith('https://slack.com/api/') && String(c.body.text).includes('📋 تقرير الأسبوع: كل شيء على ما يرام')));
});

Deno.test('تقرير الأسبوع: كل شيء على ما يرام وسلاك فشل أو غير مضبوط: البريد بدله', async () => {
  for (const state of ['failed', 'unconfigured'] as const) {
    const { r, calls } = await weekly(state, 0);
    assertEquals([r.issues, r.slack, r.email], [0, false, true], state);
    assertEquals(resend(calls).map((c) => c.body.subject), ['تقرير الأسبوع: كل شيء على ما يرام'], state);
  }
});

Deno.test('تقرير الأسبوع: ما يحتاج تدخلًا بريد وسلاك معًا', async () => {
  const { r, calls } = await weekly('ok', 2);
  assertEquals([r.issues, r.slack, r.email], [1, true, true]);
  assertEquals(resend(calls).map((c) => c.body.subject), ['تقرير الأسبوع: 1 يحتاج تدخلك']);
});

// تصور المرحلة 2، 2.3: انتهاء مهلة الراعي يصل المدير في ملخصه الأسبوعي أمرًا يحتاج تدخله، من عدّ تشغيلة التذكير نفسها
Deno.test('تقرير الأسبوع: وثائق انتهت مهلة راعيها أمر يحتاج تدخلًا بريدًا وسلاك', async () => {
  const { r, calls } = await weekly('ok', 0, { sponsorExpired: 2 });
  assertEquals([r.issues, r.email], [1, true]);
  const html = String(resend(calls)[0]?.body?.html || '');
  assert(html.includes('2 وثيقة انتهت مهلة راعيها'), 'السطر في البريد');
});

Deno.test('سطر تقرير الأسبوع: أعداد وأمور مختصرة بلا بريد ولا ستة أرقام، وفي حد سلاك', () => {
  const line = weeklyLine(['ترحيل حاجب لم يُطبَّق: 20261116190000_x.sql', 'رمز 123456 في نص', 'ثالث', 'رابع لا يظهر'], [['مسجلون جدد', '3'], ['نشطون', '5']]);
  assert(line.startsWith('📋 تقرير الأسبوع: 4 يحتاج تدخلك'));
  assert(line.includes('مسجلون جدد: 3 · نشطون: 5'));
  assert(line.includes('20261116190000_x.sql'));
  assert(!/(?<![A-Za-z0-9_])\d{6}(?![A-Za-z0-9_])/.test(line));
  assert(!line.includes('رابع'));
  assert(!/@/.test(line));
  assert(line.length <= 600);
});

Deno.test('طلب استعادة الوصول بنوع alert للمالك وللطالب، فلا تحجبه حصة الإشعارات', async () => {
  const src = await Deno.readTextFile(new URL('../admin-api/index.ts', import.meta.url));
  const block = src.slice(src.indexOf('if (action === "recovery-request")'), src.indexOf('return reply;\n    }', src.indexOf('if (action === "recovery-request")')));
  assertEquals((block.match(/\}\), "alert"\);/g) || []).length, 2);
  assert(!/sendEmail\([^;]*\)\);\n/.test(block.replace(/\}\), "alert"\);/g, '')));
});

// المرحلة 4: ما حفظه المالك في قسم «التوجيه» يحكم raiseAlert نفسه، لا الافتراضي وحده
Deno.test('التوجيه: صف محفوظ يضيف البريد إلى تنبيه مهم وسلاك يعمل، وصف حرج غير مقفل يُطفأ بريده', async () => {
  const NS = await import('../_shared/notify-settings.ts');
  NS.resetNotifySettings();
  const mode = env('ok');
  const stored = { preset: 'balanced', rows: { seat_check_unavailable: { email: true, slack: true, digest: false }, cert_key_missing: { email: false, slack: true, digest: false } } };
  const restore = install((table) => (table === 'app_settings' ? { data: { value: stored }, error: null } : { data: [], count: 0, error: null }));
  try {
    await withNet(async (calls) => {
      const r = await raiseAlert('seat_check_unavailable', { note: 'x' }, { key: `t${seq++}` });
      assertEquals([r.email, !!r.slack], [true, true]);
      assertEquals(alertMails(calls).length, 1);
    }, mode);
    await withNet(async (calls) => {
      // cert_key_missing حرج غير مقفل: الصف المحفوظ يطفئ بريده فيصل سلاك وحده
      const r = await raiseAlert('cert_key_missing', { note: 'x' }, { key: `t${seq++}` });
      assertEquals([r.email, !!r.slack], [false, true]);
      assertEquals(alertMails(calls).length, 0);
    }, mode);
  } finally { restore(); done(); NS.resetNotifySettings(); }
});
