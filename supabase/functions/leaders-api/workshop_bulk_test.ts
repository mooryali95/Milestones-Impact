// ورقة الحضور الجماعية (admin.workshop-mark-bulk، تصور تشغيل الدفعة 2026-11-19، المرحلة 2): حفظ واحد بسبب واحد يمر بالكاتب نفسه
// الذي يمر به التسجيل الفردي (markBatch)، فيحكم لكل مشارك وحده: المتوقع يُسجَّل، والمسجل أصلًا يُتخطى ولا يُكتب فوقه، وغير المتوقع
// وحساب العرض يُرفضان بسببهما، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب. والسبب في عمود note وفي
// سجل التدقيق دائمًا. والطلب المعاد لا يكتب مرتين. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const V = await import('./activities.ts');
const IK = await import('./idempotency.ts');
const { Fail } = await import('./core.ts');
const { replayable, isReadAction } = await import('../_shared/action-kinds.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(890001), COHORT = U(890002), OTHER = U(890003), REQ_W = U(890004), DAY1 = U(890006), GEN = U(890007), OFF = U(890008);
const ADMIN = { email: 'a@example.sa' };

function world() {
  const who = (n: number, org: string | null, extra: Row = {}) => ({ id: U(890100 + n), full_name: `مشارك ${n}`, email: `m${n}@example.sa`, organization_id: org, organization_name: 'جهة', status: 'enrolled', is_demo: false, ...extra });
  // 1 و2 و3 في دفعة الجهة، 4 في دفعة أخرى، 5 منسحب من دفعة الجهة، 6 حساب العرض
  const ps = [who(1, ORG), who(2, ORG), who(3, ORG), who(4, null), who(5, ORG, { status: 'withdrawn' }), who(6, null, { is_demo: true })];
  const placed = (p: Row) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }));
  const tables: Record<string, Row[]> = {
    participants: ps,
    cohorts: [
      { id: COHORT, name: 'دفعة الجهة', is_default: false, organization_id: ORG, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {} },
      { id: OTHER, name: 'دفعة أخرى', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', created_at: '2026-10-02', delivery: {} },
    ],
    enrollments: [
      { participant_id: ps[3].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[5].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    placements: ps.flatMap(placed),
    stage_requirements: [{ id: REQ_W, program_id: 'prog', stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr' }, active: true }],
    workshop_sessions: [
      { id: DAY1, requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 1', mode: 'in_person', active: true, secret: 's'.repeat(32), starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T12:00:00Z' },
      { id: GEN, requirement_id: REQ_W, cohort_id: null, title_ar: 'لقاء عام', mode: 'online', active: true, secret: 's'.repeat(32), starts_at: null, ends_at: null },
      { id: OFF, requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'يوم ملغى', mode: 'in_person', active: false, secret: 's'.repeat(32), starts_at: '2026-11-11T06:00:00Z', ends_at: '2026-11-11T12:00:00Z' },
    ],
    workshop_attendance: [],
    audit_log: [],
    idempotency_keys: [],
  };
  IK.resetIdemState();
  const f = installFake(tables, {
    fail: (t, op) => {
      // القيد الفريد (actor, key) لمفتاح منع التكرار كما في ترحيله
      if (t === 'idempotency_keys' && op.kind === 'insert' && tables.idempotency_keys.some((r) => r.actor === op.value.actor && r.key === op.value.key)) return { code: '23505', message: 'duplicate key' };
      return null;
    },
  });
  return { ps, tables, f };
}
type W = ReturnType<typeof world>;
const att = (w: W, sid: string) => w.tables.workshop_attendance.filter((x) => x.session_id === sid).map((x) => [x.participant_id, x.method, x.recorded_by ?? null, x.note ?? null]);
const log = (w: W) => w.tables.audit_log.map((x) => [x.actor_type, x.actor, x.action, x.entity_id, x.before, x.after]);
const attWrites = (w: W) => w.f.writes.filter((x) => x.table === 'workshop_attendance').length;
const code = async (fn: () => Promise<unknown>) => { const e = await assertRejects(fn, Fail) as any; return [e.code, e.status]; };

Deno.test('الكل صالح: حفظ واحد بسبب واحد يكتب صفًا يدويًا لكل مشارك بمن سجّله وسببه، وسطرًا في السجل لكل واحد', async () => {
  const w = world();
  try {
    const ids = w.ps.slice(0, 3).map((p) => p.id);
    const r = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: ids, reason: '  تعطل الرمز  ' });
    assertEquals(r, { success: true, marked: 3, unmarked: 0, already: 0, refused: [] });
    assertEquals(att(w, DAY1), ids.map((id) => [id, 'manual', ADMIN.email, 'تعطل الرمز']));
    assertEquals(log(w), ids.map((id) => ['admin', ADMIN.email, 'workshop.mark', id, null, { session_id: DAY1, reason: 'تعطل الرمز' }]));
    // كتابة واحدة للحضور وإدراج واحد للسجل، لا طلب لكل مشارك
    assertEquals([attWrites(w), w.f.writes.filter((x) => x.table === 'audit_log').length], [1, 1]);
    // القائمة تعرض السبب ومن سجّل
    const people = ((await V.workshopAttendance({ id: DAY1 })) as any).people;
    assertEquals(people.map((p: Row) => [p.id, p.attendance?.method, p.attendance?.recorded_by, p.attendance?.note]), ids.map((id) => [id, 'manual', ADMIN.email, 'تعطل الرمز']));
    // بلا سبب: لا عمود ولا مفتاح سبب في السجل، والسبب الطويل يُقص بحده
    w.tables.workshop_attendance.length = 0; w.tables.audit_log.length = 0;
    await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [ids[0]] });
    assertEquals([att(w, DAY1), w.tables.audit_log[0].after], [[[ids[0], 'manual', ADMIN.email, null]], { session_id: DAY1 }]);
    await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [ids[1]], reason: 'س'.repeat(1000) });
    assertEquals(w.tables.workshop_attendance.at(-1)!.note.length, V.MARK_REASON_MAX);
  } finally { w.f.restore(); }
});

