// طلب انضمام الخبير مفتوح بلا حساب (server-sec-2، تدقيق 2026-11-11): كان كل طلب ببريد جديد يرسل رسالتين بلا تحقق بشري،
// فعشرون طلبًا آليًا تستنفد نصيب الإشعارات يومًا كاملًا. على قاعدة مزيفة وTurnstile وResend محاكيين: لا أثر بلا تحقق،
// والرد بلا تحقق واحد لمسجل وجديد، ولا رسالة إلى البريد المكتوب، وتنبيه المالك مرة في النافذة جماعيًا.
// ودورة طلب الرعاية وإلغائه محدودة بثلاثة في اليوم فلا تغرق المالك بالتنبيهات.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, CONFIG, Fail } = await import('./core.ts');
const E = await import('./experts.ts');
const R = await import('./sponsor.ts');

type Row = Record<string, any>;

// جداول في الذاكرة بما تستعمله الشيفرة هنا: eq وgte وnot(in) وorder وlimit وmaybeSingle وsingle والعدّ، والإدراج والتحديث،
// والقيم الافتراضية للأعمدة كما في الترحيلات
const DEFAULTS: Record<string, Row> = { sponsor_requests: { kind: 'claim', status: 'pending' } };
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: string[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${String(++seq).padStart(4, '0')}`, created_at: new Date().toISOString(), ...DEFAULTS[table], ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: out, error: null }; }
      if (head) return { data: null, count: out.length, error: null };
      for (const k of [...orders].reverse()) out = [...out].sort((a, b) => String(a[k]).localeCompare(String(b[k])));
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: any) => { if (o?.head) head = true; return q; },
      insert: (x: any) => { mode = 'insert'; payload = x; return q; },
      update: (x: any) => { mode = 'update'; payload = x; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return q; },
      not: (c: string, op: string, v: string) => { if (op === 'in') { const ks = v.replace(/[()]/g, '').split(','); filters.push((r) => !ks.includes(r[c])); } return q; },
      order: (c: string) => { orders.push(c); return q; },
      limit: (n: number) => { limit = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  const real = { from: (db as any).from, schema: (db as any).schema };
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return () => Object.assign(db as any, real);
}

const HUMAN = 'human-token-0123456789';
// Turnstile يقبل HUMAN وحده، وResend يسجّل كل رسالة (إلى من وبأي عنوان)
async function withServices<T>(fn: (mail: { to: string; subject: string }[], checks: string[]) => Promise<T>) {
  const real = globalThis.fetch;
  const mail: { to: string; subject: string }[] = [];
  const checks: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('turnstile')) {
      const token = (init?.body as FormData).get('response');
      checks.push(String(token));
      return new Response(JSON.stringify({ success: token === HUMAN }));
    }
    if (u.includes('resend.com')) {
      const b = JSON.parse(String(init?.body));
      mail.push({ to: b.to[0], subject: b.subject });
      return new Response(JSON.stringify({ id: `re_${mail.length}` }));
    }
    return new Response('ok');
  }) as typeof fetch;
  try { return await fn(mail, checks); } finally { globalThis.fetch = real; }
}

const saved = { secret: CONFIG.turnstileSecret, site: CONFIG.turnstileSite, resend: CONFIG.resendKey, alert: CONFIG.alertEmail };
function configure() {
  Object.assign(CONFIG, { turnstileSecret: 'ts-secret', turnstileSite: 'ts-site', resendKey: 're_key', alertEmail: 'owner@example.com' });
  return () => Object.assign(CONFIG, { turnstileSecret: saved.secret, turnstileSite: saved.site, resendKey: saved.resend, alertEmail: saved.alert });
}

const form = (email: string, extra: Row = {}) => ({
  email, full_name: 'سارة الحربي', title: 'مستشارة محافظ', roles: ['advisor'], dimensions: ['leadership'],
  bio: 'خبرة خمسة عشر عامًا في قيادة محافظ المشاريع الحكومية وتحويلها إلى أثر قابل للقياس، وتدريب القادة في الجهات.', ...extra,
});

Deno.test('بلا تحقق بشري: لا ملف ولا رسالة، والرد نفسه لبريد مسجل وجديد', async () => {
  const unconfig = configure();
  const tables: Record<string, Row[]> = { experts: [{ id: 'old', email: 'known@example.com', source: 'application', created_at: '2026-01-01T00:00:00.000Z' }], audit_log: [], mail_events: [] };
  const restore = install(tables);
  try {
    await withServices(async (mail) => {
      for (const email of ['new@example.com', 'known@example.com']) {
        const e = await assertRejects(() => E.apply(form(email), { ip: '10.0.0.1' }), Fail);
        assertEquals([e.code, e.status, e.extra.site_key], ['captcha', 400, 'ts-site'], email);
      }
      const bad = await assertRejects(() => E.apply(form('new@example.com', { captcha: 'robot-token-0123456789' }), { ip: '10.0.0.1' }), Fail);
      assertEquals(bad.code, 'captcha');
      assertEquals(tables.experts.length, 1);
      assertEquals(tables.audit_log.length, 0);
      assertEquals(mail, []);
    });
  } finally { restore(); unconfig(); }
});

Deno.test('بعد التحقق: يُحفظ الطلب، ولا رسالة إلى البريد المكتوب، والمالك يُنبَّه مرة واحدة في النافذة جماعيًا', async () => {
  const unconfig = configure();
  const tables: Record<string, Row[]> = { experts: [], audit_log: [], mail_events: [], mail_queue: [] };
  const restore = install(tables);
  try {
    await withServices(async (mail, checks) => {
      // عشرون طلبًا من شبكات مختلفة، كما في محاكاة التدقيق: كانت أربعين رسالة تستنفد نصيب الإشعارات (40 من 80)
      for (let i = 0; i < 20; i++) {
        assertEquals(await E.apply(form(`x${i}@attacker.test`, { captcha: HUMAN }), { ip: `10.0.${i}.1` }), { success: true, received: true });
      }
      assertEquals(checks.length, 20);
      assertEquals(tables.experts.length, 20);
      assert(tables.experts.every((r) => r.status === 'applied' && r.source === 'application'));
      assertEquals(mail.filter((m) => m.to !== 'owner@example.com'), [], 'لا رسالة إلى عنوان لم تثبت ملكيته');
      assertEquals(mail, [{ to: 'owner@example.com', subject: 'طلب انضمام خبير: سارة الحربي' }]);
      assertEquals(tables.mail_events.map((r) => [r.kind, r.status]), [['bulk', 'sent']]);
      // بريد مسجل بعد التحقق: الرد نفسه، ولا ملف ثانٍ ولا رسالة
      assertEquals(await E.apply(form('x0@attacker.test', { captcha: HUMAN }), { ip: '10.9.9.9' }), { success: true, received: true });
      assertEquals(tables.experts.length, 20);
      assertEquals(mail.length, 1);
    });
  } finally { restore(); unconfig(); }
});

Deno.test('طلب جديد في نافذة لاحقة ينبّه المالك من جديد', async () => {
  const unconfig = configure();
  const before = new Date(Date.now() - E.APPLY_ALERT_HOURS * 36e5 - 1000).toISOString();
  const tables: Record<string, Row[]> = { experts: [{ id: 'prev', email: 'prev@example.com', source: 'application', created_at: before }], audit_log: [], mail_events: [] };
  const restore = install(tables);
  try {
    await withServices(async (mail) => {
      await E.apply(form('later@example.com', { captcha: HUMAN }), { ip: '10.1.1.1' });
      assertEquals(mail.map((m) => m.to), ['owner@example.com']);
    });
  } finally { restore(); unconfig(); }
});

Deno.test('بلا مفتاحي Turnstile: الطلب متوقف برسالة تخصه لا برسالة الدخول', async () => {
  const unconfig = configure();
  Object.assign(CONFIG, { turnstileSecret: '' });
  const tables: Record<string, Row[]> = { experts: [], audit_log: [], mail_events: [] };
  const restore = install(tables);
  try {
    await withServices(async (mail) => {
      const e = await assertRejects(() => E.apply(form('new@example.com', { captcha: HUMAN }), { ip: '10.0.0.1' }), Fail);
      assertEquals([e.code, e.status, e.message], ['captcha_unconfigured', 503, 'استقبال طلبات الانضمام متوقف مؤقتًا، حاول بعد قليل']);
      assertEquals(tables.experts.length, 0);
      assertEquals(mail, []);
    });
  } finally { restore(); unconfig(); }
});

Deno.test('دورة طلب الرعاية وإلغائه: ثلاثة طلبات في اليوم، والرابع يُرفض بلا تنبيه', async () => {
  const unconfig = configure();
  const tables: Record<string, Row[]> = { sponsor_requests: [], audit_log: [], mail_events: [] };
  const restore = install(tables);
  const p = { id: 'p1', full_name: 'عمر', email: 'omar@example.com', organization_id: null };
  try {
    await withServices(async (mail) => {
      for (let i = 0; i < R.SPONSOR_REQUESTS_PER_DAY; i++) {
        assertEquals((await R.request(p, { typed_name: `جهة ${i}` })).success, true);
        await R.cancel(p);
      }
      // طلب مقاعد فتحه الخادم لا يُحتسب على المشارك
      tables.sponsor_requests.push({ id: 'seat', participant_id: 'p1', kind: 'seats', status: 'approved', created_at: new Date().toISOString() });
      const e = await assertRejects(() => R.request(p, { typed_name: 'جهة رابعة' }), Fail);
      assertEquals([e.code, e.status], ['rate', 429]);
      await new Promise((r) => setTimeout(r, 20));   // تنبيه الطلب يُرسل بلا انتظار
      assertEquals(mail.length, R.SPONSOR_REQUESTS_PER_DAY);
      assertEquals(tables.sponsor_requests.filter((r) => r.kind === 'claim').length, R.SPONSOR_REQUESTS_PER_DAY);
    });
  } finally { restore(); unconfig(); }
});
