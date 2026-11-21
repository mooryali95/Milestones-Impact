// وسم الورشة: إلزامية أو اختيارية (قرار المالك 2026-11-21، القاعدة في optional.js). هنا الخادم كله بقاعدة في الذاكرة:
// الورشة الاختيارية خارج كل عدّ (عدّاد النشاط، ورقة المتابعة، أقرب جلسة وجاهزية الدفعة)، والإلزامية داخلها. قبل ترحيل العمود
// «اختيارية» مرفوضة برسالتها و«إلزامية» تُحفظ كما كانت. تغيير الوسم لاحقًا بمعاينة بالأرقام وتأكيد وسجل، ومن كان التغيير
// سيسحب اكتماله يبقى مكتملًا. والمسار الموجّه: ورشة في مرحلة بلا نشاط حضور تنشئ نشاط «ورش إضافية» بنسخة تُثبَّت عليها الدفعة،
// بحراسه. وتذكير الجلسة الجماعية الحضورية يذكر مكانها.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const V = await import('./activities.ts');
const { CONFIG, Fail } = await import('./core.ts');
const { journeyFor } = await import('./participant.ts');
const { extraWorkshopReq } = await import('./programs.ts');
const { resetOptionalReady } = await import('./workshop-optional.ts');
const { resetGroupsReady } = await import('./coaching-groups.ts');
const { programSnapshot } = await import('./logic.js');
const { nextSessionAt } = await import('./today-desk.js');
const { sessionsFor } = await import('./cohort-setup.js');
const { journeyMap } = await import('./journey-map.js');
const { countingImpactAr } = await import('./optional.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(880001), COHORT = U(880002), V1 = U(880003), ORG = U(880004);
const REQ_W = U(880010), REQ_A = U(880011), REQ_F = U(880012), D1 = U(880020), D2 = U(880021);
const ADMIN = { email: 'a@example.sa' };
const NOW = Date.now();
const DAY = 864e5;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

// ثلاث مراحل: التدريب (حضور يومين)، التطبيق (بند يدوي، بلا نشاط حضور)، الختام (بند يدوي)
// سارة أتمت التدريب والتطبيق. فهد حضر يومًا واحدًا. نورة أتمت التدريب وتقف في التطبيق
function world(o: { migrated?: boolean } = {}) {
  resetOptionalReady();
  const migrated = o.migrated !== false;
  const who = (n: number, name: string) => ({ id: U(880100 + n), full_name: name, email: `o${n}@example.sa`, organization_id: ORG, organization_name: 'جهة', status: 'enrolled', is_demo: false, is_test: false, profile_completed_at: '2026-10-01T08:00:00Z' });
  const ps = [who(1, 'سارة الأحمد'), who(2, 'فهد العمري'), who(3, 'نورة السالم')];
  const stages = [
    { program_id: PROG, key: 'training', title_ar: 'التدريب', sort: 1, active: true, duration_days: 7 },
    { program_id: PROG, key: 'apply', title_ar: 'التطبيق', sort: 2, active: true, duration_days: 7 },
    { program_id: PROG, key: 'final', title_ar: 'الختام', sort: 3, active: true, duration_days: 7 },
  ];
  const reqs = [
    { id: REQ_W, program_id: PROG, stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr', sessions_required: 2 }, active: true },
    { id: REQ_A, program_id: PROG, stage_key: 'apply', code: 'A-DO', kind: 'manual', dimension: null, level: null, sort: 1, required: true, title_ar: 'طبّق في عملك', active: true },
    { id: REQ_F, program_id: PROG, stage_key: 'final', code: 'F-UP', kind: 'manual', dimension: null, level: null, sort: 1, required: true, title_ar: 'ارفع تقريرك', active: true },
  ];
  const session = (id: string, title: string, at: number, extra: Row = {}) => ({ id, requirement_id: REQ_W, cohort_id: COHORT, title_ar: title, mode: 'in_person', location_ar: 'القاعة', join_url: null, active: true, secret: 's'.repeat(32),
    starts_at: iso(at), ends_at: iso(at + 72e5), invited_at: null, reminded_day_at: null, reminded_hour_at: null, expert_id: null, ...(migrated ? { optional: false } : {}), ...extra });
  const tables: Record<string, Row[]> = {
    participants: ps,
    programs: [{ id: PROG, name: 'برنامج القادة', is_default: true, archived_at: null }],
    program_versions: [{ id: V1, program_id: PROG, number: 1, label: 'النسخة 1', data: programSnapshot(stages, reqs), created_at: '2026-10-01T00:00:00Z' }],
    cohorts: [{ id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: PROG, program_version_id: V1, starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {}, schedule: {}, hidden_requirements: [] }],
    enrollments: [],
    placements: ps.flatMap((p) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }))),
    journey_stages: stages, stage_requirements: reqs,
    workshop_sessions: [session(D1, 'اليوم 1', -6 * DAY), session(D2, 'اليوم 2', -4 * DAY)],
    workshop_attendance: [
      { session_id: D1, participant_id: ps[0].id, method: 'qr' }, { session_id: D2, participant_id: ps[0].id, method: 'qr' },
      { session_id: D1, participant_id: ps[1].id, method: 'qr' },
      { session_id: D1, participant_id: ps[2].id, method: 'qr' }, { session_id: D2, participant_id: ps[2].id, method: 'qr' },
    ],
    participant_requirements: [{ participant_id: ps[0].id, requirement_id: REQ_A, status: 'done', completed_at: iso(-2 * DAY) }],
    experts: [], cohort_experts: [], audit_log: [], mail_events: [], mail_queue: [],
  };
  // قبل الترحيل: كل قراءة أو كتابة تسمي العمود تُرفض كما يرفضها Postgres
  const f = installFake(tables, migrated ? {} : {
    fail: (table, op) => (table === 'workshop_sessions' && ((op.kind === 'select' && /\boptional\b/.test(op.cols || '')) || (op.value && 'optional' in op.value))
      ? { code: '42703', message: 'column workshop_sessions.optional does not exist' } : null),
  });
  return { ps, tables, f };
}
type W = ReturnType<typeof world>;
const newDay = (extra: Row = {}) => ({ requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'ورشة التفاوض', mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null, starts_at: iso(3 * DAY), ends_at: iso(3 * DAY + 6 * 36e5), active: true, ...extra });
const rowOf = (w: W, id: string) => w.tables.workshop_sessions.find((s) => s.id === id)!;
const fails = async (fn: () => Promise<unknown>) => { const e = await assertRejects(fn, Fail) as any; return e; };
const stageOf = async (p: Row, key: string) => { const j: any = await journeyFor(p, { lite: true }); const st = j.journey.find((s: Row) => s.key === key); return { st, progress: j.progress, journey: j.journey }; };
const itemOf = (st: Row, id: string) => st.items.find((i: Row) => i.id === id);
const attend = (w: W, session: string, n: number) => w.tables.workshop_attendance.push({ session_id: session, participant_id: w.ps[n].id, method: 'qr' });

