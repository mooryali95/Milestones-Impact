// الدفعة هي الوحدة الوحيدة (ترحيل 20261128160000): الإلحاق عند ربط الرمز ورابط الجهة، والتزامن عند السعة (N بالضبط ولا إلحاق
// مزدوج)، وما قبل الترحيل، ودفعة الرمز في الإدارة، وأداة إلحاق من لا دفعة له ببصمة الخطة. بقاعدة في الذاكرة (_fake_db.ts)،
// والدالة place_participant محاكاة بقاعدتها في الترحيل (واختبارها الحقيقي على PGlite في admin-app/src/cohort-intake-sql.test.js)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const P = await import('./participant.ts');
const SC = await import('./sponsor-codes.ts');
const CI = await import('./cohort-intake.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(880001), ORG2 = U(880002), PROG = U(880010), V2 = U(880012), SPRING = U(880020), OTHER = U(880021);
const ADMIN = { email: 'a@example.sa', role: 'admin' as const };

// كالدالة في الترحيل: المشارك، ثم إلحاقه القائم، ثم دفعة الرمز للجهة نفسها أو الاستقبال (يُنشأ مثبتًا)، ثم السعة، وإلا المنصة العامة
function placeRpc(name: string, a: any, t: Record<string, Row[]>) {
  if (name === 'redeem_sponsor_code') {
    const c = (t.sponsor_codes || []).find((x) => x.code === String(a.p_code).trim().toLowerCase());
    if (!c) return { data: [{ org_id: null, reason: 'unknown' }], error: null };
    c.used += 1;
    (t.sponsor_code_uses ||= []).push({ code_id: c.id, participant_id: a.p_participant });
    return { data: [{ org_id: c.organization_id, reason: 'ok' }], error: null };
  }
  if (name !== 'place_participant') return null;
  const out = (cohort_id: string | null, outcome: string) => ({ data: [{ cohort_id, outcome }], error: null });
  const p = (t.participants || []).find((x) => x.id === a.p_participant);
  if (!p) return out(null, 'none');
  if (p.is_demo) return out(null, 'demo');
  const enr = t.enrollments ||= [];
  const had = enr.find((e) => e.participant_id === p.id && e.status !== 'withdrawn');
  if (had) return out(had.cohort_id, 'already');
  const cohorts = t.cohorts ||= [];
  const mk = (row: Row) => { const c = { id: crypto.randomUUID(), status: 'open', capacity: null, program_id: PROG, program_version_id: V2, ...row }; cohorts.push(c); return c; };
  let target = a.p_wanted ? cohorts.find((c) => c.id === a.p_wanted && c.organization_id === (p.organization_id || null) && !c.is_default) : null;
  if (!target && p.organization_id) target = cohorts.find((c) => c.is_intake && c.organization_id === p.organization_id) || mk({ name: 'استقبال', organization_id: p.organization_id, is_intake: true });
  let res = 'placed';
  if (target && (target.status === 'closed' || (target.capacity != null && enr.filter((e) => e.cohort_id === target.id && e.status !== 'withdrawn').length >= target.capacity))) res = 'overflow';
  const got = !target || res === 'overflow' ? (cohorts.find((c) => c.is_default) || mk({ name: 'المنصة العامة', organization_id: null, is_default: true })) : target;
  enr.push({ participant_id: p.id, cohort_id: got.id, status: 'active', created_at: new Date().toISOString() });
  (t.cohort_placements ||= []).push({ participant_id: p.id, cohort_id: got.id, organization_id: p.organization_id || null, source: a.p_source, outcome: res, actor: a.p_actor });
  return out(got.id, res);
}

const person = (n: number, org: string | null = null) => ({ id: U(880100 + n), full_name: `مشارك ${n}`, email: `c${n}@example.sa`, organization_id: org, status: 'registered', is_demo: false, is_test: false });
function world(extra: Row = {}, opts: Record<string, any> = {}) {
  const tables: Record<string, Row[]> = {
    organizations: [{ id: ORG, name: 'منظومة', short_name: 'Manzoma', status: 'active', invite_code: 'manzoma-invite-01', contract_ends: null },
      { id: ORG2, name: 'جهة ثانية', status: 'active', invite_code: 'second-invite-01', contract_ends: null }],
    programs: [{ id: PROG, name: 'برنامج القادة', is_default: true }],
    cohorts: [{ id: SPRING, name: 'دفعة الربيع', organization_id: ORG, status: 'open', capacity: null, is_intake: false, is_default: false, program_id: PROG },
      { id: OTHER, name: 'دفعة غريبة', organization_id: ORG2, status: 'open', is_intake: false, is_default: false, program_id: PROG }],
    participants: Array.from({ length: 30 }, (_, i) => person(i + 1)),
    enrollments: [], cohort_placements: [], sponsor_codes: [], sponsor_code_uses: [], audit_log: [], entitlements: [], sponsor_decisions: [], payments: [],
    ...extra,
  };
  return installFake(tables, { rpc: placeRpc, ...opts });
}
const pOf = (w: any, n: number) => w.tables.participants.find((p: Row) => p.id === U(880100 + n));
const active = (w: any, n: number) => w.tables.enrollments.filter((e: Row) => e.participant_id === U(880100 + n) && e.status !== 'withdrawn');
// sponsorCode يعيد ملف المشارك بعد الربط؛ ما يهم هنا الربط والإلحاق، فخطأ في بناء الملف بعده لا يغيّرهما
const redeem = async (w: any, n: number, code: string) => {
  try { await P.sponsorCode(pOf(w, n), { sponsor_code: code }, { ip: `10.1.0.${n}` }); } catch (e) { if (!pOf(w, n).organization_id) throw e; }
};

Deno.test('رمز بدفعة يُلحق بها مستعمله، ورمز بلا دفعة يُلحق باستقبال جهته (يُنشأ)، والمصدر code', async () => {
  const w = world();
  try {
    const withCohort: any = await SC.adminCreate(ADMIN, { org_id: ORG, cohort_id: SPRING });
    assertEquals(withCohort.code.cohort_id, SPRING);
    const plain: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    await redeem(w, 1, withCohort.code.code);
    await redeem(w, 2, plain.code.code);
    assertEquals(active(w, 1).map((e: Row) => e.cohort_id), [SPRING]);
    const intake = w.tables.cohorts.find((c: Row) => c.is_intake && c.organization_id === ORG);
    assert(intake, 'أُنشئت دفعة الاستقبال');
    assertEquals(active(w, 2).map((e: Row) => e.cohort_id), [intake.id]);
    assertEquals(w.tables.cohort_placements.map((r: Row) => r.source), ['code', 'code']);
  } finally { w.restore(); }
});

Deno.test('دفعة الرمز في الإدارة: من دفعات الجهة نفسها وغير مغلقة، وتغييرها لا ينقل من أُلحق', async () => {
  const w = world();
  try {
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, cohort_id: OTHER }), Error, 'من دفعات هذه الجهة');
    w.tables.cohorts[0].status = 'closed';
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, cohort_id: SPRING }), Error, 'مغلقة');
    w.tables.cohorts[0].status = 'open';
    const c: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    await redeem(w, 3, c.code.code);
    const before = active(w, 3)[0].cohort_id;
    const u: any = await SC.adminUpdate(ADMIN, { id: c.code.id, cohort_id: SPRING });
    assertEquals(u.code.cohort_id, SPRING);
    assertEquals(active(w, 3)[0].cohort_id, before);
  } finally { w.restore(); }
});

