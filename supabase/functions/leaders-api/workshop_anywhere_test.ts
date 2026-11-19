// الورشة من أي مكان (تصور تشغيل الدفعة 2026-11-19، المرحلة 4): الجلسة المضافة بنقرة على الخط الزمني تمر بـadmin.workshop-save
// نفسه، فهي جلسة حقيقية في كل مكان. هنا: المدرب المسمى (من خبراء دفعة الجلسة وحدهم، الترحيل 20261119130000 وقبله)،
// و«أرسل الدعوة عند الحفظ» وإشعار التغيير (بلا تكرار، بلا حساب العرض ولا حسابات الاختبار، وبحصة البريد)، وأن الجلسة الجديدة
// تظهر في كل ما يقرأ الجلسات، وأن الورشة الإضافية تُحسب لمن ينقصه يوم ولا تزيد المطلوب (القرار 6). بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const V = await import('./activities.ts');
const { CONFIG, Fail, MAIL_GALLERY } = await import('./core.ts');
const { journeyTimeline, outsideSessions, timelineAxis } = await import('./journey-timeline.js');
const { nextSessionAt } = await import('./today-desk.js');
const { workshopStatus, qrCode, qrToken, qrWindow } = await import('./logic.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(770001), COHORT = U(770002), OTHER = U(770003), REQ_W = U(770004), DAY1 = U(770006);
const ADVISOR = U(770011), TEAM = U(770012), ELSEWHERE = U(770013), PAUSED = U(770014);
const ADMIN = { email: 'a@example.sa' };
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const DAY = 864e5;
const LEVELS = { milestone: 'intermediate', impact: 'intermediate', leadership: 'intermediate' };

function world({ premigration = false } = {}) {
  const who = (n: number, org: string | null, extra: Row = {}) => ({ id: U(770100 + n), full_name: `مشارك ${n}`, email: `w${n}@example.sa`, organization_id: org, organization_name: 'جهة', status: 'enrolled', is_demo: false, is_test: false, ...extra });
  // 1 و2 في دفعة الجهة، 3 حساب اختبار فيها، 4 منسحب منها، 5 في دفعة أخرى، 6 حساب العرض ملحق بالدفعة
  const ps = [who(1, ORG), who(2, ORG), who(3, ORG, { is_test: true }), who(4, ORG, { status: 'withdrawn' }), who(5, null), who(6, null, { is_demo: true, email: 'demo@example.sa' })];
  const placed = (p: Row) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }));
  const expert = (id: string, name: string, extra: Row = {}) => ({ id, full_name: name, email: `${id.slice(-4)}@x.sa`, status: 'active', roles: ['coach'], ...extra });
  const tables: Record<string, Row[]> = {
    participants: ps,
    cohorts: [
      { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {}, advisor_expert_id: ADVISOR },
      { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02', delivery: {}, advisor_expert_id: ELSEWHERE },
    ],
    enrollments: [
      { participant_id: ps[4].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[5].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    placements: ps.flatMap(placed),
    experts: [expert(ADVISOR, 'د. منى القحطاني'), expert(TEAM, 'أ. خالد العتيبي'), expert(ELSEWHERE, 'مدرب دفعة أخرى'), expert(PAUSED, 'خبير موقوف', { status: 'suspended' })],
    cohort_experts: [{ cohort_id: COHORT, expert_id: TEAM }, { cohort_id: COHORT, expert_id: PAUSED }],
    journey_stages: [{ program_id: 'prog', key: 'training', title_ar: 'التدريب', sort: 1, active: true, duration_days: 7 }],
    stage_requirements: [{ id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr', sessions_required: 2 }, active: true }],
    workshop_sessions: [
      { id: DAY1, requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'القاعة', join_url: null, active: true, secret: 's'.repeat(32), starts_at: iso(-2 * DAY), ends_at: iso(-2 * DAY + 72e5), invited_at: null, reminded_day_at: null, reminded_hour_at: null, ...(premigration ? {} : { expert_id: null }) },
    ],
    workshop_attendance: [],
    audit_log: [], mail_events: [], mail_queue: [],
  };
  // قبل الترحيل 20261119130000: العمود expert_id غير موجود، فقراءته بالاسم وكتابته يرفضهما PostgREST كما في الإنتاج
  const f = installFake(tables, {
    fail: (t, op) => {
      if (t !== 'workshop_sessions' || !premigration) return null;
      if (op.kind === 'select' && /\bexpert_id\b/.test(op.cols || '')) return { code: '42703', message: 'column workshop_sessions.expert_id does not exist' };
      if ((op.kind === 'insert' || op.kind === 'update') && op.value && 'expert_id' in op.value) return { code: 'PGRST204', message: "Could not find the 'expert_id' column of 'workshop_sessions' in the schema cache" };
      return null;
    },
  });
  return { ps, tables, f };
}
type W = ReturnType<typeof world>;
// يوم يُضاف من الخط: بعد ثلاثة أيام، ست ساعات، لدفعة الجهة
const newDay = (extra: Row = {}) => ({ requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'ورشة التفاوض', mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null, starts_at: iso(3 * DAY), ends_at: iso(3 * DAY + 6 * 36e5), active: true, ...extra });
const rowOf = (w: W, id: string) => w.tables.workshop_sessions.find((s) => s.id === id)!;
const code = async (fn: () => Promise<unknown>) => { const e = await assertRejects(fn, Fail) as any; return [e.code, e.status]; };
async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, cap = 100) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: cap, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}
const to = (calls: { url: string; body: any }[]) => resendCalls(calls).map((c) => [c.body.to].flat()[0]).sort();
const ics = (c: { body: any }) => atob(c.body.attachments[0].content);

Deno.test('المدرب: يُحفظ من خبراء دفعة الجلسة، ويراه المشارك «مع فلان»، وتظهر الجلسة للمدرب في بوابته باسمه', async () => {
  const w = world();
  try {
    assertEquals(await V.trainerReady(), true);
    // قائمة النموذج: مستشار الدفعة وعضو فريقها ممن يخدمون في الرحلة، لا الموقوف ولا خبير دفعة أخرى
    const c0: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals([c0.trainer_ready, c0.trainers.map((e: Row) => e.id).sort()], [true, [ADVISOR, TEAM].sort()]);
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TEAM }) });
    assertEquals([r.success, r.trainer_skipped, rowOf(w, r.id).expert_id], [true, undefined, TEAM]);
    // بطاقة المرحلة و«الحضور والجلسات»: الاسم مع الصف
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals(c.sessions.find((s: Row) => s.id === r.id).trainer, 'أ. خالد العتيبي');
    const o: any = await V.overview();
    assertEquals([o.trainer_ready, o.workshops.find((s: Row) => s.id === r.id).trainer, o.cohort_trainers[COHORT].length, o.cohort_trainers[OTHER].map((e: Row) => e.id)], [true, 'أ. خالد العتيبي', 2, [ELSEWHERE]]);
    // رحلة المشارك: الاسم وحده، بلا معرّف الخبير ولا سر الجلسة
    const mine: any = await V.evidenceFor(w.ps[0], w.tables.stage_requirements, LEVELS, true, COHORT);
    const seen = mine[REQ_W].sessions.find((s: Row) => s.id === r.id);
    assertEquals([seen.trainer, 'expert_id' in seen, 'secret' in seen], ['أ. خالد العتيبي', false, false]);
    assertEquals('trainer' in mine[REQ_W].sessions.find((s: Row) => s.id === DAY1), false);
    // بوابة الخبير: جلسته «mine»، وزميله في الدفعة يراها باسم مدربها
    const own: any = await V.expertWorkshops({ id: TEAM, email: 't@x.sa' });
    assertEquals(own.sessions.find((s: Row) => s.id === r.id).mine, true);
    const peer: any = await V.expertWorkshops({ id: ADVISOR, email: 'adv@x.sa' });
    const p = peer.sessions.find((s: Row) => s.id === r.id);
    assertEquals([p.mine, p.trainer], [undefined, 'أ. خالد العتيبي']);
    // التحرير بلا حقل المدرب يبقيه، والفارغ يمسحه
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, title_ar: 'ورشة التفاوض 2' } });
    assertEquals(rowOf(w, r.id).expert_id, TEAM);
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, expert_id: null } });
    assertEquals(rowOf(w, r.id).expert_id, null);
  } finally { w.f.restore(); }
});