Deno.test('الورشة الاختيارية تُحفظ بوسمها ولا تدخل عدًّا، والإلزامية تُحسب لمن ينقصه يوم (القرار 6 باقٍ)', async () => {
  const w = world();
  try {
    const before = await stageOf(w.ps[1], 'training');
    assertEquals([itemOf(before.st, REQ_W).activity.count, itemOf(before.st, REQ_W).activity.total, before.st.status], [1, 2, 'active']);
    const o: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'optional', title_ar: 'لقاء اختياري', starts_at: iso(-2 * DAY), ends_at: iso(-2 * DAY + 72e5) }) });
    assertEquals([o.success, rowOf(w, o.id).optional, 'impact' in o], [true, true, false]);
    // فهد يحضر الاختيارية: عدّاده وتقدمه ومرحلته كما كانت، والجلسة ظاهرة له بوسمها وحضوره فيها مسجل
    attend(w, o.id, 1);
    const after = await stageOf(w.ps[1], 'training');
    const act = itemOf(after.st, REQ_W).activity;
    assertEquals([act.count, act.total, act.done, after.st.status, after.progress], [1, 2, false, 'active', before.progress]);
    const seen = act.sessions.find((s: Row) => s.id === o.id);
    assertEquals([seen.optional, seen.attended], [true, true]);
    // ورقة المتابعة: «حضر 1 من 2» بلا الاختيارية، وليست «آخر ورشة لم يحضرها» لأحد
    const map: any = journeyMap({ stages: after.journey.map((s: Row) => ({ key: s.key, title_ar: s.title_ar, sort: s.sort })), people: [{ id: w.ps[1].id, name: 'فهد', status: 'enrolled', journey: after.journey, milestones: [], dates: [] }], roster: true });
    assertEquals(map.members[0].attendance, { count: 1, total: 2 });
    // أقرب جلسة وجاهزية الدفعة: الاختيارية ليست جلسة للدفعة
    const soon: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'optional', title_ar: 'لقاء قادم' }) });
    const rows = w.tables.workshop_sessions;
    assertEquals(nextSessionAt({ id: COHORT }, { workshops: rows, now: NOW }), null);
    assertEquals(sessionsFor({ id: COHORT }, rows.filter((s) => s.id === soon.id), NOW), 0);
    // اللوحة تحمل الوسم وجاهزية العمود، وبوابة المدرب تعلّم الاختيارية
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals([c.optional_ready, c.sessions.find((s: Row) => s.id === o.id).optional, c.sessions.find((s: Row) => s.id === D1).optional], [true, true, false]);
    assertEquals(((await V.overview()) as any).optional_ready, true);
    // والإلزامية الإضافية: تُحسب لفهد حين يحضرها ولا تزيد المطلوب
    const m: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'mandatory', title_ar: 'يوم تعويضي', starts_at: iso(-1 * DAY), ends_at: iso(-1 * DAY + 72e5) }) });
    assertEquals(rowOf(w, m.id).optional, false);
    attend(w, m.id, 1);
    const made = await stageOf(w.ps[1], 'training');
    assertEquals([itemOf(made.st, REQ_W).activity.count, itemOf(made.st, REQ_W).activity.total, made.st.status], [2, 2, 'done']);
    // وطلب بلا وسم (لوحة أقدم): إلزامية كما كانت كل ورشة قبل القرار
    const legacy: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'من لوحة أقدم' }) });
    assertEquals(rowOf(w, legacy.id).optional, false);
  } finally { w.f.restore(); }
});