Deno.test('التزامن عند السعة: عشرون إلحاقًا متزامنًا في دفعة سعتها 5 تُلحق 5 بالضبط والباقي في المنصة العامة، ولا إلحاق مزدوج', async () => {
  const w = world();
  try {
    for (let i = 1; i <= 20; i++) pOf(w, i).organization_id = ORG;
    w.tables.cohorts[0].capacity = 5;
    // كل مشارك يُطلب إلحاقه مرتين في الوقت نفسه (نقرتان، أو تسجيل وربط متزامنان)
    const calls = Array.from({ length: 20 }, (_, i) => U(880101 + i)).flatMap((id) => [CI.placeParticipant(id, 'code', SPRING), CI.placeParticipant(id, 'link', SPRING)]);
    const res = await Promise.all(calls);
    assertEquals(res.filter((r) => r?.outcome === 'placed').length, 5);
    assertEquals(res.filter((r) => r?.outcome === 'overflow').length, 15);
    assertEquals(res.filter((r) => r?.outcome === 'already').length, 20);
    assertEquals(w.tables.enrollments.filter((e: Row) => e.cohort_id === SPRING).length, 5);
    const per = new Map<string, number>();
    for (const e of w.tables.enrollments) per.set(e.participant_id, (per.get(e.participant_id) || 0) + 1);
    assertEquals([...per.values()].every((n) => n === 1), true);
    assertEquals(per.size, 20);
    // قائمة انتظار الجهة: الخمسة عشر الذين بقوا في المنصة العامة
    const r: any = await CI.adminOrgIntake({ org_id: ORG });
    assertEquals(r.waiting.length, 15);
  } finally { w.restore(); }
});

