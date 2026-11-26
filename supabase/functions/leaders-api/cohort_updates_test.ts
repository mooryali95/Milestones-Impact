// تحديثات الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 3): «منذ آخر زيارة» قراءة مشتقة من تواريخ الجداول القائمة، ووقت آخر
// زيارة المدير ومتى يتقدم، واللقطة اليومية (أعداد وحدها)، وتنبيه المتأخرين الجدد، وسطر الملخص اليومي، والملخص الأسبوعي لكل
// دفعة جارية (أعداد فقط، يُطفأ من مركز الإشعارات، ولا يتكرر، ولا يزاحم بريد المشاركين).
// ثلاثة أقسام: منطق خالص (cohort-changes.js وjourneyMap)، ثم الخادم على قاعدة في الذاكرة، ثم البريد بشبكة محاكاة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { journeyMap } from './journey-map.js';
import {
  annotateJourney, cohortChanges, digestLine, doneAt, lateAlertText, sinceFor, snapshotOf, VISIT_GAP_MS, visitAdvance, visitRead, visitSince, weeklyBudgetOk, weeklyDue,
} from './cohort-changes.js';
import { withNet, resendCalls, placeOrgMembers } from './_fake_db.ts';
const { CONFIG, db, publicDb } = await import('./core.ts');
const { adminCohortJourney } = await import('./coordinator.ts');
const { completionTimes, READS } = await import('./cohort-times.ts');
const { adminCohortVisit } = await import('./cohort-visits.ts');
const PU = await import('./cohort-pulse.ts');
const DG = await import('./digest.ts');
const TD = await import('./today-desk.ts');
const NS = await import('../_shared/notify-settings.ts');
const RT: any = await import('../_shared/notify-routing.js');

type Row = Record<string, any>;
const DAY = 864e5;

// ════════ 1. المنطق الخالص ════════
const STAGES = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', duration_days: 2, sort: 1 },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', duration_days: 5, sort: 2 },
  { key: 'apply', title_ar: 'التطبيق', phase: 'qualification', duration_days: 5, sort: 3 },
  { key: 'report', title_ar: 'التقرير', phase: 'impact', duration_days: 7, sort: 4 },
];
// الدفعة تبدأ 1 نوفمبر: الملف 1 إلى 2، التدريب 3 إلى 7، التطبيق 8 إلى 12، التقرير 13 إلى 19. والمهلة ثلاثة أيام
const COHORT = { name: 'دفعة', starts_on: '2026-11-01' };
const it = (id: string, status: string, more: Row = {}) => ({ id, title_ar: id, status, required: true, kind: 'upload', completed_at: null, ...more });
const stage = (key: string, status: string, items: Row[]) => ({ key, title_ar: STAGES.find((s) => s.key === key)!.title_ar, stage_mode: 'required', status, items });
const session = (id: string, day: string, attended: boolean, at: string | null = null) => ({ id, title: `ورشة ${id}`, starts_at: `${day}T06:00:00Z`, ends_at: `${day}T10:00:00Z`, attended, undated: false, ...(at ? { attended_at: at } : {}) });
const person = (id: string, j: Row[], more: Row = {}) => ({ id, name: id, status: 'enrolled', created_at: '2026-10-20T00:00:00Z', journey: j, milestones: [], dates: [], progress: 10, ...more });
const NOW = new Date('2026-11-20T09:00:00Z');
const roster = (people: Row[], today: Date = NOW, cohort: Row = COHORT) =>
  (journeyMap({ stages: STAGES, people, cohort, program: { name: 'ب' }, today, list: true, activity: true, roster: true }) as Row);
const lineOf = (ch: Row, key: string) => ch.lines.find((l: Row) => l.key === key) || null;

// رحلة عند التدريب: أتم الملف في لحظة profileAt، وله في التدريب بنود
const atTraining = (profileAt: string, items: Row[]) => [
  stage('profile', 'done', [it('p1', 'done', { done_at: profileAt })]),
  stage('training', 'active', items), stage('apply', 'locked', [it('a1', 'pending')]), stage('report', 'locked', [it('r1', 'pending')]),
];

Deno.test('كل نوع سطر: دخلوا مرحلة، أنجزوا، سلّموا، حضروا، صاروا متأخرين، انضموا، توقفوا، أتموا', () => {
  const since = '2026-11-18T09:00:00Z';
  const people = [
    // دخل التدريب أمس (أتم الملف)، وأنجز بندين في النافذة، وحضر ورشة أمس
    person('a', atTraining('2026-11-19T08:00:00Z', [it('t1', 'done', { done_at: '2026-11-19T10:00:00Z' }), it('t2', 'pending'),
      it('w', 'pending', { kind: 'workshop', activity: { type: 'workshop', done: false, count: 1, total: 2, sessions: [session('s1', '2026-11-19', true, '2026-11-19T06:10:00Z'), session('s2', '2026-11-25', false)] } })])),
    // في التدريب منذ زمن، سلّم واجبه أمس وينتظر المراجعة، ولم يحضر الورشة
    person('b', atTraining('2026-11-03T08:00:00Z', [it('t1', 'submitted', { waiting_at: '2026-11-19T12:00:00Z' }),
      it('w', 'pending', { kind: 'workshop', activity: { type: 'workshop', done: false, count: 0, total: 2, sessions: [session('s1', '2026-11-19', false), session('s2', '2026-11-25', false)] } })])),
    // أتم الرحلة أمس
    person('c', [stage('profile', 'done', [it('p1', 'done', { done_at: '2026-11-02T08:00:00Z' })]), stage('training', 'done', [it('t1', 'done', { done_at: '2026-11-05T08:00:00Z' })]),
      stage('apply', 'done', [it('a1', 'done', { done_at: '2026-11-10T08:00:00Z' })]), stage('report', 'done', [it('r1', 'done', { done_at: '2026-11-19T15:00:00Z' })])], { status: 'completed' }),
    // انضم أمس وما زال عند الملف
    person('d', [stage('profile', 'active', [it('p1', 'pending')]), stage('training', 'locked', [it('t1', 'pending')]), stage('apply', 'locked', [it('a1', 'pending')]), stage('report', 'locked', [it('r1', 'pending')])],
      { created_at: '2026-11-19T07:00:00Z', joined_at: '2026-11-19T07:00:00Z' }),
    // منسحب: خارج السطور ولو تغيّر
    person('x', atTraining('2026-11-19T08:00:00Z', [it('t1', 'done', { done_at: '2026-11-19T10:00:00Z' })]), { status: 'withdrawn' }),
  ];
  const m = roster(people);
  // آخر نشاط: يضعه الخادم في الصف (rosterRows). «ب» أتم سبعة أيام بلا نشاط أمس
  const rows = m.members.map((r: Row) => ({ ...r, last_active_at: r.id === 'b' ? '2026-11-12T10:00:00Z' : '2026-11-20T08:00:00Z' }));
  const ch = cohortChanges(rows, { since, now: NOW, stages: m.stages });
  assertEquals(ch.lines.map((l: Row) => [l.key, l.text, l.ids]), [
    ['entered:training', 'دخلوا مرحلة التدريب: 1', ['a']],
    ['finished', 'أتموا الرحلة: 1', ['c']],
    ['done', 'أنجزوا نشاطًا: 3 أنشطة من عضوين', ['a', 'c']],
    ['submitted', 'سلّموا ما ينتظر مراجعتك: 1', ['b']],
    ['attended:s1', 'حضروا «ورشة s1»: 1 من 2', ['a']],
    ['late', 'صاروا متأخرين: 1', ['d']],
    ['joined', 'انضموا للدفعة: 1', ['d']],
    ['idle', 'توقفوا 7 أيام: 1', ['b']],
  ]);
  assertEquals(ch.totals, { entered: 1, finished: 1, done_items: 3, done_people: 2, submitted: 1, late_new: 1, joined: 1, idle_new: 1 });
  // لا سطر يحمل المنسحب
  assert(!ch.lines.some((l: Row) => l.ids.includes('x')));
});

