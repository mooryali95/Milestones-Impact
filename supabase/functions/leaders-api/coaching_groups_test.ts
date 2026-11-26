// الجلسة الجماعية مع المستشار (تصور تشغيل الدفعة 2026-11-19، المرحلة 5): كيان واحد وصف لكل مشارك. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const V = await import('./activities.ts');
const CG = await import('./coaching-groups.ts');
const E = await import('./experts.ts');
const A = await import('./admin.ts');
const TM = await import('./team.ts');
const { expertLoadNow } = await import('./insight.ts');
const { CONFIG, Fail, MAIL_GALLERY } = await import('./core.ts');
const { expertStats, sessionUnits, tallyOnce, coachingStatus, bookingOverMax, groupMemberState } = await import('./logic.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(880001), COHORT = U(880002), OTHER = U(880003), REQ_C = U(880004), REQ_ADV = U(880005), REQ_T = U(880006);
const ADVISOR = U(880011), TEAM = U(880012), ELSEWHERE = U(880013);
const ADMIN = { email: 'a@example.sa' };
const XP = (id: string) => ({ id, email: `${id.slice(-4)}@x.sa` });
const NOW = Date.now();
const DAY = 864e5, HOUR = 36e5;
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const SERVICE = { lane: 'service', mode: 'on_demand' };

function world(opts: { before?: boolean } = {}) {
  CG.resetGroupsReady();
  const who = (n: number, org: string | null, extra: Row = {}) => ({ id: U(880100 + n), full_name: `مشارك ${n}`, email: `g${n}@example.sa`, phone: `+96655000000${n}`, organization_id: org, organization_name: 'جهة', status: 'enrolled',
    is_demo: false, is_test: false, profile_completed_at: '2026-10-01T08:00:00Z', ...extra });
  // 1 و2 يُدعيان، 3 استنفد رصيده (جلستان من جلستين)، 4 حساب اختبار، 5 منسحب، 6 في دفعة أخرى، 7 حساب العرض ملحق بالدفعة، 8 لم يُعتمد مساره
  const ps = [who(1, ORG), who(2, ORG), who(3, ORG), who(4, ORG, { is_test: true }), who(5, ORG, { status: 'withdrawn' }), who(6, null), who(7, null, { is_demo: true, email: 'demo@demo.milestone-impact.org' }), who(8, ORG, { status: 'pending_approval' })];
  const placed = (p: Row, approved = true) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: approved ? '2026-10-05T08:00:00Z' : null }));
  const expert = (id: string, name: string, extra: Row = {}) => ({ id, full_name: name, email: `${id.slice(-4)}@x.sa`, status: 'active', roles: ['coach', 'advisor'], hourly_rate: 400, weekly_hours: 10, created_at: '2026-09-01', ...extra });
  const past = (p: Row, n: number) => ({ id: U(880300 + n), participant_id: p.id, requirement_id: REQ_C, kind: 'manual', provider: 'manual', status: 'attended', starts_at: iso(-n * 7 * DAY), ends_at: iso(-n * 7 * DAY + HOUR), expert_id: ELSEWHERE, created_at: iso(-n * 7 * DAY) });
  const tables: Record<string, Row[]> = {
    programs: [{ id: 'prog', is_default: true, archived_at: null, name: 'البرنامج' }],
    participants: ps,
    cohorts: [
      { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {}, advisor_expert_id: ADVISOR },
      { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02', delivery: {}, advisor_expert_id: ELSEWHERE },
    ],
    enrollments: [
      // أعضاء الجهة ملحقون بدفعتها صراحة (تصور المرحلة 4: لا استنتاج بالجهة)
      ...ps.filter((p) => p.organization_id === ORG).map((p) => ({ participant_id: p.id, cohort_id: COHORT, status: 'active', created_at: '2026-10-05T08:00:00Z' })),
      { participant_id: ps[5].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[6].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    placements: ps.flatMap((p, i) => placed(p, i !== 7)),
    experts: [expert(ADVISOR, 'د. منى القحطاني'), expert(TEAM, 'أ. خالد العتيبي'), expert(ELSEWHERE, 'خبير دفعة أخرى')],
    cohort_experts: [{ cohort_id: COHORT, expert_id: TEAM }],
    journey_stages: [
      { program_id: 'prog', key: 'training', title_ar: 'التدريب', sort: 1, active: true, duration_days: 7, phase: 'qualification', rules: {} },
      { program_id: 'prog', key: 'consulting', title_ar: 'الاستشارة', sort: 2, active: true, duration_days: 14, phase: 'qualification', rules: SERVICE },
    ],
    stage_requirements: [
      { id: REQ_T, program_id: 'prog', stage_key: 'training', code: 'T-X', kind: 'check', dimension: null, level: null, sort: 1, required: true, title_ar: 'بند التدريب', config: {}, active: true },
      { id: REQ_C, program_id: 'prog', stage_key: 'consulting', code: 'C-MEET', kind: 'coaching', dimension: null, level: null, sort: 1, required: false, title_ar: 'جلسات الاستشارة', config: { sessions_required: 1, minutes: 90, max_sessions: 2 }, active: true },
      { id: REQ_ADV, program_id: 'prog', stage_key: 'consulting', code: 'C-ADV', kind: 'coaching', dimension: 'leadership', level: 'advanced', sort: 2, required: false, title_ar: 'استشارة المحترفين', config: { sessions_required: 1, minutes: 60, max_sessions: 1 }, active: true },
    ],
    coaching_sessions: [past(ps[2], 1), past(ps[2], 2)],
    coaching_groups: [], workshop_sessions: [], workshop_attendance: [],
    audit_log: [], mail_events: [], mail_queue: [], participant_observations: [], expert_requests: [], expert_ratings: [],
  };
  // down: جدول وعملية يتعذّران عند الطلب (مثل 'audit_log:insert')، لاختبار التراجع والقراءة المتعذرة
  const down = new Set<string>();
  const missing = (table: string, op: { kind: string; cols?: string; value?: any }) => {
    if (down.has(`${table}:${op.kind}`)) return { message: 'down' };
    if (!opts.before) return null;
    if (table === 'coaching_groups') return { code: 'PGRST205', message: 'relation does not exist' };
    if (table === 'coaching_sessions' && op.kind === 'select' && /group_id|off_allowance/.test(op.cols || '')) return { code: '42703', message: 'column does not exist' };
    if (table === 'coaching_sessions' && op.kind !== 'select' && /group_id|off_allowance/.test(JSON.stringify(op.value || ''))) return { code: 'PGRST204', message: 'column not found' };
    return null;
  };
  const f = installFake(tables, {
    fail: missing,
    embed: (table, row, t) => (table === 'coaching_sessions' ? { participants: t.participants.find((p) => p.id === row.participant_id) || null, experts: t.experts.find((e) => e.id === row.expert_id) || null } : null),
  });
  return { ps, tables, f, down };
}
type W = ReturnType<typeof world>;
const code = async (fn: () => Promise<unknown>) => { const e = await assertRejects(fn, Fail) as any; return [e.code, e.status]; };
async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, cap = 100) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: cap, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}
const to = (calls: { url: string; body: any }[]) => resendCalls(calls).map((c) => [c.body.to].flat()[0]).sort();
const ics = (c: { body: any }) => atob(c.body.attachments[0].content);
const input = (w: W, extra: Row = {}) => ({ cohort_id: COHORT, requirement_id: REQ_C, expert_id: TEAM, starts_at: iso(3 * DAY), minutes: 90, mode: 'online', join_url: 'https://meet.example.sa/group',
  participant_ids: [w.ps[0].id, w.ps[1].id], ...extra });
const rowsOf = (w: W, gid: string) => w.tables.coaching_sessions.filter((s) => s.group_id === gid);
const rowOf = (w: W, gid: string, n: number) => rowsOf(w, gid).find((s) => s.participant_id === w.ps[n].id)!;
const mine = async (w: W, n: number) => (await V.evidenceFor(w.ps[n], w.tables.stage_requirements, { milestone: 'intermediate', impact: 'intermediate', leadership: 'intermediate' }, true, COHORT) as any)[REQ_C];


Deno.test('المعاينة: من يُدعى، ومن استنفد رصيده، ومن لم تُفتح له الخدمة، ومن لا يُضاف بسببه، وخبراء الدفعة وحدهم بحِملهم', async () => {
  const w = world();
  try {
    const p: any = await CG.preview({ cohort_id: COHORT, requirement_id: REQ_C, participant_ids: w.ps.map((x) => x.id), expert_id: TEAM, starts_at: iso(3 * DAY), minutes: 90 });
    assertEquals(p.ready, true);
    assertEquals(p.members.map((m: Row) => [m.name, m.category, m.code]), [
      ['مشارك 1', 'ok', 'ok'], ['مشارك 2', 'ok', 'ok'], ['مشارك 3', 'at_max', 'at_max'], ['مشارك 4', 'ok', 'ok'],
      ['مشارك 5', 'ineligible', 'out'], ['مشارك 6', 'ineligible', 'not_member'], ['مشارك 7', 'ineligible', 'demo'], ['مشارك 8', 'locked', 'locked'],
    ]);
    assertEquals([p.members[2].used, p.members[2].max, p.members[2].reason, p.members[3].test], [2, 2, 'استنفد رصيده (2 من 2)', true]);
    assert(p.members.filter((m: Row) => m.category === 'ineligible').every((m: Row) => m.reason.length > 5));
    // خبراء الدفعة بالربط القائم وحدهم (مستشارها وفريقها)، لا خبير دفعة أخرى
    assertEquals(p.experts.map((e: Row) => e.id).sort(), [ADVISOR, TEAM].sort());
    assertEquals(p.requirements.map((r: Row) => [r.id, r.max, r.minutes]), [[REQ_C, 2, 90], [REQ_ADV, 1, 60]]);
    // نشاط لا يخص مسارهم (للمحترفين): لا خدمة لهم فيه
    const adv: any = await CG.preview({ cohort_id: COHORT, requirement_id: REQ_ADV, participant_ids: [w.ps[0].id] });
    assertEquals(adv.members.map((m: Row) => [m.category, m.code]), [['ineligible', 'no_service']]);
    // «لا تُحسب من الرصيد»: من استنفد رصيده يُدعى كغيره
    const off: any = await CG.preview({ cohort_id: COHORT, requirement_id: REQ_C, participant_ids: [w.ps[2].id], counts: false });
    assertEquals(off.members[0].category, 'ok');
    // المعاينة لا تكتب شيئًا
    assertEquals([w.tables.coaching_groups.length, w.tables.coaching_sessions.length, w.tables.audit_log.length], [0, 2, 0]);
    assertEquals((await code(() => CG.preview({ cohort_id: U(1), participant_ids: [] })))[1], 404);
  } finally { w.f.restore(); }
});