Deno.test('خليط: المتوقع يُسجَّل، وغير المتوقع وحساب العرض والمعرّف الغريب يُرفضون كلٌّ بسببه ولا يُكتب لهم صف ولا سطر', async () => {
  const w = world();
  try {
    const [p1, p2, , other, gone, demo] = w.ps.map((p) => p.id);
    const r: any = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [p1, other, gone, demo, U(1), 'ليس-معرّفًا', p2], reason: 'بلا هاتف' });
    assertEquals([r.marked, r.already, r.unmarked], [2, 0, 0]);
    assertEquals(r.refused.map((x: Row) => [x.id, x.code]), [[other, 'not_expected'], [gone, 'not_expected'], [demo, 'demo'], [U(1), 'not_expected'], ['ليس-معرّفًا', 'not_expected']]);
    assertEquals(r.refused[0].message, 'ليس ممن يُتوقع حضورهم في هذه الجلسة');
    assertEquals(r.refused[2].message, 'حساب العرض لا يُسجَّل له حضور');
    // الرد معرّفات كما أُرسلت، بلا اسم ولا بريد لأحد
    assert(!/مشارك|example\.sa/.test(JSON.stringify(r)));
    assertEquals(att(w, DAY1).map((x) => x[0]), [p1, p2]);
    assertEquals(w.tables.audit_log.map((x) => x.entity_id), [p1, p2]);
    // القاعدة هي قاعدة القائمة: كل من تعرضه القائمة يُقبل، ومن لا تعرضه يُرفض، في جلسة الدفعة والعامة
    for (const sid of [DAY1, GEN]) {
      w.tables.workshop_attendance.length = 0;
      const listed = new Set(((await V.workshopAttendance({ id: sid })) as any).people.map((p: Row) => p.id));
      const x: any = await V.workshopMarkBulk(ADMIN, { session_id: sid, present: w.ps.map((p) => p.id) });
      assertEquals(new Set(att(w, sid).map((a) => a[0])), listed, sid);
      assertEquals(x.marked + x.refused.length, w.ps.length);
    }
    // العامة: عضو الدفعة الأخرى من متوقعيها، وحساب العرض لا
    assertEquals(att(w, GEN).map((x) => x[0]), [p1, p2, w.ps[2].id, other]);
  } finally { w.f.restore(); }
});

