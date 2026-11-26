// صفوف «المتابعة» في ملف الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 1): صف لكل عضو من الحلقة نفسها التي تعدّ خريطة
// الرحلة، فعدد كل مرحلة في الخريطة هو عدد صفوفها دائمًا. قسمان: journeyMap برحلات مركبة (التوازي، المسار المستمر، المتأخر،
// المرحلة الموقوفة، الخدمة، المنسحب)، ثم adminCohortJourney كاملة على قاعدة في الذاكرة (journeyFor لكل عضو، وحساب العرض
// وحساب الاختبار خارجها، والقراءات الإضافية ثلاث للدفعة كلها لا واحدة لكل صف).
import { placeOrgMembers } from './_fake_db.ts';
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { journeyMap, rosterAgrees, turnOf } from './journey-map.js';
const { db } = await import('./core.ts');
const { adminCohortJourney } = await import('./coordinator.ts');

type Row = Record<string, any>;

// ── 1. journeyMap برحلات مركبة ──
const STAGES = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', duration_days: 2, sort: 1 },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', duration_days: 5, sort: 2 },
  { key: 'apply', title_ar: 'التطبيق', phase: 'qualification', duration_days: 5, sort: 3, rules: { unlock: 'with', with: 'training' } },
  { key: 'habit', title_ar: 'العادة اليومية', phase: 'qualification', duration_days: 0, sort: 4, rules: { lane: 'track' } },
  { key: 'advice', title_ar: 'الاستشارة', phase: 'qualification', duration_days: 0, sort: 5, rules: { lane: 'service' } },
  { key: 'report', title_ar: 'التقرير', phase: 'impact', duration_days: 7, sort: 6 },
];
const OFF = [{ key: 'visit', title_ar: 'الزيارة الميدانية', phase: 'qualification', sort: 5.5 }];
const it = (title_ar: string, status: string, more: Row = {}) => ({ title_ar, status, required: true, kind: 'upload', completed_at: status === 'done' ? '2026-11-02T09:00:00Z' : null, ...more });
const stage = (key: string, status: string, items: Row[]) => {
  const s = STAGES.find((x) => x.key === key)!;
  return { key, title_ar: s.title_ar, rules: (s as Row).rules, stage_mode: 'required', status, items, ...((s as Row).rules?.lane ? { lane: (s as Row).rules.lane } : {}) };
};
// الرحلة حتى موضع معين: ما قبله منجز، والمسار والخدمة بحالتيهما
const journey = (o: { profile?: string; training?: string; apply?: string; habit?: string; report?: string; trainItems?: Row[]; advice?: Row[] }) => [
  stage('profile', o.profile || 'done', [it('أكمل ملفك', o.profile === 'active' ? 'pending' : 'done', { kind: 'auto', code: 'P-INFO' })]),
  stage('training', o.training || 'locked', o.trainItems || [it('ارفع واجب التدريب', o.training === 'done' ? 'done' : 'pending')]),
  stage('apply', o.apply || 'locked', [it('نموذج التطبيق', o.apply === 'done' ? 'done' : 'pending', { kind: 'form' })]),
  stage('habit', o.habit || 'locked', [it('سجّل عادتك', o.habit === 'done' ? 'done' : 'pending', { kind: 'check' })]),
  { ...stage('advice', 'available', o.advice || [it('جلسة استشارة', 'pending', { kind: 'coaching', required: false, activity: { type: 'coaching', done: false, count: 0, total: 1, can_book: true, max: 2, used: 0, sessions: [] } })]), stage_mode: 'on_demand' },
  stage('report', o.report || 'locked', [it('استلم تقريرك', o.report === 'done' ? 'done' : 'pending', { kind: 'auto', code: 'R-ISSUE' })]),
];
const TODAY = new Date('2026-11-20T10:00:00Z');
const person = (id: string, name: string, j: Row[], more: Row = {}) => ({ id, name, status: 'enrolled', created_at: '2026-10-28T00:00:00Z', journey: j, milestones: [], dates: [], progress: 40, ...more });
const people = () => [
  // يسير في مرحلتين معًا، والمسار المستمر جارٍ بجانبهما: واجبه مسلَّم ينتظر المراجعة
  person('par', 'سارة', journey({ training: 'active', apply: 'active', habit: 'active', trainItems: [it('ارفع واجب التدريب', 'submitted')] })),
  // في التدريب وحده (التطبيق اكتمل له)، واستفاد من الاستشارة
  person('one', 'خالد', journey({ training: 'active', apply: 'done', habit: 'done',
    advice: [it('جلسة استشارة', 'pending', { kind: 'coaching', required: false, activity: { type: 'coaching', done: false, count: 1, total: 1, can_book: true, max: 2, used: 1, sessions: [{ id: 'cs1', status: 'attended' }] } })] })),
  // لم يكمل ملفه
  person('new', 'نورة', journey({ profile: 'active' })),
  // أنهى المراحل المتتابعة كلها، ومساره المستمر ما زال جاريًا
  person('fin', 'فهد', journey({ training: 'done', apply: 'done', habit: 'active', report: 'done' })),
  // منسحب: رحلته المحسوبة ما زالت عند التدريب
  person('out', 'ماجد', journey({ training: 'active', apply: 'active' }), { status: 'withdrawn' }),
];
const build = (more: Row = {}) => journeyMap({ stages: STAGES, people: people(), cohort: { name: 'دفعة', starts_on: '2026-11-01' }, program: { name: 'برنامج' }, today: TODAY, list: true, activity: true, off: OFF, roster: true, ...more }) as Row;