Deno.test('المدرب من دفعة أخرى أو موقوف أو لجلسة عامة يُرفض، ولا تُكتب جلسة', async () => {
  const w = world();
  try {
    const n = w.tables.workshop_sessions.length;
    assertEquals(await code(() => V.workshopSave(ADMIN, { row: newDay({ expert_id: ELSEWHERE }) })), ['trainer_not_in_cohort', 400]);
    assertEquals(await code(() => V.workshopSave(ADMIN, { row: newDay({ expert_id: PAUSED }) })), ['trainer_not_in_cohort', 400]);
    assertEquals(await code(() => V.workshopSave(ADMIN, { row: newDay({ expert_id: U(999) }) })), ['trainer_not_in_cohort', 400]);
    assertEquals(await code(() => V.workshopSave(ADMIN, { row: newDay({ cohort_id: '', expert_id: ADVISOR }) })), ['trainer_needs_cohort', 400]);
    assertEquals(w.tables.workshop_sessions.length, n);
    // التحرير كذلك: جلسة قائمة لا تأخذ مدرب دفعة أخرى
    assertEquals(await code(() => V.workshopSave(ADMIN, { row: { ...newDay(), id: DAY1, expert_id: ELSEWHERE } })), ['trainer_not_in_cohort', 400]);
    assertEquals(rowOf(w, DAY1).expert_id, null);
    // نص ليس معرّفًا يُحفظ فارغًا لا خطأ
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: 'x' }) });
    assertEquals(rowOf(w, r.id).expert_id, null);
    // نقل جلسة بمدربها إلى دفعة ليس من خبرائها يفرغ المدرب، وصلاحية ورقة الحضور تبقى بتكليف الدفعة لا بالاسم
    const t: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TEAM }) });
    await V.workshopSave(ADMIN, { row: { ...newDay({ cohort_id: OTHER }), id: t.id } });
    assertEquals([rowOf(w, t.id).cohort_id, rowOf(w, t.id).expert_id], [OTHER, null]);
    rowOf(w, t.id).expert_id = TEAM;   // اسم بقي على جلسة دفعة لم يعد مكلفًا بها: لا ورقة ولا رمز
    assertEquals(await code(() => V.expertWorkshopAttendance({ id: TEAM, email: 't@x.sa' }, { id: t.id })), ['not_assigned', 403]);
    assertEquals(await code(() => V.expertWorkshopMarkBulk({ id: TEAM, email: 't@x.sa' }, { session_id: t.id, present: [w.ps[4].id], reason: 'x' })), ['not_assigned', 403]);
  } finally { w.f.restore(); }
});