Deno.test('الإنشاء: صف لكل مدعو، وجلسة من رصيده، ومن استنفد رصيده يُتخطى أو يُضاف استثناءً مسجلًا، وغير الأهل لا يُضاف ولو أُرسل استثناءً', async () => {
  const w = world();
  try {
    const all = w.ps.map((x) => x.id);
    const r: any = await CG.save(ADMIN, input(w, { participant_ids: all, exceptions: [w.ps[2].id, w.ps[4].id, w.ps[5].id, w.ps[6].id] }));
    assertEquals([r.success, r.added, r.exceptions], [true, 4, 1]);
    assertEquals(r.skipped.map((x: Row) => x.code).sort(), ['demo', 'locked', 'not_member', 'out']);
    const g = w.tables.coaching_groups[0];
    assertEquals([g.cohort_id, g.requirement_id, g.expert_id, g.status, g.counts_allowance, g.title_ar, g.created_by], [COHORT, REQ_C, TEAM, 'scheduled', true, 'جلسة جماعية: جلسات الاستشارة', ADMIN.email]);
    const rows = rowsOf(w, g.id);
    assertEquals(rows.map((x) => x.participant_id).sort(), [w.ps[0].id, w.ps[1].id, w.ps[2].id, w.ps[3].id].sort());
    // يدوي بلا معرّف حجز خارجي، محجوز، بموعد الجلسة ورابطها ومستشارها، ويُحسب من الرصيد
    assert(rows.every((x) => x.kind === 'manual' && x.provider === 'manual' && x.external_id == null && x.status === 'booked' && x.expert_id === TEAM && x.join_url === 'https://meet.example.sa/group' && x.starts_at === g.starts_at && !x.off_allowance));
    const a1 = await mine(w, 0);
    assertEquals([a1.used, a1.max, a1.at_max, a1.can_book], [1, 2, false, true]);
    // الاستثناء يُسجَّل بما كان عليه رصيده، ويُحسب كما وقع (3 من 2) كالحجز الزائد من منصة الحجز
    const ex = w.tables.audit_log.filter((x) => x.action === 'coaching.group-exception');
    assertEquals(ex.map((x) => [x.entity_id, x.after.exception, x.after.used, x.after.max, x.after.group_id]), [[w.ps[2].id, 'at_max', 2, 2, g.id]]);
    assertEquals((await mine(w, 2)).used, 3);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-add').length, 3);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-create').map((x) => [x.entity, x.entity_id, x.after.members, x.after.exceptions]), [['coaching_groups', g.id, 4, 1]]);
    // بلا استثناء: من استنفد رصيده يُتخطى بسببه
    const r2: any = await CG.save(ADMIN, input(w, { starts_at: iso(5 * DAY), participant_ids: [w.ps[0].id, w.ps[2].id] }));
    assertEquals([r2.added, r2.skipped.map((x: Row) => x.code)], [1, ['at_max']]);
    // لا أحد يُدعى: لا جلسة فارغة
    assertEquals(await code(() => CG.save(ADMIN, input(w, { starts_at: iso(6 * DAY), participant_ids: [w.ps[4].id, w.ps[6].id] }))), ['no_members', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { starts_at: iso(6 * DAY), participant_ids: [] }))), ['empty', 400]);
    assertEquals(w.tables.coaching_groups.length, 2);
  } finally { w.f.restore(); }
});

Deno.test('خانة «لا تُحسب من الرصيد»: الصف خارج الرصيد، فلا يتغير ما استُهلك ولا يُمنع الحجز، والحضور يُحسب لاكتمال النشاط', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { counts: false, participant_ids: [w.ps[0].id, w.ps[2].id] }));
    assertEquals([r.added, r.exceptions, w.tables.coaching_groups[0].counts_allowance], [2, 0, false]);
    assert(rowsOf(w, r.id).every((x) => x.off_allowance === true));
    const a1 = await mine(w, 0), a3 = await mine(w, 2);
    assertEquals([a1.used, a1.at_max, a1.can_book, a1.off], [0, false, true, 1]);
    assertEquals([a3.used, a3.at_max], [2, true]);
    // حد الحجز من منصة المواعيد لا يعدّ ما هو خارج الرصيد
    assertEquals(bookingOverMax({ max_sessions: 2 }, w.tables.coaching_sessions.filter((x) => x.participant_id === w.ps[2].id)), { over: false, count: 2, max: 2 });
    // حضرها: تُحسب لاكتمال النشاط (count) ولا تأخذ من الرصيد (used)
    rowOf(w, r.id, 0).status = 'attended';
    const done = await mine(w, 0);
    assertEquals([done.count, done.done, done.used], [1, true, 0]);
    // المنطق الخالص: بلا حد، الخارج عن الرصيد لا يمنع حجز المطلوب
    const st: any = coachingStatus({ sessions_required: 1 }, [{ id: 'x', status: 'booked', group_id: 'g', off_allowance: true, starts_at: iso(DAY), ends_at: iso(DAY + HOUR) }]);
    assertEquals([st.can_book, st.off, st.sessions[0].group, st.sessions[0].off], [true, 1, true, true]);
  } finally { w.f.restore(); }
});

Deno.test('المستشار من خبراء الدفعة بالربط القائم، وتعارض موعده تنبيه يُؤكَّد، والجلسة نفسها لا تُنشأ مرتين', async () => {
  const w = world();
  try {
    assertEquals(await code(() => CG.save(ADMIN, input(w, { expert_id: ELSEWHERE }))), ['expert_not_in_cohort', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { expert_id: U(5) }))), ['expert_not_in_cohort', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { requirement_id: REQ_T }))), ['requirement', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { starts_at: 'x' }))), ['starts_at', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { mode: 'in_person' }))), ['location', 400]);
    assertEquals(await code(() => CG.save(ADMIN, input(w, { join_url: 'javascript:alert(1)' }))), ['join_url', 400]);
    assertEquals(w.tables.coaching_groups.length, 0);
    // جلسة فردية للمستشار نفسه تتقاطع مع الموعد: تنبيه بتفاصيله، ثم حفظ بتأكيد صريح
    w.tables.coaching_sessions.push({ id: U(880401), participant_id: w.ps[3].id, requirement_id: REQ_C, kind: 'booked', status: 'booked', expert_id: TEAM, starts_at: iso(3 * DAY + 30 * 6e4), ends_at: iso(3 * DAY + 90 * 6e4) });
    const pv: any = await CG.preview({ ...input(w), participant_ids: [w.ps[0].id] });
    assertEquals(pv.conflicts.map((c: Row) => c.kind), ['session']);
    const e = await assertRejects(() => CG.save(ADMIN, input(w)), Fail) as any;
    assertEquals([e.code, e.status, e.extra?.conflicts?.length ?? e.data?.conflicts?.length ?? 1], ['expert_conflict', 409, 1]);
    assertEquals(w.tables.coaching_groups.length, 0);
    const r: any = await CG.save(ADMIN, input(w, { confirm_conflict: true }));
    assertEquals([r.success, w.tables.audit_log.find((x) => x.action === 'coaching.group-create')!.after.conflict_confirmed], [true, true]);
    // ورشة سُمّي مدربها في الموعد تنبّه كذلك
    w.tables.workshop_sessions.push({ id: U(880402), title_ar: 'ورشة', expert_id: ADVISOR, active: true, starts_at: iso(4 * DAY), ends_at: iso(4 * DAY + 2 * HOUR) });
    assertEquals(await code(() => CG.save(ADMIN, input(w, { expert_id: ADVISOR, starts_at: iso(4 * DAY + HOUR) }))), ['expert_conflict', 409]);
    // إعادة المحاولة بالجسم نفسه: مرفوضة بمعرّف الجلسة القائمة، بلا جلسة ثانية ولا صفوف ولا بريد
    const n = w.tables.coaching_sessions.length;
    await withMail(async (calls) => {
      assertEquals(await code(() => CG.save(ADMIN, input(w, { confirm_conflict: true }))), ['duplicate', 409]);
      assertEquals([w.tables.coaching_groups.length, w.tables.coaching_sessions.length, resendCalls(calls).length], [1, n, 0]);
    });
  } finally { w.f.restore(); }
});

