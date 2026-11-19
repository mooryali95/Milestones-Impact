// أيام الورشة في بطاقة المرحلة (W3، تصور الحضور 2026-11-18 ب5.4): يوم يُضاف من البطاقة بـadmin.workshop-save نفسه فيظهر في
// «الحضور والجلسات» وللمشارك، والسعة الاختيارية بالترحيل 20261118130000 وقبله تُخفى ويُحفظ اليوم بلاها،
// وadmin.cohort-workshops يقرأ أيام الدفعة بطريقتها الفعلية والمتوقع والحاضر كما تعدّها شاشة الرمز. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const V = await import('./activities.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(990001), COHORT = U(990002), OTHER = U(990003), REQ_W = U(990004), REQ_X = U(990005), OLD = U(990006), GEN = U(990007), ELSE = U(990008);
const ADMIN = { email: 'a@example.sa' };
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();

function world() {
  const who = (n: number, org: string | null) => ({ id: U(990100 + n), full_name: `مشارك ${n}`, email: `d${n}@example.sa`, organization_id: org, organization_name: 'جهة', status: 'enrolled', is_demo: false });   // is_demo كما في القاعدة (not null default false): المتوقعون يُقرؤون بـlisted
  const ps = [who(1, ORG), who(2, ORG), who(3, ORG), who(4, null)];
  const placed = (p: Row) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }));
  return {
    ps,
    tables: {
      cohorts: [
        { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {} },
        { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02', delivery: {} },
      ],
      enrollments: [{ participant_id: ps[3].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' }],
      placements: ps.flatMap(placed),
      stage_requirements: [
        { id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr', sessions_required: 4 }, active: true },
        { id: REQ_X, program_id: 'other-prog', stage_key: 'training', code: 'X-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'برنامج آخر', config: {}, active: true },
      ],
      workshop_sessions: [
        { id: OLD, requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'القاعة', join_url: null, active: true, secret: 's'.repeat(32), starts_at: iso(-864e5 * 2), ends_at: iso(-864e5 * 2 + 72e5) },
        { id: GEN, requirement_id: REQ_W, cohort_id: null, title_ar: 'لقاء عام', mode: 'online', location_ar: null, join_url: null, active: true, secret: 's'.repeat(32), starts_at: null, ends_at: null },
        { id: ELSE, requirement_id: REQ_W, cohort_id: OTHER, title_ar: 'يوم الدفعة الأخرى', mode: 'in_person', location_ar: 'قاعة', join_url: null, active: true, secret: 's'.repeat(32), starts_at: iso(864e5), ends_at: iso(864e5 + 36e5) },
      ],
      workshop_attendance: [
        { session_id: OLD, participant_id: ps[0].id, method: 'qr' },
        { session_id: GEN, participant_id: ps[3].id, method: 'join' },
      ],
      audit_log: [],
    } as Record<string, Row[]>,
  };
}
// قبل الترحيل: العمود capacity غير موجود، فقراءته وكتابته يرفضهما PostgREST كما في الإنتاج
const noCapacity = (table: string, op: { kind: string; cols?: string; value?: any }) => {
  if (table !== 'workshop_sessions') return null;
  if (op.kind === 'select' && /\bcapacity\b/.test(op.cols || '')) return { code: '42703', message: 'column workshop_sessions.capacity does not exist' };
  if ((op.kind === 'insert' || op.kind === 'update') && op.value && 'capacity' in op.value) return { code: 'PGRST204', message: "Could not find the 'capacity' column of 'workshop_sessions' in the schema cache" };
  return null;
};
const newDay = (extra: Row = {}) => ({
  requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 2', mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null,
  starts_at: iso(864e5 * 3), ends_at: iso(864e5 * 3 + 6 * 36e5), active: true, ...extra,
});

Deno.test('يوم من البطاقة: يُحفظ بالمسار نفسه لهذه الدفعة وبنده، ويظهر في «الحضور والجلسات» وللمشارك، بسعته', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ capacity: '20' }) });
    assertEquals([r.success, r.capacity_skipped], [true, undefined]);
    const row = w.tables.workshop_sessions.find((s) => s.id === r.id)!;
    assertEquals([row.requirement_id, row.cohort_id, row.capacity, row.secret.length >= 32], [REQ_W, COHORT, 20, true]);
    // شاشة «الحضور والجلسات»: الصف نفسه بلا السر، وعلامة السعة
    const o: any = await V.overview();
    assertEquals(o.capacity_ready, true);
    const there = o.workshops.find((s: any) => s.id === r.id);
    assertEquals([there.title_ar, there.capacity, 'secret' in there], ['اليوم 2', 20, false]);
    // المشارك في الدفعة يرى اليوم في أدلة بنده (evidenceFor)، ومن دفعة أخرى لا يراه
    const req = w.tables.stage_requirements[0];
    const mine: any = await V.evidenceFor(w.ps[0], [req], { milestone: 'intermediate', impact: 'intermediate', leadership: 'intermediate' }, true, COHORT);
    assert(mine[REQ_W].sessions.some((s: any) => s.id === r.id), JSON.stringify(mine[REQ_W].sessions));
    const theirs: any = await V.evidenceFor(w.ps[3], [req], { milestone: 'intermediate', impact: 'intermediate', leadership: 'intermediate' }, true, OTHER);
    assert(!theirs[REQ_W].sessions.some((s: any) => s.id === r.id));
    // التحرير بلا حقل السعة يبقيها، والفارغ يمسحها، وخارج الحد يُرد برسالته
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, title_ar: 'اليوم الثاني' } });
    assertEquals([row.title_ar, row.capacity, row.cohort_id], ['اليوم الثاني', 20, COHORT]);
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, capacity: null } });
    assertEquals(row.capacity, null);
    for (const bad of [0, 10001, 2.5, 'عشرون']) {
      await assertRejects(() => V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, capacity: bad } }), Error, 'السعة عدد صحيح من 1 إلى 10000');
    }
    // الأرقام العربية مقبولة كبقية الحقول الرقمية
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, capacity: '٣٠' } });
    assertEquals(row.capacity, 30);
    // الإلغاء من البطاقة: الصف نفسه موقوفًا، لا حذف، ويختفي من رحلة المشارك
    await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, active: false } });
    assertEquals([row.active, w.tables.workshop_sessions.length], [false, 4]);
    assertEquals(w.tables.audit_log.filter((a) => a.action === 'workshop.create').length, 1);
  } finally { f.restore(); }
});