Deno.test('قبل ترحيل المدرب: الحقل مخفي، والحفظ بمدرب ينجح بلاه ويقول إنه لم يُحفظ، وكل ما سواه يعمل', async () => {
  const w = world({ premigration: true });
  try {
    assertEquals(await V.trainerReady(), false);
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TEAM, capacity: 20 }) });
    assertEquals([r.success, r.trainer_skipped, r.capacity_skipped], [true, true, undefined]);
    const row = rowOf(w, r.id);
    assertEquals(['expert_id' in row, row.capacity, row.cohort_id, row.title_ar], [false, 20, COHORT, 'ورشة التفاوض']);
    // النموذج قبل الترحيل لا يرسل الحقل أصلًا: لا إعادة ولا علامة. والفارغ يُسقط بلا تنبيه
    const r2: any = await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, title_ar: 'ورشة' } });
    assertEquals([r2.success, r2.trainer_skipped, row.title_ar], [true, undefined, 'ورشة']);
    const r3: any = await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, expert_id: null } });
    assertEquals([r3.success, r3.trainer_skipped], [true, undefined]);
    // القراءات كلها بلا العمود: بطاقة المرحلة، «الحضور والجلسات»، رحلة المشارك، بوابة الخبير
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals([c.trainer_ready, c.trainers, c.sessions.find((s: Row) => s.id === r.id).trainer], [false, [], null]);
    const o: any = await V.overview();
    assertEquals([o.trainer_ready, o.cohort_trainers], [false, {}]);
    const mine: any = await V.evidenceFor(w.ps[0], w.tables.stage_requirements, LEVELS, true, COHORT);
    assert(mine[REQ_W].sessions.some((s: Row) => s.id === r.id && !('trainer' in s)));
    const xp: any = await V.expertWorkshops({ id: TEAM, email: 't@x.sa' });
    assert(xp.sessions.some((s: Row) => s.id === r.id && !s.mine && !s.trainer));
    // والدعوة عند الحفظ تعمل قبل الترحيل
    await withMail(async (calls) => {
      const r4: any = await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id }, invite: true });
      assertEquals([r4.invite.sent, to(calls)], [2, [w.ps[0].email, w.ps[1].email]]);
    });
  } finally { w.f.restore(); }
});