Deno.test('ساعات المستشار وتكلفته وحِمله: الجلسة الجماعية مرة واحدة أيًا كان عدد المدعوين، في كل جمع', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id], minutes: 90 }));
    // القادمة: حِمل الخبير جلسة واحدة لا ثلاث، في الترشيح (candidates عبر المعاينة)، والرؤية الشاملة، وفريق الدفعة
    const pv: any = await CG.preview({ cohort_id: COHORT, requirement_id: REQ_C, participant_ids: [] });
    assertEquals(pv.experts.find((e: Row) => e.id === TEAM).upcoming, 1);
    const load: any = await expertLoadNow();
    const row = (load.rows || load.experts || load).find((e: Row) => e.id === TEAM);
    assertEquals(row.upcoming ?? row.load?.upcoming, 1);
    const team: any = await TM.cohortTeam({ cohort_id: COHORT });
    assert(JSON.stringify(team).includes(TEAM));
    // منعقدة: حضر اثنان وغاب واحد. ساعة ونصف مرة واحدة، وتكلفتها مرة، والمشاركون من حضر، والغياب بعدد من غاب
    for (const [n, st] of [[0, 'attended'], [1, 'attended'], [3, 'no_show']] as [number, string][]) Object.assign(rowOf(w, r.id, n), { status: st, starts_at: iso(-DAY), ends_at: iso(-DAY + 90 * 6e4) });
    const list: any = await E.adminList();
    assertEquals(list.experts.find((e: Row) => e.id === TEAM).stats, { sessions: 1, attended: 1, no_show: 1, upcoming: 0, participants: 2, hours: 1.5, cost: 600 });
    const file: any = await E.adminGet({} as any, { id: TEAM });
    assertEquals([file.service.hours, file.service.cost, file.service.sessions, file.service.recent.length, file.service.recent[0].group, file.service.recent[0].count], [1.5, 600, 1, 1, true, 3]);
    // المنطق الخالص: ثمانية صفوف لجلسة واحدة ساعة واحدة، ومعها جلسة فردية ساعة أخرى
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, group_id: 'g1', expert_id: 'e', participant_id: `p${i}`, status: 'attended', starts_at: '2026-11-01T08:00:00Z', ends_at: '2026-11-01T09:00:00Z' }));
    const solo = { id: 's1', expert_id: 'e', participant_id: 'p0', status: 'attended', starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-02T09:00:00Z' };
    assertEquals(expertStats([...eight, solo], 500 as any), { sessions: 2, attended: 2, no_show: 0, upcoming: 0, participants: 8, hours: 2, cost: 1000 });
    assertEquals([sessionUnits([...eight, solo]).length, tallyOnce([...eight, solo])], [2, { e: 2 }]);
    // بلا عمود الربط (قبل الترحيل) كل صف وحدته كما كان
    assertEquals(expertStats(eight.map(({ group_id: _g, ...x }) => x), 500 as any).hours, 8);
    // جماعية غاب عنها الجميع: لا ساعات، كالفردية التي لم تنعقد
    assertEquals(expertStats(eight.map((x) => ({ ...x, status: 'no_show' })), 500 as any), { sessions: 1, attended: 0, no_show: 8, upcoming: 0, participants: 0, hours: 0, cost: 0 });
  } finally { w.f.restore(); }
});

Deno.test('ورقة الحضور من المدير: حضر ولم يحضر واعتذر في حفظ واحد، بسجل لكل مدعو، والرصيد بحسبها، والتراجع متاح', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { starts_at: iso(-2 * HOUR), participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    assertEquals(r.past, true);
    const ids = [w.ps[0].id, w.ps[1].id, w.ps[3].id];
    const m: any = await CG.adminMark(ADMIN, { id: r.id, note: 'انعقدت في القاعة', marks: [{ id: ids[0], state: 'attended' }, { id: ids[1], state: 'no_show' }, { id: ids[2], state: 'excused' }, { id: w.ps[4].id, state: 'attended' }] });
    assertEquals([m.success, m.marked, m.already, m.pending, m.refused.map((x: Row) => [x.id, x.code])], [true, 3, 0, 0, [[w.ps[4].id, 'not_member']]]);
    assertEquals(ids.map((id, i) => { const x = rowOf(w, r.id, [0, 1, 3][i]); return [x.status, groupMemberState(x), x.confirmed_by, !!x.confirmed_at, x.note]; }), [
      ['attended', 'attended', ADMIN.email, true, null], ['no_show', 'no_show', ADMIN.email, true, null], ['cancelled', 'excused', ADMIN.email, true, null]]);
    // ملاحظة الورقة في السجل وحده، لا في صف أي مدعو (فلا تدخل نسخة بيانات غيره)
    // الرصيد: حضر تأخذ جلسة، ولم يحضر واعتذر لا تأخذان (القاعدة القائمة: حضر + محجوز)
    assertEquals([(await mine(w, 0)).used, (await mine(w, 1)).used, (await mine(w, 3)).used], [1, 0, 0]);
    // الغياب ملاحظة في ملف المشارك مرة واحدة، كالجلسة الفردية
    assertEquals(w.tables.participant_observations.map((o) => [o.participant_id, o.code, o.ref]), [[ids[1], 'coaching_no_show', rowOf(w, r.id, 1).id]]);
    const logs = w.tables.audit_log.filter((x) => x.action === 'coaching.group-mark');
    assertEquals(logs.map((x) => [x.actor_type, x.actor, x.entity_id, x.before.state, x.after.state, x.after.note]), ids.map((id, i) => ['admin', ADMIN.email, id, 'booked', ['attended', 'no_show', 'excused'][i], 'انعقدت في القاعة']));
    // إعادة الحفظ نفسه: كما هو، بلا سجل ولا ملاحظة ثانية
    const again: any = await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: ids[0], state: 'attended' }, { id: ids[1], state: 'no_show' }] });
    assertEquals([again.marked, again.already, w.tables.audit_log.filter((x) => x.action === 'coaching.group-mark').length, w.tables.participant_observations.length], [0, 2, 3, 1]);
    // التراجع إلى «لم يُؤكَّد» يمسح التأكيد
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: ids[0], state: 'booked' }] });
    assertEquals([rowOf(w, r.id, 0).status, rowOf(w, r.id, 0).confirmed_by, rowOf(w, r.id, 0).note], ['booked', null, null]);
    // صف الجلسة الجماعية لا يُؤكَّد من مسار الجلسة الفردية
    assertEquals(await code(() => V.coachingMark(ADMIN, { id: rowOf(w, r.id, 0).id, status: 'attended' })), ['group_session', 409]);
    // قبل الموعد بأكثر من ساعة: الاعتذار يُسجَّل، والحضور والغياب لا
    const f: any = await CG.save(ADMIN, input(w, { starts_at: iso(4 * DAY), participant_ids: [ids[0], ids[1]] }));
    const early: any = await CG.adminMark(ADMIN, { id: f.id, marks: [{ id: ids[0], state: 'attended' }, { id: ids[1], state: 'excused' }] });
    assertEquals([early.marked, early.refused.map((x: Row) => x.code)], [1, ['too_early']]);
    assertEquals(await code(() => CG.adminMark(ADMIN, { id: f.id, marks: [] })), ['empty', 400]);
    assertEquals((await code(() => CG.adminMark(ADMIN, { id: U(7), marks: [{ id: ids[0], state: 'attended' }] })))[1], 404);
  } finally { w.f.restore(); }
});

Deno.test('المستشار صاحب الجلسة يسجل حضورها من بوابته بالأسماء وحدها، وغيره يُرفض، ولا يغيّر ما أكّده غيره', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { starts_at: iso(-3 * HOUR), participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    const me = XP(TEAM), other = XP(ADVISOR);
    // قائمته: صف واحد للجلسة بعدد مدعويها، بلا أسماء
    const list: any = await CG.expertList(me);
    assertEquals(list.map((g: Row) => [g.id, g.count, g.pending, g.sheet, g.cohort]), [[r.id, 3, 3, true, 'دفعة الجهة']]);
    assert(!JSON.stringify(list).includes('مشارك'));
    assertEquals(await CG.expertList(other), []);
    // ورقته: الاسم والحالة وحدهما. لا بريد ولا جوال ولا جهة
    const sh: any = await CG.expertSheet(me, { id: r.id });
    assertEquals(sh.people.map((p: Row) => Object.keys(p).sort()), [['full_name', 'id', 'state'], ['full_name', 'id', 'state'], ['full_name', 'id', 'state']]);
    assert(!/@|\+966|جهة/.test(JSON.stringify(sh)));
    // خبير آخر، ولو من فريق الدفعة نفسها: لا ورقة ولا تسجيل، وبالرد نفسه لجلسة غير موجودة
    assertEquals(await code(() => CG.expertSheet(other, { id: r.id })), ['not_yours', 403]);
    assertEquals(await code(() => CG.expertMark(other, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }] })), ['not_yours', 403]);
    assertEquals(await code(() => CG.expertSheet(other, { id: U(9) })), ['not_yours', 403]);
    assertEquals(rowsOf(w, r.id).filter((x) => x.status !== 'booked').length, 0);
    // المدير أكّد واحدًا: المستشار يسجل الباقين ولا يغيّر ما أكّده المدير
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[3].id, state: 'no_show' }] });
    const m: any = await CG.expertMark(me, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }, { id: w.ps[1].id, state: 'no_show' }, { id: w.ps[3].id, state: 'attended' }] });
    assertEquals([m.marked, m.pending, m.refused.map((x: Row) => [x.id, x.code])], [2, 0, [[w.ps[3].id, 'not_yours']]]);
    assertEquals([rowOf(w, r.id, 0).confirmed_by, rowOf(w, r.id, 3).status], [me.email, 'no_show']);
    const log = w.tables.audit_log.filter((x) => x.action === 'coaching.group-mark' && x.actor === me.email);
    assertEquals(log.map((x) => [x.actor_type, x.after.by]), [['system', 'expert'], ['system', 'expert']]);
    assertEquals((await CG.expertSheet(me, { id: r.id }) as any).people.find((p: Row) => p.id === w.ps[3].id).locked, true);
    // يتراجع عما سجّله هو
    assertEquals((await CG.expertMark(me, { id: r.id, marks: [{ id: w.ps[0].id, state: 'booked' }] }) as any).marked, 1);
    // نافذته: من قبل الموعد بساعة إلى أسبوع بعده
    const g = w.tables.coaching_groups[0];
    Object.assign(g, { starts_at: iso(-9 * DAY), ends_at: iso(-9 * DAY + HOUR) });
    assertEquals(await code(() => CG.expertMark(me, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }] })), ['sheet_closed', 403]);
    assertEquals((await CG.expertSheet(me, { id: r.id }) as any).sheet, false);
    // لوحته: الجماعية صف واحد في groups، ولا صفوف لها بين جلساته الفردية، وإحصاؤه بالكيان
    w.tables.consent_events = [{ id: 'c', subject: 'expert', subject_id: TEAM, kind: 'accept', version: '2099-01-01' }];
    const d: any = await E.portalDashboard({ ...w.tables.experts[1] });
    assertEquals([d.groups.length, d.sessions.length, d.stats.attended, d.stats.no_show], [1, 0, 0, 2]);
  } finally { w.f.restore(); }
});