Deno.test('الصفوف تطابق أعداد الخريطة: هنا ومتأخر لكل مرحلة، واستخدام الخدمة، والإجماليات', () => {
  const m = build();
  assertEquals(rosterAgrees(m), []);
  const by = Object.fromEntries(m.stages.map((s: Row) => [s.key, s]));
  const rows = (k: string) => m.members.filter((x: Row) => x.stage_keys.includes(k) || x.track_keys.includes(k)).map((x: Row) => x.id).sort();
  // العدد في كل مرحلة هو عدد صفوفها بعينه، والأسماء في لوحة المرحلة هي أصحاب الصفوف
  for (const s of m.stages.filter((x: Row) => !x.service && !x.off)) {
    assertEquals(rows(s.key).length, s.here, s.key);
    if (!(s.key === 'habit')) assertEquals((s.people || []).map((p: Row) => p.id).sort(), rows(s.key), s.key);
  }
  assertEquals([by.profile.here, by.training.here, by.apply.here, by.habit.here], [1, 2, 1, 2]);
  assertEquals(m.totals.total, 4);
  // الحارس يلتقط الاختلاف فعلًا: صف يُحذف، فتختلف مرحلته والإجمالي
  const broken = { ...m, members: m.members.filter((x: Row) => x.id !== 'one') };
  assert(rosterAgrees(broken).length > 0);
});

Deno.test('مرحلتان تسيران معًا: صف واحد يسميهما معًا، ويُعدّ في كل منهما، ولكل مرحلة سببها ودورها', () => {
  const m = build();
  const r = m.members.find((x: Row) => x.id === 'par');
  assertEquals(r.stage_keys, ['training', 'apply']);
  assertEquals(r.stage, 'التدريب والتطبيق معًا');
  assertEquals(r.stuck.map((x: Row) => [x.key, x.needs, x.turn]), [['training', 'ارفع واجب التدريب', 'admin'], ['apply', 'نموذج التطبيق', 'participant']]);
  // الصف يحمل دور موضعه، وturns كل الأدوار الجارية فيطابقه فلتر «ينتظرونني»
  assertEquals([r.turn, r.why, r.turns], ['admin', 'تسليم ينتظر المراجعة', ['admin', 'participant']]);
  assertEquals(m.members.filter((x: Row) => x.id === 'par').length, 1);
});

Deno.test('المسار المستمر بجانب المرحلة لا مكانها، ومن أنهى المراحل يبقى مساره الجاري في صفه', () => {
  const m = build();
  const par = m.members.find((x: Row) => x.id === 'par');
  assertEquals([par.track_keys, par.tracks], [['habit'], ['العادة اليومية']]);
  assert(!par.stage_keys.includes('habit'));
  const fin = m.members.find((x: Row) => x.id === 'fin');
  assertEquals([fin.state, fin.stage, fin.stage_keys, fin.track_keys], ['finished', null, [], ['habit']]);
  assertEquals(m.totals.finished, 1);
});