Deno.test('الدعوة عند الحفظ: لأعضاء الدفعة الفعليين وحدهم بملف تقويم واسم المدرب، مرة واحدة، ولا بريد بلا اختيار صريح', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      // بلا الاختيار: حفظ بلا أي بريد
      const quiet: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بلا دعوة' }) });
      assertEquals([quiet.invite, resendCalls(calls).length, rowOf(w, quiet.id).invited_at ?? null], [undefined, 0, null]);
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: ADVISOR }), invite: true });
      assertEquals(r.invite, { sent: 2, failed: 0, total: 2 });
      // لا حساب العرض ولا حساب الاختبار ولا المنسحب ولا عضو دفعة أخرى
      assertEquals(to(calls), [w.ps[0].email, w.ps[1].email]);
      const first = resendCalls(calls)[0];
      assertEquals(first.body.subject, 'دعوة: جلستك التدريبية');
      assert(first.body.html.includes('ورشة التفاوض') && first.body.html.includes('قاعة الملك فهد') && first.body.html.includes('د. منى القحطاني'), 'الجلسة والمكان والمدرب في الدعوة');
      assert(ics(first).includes(`UID:${r.id}@`) && !ics(first).includes('SEQUENCE'), 'ملف تقويم الدعوة');
      assert(rowOf(w, r.id).invited_at, 'خُتمت الدعوة');
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.invite').map((x) => x.after), [{ sent: 2, failed: 0, total: 2, on_save: true }]);
      // إعادة الحفظ نفسه بالاختيار نفسه (إعادة محاولة بلا مفتاح): لا رسالة ثانية
      const again: any = await V.workshopSave(ADMIN, { row: { ...newDay({ expert_id: ADVISOR }), id: r.id }, invite: true });
      assertEquals([again.invite, resendCalls(calls).length], [{ skipped: 'invited' }, 2]);
      // طلبان معًا: الختم يُحجز لواحد
      const two: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'متزامن' }) });
      const both: any[] = await Promise.all([1, 2].map(() => V.workshopSave(ADMIN, { row: { ...newDay({ title_ar: 'متزامن' }), id: two.id }, invite: true })));
      assertEquals([both.filter((x) => x.invite.sent === 2).length, both.filter((x) => x.invite.skipped === 'invited').length, resendCalls(calls).length], [1, 1, 4]);
    });
  } finally { w.f.restore(); }
});