Deno.test('«ينتظرني»: جلسة جماعية بلا تأكيد بعد يومين بند واحد، لا بند لكل مدعو، ويختفي حين تُؤكَّد', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { starts_at: iso(-DAY), participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    // بعد يوم واحد: ليست في الصندوق بعد، وصفوفها ليست بنودًا فردية «جلسة تنتظر التأكيد»
    const b1: any = await A.inbox();
    assertEquals([b1.counts.coaching_group_confirm, b1.counts.coaching_confirm, b1.skipped], [0, 0, []]);
    // بعد يومين: بند واحد للجلسة
    const g = w.tables.coaching_groups[0];
    Object.assign(g, { starts_at: iso(-2 * DAY - 2 * HOUR), ends_at: iso(-2 * DAY - HOUR) });
    for (const x of rowsOf(w, r.id)) Object.assign(x, { starts_at: g.starts_at, ends_at: g.ends_at });
    const b2: any = await A.inbox();
    assertEquals([b2.counts.coaching_group_confirm, b2.counts.coaching_confirm], [1, 0]);
    const item = b2.items.find((i: Row) => i.kind === 'coaching_group_confirm');
    assertEquals([item.id, item.title, item.sub, item.kind_ar, item.to.tab, item.to.query], [r.id, 'جلسة جماعية: جلسات الاستشارة', '3 مدعوين بلا تأكيد', 'جلسة جماعية تنتظر تأكيد الحضور', 'activities', 'sub=groups']);
    // تأكيد بعضهم يبقيه، وتأكيد الكل يخرجه
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }, { id: w.ps[1].id, state: 'no_show' }] });
    assertEquals(((await A.inbox()) as any).items.find((i: Row) => i.kind === 'coaching_group_confirm').sub, 'مدعو واحد بلا تأكيد');
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[3].id, state: 'excused' }] });
    assertEquals(((await A.inbox()) as any).counts.coaching_group_confirm, 0);
    // جلسة فردية منتهية بلا تأكيد تبقى بندًا فرديًا كما كانت
    w.tables.coaching_sessions.push({ id: U(880501), participant_id: w.ps[0].id, requirement_id: REQ_C, kind: 'booked', status: 'booked', expert_id: TEAM, starts_at: iso(-3 * HOUR), ends_at: iso(-2 * HOUR) });
    assertEquals(((await A.inbox()) as any).counts.coaching_confirm, 1);
  } finally { w.f.restore(); }
});

Deno.test('إزالة مدعو واحد: يعود رصيده ويُبلَّغ وحده مرة واحدة، وآخر مدعو لا يُزال', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w));
    assertEquals((await mine(w, 0)).used, 1);
    await withMail(async (calls) => {
      const x: any = await CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[0].id, reason: 'تعارض موعده' });
      assertEquals([x.removed, x.mail.sent, to(calls)], [true, 1, [w.ps[0].email]]);
      assertEquals(resendCalls(calls)[0].body.subject, 'تحديث: لست مدعوًّا إلى الجلسة الجماعية');
      // الإعادة: كما هو، بلا بريد ثانٍ ولا سجل ثانٍ
      assertEquals(await CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[0].id }), { success: true, already: true });
      assertEquals(resendCalls(calls).length, 1);
    });
    assertEquals([rowOf(w, r.id, 0).status, groupMemberState(rowOf(w, r.id, 0)), (await mine(w, 0)).used, (await mine(w, 1)).used], ['cancelled', 'removed', 0, 1]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-remove').map((x) => [x.entity_id, x.after.restored, x.after.reason]), [[w.ps[0].id, true, 'تعارض موعده']]);
    // لم يعد في قائمة الإدارة ولا في ورقة المستشار، ولا يظهر في رحلته
    const list: any = await CG.adminList({ cohort_id: COHORT });
    assertEquals([list.groups[0].count, list.groups[0].members.map((m: Row) => m.id)], [1, [w.ps[1].id]]);
    assertEquals((await mine(w, 0)).sessions.length, 0);
    assertEquals(await code(() => CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[1].id })), ['last_member', 409]);
  } finally { w.f.restore(); }
});

Deno.test('إلغاء الجلسة كلها: الصفوف ملغاة والرصيد يعود، وبريد واحد لكل مدعو وللمستشار، والإعادة بلا أثر', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    await withMail(async (calls) => {
      const c: any = await CG.cancel(ADMIN, { id: r.id, reason: 'سفر المستشار' });
      assertEquals([c.cancelled, c.mail.sent, c.expert_mail], [3, 2, 'sent']);
      // لا حساب الاختبار، والمستشار بريد واحد
      assertEquals(to(calls), [w.tables.experts[1].email, w.ps[0].email, w.ps[1].email].sort());
      assertEquals(await CG.cancel(ADMIN, { id: r.id }), { success: true, already: true });
      assertEquals(resendCalls(calls).length, 3);
    });
    assertEquals([w.tables.coaching_groups[0].status, w.tables.coaching_groups[0].cancelled_by, rowsOf(w, r.id).map((x) => x.status), (await mine(w, 0)).used], ['cancelled', ADMIN.email, ['cancelled', 'cancelled', 'cancelled'], 0]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-cancel').map((x) => x.after.reason), ['سفر المستشار']);
    // الملغاة: لا تعديل ولا حضور ولا إزالة، ولا تظهر للمستشار
    assertEquals(await code(() => CG.save(ADMIN, { id: r.id, title_ar: 'x' })), ['cancelled', 409]);
    assertEquals(await code(() => CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[0].id, state: 'excused' }] })), ['cancelled', 409]);
    assertEquals(await CG.expertList(XP(TEAM)), []);
    // جلسة سُجّل حضورها لا تُلغى ولا يُزال من حضرها
    const h: any = await CG.save(ADMIN, input(w, { starts_at: iso(-2 * HOUR) }));
    await CG.adminMark(ADMIN, { id: h.id, marks: [{ id: w.ps[0].id, state: 'attended' }] });
    assertEquals(await code(() => CG.cancel(ADMIN, { id: h.id })), ['marked', 409]);
    assertEquals(await code(() => CG.removeMember(ADMIN, { id: h.id, participant_id: w.ps[0].id })), ['marked', 409]);
  } finally { w.f.restore(); }
});

Deno.test('تغيير الموعد أو المكان أو المستشار: الصفوف تتبع والتذكير يُفتح من جديد، ويُبلَّغ المدعوون بملف تقويم محدَّث مرة واحدة', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w));
    for (const x of rowsOf(w, r.id)) x.reminded_at = iso(-HOUR);
    await withMail(async (calls) => {
      const u: any = await CG.save(ADMIN, { id: r.id, starts_at: iso(6 * DAY), minutes: 60 });
      assertEquals([u.changed.sort(), u.mail.sent, u.expert_mail], [['ends_at', 'starts_at'], 2, 'sent']);
      const g = w.tables.coaching_groups[0];
      assert(rowsOf(w, r.id).every((x) => x.starts_at === g.starts_at && x.ends_at === g.ends_at && x.reminded_at === null));
      const member = resendCalls(calls).filter((c) => c.body.subject === 'تحديث: جلستك الجماعية مع المستشار');
      assertEquals(member.length, 2);
      // دعوة التقويم بمعرّف صف المدعو (كتذكيره) وبرقم تسلسل يحدّث الموعد لا يضيف ثانيًا
      const cal = ics(member[0]);
      assert(cal.includes(`UID:${rowsOf(w, r.id).find((x) => x.participant_id === w.ps.find((p) => p.email === [member[0].body.to].flat()[0])!.id)!.id}@`) && /SEQUENCE:\d+/.test(cal));
      // الحفظ نفسه ثانية: لا تغيير، فلا بريد
      assertEquals(await CG.save(ADMIN, { id: r.id, starts_at: iso(6 * DAY), minutes: 60 }), { success: true, unchanged: true });
      // العنوان وحده: يُحفظ بلا بريد
      const t: any = await CG.save(ADMIN, { id: r.id, title_ar: 'جلسة التفاوض' });
      assertEquals([t.changed, t.mail.sent], [['title_ar'], 0]);
      assertEquals(resendCalls(calls).length, 3);
      // حضوري بمكانه: الرابط يُمسح من الصفوف
      await CG.save(ADMIN, { id: r.id, mode: 'in_person', location_ar: 'قاعة الاجتماعات' });
      assert(rowsOf(w, r.id).every((x) => x.join_url === null));
      const n = resendCalls(calls).length;
      // مستشار آخر من خبراء الدفعة: القديم يُبلَّغ بالإلغاء والجديد بالتكليف، والصفوف تنتقل إليه
      const e: any = await CG.save(ADMIN, { id: r.id, expert_id: ADVISOR });
      assertEquals([e.expert_mail, rowsOf(w, r.id).map((x) => x.expert_id)], ['sent', [ADVISOR, ADVISOR]]);
      const subjects = resendCalls(calls).slice(n).map((c) => c.body.subject).sort();
      assertEquals(subjects, ['أُلغيت: جلستك الجماعية', 'تحديث: جلستك الجماعية مع المستشار', 'تحديث: جلستك الجماعية مع المستشار', 'تكليف: جلسة جماعية مع مشاركيك'].sort());
      assertEquals(await code(() => CG.save(ADMIN, { id: r.id, expert_id: ELSEWHERE })), ['expert_not_in_cohort', 400]);
    });
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-update').length, 4);
    // بعد تسجيل الحضور: العنوان وحده
    Object.assign(w.tables.coaching_groups[0], { starts_at: iso(-2 * HOUR), ends_at: iso(-HOUR) });
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }] });
    assertEquals(await code(() => CG.save(ADMIN, { id: r.id, starts_at: iso(7 * DAY) })), ['marked', 409]);
    assertEquals((await CG.save(ADMIN, { id: r.id, title_ar: 'عنوان جديد' }) as any).changed, ['title_ar']);
  } finally { w.f.restore(); }
});