Deno.test('حد «منذ»: ما وقع في لحظتها نفسها من النافذة السابقة، وما بعدها بجزء من الثانية من هذه، وما بعد لحظة القراءة ليس منها', () => {
  const at = '2026-11-19T10:00:00.000Z';
  const rows = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'done', { done_at: at }), it('t2', 'pending')]))]).members;
  const n = (since: string, now: string) => cohortChanges(rows, { since, now }).totals.done_items;
  assertEquals(n('2026-11-19T10:00:00.000Z', '2026-11-20T09:00:00Z'), 0);
  assertEquals(n('2026-11-19T09:59:59.999Z', '2026-11-20T09:00:00Z'), 1);
  assertEquals(n('2026-11-18T00:00:00Z', '2026-11-19T10:00:00.000Z'), 1);
  assertEquals(n('2026-11-18T00:00:00Z', '2026-11-19T09:59:59.999Z'), 0);
  // التاريخ بصيغة القاعدة (+00:00 وكسور الثانية) يُقرأ وقتًا لا نصًا
  const pg = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'done', { done_at: '2026-11-19T10:00:00.5+00:00' }), it('t2', 'pending')]))]).members;
  assertEquals(cohortChanges(pg, { since: '2026-11-19T10:00:00.400Z', now: NOW }).totals.done_items, 1);
  assertEquals(cohortChanges(pg, { since: '2026-11-19T10:00:00.600Z', now: NOW }).totals.done_items, 0);
  // «أمس» من منتصف ليل أمس بالرياض (21:00 UTC قبل يومين)، و«آخر زيارة» بلا زيارة سبعة أيام
  assertEquals(sinceFor('yesterday', { now: NOW }), '2026-11-18T21:00:00.000Z');
  assertEquals(sinceFor('week', { now: NOW }), '2026-11-13T09:00:00.000Z');
  assertEquals(sinceFor('visit', { visit: null, now: NOW }), '2026-11-13T09:00:00.000Z');
  assertEquals(sinceFor('visit', { visit: '2026-11-19T07:00:00Z', now: NOW }), '2026-11-19T07:00:00.000Z');
});

Deno.test('صار متأخرًا: غداة انقضاء المهلة بيوم UTC، ومن دخل مرحلة منقضية وهو متأخر قبلها تأخره متصل لا جديد', () => {
  // نافذة التدريب تنتهي 7 نوفمبر والمهلة 3 أيام: المتأخر من 11 نوفمبر 00:00 UTC
  const stay = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'pending')]))]).members[0];
  assertEquals([stay.late, stay.late_since], [true, '2026-11-11T00:00:00.000Z']);
  // قبل انقضاء المهلة بيوم ليس متأخرًا، وفي يومها متأخر جديد
  const d10 = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'pending')]))], new Date('2026-11-10T22:00:00Z')).members;
  assertEquals(d10[0].late, false);
  const d11 = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'pending')]))], new Date('2026-11-11T00:30:00Z')).members;
  assertEquals(cohortChanges(d11, { since: '2026-11-10T22:00:00Z', now: '2026-11-11T00:30:00Z' }).totals.late_new, 1);
  // وفي الغد لا يُعدّ جديدًا ثانية
  const d12 = roster([person('a', atTraining('2026-11-03T08:00:00Z', [it('t1', 'pending')]))], new Date('2026-11-12T00:30:00Z')).members;
  assertEquals(cohortChanges(d12, { since: '2026-11-11T00:30:00Z', now: '2026-11-12T00:30:00Z' }).totals.late_new, 0);

  const atApply = (trainingAt: string) => [stage('profile', 'done', [it('p1', 'done', { done_at: '2026-11-02T08:00:00Z' })]), stage('training', 'done', [it('t1', 'done', { done_at: trainingAt })]),
    stage('apply', 'active', [it('a1', 'pending')]), stage('report', 'locked', [it('r1', 'pending')])];
  // التطبيق مهلته تنقضي 16 نوفمبر. أتم التدريب يوم 19 (وكان متأخرًا فيه منذ 11): تأخره متصل منذ 11، فليس جديدًا منذ أمس
  const carried = roster([person('a', atApply('2026-11-19T12:00:00Z'))]).members;
  assertEquals([carried[0].late, carried[0].late_since], [true, '2026-11-11T00:00:00.000Z']);
  assertEquals(cohortChanges(carried, { since: '2026-11-19T00:00:00Z', now: NOW }).totals.late_new, 0);
  assertEquals(cohortChanges(carried, { since: '2026-11-19T00:00:00Z', now: NOW }).totals.entered, 1);
  // أتم التدريب في موعده يوم 6، ثم انقضت مهلة التطبيق وهو فيه: متأخر من 16 نوفمبر
  const fresh = roster([person('a', atApply('2026-11-06T12:00:00Z'))]).members;
  assertEquals(fresh[0].late_since, '2026-11-16T00:00:00.000Z');
  // بلا لحظات معلَّمة يبقى التأخر نفسه كما تحسبه الخريطة، وبدايته موعد انقضاء المهلة
  const bare = roster([person('a', [stage('profile', 'done', [it('p1', 'done')]), stage('training', 'active', [it('t1', 'pending')]), stage('apply', 'locked', [it('a1', 'pending')]), stage('report', 'locked', [it('r1', 'pending')])])]).members;
  assertEquals([bare[0].late, bare[0].late_since, bare[0].entered_at], [true, '2026-11-11T00:00:00.000Z', null]);
});

Deno.test('لحظة إتمام البند من جدوله: المكتمل بعدد لحظته لحظة العدد المتمم، وما لا تاريخ له لا يُخمَّن', () => {
  const t = { req: { r1: '2026-11-05T10:00:00Z' }, sub: { r9: '2026-11-07T10:00:00Z' }, video: { v1: '2026-11-06T10:00:00Z' }, ws: { s1: '2026-11-04T06:00:00Z', s2: '2026-11-10T06:00:00Z', s3: '2026-11-15T06:00:00Z' },
    coach: [{ requirement_id: 'c1', at: '2026-11-09T10:00:00Z' }], content: { i1: '2026-11-03T10:00:00Z', i2: '2026-11-08T10:00:00Z' }, quiz: { m1: '2026-11-02T10:00:00Z', m2: '2026-11-12T10:00:00Z' }, read: {},
    model: { mm: { submitted_at: '2026-11-13T10:00:00Z', reviewed_at: '2026-11-14T10:00:00Z' } }, lab: { l1: ['2026-11-01T10:00:00Z', '2026-11-16T10:00:00Z'] }, cap: { submitted_at: '2026-11-17T10:00:00Z', reviewed_at: null, approved_at: null },
    auto: { 'P-INFO': '2026-11-01T08:00:00Z' } };
  const done = (more: Row) => doneAt({ id: 'x', status: 'done', completed_at: null, ...more }, t);
  assertEquals(done({ id: 'r1' }), '2026-11-05T10:00:00Z');
  assertEquals(done({ completed_at: '2026-11-01T00:00:00Z', id: 'r1' }), '2026-11-01T00:00:00Z');
  assertEquals(done({ code: 'P-INFO', kind: 'auto' }), '2026-11-01T08:00:00Z');
  assertEquals(done({ code: 'T-360', kind: 'auto' }), null);
  assertEquals(done({ id: 'v1', kind: 'video', activity: { type: 'video', done: true } }), '2026-11-06T10:00:00Z');
  // حضر ثلاثًا والمطلوب اثنتان: اكتمل عند الثانية لا الثالثة
  const sessions = ['s1', 's2', 's3'].map((id) => ({ id, attended: true, ends_at: null }));
  assertEquals(done({ kind: 'workshop', activity: { total: 2, sessions } }), '2026-11-10T06:00:00Z');
  assertEquals(done({ id: 'c1', kind: 'coaching', activity: { total: 1, sessions: [] } }), '2026-11-09T10:00:00Z');
  assertEquals(done({ kind: 'curriculum', activity: { items: [{ id: 'i1', required: true, done: true }, { id: 'i2', required: true, done: true }] } }), '2026-11-08T10:00:00Z');
  assertEquals(done({ kind: 'reading', activity: { quiz: true, chapters: [{ id: 'm1' }, { id: 'm2' }] } }), '2026-11-12T10:00:00Z');
  assertEquals(done({ kind: 'model', activity: { model_id: 'mm', accept: 'reviewed' } }), '2026-11-14T10:00:00Z');
  assertEquals(done({ kind: 'model', activity: { model_id: 'mm', accept: 'submitted' } }), '2026-11-13T10:00:00Z');
  assertEquals(done({ kind: 'lab', activity: { item_id: 'l1', accept: 'mastery' } }), '2026-11-16T10:00:00Z');
  assertEquals(doneAt({ id: 'r1', status: 'pending' }, t), null);
  // التسليم المنتظر: وقته من عموده، وما سُلّم قبل العمود بلا وقت فلا يُعدّ جديدًا
  const j = annotateJourney([{ items: [{ id: 'r9', status: 'submitted' }, { id: 'r8', status: 'submitted' }, { id: 'mx', kind: 'model', status: 'pending', activity: { model_id: 'mm', status: 'submitted' } }] }], t);
  assertEquals(j[0].items.map((x: Row) => x.waiting_at), ['2026-11-07T10:00:00Z', '', '2026-11-13T10:00:00Z']);
});