Deno.test('الدعوة عند الحفظ لا تخرج لجلسة عامة ولا غير مؤرخة ولا ملغاة ولا منتهية، وتعذّر البريد يحرر الختم ولا يُسقط الحفظ', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const skip = async (row: Row) => ((await V.workshopSave(ADMIN, { row, invite: true })) as any).invite;
      assertEquals(await skip(newDay({ cohort_id: '' })), { skipped: 'general' });
      assertEquals(await skip(newDay({ starts_at: null, ends_at: null })), { skipped: 'undated' });
      assertEquals(await skip(newDay({ active: false })), { skipped: 'inactive' });
      assertEquals(await skip(newDay({ starts_at: iso(-3 * DAY), ends_at: iso(-3 * DAY + 36e5) })), { skipped: 'ended' });
      assertEquals(resendCalls(calls).length, 0);
    });
    // المزوّد معطل: الجلسة محفوظة، والنتيجة تقول كم تعذّر، والختم محرر فتُرسل لاحقًا
    const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
    Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100, alertEmail: '' });
    try {
      await withNet(async () => {
        const r: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'والبريد معطل' }), invite: true });
        assertEquals([r.success, r.invite, rowOf(w, r.id).invited_at ?? null], [true, { sent: 0, failed: 2, total: 2 }, null]);
      }, { resendStatus: 500 });
    } finally { Object.assign(CONFIG, saved); }
  } finally { w.f.restore(); }
});

Deno.test('حصة البريد: الدعوة عند الحفظ لا تتجاوز نصيب اليوم، وما لم يخرج يُعدّ متعذرًا', async () => {
  const w = world();
  try {
    // السقف 80 ونصيب غير الرموز 40، وأُرسل منه 39: تمر رسالة واحدة
    w.tables.mail_events = Array.from({ length: 39 }, () => ({ id: crypto.randomUUID(), kind: 'notify', status: 'sent', source: 'leaders-api', created_at: new Date(Date.now() - 6e4).toISOString() }));
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      assertEquals([r.invite, resendCalls(calls).length], [{ sent: 1, failed: 1, total: 2 }, 1]);
    }, 80);
  } finally { w.f.restore(); }
});

Deno.test('إشعار التغيير: لمن دُعي حين يتغير الموعد أو المكان وباختيار صريح، بملف تقويم محدَّث، ولا يتكرر بإعادة الحفظ', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TEAM }), invite: true });
      const row = rowOf(w, r.id);
      Object.assign(row, { reminded_day_at: iso(-36e5), reminded_hour_at: null });
      const n0 = resendCalls(calls).length;
      // حفظ بلا تغيير في الموعد والمكان: لا إشعار ولو اختير
      const same: any = await V.workshopSave(ADMIN, { row: { ...newDay({ title_ar: 'ورشة التفاوض (محدثة)' }), id: r.id }, notify_change: true });
      assertEquals([same.change, resendCalls(calls).length], [undefined, n0]);
      // تغيّر الموعد والمكان مع الاختيار
      const moved = newDay({ starts_at: iso(4 * DAY), ends_at: iso(4 * DAY + 6 * 36e5), location_ar: 'قاعة النخيل' });
      const c: any = await V.workshopSave(ADMIN, { row: { ...moved, id: r.id }, notify_change: true });
      assertEquals(c.change, { sent: 2, failed: 0, total: 2 });
      const sent = resendCalls(calls).slice(n0);
      assertEquals([sent.map((x) => [x.body.to].flat()[0]).sort(), sent[0].body.subject], [[w.ps[0].email, w.ps[1].email], 'تحديث: جلستك التدريبية']);
      assert(sent[0].body.html.includes('تغيّر موعد جلستك التدريبية ومكانها') && sent[0].body.html.includes('قاعة النخيل') && sent[0].body.html.includes('أ. خالد العتيبي'));
      assert(ics(sent[0]).includes(`UID:${r.id}@`) && /SEQUENCE:\d+/.test(ics(sent[0])), 'ملف التقويم بالمعرّف نفسه ورقم تسلسل');
      // تبقى مدعوة، والتذكيران يُعادان للموعد الجديد
      assert(row.invited_at, 'تبقى مدعوة بعد الإشعار');
      assertEquals([row.reminded_day_at, row.reminded_hour_at], [null, null]);
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.change-notice').map((x) => x.after), [{ sent: 2, failed: 0, total: 2, when: true, where: true }]);
      // الحفظ نفسه معادًا (إعادة محاولة): الصف يطابق المرسل، فلا تغيّر ولا إشعار ثانٍ
      const n1 = resendCalls(calls).length;
      const retry: any = await V.workshopSave(ADMIN, { row: { ...moved, id: r.id }, notify_change: true });
      assertEquals([retry.change, resendCalls(calls).length], [undefined, n1]);
      // تغيّر المكان وحده: نصه، والموعد كما هو فلا يُمس تذكير
      row.reminded_day_at = iso(-36e5);
      const place: any = await V.workshopSave(ADMIN, { row: { ...moved, location_ar: 'قاعة الياسمين', id: r.id }, notify_change: true });
      assertEquals(place.change.sent, 2);
      assert(resendCalls(calls).at(-1)!.body.html.includes('تغيّر مكان جلستك التدريبية.'));
      assert(row.reminded_day_at, 'تغيّر المكان لا يعيد التذكير');
    });
  } finally { w.f.restore(); }
});

