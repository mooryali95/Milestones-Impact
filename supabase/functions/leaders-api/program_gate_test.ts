// P1-04: بوابة البرنامج في موجّه أفعال المشارك. كانت بوابة الدفع وحدها، والرعاية تُثبَّت لحظة الربط، فمن سجّل برابط
// جهته قرأ طلبات أقران دفعتها بأسمائهم ورأى قاعتها وطلب خبراء الشبكة وأخذ رابط الجلسة قبل اعتماد مساره، والمنسحب
// يستعمل البرنامج كله. هنا الموجّه الحقيقي (Deno.serve مستبدَل بالتقاط المعالج) على قاعدة في الذاكرة، والمستخدمون
// الأحياء الثلاثة (الدافع والمرعي والمعفى قبل تفعيل الدفع) معتمدون يبقى لهم كل ما كان
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, hash, CONFIG, WORKSHOP_STAGED_NOTE } = await import('./core.ts');
const { ACTION_GATES } = (await import('./index.ts')) as any;
const P = await import('./participant.ts');
const V = await import('./activities.ts');
const { resetSettingsCache } = await import('./settings.ts');

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
const ORG = U(990001), COHORT = U(990002), WS = U(990003), REQ_W = U(990004), REQ_C = U(990005), REQ_A = U(990006);
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
    // مرحلة الاعتماد قبل التدريب كما في البرنامج: التدريب يُفتح باكتمالها (اعتماد المسار) أو بفتح الأدمن
    journey_stages: [{ program_id: 'prog', key: 'approval', sort: 3, title_ar: 'اعتماد المسار', active: true }, { program_id: 'prog', key: 'training', sort: 4, title_ar: 'التدريب', active: true }],
    stage_requirements: [
      { id: REQ_A, program_id: 'prog', stage_key: 'approval', code: 'AP-OK', kind: 'auto', dimension: null, level: null, sort: 1, required: true, title_ar: 'اعتماد المسار', config: {} },
      { id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'join' } },
      { id: REQ_C, program_id: 'prog', stage_key: 'training', code: 'T-COACH', kind: 'coaching', dimension: null, level: null, sort: 2, required: true, title_ar: 'جلسة توجيه',
        config: { mode: 'online', booking_url: 'https://cal.com/coach/session', instant_url: 'https://meet.example.sa/coach', instant_until: new Date(NOW + 36e5).toISOString() } },
    ],
    workshop_sessions: [{ id: WS, requirement_id: REQ_W, title_ar: 'اليوم الأول', mode: 'online', join_url: 'https://meet.example.sa/day1', active: true, cohort_id: COHORT,
      starts_at: new Date(NOW - 6e5).toISOString(), ends_at: new Date(NOW + 72e5).toISOString() }],
    hall_sessions: [{ id: 'hs', cohort_id: COHORT, stage: 'enter', version: 1, mode: 'live', topic_id: null, sentence_id: null, revealed: [] }],
    hall_presence: [], cohort_roles: [], peer_requests: [], peer_answers: [], audit_log: [], experts: [], expert_requests: [],
    assessments: [], instruments: [], questions: [], assessment_answers: [], certificates: [], workshop_attendance: [],
    coaching_sessions: [], participant_stage_overrides: [],
    // مفاتيح الميزات مُظهَرة: هنا تُختبر بوابة البرنامج وحدها، ورفض الميزة المخفية قبلها في features_test.ts
    app_settings: [{ key: 'features', value: { hall: true, katon: true } }, { key: 'feedback360', value: { enabled: true } }],
  };
  const f = install(tables);
  resetSettingsCache();
  const call = async (who: keyof typeof ps, action: string, body: Row = {}) => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test' },
      body: JSON.stringify({ action, token: tokens[who], ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  return { ps, tables, call, restore: () => { f.restore(); resetSettingsCache(); } };
}

// ما ذكره التدقيق: الأقران والقاعة وطلب الخبير، ورابط الجلسة وغرفة الموجّه (هذان بحال مرحلة متطلبهما في رحلته)
const EXPOSED: [string, Row][] = [
  ['peer.list', {}], ['peer.ask', { text: 'كيف أبني سجل المعالم لمشروعي الحالي؟', source: 'free' }],
  ['hall.state', {}], ['hall.join', {}], ['experts.suggest', {}], ['experts.choose', { expert_id: U(1) }],
];
const STAGED: [string, Row][] = [['workshop.join', { session_id: WS }], ['coaching.instant', { requirement_id: REQ_C }]];

Deno.test('من لم يُعتمد مساره يُرد 403 عن الأقران والقاعة وطلب الخبير ورابط الجلسة، ورحلة ما قبل الاعتماد كما هي', async () => {
  const w = await world();
  try {
    for (const [action, body] of EXPOSED) {
      const r = await w.call('pending', action, body);
      assertEquals([action, r.status, r.code], [action, 403, 'locked']);
      assertEquals(r.message, 'يُفتح هذا بعد اعتماد مسارك');
    }
    // مرحلة التدريب مقفلة عليه حتى الاعتماد: الرابط والغرفة يُردان بحالها
    for (const [action, body] of STAGED) {
      const r = await w.call('pending', action, body);
      assertEquals([action, r.status, r.code, r.message], [action, 403, 'locked', 'هذه المرحلة لم تُفتح بعد']);
    }
    assertEquals(w.tables.coaching_sessions.length, 0);
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
    for (const [action, body] of [...EXPOSED, ...STAGED, ['assessment.get', {}], ['pay.checkout', { item: 'program' }], ['lab.list', {}], ['rater.invite', { email: 'm@example.sa', phase: 'pre' }]] as [string, Row][]) {
      const r = await w.call('withdrawn', action, body);
      assertEquals([action, r.status, r.code], [action, 403, 'out_of_program']);
    }
    assertEquals(w.tables.peer_requests.length, 0);
    assertEquals(w.tables.hall_presence.length, 0);
    for (const [a, body] of [['me', {}], ['certificate', {}], ['me.export', {}], ['me.privacy', {}], ['sessions.list', {}], ['profile.save', { fields: { bio: 'نبذة' } }]] as [string, Row][]) {
      const r = await w.call('withdrawn', a, body);
      assertEquals([a, r.status, r.success], [a, 200, true]);
    }
    // الرئيسية المجمّعة لا تسقط: ما خرج منه يعود برده، وتقييم خدمة انعقدت والاستبيان باقيان
    const me = await w.call('withdrawn', 'me', { with_home: true });
    assertEquals([me.status, me.preload.lab.code, me.preload.ratings.success, me.preload.sus.success], [200, 'out_of_program', true, true]);
  } finally { w.restore(); }
});

// C: يبقى للمنسحب الاطلاع على مخرجاته وتقييم خدمة خبير انعقدت (GATE_KEPT)، وكل ما سواها من الفئتين مغلق عليه
Deno.test('المنسحب: مخرجاته وتقييم خدمة انعقدت تمر ببوابة البرنامج، وكل فعل آخر قبل الاعتماد أو بعده يُرد', async () => {
  const w = await world();
  const { pre, program, kept } = ACTION_GATES;
  try {
    // ومشاركة الوثيقة: يرى روابطه وملاحظاتها ويلغي ما شاء، ولا ينشئ رابطًا جديدًا (share.ts)
    assertEquals([...kept].sort(), ['capstone.doc', 'capstone.get', 'capstone.note-mark', 'capstone.share-revoke', 'capstone.shares', 'f360.report', 'handbook.export', 'impact.mine', 'ratings.pending', 'ratings.submit']);
    for (const a of kept) assert(pre.has(a) || program.has(a), a);
    for (const a of kept) {
      const r = await w.call('withdrawn', a, { kind: 'session', id: U(1), scores: {} });
      assert(r.code !== 'out_of_program', `${a}: ${r.code}`);
    }
    assertEquals((await w.call('withdrawn', 'ratings.pending')).success, true);
    // وتبقى لها بوابتها بعدها: ما في البرنامج نفسه بالاعتماد
    w.tables.participants.find((x) => x.id === w.ps.pending.id)!.status = 'withdrawn';
    for (const a of ['f360.report', 'capstone.get', 'capstone.doc', 'handbook.export']) {
      const r = await w.call('pending', a);
      assertEquals([a, r.status, r.code], [a, 403, 'locked']);
    }
    for (const a of [...pre, ...program].filter((x: string) => !kept.has(x))) {
      const r = await w.call('withdrawn', a, {});
      assertEquals([a, r.status, r.code], [a, 403, 'out_of_program']);
    }
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
      const c = await w.call(who, 'coaching.instant', { requirement_id: REQ_C });
      assertEquals([who, c.status, c.join_url], [who, 200, 'https://meet.example.sa/coach']);
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

const coachItem = (me: Row) => me.journey.flatMap((st: any) => st.items.map((it: any) => ({ ...it, stage: st.status }))).find((it: any) => it.id === REQ_C);

// الرحلة والخادم مصدر واحد: ما تعرضه الرحلة مفتوحًا (فتح الأدمن للمرحلة قبل الاعتماد) لا يرده الخادم، والمقفل يُرد
Deno.test('مرحلة فتحها الأدمن قبل الاعتماد: رابط الجلسة وغرفة الموجّه ورابط الحجز متاحة كما تعرضها الرحلة', async () => {
  const w = await world();
  try {
    const before = await w.call('pending', 'me');
    assertEquals([coachItem(before).stage, coachItem(before).activity.book_url, coachItem(before).activity.can_book], ['locked', null, false]);
    w.tables.participant_stage_overrides.push({ participant_id: w.ps.pending.id, program_id: 'prog', stage_key: 'training', action: 'open' });
    const me = await w.call('pending', 'me');
    const it = coachItem(me);
    assertEquals([it.stage === 'locked', it.activity.can_book, it.activity.instant], [false, true, true]);
    assert(String(it.activity.book_url).startsWith('https://cal.com/coach/session'));
    const j = await w.call('pending', 'workshop.join', { session_id: WS });
    assertEquals([j.status, j.join_url], [200, 'https://meet.example.sa/day1']);
    const c = await w.call('pending', 'coaching.instant', { requirement_id: REQ_C });
    assertEquals([c.status, c.join_url], [200, 'https://meet.example.sa/coach']);
    // والقاعة والأقران يبقيان على الاعتماد
    const h = await w.call('pending', 'hall.state');
    assertEquals([h.status, h.code], [403, 'locked']);
  } finally { w.restore(); }
});

Deno.test('رابط الحجز في الرحلة لمن تفتح له مرحلته داخل البرنامج وحده: لا للمنسحب ولا لمرحلة مقفلة', async () => {
  const w = await world();
  try {
    const ok = coachItem(await w.call('approved', 'me'));
    assertEquals([ok.stage, ok.activity.can_book], ['active', true]);
    assert(String(ok.activity.book_url).includes(encodeURIComponent(`${w.ps.approved.id}.${REQ_C}`)));
    const out = coachItem(await w.call('withdrawn', 'me'));
    assertEquals([out.stage, out.activity.book_url, out.activity.can_book, out.activity.instant], ['active', null, false, false]);
  } finally { w.restore(); }
});

// رابط حجز التُقط قبل الخروج من البرنامج أو لمرحلة مقفلة لا يفتح غرفة موجّه بإشعار منصة الحجز
Deno.test('إشعار الحجز: يُسجَّل لمن تفتح له مرحلته داخل البرنامج، ويُتجاهل للمنسحب ولمن مرحلته مقفلة', async () => {
  const w = await world();
  const saved = CONFIG.calcomSecret;
  Object.assign(CONFIG, { calcomSecret: 'cal-secret' });
  const sign = async (raw: string) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('cal-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const book = async (who: 'approved' | 'pending' | 'withdrawn') => {
    const p = w.ps[who];
    const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: `b-${who}`, metadata: { ref: `${p.id}.${REQ_C}` }, startTime: new Date(NOW + 864e5).toISOString(),
      endTime: new Date(NOW + 864e5 + 18e5).toISOString(), videoCallData: { url: `https://meet.example.sa/${who}` }, organizer: { email: 'coach@example.sa' }, attendees: [{ email: p.email }] } });
    return await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })) as Row;
  };
  try {
    assertEquals(await book('pending'), { success: true, ignored: 'not_eligible' });
    assertEquals(await book('withdrawn'), { success: true, ignored: 'not_eligible' });
    assertEquals(w.tables.coaching_sessions.length, 0);
    assertEquals(await book('approved'), { success: true });
    assertEquals(w.tables.coaching_sessions.map((x) => [x.participant_id, x.status, x.join_url]), [[w.ps.approved.id, 'booked', 'https://meet.example.sa/approved']]);
  } finally { Object.assign(CONFIG, { calcomSecret: saved }); w.restore(); }
});