Deno.test('قبل ترحيل العمود: «اختيارية» مرفوضة برسالتها ولا تُكتب جلسة، و«إلزامية» تُحفظ كما كانت، والقراءات تعمل', async () => {
  const w = world({ migrated: false });
  try {
    const n = w.tables.workshop_sessions.length;
    const e = await fails(() => V.workshopSave(ADMIN, { row: newDay({ counting: 'optional' }) }));
    assertEquals([e.code, e.status, e.message.includes('غير مفعّلة بعد')], ['optional_not_ready', 409, true]);
    assertEquals(w.tables.workshop_sessions.length, n);
    const m: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'mandatory' }) });
    assertEquals([m.success, 'optional' in rowOf(w, m.id)], [true, false]);
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals([c.optional_ready, c.sessions.length], [false, 3]);
    assertEquals(((await V.overview()) as any).optional_ready, false);
    // رحلة المشارك كما كانت: كل جلسة تُعد
    const st = await stageOf(w.ps[0], 'training');
    assertEquals([itemOf(st.st, REQ_W).activity.count, st.st.status], [2, 'done']);
    // والترحيل يُلتقط حين يُطبق: «غير موجود» لا تُحفظ
    w.f.restore();
    const again = world();
    try { assertEquals(((await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] })) as any).optional_ready, true); } finally { again.f.restore(); }
  } finally { w.f.restore(); }
});