Deno.test('إشعار التغيير: لا يخرج بلا اختيار، ولا لجلسة لم تُدعَ، وبلا الاختيار يبقى السلوك السابق (تغيّر الموعد يعيد فتح الدعوة)', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      // لم تُدعَ: تغيير موعدها مع الاختيار لا يرسل شيئًا
      const a: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'لم تُدعَ' }) });
      const a2: any = await V.workshopSave(ADMIN, { row: { ...newDay({ starts_at: iso(5 * DAY), ends_at: iso(5 * DAY + 36e5) }), id: a.id }, notify_change: true });
      assertEquals([a2.change, resendCalls(calls).length], [undefined, 0]);
      // دُعيت ثم تغيّر موعدها بلا اختيار: لا بريد، والدعوة تُفتح من جديد كما كان
      const b: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      const n = resendCalls(calls).length;
      await V.workshopSave(ADMIN, { row: { ...newDay({ starts_at: iso(5 * DAY), ends_at: iso(5 * DAY + 36e5) }), id: b.id } });
      assertEquals([resendCalls(calls).length, rowOf(w, b.id).invited_at], [n, null]);
      // دُعيت ثم أُزيل موعدها مع الاختيار: لا إشعار بلا موعد
      const c: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'يُزال موعدها' }), invite: true });
      const m = resendCalls(calls).length;
      const c2: any = await V.workshopSave(ADMIN, { row: { ...newDay({ starts_at: null, ends_at: null }), id: c.id }, notify_change: true });
      assertEquals([c2.change, resendCalls(calls).length], [{ skipped: 'undated' }, m]);
    });
  } finally { w.f.restore(); }
});

Deno.test('قالبا البريد في المعرض: الدعوة بمدرب، وتحديث الموعد أو المكان', () => {
  const by = Object.fromEntries((MAIL_GALLERY as any[]).map((m) => [m.key, m]));
  const invite = by['workshop-invite-trainer'].html(), change = by['workshop-change'].html();
  assert(invite.includes('المدرب') && invite.includes('د. منى القحطاني'));
  assert(change.includes('تغيّر موعد جلستك التدريبية ومكانها') && change.includes('قاعة الملك فهد') && change.includes('الملف المرفق يحدّث الموعد'));
  assertEquals(by['workshop-change'].subject, 'تحديث: جلستك التدريبية');
  // الدعوة بلا مدرب كما كانت: لا سطر «المدرب»
  assert(!by['workshop-invite'].html().includes('المدرب'));
});