Deno.test('وقت آخر زيارة: لا يتقدم بالقراءة، ويتقدم بعد العرض، ويبقى في الزيارة نفسها، و«اعتبرها مقروءة» تفرغه', () => {
  const t0 = Date.parse('2026-11-20T09:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  // أول مرة: لا صف، فلا «منذ» (النافذة الافتراضية)
  assertEquals(visitSince(null, t0), null);
  const r1 = visitAdvance(null, iso(t0), t0 + 2000);
  assertEquals(r1, { since_at: null, seen_at: iso(t0), touched_at: iso(t0 + 2000) });
  // تحديث الصفحة بعد عشر دقائق في الزيارة نفسها: «منذ» كما كان (لم يضع ما لم يُقرأ)، ولحظة القراءة تتقدم
  assertEquals(visitSince(r1, t0 + 10 * 60e3), null);
  const r2 = visitAdvance(r1, iso(t0 + 10 * 60e3), t0 + 10 * 60e3);
  assertEquals([r2.since_at, r2.seen_at], [null, iso(t0 + 10 * 60e3)]);
  // زيارة جديدة في الغد: «منذ» آخر لحظة قراءة في الزيارة السابقة، قبل العرض وبعده
  const t1 = t0 + DAY;
  assertEquals(visitSince(r2, t1), iso(t0 + 10 * 60e3));
  const r3 = visitAdvance(r2, iso(t1), t1 + 1000);
  assertEquals([r3.since_at, r3.seen_at], [iso(t0 + 10 * 60e3), iso(t1)]);
  // بعد العرض في الزيارة نفسها يبقى «منذ» كما عُرض، ولو أُعيد التحميل مرارًا
  assertEquals(visitSince(r3, t1 + 5 * 60e3), iso(t0 + 10 * 60e3));
  const r4 = visitAdvance(r3, iso(t1 + 5 * 60e3), t1 + 5 * 60e3);
  assertEquals(visitSince(r4, t1 + 20 * 60e3), iso(t0 + 10 * 60e3));
  // الزيارة تنتهي بانقطاع نصف ساعة عن آخر عرض
  assertEquals(visitSince(r4, t1 + 5 * 60e3 + VISIT_GAP_MS), iso(t1 + 5 * 60e3));
  // «اعتبرها مقروءة»: «منذ» لحظة القراءة المعروضة، في الزيارة نفسها وبعدها
  const r5 = visitRead(r4, iso(t1 + 6 * 60e3), t1 + 7 * 60e3);
  assertEquals(visitSince(r5, t1 + 8 * 60e3), iso(t1 + 6 * 60e3));
  assertEquals(visitSince(r5, t1 + DAY), iso(t1 + 6 * 60e3));
  // لحظة قراءة أقدم من المحفوظة (تبويب قديم) لا ترجع بالوقت إلى الوراء
  assertEquals(visitAdvance(r4, iso(t0), t1 + 9 * 60e3).seen_at, r4.seen_at);
});

Deno.test('اللقطة أعداد وحدها، وسطر الملخص وتنبيه المتأخرين منها', () => {
  const m = roster([
    person('a', atTraining('2026-11-19T08:00:00Z', [it('t1', 'done', { done_at: '2026-11-19T10:00:00Z' }), it('t2', 'submitted', { waiting_at: '' })])),
    person('d', [stage('profile', 'active', [it('p1', 'pending')]), stage('training', 'locked', [it('t1', 'pending')]), stage('apply', 'locked', [it('a1', 'pending')]), stage('report', 'locked', [it('r1', 'pending')])]),
    person('x', atTraining('2026-11-19T08:00:00Z', [it('t1', 'pending')]), { status: 'withdrawn' }),
  ]);
  const rows = m.members.map((r: Row) => ({ ...r, email: `${r.id}@example.sa`, last_active_at: r.id === 'a' ? '2026-11-20T08:00:00Z' : null }));
  const snap = snapshotOf(rows, m, { since: '2026-11-19T00:17:00Z', now: NOW });
  assertEquals(snap, { members: 2, finished: 0, late: 2, late_new: 0, waiting: 1, active_week: 1, done_items: 2, done_people: 1, entered: 1, joined: 0,
    stages: [{ key: 'profile', title: 'الملف الشخصي', here: 1, late: 1 }, { key: 'training', title: 'التدريب', here: 1, late: 1 }, { key: 'apply', title: 'التطبيق', here: 0, late: 0 }, { key: 'report', title: 'التقرير', here: 0, late: 0 }] });
  // لا اسم ولا معرّف ولا بريد في اللقطة
  const json = JSON.stringify(snap);
  for (const leak of ['"a"', '"d"', 'example.sa']) assert(!json.includes(leak), leak);
  assertEquals(digestLine([{ done_items: 12, late_new: 0 }, { done_items: 2, late_new: 2 }]), { done: 14, late: 2, text: '14 نشاطًا مكتملًا، متأخران جديدان' });
  assertEquals(digestLine([{ done_items: 0, late_new: 1 }])!.text, 'متأخر جديد واحد');
  assertEquals(digestLine([{ done_items: 0, late_new: 0 }]), null);
  assertEquals(lateAlertText('دفعة الخريف', { late_new: 5, late: 9 }), 'دفعة «دفعة الخريف»: 5 أعضاء صاروا متأخرين منذ أمس، والمتأخرون الآن 9');
  // لقطتان بينهما أيام (تعطلت المهمة): لا يقال «أمس»
  assertEquals(lateAlertText('د', { late_new: 1, late: 1, since_at: '2026-11-17T00:17:00Z', taken_at: '2026-11-20T00:17:00Z' }), 'دفعة «د»: عضو واحد صار متأخرًا منذ 3 أيام، والمتأخرون الآن 1');
  assertEquals(lateAlertText('د', { late_new: 1, late: 1, since_at: '2026-11-19T00:17:00Z', taken_at: '2026-11-20T00:17:00Z' }), 'دفعة «د»: عضو واحد صار متأخرًا منذ أمس، والمتأخرون الآن 1');
});

Deno.test('الملخص الأسبوعي يستحق الأحد 9:00 بالرياض ويبقى 48 ساعة، ولا يخرج إن ضاقت حصة البريد', () => {
  // 22 نوفمبر 2026 أحد
  assertEquals(weeklyDue(Date.parse('2026-11-22T05:59:00Z')).due, false);
  assertEquals(weeklyDue(Date.parse('2026-11-22T06:00:00Z')), { due: true, week: '2026-11-22', from: '2026-11-22T06:00:00.000Z' });
  assertEquals(weeklyDue(Date.parse('2026-11-24T05:59:00Z')), { due: true, week: '2026-11-22', from: '2026-11-22T06:00:00.000Z' });
  assertEquals(weeklyDue(Date.parse('2026-11-24T06:00:00Z')).due, false);
  // السبت 23:30 UTC أحد بالرياض (02:30) قبل الساعة التاسعة: لم يحن
  assertEquals(weeklyDue(Date.parse('2026-11-21T23:30:00Z')), { due: false, week: '2026-11-22', from: '2026-11-22T06:00:00.000Z' });
  const ok = (o: Row) => weeklyBudgetOk({ usage: { sent: 0, nonCode: 0 }, waiting: 0, cap: 80, reserve: 0.5, count: 2, ...o });
  assertEquals(ok({}), true);
  // نصيب غير الرموز 40، ونصفه 20 يُترك لبريد المشاركين
  assertEquals(ok({ usage: { sent: 30, nonCode: 18 } }), true);
  assertEquals(ok({ usage: { sent: 30, nonCode: 19 } }), false);
  assertEquals(ok({ waiting: 1 }), false);
  assertEquals(ok({ usage: null }), false);
  assertEquals(ok({ waiting: null }), false);
});

// ════════ 2. الخادم على قاعدة في الذاكرة ════════
// قاعدة صغيرة: تصفية eq وin وis وnot is null وgte وgt وlt وlte، وor تُقرأ بلا تصفية (الكود يصفّي ما يقرؤه)، والحقل المضمَّن
// (instruments.kind)، وrange وlimit وorder تنازلي لعمود، والإدراج بمفتاح مركب (23505)، والتحديث، وupsert بـonConflict.
// reads: اسم الجدول لكل استعلام قراءة. down: جدول تتعذر قراءته وكتابته (عطل عابر في القاعدة)
const KEYS: Record<string, string[]> = { cohort_snapshots: ['cohort_id', 'day'], admin_cohort_visits: ['admin_email', 'cohort_id'] };
function install(tables: Record<string, Row[]>, opts: { down?: Set<string> } = {}) {
  placeOrgMembers(tables);
  const reads: string[] = [];
  const writes: { table: string; kind: string; value: any }[] = [];
  const get = (r: Row, c: string) => c.split('.').reduce((x: any, k) => x?.[k], r);
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false, single = false, range: [number, number] | null = null, limit = Infinity, cols = '*', returning = false;
    let order: [string, boolean] | null = null;
    let op: { kind: string; value?: any; conflict?: string } = { kind: 'select' };
    const run = () => {
      if (opts.down?.has(table)) return { data: null, count: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      const rows = tables[table] || (tables[table] = []);
      const keys = KEYS[table] || ['id'];
      const same = (a: Row, b: Row) => keys.every((k) => String(a[k]) === String(b[k]));
      if (op.kind === 'insert' || op.kind === 'upsert') {
        const add = (Array.isArray(op.value) ? op.value : [op.value]).map((v: Row) => ({ created_at: new Date().toISOString(), ...structuredClone(v) }));
        for (const v of add) {
          const i = KEYS[table] ? rows.findIndex((r) => same(r, v)) : -1;
          if (i >= 0 && op.kind === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
          if (i >= 0) Object.assign(rows[i], v); else rows.push(v);
        }
        writes.push({ table, kind: op.kind, value: op.value });
        return { data: single ? add[0] : add, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === 'update') { hit.forEach((r) => Object.assign(r, structuredClone(op.value))); writes.push({ table, kind: 'update', value: op.value }); return { data: returning ? hit : null, error: null }; }
      if (op.kind === 'delete') { tables[table] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
      reads.push(table);
      if (head) return { data: null, count: hit.length, error: null };
      let out = order ? [...hit].sort((a, b) => String(a[order![0]] ?? '').localeCompare(String(b[order![0]] ?? '')) * (order![1] ? 1 : -1)) : hit;
      out = (range ? out.slice(range[0], range[1] + 1) : out).slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null, count: hit.length };
    };
    const cmp = (c: string, f: (x: number, y: number) => boolean, v: string) => { filters.push((r) => get(r, c) != null && f(Date.parse(String(get(r, c))) || 0, Date.parse(v) || 0)); return q; };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve().then(run).then(ok, bad);
        if (k === 'select') return (c?: string, o?: any) => { if (op.kind !== 'select') returning = true; else cols = c || '*'; if (o?.head) head = true; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (get(r, c) ?? null) === v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'not') return (c: string, o: string, v: unknown) => { if (o === 'is' && v === null) filters.push((r) => r[c] != null); return q; };
        if (k === 'gte') return (c: string, v: string) => cmp(c, (x, y) => x >= y, v);
        if (k === 'gt') return (c: string, v: string) => cmp(c, (x, y) => x > y, v);
        if (k === 'lte') return (c: string, v: string) => cmp(c, (x, y) => x <= y, v);
        if (k === 'lt') return (c: string, v: string) => cmp(c, (x, y) => x < y, v);
        if (k === 'order') return (c: string, o?: { ascending?: boolean }) => { if (table === 'cohort_snapshots') order = [c, o?.ascending !== false]; return q; };
        if (k === 'range') return (f: number, t: number) => { range = [f, t]; return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        if (k === 'insert' || k === 'update' || k === 'delete') return (v?: any) => { op = { kind: k, value: v }; return q; };
        if (k === 'upsert') return (v: any, o?: any) => { op = { kind: 'upsert', value: v, conflict: o?.onConflict }; return q; };
        return () => q;
      },
    });
    return q;
  };
  const saved = { from: (db as any).from, schema: (db as any).schema, pub: (publicDb as any).from };
  Object.assign(db as any, { from, schema: () => ({ from }) });
  (publicDb as any).from = from;
  NS.resetNotifySettings();
  return { tables, reads, writes, restore: () => { Object.assign(db as any, { from: saved.from, schema: saved.schema }); (publicDb as any).from = saved.pub; NS.resetNotifySettings(); } };
}

const ago = (hours: number, now = Date.now()) => new Date(now - hours * 36e5).toISOString();
const P = (id: string, full_name: string, more: Row = {}) => ({
  id, full_name, email: `${id}@example.sa`, phone: '+966551234567', job_title: 'مدير', organization_name: 'جهة', organization_id: 'org-a', status: 'enrolled',
  is_demo: false, is_test: false, created_at: '2025-01-01T08:00:00Z', profile_completed_at: '2025-01-02T08:00:00Z', last_login_at: ago(30), ...more,
});
const world = (): Record<string, Row[]> => ({
  participants: [
    P('sara', 'سارة العتيبي'), P('khalid', 'خالد الحربي'), P('reem', 'ريم الدوسري', { created_at: ago(5) }), P('majed', 'ماجد القحطاني', { status: 'withdrawn' }),
    // حساب العرض وحساب الاختبار: عملا اليوم كغيرهما، ولا يدخلان صفًا ولا سطرًا ولا عددًا
    P('demo', 'حساب العرض', { is_demo: true, organization_id: null }), P('tester', 'حساب اختبار', { is_test: true }),
  ],
  programs: [{ id: 'prog', is_default: true, name: 'برنامج القادة', final_eval: null }],
  cohorts: [
    { id: 'c1', name: 'دفعة الاختبار', is_default: false, organization_id: 'org-a', status: 'running', program_id: 'prog', starts_on: '2025-01-01', created_at: '2024-12-01' },
    { id: 'c9', name: 'دفعة مخطط لها', is_default: false, organization_id: 'org-z', status: 'planned', program_id: 'prog', starts_on: '2025-01-01', created_at: '2024-12-02' },
  ],
  enrollments: [{ participant_id: 'reem', cohort_id: 'c1', status: 'active', created_at: ago(5) }],
  journey_stages: [
    { program_id: 'prog', key: 'profile', sort: 1, title_ar: 'الملف الشخصي', phase: 'admission', duration_days: 0, active: true },
    { program_id: 'prog', key: 'training', sort: 2, title_ar: 'التدريب', phase: 'qualification', duration_days: 5, active: true },
    { program_id: 'prog', key: 'apply', sort: 3, title_ar: 'التطبيق', phase: 'qualification', duration_days: 5, active: true },
  ],
  stage_requirements: [
    { id: 'r-info', program_id: 'prog', stage_key: 'profile', code: 'P-INFO', kind: 'auto', sort: 1, title_ar: 'أكمل ملفك', active: true, required: true },
    { id: 'r-vid', program_id: 'prog', stage_key: 'training', code: 'T-VID', kind: 'video', sort: 1, title_ar: 'شاهد المقطع', active: true, required: true, config: { url: 'https://v.example/x.mp4' } },
    { id: 'r-ws', program_id: 'prog', stage_key: 'training', code: 'T-WS', kind: 'workshop', sort: 2, title_ar: 'احضر الورشة', active: true, required: true, config: { sessions_required: 1 } },
    { id: 'r-up', program_id: 'prog', stage_key: 'apply', code: 'A-UP', kind: 'upload', sort: 1, title_ar: 'ارفع خطة التطبيق', active: true, required: true, needs_review: true },
  ],
  // سارة: شاهدت المقطع قبل ساعتين وحضرت الورشة قبل ثلاث، فدخلت «التطبيق» قبل ساعتين، وسلّمت خطتها قبل ساعة
  // خالد: حضر الورشة قبل ثلاث ساعات ولم يشاهد المقطع. ريم: انضمت قبل خمس ساعات ولم تعمل شيئًا
  video_progress: [
    { participant_id: 'sara', requirement_id: 'r-vid', duration: 100, watched_seconds: 100, completed_at: ago(2) },
    { participant_id: 'demo', requirement_id: 'r-vid', duration: 100, watched_seconds: 100, completed_at: ago(2) },
    { participant_id: 'tester', requirement_id: 'r-vid', duration: 100, watched_seconds: 100, completed_at: ago(2) },
  ],
  workshop_sessions: [{ id: 'ws1', requirement_id: 'r-ws', cohort_id: 'c1', title_ar: 'ورشة اليوم الأول', starts_at: ago(4), ends_at: ago(2.5), active: true, mode: 'in_person' }],
  workshop_attendance: [
    { session_id: 'ws1', participant_id: 'sara', checked_in_at: ago(3), method: 'qr' }, { session_id: 'ws1', participant_id: 'khalid', checked_in_at: ago(3), method: 'qr' },
    { session_id: 'ws1', participant_id: 'tester', checked_in_at: ago(3), method: 'qr' },
  ],
  participant_requirements: [{ participant_id: 'sara', requirement_id: 'r-up', status: 'submitted', completed_at: null, submitted_at: ago(1) }],
  auth_sessions: [{ id: 's1', participant_id: 'sara', last_seen_at: ago(1) }],
  admin_cohort_visits: [], cohort_snapshots: [], audit_log: [], app_settings: [], mail_events: [], mail_queue: [],
});
const admin = { email: 'Owner@X.sa', role: 'admin' as const } as any;
const viewer = { email: 'viewer@x.sa', role: 'viewer' as const } as any;

Deno.test('admin.cohort-journey: صف العضو يحمل لحظاته من جداولها، والسطور منها، وحساب العرض والاختبار خارجها', async () => {
  const w = install(world());
  let res: any;
  try { res = await adminCohortJourney(admin, { cohort_id: 'c1' }); } finally { w.restore(); }
  assertEquals(res.roster.map((x: Row) => x.id).sort(), ['khalid', 'majed', 'reem', 'sara']);
  const sara = res.roster.find((x: Row) => x.id === 'sara');
  // دخلت «التطبيق» لحظة أتمت آخر بنود التدريب (المقطع، من video_progress)، لا من صف بند يدوي
  assertEquals([sara.stage, Date.parse(sara.entered_at)], ['التطبيق', Date.parse(w.tables.video_progress[0].completed_at)]);
  assertEquals(sara.done_at.length, 2);
  assertEquals(sara.waiting.map((x: string) => Date.parse(x)), [Date.parse(w.tables.participant_requirements[0].submitted_at)]);
  assertEquals(sara.ws.map((x: Row) => [x.id, x.title, Date.parse(x.at)]), [['ws1', 'ورشة اليوم الأول', Date.parse(w.tables.workshop_attendance[0].checked_in_at)]]);
  // ريم انضمت بصف إلحاقها
  assertEquals(Date.parse(res.roster.find((x: Row) => x.id === 'reem').joined_at), Date.parse(w.tables.enrollments[0].created_at));
  const ch = cohortChanges(res.roster, { since: ago(24), now: res.at, stages: res.journey_map.stages });
  assertEquals(ch.lines.map((l: Row) => [l.key, l.count, l.ids.slice().sort()]), [
    ['entered:apply', 1, ['sara']], ['done', 3, ['khalid', 'sara']], ['submitted', 1, ['sara']], ['attended:ws1', 2, ['khalid', 'sara']], ['joined', 1, ['reem']],
  ]);
  assertEquals(lineOf(ch, 'attended:ws1').text, 'حضروا «ورشة اليوم الأول»: 2 من 3');
  // حساب العرض وحساب الاختبار عملا مثلهم: لا صف ولا سطر ولا عدد
  const json = JSON.stringify([res, ch]);
  for (const leak of ['حساب العرض', 'حساب اختبار', 'demo@example.sa', 'tester@example.sa', '"demo"', '"tester"']) assert(!json.includes(leak), leak);
  // منذ ساعة ونصف: التسليم وحده
  assertEquals(cohortChanges(res.roster, { since: ago(1.5), now: res.at }).lines.map((l: Row) => l.key), ['submitted']);
  // الرد يحمل لحظة القراءة ووقت آخر زيارة، والقراءة وحدها لا تكتب زيارة
  assert(Math.abs(Date.parse(res.at) - Date.now()) < 60e3);
  assertEquals(res.visit, { since: null, first: true, stored: true });
  assertEquals(w.tables.admin_cohort_visits, []);
});

Deno.test('تعذّر القاعدة: التبويب يعمل ويقول إن وقت آخر زيارة تعذّرت قراءته، والحفظ واللقطة خطأ صريح لا نجاح صامت', async () => {
  const w = install(world(), { down: new Set(['admin_cohort_visits', 'cohort_snapshots']) });
  try {
    // القراءة: التبويب لا يسقط، والزيارة failed برسالتها (لا «غير محفوظ»)، فيعرض الشريط النافذة الافتراضية ويقول السبب
    const res: any = await adminCohortJourney(admin, { cohort_id: 'c1' });
    assertEquals(res.success, true);
    assertEquals(res.visit, { failed: true, message: 'تعذّرت قراءة وقت آخر زيارة، أعد المحاولة', since: null, first: false, stored: false });
    const ch = cohortChanges(res.roster, { since: sinceFor('visit', { visit: res.visit.since, now: res.at }), now: res.at });
    assertEquals(ch.lines.map((l: Row) => l.key), ['entered:apply', 'done', 'submitted', 'attended:ws1', 'joined']);
    // حفظ الزيارة وعلامة المقروء: خطأ صريح، لا success بلا حفظ
    for (const op of ['seen', 'read']) {
      const e = await assertRejects(() => adminCohortVisit(admin, { cohort_id: 'c1', at: res.at, op })) as any;
      assertEquals([e.status, e.code, e.message], [500, 'db_error', 'تعذّرت قراءة وقت آخر زيارة، أعد المحاولة']);
    }
    // اللقطة: المهمة الساعية تسجل الخطأ في ردها، ومن يقرأ اللقطة يُرمى له (المكتب يقول «تعذّرت قراءة»، والملخص يعيد المحاولة)
    const snap: any = await PU.cohortSnapshots();
    assertEquals([snap.taken, /statement timeout/.test(snap.error), 'ready' in snap], [0, true, false]);
    await assertRejects(() => PU.latestSnapshots(), Error, 'cohort_snapshots');
    await assertRejects(() => PU.cohortDigest(ago(24), ago(0)), Error, 'cohort_snapshots');
    const sunday = Date.parse('2026-11-22T06:20:00Z');
    CONFIG.alertEmail = 'owner@x.sa';
    await assertRejects(() => PU.cohortWeekly(sunday), Error, 'cohort_snapshots');
  } finally { CONFIG.alertEmail = ''; w.restore(); }
});

Deno.test('تعذّر حفظ الزيارة بعد قراءتها: خطأ صريح برسالة الحفظ', async () => {
  const w = install(world());
  const from = (db as any).from;
  // القراءة تمر والكتابة تتعذر
  (db as any).from = (t: string) => {
    const q = from(t);
    if (t !== 'admin_cohort_visits') return q;
    return new Proxy(q, { get: (o, k) => (k === 'upsert' ? () => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }) : (o as any)[k]) });
  };
  try {
    const e = await assertRejects(() => adminCohortVisit(admin, { cohort_id: 'c1', at: new Date().toISOString(), op: 'read' })) as any;
    assertEquals([e.status, e.code, e.message], [500, 'db_error', 'تعذّر حفظ وقت آخر زيارة، أعد المحاولة']);
    assertEquals(w.tables.admin_cohort_visits || [], []);
  } finally { (db as any).from = from; w.restore(); }
});