Deno.test('تغيير الوسم لاحقًا: معاينة بالأرقام بلا كتابة، ثم تأكيد، ومن كان سيُسحب اكتماله يبقى مكتملًا، وسجل بالأرقام', async () => {
  const w = world();
  try {
    const edit = { ...newDay(), id: D2, title_ar: 'اليوم 2', starts_at: rowOf(w, D2).starts_at, ends_at: rowOf(w, D2).ends_at, location_ar: 'القاعة' };
    // المعاينة: اليوم 2 حضره سارة ونورة وبه اكتمل نشاطهما. جعله اختياريًا كان سيسحب اكتمالهما: يُحفظ لهما. فهد لا يتغير له شيء
    const writes = w.f.writes.length;
    const pv: any = await V.workshopSave(ADMIN, { row: { ...edit, counting: 'optional' }, preview: true });
    assertEquals([pv.preview, pv.changed, pv.counting], [true, true, 'optional']);
    assertEquals(pv.impact, { members: 3, preserved: 2, required_of: 0, completes: 0, progress_up: 0, progress_down: 0 });
    assertEquals([w.f.writes.length, rowOf(w, D2).optional], [writes, false]);
    assert(countingImpactAr(pv.impact, 'optional').some((x: string) => x.includes('(مشاركان)') && x.includes('يبقى اكتماله محفوظًا')));
    // بلا تأكيد: مرفوض ومعه الأثر، ولا كتابة
    const e = await fails(() => V.workshopSave(ADMIN, { row: { ...edit, counting: 'optional' } }));
    assertEquals([e.code, e.status, e.extra.impact.preserved, rowOf(w, D2).optional], ['counting_confirm', 409, 2, false]);
    // بالتأكيد
    const before = await Promise.all(w.ps.map((p) => stageOf(p, 'training')));
    const r: any = await V.workshopSave(ADMIN, { row: { ...edit, counting: 'optional' }, counting_confirm: true });
    assertEquals([r.success, rowOf(w, D2).optional, r.impact.preserved], [true, true, 2]);
    const kept = w.tables.participant_requirements.filter((x) => x.requirement_id === REQ_W);
    assertEquals(kept.map((x) => [x.participant_id, x.status, x.note, x.completed_at, x.reviewed_by]).sort(), [w.ps[0].id, w.ps[2].id].map((id) => [id, 'done', V.PRESERVE_NOTE, null, ADMIN.email]).sort());
    const after = await Promise.all(w.ps.map((p) => stageOf(p, 'training')));
    // سارة ونورة: المرحلة مكتملة والتقدم كما كان، وعدّاد الحضور يقول الحقيقة (1 من 2). فهد كما كان
    assertEquals(after.map((x) => [x.st.status, x.progress]), before.map((x) => [x.st.status, x.progress]));
    assertEquals(after.map((x) => itemOf(x.st, REQ_W).activity.count), [1, 1, 1]);
    assertEquals(after.map((x) => itemOf(x.st, REQ_W).status), ['done', 'pending', 'done']);
    const log = w.tables.audit_log.filter((x) => x.action === 'workshop.counting');
    assertEquals(log.length, 1);
    assertEquals([log[0].before, log[0].after.counting, log[0].after.preserved, log[0].after.preserved_written, log[0].after.members, log[0].after.preserved_ids.length], [{ counting: 'mandatory' }, 'optional', 2, 2, 3, 2]);
    // العودة إلى إلزامية: يُحسب من جديد، ولا صف حفظ مكرر، وحفظ بلا تغيير وسم لا يسأل ولا يسجل
    const back: any = await V.workshopSave(ADMIN, { row: { ...edit, counting: 'mandatory' }, preview: true });
    assertEquals([back.changed, back.impact.preserved], [true, 0]);
    await V.workshopSave(ADMIN, { row: { ...edit, counting: 'mandatory' }, counting_confirm: true });
    assertEquals([rowOf(w, D2).optional, w.tables.participant_requirements.filter((x) => x.requirement_id === REQ_W).length], [false, 2]);
    await V.workshopSave(ADMIN, { row: { ...edit, counting: 'mandatory', title_ar: 'اليوم الثاني' } });
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.counting').length, 2);
    // جلسة عامة (لكل الدفعات): وسمها لا يتغير في الحفظ
    rowOf(w, D1).cohort_id = null;
    const g = await fails(() => V.workshopSave(ADMIN, { row: { ...edit, id: D1, cohort_id: '', counting: 'optional' }, counting_confirm: true }));
    assertEquals(g.code, 'counting_general');
  } finally { w.f.restore(); }
});