// حد الجلسات (T2، ب5.2): زر الحجز يختفي عند بلوغه، والحجز الزائد من منصة الحجز (يصل بعد وقوعه) يُسجَّل ويُنبَّه عليه ولا يُرفض
Deno.test('حد الجلسات: الحجز يُخفى عند الحد، والزائد من webhook يُسجَّل بتنبيه بلا بيانات شخصية، وبلا حد كما كان', async () => {
  const w = await world();
  const saved = CONFIG.calcomSecret;
  Object.assign(CONFIG, { calcomSecret: 'cal-secret' });
  const sign = async (raw: string) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('cal-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const p = w.ps.approved;
  const book = async (uid: string, day: number) => {
    const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid, metadata: { ref: `${p.id}.${REQ_C}` }, startTime: new Date(NOW + day * 864e5).toISOString(),
      endTime: new Date(NOW + day * 864e5 + 18e5).toISOString(), videoCallData: { url: `https://meet.example.sa/${uid}` }, organizer: { email: 'coach@example.sa' }, attendees: [{ email: p.email }] } });
    return await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })) as Row;
  };
  const alerts = () => w.tables.audit_log.filter((x) => x.action === 'system.alert' && String(x.entity_id).startsWith('booking_over_max:'));
  const req = w.tables.stage_requirements.find((x) => x.id === REQ_C)!;
  try {
    // بلا حد: الحجز حتى المطلوب للاكتمال كما كان، ولا تنبيه
    assertEquals(await book('m0', 1), { success: true });
    assertEquals(coachItem(await w.call('approved', 'me')).activity.can_book, false);
    w.tables.coaching_sessions.length = 0;
    req.config = { ...req.config, sessions_required: 1, max_sessions: 2 };
    let it = coachItem(await w.call('approved', 'me'));
    assertEquals([it.activity.can_book, it.activity.max, it.activity.used, it.activity.at_max], [true, 2, 0, false]);
    assertEquals(await book('m1', 1), { success: true });
    assertEquals(await book('m2', 2), { success: true });
    it = coachItem(await w.call('approved', 'me'));
    assertEquals([it.activity.can_book, it.activity.book_url, it.activity.instant, it.activity.used, it.activity.at_max], [false, null, false, 2, true]);
    assertEquals(alerts().length, 0);
    // الاتصال الفوري على خادمنا: يُرفض عند الحد ولو طُلب مباشرة، فلا جلسة ولا بريد
    const inst = await w.call('approved', 'coaching.instant', { requirement_id: REQ_C });
    assertEquals([inst.status, inst.code], [400, 'at_max']);
    assertEquals(w.tables.coaching_sessions.filter((x) => x.kind === 'instant').length, 0);
    // الثالث يصل من منصة الحجز بعد وقوعه: يُسجَّل كما هو، ويُعلَّم ويُنبَّه عليه
    assertEquals(await book('m3', 3), { success: true, over_max: true });
    assertEquals(w.tables.coaching_sessions.filter((x) => x.status === 'booked').map((x) => x.external_id), ['calcom:m1', 'calcom:m2', 'calcom:m3']);
    assertEquals(alerts().map((x) => [x.entity_id, x.after.booking, x.after.count, x.after.max, x.after.requirement, x.after.participant]),
      [['booking_over_max:calcom:m3', 'calcom:m3', 3, 2, REQ_C, p.id]]);
    assert(!JSON.stringify(alerts()[0].after).includes('@'));
    assert(!JSON.stringify(alerts()[0].after).includes(p.full_name));
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.over_max').map((x) => [x.entity_id, x.after.count, x.after.max]), [['calcom:m3', 3, 2]]);
    // إعادة جدولة الحجز الزائد: العدد نفسه فوق الحد، فيُسجَّل أثره ولا يُنبَّه ثانية على القرار نفسه
    const raw = JSON.stringify({ triggerEvent: 'BOOKING_RESCHEDULED', payload: { uid: 'm4', rescheduleUid: 'm3', metadata: { ref: `${p.id}.${REQ_C}` }, startTime: new Date(NOW + 4 * 864e5).toISOString(),
      endTime: new Date(NOW + 4 * 864e5 + 18e5).toISOString(), videoCallData: { url: 'https://meet.example.sa/m4' }, organizer: { email: 'coach@example.sa' }, attendees: [{ email: p.email }] } });
    assertEquals(await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })), { success: true, over_max: true });
    assertEquals(w.tables.coaching_sessions.filter((x) => x.status === 'booked').map((x) => x.external_id), ['calcom:m1', 'calcom:m2', 'calcom:m4']);
    assertEquals(alerts().length, 1);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.over_max').map((x) => x.entity_id), ['calcom:m3', 'calcom:m4']);
  } finally { Object.assign(CONFIG, { calcomSecret: saved }); w.restore(); }
});

