// الأرقام الستة وعرض الخبير (W2، تصور الحضور 2026-11-18 ب5.5 البنود 1 و4 و5 و8): من تعذّر عليه المسح يكتب الأرقام الستة
// تحت الرمز المتغير فيُسجَّل حضوره بطريقة code، بحد للمحاولات الخاطئة، ولا تطابق الأرقام إلا جلسة مفتوحة له. والخبير المكلف
// بدفعة الجلسة وحده يعرض الرمز من بوابته. على الموجّه الحقيقي (index.ts) بقاعدة في الذاكرة كما في workshop_scan_test.ts
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, hash } = await import('./core.ts');
await import('./index.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { CODE_LIMITS } = await import('./activities.ts');
const { qrCode, qrToken, qrWindow, matchQrCode } = await import('./logic.js');
type Row = Record<string, any>;
const get = (r: Row, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), r);

// جداول في الذاكرة بنمط seat_return_test.ts: eq وneq وin وis وnot(is null) وlimit وrange وmaybeSingle وsingle والعدّ،
// والإدراج والتحديث والحذف. مرشحات الجداول المضمّنة (participants.is_demo) والنص (or وilike) والترتيب لا تغيّر النتيجة
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    let range: [number, number] | null = null;
    const plain = (c: string) => !/[.>]/.test(c);
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert' || mode === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        // المفتاح الأساسي لجدول الحضور (session_id, participant_id) كما في القاعدة
        if (table === 'workshop_attendance' && list.some((x: Row) => rows.some((r) => r.session_id === x.session_id && r.participant_id === x.participant_id))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "workshop_attendance_pkey"' } };
        }
        const added = list.map((x: Row) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        for (const r of out) Object.assign(r, payload);
        return { data: single ? out[0] ?? null : out, error: null };
      }
      if (mode === 'delete') {
        tables[table] = rows.filter((r) => !out.includes(r));
        return { data: out, error: null };
      }
      if (head) return { data: null, count: out.length, error: null };
      if (range) out = out.slice(range[0], range[1] + 1);
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'insert' || k === 'update' || k === 'upsert') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { if (plain(c)) filters.push((r) => (get(r, c) ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { if (plain(c)) filters.push((r) => (get(r, c) ?? null) !== v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { if (plain(c)) filters.push((r) => vs.includes(get(r, c))); return q; };
        if (k === 'is') return (c: string, v: unknown) => { if (plain(c)) filters.push((r) => (get(r, c) ?? null) === v); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (plain(c) && op === 'is' && v === null) filters.push((r) => get(r, c) != null); return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'range') return (a: number, b: number) => { range = [a, b]; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from, rpc: (db as any).rpc, schema: (db as any).schema };
  Object.assign(db as any, { from, rpc: () => Promise.resolve({ data: null, error: null }), schema: () => ({ from }) });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(880001), COHORT = U(880002), OTHER = U(880003), WS = U(880004), WS_OTHER = U(880005), REQ_W = U(880006), REQ_A = U(880007);
const SECRET = 'q'.repeat(32);
const X_ADV = U(880701), X_TEAM = U(880702), X_NONE = U(880703);
const EXPERTS = [X_ADV, X_TEAM, X_NONE].map((id, i) => ({ id, full_name: `خبير ${i + 1}`, email: `x${i + 1}@example.sa`, status: 'active', roles: ['coach'], committees: [] }));
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();

async function world() {
  const who = (n: number, extra: Row) => ({
    id: U(880100 + n), full_name: `مشارك ${n}`, email: `w${n}@example.sa`, organization_id: ORG, organization_name: 'جهة', is_demo: false, is_test: false,
    email_verified_at: '2026-10-01T08:00:00Z', profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T08:00:00Z',
    consented_at: '2026-10-01T08:00:00Z', consent_version: null, status: 'enrolled', ...extra,
  });
  // اثنان من الدفعة نفسها بحق البرنامج، وثالث فيها بلا دفع ولا رعاية (الدفع مفعّل)، ورابع من دفعة أخرى
  // وخامس حساب العرض، مسجَّل في الدفعة نفسها ليبلغ الكتابة: حضوره يُحاكى ولا يُكتب (تصور الحساب التجريبي 2026-11-19، المرحلة 0)
  const ps = { a: who(1, {}), b: who(2, {}), unpaid: who(3, { organization_id: null, status: 'placed' }), other: who(4, { organization_id: null }),
    demo: who(5, { organization_id: null, status: 'placed', is_demo: true, email: 'demo@demo.milestone-impact.org' }) };
  const tokens: Record<string, string> = {};
  const sessions: Row[] = [];
  // ثلاثة خبراء معتمدون: مستشار الدفعة، وعضو فريقها، وخبير لا تكليف له فيها
  const xsessions: Row[] = [];
  for (const x of EXPERTS) {
    tokens[x.id] = `xtoken-${x.id}-0123456789`;
    xsessions.push({ id: `xs-${x.id}`, expert_id: x.id, token_hash: await hash(tokens[x.id]), revoked_at: null, expires_at: iso(864e5) });
  }
  for (const [k, p] of Object.entries(ps)) {
    tokens[k] = `token-${p.id}-scan-0123456789`;
    sessions.push({ id: `sess-${p.id}`, participant_id: p.id, token_hash: await hash(tokens[k]), method: 'email_code', revoked_at: null, created_at: iso(-36e5), expires_at: iso(864e5) });
  }
  const placed = (pid: string) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: pid, dimension, level: 'intermediate', source: 'admin', approved_at: '2026-10-05T08:00:00Z' }));
  const ents = (pid: string) => ['assessment', 'program'].map((item) => ({ participant_id: pid, item, source: 'sponsor', organization_id: ORG, value_cents: 0, revoked_at: null }));
  const tables: Record<string, Row[]> = {
    payment_settings: [{ id: true, enabled: true, currency: 'USD', assessment_cents: 100, program_cents: 9900 }],
    organizations: [{ id: ORG, name: 'جهة', short_name: null, status: 'active', seats: 50, contract_cents: 0, show_value: true }],
    participants: Object.values(ps),
    auth_sessions: sessions,
    placements: Object.values(ps).flatMap((p) => placed(p.id)),
    entitlements: [...ents(ps.a.id), ...ents(ps.b.id), ...ents(ps.other.id)],
    sponsor_requests: [],
    programs: [{ id: 'prog', is_default: true, name: 'البرنامج', katon_points: null, final_eval: null }],
    cohorts: [
      { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', supervision: 'peers_expert', starts_on: '2026-11-01', advisor_expert_id: X_ADV, delivery: {} },
      { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', supervision: 'peers_expert', starts_on: '2026-11-01', advisor_expert_id: null, delivery: {} },
    ],
    enrollments: [
      { participant_id: ps.unpaid.id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps.other.id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps.demo.id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    journey_stages: [{ program_id: 'prog', key: 'approval', sort: 3, title_ar: 'اعتماد المسار', active: true }, { program_id: 'prog', key: 'training', sort: 4, title_ar: 'التدريب', active: true }],
    stage_requirements: [
      { id: REQ_A, program_id: 'prog', stage_key: 'approval', code: 'AP-OK', kind: 'auto', dimension: null, level: null, sort: 1, required: true, title_ar: 'اعتماد المسار', config: {} },
      { id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr' } },
    ],
    workshop_sessions: [
      { id: WS, requirement_id: REQ_W, title_ar: 'اليوم الثالث', mode: 'in_person', location_ar: 'القاعة', join_url: null, active: true, cohort_id: COHORT, secret: SECRET, starts_at: iso(-6e5), ends_at: iso(72e5) },
      { id: WS_OTHER, requirement_id: REQ_W, title_ar: 'اليوم الثالث', mode: 'in_person', location_ar: 'قاعة أخرى', join_url: null, active: true, cohort_id: OTHER, secret: SECRET, starts_at: iso(-6e5), ends_at: iso(72e5) },
    ],
    workshop_attendance: [], workshop_scan_receipts: [], audit_log: [], experts: EXPERTS, expert_sessions: xsessions, cohort_experts: [{ cohort_id: COHORT, expert_id: X_TEAM }], expert_requests: [], cohort_roles: [], certificates: [],
    coaching_sessions: [], participant_stage_overrides: [], app_settings: [],
  };
  const f = install(tables);
  resetSettingsCache();
  const call = async (who: string | null, action: string, body: Row = {}, ip = '203.0.113.7') => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test', 'x-forwarded-for': ip },
      body: JSON.stringify({ action, ...(who ? { token: tokens[who] } : {}), ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  return { ps, tables, call, restore: () => { f.restore(); resetSettingsCache(); } };
}

const nowCode = (id = WS) => qrCode(id, SECRET);
// أرقام لا تطابق الجلسة في النافذتين المقبولتين
async function wrongCode(id = WS) {
  for (let n = 0; ; n++) { const c = String(n).padStart(6, '0'); if ((await matchQrCode(c, id, SECRET)) == null) return c; }
}

Deno.test('الأرقام الستة: مشتقة من التوقيع والنافذة، تتغير مع كل نافذة، وتُقبل في النافذة الحالية والسابقة وحدهما', async () => {
  const w = qrWindow();
  const [a, b, c] = await Promise.all([qrCode(WS, SECRET, w), qrCode(WS, SECRET, w - 1), qrCode(WS, SECRET, w - 2)]);
  for (const x of [a, b, c]) assert(/^\d{6}$/.test(x), x);
  assertEquals(await matchQrCode(a, WS, SECRET), w);
  if (b !== a) assertEquals(await matchQrCode(b, WS, SECRET), w - 1);
  if (c !== a && c !== b) assertEquals(await matchQrCode(c, WS, SECRET), null);
  // سر آخر أو جلسة أخرى: أرقام أخرى (لا تُشتق من المعرّف وحده)
  assert((await qrCode(WS, 'z'.repeat(32), w)) !== a || (await qrCode(WS_OTHER, SECRET, w)) !== a);
  for (const bad of ['12345', '1234567', 'abcdef', '', null]) assertEquals(await matchQrCode(bad, WS, SECRET), null);
});

Deno.test('أرقام صحيحة: يُسجَّل الحضور بطريقة code مرة واحدة، ويُقبل بالأرقام العربية وبمسافة، ويُكتب في السجل', async () => {
  const w = await world();
  try {
    const code = await nowCode();
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    const r = await w.call('a', 'workshop.checkin', { code: spaced });
    assertEquals([r.status, r.success, r.already, r.method, r.session.title], [200, true, false, 'code', 'اليوم الثالث']);
    assertEquals(w.tables.workshop_attendance.map((x) => [x.session_id, x.participant_id, x.method]), [[WS, w.ps.a.id, 'code']]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.checkin').map((x) => x.after), [{ via: 'code' }]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-try').length, 1);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-hit').map((x) => x.after), [{ session_id: WS }]);
    const again = await w.call('a', 'workshop.checkin', { code });
    assertEquals([again.success, again.already], [true, true]);
    assertEquals(w.tables.workshop_attendance.length, 1);
    // بلا حق في البرنامج: الحضور بالأرقام خارج بوابة الدفع كالمسح
    const u = await w.call('unpaid', 'workshop.checkin', { code });
    assertEquals([u.status, u.success], [200, true]);
  } finally { w.restore(); }
});

Deno.test('حساب العرض: الأرقام والمسح والإيصال تُرد «سُجّل حضورك» كما لغيره، ولا يُكتب حضور ولا سجل ولا يُستهلك إيصال', async () => {
  const w = await world();
  try {
    const byCode = await w.call('demo', 'workshop.checkin', { code: await nowCode() });
    assertEquals([byCode.status, byCode.success, byCode.already, byCode.method, byCode.simulated, byCode.session.title], [200, true, false, 'code', true, 'اليوم الثالث']);
    const t = await qrToken(WS, SECRET, qrWindow());
    const byScan = await w.call('demo', 'workshop.checkin', { t });
    assertEquals([byScan.status, byScan.success, byScan.already, byScan.method, byScan.simulated], [200, true, false, 'qr', true]);
    // مسح قبل الدخول ثم دخول بحساب العرض: الإيصال لا يُستهلك، فيبقى صالحًا لمن مسحه فعلًا
    const scan = await w.call(null, 'workshop.scan', { t });
    assertEquals([scan.status, scan.success], [200, true]);
    const byReceipt = await w.call('demo', 'workshop.checkin', { r: scan.receipt });
    assertEquals([byReceipt.status, byReceipt.success, byReceipt.simulated], [200, true, true]);
    assertEquals(w.tables.workshop_scan_receipts.map((x) => [x.consumed_at ?? null, x.participant_id ?? null]), [[null, null]]);
    // لا صف حضور ولا سطر تسجيل ولا «ناجحة» للأرقام: لا شيء يدخل عدّاد «حضر»
    assertEquals(w.tables.workshop_attendance, []);
    assertEquals(w.tables.audit_log.filter((x) => ['workshop.checkin', 'workshop.code-hit'].includes(x.action)), []);
    // والرفض كما لغيره: رمز غير صالح لا يُحاكى نجاحه
    const bad = await w.call('demo', 'workshop.checkin', { t: 'not-a-token' });
    assertEquals([bad.status, bad.code], [400, 'qr_invalid']);
    // والمشارك الحقيقي بالإيصال نفسه يُسجَّل حضوره كما كان
    const real = await w.call('a', 'workshop.checkin', { r: scan.receipt });
    assertEquals([real.status, real.success, real.simulated], [200, true, undefined]);
    assertEquals(w.tables.workshop_attendance.map((x) => x.participant_id), [w.ps.a.id]);
  } finally { w.restore(); }
});

Deno.test('أرقام خاطئة تُرد وتُعد، وصيغة غير الستة تُرد بلا عدّ', async () => {
  const w = await world();
  try {
    const bad = await wrongCode();
    const r = await w.call('a', 'workshop.checkin', { code: bad });
    assertEquals([r.status, r.code, r.left], [400, 'code_wrong', CODE_LIMITS.wrongPer10Min - 1]);
    assert(/بقيت 4 محاولات/.test(r.message), r.message);
    assertEquals(w.tables.workshop_attendance.length, 0);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-try' && x.entity_id === w.ps.a.id).length, 1);
    for (const code of ['12345', '1234567', 'abc']) {
      const x = await w.call('a', 'workshop.checkin', { code });
      assertEquals([x.status, x.code], [400, 'code_invalid']);
    }
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-try').length, 1);
  } finally { w.restore(); }
});

Deno.test('حد المحاولات: خمس خاطئة في عشر دقائق ثم يُرد حتى الصحيح، ولا يمس مشاركًا آخر', async () => {
  const w = await world();
  try {
    const bad = await wrongCode();
    const lefts = [];
    for (let i = 0; i < CODE_LIMITS.wrongPer10Min; i++) lefts.push((await w.call('a', 'workshop.checkin', { code: bad })).left);
    assertEquals(lefts, [4, 3, 2, 1, 0]);
    const blocked = await w.call('a', 'workshop.checkin', { code: await nowCode() });
    assertEquals([blocked.status, blocked.code], [429, 'code_rate']);
    assertEquals(w.tables.workshop_attendance.length, 0);
    // كل محاولة دون الحد مسجلة، والمرفوضة بالحد لا تضيف صفًا: حلقة طلبات لا تملأ السجل
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-try').length, CODE_LIMITS.wrongPer10Min);
    for (let i = 0; i < 20; i++) assertEquals((await w.call('a', 'workshop.checkin', { code: bad })).code, 'code_rate');
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-try').length, CODE_LIMITS.wrongPer10Min);
    const b = await w.call('b', 'workshop.checkin', { code: await nowCode() });
    assertEquals([b.status, b.method], [200, 'code']);
    // المحاولات المتزامنة لا تتجاوز الحد: تُكتب قبل العدّ
    const wrong = await wrongCode(WS_OTHER);
    const burst = await Promise.all(Array.from({ length: 12 }, () => w.call('other', 'workshop.checkin', { code: wrong })));
    assert(burst.filter((x) => x.code === 'code_wrong').length <= CODE_LIMITS.wrongPer10Min, JSON.stringify(burst.map((x) => x.code)));
    assert(burst.every((x) => ['code_wrong', 'code_rate'].includes(x.code)));
  } finally { w.restore(); }
});

Deno.test('إعادة أرقام جلسة سُجّل حضورها لا تسترد محاولة: لا تخمين بلا حد لجلسة ثانية مفتوحة معها', async () => {
  const w = await world();
  try {
    // جلسة ثانية لدفعته مفتوحة في الوقت نفسه (صباحية ومسائية في يوم واحد)، بسر آخر فأرقامها غير أرقام الأولى
    const WS2 = U(880009), SECRET2 = 'r'.repeat(32);
    w.tables.workshop_sessions.push({ ...w.tables.workshop_sessions.find((x) => x.id === WS)!, id: WS2, title_ar: 'اليوم الثالث مساءً', secret: SECRET2 });
    assertEquals((await w.call('a', 'workshop.checkin', { code: await nowCode() })).already, false);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-hit').length, 1);
    let wrong = '';
    for (let n = 0; ; n++) {
      const c = String(n).padStart(6, '0');
      if ((await matchQrCode(c, WS, SECRET)) == null && (await matchQrCode(c, WS2, SECRET2)) == null) { wrong = c; break; }
    }
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push((await w.call('a', 'workshop.checkin', { code: wrong })).code);
      const again = await w.call('a', 'workshop.checkin', { code: await nowCode() });
      seen.push(again.already ? 'already' : again.code);
    }
    // استرداد واحد للجلسة الأولى فقط: بعد خمس خاطئة (والمكررة تُحسب) يُرد كل شيء بالحد
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-hit').length, 1);
    assert(seen.filter((c) => c === 'code_wrong').length <= CODE_LIMITS.wrongPer10Min, seen.join());
    assertEquals(seen.slice(-4), ['code_rate', 'code_rate', 'code_rate', 'code_rate']);
    assertEquals(w.tables.workshop_attendance.map((x) => x.session_id), [WS]);
  } finally { w.restore(); }
});

Deno.test('مسح وأرقام متزامنان للمشارك والجلسة نفسيهما: صف واحد وسطر سجل واحد، والثاني «مسجل مسبقًا» لا خطأ', async () => {
  const w = await world();
  try {
    const [t, code] = await Promise.all([qrToken(WS, SECRET), nowCode()]);
    const out = await Promise.all([w.call('a', 'workshop.checkin', { t }), w.call('a', 'workshop.checkin', { code }), w.call('a', 'workshop.checkin', { t })]);
    assertEquals(out.map((x) => [x.status, x.success]), [[200, true], [200, true], [200, true]]);
    assertEquals(out.filter((x) => !x.already).length, 1);
    assertEquals(w.tables.workshop_attendance.length, 1);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.checkin').length, 1);
    // والأرقام إن خسرت السباق لا تُكتب لها «ناجحة»
    const codeWon = w.tables.workshop_attendance[0].method === 'code';
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.code-hit').length, codeWon ? 1 : 0);
  } finally { w.restore(); }
});

Deno.test('أرقام جلسة دفعة أخرى ونافذة مغلقة وطريقة أخرى وجلسة عن بعد: تُرد ولا تُسجَّل', async () => {
  const w = await world();
  try {
    // أرقام جلسة الدفعة الأخرى الجارية: لا تطابق جلسات هذا المشارك فتُرد خاطئة وتُعد
    const other = await nowCode(WS_OTHER);
    if (other !== (await nowCode())) {
      const x = await w.call('a', 'workshop.checkin', { code: other });
      assertEquals([x.status, x.code], [400, 'code_wrong']);
    }
    // وصاحبها يُسجَّل بها
    assertEquals((await w.call('other', 'workshop.checkin', { code: other })).success, true);
    // النافذة مغلقة: لا جلسة مفتوحة له، فلا مطابقة ولا عدّ
    const sess = w.tables.workshop_sessions.find((x) => x.id === WS)!;
    sess.starts_at = iso(-5 * 36e5); sess.ends_at = iso(-4 * 36e5);
    const closed = await w.call('a', 'workshop.checkin', { code: await nowCode() });
    assertEquals([closed.status, closed.code], [400, 'no_session']);
    sess.starts_at = iso(-6e5); sess.ends_at = iso(72e5);
    // تخصيص الدفعة يجعل التوثيق يدويًا: الأرقام لا تصلح
    w.tables.cohorts.find((x) => x.id === COHORT)!.delivery = { 'T-ATTEND': { verify: 'manual' } };
    assertEquals((await w.call('a', 'workshop.checkin', { code: await nowCode() })).code, 'no_session');
    w.tables.cohorts.find((x) => x.id === COHORT)!.delivery = {};
    // جلسة عن بعد لا رمز لها
    sess.mode = 'online';
    assertEquals((await w.call('a', 'workshop.checkin', { code: await nowCode() })).code, 'no_session');
    assertEquals(w.tables.workshop_attendance.map((x) => x.participant_id), [w.ps.other.id]);
  } finally { w.restore(); }
});

Deno.test('قبل الترحيل 20261118120000: القيد يرفض code فيُكتب الحضور qr ويبقى السجل يقول via:code', async () => {
  const w = await world();
  const base = (db as any).from;
  (db as any).from = (t: string) => {
    const q = base(t);
    if (t !== 'workshop_attendance') return q;
    return new Proxy(q, { get: (o, k: string) => (k === 'insert' ? (row: any) => (row.method === 'code' ? Promise.resolve({ data: null, error: { code: '23514', message: 'workshop_attendance_method_check' } }) : o.insert(row)) : o[k]) });
  };
  try {
    const r = await w.call('a', 'workshop.checkin', { code: await nowCode() });
    assertEquals([r.status, r.success], [200, true]);
    assertEquals(w.tables.workshop_attendance.map((x) => x.method), ['qr']);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.checkin').map((x) => x.after), [{ via: 'code' }]);
  } finally { (db as any).from = base; w.restore(); }
});

Deno.test('شاشة الرمز للإدارة تحمل الأرقام الستة من النافذة نفسها', async () => {
  const w = await world();
  try {
    const V = await import('./activities.ts');
    const q: any = await V.workshopQr({ id: WS });
    assert(/^\d{6}$/.test(q.code), q.code);
    assertEquals(await matchQrCode(q.code, WS, SECRET) != null, true);
    const t = decodeURIComponent(new URL(q.url).searchParams.get('checkin')!);
    assertEquals(t.split('.')[1], String(await matchQrCode(q.code, WS, SECRET)));
  } finally { w.restore(); }
});

Deno.test('عرض الخبير: المستشار وعضو الفريق يعرضان رمز جلسة دفعتهما، وغير المكلف والجلسة العامة يُردان', async () => {
  const w = await world();
  try {
    // الجدول المضمّن (participants) لا تملؤه قاعدة الذاكرة: يُلحق بصفوف المسار كما تعيده PostgREST
    for (const pl of w.tables.placements) pl.participants = w.tables.participants.find((x) => x.id === pl.participant_id);
    await w.call('a', 'workshop.checkin', { code: await nowCode() });
    for (const x of [X_ADV, X_TEAM]) {
      const list = await w.call(x, 'xp.workshops');
      assertEquals([list.status, list.sessions.map((s: any) => [s.id, s.open])], [200, [[WS, true]]]);
      const q = await w.call(x, 'xp.workshop-qr', { id: WS });
      assertEquals([q.status, q.success, /^\d{6}$/.test(q.code), q.open], [200, true, true, true]);
      const a = await w.call(x, 'xp.workshop-attendance', { id: WS });
      assertEquals(a.status, 200);
      // الاسم والحضور وحدهما: لا بريد ولا جهة
      const present = a.people.filter((p: any) => p.attendance).map((p: any) => [p.full_name, p.attendance.method]);
      assertEquals(present, [['مشارك 1', 'code']]);
      assert(a.people.length >= 2, String(a.people.length));
      assert(a.people.every((p: any) => !('email' in p) && !('organization_name' in p)));
    }
    // خبير لا تكليف له، وجلسة دفعة أخرى، وجلسة عامة بلا دفعة
    const none = await w.call(X_NONE, 'xp.workshop-qr', { id: WS });
    assertEquals([none.status, none.code], [403, 'not_assigned']);
    assertEquals((await w.call(X_NONE, 'xp.workshop-attendance', { id: WS })).code, 'not_assigned');
    assertEquals((await w.call(X_NONE, 'xp.workshops')).sessions, []);
    assertEquals((await w.call(X_ADV, 'xp.workshop-qr', { id: WS_OTHER })).code, 'not_assigned');
    w.tables.workshop_sessions.find((x) => x.id === WS_OTHER)!.cohort_id = null;
    assertEquals((await w.call(X_ADV, 'xp.workshop-qr', { id: WS_OTHER })).code, 'not_assigned');
    // جلسة دفعته تُوثَّق يدويًا بتخصيصها: لا تظهر في قائمته
    w.tables.cohorts.find((x) => x.id === COHORT)!.delivery = { 'T-ATTEND': { verify: 'manual' } };
    assertEquals((await w.call(X_ADV, 'xp.workshops')).sessions, []);
    // خبير بلا خدمة رحلة (بلا دور) يُرد قبل الدالة، والمشارك لا يصل الفعل
    w.tables.experts.find((x) => x.id === X_TEAM)!.roles = [];
    assertEquals((await w.call(X_TEAM, 'xp.workshop-qr', { id: WS })).code, 'journey');
    assertEquals((await w.call('a', 'xp.workshop-qr', { id: WS })).status, 401);
  } finally { w.restore(); }
});