Deno.test('بريد الدعوة: للمدعوين الحقيقيين وحدهم بلا أسماء غيرهم ولا عددهم، وللمستشار بريد واحد بالعدد، وبحصة البريد وطابورها', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
      // حساب الاختبار مدعو ولا يصله بريد
      assertEquals([r.added, r.mail, r.expert_mail], [3, { sent: 2, queued: 0, failed: 0, skipped: 1 }, 'sent']);
      assertEquals(to(calls), [w.tables.experts[1].email, w.ps[0].email, w.ps[1].email].sort());
      const first = resendCalls(calls).find((c) => [c.body.to].flat()[0] === w.ps[0].email)!;
      assertEquals(first.body.subject, 'دعوة: جلسة جماعية مع المستشار');
      assert(first.body.html.includes('أ. خالد العتيبي') && first.body.html.includes('تُحسب جلسة واحدة من رصيد استشاراتك'));
      // لا اسم مدعو آخر ولا عدد
      assert(!first.body.html.includes('مشارك 2') && !first.body.html.includes('مشارك 4') && !first.body.html.includes('عدد المشاركين'));
      assert(ics(first).includes(`UID:${rowOf(w, r.id, 0).id}@`));
      const ex = resendCalls(calls).find((c) => [c.body.to].flat()[0] === w.tables.experts[1].email)!;
      assert(ex.body.html.includes('عدد المشاركين') && !ex.body.html.includes('مشارك 1') && ics(ex).includes(`UID:${r.id}@`));
    });
    // الحصة ممتلئة إلا رسالة: واحدة تخرج والباقي ينتظر في الطابور بدعوة تقويمه وبموعد الجلسة حدًّا له
    const w2 = world();
    try {
      w2.tables.mail_events = Array.from({ length: 39 }, () => ({ id: crypto.randomUUID(), kind: 'notify', status: 'sent', source: 'leaders-api', created_at: new Date(Date.now() - 6e4).toISOString() }));
      await withMail(async (calls) => {
        const r: any = await CG.save(ADMIN, input(w2));
        assertEquals([r.mail.sent, r.mail.queued, r.mail.failed, r.expert_mail, resendCalls(calls).length], [1, 1, 0, 'queued', 1]);
        const waiting = w2.tables.mail_queue.filter((m) => !m.sent_at);
        assertEquals([waiting.length, waiting.every((m) => m.attachments?.[0]?.filename === 'session.ics' && !!m.expires_at && m.kind === 'bulk')], [2, true]);
      }, 80);
    } finally { w2.f.restore(); }
    // جلسة مضى موعدها (تُسجَّل للحضور): لا دعوة ولا بريد للمستشار
    CG.resetGroupsReady();
    const w3 = world();
    try {
      await withMail(async (calls) => {
        const r: any = await CG.save(ADMIN, input(w3, { starts_at: iso(-DAY) }));
        assertEquals([r.past, r.mail.sent, r.expert_mail, resendCalls(calls).length], [true, 0, 'none', 0]);
      });
    } finally { w3.f.restore(); }
    for (const k of ['group-session-invite', 'group-session-change', 'group-session-cancel', 'group-session-removed', 'group-session-expert']) assert(MAIL_GALLERY.find((m) => m.key === k)!.html().length > 500, k);
  } finally { w.f.restore(); }
});

Deno.test('ما يراه المشارك: جلسته الجماعية بعنوانها ومستشارها ومكانها وعلامتها، بلا أسماء بقية المدعوين، والتذكير قبل يوم كالفردية', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { mode: 'in_person', location_ar: 'قاعة الاجتماعات', join_url: '', starts_at: iso(DAY), participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    const a = await mine(w, 0);
    const s = a.sessions[0];
    assertEquals([s.group, s.title, s.with, s.mode, s.location, s.status, s.id], [true, 'جلسة جماعية: جلسات الاستشارة', 'أ. خالد العتيبي', 'in_person', 'قاعة الاجتماعات', 'booked', rowOf(w, r.id, 0).id]);
    const seen = JSON.stringify(a);
    assert(!seen.includes('مشارك 2') && !seen.includes('مشارك 4') && !seen.includes(w.ps[1].id) && !seen.includes(TEAM) && !seen.includes(r.id));
    // التذكير القائم (sessionReminders) يخرج لكل مدعو بصفه، إلا حساب الاختبار
    await withMail(async (calls) => {
      assertEquals(await V.sessionReminders(), 2);
      assertEquals([to(calls), resendCalls(calls)[0].body.subject], [[w.ps[0].email, w.ps[1].email].sort(), 'جلستك غدًا']);
      assertEquals(await V.sessionReminders(), 0);
    });
    assert(rowsOf(w, r.id).every((x) => !!x.reminded_at));
  } finally { w.f.restore(); }
});

Deno.test('قبل الترحيل: الميزة «غير مفعّلة بعد»، والكتابة not_migrated، وكل ما سواها يعمل بلا العمودين', async () => {
  const w = world({ before: true });
  try {
    assertEquals(await CG.groupsReady(), false);
    const pv: any = await CG.preview({ cohort_id: COHORT, participant_ids: [w.ps[0].id] });
    assertEquals([pv.success, pv.ready, pv.message], [true, false, 'الجلسة الجماعية غير مفعّلة بعد']);
    assertEquals(await code(() => CG.save(ADMIN, input(w))), ['not_migrated', 503]);
    assertEquals(await code(() => CG.cancel(ADMIN, { id: U(1) })), ['not_migrated', 503]);
    assertEquals(await code(() => CG.adminMark(ADMIN, { id: U(1), marks: [] })), ['not_migrated', 503]);
    assertEquals(await code(() => CG.expertSheet(XP(TEAM), { id: U(1) })), ['not_migrated', 503]);
    assertEquals([await CG.expertList(XP(TEAM)), await CG.inboxRows(), await CG.adminList({})], [[], [], { success: true, ready: false, groups: [] }]);
    assertEquals([w.tables.coaching_groups.length, w.tables.coaching_sessions.length], [0, 2]);
    // «الحضور والجلسات» والصندوق وملف الخبير ورحلة المشارك والتذكير وتأكيد الجلسة الفردية كما كانت
    const o: any = await V.overview();
    assertEquals([o.success, o.groups_ready, o.coaching_groups, o.coaching.length], [true, false, [], 2]);
    const box: any = await A.inbox();
    assertEquals([box.skipped, box.counts.coaching_group_confirm], [[], 0]);
    const list: any = await E.adminList();
    assertEquals(list.experts.find((e: Row) => e.id === ELSEWHERE).stats.hours, 2);
    assertEquals((await expertLoadNow() as any) != null, true);
    assertEquals((await mine(w, 2)).used, 2);
    w.tables.coaching_sessions.push({ id: U(880601), participant_id: w.ps[0].id, requirement_id: REQ_C, kind: 'booked', status: 'booked', expert_id: TEAM, starts_at: iso(DAY), ends_at: iso(DAY + HOUR), reminded_at: null });
    await withMail(async (calls) => { assertEquals([await V.sessionReminders(), to(calls)], [1, [w.ps[0].email]]); });
    assertEquals(await V.coachingMark(ADMIN, { id: U(880601), status: 'attended' }), { success: true });
    assertEquals(await V.coachingAdd(ADMIN, { requirement_id: REQ_C, participant_id: w.ps[1].id, status: 'attended' }), { success: true });
    // بعد تطبيق الترحيل والعامل حي: يُعاد الفحص (هنا بإعادة ضبطه) فتعمل
    w.f.restore();
    const after = world();
    try { assertEquals([await CG.groupsReady(), ((await CG.save(ADMIN, input(after))) as any).success], [true, true]); } finally { after.f.restore(); }
  } finally { w.f.restore(); CG.resetGroupsReady(); }
});

Deno.test('webhook منصة الحجز لا يمس الجلسة الجماعية: حجز المدعو وإعادة جدولته وإلغاؤه تكتب صفوفها هي وحدها', async () => {
  const w = world();
  const saved = CONFIG.calcomSecret;
  Object.assign(CONFIG, { calcomSecret: 'cal-secret' });
  const sign = async (raw: string) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('cal-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const hook = async (trigger: string, uid: string, prev: string | null, day: number) => {
    const p = w.ps[0];
    const raw = JSON.stringify({ triggerEvent: trigger, payload: { uid, ...(prev ? { rescheduleUid: prev } : {}), metadata: { ref: `${p.id}.${REQ_C}` }, startTime: iso(day * DAY), endTime: iso(day * DAY + HOUR),
      videoCallData: { url: `https://meet.example.sa/${uid}` }, organizer: { email: 'coach@example.sa' }, attendees: [{ email: p.email }] } });
    return await V.bookingWebhook('calcom', raw, new Headers({ 'x-cal-signature-256': await sign(raw) })) as Row;
  };
  try {
    const r: any = await CG.save(ADMIN, input(w));
    const snap = () => JSON.stringify(rowsOf(w, r.id).map(({ updated_at: _u, ...x }) => x));
    const before = snap(), g0 = JSON.stringify(w.tables.coaching_groups);
    // حجز فردي للمدعو نفسه: صف جديد بلا ربط، والجماعية تُحسب معه في رصيده (2 من 2)
    assertEquals(await hook('BOOKING_CREATED', 'h1', null, 5), { success: true });
    const own = w.tables.coaching_sessions.filter((x) => x.external_id);
    assertEquals([own.length, own[0].group_id ?? null, (await mine(w, 0)).used, (await mine(w, 0)).at_max], [1, null, 2, true]);
    // ثالث فوق الحد يُسجَّل وينبَّه عليه كما كان، والجماعية داخلة في العدّ
    assertEquals((await hook('BOOKING_CREATED', 'h2', null, 6)).over_max, true);
    assertEquals(await hook('BOOKING_RESCHEDULED', 'h3', 'h1', 7), { success: true, over_max: true });
    assertEquals(await hook('BOOKING_CANCELLED', 'h2', null, 6), { success: true });
    assertEquals([snap(), JSON.stringify(w.tables.coaching_groups)], [before, g0]);
    assert(w.tables.coaching_sessions.filter((x) => x.external_id).every((x) => !x.group_id));
    // قيد القاعدة: صف الجلسة الجماعية بلا معرّف حجز خارجي أبدًا، وعضو واحد مرة واحدة
    const sql = await Deno.readTextFile(new URL('../../migrations/20261121100000_leaders_coaching_groups.sql', import.meta.url));
    assert(sql.includes('check (group_id is null or external_id is null)') && sql.includes('unique index if not exists coaching_sessions_group_member_uidx'));
    assert(rowsOf(w, r.id).every((x) => x.external_id == null));
  } finally { Object.assign(CONFIG, { calcomSecret: saved }); w.f.restore(); }
});