Deno.test('جلسة أُضيفت من الخط جلسة حقيقية في كل مكان: الرحلة، الرمز والأرقام، ورقة الحضور، التذكير، خارج النافذة، السعة، نقطة الخط، أقرب جلسة، بوابة الخبير', async () => {
  const w = world();
  try {
    // كما يرسلها النموذج المفتوح من الخط: المرحلة (بندها) والدفعة والتاريخ تحت المؤشر، بعد 23.5 ساعة (في نافذة تذكير اليوم)
    const starts = iso(23.5 * 36e5), ends = iso(23.5 * 36e5 + 4 * 36e5);
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ starts_at: starts, ends_at: ends, capacity: 1, expert_id: TEAM }) });
    const row = rowOf(w, r.id);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.create').length, 1);
    // 1) رحلة المشارك: تحت نشاط الحضور بموعدها ومكانها
    const mine: any = await V.evidenceFor(w.ps[0], w.tables.stage_requirements, LEVELS, true, COHORT);
    const s = mine[REQ_W].sessions.find((x: Row) => x.id === r.id);
    assertEquals([s.title, s.location, s.starts_at, s.attended], ['ورشة التفاوض', 'قاعة الملك فهد', starts, false]);
    // 2) رمز QR والأرقام الستة من سر الجلسة الجديدة
    const q: any = await V.workshopQr({ id: r.id });
    assert(q.url.includes('checkin=') && /^\d{6}$/.test(q.code));
    const win = qrWindow();
    assertEquals(decodeURIComponent(q.url.split('checkin=')[1]), await qrToken(r.id, row.secret, win));
    assertEquals(q.code, await qrCode(r.id, row.secret, win));
    // 3) ورقة الحضور: المتوقعون أعضاء الدفعة المعتمدون (ومنهم حساب الاختبار، لا حساب العرض ولا المنسحب)، والتسجيل اليدوي يُكتب
    const sheet: any = await V.workshopAttendance({ id: r.id });
    assertEquals(sheet.people.map((p: Row) => p.id).sort(), [w.ps[0].id, w.ps[1].id, w.ps[2].id].sort());
    const mark: any = await V.workshopMarkBulk(ADMIN, { session_id: r.id, present: [w.ps[0].id], reason: 'تعطل الرمز' });
    assertEquals(mark.marked, 1);
    // 4) بطاقة المرحلة: المتوقع والحاضر والسعة، وتنبيه السعة يُحسب منهما (المتوقع 3 والسعة 1)
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    const day = c.sessions.find((x: Row) => x.id === r.id);
    assertEquals([day.expected, day.attended, day.capacity, day.verify, day.expected > day.capacity], [3, 1, 1, 'qr', true]);
    // 5) التذكير الآلي قبل يوم يلتقطها مرة واحدة
    await withMail(async (calls) => {
      assertEquals(await V.workshopReminders(), { day: 3, hour: 0 });
      assertEquals(resendCalls(calls).every((x) => x.body.subject === 'جلستك التدريبية غدًا'), true);
      assertEquals(await V.workshopReminders(), { day: 0, hour: 0 });
    });
    // 6) الخط الزمني والمحور: نقطة ليومها على شريط مرحلتها، و«خارج النافذة» لأنها بعد نافذة التدريب (أسبوع من بداية الدفعة قبل شهر)
    const cohort = { ...w.tables.cohorts[0], starts_on: new Date(NOW - 30 * DAY).toISOString().slice(0, 10) };
    const def = { stages: w.tables.journey_stages, requirements: w.tables.stage_requirements };
    const model = journeyTimeline(def, { cohort, sessions: [row], today: new Date(NOW) });
    const day0 = new Date(starts).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    const dots = model.activities.flatMap((a: Row) => a.dates);
    assertEquals(dots.map((d: Row) => [d.date, d.session, d.outside]), [[day0, r.id, true]]);
    assertEquals(timelineAxis(model)!.rows.find((x: Row) => x.key === 'training')!.dots.map((d: Row) => [d.date, d.outside]), [[day0, true]]);
    assertEquals(outsideSessions(model).map((x: Row) => x.session), [r.id]);
    const out = await V.outsideByCohort([cohort], [row]);
    assertEquals(out[r.id].map((x: Row) => [x.cohort_id, x.stage]), [[COHORT, 'التدريب']]);
    // 7) مكتب اليوم: أقرب جلسة لهذه الدفعة هي الجديدة
    assertEquals(nextSessionAt(cohort as any, { workshops: w.tables.workshop_sessions, now: NOW }), starts);
    // 8) بوابة الخبير: المكلف بالدفعة يراها ويعرض رمزها وورقتها، وخبير دفعة أخرى لا
    const xp: any = await V.expertWorkshops({ id: ADVISOR, email: 'adv@x.sa' });
    assert(xp.sessions.some((x: Row) => x.id === r.id && x.qr));
    assertEquals(((await V.expertWorkshopQr({ id: ADVISOR }, { id: r.id })) as any).code, q.code);
    assertEquals(await code(() => V.expertWorkshopQr({ id: ELSEWHERE }, { id: r.id })), ['not_assigned', 403]);
  } finally { w.f.restore(); }
});

