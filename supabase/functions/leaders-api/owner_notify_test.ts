// مركز الإشعارات، المرحلة 3 (التصور 2026-11-16، البنود 25 إلى 32 و6.3 و6.6): إشعارات المالك التشغيلية بجدول التوجيه،
// والملخص اليومي (9:00 بالرياض، لا يُنشر فارغًا، وبريد واحد بدله إن لم يصل Slack)، ونقل مفتاح دفعة المالك بقراءته الاحتياطية،
// واختبار الخصوصية: لا بريد غير مقنّع ولا رمز من ستة أرقام ولا اسم من بيانات الاختبار في أي حمولة Slack.
// قاعدة في الذاكرة وشبكة محاكاة، فلا يخرج طلب حقيقي.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';
const S = await import('../_shared/slack.ts');
const { CONFIG, db, publicDb, resetSlackDown } = await import('./core.ts');
const N = await import('./notify.ts');
const DG = await import('./digest.ts');
const E = await import('./experts.ts');
const R = await import('./sponsor.ts');
const NS = await import('../_shared/notify-settings.ts');
const { contactLine } = await import('../_shared/contact.ts');
const { SLACK_DOWN_SUBJECT, DIGEST_SUBJECT, route } = await import('../_shared/notify-routing.js');

type Row = Record<string, any>;
// المسار jsonb (meta->>device) يُقرأ من الحقل المتداخل كما في PostgREST
const val = (r: Row, c: string) => c.includes('->>') ? (() => { const [a, b] = c.split('->>'); return r[a]?.[b] == null ? undefined : String(r[a][b]); })() : r[c];
function fakeFrom(tables: Record<string, Row[]>, fail: Set<string>) {
  let seq = 0;
  return (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const run = () => {
      if (fail.has(table)) return { data: null, error: { code: 'XX000', message: `${table} unavailable` } };
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...x }));
        if (table === 'slack_threads' && added.some((a) => rows.some((r) => r.day === a.day && r.category === a.category))) return { data: null, error: { code: '23505', message: 'dup' } };
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out0 = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out0) Object.assign(r, payload); return { data: out0, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out0.includes(r)); return { data: null, error: null }; }
      if (head) return { data: null, count: out0.length, error: null };
      let out = out0;
      for (const [k, asc] of [...orders].reverse()) out = [...out].sort((a, b) => (asc ? 1 : -1) * String(a[k]).localeCompare(String(b[k])));
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: any) => { if (o?.head) head = true; return q; },
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      upsert: (x: any) => { mode = 'insert'; payload = x; return q; },
      delete: () => { mode = 'delete'; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => val(r, c) === v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      not: () => q,
      order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return q; },
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
}
function install(tables: Record<string, Row[]>, fail = new Set<string>()) {
  const from = fakeFrom(tables, fail);
  const real = { from: (db as any).from, schema: (db as any).schema, pub: (publicDb as any).from };
  Object.assign(db as any, { from, schema: () => ({ from }) });
  (publicDb as any).from = from;
  S.slackUse(db);
  return () => { Object.assign(db as any, { from: real.from, schema: real.schema }); (publicDb as any).from = real.pub; };
}

type Call = { url: string; body: any };
const HUMAN = 'human-token-0123456789';
async function withNet<T>(fn: (calls: Call[]) => Promise<T>, { slack = 'ok' }: { slack?: 'ok' | 'error' } = {}) {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  let n = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('turnstile')) return new Response(JSON.stringify({ success: (init?.body as FormData).get('response') === HUMAN }));
    calls.push({ url: u, body: init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null });
    if (u.includes('resend.com')) return new Response('{"id":"re_1"}', { status: 200 });
    if (u.startsWith('https://slack.com/api/')) {
      if (slack === 'error') return new Response('{"ok":false,"error":"invalid_auth"}', { status: 200 });
      n += 1;
      return new Response(JSON.stringify({ ok: true, ts: `17100.${n}` }), { status: 200 });
    }
    return new Response('ok', { status: 200 });
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const resend = (calls: Call[]) => calls.filter((c) => c.url.includes('resend.com'));
const slackTexts = (calls: Call[]) => calls.filter((c) => c.url.startsWith('https://slack.com/api/')).map((c) => String(c.body?.text ?? ''));
const ownMail = (calls: Call[]) => resend(calls).filter((c) => c.body.subject !== SLACK_DOWN_SUBJECT);
const downMail = (calls: Call[]) => resend(calls).filter((c) => c.body.subject === SLACK_DOWN_SUBJECT);

