// P1-04: بوابة البرنامج في موجّه أفعال المشارك. كانت بوابة الدفع وحدها، والرعاية تُثبَّت لحظة الربط، فمن سجّل برابط
// جهته قرأ طلبات أقران دفعتها بأسمائهم ورأى قاعتها وطلب خبراء الشبكة وأخذ رابط الجلسة قبل اعتماد مساره، والمنسحب
// يستعمل البرنامج كله. هنا الموجّه الحقيقي (Deno.serve مستبدَل بالتقاط المعالج) على قاعدة في الذاكرة، والمستخدمون
// الأحياء الثلاثة (الدافع والمرعي والمعفى قبل تفعيل الدفع) معتمدون يبقى لهم كل ما كان
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, hash } = await import('./core.ts');
const { ACTION_GATES } = (await import('./index.ts')) as any;
const P = await import('./participant.ts');

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
  const prev = { from: (db as any).from, rpc: (db as any).rpc };
  Object.assign(db as any, { from, rpc: () => Promise.resolve({ data: null, error: null }) });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(990001), COHORT = U(990002), WS = U(990003), REQ_W = U(990004);
const NOW = Date.now();
// كل اختبار بمعرّفات جديدة: الاعتماد يُحفظ في العامل (index.ts)، فلا يرث اختبار اعتماد غيره
let base = 0;
function people() {
  base += 100;
  const id = (n: number) => U(base + n);
  const who = (n: number, extra: Row) => ({
    id: id(n), full_name: `مشارك ${n}`, email: `p${base + n}@example.sa`, organization_id: ORG, organization_name: 'جهة', is_demo: false, is_test: false,
    email_verified_at: '2026-10-01T08:00:00Z', profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-10-01T08:00:00Z',
    consented_at: '2026-10-01T08:00:00Z', consent_version: null, ...extra,
  });
  return {
    // مرعي معتمد في البرنامج، ومرعي بانتظار الاعتماد، ومرعي معتمد انسحب
    approved: who(1, { status: 'enrolled' }),
    pending: who(2, { status: 'pending_approval' }),
    withdrawn: who(3, { status: 'withdrawn' }),
    // دافع فرد معتمد بلا جهة، ومعفى قبل تفعيل الدفع أنهى البرنامج، كلاهما مسجّل في الدفعة
    paid: who(4, { status: 'placed', organization_id: null }),
    grand: who(5, { status: 'completed', organization_id: null }),
    demo: who(6, { status: 'placed', organization_id: null, is_demo: true, email: 'demo@demo.milestone-impact.org' }),
  };
}
const placements = (pid: string, approved: boolean) => ['milestone', 'impact', 'leadership'].map((dimension) => ({
  participant_id: pid, dimension, level: 'intermediate', source: approved ? 'admin' : 'assessment', approved_at: approved ? '2026-10-05T08:00:00Z' : null,
}));
const ents = (pid: string, source: string) => ['assessment', 'program'].map((item) => ({
  participant_id: pid, item, source, organization_id: source === 'sponsor' ? ORG : null, value_cents: 0, revoked_at: null,
}));