Deno.test('من له دفعة لا يُنقل آليًا برمز يكتبه لاحقًا، ويظهر في قائمة انتظار جهته', async () => {
  const w = world();
  try {
    await CI.placeParticipant(U(880104), 'platform');
    const c: any = await SC.adminCreate(ADMIN, { org_id: ORG, cohort_id: SPRING });
    await redeem(w, 4, c.code.code);
    assertEquals(pOf(w, 4).organization_id, ORG);
    const platform = w.tables.cohorts.find((x: Row) => x.is_default);
    assertEquals(active(w, 4).map((e: Row) => e.cohort_id), [platform?.id]);
    const r: any = await CI.adminOrgIntake({ org_id: ORG });
    assertEquals(r.waiting.map((x: Row) => x.participant_id), [U(880104)]);
  } finally { w.restore(); }
});

Deno.test('قبل الترحيل: لا دالة إلحاق، فالربط يعمل كما كان ولا خطأ للمشارك ولا سطر فشل', async () => {
  const w = world({}, { rpc: (n: string, a: any, t: any) => (n === 'place_participant' ? null : placeRpc(n, a, t)) });
  try {
    const c: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    await redeem(w, 5, c.code.code);
    assertEquals(pOf(w, 5).organization_id, ORG);
    assertEquals(w.tables.enrollments.length, 0);
    assertEquals(w.tables.audit_log.filter((x: Row) => x.action === 'cohort.place-failed').length, 0);
  } finally { w.restore(); }
});

Deno.test('تعذّر الإلحاق لا يمنع الربط: سطر في السجل وحده', async () => {
  const w = world({}, { rpc: (n: string, a: any, t: any) => (n === 'place_participant' ? { data: null, error: { code: '57014', message: 'timeout' } } : placeRpc(n, a, t)) });
  try {
    const c: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    await redeem(w, 6, c.code.code);
    assertEquals(pOf(w, 6).organization_id, ORG);
    assertEquals(w.tables.audit_log.filter((x: Row) => x.action === 'cohort.place-failed').length, 1);
  } finally { w.restore(); }
});

Deno.test('أداة إلحاق من لا دفعة له: المعاينة لا تكتب، والتطبيق ببصمة قديمة يُرد، وبالبصمة نفسها يُلحق كلًا بالمصدر manual', async () => {
  const w = world({ participants: [person(1, ORG), person(2), person(3, ORG2), { ...person(4), is_demo: true }] });
  try {
    const plan: any = await CI.cohortlessPlanView(ADMIN, {});
    assertEquals(plan.count, 3);
    assertEquals(w.tables.enrollments.length, 0);
    await assertRejects(() => CI.cohortlessApply(ADMIN, { plan_hash: 'x' }), Error, 'أعد المعاينة');
    // تغيّر بعد المعاينة: صار لأحدهم دفعة، فالبصمة القديمة ترد
    await CI.placeParticipant(U(880102), 'platform');
    await assertRejects(() => CI.cohortlessApply(ADMIN, { plan_hash: plan.plan_hash }), Error, 'أعد المعاينة');
    const fresh: any = await CI.cohortlessPlanView(ADMIN, {});
    const r: any = await CI.cohortlessApply(ADMIN, { plan_hash: fresh.plan_hash });
    assertEquals([r.count, r.outcomes.placed], [2, 2]);
    assertEquals(w.tables.cohort_placements.filter((x: Row) => x.source === 'manual').map((x: Row) => x.actor), [ADMIN.email, ADMIN.email]);
    assertEquals(active(w, 4).length, 0);
    assert(w.tables.audit_log.some((x: Row) => x.action === 'cohort.cohortless-apply'));
  } finally { w.restore(); }
});
