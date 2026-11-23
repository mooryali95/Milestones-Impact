// نقل المشارك بين المراحل (admin.stage-move) والسجل الكامل (admin.participant-timeline)، تصور ملف المشارك 2026-11-23.
// على دوال الخادم نفسها بقاعدة في الذاكرة: النقل إلى الأمام باعتماد وإعفاء، والإرجاع يلغي التدخلات بعد الهدف ولا يمحو
// إنجازًا، والرفض بلا سبب أو لهدف خارج الرحلة أو لدور العرض قبل أي كتابة، وسطر سجل واحد، والحساب التجريبي كالتدخل في مرحلة.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

const A = await import('./admin.ts');
const FL = await import('./file.ts');
const { planMove, journeyPhases, moveSummary } = await import('./stage-move.js');
const { fullTimelineOf } = await import('./observations.js');
const { resetSettingsCache } = await import('./settings.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(900), P = U(1), DEMO = U(2);
const ADMIN: any = { email: 'admin@example.sa', role: 'admin', id: 'a1', method: 'passkey' };
const VIEWER: any = { email: 'view@example.sa', role: 'viewer', id: 'a2', method: 'passkey' };
const now = new Date().toISOString();

const STAGES: Row[] = [
  ['intro', 'التهيئة', 'admission'], ['training', 'التدريب', 'qualification'], ['ojt', 'التوجيه على رأس العمل', 'qualification'],
  ['consulting', 'الاستشارة', 'qualification'], ['report', 'التقرير', 'impact'],
].map(([key, title_ar, phase], i) => ({ program_id: PROG, key, sort: i + 1, title_ar, phase, rules: {}, active: true, duration_days: 7 }));
const REQS: Row[] = STAGES.map((s, i) => ({ id: U(500 + i), program_id: PROG, stage_key: s.key, code: `X-${i}`, kind: 'check', sort: 1, title_ar: `بند ${s.title_ar}`, required: true, active: true, dimension: null, level: null, config: {} }));
const placed = (pid: string) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: pid, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z' }));
const person = (id: string, extra: Row = {}) => ({ id, full_name: 'سارة', email: `p${id.slice(-1)}@example.sa`, is_demo: false, is_test: false, organization_id: null, status: 'enrolled',
  created_at: '2026-10-01T08:00:00Z', last_login_at: now, profile_completed_at: '2026-10-02T08:00:00Z', consented_at: now, ...extra });

function world() {
  resetSettingsCache();
  const tables: Record<string, Row[]> = {
    participants: [person(P), person(DEMO, { is_demo: true, email: 'demo@demo.milestone-impact.org' })], audit_log: [], mail_queue: [], mail_log: [],
    programs: [{ id: PROG, is_default: true, name: 'برنامج القادة', final_eval: null, cert: {} }],
    cohorts: [{ id: U(901), name: 'الدفعة المفتوحة', is_default: true, organization_id: null, status: 'running', program_id: PROG, starts_on: '2026-11-01', ends_on: '2027-03-01', schedule: {} }],
    enrollments: [], entitlements: [], organizations: [], app_settings: [], payment_settings: [{ id: true, enabled: false }],
    journey_stages: STAGES.map((s) => ({ ...s })), stage_requirements: REQS.map((r) => ({ ...r })),
    placements: [...placed(P), ...placed(DEMO)],
    // أنجز التهيئة ببندها، فموضعه «التدريب»
    participant_requirements: [P, DEMO].map((pid) => ({ participant_id: pid, requirement_id: REQS[0].id, status: 'done', completed_at: '2026-10-10T08:00:00Z' })),
    participant_stage_overrides: [], assessments: [], workshop_attendance: [], coaching_sessions: [], model_submissions: [], capstones: [], participant_observations: [], auth_sessions: [],
  };
  const f = installFake(tables);
  const ov = (pid = P) => Object.fromEntries(f.tables.participant_stage_overrides.filter((o) => o.participant_id === pid).map((o) => [o.stage_key, o.action]));
  return { ...f, ov, restore: () => { f.restore(); resetSettingsCache(); } };
}
const statuses = (j: Row[]) => Object.fromEntries(j.map((s) => [s.key, s.status]));

Deno.test('الخطة الخالصة: إلى الأمام تعتمد أو تعفي كل ناقص قبل الهدف، وإلى الخلف تلغي التدخلات بعده، والملخص سطر واحد', () => {
  const j = [
    { key: 'a', title_ar: 'أ', status: 'done' }, { key: 'b', title_ar: 'ب', status: 'active' }, { key: 'c', title_ar: 'ج', status: 'locked' },
    { key: 't', title_ar: 'مسار', status: 'active', lane: 'track' }, { key: 'd', title_ar: 'د', status: 'locked', rules: { unlock: 'approval' } },
  ];
  const f: any = planMove(j, 'd', { c: 'skip' });
  assertEquals([f.ok, f.direction, f.writes.map((w: any) => [w.key, w.action])], [true, 'forward', [['b', 'complete'], ['c', 'skip'], ['d', 'open']]]);
  assertEquals(f.summary, 'سينتقل إلى «د»، وتُعتمد مرحلة واحدة ويُعفى من واحدة');
  assertEquals((planMove(j, 'b') as any).error, 'هو في هذه المرحلة الآن');
  assertEquals((planMove(j, 't') as any).ok, false);   // المسار المستمر ليس هدف نقل
  assertEquals((planMove(j, 'x') as any).ok, false);
  assertEquals((planMove(j, 'c', { b: 'burn' }) as any).error, 'اختيار غير معروف لمرحلة');
  const back = [{ key: 'a', title_ar: 'أ', status: 'done', override: 'complete' }, { key: 'b', title_ar: 'ب', status: 'done', override: 'skip' }, { key: 'c', title_ar: 'ج', status: 'active' }];
  const r: any = planMove(back, 'a');
  assertEquals([r.direction, r.clears.map((c: any) => c.key), r.writes, r.keepsDone], ['backward', ['a', 'b'], [], []]);
  // التتابع وحده لا يحتاج فتحًا: يُفتح الهدف باكتمال ما قبله، فلا يبقى تدخل زائد
  assertEquals((planMove(j, 'c') as any).writes.map((w: any) => [w.key, w.action]), [['b', 'complete']]);
  assertEquals(moveSummary('أ', [{ action: 'complete' }, { action: 'complete' }, { action: 'skip' }] as any), 'سينتقل إلى «أ»، وتُعتمد مرحلتان ويُعفى من واحدة');
  // الأطوار من المصدر الواحد: المسار بعد كتلة مرجعه، والخدمة خارجها
  const ph = journeyPhases([{ key: 'a', phase: 'admission' }, { key: 'b', phase: 'qualification' }, { key: 't', phase: 'qualification', lane: 'track', rules: { with: 'b' } }, { key: 's', lane: 'service' }]);
  assertEquals([ph.phases.map((p: any) => [p.key, p.units.map((u: any) => u.map((s: any) => s.key))]), ph.services.map((s: any) => s.key)], [[['admission', [['a']]], ['qualification', [['b'], ['t']]]], ['s']]);
});

Deno.test('النقل إلى الأمام: يعتمد ويعفي كما اختار المدير، بسطر سجل واحد يحمل الخطة وسببها، ويعيد الرحلة الجديدة', async () => {
  const w = world();
  try {
    const r: any = await A.stageMove(ADMIN, { participant_id: P, stage_key: 'consulting', choices: { ojt: 'skip' }, reason: 'أنجز التدريب والتوجيه خارج المنصة' });
    assertEquals(w.ov(), { training: 'complete', ojt: 'skip' });
    assertEquals(statuses(r.journey), { intro: 'done', training: 'done', ojt: 'done', consulting: 'active', report: 'locked' });
    assertEquals(r.summary, 'سينتقل إلى «الاستشارة»، وتُعتمد مرحلة واحدة ويُعفى من واحدة');
    const logs = w.tables.audit_log.filter((x) => x.entity_id === P);
    assertEquals(logs.map((x) => x.action), ['stage.move']);
    assertEquals(logs[0].after, { to: 'consulting', direction: 'forward', program: PROG, reason: 'أنجز التدريب والتوجيه خارج المنصة', writes: [{ stage: 'training', action: 'complete' }, { stage: 'ojt', action: 'skip' }], clears: [] });
    // التدخل نفسه الذي يكتبه admin.stage-override: سببه ومن كتبه
    assert(w.tables.participant_stage_overrides.every((o) => o.note === 'أنجز التدريب والتوجيه خارج المنصة' && o.by_email === ADMIN.email && o.program_id === PROG));
  } finally { w.restore(); }
});

Deno.test('النقل إلى الخلف: يلغي التدخلات من الهدف وما بعده ويفتح الهدف، ولا يمحو بندًا أنجزه', async () => {
  const w = world();
  try {
    await A.stageMove(ADMIN, { participant_id: P, stage_key: 'report', reason: 'تقدم سريع' });
    assertEquals(w.ov(), { training: 'complete', ojt: 'complete', consulting: 'complete' });
    const r: any = await A.stageMove(ADMIN, { participant_id: P, stage_key: 'training', reason: 'لم يحضر التدريب فعليًا' });
    assertEquals(w.ov(), {});
    assertEquals(statuses(r.journey), { intro: 'done', training: 'active', ojt: 'locked', consulting: 'locked', report: 'locked' });
    assertEquals(w.tables.participant_requirements.filter((x) => x.participant_id === P).length, 1);   // إنجاز التهيئة باقٍ
    assertEquals(w.tables.audit_log.filter((x) => x.entity_id === P).map((x) => [x.action, x.after.direction]), [['stage.move', 'forward'], ['stage.move', 'backward']]);
  } finally { w.restore(); }
});

Deno.test('الرفض قبل أي كتابة: بلا سبب، ولهدف خارج الرحلة أو هو فيه، ولدور العرض، ولمشارك غير موجود', async () => {
  const w = world();
  try {
    await assertRejects(() => A.stageMove(ADMIN, { participant_id: P, stage_key: 'report', reason: ' ' }), Error, 'اكتب سبب النقل');
    await assertRejects(() => A.stageMove(ADMIN, { participant_id: P, stage_key: 'nowhere', reason: 'سبب كافٍ' }), Error, 'ليست في رحلة');
    await assertRejects(() => A.stageMove(ADMIN, { participant_id: P, stage_key: 'training', reason: 'سبب كافٍ' }), Error, 'هو في هذه المرحلة');
    await assertRejects(() => A.stageMove(ADMIN, { participant_id: P, stage_key: 'report', choices: { ojt: 'delete' }, reason: 'سبب كافٍ' }), Error, 'اختيار غير معروف');
    await assertRejects(() => A.stageMove(VIEWER, { participant_id: P, stage_key: 'report', reason: 'سبب كافٍ' }), Error, 'للعرض فقط');
    await assertRejects(() => A.stageMove({ ...ADMIN, method: 'email_code' }, { participant_id: P, stage_key: 'report', reason: 'سبب كافٍ' }), Error, 'يتطلب تأكيدًا');
    await assertRejects(() => A.stageMove(ADMIN, { participant_id: U(77), stage_key: 'report', reason: 'سبب كافٍ' }), Error, 'المشارك غير موجود');
    assertEquals([w.tables.participant_stage_overrides.length, w.tables.audit_log.length], [0, 0]);
  } finally { w.restore(); }
});

Deno.test('الحساب التجريبي يُنقل كما يُتدخَّل في مرحلته (admin.stage-override)، ولا يُمس غيره', async () => {
  const w = world();
  try {
    await A.stageOverride(ADMIN, { participant_id: DEMO, stage_key: 'training', stage_action: 'complete', note: 'للعرض' });
    await A.stageMove(ADMIN, { participant_id: DEMO, stage_key: 'consulting', reason: 'للعرض على الجهة' });
    assertEquals(w.ov(DEMO), { training: 'complete', ojt: 'complete' });
    assertEquals(w.ov(P), {});
  } finally { w.restore(); }
});

Deno.test('السجل الكامل: من التسجيل، بلا تكرار لما له مصدر، بمرشح النوع وصفحات لا يسقط بينها سطر', async () => {
  const w = world();
  try {
    w.tables.auth_sessions.push({ participant_id: P, created_at: '2026-10-01T09:00:00Z' });
    w.tables.assessments.push({ participant_id: P, started_at: '2026-10-02T09:00:00Z', submitted_at: '2026-10-03T09:00:00Z', instruments: { kind: 'baseline' } });
    w.tables.audit_log.push({ entity_id: P, actor: P, actor_type: 'participant', action: 'assessment.submit', created_at: '2026-10-03T09:00:00Z' });
    for (let i = 0; i < 60; i++) w.tables.audit_log.push({ entity_id: P, actor: 'admin@example.sa', actor_type: 'admin', action: 'participant.nudge', created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() });
    const first: any = await FL.participantTimeline({ participant_id: P });
    assertEquals(first.rows.length, 50);
    assert(first.next);
    const second: any = await FL.participantTimeline({ participant_id: P, before: first.next });
    const all = [...first.rows, ...second.rows];
    assertEquals(second.next, null);
    assertEquals(all.filter((x) => x.text === 'ذُكِّر بمتابعة رحلته').length, 60);
    assertEquals(all.filter((x) => x.text === 'سلّم القياس').length, 1);   // لا يتكرر من السجل
    assertEquals(all.at(-1).text, 'سجّل في المنصة');
    assert(all.some((x) => x.text === 'أول دخول'));
    const only: any = await FL.participantTimeline({ participant_id: P, types: ['assessment'] });
    assertEquals(only.rows.map((x: any) => x.text), ['اعتُمد مستواه', 'سلّم القياس', 'بدأ القياس']);
    assertEquals(w.writes.length, 0);   // قراءة فقط
  } finally { w.restore(); }
});

Deno.test('السجل الكامل الخالص: قرار الإدارة يحمل سببه، والملاحظة نوعها', () => {
  const t = fullTimelineOf({ history: [{ created_at: '2026-11-02T00:00:00Z', action: 'stage.move', actor_type: 'admin', after: { reason: 'أنجزها خارج المنصة' } }],
    observations: [{ created_at: '2026-11-01T00:00:00Z', kind: 'warning', title: 'غياب', body: 'غاب يومين', source: 'admin' }] });
  assertEquals(t.rows.map((r: any) => [r.type, r.text, r.detail]), [['decision', 'نُقل إلى مرحلة', 'السبب: أنجزها خارج المنصة'], ['note', 'تنبيه: غياب', 'غاب يومين']]);
});