Deno.test('المسار الموجّه: ورشة إلزامية في مرحلة بلا نشاط حضور. المعاينة لا تكتب، والحفظ ينشئ النشاط بنسخة، ومن أتم المرحلة يبقى مكتملًا', async () => {
  const w = world();
  try {
    const guided = (extra: Row = {}) => { const { requirement_id: _r, ...row } = newDay({ title_ar: 'ورشة التطبيق', stage_key: 'apply', ...extra }); return row; };
    const n = { reqs: w.tables.stage_requirements.length, versions: w.tables.program_versions.length, sessions: w.tables.workshop_sessions.length, writes: w.f.writes.length };
    // المعاينة: سارة أتمت التطبيق فيُحفظ لها، وفهد ونورة تصير مطلوبة منهما. لا شيء يُكتب
    const pv: any = await V.workshopSave(ADMIN, { row: guided({ counting: 'mandatory' }), preview: true });
    assertEquals([pv.preview, pv.guided, pv.impact.members, pv.impact.preserved, pv.impact.required_of], [true, true, 3, 1, 2]);
    assertEquals([w.tables.stage_requirements.length, w.tables.program_versions.length, w.tables.workshop_sessions.length, w.f.writes.length], [n.reqs, n.versions, n.sessions, n.writes]);
    const before = await Promise.all(w.ps.map((p) => stageOf(p, 'apply')));
    assertEquals(before.map((x) => x.st.status), ['done', 'locked', 'active']);
    // الحفظ
    const r: any = await V.workshopSave(ADMIN, { row: guided({ counting: 'mandatory' }) });
    const req = w.tables.stage_requirements.find((x) => x.stage_key === 'apply' && x.kind === 'workshop')!;
    assertEquals([req.code, req.required, req.config.each, req.title_ar], ['W-EXTRA-1', true, true, 'ورش إضافية']);
    assertEquals([rowOf(w, r.id).requirement_id, rowOf(w, r.id).optional, r.version_created.number, r.impact.preserved], [req.id, false, 2, 1]);
    // نسخة جديدة فيها النشاط، والدفعة مثبتة عليها، والسجل يقول من أين
    const v2 = w.tables.program_versions.find((v) => v.number === 2)!;
    assertEquals([w.tables.cohorts[0].program_version_id, v2.data.requirements.some((x: Row) => x.id === req.id)], [v2.id, true]);
    assertEquals(w.tables.audit_log.filter((x) => ['program.version', 'cohort.upgrade', 'requirement.create'].includes(x.action)).map((x) => x.after.auto), ['workshop.extra', 'workshop.extra', 'workshop.extra']);
    // سارة: التطبيق مكتمل والختام مفتوح كما كانا. نورة: الورشة صارت مطلوبة منها (1 من 2). فهد: ما زال في التدريب
    const after = await Promise.all(w.ps.map((p) => stageOf(p, 'apply')));
    assertEquals(after.map((x) => x.st.status), ['done', 'locked', 'active']);
    assertEquals([after[0].progress, (await stageOf(w.ps[0], 'final')).st.status], [before[0].progress, 'active']);
    assertEquals([after[2].st.done, after[2].st.total, itemOf(after[2].st, req.id).required], [0, 2, true]);
    assertEquals(w.tables.participant_requirements.filter((x) => x.requirement_id === req.id).map((x) => [x.participant_id, x.status, x.note]), [[w.ps[0].id, 'done', V.PRESERVE_NOTE]]);
    // نورة تنجز البند وتحضر الورشة: تكتمل مرحلتها
    w.tables.participant_requirements.push({ participant_id: w.ps[2].id, requirement_id: REQ_A, status: 'done' });
    assertEquals((await stageOf(w.ps[2], 'apply')).st.status, 'active');
    attend(w, r.id, 2);
    assertEquals((await stageOf(w.ps[2], 'apply')).st.status, 'done');
    // ورشة إلزامية ثانية في النشاط نفسه (برقم متطلبه): ترفع المطلوب، فنورة التي أتمت تُحفظ، والمعاينة تقول ذلك
    const second: any = await V.workshopSave(ADMIN, { row: newDay({ requirement_id: req.id, counting: 'mandatory', title_ar: 'ورشة ثانية' }), preview: true });
    assertEquals([second.impact.preserved, second.impact.required_of], [1, 0]);
    const s2: any = await V.workshopSave(ADMIN, { row: newDay({ requirement_id: req.id, counting: 'mandatory', title_ar: 'ورشة ثانية' }) });
    assertEquals((await stageOf(w.ps[2], 'apply')).st.status, 'done');
    assertEquals(itemOf((await stageOf(w.ps[2], 'apply')).st, req.id).activity.total, 2);
    // جعلها اختيارية ينقص المطلوب ولا يسحب من أحد شيئًا
    const flip: any = await V.workshopSave(ADMIN, { row: { ...newDay({ requirement_id: req.id, title_ar: 'ورشة ثانية' }), id: s2.id, counting: 'optional' }, counting_confirm: true });
    assertEquals([flip.impact.preserved, itemOf((await stageOf(w.ps[1], 'apply')).st, req.id).activity.total], [0, 1]);
    // وورشة عامة (بلا دفعة) لا تدخل هذا النشاط
    assertEquals((await fails(() => V.workshopSave(ADMIN, { row: newDay({ requirement_id: req.id, cohort_id: '', counting: 'mandatory' }) }))).code, 'each_needs_cohort');
    // ولا نشاط ثانٍ ولا نسخة ثالثة: المرحلة صار فيها نشاطها
    assertEquals([w.tables.stage_requirements.filter((x) => x.config?.each).length, w.tables.program_versions.length], [1, 2]);
  } finally { w.f.restore(); }
});

