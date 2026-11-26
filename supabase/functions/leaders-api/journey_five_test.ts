// رحلة المشارك، البنود الخمسة (جولة المشارك 2026-11-19): تواريخ المراحل من خطة الدفعة نفسها، وسبب القفل مفصّلًا من الحساب
// الذي قفل، وتفصيل النتيجة الختامية بما يحق للمشارك وحده، واسم الملف المرفوع واستبداله بحارسه وسجله وحذف القديم،
// والمرحلة الموقوفة تُسمّى لمن عمل فيها وحده. الخلفية قاعدة في الذاكرة ومخزن وهمي.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, placeOrgMembers } from './_fake_db.ts';
const { db, storage } = await import('./core.ts');
const { journeyFor, mePayload, requirementUpdate } = await import('./participant.ts');
const { stageWindows } = await import('./stage-windows.js');
const { computeFinal, finalBreakdown, finalComponents } = await import('./final.js');

type Row = Record<string, any>;
const PID = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const OLD = `${PID}/evidence/11111111-1111-4111-8111-111111111111.pdf`;
const NEW = `${PID}/evidence/22222222-2222-4222-8222-222222222222.docx`;
const P = { id: PID, full_name: 'سارة الأحمد', email: 'sara@example.test', status: 'enrolled', organization_id: null, profile_completed_at: '2026-10-01T08:00:00Z', created_at: '2026-09-30T08:00:00Z', consented_at: '2026-10-01T08:00:00Z' };
const STAGES = [
  { program_id: 'prog', key: 'start', sort: 1, title_ar: 'البداية', active: true, duration_days: 7 },
  { program_id: 'prog', key: 'work', sort: 2, title_ar: 'التطبيق', active: true, duration_days: 14 },
  { program_id: 'prog', key: 'gate', sort: 3, title_ar: 'العرض', active: true, duration_days: 7, rules: { unlock: 'day', day: 400 } },
  { program_id: 'prog', key: 'extra', sort: 4, title_ar: 'الإثراء', active: true, duration_days: 7 },
];
const REQS = [
  { id: 'r1', program_id: 'prog', stage_key: 'start', code: 'P-INFO', kind: 'auto', sort: 1, title_ar: 'الملف', active: true },
  { id: 'r2', program_id: 'prog', stage_key: 'work', code: 'W-PLAN', kind: 'upload', needs_review: true, sort: 1, title_ar: 'خطة التطبيق', active: true },
  { id: 'r3', program_id: 'prog', stage_key: 'work', code: 'W-NOTE', kind: 'upload', needs_review: false, sort: 2, title_ar: 'ملاحظة ميدانية', active: true },
  { id: 'r4', program_id: 'prog', stage_key: 'gate', code: 'G-SHOW', kind: 'task', sort: 1, title_ar: 'العرض الختامي', active: true },
  { id: 'r5', program_id: 'prog', stage_key: 'extra', code: 'X-READ', kind: 'task', sort: 1, title_ar: 'قراءة إثرائية', active: true },
];
const world = (over: Record<string, Row[]> = {}, cohort: Row = {}): Record<string, Row[]> => ({
  participants: [P],
  programs: [{ id: 'prog', is_default: true, name: 'البرنامج', final_eval: null }],
  cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', is_default: false, organization_id: null, status: 'running', program_id: 'prog', starts_on: '2026-11-01', ends_on: '2026-12-31', schedule: {}, ...cohort }],
  enrollments: [{ participant_id: PID, cohort_id: 'c1', status: 'active', created_at: '2026-10-20T08:00:00Z' }],
  journey_stages: STAGES.map((s) => ({ ...s })),
  stage_requirements: REQS.map((r) => ({ ...r })),
  placements: ['milestone', 'impact', 'leadership'].map((d) => ({ participant_id: PID, dimension: d, level: 'L2', approved_at: '2026-10-05T08:00:00Z' })),
  assessments: [{ id: 'a1', participant_id: PID, status: 'submitted', submitted_at: '2026-10-03T08:00:00Z', instruments: { kind: 'baseline' } }],
  participant_requirements: [],
  audit_log: [],
  ...over,
});
// مخزن وهمي: يسجّل ما حُذف
function fakeStorage() {
  const removed: string[] = [];
  const prev = (storage as any).from;
  (storage as any).from = () => ({ remove: (paths: string[]) => { removed.push(...paths); return Promise.resolve({ data: [], error: null }); } });
  return { removed, restore: () => { (storage as any).from = prev; } };
}
async function withWorld<T>(tables: Record<string, Row[]>, fn: (t: Record<string, Row[]>, removed: string[]) => Promise<T>) {
  const prevFrom = (db as any).from;
  placeOrgMembers(tables);
  installFake(tables);
  const st = fakeStorage();
  try { return await fn(tables, st.removed); } finally { (db as any).from = prevFrom; st.restore(); }
}
const stageOf = (j: any, key: string) => j.journey.find((s: any) => s.key === key);