Deno.test('قائمة الإدارة: الجلسة بمدعويها وحالاتهم وما ينتظر التأكيد، و«الحضور والجلسات» تعرضها بكيانها لا بصفوفها', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w, { starts_at: iso(-3 * HOUR), participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[0].id, state: 'attended' }] });
    const o: any = await V.overview();
    assertEquals([o.groups_ready, o.coaching_groups.length, o.coaching.length, o.coaching.some((s: Row) => s.group_id)], [true, 1, 2, false]);
    const g = o.coaching_groups[0];
    assertEquals([g.id, g.cohort, g.expert, g.requirement, g.count, g.attended, g.pending, g.awaiting, g.counts, g.status], [r.id, 'دفعة الجهة', 'أ. خالد العتيبي', 'جلسات الاستشارة', 3, 1, 2, true, true, 'scheduled']);
    assertEquals(g.members.map((m: Row) => [m.full_name, m.state, !!m.test]), [['مشارك 1', 'attended', false], ['مشارك 2', 'booked', false], ['مشارك 4', 'booked', true]]);
    assertEquals(((await CG.adminList({ cohort_id: OTHER })) as any).groups, []);
  } finally { w.f.restore(); }
});

Deno.test('من اعتذر ثم أُعيد بعد تغيير الموعد يأخذ الموعد الجديد، وتعذّر السجل يتراجع عن الجلسة فلا تبقى بلا أثر ولا دعوة', async () => {
  const w = world();
  try {
    const r: any = await CG.save(ADMIN, input(w));
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[1].id, state: 'excused' }] });
    await CG.save(ADMIN, { id: r.id, starts_at: iso(8 * DAY), minutes: 60, expert_id: ADVISOR });
    const g = w.tables.coaching_groups[0];
    // صف المعتذر لم يتبع التغيير (ملغى)، ولا يأخذ من رصيده
    assertEquals([rowOf(w, r.id, 1).starts_at === g.starts_at, (await mine(w, 1)).used], [false, 0]);
    await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[1].id, state: 'booked' }] });
    const row = rowOf(w, r.id, 1);
    assertEquals([row.status, row.starts_at, row.ends_at, row.expert_id, (await mine(w, 1)).used], ['booked', g.starts_at, g.ends_at, ADVISOR, 1]);
  } finally { w.f.restore(); }
  // السجل متعذّر: لا جلسة ولا صفوف ولا بريد، والإعادة بعد زواله تنشئها
  CG.resetGroupsReady();
  let down = true;
  const w2 = world();
  const base = (await import('./core.ts')).db as any;
  const from0 = base.from;
  base.from = (t: string) => { const q = from0(t); if (t === 'audit_log' && down) { const ins = q.insert; q.insert = (v: unknown) => { ins(v); return { then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'down' } }).then(ok) }; }; } return q; };
  try {
    await withMail(async (calls) => {
      assertEquals(await code(() => CG.save(ADMIN, input(w2))), ['audit_failed', 500]);
      assertEquals([w2.tables.coaching_groups.length, w2.tables.coaching_sessions.filter((x) => x.group_id).length, resendCalls(calls).length], [0, 0, 0]);
      down = false;
      const ok: any = await CG.save(ADMIN, input(w2));
      assertEquals([ok.added, w2.tables.coaching_groups.length, to(calls).length], [2, 1, 3]);
    });
  } finally { base.from = from0; w2.f.restore(); }
});

// ── المتابعات (2026-11-22): إضافة مدعوين إلى جلسة قائمة، وإعادة إرسال الدعوة، وملف إلغاء التقويم ──
const subjectsTo = (calls: { url: string; body: any }[], email: string) => resendCalls(calls).filter((c) => [c.body.to].flat()[0] === email).map((c) => c.body.subject);
const seqOf = (text: string) => Number(/SEQUENCE:(\d+)/.exec(text)?.[1] ?? -1);
const uidOf = (text: string) => /UID:([^\r\n]+)/.exec(text)?.[1];
// ساعة سجل البريد: الأحداث المسجلة تُرجَع إلى الوراء ليمضي وقت المهلة بلا انتظار
const ageMail = (w: W, minutes: number) => { for (const e of w.tables.mail_events) e.created_at = new Date(Date.parse(e.created_at) - minutes * 6e4).toISOString(); };

Deno.test('إضافة مدعوين إلى جلسة قائمة: المعاينة نفسها، والدعوة للجدد وحدهم، ولا عضو مرتين، والإعادة بلا أثر', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id] }));
      const n0 = resendCalls(calls).length;
      // المرشحون: أعضاء الدفعة ممن في البرنامج وليسوا مدعوين. لا المنسحب ولا عضو دفعة أخرى ولا الحساب التجريبي
      const p0: any = await CG.addPreview({ id: r.id });
      assertEquals([p0.blocked, p0.candidates.map((c: Row) => c.name), p0.members, p0.room], [null, ['مشارك 2', 'مشارك 3', 'مشارك 4', 'مشارك 8'], [], 49]);
      // المعاينة بحكم الإنشاء نفسه، والمدعو أصلًا لا يُضاف بسببه
      const p: any = await CG.addPreview({ id: r.id, participant_ids: w.ps.map((x) => x.id) });
      assertEquals(p.members.map((m: Row) => [m.name, m.category, m.code]), [
        ['مشارك 1', 'ineligible', 'already'], ['مشارك 2', 'ok', 'ok'], ['مشارك 3', 'at_max', 'at_max'], ['مشارك 4', 'ok', 'ok'],
        ['مشارك 5', 'ineligible', 'out'], ['مشارك 6', 'ineligible', 'not_member'], ['مشارك 7', 'ineligible', 'demo'], ['مشارك 8', 'locked', 'locked'],
      ]);
      // المعاينة لا تكتب ولا ترسل
      assertEquals([rowsOf(w, r.id).length, resendCalls(calls).length], [1, n0]);
      const logs0 = w.tables.audit_log.length;
      const a: any = await CG.addMembers(ADMIN, { id: r.id, participant_ids: w.ps.map((x) => x.id), exceptions: [w.ps[2].id, w.ps[6].id] });
      assertEquals([a.added, a.exceptions, a.readded, a.mail], [3, 1, 0, { sent: 2, queued: 0, failed: 0, skipped: 1 }]);
      assertEquals(a.skipped.map((x: Row) => x.code).sort(), ['already', 'demo', 'locked', 'not_member', 'out']);
      // الصف الجديد كصف الإنشاء: يدوي محجوز بموعد الجلسة ورابطها ومستشارها، ويُحسب من الرصيد
      const g = w.tables.coaching_groups[0];
      assertEquals(rowsOf(w, r.id).map((x) => x.participant_id).sort(), [w.ps[0].id, w.ps[1].id, w.ps[2].id, w.ps[3].id].sort());
      assert(rowsOf(w, r.id).every((x) => x.kind === 'manual' && x.external_id == null && x.status === 'booked' && x.expert_id === TEAM && x.starts_at === g.starts_at && x.join_url === g.join_url && !x.off_allowance));
      // الرصيد كما عرّفه الإنشاء: جلسة من رصيد كل مدعو، والاستثناء يُحسب كما وقع
      assertEquals([(await mine(w, 1)).used, (await mine(w, 2)).used], [1, 3]);
      // الدعوة للجدد الحقيقيين وحدهم بملف تقويمهم. لا بريد للمدعو القائم، ولا للمستشار، ولا لحساب الاختبار
      const after = resendCalls(calls).slice(n0);
      assertEquals(after.map((c) => [[c.body.to].flat()[0], c.body.subject]).sort(), [[w.ps[1].email, 'دعوة: جلسة جماعية مع المستشار'], [w.ps[2].email, 'دعوة: جلسة جماعية مع المستشار']].sort());
      assert(after.every((c) => ics(c).includes('METHOD:PUBLISH') && !c.body.html.includes('مشارك 1') && !c.body.html.includes('عدد المشاركين')));
      assertEquals(uidOf(ics(after.find((c) => [c.body.to].flat()[0] === w.ps[1].email)!)), `${rowOf(w, r.id, 1).id}@sunkvalue.com`);
      // السجل: بند للجلسة وبند لكل مضاف، والاستثناء برصيده كما كان
      const mineLogs = w.tables.audit_log.slice(logs0);
      assertEquals(mineLogs.map((x) => x.action).sort(), ['coaching.group-add', 'coaching.group-add', 'coaching.group-add-members', 'coaching.group-exception']);
      assertEquals(mineLogs.filter((x) => x.action === 'coaching.group-add-members').map((x) => [x.entity, x.entity_id, x.before.members, x.after.added, x.after.exceptions]), [['coaching_groups', r.id, 1, 3, 1]]);
      assertEquals(mineLogs.filter((x) => x.action === 'coaching.group-exception').map((x) => [x.entity_id, x.after.exception, x.after.used, x.after.max, x.after.late]), [[w.ps[2].id, 'at_max', 2, 2, true]]);
      // إعادة الطلب نفسه: لا صف ثانٍ ولا دعوة ثانية ولا سجل
      const n1 = resendCalls(calls).length, l1 = w.tables.audit_log.length;
      const again: any = await CG.addMembers(ADMIN, { id: r.id, participant_ids: [w.ps[1].id, w.ps[3].id] });
      assertEquals([again.added, again.already, again.skipped.map((x: Row) => x.code), rowsOf(w, r.id).length, resendCalls(calls).length, w.tables.audit_log.length], [0, true, ['already', 'already'], 4, n1, l1]);
      // الجلسة تُعدّ للمستشار مرة واحدة بعد الإضافة
      // group-once: sessionUnits
      assertEquals(sessionUnits(w.tables.coaching_sessions.filter((s) => s.expert_id === TEAM)).length, 1);
      // لا أحد يُضاف: يُرفض بسببه
      assertEquals(await code(() => CG.addMembers(ADMIN, { id: r.id, participant_ids: [w.ps[4].id, w.ps[6].id] })), ['no_members', 400]);
      assertEquals(await code(() => CG.addMembers(ADMIN, { id: r.id, participant_ids: [] })), ['empty', 400]);
    });
  } finally { w.f.restore(); }
});