// إعادة جدولة موعد من خرج من البرنامج: كان التجاهل قبل إلغاء القديم فيبقى «محجوزًا» ويصله تذكيره، ولا يعرف أحد أن يلغيه
Deno.test('إعادة جدولة لمن لم يعد أهلًا: القديم يُلغى، وتنبيه واحد للتشغيل بمعرّف الحجز بلا بيانات شخصية، وإعادتها ثانية لا تنبّه', async () => {
  const w = await world();
  const saved = CONFIG.calcomSecret;
  Object.assign(CONFIG, { calcomSecret: 'cal-secret' });
  const sign = async (raw: string) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('cal-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const p = w.ps.approved;
  const send = async (trigger: string, uid: string, prev: string | null, day: number) => {
    const raw = JSON.stringify({ triggerEvent: trigger, payload: { uid, ...(prev ? { rescheduleUid: prev } : {}), metadata: { ref: `${p.id}.${REQ_C}` }, startTime: new Date(NOW + day * 864e5).toISOString(),
      endTime: new Date(NOW + day * 864e5 + 18e5).toISOString(), videoCallData: { url: `https://meet.example.sa/${uid}` }, organizer: { email: 'coach@example.sa' }, attendees: [{ email: p.email }] } });
    return await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })) as Row;
  };
  const alerts = () => w.tables.audit_log.filter((x) => x.action === 'system.alert' && String(x.entity_id).startsWith('booking_not_eligible:'));
  try {
    assertEquals(await send('BOOKING_CREATED', 'r1', null, 1), { success: true });
    w.tables.participants.find((x) => x.id === p.id)!.status = 'withdrawn';
    assertEquals(await send('BOOKING_RESCHEDULED', 'r2', 'r1', 2), { success: true, ignored: 'not_eligible' });
    assertEquals(w.tables.coaching_sessions.map((x) => [x.external_id, x.status]), [['calcom:r1', 'cancelled']]);
    assertEquals(alerts().map((x) => [x.entity_id, x.after.booking, x.after.previous, x.after.requirement, x.after.participant, x.after.reason]),
      [['booking_not_eligible:calcom:r2', 'calcom:r2', 'calcom:r1', REQ_C, p.id, 'out_of_program']]);
    // بلا اسم ولا بريد، لا للمشارك ولا للموجّه
    assert(!JSON.stringify(alerts()[0].after).includes('@'));
    assert(!JSON.stringify(alerts()[0].after).includes(p.full_name));
    assertEquals(await send('BOOKING_RESCHEDULED', 'r3', 'r2', 3), { success: true, ignored: 'not_eligible' });
    assertEquals(alerts().length, 1);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.ignored').map((x) => x.entity_id), ['calcom:r2', 'calcom:r3']);
    // وحجز جديد مستقل لمن مرحلته مقفلة ينبّه بنفسه
    const q = w.ps.pending;
    const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'n1', metadata: { ref: `${q.id}.${REQ_C}` }, startTime: new Date(NOW + 864e5).toISOString(), endTime: new Date(NOW + 864e5 + 18e5).toISOString() } });
    assertEquals(await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })), { success: true, ignored: 'not_eligible' });
    assertEquals(alerts().map((x) => [x.entity_id, x.after.reason]), [['booking_not_eligible:calcom:r2', 'out_of_program'], ['booking_not_eligible:calcom:n1', 'stage_locked']]);
  } finally { Object.assign(CONFIG, { calcomSecret: saved }); w.restore(); }
});