Deno.test('تواريخ المراحل: نافذة كل مرحلة من خطة الدفعة نفسها (stageWindows)، بلا مصدر ثانٍ', async () => {
  await withWorld(world(), async (t) => {
    const j: any = await journeyFor(P);
    const plan = stageWindows(t.journey_stages, t.cohorts[0]) as Record<string, any>;
    assert(Object.keys(plan).length >= 3, 'للدفعة المؤرخة نوافذ');
    for (const s of j.journey) assertEquals(s.window, plan[s.key], `نافذة ${s.key} هي نافذة الخطة حرفًا`);
    assertEquals(stageOf(j, 'start').window, { from: '2026-11-01', to: '2026-11-07' });
    assertEquals(stageOf(j, 'work').window, { from: '2026-11-08', to: '2026-11-21' });
  });
});

Deno.test('تواريخ المراحل: خطة الدفعة المعدّلة تغيّر ما يراه المشارك، فالمصدر واحد', async () => {
  await withWorld(world({}, { schedule: { start: { days: 10 } } }), async () => {
    const j: any = await journeyFor(P);
    assertEquals(stageOf(j, 'start').window, { from: '2026-11-01', to: '2026-11-10' });
    assertEquals(stageOf(j, 'work').window.from, '2026-11-11');
  });
});

Deno.test('دفعة بلا بداية والدفعة المفتوحة: لا نافذة لأي مرحلة، فلا يُعرض تاريخ ولا بديل عنه', async () => {
  for (const cohort of [{ starts_on: null, ends_on: null }, { is_default: true }]) {
    await withWorld(world({}, cohort), async () => {
      const j: any = await journeyFor(P);
      for (const s of j.journey) assert(!('window' in s), `لا نافذة لـ${s.key}`);
    });
  }
});

Deno.test('سبب القفل مفصّلًا من حساب الفتح نفسه: ما تنتظره المرحلة، وتاريخ فتحها', async () => {
  await withWorld(world(), async () => {
    const j: any = await journeyFor(P);
    assertEquals(stageOf(j, 'start').status, 'done');
    assertEquals(stageOf(j, 'work').status, 'active');
    assert(!('lock' in stageOf(j, 'work')), 'غير المقفلة بلا تفصيل قفل');
    // «العرض» تُفتح يوم 400 من بداية الدفعة
    const gate = stageOf(j, 'gate');
    assertEquals(gate.status, 'locked');
    assertEquals(gate.lock, { unlock: 'day', waits: [], due: [], date: '2027-12-06' });
    assertEquals(gate.lock_reason, 'تُفتح في 2027-12-06');
    // «الإثراء» بعد الإلزامية قبلها: تنتظر ما لم يكتمل منها بمفاتيحه
    const extra = stageOf(j, 'extra');
    assertEquals(extra.lock.unlock, 'previous');
    assertEquals(extra.lock.waits, ['work', 'gate']);
  });
});

