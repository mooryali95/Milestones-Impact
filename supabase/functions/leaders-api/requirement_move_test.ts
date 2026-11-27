// المرحلة 22 (تصور الرحلة والمسار، 4.4): نقل النشاط الذري (admin.requirement-move)، وتشديد الترتيب (admin.reorder)،
// وإدراج المرحلة آخر محورها (admin.stage-create)، والإخفاء بدل الحذف. على دوال الخادم نفسها بقاعدة في الذاكرة.
// قبول الأمن: المدير القارئ يتلقى 403 قبل أي كتابة، والترتيب يرفض معرفات من برنامج آخر أو مرحلة أخرى، والنقل كله أو لا شيء.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

const A = await import('./admin.ts');
const { Fail } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(900), OTHER = U(901);
const ADMIN: any = { email: 'admin@example.sa', role: 'admin', id: 'a1', method: 'passkey' };
const VIEWER: any = { email: 'view@example.sa', role: 'viewer', id: 'a2', method: 'passkey' };

const stage = (key: string, phase: string, sort: number, pid = PROG, rules: Row = {}) => ({ program_id: pid, key, title_ar: `مرحلة ${key}`, phase, sort, rules, active: true, duration_days: 7 });
const req = (n: number, stage_key: string, sort: number, pid = PROG) => ({ id: U(n), program_id: pid, stage_key, code: `X-${n}`, kind: 'check', sort, title_ar: `نشاط ${n}`, required: true, active: true, config: {} });

function world(extra: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    programs: [{ id: PROG, is_default: true }, { id: OTHER, is_default: false }],
    journey_stages: [stage('intro', 'admission', 1), stage('training', 'qualification', 2), stage('ojt', 'qualification', 3), stage('report', 'impact', 4), stage('intro', 'admission', 1, OTHER)],
    stage_requirements: [req(1, 'training', 1), req(2, 'training', 2), req(3, 'training', 3), req(4, 'ojt', 1), req(5, 'ojt', 2), req(9, 'intro', 1, OTHER)],
    participant_requirements: [], program_versions: [], audit_log: [],
    ...extra,
  };
  const f = installFake(tables);
  return { tables: f.tables, writes: f.writes, restore: f.restore };
}
const order = (t: Row[], key: string) => t.filter((r) => r.program_id === PROG && r.stage_key === key).sort((a, b) => a.sort - b.sort).map((r) => r.id);
const writesTo = (w: any, table: string) => w.writes.filter((x: any) => x.table === table);

Deno.test('النقل: يغير المرحلة والموضع معًا بكتابة واحدة وصف تدقيق واحد، ويعيد صفوف المرحلتين وحدهما', async () => {
  const w = world();
  try {
    const r: any = await A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt', position: 1, expect_stage: 'training', expect_sort: 2, target_ids: [U(4), U(5)] });
    assertEquals(r.success, true);
    assertEquals(order(w.tables.stage_requirements, 'ojt'), [U(2), U(4), U(5)]);
    assertEquals(order(w.tables.stage_requirements, 'training'), [U(1), U(3)]);
    assertEquals(w.tables.stage_requirements.filter((x: Row) => x.program_id === PROG && x.stage_key === 'training').map((x: Row) => x.sort).sort(), [1, 2]);
    // كتابة واحدة (upsert) لكل الصفوف المتأثرة، وصف تدقيق واحد
    assertEquals(writesTo(w, 'stage_requirements').length, 1);
    assertEquals(writesTo(w, 'stage_requirements')[0].kind, 'upsert');
    assertEquals(w.tables.audit_log.filter((x: Row) => x.action === 'stage_requirements.move').length, 1);
    assertEquals(w.tables.stage_requirements.length, 6);   // لا صف مكرر
    assertEquals(new Set(r.rows.map((x: Row) => x.stage_key)), new Set(['training', 'ojt']));
    assertEquals(r.position, 1);
    assertEquals(r.stage_title, 'مرحلة ojt');
  } finally { w.restore(); }
});

Deno.test('النقل داخل المرحلة نفسها إلى موضع آخر، والموضع خارج الحدود يُقصر على آخرها', async () => {
  const w = world();
  try {
    await A.requirementMove(ADMIN, { id: U(1), program_id: PROG, stage_key: 'training', position: 99, expect_stage: 'training', expect_sort: 1, target_ids: [U(2), U(3)] });
    assertEquals(order(w.tables.stage_requirements, 'training'), [U(2), U(3), U(1)]);
  } finally { w.restore(); }
});