// رابط الجلسة عن بعد في بريد الدعوة وملف تقويمها لمن تفتح له مرحلتها في رحلته، بقاعدة workshop.join؛ ومن لا يُدعى بموعدها
async function invite(w: Awaited<ReturnType<typeof world>>) {
  const real = globalThis.fetch;
  const saved = CONFIG.resendKey;
  const mail: Row[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('resend.com')) { mail.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ id: `re_${mail.length}` })); }
    return new Response('ok');
  }) as typeof fetch;
  Object.assign(CONFIG, { resendKey: 're_test' });
  try {
    const r: any = await V.workshopInvite({ email: 'admin@example.sa' }, { id: WS, again: true });
    const ics = (m: Row) => new TextDecoder().decode(Uint8Array.from(atob(m.attachments[0].content), (c) => c.charCodeAt(0)));
    const of = (who: keyof typeof w.ps) => mail.find((m) => m.to[0] === w.ps[who].email);
    const link = (who: keyof typeof w.ps) => {
      const m = of(who)!;
      const [inMail, inIcs] = [m.html.includes('https://meet.example.sa/day1'), ics(m).includes('https://meet.example.sa/day1')];
      assertEquals(inMail, inIcs, who);
      // ومن لا رابط له يُقال له إن الرابط في رحلته حين تُفتح مرحلتها، لا تعليمات القاعة
      assertEquals(m.html.includes(WORKSHOP_STAGED_NOTE), !inMail, who);
      return inMail;
    };
    return { r, of, link };
  } finally { globalThis.fetch = real; Object.assign(CONFIG, { resendKey: saved }); }
}