async function world() {
  const ps = people();
  const all = Object.values(ps);
  const tokens: Record<string, string> = {};
  const sessions: Row[] = [];
  for (const [k, p] of Object.entries(ps)) {
    tokens[k] = `token-${p.id}-0123456789`;
    sessions.push({ id: `sess-${p.id}`, participant_id: p.id, token_hash: await hash(tokens[k]), method: 'email_code', revoked_at: null,
      created_at: new Date(NOW - 36e5).toISOString(), expires_at: new Date(NOW + 864e5).toISOString() });
  }
  const tables: Record<string, Row[]> = {
    payment_settings: [{ id: true, enabled: true, currency: 'USD', assessment_cents: 100, program_cents: 9900 }],
    organizations: [{ id: ORG, name: 'جهة', short_name: null, status: 'active', seats: 50, contract_cents: 0, show_value: true }],
    participants: all,
    auth_sessions: sessions,
    placements: [
      ...placements(ps.approved.id, true), ...placements(ps.pending.id, false), ...placements(ps.withdrawn.id, true),
      ...placements(ps.paid.id, true), ...placements(ps.grand.id, true), ...placements(ps.demo.id, true),
    ],
    entitlements: [
      ...ents(ps.approved.id, 'sponsor'), ...ents(ps.pending.id, 'sponsor'), ...ents(ps.withdrawn.id, 'sponsor'),
      ...ents(ps.paid.id, 'paid'), ...ents(ps.grand.id, 'grandfathered'),
    ],
    sponsor_requests: [],
    programs: [{ id: 'prog', is_default: true, name: 'البرنامج', katon_points: null, final_eval: null }],
    cohorts: [{ id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', supervision: 'peers_expert', starts_on: '2026-11-01', advisor_expert_id: null }],
    enrollments: [ps.paid, ps.grand].map((p) => ({ participant_id: p.id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' })),
    journey_stages: [{ program_id: 'prog', key: 'training', sort: 4, title_ar: 'التدريب', active: true }],
    stage_requirements: [{ id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'join' } }],
    workshop_sessions: [{ id: WS, requirement_id: REQ_W, title_ar: 'اليوم الأول', mode: 'online', join_url: 'https://meet.example.sa/day1', active: true, cohort_id: COHORT,
      starts_at: new Date(NOW - 6e5).toISOString(), ends_at: new Date(NOW + 72e5).toISOString() }],
    hall_sessions: [{ id: 'hs', cohort_id: COHORT, stage: 'enter', version: 1, mode: 'live', topic_id: null, sentence_id: null, revealed: [] }],
    hall_presence: [], cohort_roles: [], peer_requests: [], peer_answers: [], audit_log: [], experts: [], expert_requests: [],
    assessments: [], instruments: [], questions: [], assessment_answers: [], certificates: [], workshop_attendance: [],
  };
  const f = install(tables);
  const call = async (who: keyof typeof ps, action: string, body: Row = {}) => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test' },
      body: JSON.stringify({ action, token: tokens[who], ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  return { ps, tables, call, restore: f.restore };
}

// ما ذكره التدقيق: الأقران والقاعة وطلب الخبير ورابط الجلسة وغرفة الموجّه
const EXPOSED: [string, Row][] = [
  ['peer.list', {}], ['peer.ask', { text: 'كيف أبني سجل المعالم لمشروعي الحالي؟', source: 'free' }],
  ['hall.state', {}], ['hall.join', {}], ['experts.suggest', {}], ['experts.choose', { expert_id: U(1) }],
  ['workshop.join', { session_id: WS }], ['coaching.instant', { requirement_id: REQ_W }],
];

Deno.test('من لم يُعتمد مساره يُرد 403 عن الأقران والقاعة وطلب الخبير ورابط الجلسة، ورحلة ما قبل الاعتماد كما هي', async () => {
  const w = await world();
  try {
    for (const [action, body] of EXPOSED) {
      const r = await w.call('pending', action, body);
      assertEquals([action, r.status, r.code], [action, 403, 'locked']);
      assertEquals(r.message, 'يُفتح هذا بعد اعتماد مسارك');
    }
    assertEquals(w.tables.peer_requests.length, 0);
    assertEquals(w.tables.hall_presence.length, 0);
    assertEquals(w.tables.workshop_attendance.length, 0);
    // ما تطلبه شاشات ما قبل الاعتماد: الحساب برئيسيته المجمّعة، ودعوة المدير القبلية، والمختبر، وتقييم الخبير
    const me = await w.call('pending', 'me', { with_home: true });
    assertEquals([me.status, me.success], [200, true]);
    assertEquals([me.preload.lab.success, me.preload.ratings.success, me.preload.sus.success], [true, true, true]);
    for (const a of ['impact.mine', 'lab.list', 'ratings.pending', 'pay.access', 'certificate', 'sessions.list']) {
      const r = await w.call('pending', a);
      assertEquals([a, r.status, r.success], [a, 200, true]);
    }
  } finally { w.restore(); }
});

Deno.test('المنسحب يُرد 403 عن البرنامج وما قبله، ويبقى له حسابه وملفه وبياناته وشهادته', async () => {
  const w = await world();
  try {
    for (const [action, body] of [...EXPOSED, ['assessment.get', {}], ['pay.checkout', { item: 'program' }], ['lab.list', {}], ['rater.invite', { email: 'm@example.sa', phase: 'pre' }]] as [string, Row][]) {
      const r = await w.call('withdrawn', action, body);
      assertEquals([action, r.status, r.code], [action, 403, 'out_of_program']);
    }
    assertEquals(w.tables.peer_requests.length, 0);
    assertEquals(w.tables.hall_presence.length, 0);
    for (const [a, body] of [['me', {}], ['certificate', {}], ['me.export', {}], ['me.privacy', {}], ['sessions.list', {}], ['profile.save', { fields: { bio: 'نبذة' } }]] as [string, Row][]) {
      const r = await w.call('withdrawn', a, body);
      assertEquals([a, r.status, r.success], [a, 200, true]);
    }
    // الرئيسية المجمّعة لا تسقط: ما خرج منه يعود برده، والاستبيان من الحساب
    const me = await w.call('withdrawn', 'me', { with_home: true });
    assertEquals([me.status, me.preload.lab.code, me.preload.ratings.code, me.preload.sus.success], [200, 'out_of_program', 'out_of_program', true]);
  } finally { w.restore(); }
});

Deno.test('المعتمد داخل البرنامج: المرعي والدافع والمعفى يبقى لهم ما كان', async () => {
  const w = await world();
  try {
    for (const who of ['approved', 'paid', 'grand'] as const) {
      for (const a of ['peer.list', 'hall.state', 'experts.suggest']) {
        const r = await w.call(who, a);
        assertEquals([who, a, r.status, r.success], [who, a, 200, true]);
      }
      const j = await w.call(who, 'workshop.join', { session_id: WS });
      assertEquals([who, j.status, j.join_url], [who, 200, 'https://meet.example.sa/day1']);
      const h = await w.call(who, 'hall.join');
      assertEquals([who, h.status, h.success], [who, 200, true]);
      // طلب الخبير يصل دالته: يرد باختيار من المقترحين لا ببوابة البرنامج
      const x = await w.call(who, 'experts.choose', { expert_id: U(1) });
      assertEquals([who, x.status], [who, 400]);
    }
    const ask = await w.call('approved', 'peer.ask', { text: 'كيف أبني سجل المعالم لمشروعي الحالي؟', source: 'free' });
    assertEquals([ask.status, ask.success, w.tables.peer_requests.length], [200, true, 1]);
  } finally { w.restore(); }
});

Deno.test('أعضاء القاعة من cohortMembers ومنهم من تفتح له البوابة وحده: لا يُعرض فيها من لم يُعتمد ولا المنسحب', async () => {
  const w = await world();
  try {
    const st = await w.call('approved', 'hall.state');
    assertEquals(st.success, true);
    const ids = (st.people || []).map((x: any) => x.id).sort();
    assertEquals(ids, [w.ps.approved.id, w.ps.paid.id, w.ps.grand.id].sort());
    assertEquals(st.total, 3);
  } finally { w.restore(); }
});

Deno.test('حساب العرض: رابط الجلسة ورمز الجهة وبدء 360 مغلقة عليه', async () => {
  const w = await world();
  try {
    for (const a of ['workshop.join', 'me.sponsor-code', 'f360.start']) {
      const r = await w.call('demo', a, { session_id: WS, code: 'abcd' });
      assertEquals([a, r.status, r.code], [a, 403, 'demo']);
    }
  } finally { w.restore(); }
});

Deno.test('إرسال القياس يغيّر الحالة ممن لم يبلغ القرار وحده: لا يعيد المنسحب ولا ينزل الملتحق', async () => {
  const w = await world();
  try {
    const cases: [string, string, string][] = [['withdrawn', 'withdrawn', 'withdrawn'], ['approved', 'enrolled', 'enrolled'], ['grand', 'completed', 'completed'], ['pending', 'profiled', 'pending_approval']];
    w.tables.instruments.push({ id: 'inst', kind: 'baseline', active: true });
    for (const [who, from, to] of cases) {
      const p = (w.ps as any)[who];
      p.status = from;
      w.tables.assessments.push({ id: `as-${p.id}`, participant_id: p.id, instrument_id: 'inst', status: 'in_progress', form: null, started_at: '2026-11-01T08:00:00Z' });
      const r: any = await P.assessmentSubmit({ ...p }, { assessment_id: `as-${p.id}` });
      assertEquals(r.success, true);
      assertEquals([who, w.tables.participants.find((x) => x.id === p.id)!.status], [who, to]);
    }
    // والمنسحب لا يبلغ الإرسال من الموجّه أصلًا
    const p = w.ps.withdrawn;
    w.tables.assessments.push({ id: 'as-again', participant_id: p.id, instrument_id: 'inst', status: 'in_progress', form: null, started_at: '2026-11-01T08:00:00Z' });
    const r = await w.call('withdrawn', 'assessment.submit', { assessment_id: 'as-again' });
    assertEquals([r.status, r.code, w.tables.assessments.find((a) => a.id === 'as-again')!.status], [403, 'out_of_program', 'in_progress']);
  } finally { w.restore(); }
});

Deno.test('كل فعل في خريطة المشارك مصنّف مرة: بوابة البرنامج، وحساب العرض مغلق أو مفتوح', () => {
  const { actions, account, pre, program, demoBlocked, demoOpen } = ACTION_GATES;
  assert(actions.length > 80);
  const once = (sets: Set<string>[]) => actions.filter((a: string) => sets.filter((s) => s.has(a)).length !== 1);
  assertEquals(once([account, pre, program]), []);
  assertEquals(once([demoBlocked, demoOpen]), []);
  // ولا تصنيف لفعل ليس في الخريطة
  const known = new Set(actions);
  assertEquals([...account, ...pre, ...program, ...demoBlocked, ...demoOpen].filter((a) => !known.has(a)), []);
  // ما سمّاه التدقيق في مكانه
  for (const a of ['peer.list', 'peer.ask', 'peer.answer', 'peer.close', 'hall.state', 'hall.join', 'hall.hand', 'hall.pick', 'experts.suggest', 'experts.choose', 'workshop.join', 'coaching.instant']) assert(program.has(a), a);
  for (const a of ['me', 'profile.save', 'me.export', 'me.erase-request', 'certificate', 'profile.confirm-name', 'me.switch', 'logout']) assert(account.has(a), a);
  for (const a of ['assessment.get', 'assessment.answer', 'assessment.submit', 'pay.checkout', 'sponsor.request', 'profile.save']) assert(!program.has(a), a);
  for (const a of ['workshop.join', 'me.sponsor-code', 'f360.start']) assert(demoBlocked.has(a), a);
});