Deno.test('النقل: القارئ 403، ونشاط برنامج آخر ومرحلة غير موجودة تُرفض، ولا كتابة في أي منها', async () => {
  const w = world();
  try {
    const e = await assertRejects(() => A.requirementMove(VIEWER, { id: U(1), program_id: PROG, stage_key: 'ojt' }), Fail) as any;
    assertEquals(e.status, 403);
    const x = await assertRejects(() => A.requirementMove(ADMIN, { id: U(9), program_id: PROG, stage_key: 'ojt' }), Fail) as any;
    assertEquals(x.code, 'scope');
    const y = await assertRejects(() => A.requirementMove(ADMIN, { id: U(1), program_id: PROG, stage_key: 'nowhere' }), Fail) as any;
    assertEquals(y.code, 'scope');
    await assertRejects(() => A.requirementMove(ADMIN, { id: 'not-a-uuid', program_id: PROG, stage_key: 'ojt' }), Fail);
    assertEquals(writesTo(w, 'stage_requirements').length, 0);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('التزامن: موضع تغير أو مرحلة هدف تغيرت منذ رآها المدير يُرفض 409 بلا أثر', async () => {
  const w = world();
  try {
    const a = await assertRejects(() => A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt', expect_stage: 'training', expect_sort: 1, target_ids: [U(4), U(5)] }), Fail) as any;
    assertEquals([a.status, a.code], [409, 'conflict']);
    const b = await assertRejects(() => A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt', expect_stage: 'training', expect_sort: 2, target_ids: [U(4)] }), Fail) as any;
    assertEquals(b.code, 'conflict');
    assertEquals(order(w.tables.stage_requirements, 'training'), [U(1), U(2), U(3)]);
    const c = await assertRejects(() => A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt' }), Fail) as any;
    assertEquals(c.status, 400);
    assertEquals(writesTo(w, 'stage_requirements').length, 0);
  } finally { w.restore(); }
});

Deno.test('النقل: كتابة تفشل لا تترك نصف نقل (كله أو لا شيء)', async () => {
  const tables: Record<string, Row[]> = {
    programs: [{ id: PROG, is_default: true }],
    journey_stages: [stage('training', 'qualification', 1), stage('ojt', 'qualification', 2)],
    stage_requirements: [req(1, 'training', 1), req(2, 'training', 2), req(4, 'ojt', 1)],
    participant_requirements: [], program_versions: [], audit_log: [],
  };
  const f = installFake(tables, { fail: (t, op) => (t === 'stage_requirements' && op.kind === 'upsert' ? { message: 'boom' } : null) });
  try {
    await assertRejects(() => A.requirementMove(ADMIN, { id: U(1), program_id: PROG, stage_key: 'ojt', position: 1, expect_stage: 'training', expect_sort: 1, target_ids: [U(4)] }), Fail);
    assertEquals(f.tables.stage_requirements.map((r: Row) => [r.id, r.stage_key, r.sort]), [[U(1), 'training', 1], [U(2), 'training', 2], [U(4), 'ojt', 1]]);
    assertEquals(f.tables.audit_log.length, 0);
  } finally { f.restore(); }
});

Deno.test('النقل: نشاط له تقدم أو في نسخة محفوظة يطلب تأكيدًا صريحًا قبل أي كتابة، ثم يُنقل بالتأكيد ويبقى التقدم', async () => {
  const w = world({
    participant_requirements: [{ participant_id: U(77), requirement_id: U(2), status: 'done' }, { participant_id: U(78), requirement_id: U(2), status: 'done' }],
    program_versions: [{ id: U(800), program_id: PROG, number: 1, data: { stages: [], requirements: [{ id: U(2) }] } }],
  });
  try {
    const e = await assertRejects(() => A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt', expect_stage: 'training', expect_sort: 2, target_ids: [U(4), U(5)] }), Fail) as any;
    assertEquals([e.status, e.code, e.extra.progress, e.extra.versions], [409, 'confirm', 2, 1]);
    assert(e.message.includes('أكمله 2'));
    assertEquals(writesTo(w, 'stage_requirements').length, 0);
    const r: any = await A.requirementMove(ADMIN, { id: U(2), program_id: PROG, stage_key: 'ojt', expect_stage: 'training', expect_sort: 2, target_ids: [U(4), U(5)], confirm: true });
    assertEquals(r.success, true);
    assertEquals(w.tables.participant_requirements.length, 2);
    assertEquals(w.tables.stage_requirements.find((x: Row) => x.id === U(2))!.stage_key, 'ojt');
  } finally { w.restore(); }
});

Deno.test('الترتيب المشدد: القارئ 403، ومعرفات من برنامج آخر أو من مرحلتين تُرفض كلها بلا كتابة', async () => {
  const w = world();
  try {
    const e = await assertRejects(() => A.reorder(VIEWER, { entity: 'stage_requirements', ids: [U(2), U(1)] }), Fail) as any;
    assertEquals(e.status, 403);
    const x = await assertRejects(() => A.reorder(ADMIN, { entity: 'stage_requirements', ids: [U(1), U(9)], program_id: PROG }), Fail) as any;
    assertEquals(x.code, 'scope');
    const y = await assertRejects(() => A.reorder(ADMIN, { entity: 'stage_requirements', ids: [U(1), U(4)], program_id: PROG }), Fail) as any;
    assertEquals(y.code, 'scope');
    const z = await assertRejects(() => A.reorder(ADMIN, { entity: 'stage_requirements', ids: [U(1), U(1)] }), Fail) as any;
    assertEquals(z.status, 400);
    const s = await assertRejects(() => A.reorder(ADMIN, { entity: 'journey_stages', ids: ['training', 'ghost'], program_id: PROG }), Fail) as any;
    assertEquals(s.code, 'scope');
    assertEquals(writesTo(w, 'stage_requirements').length + writesTo(w, 'journey_stages').length, 0);
  } finally { w.restore(); }
});

Deno.test('الترتيب داخل مرحلة واحدة: كتابة واحدة، ولا يمس مراحل البرنامج الآخر', async () => {
  const w = world();
  try {
    await A.reorder(ADMIN, { entity: 'stage_requirements', ids: [U(3), U(1), U(2)], program_id: PROG });
    assertEquals(order(w.tables.stage_requirements, 'training'), [U(3), U(1), U(2)]);
    assertEquals(writesTo(w, 'stage_requirements').length, 1);
    await A.reorder(ADMIN, { entity: 'journey_stages', ids: ['intro', 'ojt', 'training', 'report'], program_id: PROG });
    assertEquals(w.tables.journey_stages.find((s: Row) => s.program_id === OTHER)!.sort, 1);
    assertEquals(w.tables.journey_stages.find((s: Row) => s.program_id === PROG && s.key === "ojt")!.sort, 2);
  } finally { w.restore(); }
});

Deno.test('إضافة مرحلة: آخر محورها لا آخر الرحلة، بنوعها ومدتها، ولا تتكرر قيم sort ولا يتغير ترتيب الأثر', async () => {
  const w = world();
  try {
    const r: any = await A.stageCreate(ADMIN, { program_id: PROG, title_ar: 'مختبر تطبيقي', phase: 'qualification', mode: 'optional', duration_days: 10 });
    assertEquals(r.success, true);
    const mine = w.tables.journey_stages.filter((s: Row) => s.program_id === PROG).sort((a: Row, b: Row) => a.sort - b.sort);
    assertEquals(mine.map((s: Row) => s.key), ['intro', 'training', 'ojt', r.row.key, 'report']);
    assertEquals(new Set(mine.map((s: Row) => s.sort)).size, mine.length);
    assertEquals(r.row.rules, { mode: 'optional' });
    assertEquals(r.row.duration_days, 10);
    // أول مرحلة في الأثر تبقى بعد كل مراحل التأهيل وقاعدتها كما هي، ويُذكر أنها صارت بعد الجديدة
    const report = mine.find((s: Row) => s.key === "report")!;
    assertEquals(report.rules, {});
    assert(mine.filter((s: Row) => s.phase === 'qualification').every((s: Row) => s.sort < report.sort));
    assertEquals(r.shifted, ['report']);
    assertEquals(r.next, 'report');
    assertEquals(w.tables.audit_log.filter((x: Row) => x.action === 'journey_stages.create').length, 1);
    // البرنامج الآخر لا يتأثر
    assertEquals(w.tables.journey_stages.find((s: Row) => s.program_id === OTHER)!.sort, 1);
  } finally { w.restore(); }
});

Deno.test('إضافة مرحلة: محور فارغ يأتي بعد ما قبله، والقارئ 403، والاسم الفارغ يُرفض بلا كتابة', async () => {
  const w = world({ journey_stages: [stage('intro', 'admission', 1), stage('report', 'impact', 2)] });
  try {
    const r: any = await A.stageCreate(ADMIN, { program_id: PROG, title_ar: 'التدريب', phase: 'qualification' });
    const keys = w.tables.journey_stages.sort((a: Row, b: Row) => a.sort - b.sort).map((s: Row) => s.key);
    assertEquals(keys, ['intro', r.row.key, 'report']);
    assertEquals(r.row.rules, {});
    const before = w.writes.length;
    assertEquals((await assertRejects(() => A.stageCreate(VIEWER, { program_id: PROG, title_ar: 'س', phase: 'impact' }), Fail) as any).status, 403);
    await assertRejects(() => A.stageCreate(ADMIN, { program_id: PROG, title_ar: '  ', phase: 'impact' }), Fail);
    assertEquals(w.writes.length, before);
  } finally { w.restore(); }
});

Deno.test('الإخفاء بدل الحذف: نشاط له تقدم أو في نسخة محفوظة لا يُحذف نهائيًا، وما لم يدخل شيئًا يُحذف', async () => {
  const w = world({
    participant_requirements: [{ participant_id: U(77), requirement_id: U(1), status: 'done' }],
    program_versions: [{ id: U(800), program_id: PROG, number: 1, data: { requirements: [{ id: U(2) }] } }],
  });
  try {
    assertEquals((await assertRejects(() => A.remove(ADMIN, { entity: 'stage_requirements', id: U(1) }), Fail) as any).code, 'in_use');
    assertEquals((await assertRejects(() => A.remove(ADMIN, { entity: 'stage_requirements', id: U(2) }), Fail) as any).code, 'in_version');
    assertEquals(w.tables.stage_requirements.length, 6);
    await A.remove(ADMIN, { entity: 'stage_requirements', id: U(3) });
    assertEquals(w.tables.stage_requirements.some((r: Row) => r.id === U(3)), false);
  } finally { w.restore(); }
});