const saved = { alertEmail: CONFIG.alertEmail, resendKey: CONFIG.resendKey, ts: CONFIG.turnstileSecret, site: CONFIG.turnstileSite };
type State = 'ok' | 'failed' | 'unconfigured';
function env(state: State) {
  S.resetSlack(); resetSlackDown(); NS.resetNotifySettings(); DG.resetDigest();
  Object.assign(S.SLACK, { gapMs: 0, claimWaitMs: 1, claimTries: 2 });
  Object.assign(CONFIG, { alertEmail: 'owner@x.sa', resendKey: 're_test', turnstileSecret: 'ts-secret', turnstileSite: 'ts-site' });
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
  if (state === 'unconfigured') { Deno.env.delete('LEADERS_SLACK_BOT_TOKEN'); Deno.env.delete('LEADERS_SLACK_CHANNEL'); }
  else { Deno.env.set('LEADERS_SLACK_BOT_TOKEN', 'xoxb-test'); Deno.env.set('LEADERS_SLACK_CHANNEL', 'C0TEST'); }
  return { slack: state === 'failed' ? 'error' as const : 'ok' as const };
}
function done() {
  S.resetSlack(); resetSlackDown(); NS.resetNotifySettings(); DG.resetDigest();
  Object.assign(CONFIG, { alertEmail: saved.alertEmail, resendKey: saved.resendKey, turnstileSecret: saved.ts, turnstileSite: saved.site });
  Deno.env.delete('LEADERS_SLACK_BOT_TOKEN'); Deno.env.delete('LEADERS_SLACK_CHANNEL');
}
const world = (): Record<string, Row[]> => ({ audit_log: [], mail_events: [], mail_queue: [], slack_threads: [], app_settings: [], sponsor_requests: [], experts: [], admin_audit_log: [] });

// ── إشعار المالك بجدول التوجيه ──
const MAIL = { subject: 'طلب رعاية: سارة الحربي · شركة النخبة', html: '<p>سارة الحربي</p>' };
const expect: Record<State, { email: number; down: number; slack: boolean }> = {
  ok: { email: 0, down: 0, slack: true },
  failed: { email: 1, down: 1, slack: false },
  unconfigured: { email: 1, down: 0, slack: false },
};
for (const state of ['ok', 'failed', 'unconfigured'] as State[]) {
  Deno.test(`إشعار مهم (طلب رعاية) وسلاك ${state}: Slack أولًا والبريد احتياط، وسطر السجل بلا اسم`, async () => {
    const mode = env(state);
    const tables = world();
    const restore = install(tables);
    try {
      await withNet(async (calls) => {
        const r = await N.ownerNotice('sponsor_request', { line: '🤝 طلب رعاية جديد', mail: MAIL, ref: 'sponsor_request:1' });
        assertEquals([ownMail(calls).length, downMail(calls).length, r.slack], [expect[state].email, expect[state].down, expect[state].slack]);
        assertEquals(r.digest, true);
        const log = tables.audit_log.filter((x) => x.action === N.NOTICE_ACTION);
        assertEquals(log.map((x) => [x.entity_id, x.after.ref]), [['sponsor_request', 'sponsor_request:1']]);
        assert(!JSON.stringify(log).includes('سارة'));
      }, mode);
    } finally { restore(); done(); }
  });
}

Deno.test('إشعار معلوماتي (خبير استكمل ملفه): لا سطر فوري ولا بريد في «متوازن»، ويُعدّ للملخص', async () => {
  const mode = env('ok');
  const tables = world();
  const restore = install(tables);
  try {
    await withNet(async (calls) => {
      const r = await N.ownerNotice('expert_profile_done', { line: '✅ خبير مدعو استكمل ملفه', mail: MAIL });
      assertEquals([r.slack, r.email, r.digest, calls.length], [false, false, true, 0]);
      assertEquals(tables.audit_log.map((x) => x.entity_id), ['expert_profile_done']);
    }, mode);
  } finally { restore(); done(); }
});