// لقطة تقييم كما يحفظها الرفع: مكوّنات بأسبابها وتعديل خبير بتعليله
const snapshot = () => computeFinal(
  finalComponents({ continuous: { index: 80, components: [{ label: 'اختبارات الكتاب', value: 60 }] }, milestones: { total: 5, done: 4, late: 1, max_late: 3 }, capstone: { score: 70, status: 'approved' }, post: null }),
  null,
  { components: { project: { value: 75, reason: 'تعليل داخلي من الخبير لا يصل المشارك' } }, notes_to_participant: 'أكمل خطة القياس ثم أعد التسليم.' },
  { ended: true },
);
const finals = (extra: Row = {}) => [{ participant_id: PID, program_id: 'prog', score: 62, decision: 'pass_notes', status: 'approved', decided_at: '2026-12-20T10:00:00Z',
  adjust: { notes_to_participant: 'أكمل خطة القياس ثم أعد التسليم.', edited_by: ['expert@example.test'] }, votes: [{ by: 'chair@example.test', vote: 'approve' }], submitted_by: 'expert@example.test', snapshot: snapshot(), ...extra }];

Deno.test('تفصيل النتيجة: كل مكوّن بوزنه ودرجة المشارك فيه من اللقطة المعتمدة، ولا شيء داخلي', async () => {
  await withWorld(world({ final_evaluations: finals() }), async () => {
    const me: any = await mePayload(P);
    const d = me.final.detail;
    assertEquals(d.components.map((c: any) => [c.key, c.weight, c.value, c.state]), [
      ['continuous', 30, 80, 'scored'], ['milestones', 20, 70, 'scored'], ['project', 30, 75, 'scored'], ['post', 20, 0, 'zeroed'],
    ]);
    assertEquals(d.thresholds, { pass: 70, pass_notes: 60, extend: 45 });
    assertEquals(me.final.notes, 'أكمل خطة القياس ثم أعد التسليم.');
    // ما لا يحق له: تعليل التعديل، والدرجة الآلية قبله، وأسباب الحساب، ومن عدّل أو صوّت أو رفع
    const text = JSON.stringify(me.final);
    for (const secret of ['تعليل داخلي', 'adjust_reason', 'auto_score', '"auto"', 'edited_by', 'expert@example.test', 'chair@example.test', 'votes', 'submitted_by', 'أضعفها']) {
      assert(!text.includes(secret), `لا يصل المشارك: ${secret}`);
    }
    assertEquals(Object.keys(d).sort(), ['components', 'coverage', 'score_adjusted', 'thresholds']);
    assertEquals(Object.keys(d.components[0]).sort(), ['key', 'label', 'state', 'value', 'weight']);
  });
});

Deno.test('تفصيل النتيجة: تقييم بلا لقطة يعيد null (البديل الصادق)، ومفتاح حجب المعادلة يحجب التفصيل معها', async () => {
  await withWorld(world({ final_evaluations: finals({ snapshot: null }) }), async () => {
    const me: any = await mePayload(P);
    assertEquals(me.final.detail, null);
    assertEquals([me.final.decision, me.final.score], ['pass_notes', 62]);
  });
  await withWorld(world({ final_evaluations: finals() }, { visibility: { par_final_policy: false } }), async () => {
    const me: any = await mePayload(P);
    assertEquals(me.final_policy, null);
    assertEquals(me.final.detail, null);
    assertEquals(me.final.decision_ar, 'اجتاز بملاحظات');
    // والإدارة تراه كاملًا
    assert((await mePayload(P, 'admin') as any).final.detail.components.length === 4);
  });
});

Deno.test('تفصيل النتيجة: غير المعتمد لا يظهر منه شيء، ولا يُقرأ تقييم مشارك آخر', async () => {
  await withWorld(world({ final_evaluations: [...finals({ status: 'pending' }), ...finals({ participant_id: OTHER, score: 99 })] }), async () => {
    assertEquals((await mePayload(P) as any).final, null);
  });
});