Deno.test('الإضافة: خانة «لا تُحسب من الرصيد» تسري على الجدد، ومن أُزيل أو اعتذر يعود بصفه نفسه، ولا إضافة بعد الحضور ولا لملغاة ولا لمنتهية', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      // جلسة خارج الرصيد: من استنفد رصيده يُضاف كغيره وصفه خارج الرصيد
      const off: any = await CG.save(ADMIN, input(w, { counts: false, participant_ids: [w.ps[0].id] }));
      const a: any = await CG.addMembers(ADMIN, { id: off.id, participant_ids: [w.ps[2].id] });
      assertEquals([a.added, a.exceptions, rowOf(w, off.id, 2).off_allowance, (await mine(w, 2)).used], [1, 0, true, 2]);
      // من أُزيل ثم أُعيد: الصف نفسه (معرّف دعوة تقويمه واحد)، ورقم تسلسل الدعوة الجديدة أعلى من ملف الإلغاء
      const r: any = await CG.save(ADMIN, input(w, { starts_at: iso(4 * DAY) }));
      const id0 = rowOf(w, r.id, 0).id;
      const n0 = resendCalls(calls).length;
      await CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[0].id });
      const gone = resendCalls(calls).slice(n0)[0];
      assertEquals([(await mine(w, 0)).used, ics(gone).includes('METHOD:CANCEL')], [0, true]);
      await new Promise((ok) => setTimeout(ok, 1100));
      const pv: any = await CG.addPreview({ id: r.id, participant_ids: [w.ps[0].id] });
      assertEquals([pv.candidates.find((c: Row) => c.id === w.ps[0].id).was, pv.members[0].category], ['removed', 'ok']);
      const back: any = await CG.addMembers(ADMIN, { id: r.id, participant_ids: [w.ps[0].id] });
      assertEquals([back.added, back.readded, rowsOf(w, r.id).length, rowOf(w, r.id, 0).id, rowOf(w, r.id, 0).status, rowOf(w, r.id, 0).confirmed_at, (await mine(w, 0)).used], [1, 1, 2, id0, 'booked', null, 1]);
      const invite = resendCalls(calls).at(-1)!;
      assertEquals([invite.body.subject, uidOf(ics(invite)), uidOf(ics(gone))], ['دعوة: جلسة جماعية مع المستشار', `${id0}@sunkvalue.com`, `${id0}@sunkvalue.com`]);
      assert(seqOf(ics(invite)) > seqOf(ics(gone)), 'الدعوة بعد الإزالة أعلى تسلسلًا من ملف الإلغاء');
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-add' && x.after.was === 'removed').map((x) => x.entity_id), [w.ps[0].id]);
      // من اعتذر ثم أُضيف: يعود محجوزًا بلا أثر تأكيد، والعدد لا يزيد
      await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[1].id, state: 'excused' }] });
      assertEquals((await mine(w, 1)).used, 0);
      const ex: any = await CG.addMembers(ADMIN, { id: r.id, participant_ids: [w.ps[1].id] });
      assertEquals([ex.added, ex.readded, groupMemberState(rowOf(w, r.id, 1)), rowOf(w, r.id, 1).confirmed_by, (await mine(w, 1)).used, rowsOf(w, r.id).length], [1, 1, 'booked', null, 1, 2]);
      // بعد تسجيل الحضور: لا إضافة، والمعاينة تقول السبب
      const h: any = await CG.save(ADMIN, input(w, { starts_at: iso(-HOUR / 2), minutes: 120, participant_ids: [w.ps[0].id] }));
      // بدأت ولم يُسجَّل حضورها بعد: تُضاف بلا بريد
      const n1 = resendCalls(calls).length;
      const late: any = await CG.addMembers(ADMIN, { id: h.id, participant_ids: [w.ps[1].id] });
      assertEquals([late.added, late.past, late.mail.sent, resendCalls(calls).length], [1, true, 0, n1]);
      await CG.adminMark(ADMIN, { id: h.id, marks: [{ id: w.ps[0].id, state: 'attended' }] });
      assertEquals(await code(() => CG.addMembers(ADMIN, { id: h.id, participant_ids: [w.ps[3].id] })), ['marked', 409]);
      assert(((await CG.addPreview({ id: h.id })) as any).blocked.includes('سُجّل حضور'));
      // منتهية بلا حضور مسجل، وملغاة: لا إضافة
      const done: any = await CG.save(ADMIN, input(w, { starts_at: iso(-3 * DAY), participant_ids: [w.ps[3].id] }));
      assertEquals(await code(() => CG.addMembers(ADMIN, { id: done.id, participant_ids: [w.ps[1].id] })), ['ended', 409]);
      await CG.cancel(ADMIN, { id: r.id });
      assertEquals(await code(() => CG.addMembers(ADMIN, { id: r.id, participant_ids: [w.ps[3].id] })), ['cancelled', 409]);
      const list: any = await CG.adminList({ cohort_id: COHORT });
      const flag = (id: string) => list.groups.find((x: Row) => x.id === id).can_add;
      assertEquals([flag(off.id), flag(h.id), flag(done.id), flag(r.id)], [true, false, false, false]);
    });
    // تعذّر السجل يتراجع عن الإضافة: لا مدعو بلا أثر ولا دعوة
    const w2 = world();
    try {
      const r: any = await CG.save(ADMIN, input(w2, { participant_ids: [w2.ps[0].id] }));
      await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w2.ps[0].id, state: 'excused' }] });
      const before = JSON.stringify(rowOf(w2, r.id, 0).confirmed_at);
      w2.down.add('audit_log:insert');
      await withMail(async (calls) => {
        await assertRejects(() => CG.addMembers(ADMIN, { id: r.id, participant_ids: [w2.ps[0].id, w2.ps[1].id] }));
        assertEquals([rowsOf(w2, r.id).length, groupMemberState(rowOf(w2, r.id, 0)), JSON.stringify(rowOf(w2, r.id, 0).confirmed_at), resendCalls(calls).length], [1, 'excused', before, 0]);
      });
    } finally { w2.f.restore(); }
  } finally { w.f.restore(); }
});