Deno.test('طلب التواصل حرج: بريد وSlack معًا، وسطره بالصفحة من القائمة الثابتة وحدها', () => {
  const r = route('contact_request');
  assertEquals([r.email, r.slack], [true, true]);
  assert(contactLine('MI-LEADERS').startsWith('📬 طلب تواصل جديد · صفحة برنامج القادة'));
  // المنتج من جسم الطلب لا يدخل السطر كما كُتب
  assert(!contactLine('sara@corp.sa 123456').includes('sara'));
});

// ── مفتاح دفعة المالك: صف المركز، وإلا القيمة القديمة ──
Deno.test('دفعة المالك: «مغلق» القديم سطر Slack والملخص بلا بريد، و«مفتوح» يبقي البريد، وصف المركز يغلب القديم', () => {
  const base = NS.withPaymentFallback({ preset: 'balanced', rows: {} }, false);
  assertEquals([route('payment_new', base, 'ok').email, route('payment_new', base, 'ok').slack, route('payment_new', base, 'ok').digest], [false, true, true]);
  const legacy = NS.withPaymentFallback({ preset: 'balanced', rows: {} }, true);
  assertEquals([route('payment_new', legacy, 'ok').email, route('payment_refund', legacy, 'ok').email, route('payment_new', legacy, 'ok').slack], [true, true, true]);
  const stored = NS.withPaymentFallback({ preset: 'balanced', rows: { payment_new: { email: false, slack: true, digest: false } } }, true);
  assertEquals([route('payment_new', stored, 'ok').email, route('payment_new', stored, 'ok').digest, route('payment_refund', stored, 'ok').email], [false, false, true]);
});

Deno.test('إعداد المركز المخزن: يُقرأ من app_settings، ويبقى آخر ما قُرئ عند تعذر عابر، وغيابه «متوازن»', async () => {
  NS.resetNotifySettings();
  const tables = world();
  const fail = new Set<string>();
  const restore = install(tables, fail);
  try {
    assertEquals(await NS.notifySettings(db), { preset: 'balanced', rows: {} });
    NS.resetNotifySettings();
    tables.app_settings.push({ key: 'notifications', value: { preset: 'all', rows: { sponsor_request: { email: true }, unknown_row: { email: true } } } });
    const s = await NS.notifySettings(db);
    assertEquals(s, { preset: 'all', rows: { sponsor_request: { email: true, slack: false, digest: false } } });
    // تعذّر عابر بعد قراءة ناجحة: القيم الأخيرة لا الافتراضي (الذاكرة منتهية، فالقراءة تُعاد وتفشل)
    fail.add('app_settings');
    NS.expireNotifySettings();
    assertEquals((await NS.notifySettings(db)).preset, 'all');
    NS.resetNotifySettings();
    assertEquals((await NS.notifySettings(db)).preset, 'balanced', 'بلا قراءة سابقة: الافتراضي');
  } finally { restore(); NS.resetNotifySettings(); }
});

// ── الملخص اليومي ──
const at = (riyadhHour: number) => Date.parse('2026-11-17T00:00:00Z') + (riyadhHour - 3) * 36e5;
function seeded(tables: Record<string, Row[]>, since: number) {
  const t = new Date(since + 60e3).toISOString();
  tables.audit_log.push(
    { action: 'system.notify', entity_id: 'expert_application', created_at: t },
    { action: 'system.notify', entity_id: 'expert_application', created_at: t },
    { action: 'system.notify', entity_id: 'sponsor_request', created_at: t },
    { action: 'system.notify', entity_id: 'matrix_plan', created_at: t },
    // حرج لا يدخل الملخص، ومهم بلا وسم الملخص كذلك
    { action: 'system.notify', entity_id: 'contact_request', created_at: t },
    { action: 'system.notify', entity_id: 'expert_no_match', created_at: t },
    { action: 'system.alert', entity_id: 'booking_not_eligible:b1', created_at: t },
    { action: 'system.alert', entity_id: 'internal', created_at: t },
  );
  tables.admin_audit_log.push(
    { action: 'login', meta: { device: 'known', method: 'passkey' }, created_at: t },
    { action: 'login', meta: { device: 'new', method: 'otp' }, created_at: t },
  );
}

