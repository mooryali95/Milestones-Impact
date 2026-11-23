// P1-06 مع #330: صاحب حساب قائم يدخل برابط جهة يُربط بها بحكم رمز الجهة نفسه (sponsorDecision وتثبيت آلي)، فلا يرد
// رابطٌ قرارَ الإدارة في رعايته ولا يأخذ مقعدًا لمنسحب. العالم الوهمي نفسه الذي في seat_return_test.ts
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db } = await import('./core.ts');
const { assignOrg, setStatus } = await import('./admin.ts');
const { adminDecide } = await import('./sponsor.ts');
const { participantFile, participants: expertParticipants } = await import('./file.ts');
const F = await import('./final.ts');
const { access, adminGrant } = await import('./payments.ts');
const { pinSponsorFor, programPaymentDue } = await import('./entitlements.ts');
const P = await import('./participant.ts');

type Row = Record<string, any>;
const get = (r: Row, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), r);

// جداول في الذاكرة: eq وneq وin وis وnot(is null) وorder (الأول) وlimit وrange وmaybeSingle وsingle والعدّ، والإدراج والتحديث والحذف.
// مرشحات الجداول المضمّنة والنص (or وilike) لا تغيّر النتيجة هنا. والدالة pin_sponsor_seat كما في 20261107130000
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const pins: Row[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    let payload: any = null;
    let head = false, single = false, limit = Infinity;
    let range: [number, number] | null = null;
    let order: [string, boolean] | null = null;
    const plain = (c: string) => !/[.>]/.test(c);
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert' || mode === 'upsert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), revoked_at: null, ...x }));
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
      if (order) { const [c, asc] = order; out = [...out].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1)); }
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
        if (k === 'order') return (c: string, o?: any) => { if (plain(c) && !order) order = [c, o?.ascending !== false]; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  // leaders.pin_sponsor_seat بلا الحارس: الجهة النشطة، ثم «مثبّت سلفًا» يكمل الناقص، ثم المقاعد، ثم البندان
  const rpc = (name: string, a: any) => {
    // رمز رعاية (redeem_sponsor_code): يُقبل ما دام صفه في sponsor_codes، وحدّه وانتهاؤه في sponsor_codes_test.ts
    // الاستهلاك والربط معًا (redeem_and_link_sponsor_code، 20261128100000): كالاستهلاك أعلاه ثم الربط بشرط أنه بلا جهة
    if (name === 'redeem_and_link_sponsor_code') {
      const c = (tables.sponsor_codes || []).find((x) => x.code === a.p_code);
      const p = (tables.participants || []).find((x) => x.id === a.p_participant);
      if (c && p && !p.organization_id) Object.assign(p, { organization_id: c.organization_id, org_via: 'link' });
      return Promise.resolve({ data: [{ org_id: c?.organization_id ?? null, reason: c ? 'ok' : 'unknown' }], error: null });
    }
    if (name === 'redeem_sponsor_code') {
      const c = (tables.sponsor_codes || []).find((x) => x.code === a.p_code);
      return Promise.resolve({ data: [{ org_id: c?.organization_id ?? null, reason: c ? 'ok' : 'unknown' }], error: null });
    }
    if (name !== 'pin_sponsor_seat') return Promise.resolve({ data: null, error: null });
    pins.push(a);
    const ents = tables.entitlements ||= [];
    const o = (tables.organizations || []).find((x) => x.id === a.p_org);
    const add = () => {
      for (const item of ['assessment', 'program']) {
        if (ents.some((e) => e.participant_id === a.p_participant && e.item === item && !e.revoked_at)) continue;
        ents.push({ id: `entitlements-${++seq}`, participant_id: a.p_participant, item, source: 'sponsor', organization_id: a.p_org, granted_by: 'sponsor', note: a.p_note,
          value_cents: item === 'program' ? a.p_program_value : 0, currency: a.p_currency, revoked_at: null, created_at: new Date().toISOString() });
      }
    };
    const live = (e: Row) => e.organization_id === a.p_org && e.source === 'sponsor' && !e.revoked_at;
    if (!o || o.status !== 'active') return Promise.resolve({ data: 'inactive', error: null });
    if (ents.some((e) => e.participant_id === a.p_participant && live(e))) { add(); return Promise.resolve({ data: 'exists', error: null }); }
    if (o.seats != null && new Set(ents.filter(live).map((e) => e.participant_id)).size >= o.seats) return Promise.resolve({ data: 'full', error: null });
    add();
    return Promise.resolve({ data: 'granted', error: null });
  };
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  Object.assign(db as any, { from, rpc });
  return { tables, pins, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(900), ORG2 = U(901), EXPERT = U(800);
const ADMIN = { email: 'admin@example.sa', role: 'admin' as const, method: 'passkey' };
const person = (n: number, extra: Row = {}) => ({
  id: U(n), full_name: `مشارك ${n}`, email: `p${n}@example.sa`, status: 'enrolled', organization_id: ORG, organization_name: 'جهة',
  is_demo: false, is_test: false, email_verified_at: '2026-10-01T08:00:00Z', profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-09-30T08:00:00Z', ...extra,
});
const sponsorRows = (n: number) => ['assessment', 'program'].map((item, i) => ({
  id: `ent-${n}-${i}`, participant_id: U(n), item, source: 'sponsor', organization_id: ORG, granted_by: 'sponsor', note: 'جهة',
  value_cents: item === 'program' ? 10000 : 0, currency: 'USD', revoked_at: null, created_at: '2026-10-01T08:00:00Z',
}));
const world = (people: Row[], ents: Row[] = [], more: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  payment_settings: [{ id: true, enabled: true, currency: 'USD', assessment_cents: 100, program_cents: 9900 }],
  organizations: [{ id: ORG, name: 'جهة', short_name: null, status: 'active', seats: 10, contract_cents: 10000, show_value: true, contract_starts: null, contract_ends: null }],
  participants: people,
  entitlements: ents,
  programs: [{ id: 'prog', is_default: true, name: 'البرنامج', final_eval: null }],
  cohorts: [{ id: 'c1', name: 'الدفعة', is_default: true, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-10-01' }],
  experts: [{ id: EXPERT, email: 'expert@example.sa', status: 'active', full_name: 'خبير' }],
  expert_requests: people.map((p) => ({ id: `req-${p.id}`, expert_id: EXPERT, participant_id: p.id, role: 'mentor', status: 'accepted' })),
  handbook_progress: [],
  sponsor_requests: [],
  ...more,
});
const liveSponsor = (t: Record<string, Row[]>, n: number) => (t.entitlements || []).filter((e) => e.participant_id === U(n) && e.source === 'sponsor' && !e.revoked_at);

const { hash } = await import('./core.ts');
// الدخول برابط الجهة لحساب قائم (authVerify برابط البريد، والرمز في pending_profile.org كما يحفظه authStart)
async function loginWithLink(f: any, n: number, org = 'jiha-2026') {
  const link = `link-${n}-${Math.random()}`;
  (f.tables.email_challenges ||= []).push({ id: `ch-${n}`, email: `p${n}@example.sa`, purpose: 'login', code_hash: 'x', link_token_hash: await hash(link),
    pending_profile: { org }, attempts: 0, consumed_at: null, expires_at: new Date(Date.now() + 6e5).toISOString(), created_at: new Date().toISOString() });
  return await P.authVerify({ email: `p${n}@example.sa`, link }, { ip: '127.0.0.1', ua: 'test' } as any) as any;
}
const row = (f: any, n: number) => f.tables.participants.find((x: Row) => x.id === U(n));

Deno.test('X1 فكّته الإدارة عن جهته ثم دخل برابطها: لا يُربط بها ولا يأخذ مقعدًا، والدخول ينجح', async () => {
  const f = install(world([person(40)], sponsorRows(40)));
  f.tables.organizations[0].invite_code = 'jiha-2026';
  try {
    await assignOrg(ADMIN, { participant_ids: [U(40)] });
    assertEquals([row(f, 40).organization_id, liveSponsor(f.tables, 40).length], [null, 0]);
    f.pins.length = 0;
    const r = await loginWithLink(f, 40);
    assertEquals([r.success, !!r.token], [true, true]);
    assertEquals([row(f, 40).organization_id, liveSponsor(f.tables, 40).length, f.pins.length], [null, 0, 0]);
  } finally { f.restore(); }
});

Deno.test('X2 فكّته الإدارة والعقد ممتلئ ثم دخل برابطها: لا طلب مقعد جديد ولا شاشة «رعايتك بانتظار الاعتماد»', async () => {
  const f = install(world([person(41), person(49)], [...sponsorRows(41), ...sponsorRows(49)]));
  Object.assign(f.tables.organizations[0], { invite_code: 'jiha-2026', seats: 2 });
  try {
    await assignOrg(ADMIN, { participant_ids: [U(41)] });
    // مقعده المردود أخذه مشارك آخر، فالعقد ممتلئ
    f.tables.participants.push(person(48)); f.tables.entitlements.push(...sponsorRows(48));
    const r = await loginWithLink(f, 41);
    const pend = (f.tables.sponsor_requests || []).filter((x: Row) => x.participant_id === U(41) && x.status === 'pending');
    assertEquals([row(f, 41).organization_id, pend.length, r.access?.request?.status ?? null], [null, 0, null]);
  } finally { f.restore(); }
});

Deno.test('X3 منسحب بلا قرار يدخل برابط الجهة: يُربط كرمز يكتبه، ولا مقعد', async () => {
  const f = install(world([person(42, { organization_id: null, status: 'withdrawn' })]));
  f.tables.organizations[0].invite_code = 'jiha-2026';
  try {
    const r = await loginWithLink(f, 42);
    assertEquals([r.success, row(f, 42).organization_id, liveSponsor(f.tables, 42).length, f.pins.length], [true, ORG, 0, 0]);
  } finally { f.restore(); }
});

Deno.test('X4 بلا قرار ولا جهة يدخل برابط الجهة: يُربط ويثبَّت مقعده', async () => {
  const f = install(world([person(43, { organization_id: null })]));
  f.tables.organizations[0].invite_code = 'jiha-2026';
  try {
    const r = await loginWithLink(f, 43);
    assertEquals([r.success, row(f, 43).organization_id, liveSponsor(f.tables, 43).length], [true, ORG, 2]);
  } finally { f.restore(); }
});

Deno.test('X5 الحكم نفسه برمز يكتبه: sponsorCode يرد 409 sponsor_decided لمن فكّته الإدارة', async () => {
  const f = install(world([person(44)], sponsorRows(44)));
  f.tables.organizations[0].invite_code = 'jiha-2026';
  // ما يُكتب في «رشّحتك جهة؟» رمز رعاية وحده (قرار المالك)، فيُزرع رمز رعاية للجهة بالنص نفسه
  f.tables.sponsor_codes = [{ id: 'sc-1', organization_id: ORG, code: 'jiha-2026', max_uses: null, used: 0, expires_at: null, active: true }];
  try {
    await assignOrg(ADMIN, { participant_ids: [U(44)] });
    const e: any = await assertRejects(() => P.sponsorCode({ ...row(f, 44) }, { sponsor_code: 'jiha-2026' }));
    assertEquals([e.status, e.code, row(f, 44).organization_id], [409, 'sponsor_decided', null]);
  } finally { f.restore(); }
});
