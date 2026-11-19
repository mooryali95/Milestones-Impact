// التسجيل اليدوي للحضور من الإدارة (admin.workshop-mark، تصور تشغيل الدفعة 2026-11-19، المرحلة 0): الحضور لمن يُتوقع حضوره وحده
// بقاعدة قائمة الحضور نفسها، ولا يكتب فوق حضور قائم، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب مع حالته السابقة في السجل،
// والسبب في سجل التدقيق (لا عمود له قبل المرحلة 2). بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const V = await import('./activities.ts');
const { Fail } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(880001), COHORT = U(880002), OTHER = U(880003), REQ_W = U(880004), REQ_ADV = U(880005), DAY1 = U(880006), GEN = U(880007), ADV = U(880008);
const ADMIN = { email: 'a@example.sa' };

function world() {
  const who = (n: number, org: string | null, extra: Row = {}) => ({ id: U(880100 + n), full_name: `مشارك ${n}`, email: `m${n}@example.sa`, organization_id: org, organization_name: 'جهة', status: 'enrolled', is_demo: false, ...extra });   // is_demo كما في القاعدة (not null default false): المتوقعون يُقرؤون بـlisted
  // 1 و2 في دفعة الجهة، 3 في دفعة أخرى، 4 منسحب من دفعة الجهة، 5 مساره لم يُعتمد كله
  const ps = [who(1, ORG), who(2, ORG), who(3, null), who(4, ORG, { status: 'withdrawn' }), who(5, ORG)];
  const placed = (p: Row, approved = 3) => ['milestone', 'impact', 'leadership'].map((dimension, i) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: i < approved ? '2026-10-05T08:00:00Z' : null, participants: p }));
  return {
    ps,
    tables: {
      cohorts: [
        { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {} },
        { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02', delivery: {} },
      ],
      enrollments: [{ participant_id: ps[2].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' }],
      placements: [...ps.slice(0, 4).flatMap((p) => placed(p)), ...placed(ps[4], 2)],
      stage_requirements: [
        { id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr' }, active: true },
        // متطلب للمستوى المتقدم في بُعد الأثر وحده: لا ينطبق على أحد هنا (الكل متوسط)
        { id: REQ_ADV, program_id: 'prog', stage_key: 'training', code: 'T-ADV', kind: 'workshop', dimension: 'impact', level: 'advanced', sort: 2, required: true, title_ar: 'ورشة المتقدمين', config: {}, active: true },
      ],
      workshop_sessions: [
        { id: DAY1, requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 1', mode: 'in_person', active: true, secret: 's'.repeat(32), starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T12:00:00Z' },
        { id: GEN, requirement_id: REQ_W, cohort_id: null, title_ar: 'لقاء عام', mode: 'online', active: true, secret: 's'.repeat(32), starts_at: null, ends_at: null },
        { id: ADV, requirement_id: REQ_ADV, cohort_id: null, title_ar: 'ورشة المتقدمين', mode: 'in_person', active: true, secret: 's'.repeat(32), starts_at: null, ends_at: null },
      ],
      workshop_attendance: [] as Row[],
      audit_log: [] as Row[],
    } as Record<string, Row[]>,
  };
}
const att = (w: ReturnType<typeof world>, sid: string) => w.tables.workshop_attendance.filter((x) => x.session_id === sid).map((x) => [x.participant_id, x.method, x.recorded_by ?? null]);
const log = (w: ReturnType<typeof world>) => w.tables.audit_log.map((x) => [x.action, x.entity, x.entity_id, x.before, x.after]);
const rejects = async (fn: () => Promise<unknown>, code: string, status: number) => {
  const e = await assertRejects(fn, Fail) as any;
  assertEquals([e.code, e.status], [code, status]);
  return e;
};

Deno.test('التسجيل اليدوي: عضو دفعة الجلسة يُسجَّل بطريقة «يدوي» ومن سجّله، والسبب الاختياري في السجل', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: true, reason: '  تعطل الرمز  ' }), { success: true });
    assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[1].id, present: true }), { success: true });
    assertEquals(att(w, DAY1), [[w.ps[0].id, 'manual', ADMIN.email], [w.ps[1].id, 'manual', ADMIN.email]]);
    assertEquals(log(w), [
      ['workshop.mark', 'participants', w.ps[0].id, null, { session_id: DAY1, reason: 'تعطل الرمز' }],
      ['workshop.mark', 'participants', w.ps[1].id, null, { session_id: DAY1 }],
    ]);
    // السبب بحد أقصى، فلا يُكتب نص بلا نهاية في السجل
    w.tables.workshop_attendance.length = 0;
    await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: true, reason: 'س'.repeat(1000) });
    assertEquals(w.tables.audit_log.at(-1)!.after.reason.length, V.MARK_REASON_MAX);
  } finally { f.restore(); }
});

