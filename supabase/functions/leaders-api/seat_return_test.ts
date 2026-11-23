// P1-06: رد المقعد عند الانسحاب، وسحب الإعفاء، ورفض طلب المقعد، لا يُنقض بقراءة ملف. كان access() يثبّت احتياطًا
// لكل مرتبط بجهة نشطة ينقصه بند، فملف الإدارة (admin.participant) وقائمة الخبير (xp.participants) والتقييم الختامي
// (admin.final-eval) تقرأ كلها mePayload ثم access، فيُستهلك المقعد المردود في النقرة نفسها. دالة المقاعد هنا بسلوكها
// قبل الحارس (بلا نظر في الإلغاء ولا الحالة)، فما يمنع التثبيت هو فحص الخادم وحده، ويبقى الحارس في القاعدة طبقة ثانية.
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
  experts: [{ id: EXPERT, email: 'expert@example.sa', status: 'active', roles: ['mentor'], full_name: 'خبير' }],
  expert_requests: people.map((p) => ({ id: `req-${p.id}`, expert_id: EXPERT, participant_id: p.id, role: 'mentor', status: 'accepted' })),
  handbook_progress: [],
  sponsor_requests: [],
  ...more,
});
const liveSponsor = (t: Record<string, Row[]>, n: number) => (t.entitlements || []).filter((e) => e.participant_id === U(n) && e.source === 'sponsor' && !e.revoked_at);
// الشاشات الثلاث التي كانت تعيد التثبيت، بالمدخل نفسه الذي تستدعيه index.ts
const VIEWS: [string, (n: number) => Promise<unknown>][] = [
  ['admin.participant', (n) => participantFile(U(n), 'admin', { viewer: { email: ADMIN.email } })],
  ['xp.participants', () => expertParticipants({ id: EXPERT, email: 'expert@example.sa', status: 'active', roles: ['mentor'] })],
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

// رد المقعد ليس قرارًا بسحب الرعاية: يحرسه الانسحاب نفسه، فالعودة إلى البرنامج تعيد التثبيت بفحص المقاعد لحظتها.
// كانت تُبقي المرعي المعاد على بوابة الدفع، ولا فعل للإدارة يعيد مقعده إلا منحًا خارج العقد
Deno.test('عودته إلى البرنامج بعد رد مقعده تعيد رعاية جهته بفحص المقاعد لحظتها، ثم لا تثبيت مكرر', async () => {
  const f = install(world([person(2)], sponsorRows(2)));
  try {
    await setStatus(ADMIN, { participant_id: U(2), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    assertEquals([liveSponsor(f.tables, 2), f.pins], [[], []]);
    await setStatus(ADMIN, { participant_id: U(2), status: 'enrolled' });
    assertEquals(f.pins.length, 1);
    assertEquals(liveSponsor(f.tables, 2).map((e) => [e.item, e.organization_id]), [['assessment', ORG], ['program', ORG]]);
    await openViews(2);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor?.name], ['sponsor', 'sponsor', 'جهة']);
    assertEquals(f.pins.length, 1);
  } finally { f.restore(); }
});

Deno.test('العودة إلى البرنامج وعقد الجهة ممتلئ: لا مقعد فوق العقد، وطلب مقعد بانتظار القرار كالمعتاد', async () => {
  const f = install(world([person(20), person(21)], sponsorRows(20)));
  f.tables.organizations[0].seats = 1;
  try {
    await setStatus(ADMIN, { participant_id: U(20), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    // المقعد المردود يأخذه غيره
    assertEquals(await pinSponsorFor(U(21)), true);
    await setStatus(ADMIN, { participant_id: U(20), status: 'enrolled' });
    assertEquals(liveSponsor(f.tables, 20), []);
    assertEquals(f.tables.sponsor_requests.map((r) => [r.participant_id, r.kind, r.status]), [[U(20), 'seats', 'pending']]);
  } finally { f.restore(); }
});

// النقل والعودة فعل صريح من الإدارة: يعيد رعاية الجهة الأولى، ولا يحجب سحبُ النقلِ الأولِ التثبيتَ بعده
Deno.test('نقله إلى جهة أخرى ثم إعادته إلى جهته يعيد رعايتها، ويبقى ما بعدها (الانسحاب ثم العودة) كما هو', async () => {
  const f = install(world([person(8)], sponsorRows(8)));
  f.tables.organizations.push({ id: ORG2, name: 'جهة ثانية', short_name: null, status: 'active', seats: 10, contract_cents: 5000, show_value: true, contract_starts: null, contract_ends: null });
  try {
    const toB: any = await assignOrg(ADMIN, { participant_ids: [U(8)], organization_id: ORG2 });
    assertEquals([toB.revoked_sponsor, toB.pinned], [2, 1]);
    const back: any = await assignOrg(ADMIN, { participant_ids: [U(8)], organization_id: ORG });
    assertEquals([back.revoked_sponsor, back.pinned], [2, 1]);
    assertEquals(liveSponsor(f.tables, 8).map((e) => [e.item, e.organization_id, e.value_cents]), [['assessment', ORG, 0], ['program', ORG, 10000]]);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor?.name], ['sponsor', 'sponsor', 'جهة']);
    await setStatus(ADMIN, { participant_id: U(8), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    await setStatus(ADMIN, { participant_id: U(8), status: 'enrolled' });
    assertEquals(liveSponsor(f.tables, 8).map((e) => e.organization_id), [ORG, ORG]);
  } finally { f.restore(); }
});

// الربط الآلي (النطاق أو الرمز) بعد فك الإدارة لا يعيد الرعاية، والنقل الصريح إلى الجهة نفسها يعيدها
Deno.test('بعد فك الإدارة: الربط الآلي لا يعيد الرعاية، ونقل الإدارة إلى الجهة يعيدها بفحص المقاعد', async () => {
  const f = install(world([person(10)], sponsorRows(10)));
  try {
    await assignOrg(ADMIN, { participant_ids: [U(10)] });
    assertEquals(liveSponsor(f.tables, 10), []);
    f.tables.participants[0].organization_id = ORG;
    assertEquals(await pinSponsorFor(U(10), { auto: true }), false);
    await openViews(10);
    assertEquals([liveSponsor(f.tables, 10), f.pins], [[], []]);
    const r: any = await assignOrg(ADMIN, { participant_ids: [U(10)], organization_id: ORG });
    assertEquals([r.pinned, liveSponsor(f.tables, 10).length, f.pins.length], [1, 2, 1]);
  } finally { f.restore(); }
});

const claim = (id: string, n: number, extra: Row = {}) => {
  const p = person(n, extra);
  return { id, participant_id: p.id, organization_id: p.organization_id, typed_name: 'جهة', status: 'pending', created_at: '2026-11-10T08:00:00Z',
    participants: { id: p.id, full_name: p.full_name, email: p.email, organization_id: p.organization_id, status: p.status }, ...(extra.request || {}) };
};

Deno.test('قبول طلب رعاية بعد فك الإدارة فعل صريح: يثبّت الرعاية ويُعتمد الطلب', async () => {
  const f = install(world([person(11)], sponsorRows(11)));
  try {
    await assignOrg(ADMIN, { participant_ids: [U(11)] });
    f.tables.sponsor_requests.push(claim('sr-claim', 11, { organization_id: null, request: { kind: 'claim' } }));
    const r: any = await adminDecide(ADMIN, { id: 'sr-claim', approve: true, organization_id: ORG });
    assertEquals(r.success, true);
    assertEquals(liveSponsor(f.tables, 11).length, 2);
    assertEquals(f.tables.sponsor_requests.find((x) => x.id === 'sr-claim')!.status, 'approved');
  } finally { f.restore(); }
});

Deno.test('قبول طلب مقعد لمن سُحب إعفاؤه من جهته: مقعد واحد يُضاف ويُستهلك، والطلب يُعتمد', async () => {
  const gone = sponsorRows(13).map((e) => ({ ...e, revoked_at: '2026-11-02T08:00:00Z', revoked_by: 'admin@example.sa' }));
  const f = install(world([person(13), person(14)], [...gone, ...sponsorRows(14)]));
  f.tables.organizations[0].seats = 1;
  try {
    f.tables.sponsor_requests.push(claim('sr-seats', 13, { request: { kind: 'seats' } }));
    const r: any = await adminDecide(ADMIN, { id: 'sr-seats', approve: true, reason: 'مقعد إضافي بقرار الجهة' });
    assertEquals(r.success, true);
    assertEquals([f.tables.organizations[0].seats, liveSponsor(f.tables, 13).length], [2, 2]);
    assertEquals(f.tables.sponsor_requests.find((x) => x.id === 'sr-seats')!.status, 'approved');
  } finally { f.restore(); }
});

// كان القبول يضيف المقعد إلى العقد ثم يفشل التثبيت (خارج البرنامج)، فيزيد العقد مقعدًا مع كل نقرة والطلب معلّق
Deno.test('قبول طلب مقعد لمنسحب يُرد قبل أي كتابة: لا مقعد يُضاف مع كل محاولة، والطلب كما هو', async () => {
  const f = install(world([person(12, { status: 'withdrawn' })]));
  try {
    f.tables.sponsor_requests.push(claim('sr-out', 12, { status: 'withdrawn', request: { kind: 'seats' } }));
    for (let i = 0; i < 2; i++) {
      const e: any = await assertRejects(() => adminDecide(ADMIN, { id: 'sr-out', approve: true, reason: 'مقعد إضافي بقرار الجهة' }));
      assertEquals([e.status, e.code], [409, 'out_of_program']);
    }
    assertEquals(f.tables.organizations[0].seats, 10);
    assertEquals(f.tables.sponsor_requests[0].status, 'pending');
    assertEquals((f.tables.audit_log || []).filter((x) => x.action === 'sponsor.seat-added'), []);
    assertEquals([liveSponsor(f.tables, 12), f.pins], [[], []]);
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

// ── قرار الإدارة الصريح يبقى أثره في سجل المشارك (participant.org)، ولو لم يُثبَّت به شيء لحظتها ──
const second = (t: Record<string, Row[]>) => t.organizations.push({ id: ORG2, name: 'جهة ثانية', short_name: null, status: 'active', seats: 10, contract_cents: 5000, show_value: true, contract_starts: null, contract_ends: null });
const progress = (n: number) => ({ participant_id: U(n), module_id: 'm1', created_at: '2026-10-20T08:00:00Z' });

// كان النقل الصريح لمنسحب لا يترك أثرًا (التثبيت out)، فعودته تقرأ سحب النقل الأول إلغاءً فيبقى المرعي بلا رعاية ولا طلب
Deno.test('نقله إلى جهة ثم انسحابه ثم إعادته إلى جهته وهو منسحب ثم عودته إلى البرنامج: تعود رعاية جهته', async () => {
  const f = install(world([person(30)], sponsorRows(30)));
  second(f.tables);
  try {
    await assignOrg(ADMIN, { participant_ids: [U(30)], organization_id: ORG2 });
    await setStatus(ADMIN, { participant_id: U(30), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    const back: any = await assignOrg(ADMIN, { participant_ids: [U(30)], organization_id: ORG });
    assertEquals([back.revoked_sponsor, back.pinned, liveSponsor(f.tables, 30)], [0, 0, []]);
    // أثر القرار في سجله بجهته قبله وبعده
    assertEquals((f.tables.audit_log || []).filter((x) => x.action === 'participant.org' && x.entity === 'participants').map((x) => [x.before.org, x.after.org]), [[ORG, ORG2], [ORG2, ORG]]);
    await setStatus(ADMIN, { participant_id: U(30), status: 'enrolled' });
    assertEquals(liveSponsor(f.tables, 30).map((e) => e.organization_id), [ORG, ORG]);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.assessment, a.program, a.sponsor?.name], ['sponsor', 'sponsor', 'جهة']);
  } finally { f.restore(); }
});

Deno.test('انسحابه بعد تقدّم (المقعد باقٍ) ثم فكّه ثم ربطه بجهته وهو منسحب ثم عودته: تعود رعاية جهته', async () => {
  const f = install(world([person(31)], sponsorRows(31), { handbook_progress: [progress(31)] }));
  try {
    await setStatus(ADMIN, { participant_id: U(31), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    assertEquals(liveSponsor(f.tables, 31).length, 2);
    const off: any = await assignOrg(ADMIN, { participant_ids: [U(31)] });
    assertEquals(off.revoked_sponsor, 2);
    await assignOrg(ADMIN, { participant_ids: [U(31)], organization_id: ORG });
    assertEquals(liveSponsor(f.tables, 31), []);
    await setStatus(ADMIN, { participant_id: U(31), status: 'enrolled' });
    assertEquals(liveSponsor(f.tables, 31).map((e) => e.organization_id), [ORG, ORG]);
    assertEquals((await access(f.tables.participants[0]) as any).program, 'sponsor');
  } finally { f.restore(); }
});

// كان فك الإدارة لمنسحب رُد مقعده لا يُكتب (لا إعفاء حي يُسحب)، فالربط بالنطاق ثم العودة يأخذ مقعدًا من الجهة خلاف قرارها
Deno.test('فكّه وهو منسحب رُد مقعده: لا يربطه النطاق بجهته، ولا تعيد العودة مقعدها ولو رُبط بها آليًا', async () => {
  const f = install(world([person(32)], sponsorRows(32)));
  Object.assign(f.tables.organizations[0], { domains: ['example.sa'], invite_code: 'jiha-2026' });
  try {
    await setStatus(ADMIN, { participant_id: U(32), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    const off: any = await assignOrg(ADMIN, { participant_ids: [U(32)] });
    assertEquals(off.revoked_sponsor, 0);
    // الدخول التالي لا يربطه بنطاق بريده
    const me: any = await P.me({ ...f.tables.participants[0] });
    assertEquals([me.success, f.tables.participants[0].organization_id], [true, null]);
    // ولو رُبط آليًا (كما كان)، فالعودة لا تثبّت
    f.tables.participants[0].organization_id = ORG;
    await setStatus(ADMIN, { participant_id: U(32), status: 'enrolled' });
    assertEquals([liveSponsor(f.tables, 32), f.pins], [[], []]);
  } finally { f.restore(); }
});

// رمز الجهة بعد قرار الإدارة: كان يربطه بلا رعاية فيختفي النموذج ولا سبب. الآن يُرد بسببه قبل الربط
Deno.test('رمز الجهة بعد سحب الإدارة رعايتها أو رفض طلب مقعده: يُرد 409 بسببه ولا ربط، وبلا قرار يربط ويثبّت', async () => {
  const gone = sponsorRows(33).map((e) => ({ ...e, revoked_at: '2026-11-02T08:00:00Z', revoked_by: 'admin@example.sa' }));
  const f = install(world([person(33, { organization_id: null }), person(34, { organization_id: null }), person(35, { organization_id: null })], gone, {
    sponsor_requests: [{ id: 'sr-r', participant_id: U(34), organization_id: ORG, typed_name: 'جهة', kind: 'seats', status: 'rejected', reason: 'اكتمل العقد', created_at: '2026-11-01T08:00:00Z', decided_at: '2026-11-01T09:00:00Z' }],
  }));
  f.tables.organizations[0].invite_code = 'jiha-2026';
  // ما يُكتب في «رشّحتك جهة؟» رمز رعاية وحده (قرار المالك)، فيُزرع رمز رعاية للجهة بالنص نفسه
  f.tables.sponsor_codes = [{ id: 'sc-1', organization_id: ORG, code: 'jiha-2026', max_uses: null, used: 0, expires_at: null, active: true }];
  try {
    for (const [n, word] of [[33, 'أنهت الإدارة'], [34, 'دفع فردي']] as [number, string][]) {
      const e: any = await assertRejects(() => P.sponsorCode({ ...f.tables.participants.find((x) => x.id === U(n)) }, { sponsor_code: 'jiha-2026' }));
      assertEquals([e.status, e.code, String(e.message).includes(word)], [409, 'sponsor_decided', true]);
      assertEquals(f.tables.participants.find((x) => x.id === U(n))!.organization_id, null);
    }
    const ok: any = await P.sponsorCode({ ...f.tables.participants.find((x) => x.id === U(35)) }, { sponsor_code: 'jiha-2026' });
    assertEquals([ok.success, liveSponsor(f.tables, 35).length], [true, 2]);
    assertEquals(f.pins.map((x) => x.p_participant), [U(35)]);
  } finally { f.restore(); }
});

// رفض قديم نقضه فعل صريح بعده: كان يمنع طلب المقعد الجديد، فيبقى المرعي المعاد على بوابة الدفع وأمامه الرفض القديم
Deno.test('رفض قديم ثم رعاية صريحة ثم انسحاب ثم عقد ممتلئ عند العودة: طلب مقعد جديد بانتظار القرار', async () => {
  const f = install(world([person(36), person(37)], [], {
    sponsor_requests: [{ id: 'sr-old', participant_id: U(36), organization_id: ORG, typed_name: 'جهة', kind: 'seats', status: 'rejected', reason: 'اكتمل العقد', created_at: '2026-11-01T08:00:00Z', decided_at: '2026-11-01T09:00:00Z' }],
  }));
  f.tables.organizations[0].seats = 1;
  try {
    const r: any = await assignOrg(ADMIN, { participant_ids: [U(36)], organization_id: ORG });
    assertEquals([r.pinned, liveSponsor(f.tables, 36).length], [1, 2]);
    await setStatus(ADMIN, { participant_id: U(36), status: 'withdrawn', reason: 'انسحب لظرف عمل' });
    assertEquals(await pinSponsorFor(U(37)), true);
    await setStatus(ADMIN, { participant_id: U(36), status: 'enrolled' });
    assertEquals(liveSponsor(f.tables, 36), []);
    assertEquals(f.tables.sponsor_requests.filter((x) => x.participant_id === U(36)).map((x) => [x.kind, x.status]), [['seats', 'rejected'], ['seats', 'pending']]);
    const a: any = await access(f.tables.participants[0]);
    assertEquals([a.program, a.request?.status, a.request?.kind], [null, 'pending', 'seats']);
  } finally { f.restore(); }
});

// قبول طلب مقعد: ما يرده التثبيت يُرد قبل إضافة المقعد، والمقعد المضاف يُرد إن لم يُستهلك (كان يزيد مع كل محاولة)
Deno.test('قبول طلب مقعد وعقد الجهة انتهت مدته أو تعذّر الفحص: لا مقعد يُضاف مع أي محاولة، والطلب كما هو', async () => {
  const f = install(world([person(38), person(39)], sponsorRows(39)));
  Object.assign(f.tables.organizations[0], { seats: 1, contract_ends: '2026-11-01' });
  try {
    f.tables.sponsor_requests.push(claim('sr-late', 38, { request: { kind: 'seats', created_at: '2026-10-20T08:00:00Z' } }));
    for (let i = 0; i < 3; i++) {
      const e: any = await assertRejects(() => adminDecide(ADMIN, { id: 'sr-late', approve: true, reason: 'مقعد إضافي بقرار الجهة' }));
      assertEquals([e.status, e.code, String(e.message).includes('مدة العقد')], [409, 'seat_blocked', true]);
    }
    assertEquals(f.tables.organizations[0].seats, 1);
    // العقد يُمدد، والفحص يتعذّر لحظة القبول: المقعد المضاف يُرد
    f.tables.organizations[0].contract_ends = null;
    const rpc = (db as any).rpc;
    (db as any).rpc = () => Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } });
    for (let i = 0; i < 2; i++) {
      const e: any = await assertRejects(() => adminDecide(ADMIN, { id: 'sr-late', approve: true, reason: 'مقعد إضافي بقرار الجهة' }));
      assertEquals([e.status, e.code], [409, 'seat_blocked']);
    }
    (db as any).rpc = rpc;
    assertEquals(f.tables.organizations[0].seats, 1);
    assertEquals((f.tables.audit_log || []).filter((x) => x.action === 'sponsor.seat-added'), []);
    assertEquals(f.tables.sponsor_requests.find((x) => x.id === 'sr-late')!.status, 'pending');
    // ثم يُقبل: مقعد واحد يُضاف ويُستهلك
    const ok: any = await adminDecide(ADMIN, { id: 'sr-late', approve: true, reason: 'مقعد إضافي بقرار الجهة' });
    assertEquals([ok.success, f.tables.organizations[0].seats, liveSponsor(f.tables, 38).length], [true, 2, 2]);
    assertEquals((f.tables.audit_log || []).filter((x) => x.action === 'sponsor.seat-added').map((x) => [x.before.seats, x.after.seats]), [[1, 2]]);
  } finally { f.restore(); }
});

Deno.test('قبول طلب مقعد وقد تحرر مقعد: يأخذه بلا إضافة إلى العقد', async () => {
  const f = install(world([person(40)]));
  f.tables.organizations[0].seats = 1;
  try {
    f.tables.sponsor_requests.push(claim('sr-free', 40, { request: { kind: 'seats' } }));
    const ok: any = await adminDecide(ADMIN, { id: 'sr-free', approve: true, reason: 'مقعد إضافي بقرار الجهة' });
    assertEquals([ok.success, f.tables.organizations[0].seats, liveSponsor(f.tables, 40).length], [true, 1, 2]);
    assertEquals((f.tables.audit_log || []).filter((x) => x.action === 'sponsor.seat-added'), []);
  } finally { f.restore(); }
});

// الدافع والمعفى المرتبطان بجهة عقدها ممتلئ: لا طلب مقعد عند عودتهما، ولا مقعد يُضاف بقبول طلب قديم
const paidRows = (n: number, source = 'paid') => ['assessment', 'program'].map((item, i) => ({
  id: `ent-${source}-${n}-${i}`, participant_id: U(n), item, source, organization_id: null, granted_by: source, note: null, value_cents: 0, currency: 'USD', revoked_at: null, created_at: '2026-10-01T08:00:00Z',
}));
Deno.test('رفع إيقاف دافع أو معفى وعقد جهته ممتلئ: لا تثبيت ولا طلب مقعد ولا بريد انتظار، وقبول طلب قديم لا يضيف مقعدًا', async () => {
  const f = install(world([person(41, { status: 'suspended' }), person(42, { status: 'suspended' }), person(43)], [...paidRows(41), ...paidRows(42, 'grandfathered'), ...sponsorRows(43)]));
  f.tables.organizations[0].seats = 1;
  try {
    await setStatus(ADMIN, { participant_ids: [U(41), U(42)], status: 'enrolled' });
    assertEquals([f.pins, f.tables.sponsor_requests], [[], []]);
    // ونقل الإدارة لهما إلى الجهة لا يعدّهما تثبيتًا ولا يفتح طلبًا
    const r: any = await assignOrg(ADMIN, { participant_ids: [U(41), U(42)], organization_id: ORG });
    assertEquals([r.pinned, f.pins, f.tables.sponsor_requests], [0, [], []]);
    f.tables.sponsor_requests.push(claim('sr-paid', 41, { request: { kind: 'seats' } }));
    const ok: any = await adminDecide(ADMIN, { id: 'sr-paid', approve: true, reason: 'مقعد إضافي بقرار الجهة' });
    assertEquals([ok.success, f.tables.organizations[0].seats, liveSponsor(f.tables, 41)], [true, 1, []]);
  } finally { f.restore(); }
});

// رسم البرنامج مستحق بالقاعدة التي يحكم بها access(): من سُحب إعفاؤه أو رُفض طلبه يُطالب بالدفع، ومن ينتظر قراره لا
Deno.test('استحقاق رسم البرنامج كما يحكم access(): المسحوب والمرفوض عليهما الرسم، والمرعي والمنتظر لا', async () => {
  const f = install(world([person(44), person(45), person(46), person(47)], [...sponsorRows(44), ...sponsorRows(47)], {
    sponsor_requests: [
      { id: 'sr-rej', participant_id: U(45), organization_id: ORG, typed_name: 'جهة', kind: 'seats', status: 'rejected', reason: 'اكتمل العقد', created_at: '2026-11-01T08:00:00Z', decided_at: '2026-11-01T09:00:00Z' },
      { id: 'sr-wait', participant_id: U(46), organization_id: ORG, typed_name: 'جهة', kind: 'seats', status: 'pending', created_at: '2026-11-10T08:00:00Z' },
    ],
  }));
  f.tables.organizations[0].seats = 1;
  try {
    await adminGrant(ADMIN, { participant_id: U(44), item: 'program', revoke: true });
    const due = async (n: number) => [await programPaymentDue(U(n)), (await access(f.tables.participants.find((x) => x.id === U(n))) as any).program];
    assertEquals(await due(44), [true, null]);
    assertEquals(await due(45), [true, null]);
    assertEquals(await due(46), [false, null]);
    assertEquals(await due(47), [false, 'sponsor']);
  } finally { f.restore(); }
});