Deno.test('المسار الموجّه بورشة اختيارية: النشاط خامد، فلا يتغير تقدم أحد ولا اكتماله ولا استبانته', async () => {
  const w = world();
  try {
    const before = await Promise.all(w.ps.map(async (p) => { const j: any = await journeyFor(p, { lite: true }); return [j.progress, j.journey.map((s: Row) => [s.status, s.done, s.total])]; }));
    const { requirement_id: _r, ...row } = newDay({ title_ar: 'لقاء مفتوح', stage_key: 'apply', counting: 'optional' });
    const pv: any = await V.workshopSave(ADMIN, { row, preview: true });
    assertEquals([pv.impact, pv.guided], [null, true]);
    const r: any = await V.workshopSave(ADMIN, { row });
    assertEquals([r.success, rowOf(w, r.id).optional, 'impact' in r, w.tables.participant_requirements.length], [true, true, false, 1]);
    attend(w, r.id, 2);
    const after = await Promise.all(w.ps.map(async (p) => { const j: any = await journeyFor(p, { lite: true }); return [j.progress, j.journey.map((s: Row) => [s.status, s.done, s.total])]; }));
    assertEquals(after, before);
    const req = w.tables.stage_requirements.find((x) => x.config?.each)!;
    const it = itemOf((await stageOf(w.ps[2], 'apply')).st, req.id);
    assertEquals([it.required, it.activity.total, it.activity.sessions[0].optional, it.activity.sessions[0].attended], [false, 0, true, true]);
    // ثم إلزامية في النشاط نفسه بعد أن صار في رحلة الدفعة: تمر بالمعاينة نفسها
    const m: any = await V.workshopSave(ADMIN, { row: newDay({ requirement_id: req.id, counting: 'mandatory', title_ar: 'ورشة إلزامية' }), preview: true });
    assertEquals([m.impact.preserved, m.impact.required_of], [1, 2]);
  } finally { w.f.restore(); }
});