Deno.test('finalBreakdown: الدرجة المعدّلة عند الاعتماد تُعلن، والمكوّن الغائب «لم يدخل الحساب»، وبلا وزن لا يظهر', () => {
  const comps = finalComponents({ continuous: { index: 50, components: [] }, milestones: null, capstone: { score: 40 }, post: null });
  const snap = computeFinal(comps, { weights: { continuous: 50, milestones: 0, project: 30, post: 20 } }, { score: { value: 58, reason: 'رفع بعد مراجعة اللجنة للعمل' } }, {});
  const d: any = finalBreakdown(snap);
  assertEquals(d.components.map((c: any) => [c.key, c.state]), [['continuous', 'scored'], ['project', 'scored'], ['post', 'missing']]);
  assertEquals(d.score_adjusted, true);
  assertEquals(finalBreakdown(null), null);
  assertEquals(finalBreakdown({ components: [] }), null);
});

const row = (requirement_id: string, extra: Row) => ({ id: `pr-${requirement_id}`, participant_id: PID, requirement_id, ...extra });

Deno.test('الملف المرفوع: يُحفظ اسمه ووقت رفعه مع صف البند، ويراهما المشارك في رحلته', async () => {
  await withWorld(world(), async (t) => {
    const r: any = await requirementUpdate(P, { requirement_id: 'r2', evidence_path: NEW, evidence_name: 'خطة التطبيق النهائية.docx' });
    const saved = t.participant_requirements.at(-1)!;
    assertEquals([saved.status, saved.evidence_path, saved.answers.file.name], ['submitted', NEW, 'خطة التطبيق النهائية.docx']);
    const item = r.journey.find((s: any) => s.key === 'work').items.find((i: any) => i.id === 'r2');
    assertEquals(item.file.name, 'خطة التطبيق النهائية.docx');
    assertEquals(item.file.kind, 'ملف Word');
    assert(!Number.isNaN(Date.parse(item.file.at)), 'وقت الرفع محفوظ');
    assertEquals(t.audit_log.length, 0, 'الرفع الأول ليس استبدالًا');
  });
});

Deno.test('استبدال ملف بانتظار المراجعة: يبقى بانتظار المراجعة، ويُسجَّل، ويُحذف القديم من المخزن', async () => {
  const before = [row('r2', { status: 'submitted', evidence_path: OLD, answers: { file: { name: 'مسودة.pdf', at: '2026-11-10T08:00:00Z' } }, submitted_at: '2026-11-10T08:00:00Z' })];
  await withWorld(world({ participant_requirements: before }), async (t, removed) => {
    const r: any = await requirementUpdate(P, { requirement_id: 'r2', evidence_path: NEW, evidence_name: 'النسخة الصحيحة.docx' });
    const item = r.journey.find((s: any) => s.key === 'work').items.find((i: any) => i.id === 'r2');
    assertEquals([item.status, item.file.name], ['submitted', 'النسخة الصحيحة.docx']);
    assertEquals(removed, [OLD], 'القديم وحده يُحذف، فلا ملف يتيم');
    const log = t.audit_log.filter((a) => a.action === 'requirement.file-replace');
    assertEquals(log.length, 1);
    assertEquals([log[0].actor_type, log[0].actor, log[0].entity, log[0].entity_id], ['participant', PID, 'participants', PID]);
    assertEquals([log[0].before.path, log[0].before.name, log[0].after.path, log[0].after.name], [OLD, 'مسودة.pdf', NEW, 'النسخة الصحيحة.docx']);
  });
});

Deno.test('استبدال ملف أُعيد للتعديل: يعود للمراجعة بملفه الجديد', async () => {
  const before = [row('r2', { status: 'returned', evidence_path: OLD, note: 'أضف مالك كل إجراء', answers: { file: { name: 'مسودة.pdf', at: '2026-11-10T08:00:00Z' } } })];
  await withWorld(world({ participant_requirements: before }), async (t, removed) => {
    await requirementUpdate(P, { requirement_id: 'r2', evidence_path: NEW, evidence_name: 'معدّل.docx' });
    assertEquals(t.participant_requirements.at(-1)!.status, 'submitted');
    assertEquals(removed, [OLD]);
  });
});