Deno.test('لا يكتب فوق حضور قائم: من سجّل نفسه يبقى بطريقته ووقته ويُعد «مسجل أصلًا»، ولا سطر له في السجل', async () => {
  const w = world();
  const [p1, p2, p3] = w.ps.map((p) => p.id);
  w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: p1, method: 'qr', checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null });
  w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: p2, method: 'manual', checked_in_at: '2026-11-10T07:00:00Z', recorded_by: 'b@example.sa', note: 'بلا هاتف' });
  try {
    const r = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [p1, p2, p3], reason: 'سُجل لاحقًا' });
    assertEquals(r, { success: true, marked: 1, unmarked: 0, already: 2, refused: [] });
    assertEquals(w.tables.workshop_attendance.map((x) => [x.participant_id, x.method, x.checked_in_at ?? null, x.recorded_by, x.note ?? null]), [
      [p1, 'qr', '2026-11-10T06:05:00Z', null, null], [p2, 'manual', '2026-11-10T07:00:00Z', 'b@example.sa', 'بلا هاتف'], [p3, 'manual', null, ADMIN.email, 'سُجل لاحقًا'],
    ]);
    assertEquals(w.tables.audit_log.map((x) => x.entity_id), [p3]);
  } finally { w.f.restore(); }
});

Deno.test('الإلغاء في الورقة: اليدوي بلا سبب، وما سجّله المشارك بنفسه يُرفض بلا سبب ويبقى، وبسبب يُحذف وحالته السابقة في السجل', async () => {
  const w = world();
  const [p1, p2, p3] = w.ps.map((p) => p.id);
  w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: p1, method: 'code', checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null });
  w.tables.workshop_attendance.push({ session_id: DAY1, participant_id: p2, method: 'manual', checked_in_at: '2026-11-10T07:00:00Z', recorded_by: 'b@example.sa', note: 'بلا هاتف' });
  try {
    // سبب التسجيل ليس سبب الإلغاء: حضور المشارك لنفسه لا يُلغى بسبب الورقة
    const r: any = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [p3], absent: [p1, p2, w.ps[3].id], reason: 'تعطل الرمز' });
    assertEquals([r.marked, r.unmarked, r.already], [1, 1, 1]);
    assertEquals(r.refused, [{ id: p1, code: 'reason_required', message: 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه' }]);
    assertEquals(att(w, DAY1).map((x) => [x[0], x[1]]), [[p1, 'code'], [p3, 'manual']]);
    assertEquals(log(w), [
      ['admin', ADMIN.email, 'workshop.mark', p3, null, { session_id: DAY1, reason: 'تعطل الرمز' }],
      ['admin', ADMIN.email, 'workshop.unmark', p2, { session_id: DAY1, method: 'manual', checked_in_at: '2026-11-10T07:00:00Z', recorded_by: 'b@example.sa', note: 'بلا هاتف' }, { session_id: DAY1 }],
    ]);
    w.tables.audit_log.length = 0;
    const r2 = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, absent: [p1], unmark_reason: 'مسح الرمز من خارج القاعة' });
    assertEquals(r2, { success: true, marked: 0, unmarked: 1, already: 0, refused: [] });
    assertEquals(att(w, DAY1).map((x) => x[0]), [p3]);
    assertEquals(log(w), [['admin', ADMIN.email, 'workshop.unmark', p1, { session_id: DAY1, method: 'code', checked_in_at: '2026-11-10T06:05:00Z', recorded_by: null }, { session_id: DAY1, reason: 'مسح الرمز من خارج القاعة' }]]);
  } finally { w.f.restore(); }
});

