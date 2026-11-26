// المرحلة 2 من تصور الحساب التجريبي (2026-11-19): حساب تجريبي لكل دفعة. على الموجّه الحقيقي (index.ts) بقاعدة في الذاكرة.
// يثبت: أن الحساب يُنشأ عند أول فتح من دفعته ويتبع خطتها ونسختها وما أُوقف من مراحلها، وأنه بلا جهة ولا إلحاق ولا مجموعة،
// وأن كل قراءة بالدفعة (العدد، القائمة، السعة، الحضور، المجموعات، «ماذا تغيّر»، النبض، الرؤية، لوحة الجهة) لا تتغير بوجوده
// ولا تذكر معرّفه، وأنه لا يرى اسم عضو ولا بياناته، وأن روابط التجربة لحساب دفعتها، وأن إغلاق الدفعة يحذف حسابها وحده ولا يمس
// مشاركًا حقيقيًا، وأن كل شيء قبل الترحيل كما كان بالحساب الواحد.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, placeOrgMembers } from './_fake_db.ts';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, publicDb, hash, Fail } = await import('./core.ts');
await import('./index.ts');
const D = await import('./demo.ts');
const DC = await import('./demo-cohort.ts');
const G = await import('./programs.ts');
const A = await import('./admin.ts');
const C = await import('./coordinator.ts');
const S = await import('./system.ts');
const IN = await import('./insight.ts');
const V = await import('./activities.ts');
const PR = await import('./peer.ts');
const H = await import('./hall.ts');
const TM = await import('./team.ts');
const X = await import('./capstone.ts');
const T = await import('./tracking.ts');
const Z = await import('./certificates.ts');
const CG = await import('./coaching-groups.ts');
const I = await import('./impact.ts');
const E = await import('./experts.ts');
const TD = await import('./today-desk.ts');
const NU = await import('./nudges.ts');
const CPU = await import('./cohort-pulse.ts');
const { advisorOf } = await import('./advisor.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { DEMO_ROW_KEEP, DEMO_ROW_RESET, demoCohortLabel, demoStageLine, DEMO_ALL_SKIPPED_AR } = await import('./demo-stage.js');
const { isCounted, isListed } = await import('./counting.ts');

type Row = Record<string, any>;
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(900), OPEN = U(901), C1 = U(902), C2 = U(903), CLOSED = U(904), ORG = U(800), VER = U(950);
const REAL = U(1), REAL2 = U(2), LONER = U(3), ADV = U(700), WS = U(60), WREQ = U(503);
const ADMIN: any = { email: 'admin@example.sa', role: 'admin', id: 'a1' };
const ADMIN2: any = { email: 'second@example.sa', role: 'admin', id: 'a2' };
const SUPER: any = { email: 'owner@example.sa', role: 'super_admin', id: 'a0' };
const CTX = { ip: '203.0.113.7', ua: 'test-agent' };
const GENERAL_EMAIL = 'demo@demo.milestone-impact.org';
const now = new Date().toISOString();
// يوم في مدة الدفعات (تبدأ 2026-12-01): للنبض اليومي الذي يلتقط الدفعات الجارية وحدها
const PULSE_AT = Date.parse('2026-12-15T09:00:00Z');

const STAGES: Row[] = [
  ['profile', 'الملف الشخصي', 'admission', {}], ['assessment', 'تحديد المستوى', 'admission', {}], ['approval', 'اعتماد المستوى', 'admission', {}],
  ['training', 'التدريب', 'qualification', {}], ['ojt', 'التوجيه على رأس العمل', 'qualification', {}], ['consulting', 'الاستشارة', 'qualification', {}],
  ['report', 'التقرير النهائي', 'impact', {}],
].map(([key, title_ar, phase, rules], i) => ({ program_id: PROG, key, sort: i + 1, title_ar, phase, rules, active: true, duration_days: 7, duration_label: 'أسبوع' }));
const REQS: Row[] = [
  ['profile', 'P-INFO', 'auto'], ['assessment', 'A-DONE', 'auto'], ['approval', 'AP-OK', 'auto'],
  ['training', 'T-DAYS', 'workshop'], ['training', 'T-PLAN', 'check'], ['ojt', 'O-NOTE', 'check'], ['consulting', 'C-BRIEF', 'check'], ['report', 'R-ISSUE', 'auto'],
].map(([stage_key, code, kind], i) => ({ id: U(500 + i), program_id: PROG, stage_key, code, kind, sort: i, title_ar: `متطلب ${code}`, required: true, needs_review: false, active: true, dimension: null, level: null, config: kind === 'workshop' ? { verify: 'qr' } : {} }));
const placed = (pid: string) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: pid, dimension, level: 'intermediate', approved_at: now }));
const person = (id: string, name: string, extra: Row = {}) => ({ id, full_name: name, email: `p${id.slice(-1)}@example.sa`, phone: `+96655500000${id.slice(-1)}`, job_title: 'مديرة مشروع', is_demo: false, is_test: false,
  organization_id: null, organization_name: null, status: 'enrolled', created_at: now, last_login_at: now, profile_completed_at: now, consented_at: now, ...extra });
// ما يُعرّف عضوًا حقيقيًا: اسمه وبريده وجواله. لا يظهر شيء منها في ما يراه الحساب التجريبي
const REAL_PII = ['سارة العضو الأولى', 'نورة العضو الثانية', 'p1@example.sa', 'p2@example.sa', '+966555000001', '+966555000002', REAL, REAL2];