Deno.test('ما اعتمده المستشار لا يُستبدل: يُرفض، وصفه كما هو، والملف المرفوع للتو يُحذف فلا يبقى يتيمًا', async () => {
  const before = [row('r2', { status: 'done', evidence_path: OLD, completed_at: '2026-11-12T08:00:00Z', reviewed_by: 'advisor@example.test', answers: { file: { name: 'معتمد.pdf', at: '2026-11-10T08:00:00Z' } } })];
  await withWorld(world({ participant_requirements: before }), async (t, removed) => {
    const e: any = await assertRejects(() => requirementUpdate(P, { requirement_id: 'r2', evidence_path: NEW, evidence_name: 'بديل.docx' }));
    assertEquals([e.status, e.code], [409, 'reviewed']);
    assertEquals(t.participant_requirements.length, 1);
    assertEquals([t.participant_requirements[0].status, t.participant_requirements[0].evidence_path], ['done', OLD]);
    assertEquals(removed, [NEW], 'الجديد غير المحفوظ يُحذف، والمعتمد باقٍ');
    assertEquals(t.audit_log.length, 0);
  });
});

Deno.test('بند رفع بلا مراجعة: يُستبدل بعد إتمامه، ويبقى منجزًا', async () => {
  const before = [row('r3', { status: 'done', evidence_path: OLD, completed_at: '2026-11-12T08:00:00Z', answers: { file: { name: 'ملاحظة.pdf', at: '2026-11-12T08:00:00Z' } } })];
  await withWorld(world({ participant_requirements: before }), async (t, removed) => {
    await requirementUpdate(P, { requirement_id: 'r3', evidence_path: NEW, evidence_name: 'ملاحظة 2.docx' });
    assertEquals(t.participant_requirements.at(-1)!.status, 'done');
    assertEquals(removed, [OLD]);
    assertEquals(t.audit_log.filter((a) => a.action === 'requirement.file-replace').length, 1);
  });
});

Deno.test('مسار ملف مشارك آخر يُرفض قبل أي حفظ أو حذف، واسم الملف يُنظَّف', async () => {
  await withWorld(world(), async (t, removed) => {
    await assertRejects(() => requirementUpdate(P, { requirement_id: 'r2', evidence_path: `${OTHER}/evidence/22222222-2222-4222-8222-222222222222.pdf`, evidence_name: 'x.pdf' }));
    assertEquals([t.participant_requirements.length, removed.length], [0, 0]);
    await requirementUpdate(P, { requirement_id: 'r2', evidence_path: NEW, evidence_name: '../../etc/‮خطة\u0000.docx' });
    assertEquals(t.participant_requirements.at(-1)!.answers.file.name, 'خطة.docx');
  });
});

Deno.test('المرحلة الموقوفة لدفعته: تُسمّى لمن عمل فيها وحده، ولا تعود مرحلة في رحلته', async () => {
  const off = { schedule: { extra: { off: true } } };
  // لم يعمل فيها: لا يراها أصلًا كما كان
  await withWorld(world({}, off), async () => {
    const me: any = await mePayload(P);
    assert(!me.journey.some((s: any) => s.key === 'extra'));
    assert(!('stages_off' in me));
  });
  // له صف محفوظ في بند منها: سطر باسمها
  await withWorld(world({ participant_requirements: [row('r5', { status: 'done', completed_at: '2026-11-03T08:00:00Z' })] }, off), async () => {
    const me: any = await mePayload(P);
    assert(!me.journey.some((s: any) => s.key === 'extra'));
    assertEquals(me.stages_off, [{ key: 'extra', title_ar: 'الإثراء', phase: null }]);
    // وللإدارة لا يُرسل: خريطتها تعرض الموقوفة بطريقتها
    assert(!('stages_off' in (await mePayload(P, 'admin') as any)));
  });
});