Deno.test('قبل ترحيل السعة: اللوحة تخفيها، والحفظ ينجح بلاها ويقول إنها لم تُحفظ، والتحرير بلا سعة كما كان', async () => {
  const w = world();
  const f = installFake(w.tables, { fail: noCapacity });
  try {
    assertEquals(await V.capacityReady(), false);
    const o: any = await V.overview();
    assertEquals(o.capacity_ready, false);
    const r: any = await V.workshopSave(ADMIN, { row: newDay({ capacity: 20 }) });
    assertEquals([r.success, r.capacity_skipped], [true, true]);
    const row = w.tables.workshop_sessions.find((s) => s.id === r.id)!;
    assertEquals(['capacity' in row, row.cohort_id, row.title_ar], [false, COHORT, 'اليوم 2']);
    // النموذج قبل الترحيل لا يرسل الحقل أصلًا: لا إعادة ولا علامة
    const r2: any = await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, title_ar: 'اليوم الثاني' } });
    assertEquals([r2.success, r2.capacity_skipped, row.title_ar], [true, undefined, 'اليوم الثاني']);
    // سعة فارغة قبل الترحيل: تُسقط بلا تنبيه
    const r3: any = await V.workshopSave(ADMIN, { row: { ...newDay(), id: r.id, capacity: null } });
    assertEquals([r3.success, r3.capacity_skipped], [true, undefined]);
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals(c.capacity_ready, false);
    assert(c.sessions.every((s: any) => !('capacity' in s)));
  } finally { f.restore(); }
});

Deno.test('admin.cohort-workshops: أيام الدفعة والعامة لا غيرها، بطريقتها الفعلية والمتوقع والحاضر، وبرنامج آخر لا يُقرأ', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    w.tables.workshop_sessions.find((s) => s.id === OLD)!.capacity = 2;
    const c: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W, REQ_X, 'x'] });
    assertEquals(c.success, true);
    assertEquals(c.sessions.map((s: any) => s.id).sort(), [GEN, OLD].sort());
    const old = c.sessions.find((s: any) => s.id === OLD);
    // المتوقع: أعضاء الجهة الثلاثة بعد اعتمادهم (دفعة الجهة)، وحضر واحد، كما تعدّها شاشة الرمز (workshopAttendance)
    assertEquals([old.verify, old.expected, old.attended, old.capacity, 'secret' in old], ['qr', 3, 1, 2, false]);
    const screen: any = await V.workshopAttendance({ id: OLD });
    assertEquals([screen.people.length, screen.people.filter((p: any) => p.attendance).length], [old.expected, old.attended]);
    // الجلسة العامة: أعضاء هذه الدفعة وحاضروها وحدهم، فحاضر الدفعة الأخرى لا يُعد هنا
    const gen = c.sessions.find((s: any) => s.id === GEN);
    assertEquals([gen.expected, gen.attended], [3, 0]);
    // وقائمة حضورها من البطاقة (cohort_id) بالأعداد نفسها، لا كل دفعات البرنامج
    const genList: any = await V.workshopAttendance({ id: GEN, cohort_id: COHORT });
    assertEquals([genList.people.length, genList.people.filter((p: any) => p.attendance).length], [gen.expected, gen.attended]);
    // وبلا دفعة (شاشة «الحضور والجلسات») تبقى لكل الدفعات: حاضر الدفعة الأخرى فيها
    const genAll: any = await V.workshopAttendance({ id: GEN });
    assert(genAll.people.some((p: any) => p.attendance) && genAll.people.length > genList.people.length);
    // تخصيص الدفعة يغلب طريقة البرنامج (sessionVerify) لجلساتها وحدها، والعامة بطريقة البرنامج كما يفرضها التسجيل (workshopVerify)
    w.tables.cohorts[0].delivery = { 'T-ATTEND': { verify: 'manual' } };
    const c2: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_W] });
    assertEquals(Object.fromEntries(c2.sessions.map((s: any) => [s.id, s.verify])), { [OLD]: 'manual', [GEN]: 'qr' });
    // بند من برنامج آخر وحده: لا جلسات
    const c3: any = await V.cohortWorkshops({ cohort_id: COHORT, requirement_ids: [REQ_X] });
    assertEquals(c3.sessions, []);
    // قراءة فقط
    assertEquals(f.writes.length, 0);
    await assertRejects(() => V.cohortWorkshops({ cohort_id: U(1), requirement_ids: [REQ_W] }), Error, 'الدفعة غير موجودة');
  } finally { f.restore(); }
});