// before: قبل الترحيل 20261123100000 (لا عمود demo_links.cohort_id ولا participants.demo_cohort_id، وقيد الحساب الواحد قائم)
function world({ before = false } = {}) {
  resetSettingsCache();
  DC.resetDemoCohortReady();
  const cohort = (id: string, name: string, extra: Row = {}) => ({ id, name, is_default: false, organization_id: null, status: 'running', program_id: PROG, program_version_id: null, starts_on: '2026-12-01', ends_on: '2027-04-01',
    schedule: {}, hidden_requirements: [], delivery: {}, stage_modes: {}, capacity: null, advisor_expert_id: null, supervision: 'peers_expert', created_at: now, ...extra });
  const tables: Record<string, Row[]> = {
    participants: [person(REAL, 'سارة العضو الأولى', { organization_id: ORG, organization_name: 'جهة الاختبار' }), person(REAL2, 'نورة العضو الثانية'), person(LONER, 'هدى بلا دفعة')],
    auth_sessions: [], demo_links: [], audit_log: [], certificates: [], mail_queue: [], mail_log: [],
    payment_settings: [{ id: true, enabled: false }], programs: [{ id: PROG, is_default: true, name: 'برنامج القادة', katon_points: null, final_eval: null, cert: {} }],
    program_versions: [],
    organizations: [{ id: ORG, name: 'جهة الاختبار', short_name: 'الاختبار', color: '#123456', status: 'active', has_logo: true, logo: 'data:image/png;base64,AAAA', updated_at: now }],
    cohorts: [
      cohort(OPEN, 'الدفعة المفتوحة', { is_default: true, starts_on: '2026-11-01' }),
      // دفعة جهة بخطتها: مرحلة موقوفة (ojt) وبند مخفي (T-PLAN) ومستشار وسعة
      cohort(C1, 'قادة الجهة 1', { organization_id: ORG, schedule: { ojt: { off: true } }, hidden_requirements: ['T-PLAN'], capacity: 10, advisor_expert_id: ADV }),
      cohort(C2, 'دفعة الأفراد 2', { starts_on: '2027-01-10' }),
      cohort(CLOSED, 'دفعة مغلقة', { status: 'closed' }),
    ],
    // REAL يتبع C1 بجهته، وREAL2 ملحقة بها صراحة
    enrollments: [{ id: U(40), participant_id: REAL2, cohort_id: C1, status: 'active', created_at: now }],
    entitlements: [], journey_stages: STAGES.map((s) => ({ ...s })), stage_requirements: REQS.map((r) => ({ ...r })),
    app_settings: [{ key: 'features', value: { hall: true, katon: true, f360: true } }],
    experts: [{ id: ADV, full_name: 'مستشار الدفعة', email: 'adv@example.sa', status: 'active', roles: ['advisor'] }], cohort_experts: [],
    placements: [...placed(REAL), ...placed(REAL2)],
    assessments: [REAL, REAL2].map((participant_id, i) => ({ id: U(100 + i), participant_id, status: 'submitted', submitted_at: now, instruments: { key: 'b', kind: 'baseline', title_ar: 'المبدئي', active: true }, assessment_results: [] })),
    participant_requirements: [{ participant_id: REAL, requirement_id: REQS[4].id, status: 'done', completed_at: now }],
    cohort_groups: [{ id: U(70), cohort_id: C1, name: 'المجموعة 1', sort: 1, advisor_expert_id: null }],
    cohort_group_members: [{ cohort_id: C1, participant_id: REAL, group_id: U(70) }, { cohort_id: C1, participant_id: REAL2, group_id: U(70) }],
    cohort_roles: [{ cohort_id: C1, participant_id: REAL, team: 'red' }],
    workshop_sessions: [{ id: WS, requirement_id: WREQ, cohort_id: C1, title_ar: 'اليوم الأول لدفعة الجهة', location_ar: 'القاعة', secret: 's'.repeat(32), mode: 'in_person', active: true,
      starts_at: new Date(Date.now() - 6e5).toISOString(), ends_at: new Date(Date.now() + 72e5).toISOString() }],
    workshop_attendance: [{ session_id: WS, participant_id: REAL, method: 'qr', checked_in_at: now }],
    peer_requests: [{ id: U(80), participant_id: REAL, cohort_id: C1, text: 'سؤال عضوة حقيقية عن معلم القيمة', source: 'free', target_team: null, status: 'open', created_at: now }],
    peer_answers: [{ id: U(81), request_id: U(80), author_id: REAL2, text: 'إجابة زميلة حقيقية', status: 'pending', created_at: now }],
    hall_sessions: [{ id: U(82), cohort_id: C1, stage: 'round', version: 1, mode: 'self', topic_id: 't', revealed: [] }], hall_presence: [{ session_id: U(82), participant_id: REAL, last_seen: now }],
    participant_stage_overrides: [], final_evaluations: [], points_ledger: [], handbook_progress: [], reports: [], tracks: [], model_submissions: [], capstones: [], capstone_updates: [], learning_models: [],
  };
  placeOrgMembers(tables);
  const f = installFake(tables, {
    embed: (t, r, all) => ({
      ...(r.participant_id ? { participants: (all.participants || []).find((p) => p.id === r.participant_id) ?? null } : {}),
      ...(t === 'cohort_group_members' ? { cohort_groups: (all.cohort_groups || []).find((g) => g.id === r.group_id) ?? null } : {}),
    }),
    onDelete: (table, rows, t) => {
      if (table === 'participants') for (const k of ['auth_sessions', 'participant_stage_overrides', 'placements', 'assessments', 'participant_requirements', 'peer_requests']) t[k] = (t[k] || []).filter((x) => !rows.some((p) => p.id === x.participant_id));
      // حذف الدفعة يحذف حسابها التجريبي وروابطه (on delete cascade في الترحيل)
      if (table === 'cohorts') { t.participants = t.participants.filter((p) => !rows.some((c) => c.id === p.demo_cohort_id)); t.demo_links = t.demo_links.filter((l) => !rows.some((c) => c.id === l.cohort_id)); }
    },
    fail: (table, op) => {
      // فهرس البريد الفريد participants_email_uniq
      if (table === 'participants' && op.kind === 'insert' && tables.participants.some((p) => p.email === op.value?.email)) return { code: '23505', message: 'duplicate key value violates unique constraint "participants_email_uniq"' };
      if (!before) return null;
      if (table === 'demo_links' && op.kind === 'select' && /\bcohort_id\b/.test(op.cols || '')) return { code: '42703', message: 'column demo_links.cohort_id does not exist' };
      if (table === 'demo_links' && op.kind === 'insert' && 'cohort_id' in (op.value || {})) return { code: 'PGRST204', message: "Could not find the 'cohort_id' column" };
      if (table === 'participants' && op.kind === 'insert' && 'demo_cohort_id' in (op.value || {})) return { code: 'PGRST204', message: "Could not find the 'demo_cohort_id' column" };
      // وقيد الحساب الواحد participants_one_demo
      if (table === 'participants' && op.kind === 'insert' && op.value?.is_demo && tables.participants.some((p) => p.is_demo)) return { code: '23505', message: 'participants_one_demo' };
      return null;
    },
  });
  const pub = (publicDb as any).from;
  (publicDb as any).from = (db as any).from;
  const call = async (action: string, body: Row = {}) => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test', 'x-forwarded-for': CTX.ip }, body: JSON.stringify({ action, ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  const tokenOf = (r: any) => String(r.url).split('#demo=')[1];
  const open = async (cohort_id?: string, a = ADMIN) => tokenOf(await D.open(a, cohort_id ? { cohort_id } : {}, CTX));
  const demoOf = (cohortId: string | null) => f.tables.participants.find((p) => p.is_demo && (p.demo_cohort_id ?? null) === cohortId);
  // الحساب بعد زرّي القبول (الملف والقياس واعتماد المسار الآلي)، بما يكتبانه على صفه وحده
  const ready = (cohortId: string | null) => {
    const d = demoOf(cohortId)!;
    Object.assign(d, { profile_completed_at: now, status: 'placed' });
    f.tables.placements.push(...placed(d.id));
    f.tables.assessments.push({ id: crypto.randomUUID(), participant_id: d.id, status: 'submitted', submitted_at: now, instruments: { key: 'b', kind: 'baseline', title_ar: 'المبدئي', active: true }, assessment_results: [] });
    return d;
  };
  const realSession = async (pid = REAL) => { const token = `real-session-token-${pid}`; f.tables.auth_sessions.push({ id: crypto.randomUUID(), participant_id: pid, token_hash: await hash(token), method: 'code', created_at: now, last_seen_at: now, expires_at: new Date(Date.now() + 864e5).toISOString(), revoked_at: null }); return token; };
  return { ...f, call, open, demoOf, ready, realSession, restore: () => { f.restore(); (publicDb as any).from = pub; resetSettingsCache(); DC.resetDemoCohortReady(); } };
}
const failCode = async (fn: () => Promise<unknown>): Promise<unknown[]> => { const e = (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>; return [e.status, e.code]; };
const keys = (r: Row) => (r.journey as Row[]).map((s) => s.key);
const codes = (r: Row) => (r.journey as Row[]).flatMap((s) => (s.items as Row[]).map((i) => i.code));

Deno.test('الإنشاء عند أول فتح: حساب لكل دفعة ببريد مشتق منها، بلا جهة ولا إلحاق، والفتح الثاني يعيده كما هو، والدفعة المفتوحة حسابها العام', async () => {
  const w = world();
  try {
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
    const t1 = await w.open(C1);
    const d1 = w.demoOf(C1)!;
    assertEquals([d1.email, d1.is_demo, d1.demo_cohort_id, d1.organization_id ?? null, d1.source], [`demo-${C1}@demo.milestone-impact.org`, true, C1, null, 'admin']);
    assertEquals([DC.demoEmailFor(C1), DC.demoEmailFor(null)], [d1.email, GENERAL_EMAIL]);
    assertEquals([isListed(d1), isCounted(d1)], [false, false]);
    // لا صف له في أي جدول عضوية
    for (const t of ['enrollments', 'cohort_group_members', 'cohort_roles', 'hall_presence']) assertEquals(w.tables[t].some((x) => x.participant_id === d1.id), false, t);
    // الفتح الثاني للدفعة نفسها: الحساب نفسه، وجلسة الأول تبطل (رمز ظهر على شاشة سابقة)
    const t1b = await w.open(C1, ADMIN2);
    assertEquals(w.tables.participants.filter((p) => p.demo_cohort_id === C1).length, 1);
    assertEquals([(await w.call('me', { token: t1 })).status, (await w.call('me', { token: t1b })).status], [401, 200]);
    // دفعة أخرى وحساب عام: ثلاثة حسابات، وفتح أحدها لا يخرج مقدِّم الآخر
    const t2 = await w.open(C2);
    const tg = await w.open();
    const tOpen = await w.open(OPEN);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).map((p) => [p.email, p.demo_cohort_id ?? null]).sort(), [[GENERAL_EMAIL, null], [`demo-${C1}@demo.milestone-impact.org`, C1], [`demo-${C2}@demo.milestone-impact.org`, C2]].sort());
    assertEquals(await Promise.all([t1b, t2, tOpen].map(async (t) => (await w.call('me', { token: t })).status)), [200, 200, 200]);
    // الدفعة المفتوحة حسابها العام: فتحها أبطل جلسة الفتح العام السابقة (الحساب نفسه)
    assertEquals((await w.call('me', { token: tg })).status, 401);
    assertEquals((await w.call('me', { token: tOpen })).participant.email, GENERAL_EMAIL);
    // السجل يسمّي الدفعة
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.open').map((x) => [x.actor, x.after?.cohort ?? null]), [[ADMIN.email, C1], [ADMIN2.email, C1], [ADMIN.email, C2], [ADMIN.email, null], [ADMIN.email, null]]);
    // مغلقة أو غير موجودة أو معرّف تالف: لا حساب
    assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: CLOSED }, CTX)), [409, 'cohort_closed']);
    assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: U(999) }, CTX)), [404, 'bad_request']);
    assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: "x' or 1=1" }, CTX)), [404, 'bad_request']);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 3);
  } finally { w.restore(); }
});

