// P1-06: رد المقعد عند الانسحاب، وسحب الإعفاء، ورفض طلب المقعد، لا يُنقض بقراءة ملف. كان access() يثبّت احتياطًا
// لكل مرتبط بجهة نشطة ينقصه بند، فملف الإدارة (admin.participant) وقائمة الخبير (xp.participants) والتقييم الختامي
// (admin.final-eval) تقرأ كلها mePayload ثم access، فيُستهلك المقعد المردود في النقرة نفسها. دالة المقاعد هنا بسلوكها
// قبل الحارس (بلا نظر في الإلغاء ولا الحالة)، فما يمنع التثبيت هو فحص الخادم وحده، ويبقى الحارس في القاعدة طبقة ثانية.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1';
const { db } = await import('./core.ts');
const { setStatus } = await import('./admin.ts');
const { participantFile, participants: expertParticipants } = await import('./file.ts');
const F = await import('./final.ts');
const { access, adminGrant } = await import('./payments.ts');
const { pinSponsorFor } = await import('./entitlements.ts');

type Row = Record<string, any>;
const get = (r: Row, path: string) => path.split('.').reduce((v: any, k) => (v == null ? v : v[k]), r);

// جداول في الذاكرة: eq وneq وin وis وnot(is null) وlimit وrange وmaybeSingle وsingle والعدّ، والإدراج والتحديث والحذف.
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
  // leaders.pin_sponsor_seat بلا الحارس: الجهة النشطة، ثم «مثبّت سلفًا» يكمل الناقص، ثم المقاعد، ثم البندان
  const rpc = (name: string, a: any) => {
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
const ORG = U(900), EXPERT = U(800);
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
// الشاشات الثلاث التي كانت تعيد التثبيت، بالمدخل نفسه الذي تستدعيه index.ts
const VIEWS: [string, (n: number) => Promise<unknown>][] = [
  ['admin.participant', (n) => participantFile(U(n), 'admin', { viewer: { email: ADMIN.email } })],
  ['xp.participants', () => expertParticipants({ id: EXPERT, email: 'expert@example.sa' })],
  ['admin.final-eval', (n) => F.get({ participant_id: U(n) }, ADMIN)],
];
async function openViews(n: number) { for (const [, view] of VIEWS) await view(n); }

// كل شاشة تبلغ التثبيت الاحتياطي فعلًا: مرعي ينقصه البند يُثبَّت من أي منها وحدها
Deno.test('كل شاشة من الثلاث تمر بالتثبيت الاحتياطي في access', async () => {
  for (const [name, view] of VIEWS) {
    const f = install(world([person(7)]));
    try {
      await view(7);
      assertEquals([f.pins.length, liveSponsor(f.tables, 7).length], [1, 2], name);
    } finally { f.restore(); }
  }
});

Deno.test('الانسحاب قبل أول باب يرد المقعد، وملف الإدارة وقائمة الخبير والتقييم الختامي لا تعيده', async () => {
  const f = install(world([person(1)], sponsorRows(1)));
  try {
    const r: any = await setStatus(ADMIN, { participant_id: U(1), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    assertEquals(r.done, 1);
    assertEquals(f.tables.entitlements.map((e) => [e.item, e.revoked_by]), [['assessment', 'seat-return'], ['program', 'seat-return']]);
    for (const [name, view] of VIEWS) {
      await view(1);
      assertEquals([liveSponsor(f.tables, 1), f.pins], [[], []], name);
    }
    assertEquals(f.tables.entitlements.length, 2, 'لا صف إعفاء جديد');
    // والمشارك نفسه (pay.access) لا يُعرض عليه «برعاية جهتك»
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor], [null, null, null]);
    assertEquals(f.pins, []);
  } finally { f.restore(); }
});

Deno.test('عودته إلى البرنامج بعد رد مقعده لا تعيد الرعاية تلقائيًا، ولا مسار الربط', async () => {
  const f = install(world([person(2)], sponsorRows(2)));
  try {
    await setStatus(ADMIN, { participant_id: U(2), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    await setStatus(ADMIN, { participant_id: U(2), status: 'enrolled' });
    await openViews(2);
    assertEquals(await pinSponsorFor(U(2)), false);
    assertEquals([liveSponsor(f.tables, 2), f.pins], [[], []]);
  } finally { f.restore(); }
});

Deno.test('مرعي بلا إلغاء ينقصه البند يُثبَّت كما كان: استدعاء واحد بقيمة جهته، ثم لا شيء', async () => {
  const f = install(world([person(3)]));
  try {
    await openViews(3);
    assertEquals(f.pins, [{ p_participant: U(3), p_org: ORG, p_program_value: 10000, p_currency: 'USD', p_note: 'جهة' }]);
    assertEquals(liveSponsor(f.tables, 3).map((e) => [e.item, e.value_cents]), [['assessment', 0], ['program', 10000]]);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor?.name, a.sponsor?.value_cents], ['sponsor', 'sponsor', 'جهة', 10000]);
    assertEquals(f.pins.length, 1);
  } finally { f.restore(); }
});

Deno.test('سحب إعفاء البرنامج يدويًا يبقى مسحوبًا: لا يكمله «مثبّت سلفًا» في القراءة التالية', async () => {
  const f = install(world([person(4)], sponsorRows(4)));
  try {
    await adminGrant(ADMIN, { participant_id: U(4), item: 'program', revoke: true });
    await openViews(4);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program], ['sponsor', null]);
    assertEquals([liveSponsor(f.tables, 4).map((e) => e.item), f.pins], [['assessment'], []]);
  } finally { f.restore(); }
});

Deno.test('طلب المقعد المرفوض قرار بالدفع الفردي: مقعد يتحرر بعده لا يثبّته، والطلب المرفوض يصل الواجهة', async () => {
  const f = install(world([person(5)], [], {
    sponsor_requests: [{ id: 'sr1', participant_id: U(5), organization_id: ORG, typed_name: 'جهة', kind: 'seats', status: 'rejected', reason: 'اكتمل العقد', created_at: '2026-11-01T08:00:00Z' }],
  }));
  try {
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor, a.request?.status], [null, null, null, 'rejected']);
    assertEquals([f.pins, f.tables.entitlements], [[], []]);
  } finally { f.restore(); }
});

Deno.test('الموقوف لا يُثبَّت له، ورفع الإيقاف بلا إلغاء سابق يثبّته كما كان', async () => {
  const f = install(world([person(6, { status: 'suspended' })]));
  try {
    await openViews(6);
    assertEquals([f.pins, f.tables.entitlements], [[], []]);
    await setStatus(ADMIN, { participant_id: U(6), status: 'enrolled' });
    await access(f.tables.participants[0]);
    assertEquals(f.pins.length, 1);
    assertEquals(liveSponsor(f.tables, 6).length, 2);
  } finally { f.restore(); }
});