Deno.test('إعادة إرسال الدعوة: لمدعو أو لكل من لم يُسجَّل حضوره، بمهلة تمنع التكرار، وحالتها من سجل البريد', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id, w.ps[1].id, w.ps[3].id] }));
      const first = resendCalls(calls).find((c) => [c.body.to].flat()[0] === w.ps[0].email)!;
      // القائمة تقول متى خرجت الدعوة، من سجل البريد، وأن إعادتها ممسوكة الآن. حساب الاختبار بلا حالة
      const view = async () => ((await CG.adminList({ id: r.id })) as any).groups[0];
      let g = await view();
      const m = (n: number) => g.members.find((x: Row) => x.id === w.ps[n].id);
      assertEquals([g.can_resend, g.resend_minutes, g.mail_known, m(0).mail.state, !!m(0).mail.resend_at, m(3).mail], [true, 60, true, 'sent', true, undefined]);
      // داخل المهلة: الواحد يُرفض بسببه، و«الكل» لا يرسل شيئًا
      const n0 = resendCalls(calls).length;
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w.ps[0].id })), ['throttled', 429]);
      const none: any = await CG.resend(ADMIN, { id: r.id });
      assertEquals([none.mail, none.throttled, resendCalls(calls).length], [{ sent: 0, queued: 0, failed: 0, skipped: 1 }, 2, n0]);
      // حساب الاختبار: لا بريد له
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w.ps[3].id })), ['test_account', 409]);
      // بعد المهلة: تُعاد بالقالب نفسه وملف التقويم نفسه (المعرّف ورقم التسلسل)، فلا موعد ثانٍ في تقويمه
      ageMail(w, 61);
      const one: any = await CG.resend(ADMIN, { id: r.id, participant_id: w.ps[0].id });
      assertEquals([one.mail, one.throttled], [{ sent: 1, queued: 0, failed: 0, skipped: 0 }, 0]);
      const again = resendCalls(calls).at(-1)!;
      assertEquals([[again.body.to].flat()[0], again.body.subject, uidOf(ics(again)), seqOf(ics(again))], [w.ps[0].email, 'دعوة: جلسة جماعية مع المستشار', uidOf(ics(first)), seqOf(ics(first))]);
      assert(seqOf(ics(first)) > 0);
      // إعادة الطلب فورًا: ممسوكة، فلا رسالة ثانية
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w.ps[0].id })), ['throttled', 429]);
      // «الكل»: من مضت مهلته وحده، ومن أُرسلت له للتو ممسوك، ومن اعتذر ليس منهم
      await CG.adminMark(ADMIN, { id: r.id, marks: [{ id: w.ps[3].id, state: 'excused' }] });
      const n1 = resendCalls(calls).length;
      const all: any = await CG.resend(ADMIN, { id: r.id });
      assertEquals([all.mail, all.throttled, resendCalls(calls).slice(n1).map((c) => [c.body.to].flat()[0])], [{ sent: 1, queued: 0, failed: 0, skipped: 0 }, 1, [w.ps[1].email]]);
      // لا بريد للمستشار في الإعادة
      assertEquals(subjectsTo(calls, w.tables.experts[1].email), ['تكليف: جلسة جماعية مع مشاركيك']);
      // السجل: بند للمدعو الواحد وبند للجلسة
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'coaching.group-resend').map((x) => [x.entity, x.entity_id, x.after.sent]), [['participants', w.ps[0].id, 1], ['coaching_groups', r.id, 1]]);
      // مدعو أُزيل: لا دعوة تُعاد له
      await CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[1].id });
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w.ps[1].id })), ['not_pending', 409]);
      // بعد الإلغاء، ولجلسة بدأت: لا إعادة
      await CG.cancel(ADMIN, { id: r.id });
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id })), ['cancelled', 409]);
      const h: any = await CG.save(ADMIN, input(w, { starts_at: iso(-HOUR / 2), minutes: 120 }));
      assertEquals(await code(() => CG.resend(ADMIN, { id: h.id })), ['past', 409]);
      assertEquals(((await CG.adminList({ id: h.id })) as any).groups[0].can_resend, false);
    });
  } finally { w.f.restore(); }
  // الحصة ممتلئة: الإعادة تدخل الطابور بملف تقويمها وموعد الجلسة حدًّا لها، وحالتها «تنتظر»، ولا تُعاد ثانية ما دامت تنتظر
  const w2 = world();
  try {
    await withMail(async (calls) => {
      const r: any = await CG.save(ADMIN, input(w2, { participant_ids: [w2.ps[0].id, w2.ps[1].id] }));
      ageMail(w2, 61);
      w2.tables.mail_events.push(...Array.from({ length: 40 }, () => ({ id: crypto.randomUUID(), kind: 'notify', status: 'sent', source: 'leaders-api', created_at: new Date(Date.now() - 6e4).toISOString() })));
      const n0 = resendCalls(calls).length;
      const q: any = await CG.resend(ADMIN, { id: r.id, participant_id: w2.ps[0].id });
      assertEquals([q.mail, resendCalls(calls).length], [{ sent: 0, queued: 1, failed: 0, skipped: 0 }, n0]);
      const waiting = w2.tables.mail_queue.filter((x) => !x.sent_at);
      assertEquals(waiting.map((x) => [x.to_email, x.kind, x.ref, x.expires_at, x.attachments?.[0]?.filename]), [[w2.ps[0].email, 'bulk', r.id, w2.tables.coaching_groups[0].starts_at, 'session.ics']]);
      const g = ((await CG.adminList({ id: r.id })) as any).groups[0];
      assertEquals(g.members.find((x: Row) => x.id === w2.ps[0].id).mail.state, 'waiting');
      assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w2.ps[0].id })), ['throttled', 429]);
      assertEquals(w2.tables.mail_queue.length, 1);
    }, 80);
  } finally { w2.f.restore(); }
  // دعوة تعذّر إرسالها: حالتها «لم تخرج»، وتُعاد فورًا بلا مهلة
  const w3 = world();
  try {
    const r: any = await CG.save(ADMIN, input(w3, { participant_ids: [w3.ps[0].id] }));
    w3.tables.mail_events.push({ id: crypto.randomUUID(), kind: 'bulk', status: 'failed', source: 'leaders-api', ref: r.id, subject: 'دعوة: جلسة جماعية مع المستشار',
      to_hash: await (await import('../_shared/mail.ts')).addressHash(w3.ps[0].email), created_at: new Date().toISOString() });
    const g = ((await CG.adminList({ id: r.id })) as any).groups[0];
    assertEquals([g.members[0].mail.state, g.members[0].mail.resend_at], ['failed', undefined]);
    await withMail(async (calls) => {
      const x: any = await CG.resend(ADMIN, { id: r.id, participant_id: w3.ps[0].id });
      assertEquals([x.mail.sent, resendCalls(calls).length], [1, 1]);
    });
    // تعذّرت قراءة سجل البريد: لا إعادة على عمى، والقائمة تُعرض بلا حالة
    ageMail(w3, 120);
    w3.down.add('mail_events:select');
    assertEquals(await code(() => CG.resend(ADMIN, { id: r.id, participant_id: w3.ps[0].id })), ['mail_unreadable', 503]);
    const blind = ((await CG.adminList({ id: r.id })) as any).groups[0];
    assertEquals([blind.mail_known, blind.members[0].mail], [false, undefined]);
  } finally { w3.f.restore(); }
});

Deno.test('ملف التقويم: الإلغاء والإزالة بملف CANCEL بمعرّف الدعوة نفسه، ورقم التسلسل يكبر من الدعوة إلى التغيير إلى الإلغاء', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await CG.save(ADMIN, input(w, { participant_ids: [w.ps[0].id, w.ps[1].id] }));
      const mail = (email: string, subject: string) => resendCalls(calls).filter((c) => [c.body.to].flat()[0] === email && c.body.subject === subject).at(-1)!;
      const invite = ics(mail(w.ps[0].email, 'دعوة: جلسة جماعية مع المستشار'));
      const xInvite = ics(mail(w.tables.experts[1].email, 'تكليف: جلسة جماعية مع مشاركيك'));
      assert(invite.includes('METHOD:PUBLISH') && invite.includes('BEGIN:VALARM') && seqOf(invite) > 0);
      await new Promise((ok) => setTimeout(ok, 1100));
      await CG.save(ADMIN, { id: r.id, starts_at: iso(6 * DAY), minutes: 60 });
      const change = ics(mail(w.ps[0].email, 'تحديث: جلستك الجماعية مع المستشار'));
      const xChange = ics(mail(w.tables.experts[1].email, 'تحديث: جلستك الجماعية'));
      assert(change.includes('METHOD:PUBLISH') && seqOf(change) > seqOf(invite) && seqOf(xChange) > seqOf(xInvite));
      // إزالة مدعو: ملف إلغاء له وحده، بمعرّف دعوته ورقم أعلى، بلا تنبيه ولا رابط
      await new Promise((ok) => setTimeout(ok, 1100));
      await CG.removeMember(ADMIN, { id: r.id, participant_id: w.ps[1].id });
      const removed = mail(w.ps[1].email, 'تحديث: لست مدعوًّا إلى الجلسة الجماعية');
      const gone = ics(removed);
      assertEquals([removed.body.attachments[0].filename, removed.body.attachments[0].content_type, uidOf(gone)], ['cancel.ics', 'text/calendar; charset=utf-8; method=CANCEL', `${rowOf(w, r.id, 1).id}@sunkvalue.com`]);
      assert(gone.includes('METHOD:CANCEL') && gone.includes('STATUS:CANCELLED') && !gone.includes('VALARM') && !gone.includes('URL:') && seqOf(gone) > seqOf(change));
      // والجملة باقية لمن يتجاهل برنامجه الملف
      assert(removed.body.html.includes('وإن بقي فاحذفه') && removed.body.html.includes('لم تُحسب من رصيد استشاراتك'));
      // إلغاء الجلسة: ملف إلغاء لكل مدعو بمعرّف دعوته، وللمستشار بمعرّف الجلسة، ورقمه أعلى من التغيير
      await new Promise((ok) => setTimeout(ok, 1100));
      await CG.cancel(ADMIN, { id: r.id });
      const cancelled = mail(w.ps[0].email, 'أُلغيت: جلستك الجماعية مع المستشار');
      const off = ics(cancelled), xOff = ics(mail(w.tables.experts[1].email, 'أُلغيت: جلستك الجماعية'));
      assertEquals([uidOf(off), uidOf(invite), uidOf(change), uidOf(xOff), uidOf(xInvite)], [uidOf(invite), `${rowOf(w, r.id, 0).id}@sunkvalue.com`, uidOf(invite), `${r.id}@sunkvalue.com`, `${r.id}@sunkvalue.com`]);
      assert(off.includes('METHOD:CANCEL') && off.includes('STATUS:CANCELLED') && seqOf(off) > seqOf(change) && seqOf(xOff) > seqOf(xChange));
      assert(cancelled.body.html.includes('وإن بقي فاحذفه'));
      // كل ملف: أسطر CRLF، ولا سطر فوق 75 بايتًا
      for (const text of [invite, change, gone, off, xOff]) {
        assert(text.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(text));
        // ics() يعيد البايتات حرفًا لكل بايت، فطول السطر هنا طوله بالبايتات
        assert(text.split('\r\n').every((l) => l.length <= 75));
      }
    });
    // تغيير المستشار: القديم يصله ملف إلغاء بمعرّف الجلسة
    const w2 = world();
    try {
      await withMail(async (calls) => {
        const r: any = await CG.save(ADMIN, input(w2));
        await CG.save(ADMIN, { id: r.id, expert_id: ADVISOR });
        const old = resendCalls(calls).find((c) => c.body.subject === 'أُلغيت: جلستك الجماعية')!;
        assert(ics(old).includes('METHOD:CANCEL') && ics(old).includes(`UID:${r.id}@`));
      });
    } finally { w2.f.restore(); }
  } finally { w.f.restore(); }
});