Deno.test('يتبع دفعته: اسمها ومواعيدها وما أُوقف من مراحلها وما أُخفي من بنودها وجلساتها، وشعار جهتها بلا ربطه بها', async () => {
  const w = world();
  try {
    const t1 = await w.open(C1), t2 = await w.open(C2), tg = await w.open();
    for (const c of [C1, C2, null]) w.ready(c);
    const [m1, m2, mg, real] = [await w.call('me', { token: t1 }), await w.call('me', { token: t2 }), await w.call('me', { token: tg }), await w.call('me', { token: await w.realSession(REAL2) })];
    assertEquals([m1.status, m2.status, mg.status, real.status], [200, 200, 200, 200]);
    // الدفعة باسمها وتواريخها، والعام بلا دفعة مسماة (المفتوحة)
    assertEquals([m1.cohort, m2.cohort, mg.cohort], [{ name: 'قادة الجهة 1', starts_on: '2026-12-01', ends_on: '2027-04-01' }, { name: 'دفعة الأفراد 2', starts_on: '2027-01-10', ends_on: '2027-04-01' }, null]);
    // المراحل والبنود كما يراها عضو الدفعة الحقيقي بالضبط: ojt موقوفة وT-PLAN مخفي في C1 وحدها
    assertEquals(keys(m1), keys(real));
    assertEquals(codes(m1), codes(real));
    assert(!keys(m1).includes('ojt') && !codes(m1).includes('T-PLAN'));
    assert(keys(m2).includes('ojt') && codes(m2).includes('T-PLAN') && keys(mg).includes('ojt'));
    // جلسات ورشة دفعته في بند الأيام التدريبية، ولا تظهر لحساب دفعة أخرى
    const sessions = (m: Row) => (m.journey as Row[]).flatMap((s) => s.items as Row[]).flatMap((i) => (i.activity?.sessions || []).map((x: Row) => x.title || x.title_ar));
    assertEquals([sessions(m1), sessions(m2)], [['اليوم الأول لدفعة الجهة'], []]);
    // هوية الجهة من الدفعة: الاسم واللون والشعار، والحساب نفسه غير مربوط بها
    assertEquals([m1.org?.name, m1.org?.color, !!m1.org?.logo_v, m1.participant.organization_linked, m2.org, mg.org], ['جهة الاختبار', '#123456', true, false, null, null]);
    assertEquals(((await w.call('org.logo', { token: t1 })) as Row).logo, 'data:image/png;base64,AAAA');
    assertEquals(((await w.call('org.logo', { token: t2 })) as Row).logo, null);
    assertEquals(w.demoOf(C1)!.organization_id ?? null, null);
    assertEquals(await DC.brandOrgId(w.tables.participants.find((p) => p.id === LONER)), null);
    // «ماذا ترى جهتك» للحساب بلا جهة: لا شيء، فلا يُعرض له مطّلع ولا صلاحية
    assertEquals(((await w.call('org.visibility', { token: t1 })) as Row).org, null);
    // التخطي يكتب على صف الحساب وحده وببرنامج دفعته
    const skip = await w.call('demo.skip-stage', { token: t1 });
    assertEquals([skip.status, skip.skipped], [200, 'training']);
    assertEquals(w.tables.participant_stage_overrides.map((o) => [o.participant_id, o.stage_key, o.action]), [[w.demoOf(C1)!.id, 'training', 'skip']]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.stage-skip').map((x) => x.after.by.admin), [ADMIN.email]);
    // «أعد من البداية» يبقيه حساب دفعته
    assert(DEMO_ROW_KEEP.includes('demo_cohort_id') && !('demo_cohort_id' in DEMO_ROW_RESET));
    const again = await w.call('demo.restart', { token: t1 });
    assertEquals([again.status, w.demoOf(C1)!.demo_cohort_id, again.cohort?.name], [200, C1, 'قادة الجهة 1']);
  } finally { w.restore(); }
});

// كل قراءة بالدفعة أو بالجهة أو بالمنصة: ردها قبل إنشاء الحساب وبعد أن يُنشأ ويتقدم ويتخطى ويسأل ويسجّل حضورًا واحد،
// ولا يذكر معرّف الحساب ولا بريده. من يضيف قراءة بالدفعة يضيفها هنا
const READS: [string, () => Promise<unknown>][] = [
  ['admin.programs: عدد أعضاء كل دفعة والملحقون وبانتظار الاعتماد', () => G.list()],
  ['cohortMemberIds: أعضاء الدفعة الفعليون (الخريطة والمتابعة والنبض)', () => G.cohortMemberIds(C1)],
  ['cohortMembers: القاعة والمجموعات والفريق والجلسة الجماعية ودعوات الورش', async () => G.cohortMembers((await db.from('cohorts').select('*').eq('id', C1).maybeSingle()).data)],
  ['admin.cohort-groups: المجموعات وأعضاؤها', () => G.cohortGroups({ cohort_id: C1 })],
  ['admin.cohort-team: فريق الدفعة', () => TM.cohortTeam({ cohort_id: C1 })],
  ['admin.cohort-journey: خريطة الدفعة وصفوف المتابعة', () => C.adminCohortJourney(ADMIN, { cohort_id: C1 })],
  ['admin.org-journey: خريطة الجهة', () => C.adminJourney(ADMIN, { organization_id: ORG })],
  ['لوحة منسق الجهة', () => C.dashboardFor({ id: null, organization_id: ORG, permissions: { list: true, activity: true, export: true, team: true }, template: null })],
  ['admin.participants بفلتر الدفعة', () => A.participants({ cohort: C1 })],
  ['admin.overview', () => A.overview({})],
  ['admin.insight: أين توقفوا وحِمل الخبراء', () => IN.adminInsight()],
  // سطور قراءة الخريطة نفسها (اطلاع مسجَّل يكتبه هذا الاختبار) خارج المقارنة، وما سواها بنصه وفاعله وصاحبه
  ['admin.changes: ماذا تغيّر في الدفعة', async () => ((await IN.adminChanges({ cohort_id: C1 })) as any).changes.filter((c: Row) => c.text !== 'admin.cohort-journey').map((c: Row) => [c.text, c.by, c.participant_id, c.who, c.detail])],
  ['admin.activities: نظرة الأنشطة وعدّاد الحضور', () => V.overview()],
  ['admin.workshop-attendance: ورقة الحضور والمتوقعون', () => V.workshopAttendance({ id: WS })],
  ['admin.workshop-qr: عدّاد «حضر»', () => V.workshopQr({ id: WS })],
  ['admin.cohort-workshops: أيام الورشة ونسب حضورها', () => V.cohortWorkshops({ cohort_id: C1 })],
  ['admin.peer: طلبات الأقران في الدفعة', () => PR.adminList({ cohort_id: C1 })],
  ['admin.hall: القاعة', () => H.adminState({ cohort_id: C1 })],
  ['admin.capstones: طابور المبادرات', () => X.adminList({})],
  ['admin.outcomes: محفظة المتابعة', () => T.adminOutcomes({})],
  ['admin.certificates: السجل والمعلّقة', () => Z.list({})],
  ['تقرير الصحة الأسبوعي', () => S.weeklyNumbers()],
  ['cohortRoster: مصدر النبض اليومي والبريد الأسبوعي وتنبيه المتأخرين', async () => { const r: any = await C.cohortRoster(C1, { now: PULSE_AT }); return { ids: r.roster.map((x: Row) => x.id).sort(), map: r.journey_map }; }],
  ['admin.coaching-group-preview: معاينة الجلسة الجماعية مع المستشار', () => CG.preview({ cohort_id: C1 })],
  ['admin.coaching-groups: الجلسات الجماعية', () => CG.adminList({ cohort_id: C1 })],
  ['admin.impact: تقرير الأثر', () => I.adminReport({})],
  ['admin.experts: الخبراء وأحمالهم', () => E.adminList()],
  ['admin.today: مكتب اليوم', () => TD.today()],
];

Deno.test('خارج كل عدّ وقائمة: كل قراءة بالدفعة والجهة والمنصة كما كانت قبل الحساب، ولا تذكره', async () => {
  const w = world();
  try {
    const snap = async () => {
      const out: Record<string, string> = {};
      // ما يشتق من الساعة وحده يتغير بين قراءتين: وقت التوليد، وعدّاد رمز الحضور ورمزه ورابطه (نافذة 30 ثانية تُعبر بين القراءتين)
      for (const [name, fn] of READS) out[name] = JSON.stringify(await fn()).replace(/"(at|now|generated_at)":"[^"]+"/g, '"$1":"T"')
        .replace(/"refresh_in":\d+/g, '"refresh_in":0').replace(/"code":"\d{6}"/g, '"code":"C"').replace(/checkin=[^"]+/g, 'checkin=Q');
      return out;
    };
    const before = await snap();
    // القراءات تعمل فعلًا على هذه القاعدة وتعدّ العضوتين (فلا يمر الاختبار برد فارغ)
    assertEquals(((await G.list()) as any).cohorts.find((c: Row) => c.id === C1).members, 2);
    assertEquals(((await G.cohortMemberIds(C1)) as any).ids.sort(), [REAL, REAL2]);
    assertEquals(((await V.workshopAttendance({ id: WS })) as any).people.map((p: Row) => p.id).sort(), [REAL, REAL2]);
    assertEquals(((await C.adminCohortJourney(ADMIN, { cohort_id: C1 })) as any).success, true);

    // الحساب يُنشأ ويعمل: يتخطى ويفتح، ويسأل الأقران، ويسجّل حضور جلسة دفعته الحقيقية، وحساب دفعة أخرى وعام معه
    const t1 = await w.open(C1);
    await w.open(C2); await w.open();
    const d = w.ready(C1);
    w.ready(C2); w.ready(null);
    assertEquals((await w.call('demo.open-all', { token: t1 })).status, 200);
    assertEquals((await w.call('demo.skip-stage', { token: t1 })).status, 200);
    assertEquals((await w.call('peer.ask', { token: t1, text: 'سؤال من الحساب التجريبي في عرض الدفعة', source: 'free' })).status, 200);
    const check = await w.call('workshop.checkin', { token: t1, session_id: WS, code: '000000' });
    assert(check.status === 200 ? check.simulated === true : true);
    assertEquals(w.tables.workshop_attendance.some((x) => x.participant_id === d.id), false);

    const after = await snap();
    const demoIds = w.tables.participants.filter((p) => p.is_demo).flatMap((p) => [p.id, p.email]);
    for (const [name] of READS) {
      assertEquals(after[name], before[name], name);
      for (const id of demoIds) assert(!after[name].includes(id), `${name}: يذكر الحساب التجريبي`);
    }
    // النبض اليومي: لقطة الدفعة تعدّ العضوتين وحدهما
    const pulse: any = await CPU.cohortSnapshots(PULSE_AT);
    assert(pulse.taken >= 1, JSON.stringify(pulse));
    const snapRow = w.tables.cohort_snapshots.find((x) => x.cohort_id === C1)!;
    assertEquals(snapRow.members, 2, JSON.stringify(snapRow));
    assert(!JSON.stringify(w.tables.cohort_snapshots).includes(d.id));
    // التذكير: معاينته لا تضم الحساب التجريبي ولو أُرسل معرّفه
    const nudge = JSON.stringify(await NU.previewNudges([REAL, d.id]));
    assert(!nudge.includes(d.id) && !nudge.includes(d.email), nudge.slice(0, 300));
    // والسعة: العدد الذي تُقارن به سعة الدفعة هو عدد الأعضاء نفسه
    const c1 = ((await G.list()) as any).cohorts.find((c: Row) => c.id === C1);
    assertEquals([c1.members, c1.capacity], [2, 10]);
    // ولا صف عضوية كُتب له في أي طريق
    for (const t of ['enrollments', 'cohort_group_members', 'cohort_roles', 'hall_presence', 'workshop_attendance', 'certificates']) assertEquals(w.tables[t].some((x) => demoIds.includes(x.participant_id)), false, t);
  } finally { w.restore(); }
});

Deno.test('لا يُلحق بدفعة ولا بمجموعة ولو أُرسل معرّفه باليد، والمشارك الحقيقي يُلحق كما كان', async () => {
  const w = world();
  try {
    await w.open(C1);
    const d = w.demoOf(C1)!;
    assertEquals(await failCode(() => G.cohortEnroll(ADMIN, { cohort_id: C2, participant_ids: [d.id], confirm_move: true })), [400, 'demo']);
    assertEquals(await failCode(() => G.cohortEnroll(ADMIN, { cohort_id: C1, participant_ids: [LONER, d.id], confirm_move: true })), [400, 'demo']);
    assertEquals(await failCode(() => G.cohortGroupAssign(ADMIN, { cohort_id: C1, participant_id: d.id, group_id: U(70) })), [400, 'demo']);
    // عضو الجهة ملحق بدفعتها صراحة (placeOrgMembers، تصور المرحلة 4)، فالإلحاقان قائمان كما كانا ولم يُضف صف
    assertEquals([w.tables.enrollments.length, w.tables.cohort_group_members.length], [2, 2]);
    assertEquals(((await G.cohortEnroll(ADMIN, { cohort_id: C2, participant_ids: [LONER], confirm_move: true })) as any).enrolled, 1);
    assertEquals(((await G.cohortGroupAssign(ADMIN, { cohort_id: C1, participant_id: LONER, group_id: U(70) })) as any).success, true);
    // والربط بجهة يرده القيد participants_demo_no_org في القاعدة (demo_cohort_schema.test.js على قاعدة حقيقية)
  } finally { w.restore(); }
});

Deno.test('الخصوصية: حساب الدفعة لا يرى اسم عضو ولا بريده ولا جواله في أي شاشة، ولا يراه عضو ولا خبير', async () => {
  const w = world();
  try {
    const t1 = await w.open(C1);
    const d = w.ready(C1);
    await w.call('demo.open-all', { token: t1 });
    const seen: Record<string, string> = {};
    // كل قراءة للمشارك قد تحمل غيره: الرئيسية (المجموعة والمستشار والدفعة)، والأقران، والقاعة، واقتراح الخبراء، وكاتون،
    // والتقييمات المعلّقة، والمبادرة ومشاركاتها، والمتابعة، و360، والأثر، والجلسات
    for (const action of ['me', 'peer.list', 'hall.state', 'experts.suggest', 'katon.mine', 'ratings.pending', 'capstone.get', 'capstone.doc', 'capstone.shares', 'tracking.get', 'f360.mine', 'impact.mine', 'achievements', 'sessions.list', 'org.visibility', 'me.privacy', 'guide.state']) {
      const r = await w.call(action, { token: t1, with_home: true });
      seen[action] = JSON.stringify(r);
      for (const pii of REAL_PII) assert(!seen[action].includes(pii), `${action}: يحمل ${pii}`);
    }
    const me = JSON.parse(seen.me);
    // مجموعته: لا مجموعة (ليس عضوًا). مستشاره: لا اسم. القاعة: لا جلسة. الأقران: لا طلب حقيقي
    assertEquals([me.group, me.advisor, JSON.parse(seen['hall.state']).session ?? null], [null, null, null]);
    assertEquals((JSON.parse(seen['peer.list']).items || []).length, 0);
    assertEquals(await advisorOf(d as any), null);
    // يسأل فيرى سؤاله وحده، ولا يجيب طلبًا حقيقيًا، ولا يدخل القاعة ولا يرفع يدًا
    const asked = await w.call('peer.ask', { token: t1, text: 'سؤال من الحساب التجريبي في عرض الدفعة', source: 'free' });
    assertEquals([asked.status, asked.items.length, asked.items.every((x: Row) => x.mine)], [200, 1, true]);
    assertEquals((await w.call('peer.answer', { token: t1, request_id: U(80), text: 'إجابة من الحساب التجريبي' })).status, 404);
    for (const action of ['hall.join', 'hall.hand', 'hall.pick', 'workshop.join', 'experts.choose', 'rater.invite', 'f360.nominate', 'me.sponsor-code', 'me.switch']) assertEquals([action, (await w.call(action, { token: t1 })).code], [action, 'demo']);
    // ومن الجهة الأخرى: العضوة الحقيقية والخبير والإدارة لا يرون سؤاله ولا اسمه
    const real = await w.call('peer.list', { token: await w.realSession(REAL2) });
    assertEquals((real.items as Row[]).map((x) => x.id), [U(80)]);
    assertEquals(((await PR.adminList({ cohort_id: C1 })) as any).items.map((x: Row) => x.id), [U(80)]);
    assertEquals(((await PR.expertList(w.tables.experts[0])) as any).items.map((x: Row) => x.id), [U(80)]);
    assert(!JSON.stringify(await w.call('me', { token: await w.realSession(REAL) })).includes(d.id));
    // لا بريد خرج ولا وُضع في الطابور
    assertEquals([w.tables.mail_queue.length, w.tables.mail_log.length], [0, 0]);
    // وجلسته جلسة مشارك وحده: لا فعل إدارة ولا منسق ولا خبير
    for (const action of ['admin.demo-cohort', 'admin.demo-open', 'admin.demo-reset', 'admin.cohort-save', 'admin.participants', 'admin.cohort-journey', 'coord.dashboard', 'xp.dashboard']) {
      assertEquals([action, (await w.call(action, { token: t1, cohort_id: C1 })).status], [action, 401]);
    }
  } finally { w.restore(); }
});

Deno.test('حسابا دفعتين معزولان: ما يُفعل في أحدهما لا يظهر في الآخر ولا في العام، وإعادة ضبط أحدهما لا تمس غيره', async () => {
  const w = world();
  try {
    const t1 = await w.open(C1), t2 = await w.open(C2), tg = await w.open();
    for (const c of [C1, C2, null]) w.ready(c);
    await w.call('demo.skip-stage', { token: t1 });
    await w.call('peer.ask', { token: t1, text: 'سؤال من حساب الدفعة الأولى للعرض', source: 'free' });
    const m2 = await w.call('me', { token: t2 }), mg = await w.call('me', { token: tg });
    assert((m2.journey as Row[]).every((s) => !s.skipped) && (mg.journey as Row[]).every((s) => !s.skipped));
    assertEquals(((await w.call('peer.list', { token: t2 })).items || []).length, 0);
    assertEquals(((await w.call('peer.list', { token: tg })).items || []).length, 0);
    // إعادة ضبط حساب C1: للمدير الأعلى (غلاف superWriter في index.ts)، وتحذف حسابه وحده
    const ids = { c2: w.demoOf(C2)!.id, g: w.demoOf(null)!.id };
    const reals = JSON.stringify(w.tables.participants.filter((p) => !p.is_demo));
    await D.reset(SUPER, { cohort_id: C1 });
    assertEquals([w.demoOf(C1), w.demoOf(C2)!.id, w.demoOf(null)!.id], [undefined, ids.c2, ids.g]);
    assertEquals(JSON.stringify(w.tables.participants.filter((p) => !p.is_demo)), reals);
    assertEquals([(await w.call('me', { token: t1 })).status, (await w.call('me', { token: t2 })).status, (await w.call('me', { token: tg })).status], [401, 200, 200]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.reset').map((x) => [x.actor, x.after.cohort]), [[SUPER.email, C1]]);
    // وإعادة ضبط العام كما كانت: تحذف العام وحده
    await D.reset(SUPER);
    assertEquals([w.demoOf(null), w.demoOf(C2)!.id], [undefined, ids.c2]);
    const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
    assert(index.includes("'admin.demo-reset': (a, b) => A.superWriter(a, D.reset, b)"));
    assert(index.includes("'admin.demo-cohort': (a, b) => A.writer(a, (_x, y) => D.cohortStatus(y), b)"));
  } finally { w.restore(); }
});

Deno.test('سطر الحالة في ملف الدفعة: لم يُنشأ، ثم قائم بمرحلته وآخر استعماله ومن فتحه، ولا تنشئه القراءة', async () => {
  const w = world();
  try {
    const none: any = await D.cohortStatus({ cohort_id: C1 });
    assertEquals([none.ready, none.exists, none.general, none.closed, none.links, none.cohort.name], [true, false, false, false, [], 'قادة الجهة 1']);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
    const t1 = await w.open(C1, ADMIN2);
    // في القاعدة last_seen_at بقيمة افتراضية عند إنشاء الجلسة (now())، والقاعدة المزيفة بلا قيم افتراضية
    for (const x of w.tables.auth_sessions) x.last_seen_at ??= x.created_at;
    const fresh: any = await D.cohortStatus({ cohort_id: C1 });
    assertEquals([fresh.exists, fresh.stage, fresh.last_opened_by, !!fresh.last_opened_at, !!fresh.last_used_at], [true, 'الملف الشخصي', ADMIN2.email, true, true]);
    w.ready(C1);
    assertEquals(((await D.cohortStatus({ cohort_id: C1 })) as any).stage, 'التدريب');
    for (let i = 0; i < 8; i++) if ((await w.call('demo.skip-stage', { token: t1 })).status !== 200) break;
    assertEquals(((await D.cohortStatus({ cohort_id: C1 })) as any).stage, DEMO_ALL_SKIPPED_AR);
    assertEquals([demoStageLine({ kind: 'none', title: null }), demoStageLine({ kind: 'stage', title: 'التدريب' }), demoCohortLabel('قادة الجهة 1'), demoCohortLabel(''), demoCohortLabel(null)], [DEMO_ALL_SKIPPED_AR, 'التدريب', 'دفعة «قادة الجهة 1»', '', '']);
    // لا شيء في الرد من بيانات عضو، ولا رمز جلسة ولا بصمة
    const text = JSON.stringify(await D.cohortStatus({ cohort_id: C1 }));
    for (const pii of REAL_PII) assert(!text.includes(pii));
    assert(!/token|hash/.test(text) && !DASH.test(text));
    // الدفعة المفتوحة: الحساب العام. والمغلقة: مغلقة بلا حساب. وغير الموجودة 404
    const open: any = await D.cohortStatus({ cohort_id: OPEN });
    assertEquals([open.general, open.ready, open.exists], [true, true, false]);
    const closed: any = await D.cohortStatus({ cohort_id: CLOSED });
    assertEquals([closed.closed, closed.exists], [true, false]);
    assertEquals(await failCode(() => D.cohortStatus({ cohort_id: U(999) })), [404, 'bad_request']);
    assertEquals(await failCode(() => D.cohortStatus({})), [404, 'bad_request']);
  } finally { w.restore(); }
});

Deno.test('روابط التجربة لحساب دفعتها: رابط الدفعة يفتح حسابها وحده، والروابط القائمة بلا دفعة تفتح العام كما كانت، والقوائم منفصلة', async () => {
  const w = world();
  try {
    const tok = (r: any) => String(r.url).split('#try=')[1];
    // رابط قائم من قبل الترحيل: صف بلا cohort_id
    const old: any = await D.linkCreate(ADMIN, { label: 'رابط قديم عام' });
    delete w.tables.demo_links[0].cohort_id;
    const l1: any = await D.linkCreate(ADMIN, { label: 'مدير دفعة الجهة', cohort_id: C1 });
    const l2: any = await D.linkCreate(ADMIN, { label: 'مدير دفعة الأفراد', cohort_id: C2 });
    assertEquals(w.tables.demo_links.map((l) => l.cohort_id ?? null), [null, C1, C2]);
    // القوائم: العام في النظرة العامة، وكل دفعة في ملفها
    assertEquals(((await D.linkList()) as any).links.map((l: Row) => l.label), ['رابط قديم عام']);
    assertEquals(((await D.cohortStatus({ cohort_id: C1 })) as any).links.map((l: Row) => l.label), ['مدير دفعة الجهة']);
    assertEquals(((await D.cohortStatus({ cohort_id: C2 })) as any).links.map((l: Row) => l.label), ['مدير دفعة الأفراد']);
    // الفتح: كل رابط يدخل حساب دفعته، ويُنشأ الحساب عند أول فتح
    const o1 = await w.call('demo.link-open', { t: tok(l1) }), o2 = await w.call('demo.link-open', { t: tok(l2) }), og = await w.call('demo.link-open', { t: tok(old) });
    assertEquals([o1.status, o2.status, og.status], [200, 200, 200]);
    assertEquals([o1.participant.id, o2.participant.id, og.participant.id], [w.demoOf(C1)!.id, w.demoOf(C2)!.id, w.demoOf(null)!.id]);
    assertEquals([o1.cohort?.name, o2.cohort?.name, og.cohort, o1.demo_shared, og.participant.email], ['قادة الجهة 1', 'دفعة الأفراد 2', null, true, GENERAL_EMAIL]);
    // فتح المدير لحساب الدفعة لا يخرج زائر رابطها، وجلسة الرابط لا تبلغ فعل إدارة
    await w.open(C1);
    assertEquals((await w.call('me', { token: o1.token })).status, 200);
    assertEquals((await w.call('admin.demo-cohort', { token: o1.token, cohort_id: C2 })).status, 401);
    // رابط لدفعة مغلقة أو مفتوحة عامة: المغلقة مرفوضة، والمفتوحة رابطها عام
    assertEquals(await failCode(() => D.linkCreate(ADMIN, { label: 'مدير المغلقة', cohort_id: CLOSED })), [409, 'cohort_closed']);
    await D.linkCreate(ADMIN, { label: 'مدير المفتوحة', cohort_id: OPEN });
    assertEquals(w.tables.demo_links.at(-1)!.cohort_id ?? null, null);
    // الإلغاء بمعرّف الرابط كما كان
    assertEquals(((await D.linkRevoke(ADMIN, { id: l2.link.id })) as any).ended, 1);
    assertEquals([(await w.call('me', { token: o2.token })).status, (await w.call('demo.link-open', { t: tok(l2) })).code], [401, 'link_revoked']);
  } finally { w.restore(); }
});

Deno.test('إغلاق الدفعة يحذف حسابها التجريبي ويلغي روابطه، بسطر في السجل، ولا يمس مشاركًا حقيقيًا ولا حساب دفعة أخرى', async () => {
  const w = world();
  try {
    const tok = (r: any) => String(r.url).split('#try=')[1];
    const t1 = await w.open(C1), t2 = await w.open(C2);
    await w.open();
    const l1: any = await D.linkCreate(ADMIN, { label: 'مدير دفعة الجهة', cohort_id: C1 });
    const lg: any = await D.linkCreate(ADMIN, { label: 'رابط عام' });
    const visitor = (await w.call('demo.link-open', { t: tok(l1) })).token;
    const d1 = w.ready(C1).id;
    await w.call('demo.skip-stage', { token: t1 });
    const others = () => JSON.stringify(w.tables.participants.filter((p) => p.id !== d1));
    const membership = () => JSON.stringify(['enrollments', 'cohort_group_members', 'cohort_roles', 'workshop_attendance', 'placements', 'assessments', 'participant_requirements', 'peer_requests', 'peer_answers'].map((t) => w.tables[t].filter((x) => x.participant_id !== d1)));
    const [pBefore, mBefore] = [others(), membership()];
    // حفظ لا يغلق لا يحذف شيئًا
    await G.cohortSave(ADMIN, { id: C1, notes_ar: 'ملاحظة' });
    assert(w.demoOf(C1));
    const saved: any = await G.cohortSave(ADMIN, { id: C1, status: 'closed' });
    assertEquals([saved.cohort.status, saved.demo_closed], ['closed', { removed: 1, links: 1 }]);
    // حُذف حساب C1 وحده بكل ما عليه، وانتهت جلساته (المدير وزائر الرابط)، ورابطه أُلغي
    assertEquals([w.demoOf(C1), !!w.demoOf(C2), !!w.demoOf(null)], [undefined, true, true]);
    assertEquals([others(), membership()], [pBefore, mBefore]);
    assertEquals(w.tables.participant_stage_overrides.length, 0);
    assertEquals([(await w.call('me', { token: t1 })).status, (await w.call('me', { token: visitor })).status, (await w.call('me', { token: t2 })).status], [401, 401, 200]);
    assertEquals(w.tables.demo_links.map((l) => [l.label, !!l.revoked_at, l.revoked_by ?? null]), [['مدير دفعة الجهة', true, ADMIN.email], ['رابط عام', false, null]]);
    // الرابط الملغى لا يفتح ولا ينشئ الحساب من جديد، ولا يُفتح حساب لدفعة مغلقة
    assertEquals((await w.call('demo.link-open', { t: tok(l1) })).code, 'link_revoked');
    assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: C1 }, CTX)), [409, 'cohort_closed']);
    assertEquals(w.demoOf(C1), undefined);
    assertEquals((await w.call('demo.link-open', { t: tok(lg) })).status, 200);
    // سطر السجل: من أغلق وما حُذف
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.cohort-close').map((x) => [x.actor, x.entity, x.entity_id, x.after]), [[ADMIN.email, 'cohorts', C1, { cohort: C1, removed: [d1], links: 1 }]]);
    // كل حذف من المشاركين في هذا المسار لصف تجريبي: لا معرّف حقيقي في أي عبارة حذف
    const reals = new Set([REAL, REAL2, LONER]);
    assert(w.writes.filter((x) => x.table === 'participants' && x.kind === 'delete').every((x) => (x.ids || []).every((id) => !reals.has(id))));
    // دفعة بلا حساب: إغلاقها لا يكتب سطرًا ولا يحذف أحدًا
    const n = w.tables.participants.length;
    const again: any = await G.cohortSave(ADMIN, { id: C2, status: 'planned' });
    assertEquals([again.demo_closed, w.tables.participants.length], [undefined, n]);
    // إعادة فتحها ثم الفتح: حساب جديد نظيف
    await G.cohortSave(ADMIN, { id: C1, status: 'running' });
    await w.open(C1);
    assert(w.demoOf(C1)!.id !== d1);
    // وحذف الدفعة نفسها يحذف حسابها بالقيد
    await db.from('cohorts').delete().eq('id', C2);
    assertEquals(w.demoOf(C2), undefined);
  } finally { w.restore(); }
});