Deno.test('وقت التسليم يُكتب للبند المسلَّم وحده، وعند تعذّره لا يرمي ولا يمس التسليم', async () => {
  const { stampSubmitted } = await import('./cohort-times.ts');
  const tables = { participant_requirements: [{ participant_id: 'a', requirement_id: 'r1', status: 'submitted' }, { participant_id: 'a', requirement_id: 'r2', status: 'done' }, { participant_id: 'b', requirement_id: 'r1', status: 'submitted' }] };
  const w = install(structuredClone(tables));
  try {
    await stampSubmitted('a', 'r1', '2026-11-20T09:00:00Z');
    await stampSubmitted('a', 'r2', '2026-11-20T09:00:00Z');
    assertEquals(w.tables.participant_requirements.map((r) => r.submitted_at ?? null), ['2026-11-20T09:00:00Z', null, null]);
  } finally { w.restore(); }
  const old = install(structuredClone(tables), { down: new Set(['participant_requirements']) });
  try {
    await stampSubmitted('a', 'r1');
    assertEquals(old.tables.participant_requirements, tables.participant_requirements);
  } finally { old.restore(); }
  const src = await Deno.readTextFile(new URL('./participant.ts', import.meta.url));
  assert(src.includes("if (status === 'submitted') await stampSubmitted(p.id, r.id);"));
});