Deno.test('حراس المسار الموجّه: دفعة على نسخة أقدم، ومسودة برنامج فيها تعديل آخر، ومرحلة الملف، ومرحلة فيها نشاط حضور، وطلب معاد', async () => {
  const w = world();
  try {
    const call = (stage: string) => extraWorkshopReq(ADMIN as any, COHORT, stage, { create: true });
    assertEquals((await fails(() => call('training'))).code, 'stage_has_attendance');
    assertEquals((await fails(() => call('nope'))).code, 'stage_missing');
    w.tables.journey_stages.push({ program_id: PROG, key: 'profile', title_ar: 'الملف', sort: 0, active: true });
    w.tables.program_versions[0].data.stages.unshift({ key: 'profile', title_ar: 'الملف', sort: 0, active: true });
    assertEquals((await fails(() => call('profile'))).code, 'stage_gate');
    // مسودة البرنامج فيها تعديل لم يُحفظ نسخة: لا يُنشر مع الورشة
    const title = w.tables.stage_requirements[1].title_ar;
    w.tables.stage_requirements[1].title_ar = 'عنوان عُدّل في المسودة';
    assertEquals([(await fails(() => call('apply'))).code, w.tables.stage_requirements.length, w.tables.program_versions.length], ['program_draft', 3, 1]);
    w.tables.stage_requirements[1].title_ar = title;
    // الدفعة على نسخة أقدم من برنامجها: تُرقّى أولًا بمعاينتها
    w.tables.program_versions.push({ id: U(880009), program_id: PROG, number: 2, label: 'أحدث', data: w.tables.program_versions[0].data });
    assertEquals((await fails(() => call('apply'))).code, 'cohort_behind');
    w.tables.program_versions.pop();
    // قراءة بلا إنشاء
    assertEquals((await extraWorkshopReq(ADMIN as any, COHORT, 'apply')).req, null);
    // طلب انقطع بعد إضافة النشاط وقبل حفظ نسخته: المعاد يكمل ولا ينشئ ثانيًا
    w.tables.stage_requirements.push({ id: U(880099), program_id: PROG, stage_key: 'apply', code: 'W-EXTRA-1', kind: 'workshop', required: true, active: true, sort: 2, title_ar: 'ورش إضافية', config: { each: true, sessions_required: 1, verify: 'qr' } });
    const g = await call('apply');
    assertEquals([g.req.id, w.tables.stage_requirements.filter((x) => x.config?.each).length, g.created?.number, w.tables.cohorts[0].program_version_id === g.created?.id], [U(880099), 1, 2, true]);
    // وبعدها هو نشاط المرحلة: يُعاد كما هو بلا نسخة جديدة
    const again = await call('apply');
    assertEquals([again.req.id, again.created, w.tables.program_versions.length], [U(880099), undefined, 2]);
    // والورشة بلا دفعة لا تمر من المسار الموجّه
    assertEquals((await fails(() => V.workshopSave(ADMIN, { row: { title_ar: 'ورشة', mode: 'in_person', stage_key: 'final', cohort_id: '', counting: 'mandatory' } }))).code, 'guided_needs_cohort');
  } finally { w.f.restore(); }
});

Deno.test('إعادة ورشة إلزامية ملغاة في نشاط الورش الإضافية تحفظ اكتمال من أتم قبلها', async () => {
  const w = world();
  try {
    const { requirement_id: _r, ...row } = newDay({ title_ar: 'ورشة ملغاة', stage_key: 'final', counting: 'mandatory', active: false });
    const r: any = await V.workshopSave(ADMIN, { row });
    const req = w.tables.stage_requirements.find((x) => x.config?.each)!;
    // ملغاة: النشاط خامد. سارة تتم الختام
    w.tables.participant_requirements.push({ participant_id: w.ps[0].id, requirement_id: REQ_F, status: 'done' });
    assertEquals((await stageOf(w.ps[0], 'final')).st.status, 'done');
    await V.workshopSave(ADMIN, { row: { ...newDay({ requirement_id: req.id, title_ar: 'ورشة ملغاة' }), id: r.id, active: true } });
    assertEquals((await stageOf(w.ps[0], 'final')).st.status, 'done');
    assertEquals(w.tables.participant_requirements.filter((x) => x.requirement_id === req.id).map((x) => x.participant_id), [w.ps[0].id]);
  } finally { w.f.restore(); }
});

