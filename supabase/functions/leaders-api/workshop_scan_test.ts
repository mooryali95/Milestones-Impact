// حضور لا يتعثر (W1، تصور الحضور 2026-11-18 ب5.5): مسح رمز الحضور بلا دخول يعطي إيصالًا موقّعًا (workshop.scan)، ويُسجَّل
// به الحضور بعد الدخول (workshop.checkin) مرة واحدة لمشارك واحد. على الموجّه الحقيقي (index.ts) بقاعدة في الذاكرة كما في
// program_gate_test.ts، فتُختبر البوابات معه: الحضور خارج بوابة الدفع، والجلسة لدفعة أخرى، والنافذة المغلقة، والانتهاء، والحد
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, hash } = await import('./core.ts');
const { ACTION_GATES } = (await import('./index.ts')) as any;
const { resetSettingsCache } = await import('./settings.ts');
const { SCAN_LIMITS } = await import('./activities.ts');
const S = await import('./system.ts');
const { qrToken, scanReceipt } = await import('./logic.js');
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
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
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
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();

async function world() {
  const who = (n: number, extra: Row) => ({
    id: U(880100 + n), full_name: `مشارك ${n}`, email: `w${n}@example.sa`, organization_id: ORG, organization_name: 'جهة', is_demo: false, is_test: false,
    email_verified_at: '2026-10-01T08:00:00Z', profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T08:00:00Z',
    consented_at: '2026-10-01T08:00:00Z', consent_version: null, status: 'enrolled', ...extra,
  });
  // اثنان من الدفعة نفسها بحق البرنامج، وثالث فيها بلا دفع ولا رعاية (الدفع مفعّل)، ورابع من دفعة أخرى
  const ps = { a: who(1, {}), b: who(2, {}), unpaid: who(3, { organization_id: null, status: 'placed' }), other: who(4, { organization_id: null }) };
  const tokens: Record<string, string> = {};
  const sessions: Row[] = [];
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
      { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', supervision: 'peers_expert', starts_on: '2026-11-01', advisor_expert_id: null, delivery: {} },
      { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', supervision: 'peers_expert', starts_on: '2026-11-01', advisor_expert_id: null, delivery: {} },
    ],
    enrollments: [
      { participant_id: ps.unpaid.id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps.other.id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
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
    workshop_attendance: [], workshop_scan_receipts: [], audit_log: [], experts: [], expert_requests: [], cohort_roles: [], certificates: [],
    coaching_sessions: [], participant_stage_overrides: [], app_settings: [],
  };
  const f = install(tables);
  resetSettingsCache();
  const call = async (who: keyof typeof ps | null, action: string, body: Row = {}, ip = '203.0.113.7') => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test', 'x-forwarded-for': ip },
      body: JSON.stringify({ action, ...(who ? { token: tokens[who] } : {}), ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  return { ps, tables, call, restore: () => { f.restore(); resetSettingsCache(); } };
}
const qr = (id = WS) => qrToken(id, SECRET);

Deno.test('مسح بلا دخول ثم دخول: إيصال بلا بيانات شخصية، ويُسجَّل به الحضور qr مرة واحدة، وصاحبه يعيده بلا أثر', async () => {
  const w = await world();
  try {
    const s = await w.call(null, 'workshop.scan', { t: await qr() });
    assertEquals([s.status, s.success, s.session.title], [200, true, 'اليوم الثالث']);
    assert(/^r1\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d{10}\.[0-9a-f]{32}$/.test(s.receipt), s.receipt);
    // ربع ساعة لا نافذة الحضور كلها
    const left = Date.parse(s.expires_at) - Date.now();
    assert(left > 14 * 6e4 && left <= 15 * 6e4, String(left));
    const row = w.tables.workshop_scan_receipts[0];
    assertEquals([w.tables.workshop_scan_receipts.length, row.session_id, row.participant_id ?? null, row.consumed_at ?? null, row.ip_hash?.length], [1, WS, null, null, 64]);
    assert(!JSON.stringify(row).includes('203.0.113.7'));
    // لا حضور ولا سجل قبل الدخول
    assertEquals(w.tables.workshop_attendance.length, 0);
    const c = await w.call('a', 'workshop.checkin', { r: s.receipt });
    assertEquals([c.status, c.success, c.already], [200, true, false]);
    assertEquals(w.tables.workshop_attendance.map((x) => [x.session_id, x.participant_id, x.method]), [[WS, w.ps.a.id, 'qr']]);
    assertEquals([row.participant_id, typeof row.consumed_at], [w.ps.a.id, 'string']);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.checkin').map((x) => x.after), [{ via: 'receipt' }]);
    const again = await w.call('a', 'workshop.checkin', { r: s.receipt });
    assertEquals([again.status, again.success, again.already], [200, true, true]);
    assertEquals(w.tables.workshop_attendance.length, 1);
  } finally { w.restore(); }
});

Deno.test('الإيصال لا يُعاد لمشارك آخر، ولا يُزوَّر ولا يُنقل إلى جلسة أخرى', async () => {
  const w = await world();
  try {
    const s = await w.call(null, 'workshop.scan', { t: await qr() });
    assertEquals((await w.call('a', 'workshop.checkin', { r: s.receipt })).success, true);
    const b = await w.call('b', 'workshop.checkin', { r: s.receipt });
    assertEquals([b.status, b.code], [409, 'receipt_used']);
    // توقيع بسر غير سر الجلسة، وانتهاء مُطال، وجلسة أخرى بالتوقيع نفسه
    const [, sid, rid, exp] = s.receipt.split('.');
    const forged = await scanReceipt(sid, rid, Number(exp), 'z'.repeat(32));
    const longer = s.receipt.replace(`.${exp}.`, `.${Number(exp) + 36000}.`);
    const moved = s.receipt.replace(WS, WS_OTHER);
    for (const r of [forged, longer, moved, 'r1.nope', `${s.receipt}0`]) {
      const x = await w.call('b', 'workshop.checkin', { r });
      assertEquals([x.status, x.code], [400, 'receipt_invalid']);
    }
    // إيصال صحيح التوقيع لا صف له (لم يصدره الخادم أو حُذف): مرفوض
    const ghost = await scanReceipt(WS, U(880999), Math.floor(Date.now() / 1000) + 600, SECRET);
    assertEquals((await w.call('b', 'workshop.checkin', { r: ghost })).code, 'receipt_invalid');
    assertEquals(w.tables.workshop_attendance.map((x) => x.participant_id), [w.ps.a.id]);
  } finally { w.restore(); }
});

Deno.test('بعد 5 دقائق يُقبل، وبعد انتهائه يُرد، ولا يُستهلك المرفوض', async () => {
  const w = await world();
  try {
    const at = (min: number) => Math.floor((Date.now() + min * 6e4) / 1000);
    // إيصالان بصفّيهما كما يكتبهما workshop.scan: بقيت لأحدهما 10 دقائق (مسح قبل 5)، وانتهى الآخر قبل دقيقة (مسح قبل 16)
    for (const [id, exp] of [[U(880201), at(10)], [U(880202), at(-1)]] as [string, number][]) w.tables.workshop_scan_receipts.push({ id, session_id: WS, ip_hash: null, expires_at: new Date(exp * 1000).toISOString() });
    const late = await w.call('b', 'workshop.checkin', { r: await scanReceipt(WS, U(880202), at(-1), SECRET) });
    assertEquals([late.status, late.code], [400, 'receipt_expired']);
    assertEquals(w.tables.workshop_scan_receipts.find((x) => x.id === U(880202))!.consumed_at ?? null, null);
    const ok = await w.call('b', 'workshop.checkin', { r: await scanReceipt(WS, U(880201), at(10), SECRET) });
    assertEquals([ok.status, ok.success], [200, true]);
  } finally { w.restore(); }
});

Deno.test('خطأ القاعدة عند الاستهلاك خطأ خادم يُعاد معه، لا رفض نهائي، ويبقى الإيصال غير مستهلك', async () => {
  const w = await world();
  try {
    const s = await w.call(null, 'workshop.scan', { t: await qr() });
    // تحديث جدول الإيصالات ينقطع (مهلة) مرة واحدة
    const base = (db as any).from;
    const failing: any = new Proxy({}, { get: (_t, k) => (k === 'then' ? (ok: any, bad: any) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(ok, bad) : () => failing) });
    (db as any).from = (t: string) => {
      const q = base(t);
      return t === 'workshop_scan_receipts' ? new Proxy(q, { get: (o, k: string) => (k === 'update' ? () => failing : o[k]) }) : q;
    };
    const x = await w.call('a', 'workshop.checkin', { r: s.receipt });
    (db as any).from = base;
    assert(x.status >= 500, String(x.status));
    assert(x.code !== 'receipt_invalid', x.code);
    assertEquals([w.tables.workshop_scan_receipts[0].consumed_at ?? null, w.tables.workshop_attendance.length], [null, 0]);
    // وإعادة المحاولة بعد عودة القاعدة تسجّل الحضور بالإيصال نفسه
    assertEquals((await w.call('a', 'workshop.checkin', { r: s.receipt })).success, true);
  } finally { w.restore(); }
});

Deno.test('مسح قبل إغلاق النافذة بدقائق ودخول بعد إغلاقها: يُقال إن النافذة أُغلقت، لا إن ربع ساعة مضت', async () => {
  const w = await world();
  try {
    // انتهت الجلسة قبل 33 دقيقة فأُغلقت النافذة قبل 3، والإيصال (مقصوص على الإغلاق) انتهى معها بعد مسح قبل 5 دقائق
    const sess = w.tables.workshop_sessions.find((x) => x.id === WS)!;
    sess.starts_at = iso(-3 * 36e5);
    sess.ends_at = iso(-33 * 6e4);
    const exp = Math.floor((Date.now() - 3 * 6e4) / 1000);
    w.tables.workshop_scan_receipts.push({ id: U(880301), session_id: WS, ip_hash: null, expires_at: new Date(exp * 1000).toISOString() });
    const x = await w.call('a', 'workshop.checkin', { r: await scanReceipt(WS, U(880301), exp, SECRET) });
    assertEquals([x.status, x.code], [400, 'closed']);
    assertEquals(w.tables.workshop_scan_receipts[0].consumed_at ?? null, null);
  } finally { w.restore(); }
});

Deno.test('جلسة دفعة أخرى ونافذة مغلقة وطريقة توثيق أخرى: يُرد بلا حضور ولا استهلاك', async () => {
  const w = await world();
  try {
    // مشارك من دفعة أخرى يمسح رمز هذه الجلسة: الإيصال يصدر (لا يُعرف من مسح)، ويُرد عند الاستهلاك ويبقى صالحًا لصاحبه
    const s = await w.call(null, 'workshop.scan', { t: await qr() });
    const o = await w.call('other', 'workshop.checkin', { r: s.receipt });
    assertEquals([o.status, o.code], [403, 'cohort']);
    assertEquals(w.tables.workshop_scan_receipts[0].consumed_at ?? null, null);
    assertEquals((await w.call('a', 'workshop.checkin', { r: s.receipt })).success, true);
    // النافذة أُغلقت بعد المسح (أوقف المدرب الجلسة): الإيصال يُرد
    const s2 = await w.call(null, 'workshop.scan', { t: await qr() });
    w.tables.workshop_sessions.find((x) => x.id === WS)!.active = false;
    const closed = await w.call('b', 'workshop.checkin', { r: s2.receipt });
    assertEquals([closed.status, closed.code], [400, 'closed']);
    // ولا إيصال لجلسة مغلقة النافذة
    const sc = await w.call(null, 'workshop.scan', { t: await qr() });
    assertEquals([sc.status, sc.code], [400, 'closed']);
    w.tables.workshop_sessions.find((x) => x.id === WS)!.active = true;
    // تخصيص الدفعة يجعل التوثيق بالانضمام: لا إيصال (الطريقة الفعلية لا طريقة البرنامج)
    w.tables.cohorts.find((x) => x.id === COHORT)!.delivery = { 'T-ATTEND': { verify: 'join' } };
    const m = await w.call(null, 'workshop.scan', { t: await qr() });
    assertEquals([m.status, m.code], [400, 'method']);
    // رمز منتهٍ (نافذة قبل دقيقتين) ورمز مزوّر
    const old = await qrToken(WS, SECRET, Math.floor(Date.now() / 1000 / 30) - 4);
    assertEquals((await w.call(null, 'workshop.scan', { t: old })).code, 'qr_expired');
    assertEquals((await w.call(null, 'workshop.scan', { t: `${WS}.1.${'0'.repeat(20)}` })).code, 'qr_expired');
    assertEquals((await w.call(null, 'workshop.scan', { t: 'x' })).code, 'qr_invalid');
    assertEquals(w.tables.workshop_attendance.map((x) => x.participant_id), [w.ps.a.id]);
  } finally { w.restore(); }
});

Deno.test('الحضور لا تمنعه بوابة الدفع: من لا حق له في البرنامج يُسجَّل حضوره بالرمز وبالإيصال', async () => {
  const w = await world();
  try {
    assert(ACTION_GATES.payFree.has('workshop.checkin'));
    assert(ACTION_GATES.open.includes('workshop.scan'));
    assert(!ACTION_GATES.actions.includes('workshop.scan'));
    // وما سواه من أفعال الرحلة يبقى خلف الدفع لهذا المشارك
    const lab = await w.call('unpaid', 'lab.list');
    assertEquals([lab.status, lab.code], [402, 'pay:program']);
    const direct = await w.call('unpaid', 'workshop.checkin', { t: await qr() });
    assertEquals([direct.status, direct.success], [200, true]);
    w.tables.workshop_attendance.length = 0;
    const s = await w.call(null, 'workshop.scan', { t: await qr() });
    assertEquals((await w.call('unpaid', 'workshop.checkin', { r: s.receipt })).success, true);
  } finally { w.restore(); }
});

Deno.test('حد المعدل: شبكة واحدة وجلسة واحدة، والترحيل غير المطبق يُرد not_migrated', async () => {
  const w = await world();
  try {
    const ipHash = await hash('workshop-scan:198.51.100.9');
    for (let i = 0; i < SCAN_LIMITS.perIp10Min; i++) w.tables.workshop_scan_receipts.push({ id: U(881000 + i), session_id: WS_OTHER, ip_hash: ipHash, expires_at: iso(6e5), created_at: iso(-6e4) });
    const r = await w.call(null, 'workshop.scan', { t: await qr() }, '198.51.100.9');
    assertEquals([r.status, r.code], [429, 'rate']);
    // شبكة أخرى تمر
    assertEquals((await w.call(null, 'workshop.scan', { t: await qr() }, '198.51.100.10')).success, true);
    w.tables.workshop_scan_receipts.length = 0;
    for (let i = 0; i < SCAN_LIMITS.perSession10Min; i++) w.tables.workshop_scan_receipts.push({ id: U(882000 + i), session_id: WS, ip_hash: null, expires_at: iso(6e5), created_at: iso(-6e4) });
    assertEquals((await w.call(null, 'workshop.scan', { t: await qr() }, '198.51.100.11')).code, 'rate');
  } finally { w.restore(); }
  // قبل الترحيل: الجدول غائب (PGRST205)، فيحفظ التطبيق الرمز كما كان (checkin.js)
  const v = await world();
  const real = (db as any).from;
  (db as any).from = (t: string) => (t === 'workshop_scan_receipts' ? { select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: null, count: null, error: { code: 'PGRST205', message: 'missing' } }) }) }) } : real(t));
  try {
    const r = await v.call(null, 'workshop.scan', { t: await qr() });
    assertEquals([r.status, r.code], [503, 'not_migrated']);
  } finally { (db as any).from = real; v.restore(); }
});