Deno.test('القراءة المشتقة بعدد الجداول لا بعدد الأعضاء: 300 عضو في 22 استعلامًا، ولا استعلام لكل عضو', async () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(3, '0')}`);
  const tables: Record<string, Row[]> = {
    video_progress: ids(300).map((id) => ({ participant_id: id, requirement_id: 'r-vid', completed_at: ago(2) })),
    workshop_attendance: ids(300).map((id) => ({ participant_id: id, session_id: 'ws1', checked_in_at: ago(3) })),
  };
  for (const [n, expected] of [[150, READS], [300, READS * 2], [301, READS * 3]] as [number, number][]) {
    const w = install(structuredClone(tables));
    try {
      const t = await completionTimes(ids(n));
      assertEquals(w.reads.length, expected, `${n} عضوًا`);
      assertEquals(Object.keys(t).length, n);
      assert(t.p000.video['r-vid'] && t.p000.ws.ws1);
    } finally { w.restore(); }
  }
  assertEquals(READS * 2, 22);
  // والدفعة كاملة بـ300 عضو: القراءة المشتقة تضيف على قراءة «المتابعة» القائمة 22 استعلامًا واستعلام الزيارة، أيًا كان العدد
  const big = world();
  big.participants = ids(300).map((id) => P(id, `عضو ${id}`));
  big.video_progress = ids(300).map((id) => ({ participant_id: id, requirement_id: 'r-vid', duration: 100, watched_seconds: 100, completed_at: ago(2) }));
  big.workshop_attendance = []; big.participant_requirements = []; big.auth_sessions = []; big.enrollments = [];
  const w = install(big);
  try {
    const res: any = await adminCohortJourney(admin, { cohort_id: 'c1' });
    assertEquals(res.roster.length, 300);
    const derived = ['content_progress', 'handbook_progress', 'reading_progress', 'lab_attempts'];
    // جداول لا يقرؤها من الدفعة إلا القراءة المشتقة: مرتان لكل منها (300 عضو في دفعتين من 150)
    for (const t of derived) assertEquals(w.reads.filter((x) => x === t).length, 2, t);
    assertEquals(w.reads.filter((x) => x === 'admin_cohort_visits').length, 1);
    assertEquals(cohortChanges(res.roster, { since: ago(24), now: res.at }).totals.done_people, 300);
  } finally { w.restore(); }
});

Deno.test('admin.cohort-visit: يتقدم بعد العرض لا بالقراءة، ولكل مدير صفه، ولحساب العرض فقط مثله، ولحظة غير صالحة تُرفض', async () => {
  const w = install(world());
  const t0 = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const row = (email: string) => w.tables.admin_cohort_visits.find((r) => r.admin_email === email) || null;
  try {
    // عرض أول: الصف يُكتب ببريد المدير بحروف صغيرة، و«منذ» ما زال فارغًا في هذه الزيارة
    assertEquals(await adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t0 - 5000), op: 'seen' }, t0), { success: true, since: null, stored: true });
    assertEquals([row('owner@x.sa')!.since_at, row('owner@x.sa')!.seen_at], [null, iso(t0 - 5000)]);
    // زيارة تالية بعد ساعتين: القراءة تعرض منذ آخر لحظة قراءة، ولا تغيّر الصف حتى يُعرض الشريط
    const t1 = t0 + 2 * 36e5;
    const read1: any = await adminCohortJourney(admin, { cohort_id: 'c1' });
    assertEquals(read1.visit.failed, undefined);
    const before = structuredClone(row('owner@x.sa'));
    await adminCohortJourney(admin, { cohort_id: 'c1' });
    assertEquals(row('owner@x.sa'), before);
    assertEquals((await adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t1 - 1000), op: 'seen' }, t1)).since, iso(t0 - 5000));
    // تحديث في الزيارة نفسها: «منذ» كما عُرض
    assertEquals((await adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t1 + 60e3), op: 'seen' }, t1 + 61e3)).since, iso(t0 - 5000));
    // «اعتبرها مقروءة»
    assertEquals((await adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t1 + 60e3), op: 'read' }, t1 + 90e3)).since, iso(t1 + 60e3));
    // مدير آخر (عرض فقط، بلا عامل ثانٍ): صفه هو، ولا يمس صف غيره
    assertEquals(await adminCohortVisit(viewer, { cohort_id: 'c1', at: iso(t1), op: 'seen' }, t1 + 1000), { success: true, since: null, stored: true });
    assertEquals(w.tables.admin_cohort_visits.length, 2);
    assertEquals(row('owner@x.sa')!.since_at, iso(t1 + 60e3));
    // لحظة من المستقبل أو أقدم من يوم أو بلا دفعة: تُرفض ولا يُكتب شيء
    await assertRejects(() => adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t1 + 36e5), op: 'seen' }, t1));
    await assertRejects(() => adminCohortVisit(admin, { cohort_id: 'c1', at: iso(t1 - 2 * DAY), op: 'seen' }, t1));
    await assertRejects(() => adminCohortVisit(admin, { cohort_id: '', at: iso(t1), op: 'seen' }, t1));
  } finally { w.restore(); }
});

Deno.test('اللقطة اليومية: صف لكل دفعة جارية في اليوم، أعداد بلا أسماء، ولا تتكرر بإعادة التشغيل، وتنبيه «نظرة عامة» منها', async () => {
  const w = install(world());
  const now = Date.now();
  // «إعادة التشغيل لاحقًا في اليوم نفسه»: ساعة، أو ما بقي من يوم UTC إن كان أقل، فلا يعبر الاختبار منتصف الليل في آخر ساعة من اليوم
  const later = Math.min(36e5, Date.parse(`${new Date(now).toISOString().slice(0, 10)}T23:59:59Z`) - now);
  try {
    assertEquals(await PU.cohortSnapshots(now), { taken: 1 });
    assertEquals(w.tables.cohort_snapshots.length, 1);
    const s = w.tables.cohort_snapshots[0];
    // الدفعة الجارية وحدها (المخطط لها بلا لقطة)، وحساب العرض والاختبار خارج كل عدد: الأعضاء ثلاثة
    assertEquals([s.cohort_id, s.day, s.members, s.done_items, s.done_people, s.entered, s.joined, s.waiting], ['c1', new Date(now).toISOString().slice(0, 10), 3, 3, 2, 1, 1, 1]);
    assertEquals(s.stages.map((x: Row) => [x.key, x.here]), [['profile', 0], ['training', 2], ['apply', 1]]);
    const json = JSON.stringify(s);
    for (const leak of ['sara', 'khalid', 'reem', 'سارة', 'example.sa', '+9665']) assert(!json.includes(leak), leak);
    // إعادة المهمة في الساعة التالية (أو تشغيلتان معًا): لا صف ثانٍ
    assertEquals(await PU.cohortSnapshots(now + later), { taken: 0 });
    assertEquals(w.tables.cohort_snapshots.length, 1);
    // تنبيه المتأخرين الجدد يقرأ اللقطة وحدها: لا استعلام للمشاركين ولا رحلة
    s.late_new = 2; s.late = 3;
    w.reads.length = 0;
    const snaps = await PU.latestSnapshots(now);
    assertEquals(snaps.map((x: Row) => [x.cohort_id, x.late, x.late_new, x.since_at]), [['c1', 3, 2, s.since_at]]);
    assertEquals(w.reads, ['cohort_snapshots']);
    const desk: any = await TD.today({}, { programs: async () => ({ cohorts: w.tables.cohorts, organizations: [], programs: [], desk: { member_of: {}, workshops: [] } }), snapshots: () => PU.latestSnapshots(now) });
    const alert = desk.alerts.find((a: Row) => a.kind === 'cohort_late');
    assertEquals([alert.text, alert.target], ['دفعة «دفعة الاختبار»: عضوان صارا متأخرين منذ أمس، والمتأخرون الآن 3', { tab: 'programs', id: 'c1', query: 'view=follow&show=late' }]);
    // لقطة الغد: «منذ» لقطة اليوم، فلا يُعدّ ما عُدّ فيها ثانية
    assertEquals(await PU.cohortSnapshots(now + DAY), { taken: 1 });
    const next = w.tables.cohort_snapshots.find((x) => x.day !== s.day)!;
    assertEquals([Date.parse(next.since_at), next.done_items, next.entered], [Date.parse(s.taken_at), 0, 0]);
  } finally { w.restore(); }
});

Deno.test('سطر الملخص اليومي: من لقطات نافذته، أعداد فقط، ولا يُعدّ مرتين، ويُطفأ من صفه، ولا سطر بلا جديد', async () => {
  const w = install(world());
  const until = '2026-11-20T06:17:00Z';
  const since = '2026-11-19T06:17:00Z';
  const snap = (cohort_id: string, taken_at: string, done_items: number, late_new: number) => ({ cohort_id, day: taken_at.slice(0, 10), taken_at, since_at: taken_at, done_items, late_new, late: late_new });
  w.tables.cohort_snapshots.push(snap('c1', '2026-11-20T00:17:00Z', 12, 2), snap('c2', '2026-11-20T00:18:00Z', 2, 0), snap('c1', '2026-11-19T00:17:00Z', 40, 9));
  try {
    const allowed = new Set<string>(RT.digestEvents(RT.DEFAULT_SETTINGS));
    assert(allowed.has('cohort_progress'));
    const { rows, errors } = await DG.digestRows(since, allowed, until);
    assertEquals(errors, []);
    // لقطة أمس خارج النافذة (عدّها ملخص أمس)
    assertEquals(rows, [{ key: 'cohort_progress', label: 'تقدم الدفعات', count: 0, text: '14 نشاطًا مكتملًا، متأخران جديدان' }]);
    const text = DG.digestTexts(rows).join('\n');
    assert(text.includes('• تقدم الدفعات: 14 نشاطًا مكتملًا، متأخران جديدان https://'), text);
    assert(text.includes('#/leaders/programs'));
    assert(DG.digestMail(rows, 'unconfigured').includes('14 نشاطًا مكتملًا، متأخران جديدان'));
    for (const leak of ['سارة', 'خالد', 'example.sa', 'دفعة الاختبار']) assert(!text.includes(leak), leak);
    // الملخص التالي يبدأ من نهاية هذا: لا يعدّ اللقطتين ثانية
    assertEquals((await DG.digestRows(until, allowed, '2026-11-20T12:00:00Z')).rows, []);
    // مطفأ من صفه في المركز، أو «هادئ»: لا سطر ولا قراءة
    const off = new Set<string>(RT.digestEvents({ preset: 'balanced', rows: { cohort_progress: { email: false, slack: false, digest: false } } }));
    assertEquals((await DG.digestRows(since, off, until)).rows, []);
    assertEquals(RT.digestEvents({ preset: 'quiet', rows: {} }).includes('cohort_progress'), false);
    // لا جديد: لا سطر
    w.tables.cohort_snapshots.splice(0, 2, snap('c1', '2026-11-20T00:17:00Z', 0, 0));
    assertEquals((await DG.digestRows(since, allowed, until)).rows, []);
  } finally { w.restore(); }
});

// ════════ 3. الملخص الأسبوعي بالبريد ════════
const SUNDAY = Date.parse('2026-11-22T06:20:00Z');   // الأحد 9:20 بالرياض
const weeklyWorld = () => {
  const t = world();
  // دفعة جارية ثانية، ولقطة اليوم لكل منهما (كما تلتقطها المهمة 03:17 بالرياض)
  t.cohorts.push({ id: 'c2', name: 'دفعة الربيع', is_default: false, organization_id: 'org-b', status: 'running', program_id: 'prog', starts_on: '2025-02-01', created_at: '2024-12-03' });
  const snap = (cohort_id: string, day: string, more: Row = {}) => ({ cohort_id, day, taken_at: `${day}T00:17:00Z`, since_at: `${day}T00:17:00Z`, members: 24, finished: 1, late: 3, late_new: 1, waiting: 2, active_week: 17,
    done_items: 5, done_people: 4, entered: 2, joined: 0, stages: [{ key: 'training', title: 'التدريب', here: 14, late: 2 }, { key: 'apply', title: 'التطبيق', here: 0, late: 0 }], weekly_sent_at: null, ...more });
  t.cohort_snapshots.push(snap('c1', '2026-11-22'), snap('c2', '2026-11-22'), snap('c1', '2026-11-21', { done_items: 7 }), snap('c9', '2026-11-22'));
  t.workshop_sessions = [{ id: 'w1', cohort_id: 'c1', active: true, starts_at: '2026-11-24T06:00:00Z', ends_at: '2026-11-24T10:00:00Z' }];
  return t;
};
async function weekly(tables: Record<string, Row[]>, now: number, fn: (calls: { url: string; body: any }[], w: ReturnType<typeof install>) => Promise<void>, net: { resendStatus?: number } = {}) {
  const w = install(tables);
  const keep = { key: CONFIG.resendKey, to: CONFIG.alertEmail };
  CONFIG.resendKey = 're_test'; CONFIG.alertEmail = 'owner@x.sa';
  try { await withNet((calls) => fn(calls, w), net); } finally { CONFIG.resendKey = keep.key; CONFIG.alertEmail = keep.to; w.restore(); }
  return now;
}

Deno.test('الملخص الأسبوعي: بريد لكل دفعة جارية يوم الأحد، أعداد فقط بلا اسم مشارك، ورابطه «المتابعة»', async () => {
  await weekly(weeklyWorld(), SUNDAY, async (calls, w) => {
    assertEquals(await PU.cohortWeekly(SUNDAY), { due: true, sent: 2 });
    const mails = resendCalls(calls);
    assertEquals(mails.map((c) => [c.body.to, c.body.subject]).sort(), [['owner@x.sa', 'الملخص الأسبوعي: دفعة الاختبار'], ['owner@x.sa', 'الملخص الأسبوعي: دفعة الربيع']].map(([to, s]) => [typeof mails[0].body.to === 'string' ? to : [to], s]));
    const html = String(mails.find((c) => c.body.subject.includes('الاختبار'))!.body.html);
    // الأعداد من اللقطة، والأنشطة مجموع لقطات الأسبوع (5 + 7)، والمرحلة الخالية لا تُذكر، وأقرب جلسة بتوقيت الرياض
    for (const part of ['الأعضاء', '24', 'نشطون هذا الأسبوع', '17', 'أنشطة مكتملة هذا الأسبوع', '12', 'في مرحلة التدريب', '14', 'متأخرون', 'ينتظرون قرارك', '#/leaders/programs/c1?view=follow', 'افتح المتابعة']) assert(html.includes(part), part);
    assert(!html.includes('في مرحلة التطبيق'));
    assert(/الثلاثاء/.test(html) && /9:00/.test(html), 'أقرب جلسة بتوقيت الرياض');
    // أعداد فقط: لا اسم مشارك ولا بريده ولا جواله في أي رسالة
    for (const m of mails) for (const leak of ['سارة', 'خالد', 'ريم', 'ماجد', 'example.sa', '+9665', 'حساب العرض', 'حساب اختبار']) assert(!JSON.stringify(m.body).includes(leak), leak);
    // بريد جماعي في سجل البريد بمرجعه، والعلامة على لقطة اليوم. الدفعة غير الجارية (c9) بلا بريد ولو كان لها لقطة
    assertEquals(w.tables.mail_events.map((e) => [e.kind, e.ref]).sort(), [['bulk', 'cohort-weekly:c1:2026-11-22'], ['bulk', 'cohort-weekly:c2:2026-11-22']]);
    assertEquals(w.tables.cohort_snapshots.filter((s) => s.weekly_sent_at).map((s) => `${s.cohort_id}:${s.day}`).sort(), ['c1:2026-11-22', 'c2:2026-11-22']);
  });
});

Deno.test('الملخص الأسبوعي: لا يتكرر بإعادة المهمة في الساعة التالية ولا في اليوم التالي، ولا يخرج في غير موعده', async () => {
  await weekly(weeklyWorld(), SUNDAY, async (calls, w) => {
    // السبت، والأحد قبل التاسعة بالرياض: لم يحن
    assertEquals(await PU.cohortWeekly(Date.parse('2026-11-21T10:00:00Z')), { due: false });
    assertEquals(await PU.cohortWeekly(Date.parse('2026-11-22T05:20:00Z')), { due: false });
    assertEquals(resendCalls(calls).length, 0);
    // تشغيلتان معًا في الساعة نفسها: المطالبة ذرّية على صف اللقطة، فبريد واحد لكل دفعة
    const both = await Promise.all([PU.cohortWeekly(SUNDAY), PU.cohortWeekly(SUNDAY)]);
    assertEquals(both.reduce((n, r: any) => n + (r.sent || 0), 0), 2);
    assertEquals(resendCalls(calls).length, 2);
    assertEquals(await PU.cohortWeekly(SUNDAY + 36e5), { due: true, sent: 0 });
    // الاثنين بلقطة جديدة: أُرسل هذا الأسبوع فلا يُعاد
    w.tables.cohort_snapshots.push({ ...w.tables.cohort_snapshots[0], day: '2026-11-23', taken_at: '2026-11-23T00:17:00Z', weekly_sent_at: null });
    assertEquals(await PU.cohortWeekly(SUNDAY + 20 * 36e5), { due: true, sent: 0 });
    assertEquals(resendCalls(calls).length, 2);
    // الثلاثاء بعد انقضاء 48 ساعة: خارج الموعد
    assertEquals(await PU.cohortWeekly(Date.parse('2026-11-24T06:20:00Z')), { due: false });
  });
});

Deno.test('الملخص الأسبوعي: يُطفأ من صفه في مركز الإشعارات أو بالإعداد «هادئ»، ويعمل افتراضيًا', async () => {
  assertEquals(RT.route('cohort_weekly', RT.DEFAULT_SETTINGS), { email: true, slack: false, digest: false, log: true, tier: 'info', locked: false });
  assertEquals(RT.route('cohort_weekly', { preset: 'all', rows: {} }).email, true);
  assertEquals(RT.route('cohort_weekly', { preset: 'quiet', rows: {} }).email, false);
  // حال Slack لا تغيّره: بريد لا بديل عنه ولا قناة أخرى له
  assertEquals(RT.route('cohort_weekly', RT.DEFAULT_SETTINGS, 'failed').email, true);
  assertEquals(RT.rowError('cohort_weekly', { email: false, slack: true, digest: false }), '«الملخص الأسبوعي لكل دفعة جارية» لا يُرسل عبر Slack فوري');
  // إطفاؤه يُحفظ صفًا (يخالف افتراضه)، وتشغيله لا يُحفظ
  assertEquals(RT.compactRows('balanced', { cohort_weekly: { email: false, slack: false, digest: false } }), { cohort_weekly: { email: false, slack: false, digest: false } });
  assertEquals(RT.compactRows('balanced', { cohort_weekly: { email: true, slack: false, digest: false } }), {});
  const off = weeklyWorld();
  off.app_settings.push({ key: 'notifications', value: { preset: 'balanced', rows: { cohort_weekly: { email: false, slack: false, digest: false } } } });
  await weekly(off, SUNDAY, async (calls, w) => {
    assertEquals(await PU.cohortWeekly(SUNDAY), { due: true, sent: 0, off: true });
    assertEquals(resendCalls(calls).length, 0);
    assertEquals(w.tables.cohort_snapshots.filter((s) => s.weekly_sent_at).length, 0);
  });
});

Deno.test('الملخص الأسبوعي: يتنحى لبريد المشاركين حين تضيق الحصة، ويُعاد في الساعة التالية، وتعذّر الإرسال يرد المطالبة', async () => {
  // في الطابور بريد ينتظر (تذكير مشاركين محجوب بالحصة): لا يخرج الملخص قبله
  const queued = weeklyWorld();
  queued.mail_queue.push({ id: 'q1', kind: 'bulk', to_email: 'p@example.sa', sent_at: null, gave_up_at: null });
  await weekly(queued, SUNDAY, async (calls, w) => {
    assertEquals(await PU.cohortWeekly(SUNDAY), { due: true, sent: 0, deferred: 2 });
    assertEquals(resendCalls(calls).length, 0);
    assertEquals(w.tables.cohort_snapshots.filter((s) => s.weekly_sent_at).length, 0);
    // فرغ الطابور: يخرج في الساعة التالية
    w.tables.mail_queue[0].sent_at = new Date(SUNDAY).toISOString();
    assertEquals(await PU.cohortWeekly(SUNDAY + 36e5), { due: true, sent: 2 });
  });
  // استُهلك نصف نصيب غير الرموز (السقف 80، النصيب 40، ونصفه 20): يؤجَّل ولا مطالبة
  const busy = weeklyWorld();
  const today = new Date().toISOString();
  busy.mail_events = Array.from({ length: 19 }, (_, i) => ({ id: `e${i}`, kind: 'bulk', status: 'sent', created_at: today }));
  await weekly(busy, SUNDAY, async (calls, w) => {
    assertEquals(await PU.cohortWeekly(SUNDAY), { due: true, sent: 0, deferred: 2 });
    assertEquals(resendCalls(calls).length, 0);
    w.tables.mail_events.length = 18;
    assertEquals(await PU.cohortWeekly(SUNDAY), { due: true, sent: 2 });
  });
  // المزوّد يرفض: المطالبة تُرد، فيُعاد في الساعة التالية ولا يُعلَّم مرسلًا
  await weekly(weeklyWorld(), SUNDAY, async (calls, w) => {
    const r: any = await PU.cohortWeekly(SUNDAY);
    assertEquals([r.sent, r.failed], [0, 2]);
    assertEquals(w.tables.cohort_snapshots.filter((s) => s.weekly_sent_at).length, 0);
    assert(resendCalls(calls).length >= 2);
  }, { resendStatus: 500 });
});