Deno.test('الحذف عند الإغلاق لا يبلغ مشاركًا حقيقيًا مهما كان الصف: حقيقي يحمل الدفعة بلا العلامة لا يُحذف', async () => {
  const w = world();
  try {
    await w.open(C1);
    const d1 = w.demoOf(C1)!.id;
    // حالة يمنعها القيد participants_demo_cohort_is_demo في القاعدة: مشارك حقيقي يحمل demo_cohort_id. حتى لو وُجدت لا يُحذف
    Object.assign(w.tables.participants.find((p) => p.id === REAL)!, { demo_cohort_id: C1 });
    // وحساب تجريبي لدفعة أخرى، والعام
    await w.open(C2); await w.open();
    const r = await DC.removeCohortDemo(ADMIN.email, C1, 'cohort-close');
    assertEquals(r, { removed: 1, links: 0 });
    assertEquals(w.tables.participants.map((p) => p.id).includes(d1), false);
    assertEquals(w.tables.participants.filter((p) => !p.is_demo).map((p) => p.id).sort(), [REAL, REAL2, LONER].sort());
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 2);
    // عبارة الحذف نفسها تحمل العلامة والدفعة: يقرؤها الاختبار من المصدر
    const src = await Deno.readTextFile(new URL('./demo-cohort.ts', import.meta.url));
    assert(src.includes("from('participants').delete().eq('id', r.id).eq('is_demo', true).eq('demo_cohort_id', cohortId)"));
    assert(src.includes("from('participants').select('id').eq('is_demo', true).eq('demo_cohort_id', cohortId)"));
    assertEquals((src.match(/from\('participants'\)\.delete\(\)/g) || []).length, 1);
    // وتعذّر الحذف لا يرد حفظ الإغلاق: يُعلن في الرد وفي السجل
    await w.open(C2);
    const real = (db as any).from;
    (db as any).from = (t: string) => { const q = real(t); if (t === 'participants') { const del = q.delete; q.delete = () => { const x = del(); x.then = (ok: any) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(ok); return x; }; } return q; };
    const saved: any = await G.cohortSave(ADMIN, { id: C2, status: 'closed' });
    (db as any).from = real;
    assertEquals([saved.success, saved.cohort.status, saved.demo_closed], [true, 'closed', { failed: true }]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.cohort-close-failed').length, 1);
    // والباقي يحذفه المدير الأعلى بإعادة الضبط، ولا يُفتح لدفعة مغلقة
    assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: C2 }, CTX)), [409, 'cohort_closed']);
    await D.reset(SUPER, { cohort_id: C2 });
    assertEquals(w.demoOf(C2), undefined);
  } finally { w.restore(); }
});