Deno.test('التنظيف: عنوان الشبكة ونوع المتصفح مع الحضور بعد 90 يومًا، وإيصالات المسح بعد انتهائها بيوم', async () => {
  const w = await world();
  try {
    // الجدول بلا id: يُقرأ الأثر بمعرّف الجلسة، ويبقى الحضور نفسه بلا عنوانه
    w.tables.workshop_attendance.push({ session_id: WS, participant_id: w.ps.a.id, method: 'qr', ip: '203.0.113.7', user_agent: 'UA', checked_in_at: iso(-100 * 864e5) });
    w.tables.workshop_scan_receipts.push({ id: U(883001), session_id: WS, ip_hash: null, expires_at: iso(-2 * 864e5) });
    const q = await S.purge();
    assertEquals([q.workshop_attendance, q.workshop_scan_receipts], [1, 1]);
    assertEquals(w.tables.workshop_attendance.map((x) => [x.method, x.ip, x.user_agent]), [['qr', null, null]]);
    assertEquals(w.tables.workshop_scan_receipts.length, 0);
  } finally { w.restore(); }
});

Deno.test('لوحة الحضور: طريقة كل جلسة الفعلية بتخصيص دفعتها، فزر «اعرض رمز الحضور» يتبعها', async () => {
  const w = await world();
  const V = await import('./activities.ts');
  try {
    w.tables.cohorts.find((x) => x.id === OTHER)!.delivery = { 'T-ATTEND': { verify: 'manual' } };
    const o: any = await V.overview();
    const by = Object.fromEntries(o.workshops.map((s: any) => [s.id, s.verify]));
    assertEquals([by[WS], by[WS_OTHER]], ['qr', 'manual']);
    assert(o.workshops.every((s: any) => !('secret' in s)));
  } finally { w.restore(); }
});
