// روابط تجربة حساب العرض (تصور 2026-11-19): رابط باسم مستلمه يفتح جلسة مشارك لحساب العرض بلا رمز بريد. على الموجّه الحقيقي
// (index.ts) بقاعدة في الذاكرة: الإنشاء والفتح والانتهاء والإلغاء والرمز الخاطئ وحد المعدل، وأن الرابط وجلسته لا يبلغان فعل
// إدارة ولا فعلًا مغلقًا على حساب العرض، وأن جلسة المدير وجلسات الروابط لا تبطل إحداها الأخرى، وأن تعذّر القاعدة خطأ صريح لا قائمة فارغة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, publicDb, hash, CONFIG, Fail } = await import('./core.ts');
const { ACTION_GATES } = (await import('./index.ts')) as any;
const D = await import('./demo.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { cleanDemoLinkInput, DEMO_LINK_DAYS, DEMO_LINK_DEFAULT_DAYS, DEMO_LINK_LIMITS, DEMO_LINK_MAX_ACTIVE, demoLinkState, demoLinkUrl } = await import('./demo-links.js');
const { NO_REPLAY, isAuthAction, isReadAction } = await import('../_shared/action-kinds.js');

type Row = Record<string, any>;
type FailHook = (table: string, mode: string, info: { cols: string; payload: any; filters: string[] }) => { code: string; message: string } | null;

// جداول في الذاكرة بنمط program_gate_test.ts، ومعها gt وgte وlt على الأعمدة المباشرة (انتهاء الرابط وحد المعدل)، وfail لمحاكاة
// تعذّر القاعدة. مرشحات الجداول المضمّنة والترتيب لا تغيّر النتيجة هنا
function install(tables: Record<string, Row[]>, fail: FailHook = () => null) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const named: string[] = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null, cols = '*';
    let head = false, single = false, limit = Infinity;
    const plain = (c: string) => !/[.>]/.test(c);
    const run = () => {
      const err = fail(table, mode, { cols, payload, filters: named });
      if (err) return { data: null, error: err, count: null };
      const rows = tables[table] ||= [];
      if (mode === 'insert' || mode === 'upsert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: crypto.randomUUID(), created_at: new Date(Date.now() + ++seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') {
        tables[table] = rows.filter((r) => !out.includes(r));
        // حذف المشارك يحذف جلساته (on delete cascade)
        if (table === 'participants') tables.auth_sessions = (tables.auth_sessions || []).filter((s) => !out.some((p) => p.id === s.participant_id));
        return { data: out, error: null };
      }
      if (head) return { data: null, count: out.length, error: null };
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const cmp = (op: (a: string, b: string) => boolean) => (c: string, v: unknown) => { named.push(c); if (plain(c)) filters.push((r) => r[c] != null && op(String(r[c]), String(v))); return q; };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (c?: string, o?: any) => { if (mode === 'select') cols = c || '*'; if (o?.head) head = true; return q; };
        if (k === 'insert' || k === 'update' || k === 'upsert') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { named.push(c); if (plain(c)) filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { if (plain(c)) filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { if (plain(c)) filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { named.push(c); if (plain(c)) filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (plain(c) && op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        if (k === 'gt') return cmp((a, b) => a > b);
        if (k === 'gte') return cmp((a, b) => a >= b);
        if (k === 'lt') return cmp((a, b) => a < b);
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from, rpc: (db as any).rpc, schema: (db as any).schema };
  Object.assign(db as any, { from, rpc: () => Promise.resolve({ data: null, error: null }), schema: () => ({ from }) });
  // جلسات الإدارة في المخطط العام (api_sessions): القاعدة المزيفة نفسها، فلا يخرج طلب، ولا جلسة إدارة فيها أصلًا
  const pub = (publicDb as any).from;
  (publicDb as any).from = from;
  resetSettingsCache();
  return { tables, restore: () => { Object.assign(db as any, prev); (publicDb as any).from = pub; resetSettingsCache(); } };
}

const ADMIN: any = { email: 'admin@example.sa', role: 'admin', id: 'a1' };
const CTX = { ip: '203.0.113.7', ua: 'test-agent' };
const DEMO_EMAIL = 'demo@demo.milestone-impact.org';
const REAL = { id: '00000000-0000-4000-8000-000000000901', full_name: 'مشاركة حقيقية', email: 'real@example.sa', is_demo: false, is_test: false, status: 'enrolled', organization_id: null };

function world(fail?: FailHook) {
  const f = install({
    participants: [{ ...REAL }], auth_sessions: [], demo_links: [], audit_log: [], certificates: [],
    payment_settings: [{ id: true, enabled: false }], programs: [{ id: 'prog', is_default: true, name: 'البرنامج', katon_points: null, final_eval: null }],
    cohorts: [], enrollments: [], placements: [], entitlements: [], journey_stages: [], stage_requirements: [], app_settings: [], organizations: [],
  }, fail);
  const call = async (action: string, body: Row = {}, ip = CTX.ip) => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test', 'x-forwarded-for': ip },
      body: JSON.stringify({ action, ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  const tokenOf = (url: string) => url.split('#try=')[1];
  const create = async (label = 'مدير الدفعة', days?: number) => { const r: any = await D.linkCreate(ADMIN, { label, days }); return { ...r, t: tokenOf(r.url) }; };
  return { ...f, call, create, tokenOf };
}
const code = async (fn: () => Promise<unknown>) => { const e = (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>; return [e.status, e.code]; };

Deno.test('المدخلات: الاسم وصف يكتبه المدير بلا بريد ولا جوال، والمدة من القائمة و7 أيام افتراضًا', () => {
  assertEquals(cleanDemoLinkInput({ label: '  مدير   الدفعة ' }), { label: 'مدير الدفعة', days: DEMO_LINK_DEFAULT_DAYS });
  assertEquals(DEMO_LINK_DEFAULT_DAYS, 7);
  for (const d of DEMO_LINK_DAYS) assertEquals(cleanDemoLinkInput({ label: 'مسؤول الجهة', days: d }).days, d);
  for (const bad of [{ label: '' }, { label: 'م' }, { label: 'sara@example.sa' }, { label: 'سارة ٠٥٠ ١٢٣ ٤٥٦٧' }, { label: '+966 50 123 4567' }, { label: 'مسؤول', days: 5 }, { label: 'مسؤول', days: 365 }]) {
    let threw = false;
    try { cleanDemoLinkInput(bad); } catch { threw = true; }
    assert(threw, JSON.stringify(bad));
  }
  assertEquals(cleanDemoLinkInput({ label: 'x'.repeat(200) }).label.length, 80);
  // أرقام قليلة في الاسم ليست جوالًا (دفعة 2026)
  assertEquals(cleanDemoLinkInput({ label: 'مدير دفعة 2026' }).label, 'مدير دفعة 2026');
  assertEquals(demoLinkUrl('https://leaders.test/', 'abc'), 'https://leaders.test/#try=abc');
  const t = Date.parse('2026-11-19T10:00:00Z');
  assertEquals([demoLinkState({ expires_at: '2026-11-20T10:00:00Z' }, t), demoLinkState({ expires_at: '2026-11-19T10:00:00Z' }, t), demoLinkState({ expires_at: '2026-11-20T10:00:00Z', revoked_at: '2026-11-19T09:00:00Z' }, t)], ['active', 'expired', 'revoked']);
});

Deno.test('الإنشاء: الرمز يُعرض مرة في الرابط ولا يُحفظ إلا بصمته، وكل إنشاء في السجل، والقائمة بلا رمز ولا بصمة', async () => {
  const w = world();
  try {
    const r = await w.create('  مدير   الدفعة ', 14);
    assert(/^https:\/\/[^#]+\/#try=[A-Za-z0-9_-]{40,}$/.test(r.url), r.url);
    const row = w.tables.demo_links[0];
    assertEquals([row.label, row.created_by, row.token_hash, row.token_hash.length], ['مدير الدفعة', ADMIN.email, await hash(r.t), 64]);
    assert(!JSON.stringify(w.tables).includes(r.t), 'الرمز نفسه لا يُحفظ في أي جدول');
    const days = (Date.parse(row.expires_at) - Date.now()) / 864e5;
    assert(days > 13.9 && days <= 14, String(days));
    assertEquals(w.tables.audit_log.map((x) => [x.actor_type, x.actor, x.action, x.entity, x.entity_id, x.after]), [['admin', ADMIN.email, 'demo.link-create', 'demo_links', row.id, { label: 'مدير الدفعة', days: 14 }]]);
    assertEquals(Object.keys(r.link).sort(), ['created_at', 'created_by', 'expires_at', 'id', 'label', 'last_used_at', 'state', 'uses']);
    const list: any = await D.linkList();
    assertEquals([list.success, list.links.length, list.links[0].label, list.links[0].created_by, list.links[0].state], [true, 1, 'مدير الدفعة', ADMIN.email, 'active']);
    assert(!JSON.stringify(list).includes(row.token_hash) && !JSON.stringify(list).includes(r.t));
    // المنتهي والملغى خارج القائمة النشطة
    w.tables.demo_links.push({ id: crypto.randomUUID(), label: 'منتهٍ', created_by: ADMIN.email, token_hash: 'x'.repeat(64), expires_at: new Date(Date.now() - 1000).toISOString(), created_at: new Date().toISOString() });
    assertEquals(((await D.linkList()) as any).links.map((l: any) => l.label), ['مدير الدفعة']);
    assertEquals(await code(() => D.linkCreate(ADMIN, { label: 'sara@example.sa' })), [400, 'bad_request']);
  } finally { w.restore(); }
});

Deno.test('حد الروابط النشطة: لا يُنشأ ما بعده، والمنتهي والملغى لا يُعدّان', async () => {
  const w = world();
  try {
    for (let i = 0; i < DEMO_LINK_MAX_ACTIVE; i++) await w.create(`مستلم ${i + 1}`);
    assertEquals(await code(() => D.linkCreate(ADMIN, { label: 'زائد' })), [409, 'limit']);
    await D.linkRevoke(ADMIN, { id: w.tables.demo_links[0].id });
    assertEquals(((await D.linkCreate(ADMIN, { label: 'بعد الإلغاء' })) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('الفتح: جلسة مشارك لحساب العرض بلا رمز بريد، منسوبة إلى رابطها، بمدة جلسة العرض ولا تتجاوز انتهاء الرابط', async () => {
  const w = world();
  try {
    const { t, link } = await w.create('مسؤول الجهة', 1);
    const r = await w.call('demo.link-open', { t });
    assertEquals([r.status, r.success, r.demo_shared, r.participant.is_demo, r.participant.email], [200, true, true, true, DEMO_EMAIL]);
    const demo = w.tables.participants.find((p) => p.is_demo)!;
    const s = w.tables.auth_sessions[0];
    assertEquals([s.participant_id, s.method, s.demo_link_id, s.token_hash], [demo.id, 'demo', link.id, await hash(r.token)]);
    const hours = (Date.parse(s.expires_at) - Date.now()) / 36e5;
    assert(hours > CONFIG.demoSessionHours - 0.1 && hours <= CONFIG.demoSessionHours, String(hours));
    const row = w.tables.demo_links[0];
    assertEquals([row.uses, !!row.last_used_at], [1, true]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.link-open').map((x) => [x.actor_type, x.entity, x.entity_id, x.after]), [['system', 'demo_links', link.id, { label: 'مسؤول الجهة' }]]);
    // الرد لا يحمل إلا حساب العرض: لا مشارك حقيقي ولا بصمة ولا بيانات إدارة
    const body = JSON.stringify(r);
    assert(!body.includes(REAL.email) && !body.includes(REAL.full_name) && !body.includes(row.token_hash) && !body.includes(ADMIN.email));
    // والجلسة تعمل كأي جلسة مشارك، وتعلن أنها من رابط
    const me = await w.call('me', { token: r.token });
    assertEquals([me.status, me.success, me.demo_shared, me.participant.is_demo], [200, true, true, true]);
    // رابط ينتهي قبل 8 ساعات: الجلسة تنتهي معه
    const soon = await w.create('ينتهي قريبًا', 1);
    w.tables.demo_links[1].expires_at = new Date(Date.now() + 36e5).toISOString();
    const r2 = await w.call('demo.link-open', { t: soon.t });
    const s2 = w.tables.auth_sessions.find((x) => x.demo_link_id === soon.link.id)!;
    assertEquals([r2.status, s2.expires_at], [200, w.tables.demo_links[1].expires_at]);
  } finally { w.restore(); }
});

Deno.test('رابط منتهٍ أو ملغى أو خاطئ: رسالة عربية واضحة برمزها، ولا جلسة ولا حساب يُنشأ', async () => {
  const w = world();
  try {
    const expired = await w.create('منتهٍ');
    w.tables.demo_links[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const revoked = await w.create('ملغى');
    await D.linkRevoke(ADMIN, { id: revoked.link.id });
    const e = await w.call('demo.link-open', { t: expired.t });
    assertEquals([e.status, e.code, e.message], [410, 'link_expired', 'انتهت مدة رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك']);
    const v = await w.call('demo.link-open', { t: revoked.t });
    assertEquals([v.status, v.code, v.message], [410, 'link_revoked', 'أُلغي رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك']);
    for (const t of ['A'.repeat(43), 'short', '', '../../etc/passwd', 'x'.repeat(300)]) {
      const bad = await w.call('demo.link-open', { t });
      assertEquals([bad.status, bad.code], [404, 'link_invalid'], t.slice(0, 20));
      assert(/رابط التجربة غير صالح/.test(bad.message));
    }
    // رمز جلسة أو بصمة الرابط ليست رمزه
    assertEquals((await w.call('demo.link-open', { t: w.tables.demo_links[0].token_hash })).code, 'link_invalid');
    assertEquals(w.tables.auth_sessions.length, 0);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.link-open').length, 0);
  } finally { w.restore(); }
});

Deno.test('الرابط وجلسته لا يبلغان فعل إدارة، وما أُغلق على حساب العرض يبقى مغلقًا على جلسة الرابط', async () => {
  const w = world();
  try {
    const { t } = await w.create();
    const r = await w.call('demo.link-open', { t });
    // رمز الرابط ليس جلسة لأي دور، وجلسة الرابط جلسة مشارك وحده
    for (const token of [t, r.token]) {
      for (const action of ['admin.demo-links', 'admin.demo-link-create', 'admin.demo-link-revoke', 'admin.demo-open', 'admin.demo-reset', 'admin.participants', 'admin.overview']) {
        const x = await w.call(action, { token, label: 'محاولة', id: w.tables.demo_links[0].id });
        assertEquals([action, x.status, x.code], [action, 401, 'session']);
      }
      for (const action of ['coord.dashboard', 'xp.dashboard']) assertEquals((await w.call(action, { token })).status, 401, action);
    }
    assertEquals((await w.call('me', { token: t })).status, 401);
    assertEquals(w.tables.demo_links.length, 1);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 1);
    // كل فعل في DEMO_BLOCKED يُرد بـdemo لجلسة الرابط قبل أي بوابة أخرى
    assert(ACTION_GATES.demoBlocked.size >= 22);
    for (const action of ACTION_GATES.demoBlocked) {
      const x = await w.call(action, { token: r.token });
      assertEquals([action, x.status, x.code], [action, 403, 'demo']);
    }
    // وأفعال الرابط نفسها: فتحه مفتوح بلا جلسة ولا يُحفظ رده ولا يُعاد تلقائيًا، وإنشاؤه لا يُحفظ رده (يحمل الرمز)
    assertEquals([ACTION_GATES.open.includes('demo.link-open'), NO_REPLAY.has('demo.link-open'), NO_REPLAY.has('admin.demo-link-create'), isAuthAction('leaders-api', 'demo.link-open')], [true, true, true, true]);
    assertEquals(['admin.demo-links', 'admin.demo-link-create', 'admin.demo-link-revoke', 'demo.link-open'].filter((a) => isReadAction('leaders-api', a)), []);
  } finally { w.restore(); }
});

Deno.test('الجلسات لا تبطل إحداها الأخرى: فتح المدير يبطل جلسته السابقة وحدها، وإلغاء رابط ينهي جلساته وحدها', async () => {
  const w = world();
  try {
    const one = await w.create('الأول'), two = await w.create('الثاني');
    const admin1: any = await D.open(ADMIN, {}, CTX);
    const a1 = admin1.url.split('#demo=')[1];
    const l1 = (await w.call('demo.link-open', { t: one.t })).token;
    const l1b = (await w.call('demo.link-open', { t: one.t })).token;
    const l2 = (await w.call('demo.link-open', { t: two.t })).token;
    const live = async (token: string) => (await w.call('me', { token })).status;
    assertEquals(await Promise.all([a1, l1, l1b, l2].map(live)), [200, 200, 200, 200]);
    // جلسة المدير لا تعلن أنها من رابط
    assertEquals((await w.call('me', { token: a1 })).demo_shared, undefined);
    // فتح جديد من اللوحة: جلسة المدير السابقة تبطل (M5)، وجلسات الروابط كما هي
    const admin2: any = await D.open(ADMIN, {}, CTX);
    const a2 = admin2.url.split('#demo=')[1];
    assertEquals(await Promise.all([a1, a2, l1, l1b, l2].map(live)), [401, 200, 200, 200, 200]);
    // فتح الرابط ثانية لا يبطل جلسة المدير ولا جلسة الرابط الآخر
    assertEquals(await Promise.all([a2, l2].map(live)), [200, 200]);
    // حساب العرض واحد: كل جلسة ترى نفسها وحدها في «أجهزتي»، ولا تنهي غيرها
    const mine = await w.call('sessions.list', { token: l1 });
    assertEquals([mine.sessions.length, mine.sessions[0].current], [1, true]);
    await w.call('sessions.revoke', { token: l1 });
    await w.call('sessions.revoke', { token: l1, id: w.tables.auth_sessions.find((s) => !s.demo_link_id && !s.revoked_at)!.id });
    assertEquals(await Promise.all([a2, l1, l1b, l2].map(live)), [200, 200, 200, 200]);
    // خروج المستلم ينهي جلسته وحدها
    await w.call('logout', { token: l1b });
    assertEquals(await Promise.all([a2, l1, l1b, l2].map(live)), [200, 200, 401, 200]);
    // إلغاء الرابط الأول: جلساته تنتهي الآن، والباقي كما هو، ولا يفتح بعده، وكل ذلك في السجل
    const rv: any = await D.linkRevoke(ADMIN, { id: one.link.id });
    assertEquals(rv, { success: true, ended: 1 });
    assertEquals(await Promise.all([a2, l1, l2].map(live)), [200, 401, 200]);
    assertEquals((await w.call('demo.link-open', { t: one.t })).code, 'link_revoked');
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.link-revoke').map((x) => [x.actor, x.entity_id, x.after]), [[ADMIN.email, one.link.id, { label: 'الأول', sessions: 1 }]]);
    // الإلغاء ثانية بلا أثر ولا سطر سجل ثانٍ
    await D.linkRevoke(ADMIN, { id: one.link.id });
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.link-revoke').length, 1);
    assertEquals(await code(() => D.linkRevoke(ADMIN, { id: 'not-an-id' })), [404, 'bad_request']);
  } finally { w.restore(); }
});

Deno.test('انتهاء الرابط أثناء الجلسة: الفعل التالي يُرد برسالة الرابط وتُبطل الجلسة، ولو لم يُبطلها أحد', async () => {
  const w = world();
  try {
    const { t } = await w.create();
    const token = (await w.call('demo.link-open', { t })).token;
    w.tables.demo_links[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const r = await w.call('me', { token });
    assertEquals([r.status, r.code, r.link, r.message], [401, 'session', 'expired', 'انتهت مدة رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك']);
    assert(w.tables.auth_sessions[0].revoked_at);
    // وإلغاء لم تُبطل معه الجلسة (تعذّر الكتابة مثلًا): الحارس نفسه يردها
    const again = await w.create('آخر');
    const token2 = (await w.call('demo.link-open', { t: again.t })).token;
    w.tables.demo_links[1].revoked_at = new Date().toISOString();
    const r2 = await w.call('handbook.toc', { token: token2 });
    assertEquals([r2.status, r2.code, r2.link], [401, 'session', 'revoked']);
  } finally { w.restore(); }
});

Deno.test('حد المعدل: محاولات الرمز من شبكة واحدة تُرد بعد الحد بلا سطور سجل زائدة، وشبكة أخرى لا تتأثر', async () => {
  const w = world();
  try {
    const { t } = await w.create();
    const max = DEMO_LINK_LIMITS.triesPerNet10Min;
    for (let i = 0; i < max; i++) assertEquals((await w.call('demo.link-open', { t: 'W'.repeat(43) }, '198.51.100.9')).code, 'link_invalid');
    // بعد الحد يُرد حتى الرمز الصحيح من الشبكة نفسها، ولا يُكتب سطر
    const blocked = await w.call('demo.link-open', { t }, '198.51.100.9');
    assertEquals([blocked.status, blocked.code], [429, 'rate']);
    for (let i = 0; i < 5; i++) await w.call('demo.link-open', { t: 'W'.repeat(43) }, '198.51.100.9');
    const tries = w.tables.audit_log.filter((x) => x.action === 'demo.link-try');
    assertEquals(tries.length, max);
    // بصمة الشبكة لا عنوانها
    assert(tries.every((x) => /^net:[0-9a-f]{32}$/.test(x.actor) && !JSON.stringify(x).includes('198.51.100.9')));
    assertEquals((await w.call('demo.link-open', { t }, '198.51.100.10')).status, 200);
    // وحد الجلسات للرابط الواحد في الساعة
    const hourAgo = new Date(Date.now() - 6e5).toISOString();
    const id = w.tables.demo_links[0].id;
    for (let i = 0; i < DEMO_LINK_LIMITS.opensPerLinkHour; i++) w.tables.auth_sessions.push({ id: crypto.randomUUID(), participant_id: 'x', demo_link_id: id, created_at: hourAgo, token_hash: `h${i}` });
    const flood = await w.call('demo.link-open', { t }, '198.51.100.11');
    assertEquals([flood.status, flood.code], [429, 'rate']);
  } finally { w.restore(); }
});

Deno.test('إعادة الضبط: يُحذف الحساب وجلساته كلها، والروابط تبقى صالحة وتفتح الحساب الجديد', async () => {
  const w = world();
  try {
    const { t } = await w.create();
    const before = await w.call('demo.link-open', { t });
    const oldId = before.participant.id;
    await D.reset({ ...ADMIN, role: 'super_admin' });
    assertEquals((await w.call('me', { token: before.token })).status, 401);
    assertEquals(w.tables.demo_links.length, 1);
    const after = await w.call('demo.link-open', { t });
    assertEquals([after.status, after.participant.is_demo, after.participant.id !== oldId], [200, true, true]);
    // المشارك الحقيقي لم يُمس
    assertEquals(w.tables.participants.filter((p) => !p.is_demo).map((p) => p.id), [REAL.id]);
  } finally { w.restore(); }
});

Deno.test('تعذّر القاعدة خطأ صريح: لا قائمة فارغة ولا «لم تُفعَّل»، ولا جلسة رابط تمر بلا فحص رابطها', async () => {
  let down = false;
  const w = world((table) => (down && table === 'demo_links' ? { code: '57014', message: 'canceling statement due to statement timeout' } : null));
  try {
    const { t } = await w.create();
    const token = (await w.call('demo.link-open', { t })).token;
    down = true;
    assertEquals(await code(() => D.linkList()), [500, 'db_error']);
    assertEquals(await code(() => D.linkCreate(ADMIN, { label: 'مدير الدفعة' })), [500, 'db_error']);
    assertEquals(await code(() => D.linkRevoke(ADMIN, { id: crypto.randomUUID() })), [500, 'db_error']);
    const o = await w.call('demo.link-open', { t });
    assertEquals([o.status, o.code], [500, 'db_error']);
    // جلسة الرابط القائمة لا تمر والرابط لا يُقرأ، ولا تُبطل بعطل عابر
    const me = await w.call('me', { token });
    assertEquals([me.status, me.code], [500, 'db_error']);
    down = false;
    assertEquals((await w.call('me', { token })).status, 200);
  } finally { w.restore(); }
});