Deno.test('الملخص: لا شيء قبل 9:00 بالرياض، ثم سطر واحد في سلسلة «الملخص اليومي» بالأعداد، ولا يتكرر في اليوم', async () => {
  const mode = env('ok');
  const tables = world();
  seeded(tables, at(9) - 864e5);
  const restore = install(tables);
  try {
    await withNet(async (calls) => {
      assertEquals(await DG.dailyDigest(at(8)), { due: false });
      assertEquals(calls.length, 0);
      const r = await DG.dailyDigest(at(9));
      assertEquals([r.posted, r.slack, r.email], [true, true, false]);
      const texts = slackTexts(calls);
      assertEquals(texts.length, 2, 'رسالة الأم ثم الملخص ردًا فيها');
      assert(texts[0].includes('الملخص اليومي'));
      const body = texts[1];
      for (const l of ['طلب انضمام خبير أو عضوية لجنة: 2', 'طلب رعاية: 1', 'خطة مقدمة في مصفوفة التأثير: 1', 'حجز من غير مؤهل: 1', 'دخول المالك من جهاز معروف: 1']) assert(body.includes(l), l);
      for (const l of ['طلب تواصل', 'لا خبير متاح', 'خطأ داخلي']) assert(!body.includes(l), l);
      assertEquals(tables.slack_threads.map((x) => x.category), ['digest']);
      assertEquals(tables.audit_log.filter((x) => x.action === DG.DIGEST_ACTION).map((x) => x.entity_id), ['2026-11-17']);
      // الساعة التالية في اليوم نفسه، ونسخة أخرى بلا ذاكرة: العلامة في السجل تمنع التكرار
      DG.resetDigest();
      assertEquals(await DG.dailyDigest(at(10)), { due: false });
      assertEquals(slackTexts(calls).length, 2);
      assertEquals(resend(calls).length, 0);
    }, mode);
  } finally { restore(); done(); }
});

Deno.test('الملخص فارغ: لا يُنشر ولا بريد، ويُعلَّم اليوم', async () => {
  const mode = env('ok');
  const tables = world();
  const restore = install(tables);
  try {
    await withNet(async (calls) => {
      assertEquals(await DG.dailyDigest(at(9)), { due: true, posted: false, empty: true });
      assertEquals(calls.length, 0);
      assertEquals(tables.audit_log.filter((x) => x.action === DG.DIGEST_ACTION).length, 1);
    }, mode);
  } finally { restore(); done(); }
});

for (const state of ['failed', 'unconfigured'] as State[]) {
  Deno.test(`الملخص وسلاك ${state}: بريد واحد بدله، ولا بريد ثانٍ في اليوم`, async () => {
    const mode = env(state);
    const tables = world();
    seeded(tables, at(9) - 864e5);
    const restore = install(tables);
    try {
      await withNet(async (calls) => {
        const r = await DG.dailyDigest(at(9));
        assertEquals([r.slack, r.email], [false, true]);
        assertEquals(resend(calls).map((c) => c.body.subject), [DIGEST_SUBJECT]);
        DG.resetDigest();
        await DG.dailyDigest(at(11));
        await DG.dailyDigest(at(15));
        assertEquals(resend(calls).length, 1);
      }, mode);
    } finally { restore(); done(); }
  });
}

Deno.test('الملخص: مصدر تعذرت قراءته لا يُعلَّم اليوم، فيُعاد في الساعة التالية', async () => {
  const mode = env('ok');
  const tables = world();
  seeded(tables, at(10) - 864e5);
  const fail = new Set(['admin_audit_log']);
  const restore = install(tables, fail);
  try {
    await withNet(async (calls) => {
      const r = await DG.dailyDigest(at(9));
      assert(r.error);
      assertEquals(calls.length, 0);
      fail.clear();
      assertEquals((await DG.dailyDigest(at(10))).posted, true);
    }, mode);
  } finally { restore(); done(); }
});