Deno.test('التحقق: من ليس من متوقعي الجلسة يُرفض ولا يُكتب له حضور ولا سطر في السجل', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    // عضو دفعة أخرى في جلسة دفعة الجهة
    const e = await rejects(() => V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[2].id, present: true }), 'not_expected', 409);
    assertEquals(e.message, 'هذا المشارك ليس ممن يُتوقع حضورهم في هذه الجلسة');
    // منسحب، ومن لم يُعتمد مساره كله، ومعرّف لا مشارك له
    await rejects(() => V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[3].id, present: true }), 'not_expected', 409);
    await rejects(() => V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[4].id, present: true }), 'not_expected', 409);
    await rejects(() => V.workshopMark(ADMIN, { session_id: DAY1, participant_id: U(1), present: true }), 'not_expected', 409);
    // جلسة متطلب لا ينطبق على مستواه
    await rejects(() => V.workshopMark(ADMIN, { session_id: ADV, participant_id: w.ps[0].id, present: true }), 'not_expected', 409);
    // جلسة غير موجودة
    assertEquals((await assertRejects(() => V.workshopMark(ADMIN, { session_id: U(2), participant_id: w.ps[0].id, present: true }), Fail) as any).status, 404);
    assertEquals([w.tables.workshop_attendance.length, w.tables.audit_log.length], [0, 0]);
  } finally { f.restore(); }
});

Deno.test('التحقق بقاعدة القائمة نفسها: كل من تعرضه قائمة الحضور غائبًا يُقبل، ومن لا تعرضه يُرفض، والجلسة العامة لكل من ينطبق عليه المتطلب', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    for (const sid of [DAY1, GEN, ADV]) {
      const listed = new Set(((await V.workshopAttendance({ id: sid })) as any).people.map((p: Row) => p.id));
      for (const p of w.ps) {
        const ok = await V.workshopMark(ADMIN, { session_id: sid, participant_id: p.id, present: true }).then(() => true, () => false);
        assertEquals(ok, listed.has(p.id), `${sid} ${p.full_name}`);
      }
    }
    // العامة: عضو الدفعة الأخرى من متوقعيها
    assertEquals(att(w, GEN).map((x) => x[0]), [w.ps[0].id, w.ps[1].id, w.ps[2].id]);
    assertEquals(att(w, ADV), []);
  } finally { f.restore(); }
});

Deno.test('لا يكتب فوق حضور المشارك لنفسه: الطريقة والوقت كما هما، ولا سطر جديد في السجل', async () => {
  const w = world();
  w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: w.ps[0].id, method: 'qr', checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null });
  const f = installFake(w.tables);
  try {
    assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: true, reason: 'سُجل لاحقًا' }), { success: true, already: true });
    assertEquals(w.tables.workshop_attendance.map((x) => [x.method, x.checked_in_at, x.recorded_by]), [['qr', '2026-11-10T06:05:00Z', null]]);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { f.restore(); }
});

Deno.test('إلغاء حضور سجّله المشارك بنفسه: يُرفض بلا سبب ويبقى الحضور، وبسبب يُحذف وتُحفظ حالته السابقة في السجل', async () => {
  for (const method of ['qr', 'code', 'join', 'hall', 'remote']) {
    const w = world();
    w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: w.ps[0].id, method, checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null });
    const f = installFake(w.tables);
    try {
      for (const reason of [undefined, '', '   ']) {
        const e = await rejects(() => V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: false, reason }), 'reason_required', 400);
        assertEquals(e.message, 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه');
      }
      assertEquals([w.tables.workshop_attendance.length, w.tables.audit_log.length], [1, 0], method);
      assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: false, reason: 'مسح الرمز من خارج القاعة' }), { success: true });
      assertEquals(w.tables.workshop_attendance.length, 0);
      assertEquals(log(w), [['workshop.unmark', 'participants', w.ps[0].id,
        { session_id: DAY1, method, checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null }, { session_id: DAY1, reason: 'مسح الرمز من خارج القاعة' }]]);
    } finally { f.restore(); }
  }
});

Deno.test('إلغاء حضور يدوي: بنقرة بلا سبب، والحالة السابقة (من سجّله) في السجل، وإلغاء ما ليس مسجلًا لا يكتب شيئًا', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[0].id, present: true });
    w.tables.audit_log.length = 0;
    assertEquals(await V.workshopMark({ email: 'b@example.sa' }, { session_id: DAY1, participant_id: w.ps[0].id, present: false }), { success: true });
    assertEquals(w.tables.workshop_attendance.length, 0);
    const row = w.tables.audit_log[0];
    assertEquals([row.action, row.actor, row.before.method, row.before.recorded_by, row.after], ['workshop.unmark', 'b@example.sa', 'manual', ADMIN.email, { session_id: DAY1 }]);
    // من ليس من متوقعيها وسُجّل قبل هذا التحقق يبقى إلغاؤه ممكنًا
    w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: w.ps[2].id, method: 'manual', recorded_by: ADMIN.email });
    assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[2].id, present: false }), { success: true });
    assertEquals(w.tables.workshop_attendance.length, 0);
    w.tables.audit_log.length = 0;
    assertEquals(await V.workshopMark(ADMIN, { session_id: DAY1, participant_id: w.ps[1].id, present: false }), { success: true, already: true });
    assertEquals(w.tables.audit_log.length, 0);
  } finally { f.restore(); }
});

Deno.test('الكتابة للمدير الكاتب وحده: الأمر خلف حارس الكتابة في الموجّه', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assertEquals(/'admin\.workshop-mark': \(a, b\) => A\.writer\(a, V\.workshopMark, b\)/.test(src), true);
});