Deno.test('دعوة الجلسة عن بعد: الرابط لمن تفتح له مرحلتها، ومن ينتظر الاعتماد ومرحلته مقفلة يُدعى بلا رابط، والمنسحب لا يُدعى', async () => {
  const w = await world();
  try {
    const { r, of, link } = await invite(w);
    assertEquals([r.total, r.sent], [4, 4]);
    for (const who of ['approved', 'paid', 'grand'] as const) assertEquals([who, link(who)], [who, true]);
    assertEquals(link('pending'), false);
    assertEquals(of('withdrawn'), undefined);
  } finally { w.restore(); }
});

// البريد والانضمام قاعدة واحدة: من فتح الأدمن مرحلته قبل اعتماده يأخذ الرابط وينضم، والمعتمد ومرحلته مقفلة بمتطلب سابق
// ناقص يأخذه وينضم كما كان قبل P1-04، فلا يُحجب مشارك دفع عن جلسة حية
Deno.test('رابط الجلسة في البريد وفي الانضمام: فتح الأدمن يعطيه غير المعتمد، والمعتمد يبقى له ولو قفل مرحلته متطلب سابق', async () => {
  const w = await world();
  try {
    w.tables.participant_stage_overrides.push({ participant_id: w.ps.pending.id, program_id: 'prog', stage_key: 'training', action: 'open' });
    w.tables.stage_requirements.push({ id: U(990007), program_id: 'prog', stage_key: 'approval', code: 'P-CV', kind: 'auto', dimension: null, level: null, sort: 2, required: true, title_ar: 'السيرة الذاتية', config: {} });
    for (const who of ['paid', 'grand'] as const) w.tables.participants.find((x) => x.id === w.ps[who].id)!.cv_path = 'cv/x.pdf';
    const { link } = await invite(w);
    assertEquals([link('pending'), link('approved'), link('paid'), link('grand')], [true, true, true, true]);
    const j = await w.call('approved', 'workshop.join', { session_id: WS });
    assertEquals([j.status, j.join_url], [200, 'https://meet.example.sa/day1']);
    const k = await w.call('pending', 'workshop.join', { session_id: WS });
    assertEquals([k.status, k.join_url], [200, 'https://meet.example.sa/day1']);
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

Deno.test('إرسال القياس: لا يعيد المنسحب ولا ينزل المعتمد، ومن لم يُعتمد مساره بانتظار الاعتماد من أي حالة داخل البرنامج', async () => {
  const w = await world();
  try {
    // ومنه من وضعته الإدارة على «في البرنامج» أو «معتمد المستوى» قبل قياسه: كان يبقى عليها خارج قوائم الاعتماد
    const cases: [string, string, string][] = [['withdrawn', 'withdrawn', 'withdrawn'], ['approved', 'enrolled', 'enrolled'], ['grand', 'completed', 'completed'], ['pending', 'profiled', 'pending_approval'],
      ['pending', 'enrolled', 'pending_approval'], ['pending', 'placed', 'pending_approval'], ['paid', 'pending_approval', 'placed']];
    w.tables.instruments.push({ id: 'inst', kind: 'baseline', active: true });
    for (const [i, [who, from, to]] of cases.entries()) {
      const p = (w.ps as any)[who];
      p.status = from;
      w.tables.assessments.push({ id: `as-${i}`, participant_id: p.id, instrument_id: 'inst', status: 'in_progress', form: null, started_at: '2026-11-01T08:00:00Z' });
      const r: any = await P.assessmentSubmit({ ...p }, { assessment_id: `as-${i}` });
      assertEquals(r.success, true);
      assertEquals([who, from, w.tables.participants.find((x) => x.id === p.id)!.status], [who, from, to]);
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
  for (const a of ['peer.list', 'peer.ask', 'peer.answer', 'peer.close', 'hall.state', 'hall.join', 'hall.hand', 'hall.pick', 'experts.suggest', 'experts.choose']) assert(program.has(a), a);
  // رابط الجلسة وغرفة الموجّه داخل البرنامج، وحكمهما مرحلة متطلبهما في activities.ts (stageOpen)
  for (const a of ['workshop.join', 'coaching.instant']) assert(pre.has(a), a);
  for (const a of ['me', 'profile.save', 'me.export', 'me.erase-request', 'certificate', 'profile.confirm-name', 'me.switch', 'logout']) assert(account.has(a), a);
  for (const a of ['assessment.get', 'assessment.answer', 'assessment.submit', 'pay.checkout', 'sponsor.request', 'profile.save']) assert(!program.has(a), a);
  for (const a of ['workshop.join', 'me.sponsor-code', 'f360.start']) assert(demoBlocked.has(a), a);
});

// المعتمد يأخذ رابط الجلسة ولو قفل مرحلتها متطلب سابق، لكن لمتطلب في رحلته هو: جلسة لمستوى غير مستواه لا رابط لها في
// بريده، كما يردها workshop.join (هذا النشاط لا يخص مسارك)
Deno.test('رابط الجلسة للمعتمد بشرط أن يخص متطلبها مساره: مستوى آخر لا رابط له في البريد ولا انضمام', async () => {
  const w = await world();
  try {
    Object.assign(w.tables.stage_requirements.find((x) => x.id === REQ_W)!, { dimension: 'leadership', level: 'advanced' });
    const { link } = await invite(w);
    assertEquals([link('approved'), link('paid'), link('grand')], [false, false, false]);
    const j = await w.call('approved', 'workshop.join', { session_id: WS });
    assertEquals(j.status, 403);
  } finally { w.restore(); }
});

// حساب العرض لا يحجز موجّهًا حقيقيًا: لا رابط حجز ولا اتصال فوري في رحلته، والحجز الذي يحمل مرجعه يُتجاهل بتنبيه
Deno.test('حساب العرض: لا رابط حجز ولا اتصال فوري، وحجز بمرجعه يُتجاهل بسبب demo', async () => {
  const w = await world();
  const saved = CONFIG.calcomSecret;
  Object.assign(CONFIG, { calcomSecret: 'cal-secret' });
  try {
    w.tables.participant_stage_overrides.push({ participant_id: w.ps.demo.id, program_id: 'prog', stage_key: 'training', action: 'open' });
    const it = coachItem(await w.call('demo', 'me'));
    assertEquals([it.activity.can_book, it.activity.book_url, it.activity.instant], [false, null, false]);
    const raw = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'd1', metadata: { ref: `${w.ps.demo.id}.${REQ_C}` }, startTime: new Date(NOW + 864e5).toISOString(), endTime: new Date(NOW + 864e5 + 18e5).toISOString() } });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('cal-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
    assertEquals(await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': sig })), { success: true, ignored: 'not_eligible' });
    assertEquals(w.tables.coaching_sessions.length, 0);
    const alert = w.tables.audit_log.find((x) => x.action === 'system.alert' && String(x.entity_id) === 'booking_not_eligible:calcom:d1');
    assertEquals(alert?.after?.reason, 'demo');
  } finally { Object.assign(CONFIG, { calcomSecret: saved }); w.restore(); }
});

// مفاتيح الميزات (features.js) في الموجّه الحقيقي: المخزن بلا صف فالثلاثة مطفأة. المعتمد داخل البرنامج يُرد برمز كل ميزة
// قبل أي بوابة أخرى ولا يُكتب شيء، وقراءة 360 تُجاب بلا شيء، والرئيسية تحمل المفاتيح، وما سواها كما كان
Deno.test('مفاتيح الميزات مطفأة: القاعة وكاتون و360 مرفوضة برموزها للمعتمد، وقراءة 360 فارغة، والقياس والأثر كما كانا', async () => {
  const w = await world();
  w.tables.app_settings = [];
  resetSettingsCache();
  try {
    for (const [action, body, code] of [['hall.state', {}, 'hall_off'], ['hall.join', {}, 'hall_off'], ['hall.hand', { up: true }, 'hall_off'], ['katon.mine', {}, 'katon_off'],
      ['f360.start', {}, 'f360_off'], ['f360.nominate', { cycle_id: U(1), email: 'x@y.sa' }, 'f360_off'], ['f360.submit', { cycle_id: U(1) }, 'f360_off'], ['f360.report', { cycle_id: U(1) }, 'f360_off']] as [string, Row, string][]) {
      const r = await w.call('approved', action, body);
      assertEquals([action, r.status, r.code, r.message], [action, 404, code, 'هذا غير متاح الآن.']);
    }
    // والمنسحب ومن لم يُعتمد يرون الرد نفسه: الميزة المخفية مخفية عن الجميع
    assertEquals((await w.call('pending', 'hall.state')).code, 'hall_off');
    assertEquals((await w.call('withdrawn', 'f360.report', { cycle_id: U(1) })).code, 'f360_off');
    const mine = await w.call('approved', 'f360.mine');
    assertEquals([mine.status, mine.success, mine.enabled, mine.cycles], [200, true, false, undefined]);
    assertEquals(w.tables.hall_presence.length, 0);
    const me = await w.call('approved', 'me', { with_home: true });
    assertEquals([me.status, me.features], [200, { hall: false, katon: false, f360: false }]);
    for (const a of ['impact.mine', 'peer.list', 'lab.list']) {
      const r = await w.call('approved', a);
      assertEquals([a, r.status, r.success], [a, 200, true]);
    }
  } finally { w.restore(); }
});