Deno.test('قبل الترحيل: كل شيء كما كان بالحساب الواحد وروابطه، وحساب الدفعة «غير مفعّل بعد» بلا أثر، ثم يُفعَّل بلا نشر', async () => {
  const w = world({ before: true });
  try {
    // الحساب العام وروابطه وقائمتها وإلغاؤها وإعادة ضبطه كما هي
    const tg = await w.open();
    const g = w.demoOf(null)!;
    assertEquals([g.email, 'demo_cohort_id' in g], [GENERAL_EMAIL, false]);
    assertEquals((await w.call('me', { token: tg })).status, 200);
    const l: any = await D.linkCreate(ADMIN, { label: 'مدير الدفعة' });
    assertEquals(['cohort_id' in w.tables.demo_links[0], ((await D.linkList()) as any).links.length], [false, 1]);
    const o = await w.call('demo.link-open', { t: String(l.url).split('#try=')[1] });
    assertEquals([o.status, o.participant.id, o.demo_shared], [200, g.id, true]);
    assertEquals((await w.call('demo.skip-stage', { token: tg })).status, 200);
    assertEquals(((await D.linkRevoke(ADMIN, { id: l.link.id })) as any).ended, 1);
    // حساب الدفعة: الحالة تقول غير مفعّل، والفتح والرابط والضبط تُرد برسالتها، ولا يُفتح العام مكانه بصمت
    const st: any = await D.cohortStatus({ cohort_id: C1 });
    assertEquals([st.ready, st.exists, st.links], [false, false, []]);
    for (const fn of [() => D.open(ADMIN, { cohort_id: C1 }, CTX), () => D.linkCreate(ADMIN, { label: 'مدير دفعة الجهة', cohort_id: C1 }), () => D.reset(SUPER, { cohort_id: C1 })]) {
      const e = (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
      assertEquals([e.status, e.code], [409, 'not_migrated']);
      assert(/غير مفعّل بعد/.test(e.message) && !DASH.test(e.message));
    }
    assertEquals([w.tables.participants.filter((p) => p.is_demo).length, w.tables.demo_links.length, w.tables.auth_sessions.filter((s) => !s.revoked_at && s.participant_id === g.id).length], [1, 1, 1]);
    // الدفعة المفتوحة حسابها العام حتى قبل الترحيل
    assertEquals([((await D.cohortStatus({ cohort_id: OPEN })) as any).ready, (await w.call('me', { token: await w.open(OPEN) })).participant.id], [true, g.id]);
    // إغلاق دفعة قبل الترحيل: لا حذف ولا خطأ
    const saved: any = await G.cohortSave(ADMIN, { id: C2, status: 'closed' });
    assertEquals([saved.success, saved.demo_closed], [true, undefined]);
    await D.reset(SUPER);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
  } finally { w.restore(); }
  // بعد الترحيل بلا إعادة تشغيل: السؤال يُعاد في كل طلب ما دام «غير موجود»
  const after = world();
  try {
    assertEquals(await DC.demoCohortReady(), true);
    assertEquals(((await D.cohortStatus({ cohort_id: C1 })) as any).ready, true);
    await after.open(C1);
    assert(after.demoOf(C1));
  } finally { after.restore(); }
});

Deno.test('تعذّر القاعدة ليس «غير مفعّل»: خطأ صريح، ولا يُفتح حساب آخر مكانه', async () => {
  const w = world();
  try {
    const real = (db as any).from;
    (db as any).from = (t: string) => (t === 'demo_links' ? { select: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }) }) } : real(t));
    try {
      assertEquals(await failCode(() => D.open(ADMIN, { cohort_id: C1 }, CTX)), [500, 'db_error']);
      assertEquals(await failCode(() => D.cohortStatus({ cohort_id: C1 })), [500, 'db_error']);
    } finally { (db as any).from = real; }
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
  } finally { w.restore(); }
});