Deno.test('المتأخر بتعريف الخريطة نفسه: نافذة الدفعة ومهلة السماح، وأيام المكوث من دخوله', () => {
  const m = build();
  // نافذة التدريب 3 إلى 7 نوفمبر واليوم 20: سارة وخالد متأخران، ونورة عند الملف (نافذته 1 إلى 2 نوفمبر) متأخرة أيضًا
  assertEquals(m.members.filter((x: Row) => x.late).map((x: Row) => x.id).sort(), ['new', 'one', 'par']);
  assertEquals(m.totals.late, 3);
  const one = m.members.find((x: Row) => x.id === 'one');
  assertEquals([one.state, one.late_keys, one.days], ['late', ['training'], 18]);
  // قبل نهاية النوافذ لا متأخر، وحالة من لم يُعتمد «لم يكمل التسجيل»
  const early = build({ today: new Date('2026-11-02T10:00:00Z') });
  assertEquals(early.members.filter((x: Row) => x.late).length, 0);
  assertEquals(early.members.find((x: Row) => x.id === 'new').state, 'onboarding');
  assertEquals(early.members.find((x: Row) => x.id === 'one').state, 'ontime');
  assertEquals(rosterAgrees(early), []);
});

Deno.test('المرحلة الموقوفة للدفعة في مكانها بلا صفوف، والخدمة مؤشر استخدام لا موضع', () => {
  const m = build();
  const visit = m.stages.find((s: Row) => s.key === 'visit');
  assertEquals([visit.off, visit.here], [true, 0]);
  assert(!m.members.some((x: Row) => x.stage_keys.includes('visit') || x.track_keys.includes('visit')));
  const advice = m.stages.find((s: Row) => s.key === 'advice');
  assertEquals([advice.service, advice.used, advice.of], [true, 1, 4]);
  assert(!m.members.some((x: Row) => x.stage_keys.includes('advice')));
  assertEquals(m.members.find((x: Row) => x.id === 'one').consult, { used: 1, max: 2 });
  assertEquals(m.members.find((x: Row) => x.id === 'par').consult, { used: 0, max: 2 });
});

Deno.test('المنسحب صف خارج الرحلة: بلا مرحلة ولا تأخر، ولا يدخل عدًّا في الخريطة', () => {
  const m = build();
  const out = m.members.find((x: Row) => x.id === 'out');
  assertEquals([out.state, out.stage, out.stage_keys, out.late, out.turns], ['out', null, [], false, []]);
  assertEquals(m.stages.find((s: Row) => s.key === 'training').people.map((p: Row) => p.id).includes('out'), false);
  assertEquals(m.members.length, 5);
});

Deno.test('بلا roster لا يتغير مخرج الخريطة حرفًا: لا members، وباقي الحقول كما هي', () => {
  const { members: _m, ...withRoster } = build();
  assertEquals(journeyMap({ stages: STAGES, people: people(), cohort: { name: 'دفعة', starts_on: '2026-11-01' }, program: { name: 'برنامج' }, today: TODAY, list: true, activity: true, off: OFF }), withRoster);
});