async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}

Deno.test('دعوة الورشة الاختيارية تقول في عنوانها إنها اختيارية، والإلزامية كما كانت', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const o: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'optional', title_ar: 'لقاء الخبراء' }), invite: true });
      assertEquals(o.invite.sent, 3);
      assert(resendCalls(calls).every((c) => String(c.body.html).includes('لقاء الخبراء (اختيارية)')));
      const before = resendCalls(calls).length;
      await V.workshopSave(ADMIN, { row: newDay({ counting: 'mandatory', title_ar: 'يوم إلزامي', starts_at: iso(5 * DAY), ends_at: iso(5 * DAY + 72e5) }), invite: true });
      assert(resendCalls(calls).slice(before).every((c) => String(c.body.html).includes('يوم إلزامي') && !String(c.body.html).includes('(اختيارية)')));
    });
  } finally { w.f.restore(); }
});

Deno.test('تذكير الجلسة قبل يوم: الجماعية الحضورية بمكانها وبلا رابط، وما لم يُكتب مكانه يُقال، وعن بعد والفردية كما كانتا', async () => {
  resetGroupsReady();
  const w = world();
  try {
    const G_IN = U(880201), G_TBD = U(880202), G_ON = U(880203);
    const at = iso(DAY);
    const group = (id: string, mode: string, location: string | null) => ({ id, cohort_id: COHORT, requirement_id: REQ_A, expert_id: null, title_ar: 'جلسة جماعية', starts_at: at, ends_at: iso(DAY + 36e5), mode, location_ar: location, join_url: mode === 'online' ? 'https://meet.example/x' : null, status: 'scheduled' });
    w.tables.coaching_groups = [group(G_IN, 'in_person', 'الرياض، قاعة الأثر'), group(G_TBD, 'in_person', null), group(G_ON, 'online', null)];
    const row = (n: number, gid: string | null, join: string | null) => ({ id: U(880300 + n), participant_id: w.ps[n % 3].id, requirement_id: REQ_A, status: 'booked', starts_at: at, ends_at: iso(DAY + 36e5), reminded_at: null, join_url: join, group_id: gid,
      participants: { full_name: w.ps[n % 3].full_name, email: `r${n}@example.sa`, is_test: false }, experts: { full_name: 'د. منى القحطاني' } });
    w.tables.coaching_sessions = [row(0, G_IN, null), row(1, G_TBD, null), row(2, G_ON, 'https://meet.example/x'), row(3, null, 'https://meet.example/one')];
    await withMail(async (calls) => {
      assertEquals(await V.sessionReminders(), 4);
      const by = Object.fromEntries(resendCalls(calls).map((c) => [[c.body.to].flat()[0], String(c.body.html)]));
      assert(by['r0@example.sa'].includes('المكان') && by['r0@example.sa'].includes('الرياض، قاعة الأثر') && !by['r0@example.sa'].includes('meet.example'));
      assert(by['r1@example.sa'].includes('المكان') && by['r1@example.sa'].includes(V.GROUP_PLACE_TBD_AR));
      assert(!by['r2@example.sa'].includes('المكان') && by['r2@example.sa'].includes('https://meet.example/x'));
      assert(!by['r3@example.sa'].includes('المكان') && by['r3@example.sa'].includes('https://meet.example/one'));
      // ملف التقويم للحضورية يحمل المكان
      const ics = new TextDecoder().decode(Uint8Array.from(atob(resendCalls(calls).find((c) => [c.body.to].flat()[0] === 'r0@example.sa')!.body.attachments[0].content), (ch) => ch.charCodeAt(0)));
      assert(ics.includes('الرياض'));
    });
  } finally { w.f.restore(); }
});