Deno.test('القرار 6: الورشة الإضافية تُحسب لمن ينقصه يوم ولا تزيد المطلوب', async () => {
  const w = world();
  try {
    // المطلوب يومان (sessions_required). يومان قائمان، حضر المشارك 1 أولهما وحده
    const d2: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'اليوم 2', starts_at: iso(-DAY), ends_at: iso(-DAY + 36e5) }) });
    w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: w.ps[0].id, method: 'qr' }, { session_id: DAY1, participant_id: w.ps[1].id, method: 'qr' }, { session_id: d2.id, participant_id: w.ps[1].id, method: 'qr' });
    const read = async (p: Row) => ((await V.evidenceFor(p, w.tables.stage_requirements, LEVELS, true, COHORT)) as any)[REQ_W];
    assertEquals([(await read(w.ps[0])).count, (await read(w.ps[0])).total, (await read(w.ps[0])).done], [1, 2, false]);
    assertEquals((await read(w.ps[1])).done, true);
    // ورشة إضافية ثالثة: المطلوب يبقى 2 للجميع، ومن أتم لا يتغير حاله
    const extra: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'ورشة تعويضية' }) });
    assertEquals([(await read(w.ps[0])).total, (await read(w.ps[0])).done, (await read(w.ps[0])).sessions.length], [2, false, 3]);
    assertEquals([(await read(w.ps[1])).total, (await read(w.ps[1])).done], [2, true]);
    // من ينقصه يوم يحضر الإضافية فيكتمل بها
    w.tables.workshop_attendance.push({ session_id: extra.id, participant_id: w.ps[0].id, method: 'manual' });
    assertEquals([(await read(w.ps[0])).count, (await read(w.ps[0])).total, (await read(w.ps[0])).done], [2, 2, true]);
    // وحضور أكثر من المطلوب لا يضر
    w.tables.workshop_attendance.push({ session_id: extra.id, participant_id: w.ps[1].id, method: 'qr' });
    assertEquals([(await read(w.ps[1])).count, (await read(w.ps[1])).total, (await read(w.ps[1])).done], [3, 2, true]);
  } finally { w.f.restore(); }
});

Deno.test('القرار 6، حالة موثقة: بند بلا عدد مطلوب مكتوب يتبع عدد جلساته، فالورشة الإضافية تزيد مطلوبه', () => {
  // كل بند يحفظه محرر الرحلة يحمل sessions_required (cleanRequirementConfig)، فهذه لصفوف أقدم كُتبت بلا العدد وحدها
  const sess = (id: string) => ({ id, title_ar: id, mode: 'in_person', active: true, starts_at: iso(-DAY), ends_at: iso(-DAY + 36e5) });
  const two = workshopStatus({ verify: 'qr' }, [sess('a'), sess('b')], new Set(['a', 'b']), NOW);
  const three = workshopStatus({ verify: 'qr' }, [sess('a'), sess('b'), sess('c')], new Set(['a', 'b']), NOW);
  assertEquals([[two.total, two.done], [three.total, three.done]], [[2, true], [3, false]]);
  // وبالعدد مكتوبًا لا تزيد
  const set = workshopStatus({ verify: 'qr', sessions_required: 2 }, [sess('a'), sess('b'), sess('c')], new Set(['a', 'b']), NOW);
  assertEquals([set.total, set.done], [2, true]);
});