Deno.test('الحضور من الجلسات التي بدأت، و«لم يحضر آخر ورشة» لآخر جلسة انتهت', () => {
  const ws = (attended: string[]) => it('احضر أيام التدريب', 'pending', { kind: 'workshop', activity: { type: 'workshop', done: false, count: attended.length, total: 3, sessions: [
    { id: 's1', starts_at: '2026-11-04T06:00:00Z', ends_at: '2026-11-04T10:00:00Z', attended: attended.includes('s1'), undated: false },
    { id: 's2', starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T10:00:00Z', attended: attended.includes('s2'), undated: false },
    { id: 's3', starts_at: '2026-11-25T06:00:00Z', ends_at: '2026-11-25T10:00:00Z', attended: false, undated: false },
  ] } });
  const m = journeyMap({ stages: STAGES, cohort: { name: 'دفعة', starts_on: '2026-11-01' }, today: TODAY, list: true, activity: true, roster: true, people: [
    person('a', 'حضر الكل', journey({ training: 'active', trainItems: [ws(['s1', 's2'])] })),
    person('b', 'غاب عن الأخيرة', journey({ training: 'active', trainItems: [ws(['s1'])] })),
  ] }) as Row;
  const [a, b] = ['a', 'b'].map((id) => m.members.find((x: Row) => x.id === id));
  assertEquals([a.attendance, a.missed_last], [{ count: 2, total: 2 }, false]);
  assertEquals([b.attendance, b.missed_last], [{ count: 1, total: 2 }, true]);
  // جلسة قادمة لم تُعقد: الدور على موعد، لا على العضو ولا على الإدارة
  assertEquals([a.turn, b.turn], ['schedule', 'schedule']);
  assert(!('sessions' in a));
});

Deno.test('على من الدور: مرحلة يفتحها الفريق عليك، ومرحلة بتاريخ على موعد، وما لا يُستنتج غير محدد', () => {
  assertEquals(turnOf({ status: 'locked', rules: { unlock: 'approval' }, items: [] }).turn, 'admin');
  assertEquals(turnOf({ status: 'locked', rules: { unlock: 'day', day: 30 }, items: [] }).turn, 'schedule');
  assertEquals(turnOf({ status: 'locked', lock_reason: 'تُفتح بعد اكتمال: التدريب', items: [] }).turn, 'none');
  assertEquals(turnOf({ status: 'active', items: [it('تقدير زملائك', 'pending', { kind: 'auto', code: 'T-360' })] }).turn, 'none');
  assertEquals(turnOf(null).turn, 'none');
});

// ── 2. adminCohortJourney على قاعدة في الذاكرة ──
function install(tables: Record<string, Row[]>) {
  placeOrgMembers(tables);
  const reads: string[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false, single = false, range: [number, number] | null = null;
    const run = () => {
      reads.push(table);
      const hit = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      const out = range ? hit.slice(range[0], range[1] + 1) : hit;
      if (head) return { data: null, count: out.length, error: null };
      return { data: single ? out[0] ?? null : out, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'select') return (_c?: string, o?: any) => { if (o?.head) head = true; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'not') return (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        if (k === 'range') return (f: number, t: number) => { range = [f, t]; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        if (k === 'insert' || k === 'update' || k === 'upsert' || k === 'delete') return () => { filters.push(() => false); return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = (db as any).from;
  Object.assign(db as any, { from });
  return { reads, restore: () => { (db as any).from = prev; } };
}

const P = (id: string, full_name: string, more: Row = {}) => ({
  id, full_name, email: `${id}@example.sa`, phone: '+966551234567', job_title: 'مدير مشروع', organization_name: 'جهة الاختبار', organization_id: 'org-a', status: 'enrolled',
  is_demo: false, is_test: false, created_at: '2025-01-01T08:00:00Z', profile_completed_at: '2025-01-02T08:00:00Z', last_login_at: '2025-01-05T08:00:00Z', ...more,
});
const world = () => ({
  participants: [
    P('sara', 'سارة العتيبي', { phone: '+966551112233' }),
    P('khalid', 'خالد الحربي'),
    P('noura', 'نورة السبيعي', { status: 'registered', profile_completed_at: null, phone: null, last_login_at: null }),
    P('majed', 'ماجد القحطاني', { status: 'withdrawn' }),
    // حساب العرض (بلا جهة) وحساب الاختبار: لا يظهران في الصفوف ولا في أي عدد
    P('demo', 'حساب العرض', { is_demo: true, organization_id: null }),
    P('tester', 'حساب اختبار', { is_test: true }),
  ],
  programs: [{ id: 'prog', is_default: true, name: 'برنامج القادة', final_eval: null }],
  // بداية قديمة فكل نافذة انقضت: المتأخر متأخر أيًا كان يوم تشغيل الاختبار
  cohorts: [{ id: 'c1', name: 'دفعة الاختبار', is_default: false, organization_id: 'org-a', status: 'running', program_id: 'prog', starts_on: '2025-01-01', created_at: '2024-12-01',
    schedule: { visit: { off: true } } }],
  enrollments: [],
  journey_stages: [
    { program_id: 'prog', key: 'profile', sort: 1, title_ar: 'الملف الشخصي', phase: 'admission', duration_days: 0, active: true },
    { program_id: 'prog', key: 'training', sort: 2, title_ar: 'التدريب', phase: 'qualification', duration_days: 5, active: true },
    { program_id: 'prog', key: 'apply', sort: 3, title_ar: 'التطبيق', phase: 'qualification', duration_days: 5, active: true, rules: { unlock: 'with', with: 'training' } },
    { program_id: 'prog', key: 'visit', sort: 4, title_ar: 'الزيارة الميدانية', phase: 'qualification', duration_days: 3, active: true },
    { program_id: 'prog', key: 'habit', sort: 5, title_ar: 'العادة اليومية', phase: 'qualification', duration_days: 0, active: true, rules: { lane: 'track', unlock: 'stages', after: ['profile'] } },
  ],
  stage_requirements: [
    { id: 'r-info', program_id: 'prog', stage_key: 'profile', code: 'P-INFO', kind: 'auto', sort: 1, title_ar: 'أكمل ملفك', active: true, required: true },
    { id: 'r-up', program_id: 'prog', stage_key: 'training', code: 'T-UP', kind: 'upload', sort: 1, title_ar: 'ارفع واجب التدريب', active: true, required: true, needs_review: true },
    { id: 'r-form', program_id: 'prog', stage_key: 'apply', code: 'A-FORM', kind: 'form', sort: 1, title_ar: 'نموذج التطبيق', active: true, required: true },
    { id: 'r-visit', program_id: 'prog', stage_key: 'visit', code: 'V-1', kind: 'check', sort: 1, title_ar: 'زيارة', active: true, required: true },
    { id: 'r-habit', program_id: 'prog', stage_key: 'habit', code: 'H-1', kind: 'check', sort: 1, title_ar: 'سجّل عادتك', active: true, required: true },
  ],
  participant_requirements: [
    { participant_id: 'sara', requirement_id: 'r-up', status: 'submitted', completed_at: null },
    { participant_id: 'khalid', requirement_id: 'r-form', status: 'done', completed_at: '2025-01-04T08:00:00Z' },
  ],
  cohort_group_members: [{ cohort_id: 'c1', participant_id: 'sara', group_id: 'g1', cohort_groups: { name: 'أ' } }],
  auth_sessions: [{ id: 's1', participant_id: 'sara', last_seen_at: '2025-02-01T08:00:00Z' }],
});
const admin = { email: 'a@x.sa', role: 'admin' as const } as any;

Deno.test('admin.cohort-journey: صف لكل عضو من رحلته، بأعداد الخريطة نفسها، وحساب العرض والاختبار خارجها', async () => {
  const w = install(world());
  let res: any;
  try { res = await adminCohortJourney(admin, { cohort_id: 'c1' }); } finally { w.restore(); }
  const { journey_map: map, roster } = res;
  // الخريطة كما يقرؤها تبويب «الرحلة»: بلا members، والصفوف في حقلها
  assert(!('members' in map));
  assertEquals(roster.map((x: Row) => x.id).sort(), ['khalid', 'majed', 'noura', 'sara']);
  const json = JSON.stringify(res);
  for (const leak of ['حساب العرض', 'حساب اختبار', 'demo@example.sa', 'tester@example.sa']) assert(!json.includes(leak), leak);
  // المطابقة: كل عدد في الخريطة عدد صفوفه
  assertEquals(rosterAgrees({ ...map, members: roster }), []);
  const by = Object.fromEntries(map.stages.map((s: Row) => [s.key, s]));
  assertEquals([by.profile.here, by.training.here, by.apply.here, by.habit.here, by.visit.off], [1, 2, 1, 2, true]);
  assertEquals(map.totals.total, 3);

  const sara = roster.find((x: Row) => x.id === 'sara');
  assertEquals([sara.stage, sara.stage_keys, sara.tracks], ['التدريب والتطبيق معًا', ['training', 'apply'], ['العادة اليومية']]);
  assertEquals([sara.needs, sara.turn, sara.why, sara.late, sara.state], ['ارفع واجب التدريب', 'admin', 'تسليم ينتظر المراجعة', true, 'late']);
  // ما يُعرض ويُبحث به من صف المشارك نفسه، وآخر نشاط من آخر استعمال للجلسة لا من آخر دخول
  assertEquals([sara.email, sara.phone, sara.job_title, sara.organization_name, sara.group], ['sara@example.sa', '+966551112233', 'مدير مشروع', 'جهة الاختبار', 'أ']);
  assertEquals([Date.parse(sara.last_active_at), sara.last_login_at], [Date.parse('2025-02-01T08:00:00Z'), '2025-01-05T08:00:00Z']);
  assertEquals(typeof sara.progress, 'number');

  const khalid = roster.find((x: Row) => x.id === 'khalid');
  assertEquals([khalid.stage, khalid.stage_keys, khalid.turn, khalid.group], ['التدريب', ['training'], 'participant', null]);
  // قبل الاعتماد: خانة «أين توقف» القائمة بنصها
  const noura = roster.find((x: Row) => x.id === 'noura');
  assertEquals([noura.stage, noura.turn, noura.onboarding?.step, noura.phone], ['الملف الشخصي', 'participant', 'profile', null]);
  const majed = roster.find((x: Row) => x.id === 'majed');
  assertEquals([majed.state, majed.stage, majed.onboarding], ['out', null, null]);

  // لا قراءة لكل صف: المجموعات وآخر نشاط قراءة واحدة للدفعة كلها أيًا كان عدد أعضائها
  assertEquals(w.reads.filter((t) => t === 'cohort_group_members').length, 1);
  assertEquals(w.reads.filter((t) => t === 'auth_sessions').length, 1);
});