// ── الخصوصية (التصور 6.6 و10.2): كل حمولة Slack من المسارات الحقيقية بإعداد «كل شيء» (كل حدث سطر فوري) ──
const EMAIL_PLAIN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const leaks = (text: string) => {
  const out: string[] = [];
  for (const m of text.match(EMAIL_PLAIN) ?? []) if (!/^[^@]{0,3}\*\*\*@/.test(m)) out.push(`بريد غير مقنّع: ${m}`);
  if (/(?<![A-Za-z0-9_])\d{6}(?![A-Za-z0-9_])/.test(text)) out.push('رمز من ستة أرقام');
  for (const name of ['سارة', 'الحربي', 'النخبة', 'هند']) if (text.includes(name)) out.push(`اسم: ${name}`);
  return out;
};
Deno.test('الخصوصية: لا بريد غير مقنّع ولا رمز من ستة أرقام ولا اسم في أي حمولة Slack من إشعارات المالك والملخص', async () => {
  const mode = env('ok');
  const tables = world();
  tables.app_settings.push({ key: 'notifications', value: { preset: 'all' } });
  tables.experts.push({ id: 'ex1', email: 'hind.expert@corp.sa', status: 'invited', source: 'admin' });
  const restore = install(tables);
  try {
    await withNet(async (calls) => {
      const p = { id: 'p1', full_name: 'سارة الحربي', email: 'sara.harbi@corp.sa', organization_id: null };
      await R.request(p, { typed_name: 'شركة النخبة 482913 sara.harbi@corp.sa', contact_email: 'boss@corp.sa' });
      await E.apply({ email: 'hind.apply@corp.sa', full_name: 'هند الحربي', title: 'مستشارة 551234', roles: ['advisor'], dimensions: ['leadership'], captcha: HUMAN,
        bio: 'خبرة خمسة عشر عامًا في قيادة محافظ المشاريع الحكومية وتحويلها إلى أثر قابل للقياس، وتدريب القادة في الجهات.' }, { ip: '10.0.0.1' });
      await E.portalProfileSave(tables.experts[0], { full_name: 'هند الحربي', title: 'خبيرة 551234', roles: ['advisor'], dimensions: ['leadership'],
        bio: 'خبرة خمسة عشر عامًا في قيادة محافظ المشاريع الحكومية وتحويلها إلى أثر قابل للقياس، وتدريب القادة في الجهات.' });
      // سطر مكتوب بخطأ يحمل بريدًا ورمزًا: noticeLine تطمسهما قبل النشر
      await N.ownerNotice('payment_new', { line: '💳 دفعة جديدة · sara.harbi@corp.sa · 123456', mail: null });
      await N.noticesIdle();
      seeded(tables, at(9) - 864e5);
      await DG.dailyDigest(at(9));
      await S.slackIdle();
      const texts = slackTexts(calls);
      assert(texts.length >= 5, `حمولات Slack: ${texts.length}`);
      for (const k of ['طلب رعاية جديد', 'طلب انضمام خبير جديد', 'خبير مدعو استكمل ملفه', 'دفعة جديدة']) assert(texts.some((t) => t.includes(k)), k);
      const found = texts.flatMap((t) => leaks(t).map((x) => `${x} في: ${t.slice(0, 80)}`));
      assertEquals(found, []);
      // البريد (و«كل شيء» يرسله للمهم أيضًا) يحمل الاسم في متنه: هو قناة المالك، لا Slack
      assert(ownMail(calls).some((c) => String(c.body.html).includes('سارة')));
    }, mode);
  } finally { restore(); done(); }
});

// حارس المصدر: سطر كل إشعار مالك (line) نص ثابت، لا يقرأ اسمًا ولا بريدًا ولا ما كتبه المستخدم
Deno.test('حارس المصدر: أسطر إشعارات المالك لا تقرأ الاسم ولا البريد ولا النص المكتوب', async () => {
  const files = ['experts.ts', 'sponsor.ts', 'entitlements.ts', 'payments.ts'];
  let lines = 0;
  for (const f of files) {
    const src = await Deno.readTextFile(new URL(`./${f}`, import.meta.url));
    for (const m of src.matchAll(/\bline: (`[^`]*`|'[^']*')/g)) {
      lines++;
      assert(!/full_name|\.email|typed|\.name\b|org\.name|\.title/.test(m[1]), `${f}: ${m[1]}`);
    }
    // notifyOrg يمرر السطر وسيطًا رابعًا، وكل أسطره تبدأ بـ💺
    for (const m of src.matchAll(/[`'](💺[^`']*)[`']/g)) { lines++; assert(!/org\.name|full_name|\.email/.test(m[1]), `${f}: ${m[1]}`); }
  }
  assert(lines >= 6, `أسطر: ${lines}`);
});