Deno.test('طلب معاد لا يكتب مرتين: بمفتاح منع التكرار يعود الرد الأول نفسه بلا تنفيذ، وبلا مفتاح الكل «مسجل أصلًا» بلا صف ولا سطر', async () => {
  const w = world();
  try {
    const ids = w.ps.slice(0, 3).map((p) => p.id);
    const body = { action: 'admin.workshop-mark-bulk', token: 't', session_id: DAY1, present: ids, reason: 'تعطل الرمز' };
    const req = () => new Request('https://x.test/leaders-api', { method: 'POST', headers: { origin: 'https://leaders.test' } });
    const actor = await IK.actorHash('admin', ADMIN.email);
    const run = () => V.workshopMarkBulk(ADMIN, body);
    const r1 = await IK.withIdempotency(req(), body.action, body, 'k-bulk-1234567890abcd', actor, run);
    const first = await r1.json();
    assertEquals([r1.headers.get('x-idem'), first.marked], ['stored', 3]);
    const counts = () => [w.tables.workshop_attendance.length, w.tables.audit_log.length, attWrites(w)];
    assertEquals(counts(), [3, 3, 1]);
    // الإعادة بعد مهلة أو 504: المفتاح نفسه والجسم نفسه
    const r2 = await IK.withIdempotency(req(), body.action, body, 'k-bulk-1234567890abcd', actor, run);
    assertEquals([r2.headers.get('x-idem'), await r2.json()], ['replayed', first]);
    assertEquals(counts(), [3, 3, 1]);
    // وبلا مفتاح (قبل ترحيل جدوله، أو نقرة ثانية): الحكم نفسه يتخطاهم
    assertEquals(await run(), { success: true, marked: 0, unmarked: 0, already: 3, refused: [] });
    assertEquals(counts(), [3, 3, 1]);
    // وإلغاء معاد كذلك
    await V.workshopMarkBulk(ADMIN, { session_id: DAY1, absent: [ids[0]] });
    assertEquals(await V.workshopMarkBulk(ADMIN, { session_id: DAY1, absent: [ids[0]] }), { success: true, marked: 0, unmarked: 0, already: 1, refused: [] });
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'workshop.unmark').length, 1);
    // الفعلان كتابة تُحفظ نتيجتها بمفتاحها، لا قراءة
    for (const a of ['admin.workshop-mark-bulk', 'xp.workshop-mark-bulk']) assertEquals([replayable('leaders-api', a), isReadAction('leaders-api', a)], [true, false], a);
  } finally { w.f.restore(); }
});

Deno.test('حدود الطلب: جلسة غير موجودة أو ملغاة، وطلب فارغ، ومشارك في القائمتين، وأكثر من الحد', async () => {
  const w = world();
  try {
    const [p1, p2] = w.ps.map((p) => p.id);
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: U(2), present: [p1] })), ['bad_request', 404]);
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: DAY1 })), ['empty', 400]);
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: 'x', absent: null })), ['empty', 400]);
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [p1], absent: [p1] })), ['conflict', 400]);
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: Array.from({ length: V.MARK_BULK_MAX + 1 }, (_, i) => U(700000 + i)) })), ['too_many', 400]);
    // الجلسة الملغاة: لا حضور جديد فيها، وإلغاء ما سُجل فيها من قبل يبقى ممكنًا
    assertEquals(await code(() => V.workshopMarkBulk(ADMIN, { session_id: OFF, present: [p1] })), ['inactive', 409]);
    assertEquals(await code(() => V.workshopMark(ADMIN, { session_id: OFF, participant_id: p1, present: true })), ['inactive', 409]);
    w.tables.workshop_attendance.push({ session_id: OFF, participant_id: p2, method: 'manual', recorded_by: ADMIN.email });
    assertEquals(((await V.workshopMarkBulk(ADMIN, { session_id: OFF, absent: [p2] })) as any).unmarked, 1);
    assertEquals(w.tables.workshop_attendance.length, 0);
    // المعرّف المكرر في الطلب يُحكم مرة واحدة
    const r: any = await V.workshopMarkBulk(ADMIN, { session_id: DAY1, present: [p1, p1, p1] });
    assertEquals([r.marked, w.tables.workshop_attendance.length], [1, 1]);
  } finally { w.f.restore(); }
});

Deno.test('الكتابة للمدير الكاتب وحده: الأمر الجماعي خلف حارس الكتابة في الموجّه، والفردي والجماعي من كاتب واحد', async () => {
  const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(index.includes("'admin.workshop-mark-bulk': (a, b) => A.writer(a, V.workshopMarkBulk, b)"));
  const src = await Deno.readTextFile(new URL('./activities.ts', import.meta.url));
  // لا كاتب ثانٍ: إدراج الحضور اليدوي في موضع واحد، والأفعال الثلاثة تمر به
  assertEquals(src.split("method: 'manual', recorded_by:").length - 1, 1);
  for (const fn of ['workshopMark', 'workshopMarkBulk', 'expertWorkshopMarkBulk']) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`)).split('\n}\n')[0];
    assert(/await markBatch\(/.test(body), fn);
    assert(!/from\('workshop_attendance'\)/.test(body), fn);
  }
});
