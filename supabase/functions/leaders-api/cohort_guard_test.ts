// حراس المشاركين الأحياء في cohortSave: دفعة جهة ثانية على برنامج آخر تُرفض بلا confirm_move وتُقبل به، وعلى البرنامج
// نفسه تمر بلا تأكيد، وإخفاء آخر بند إلزامي في مرحلة تكتمل بإلزاميتها يُرفض، وبرنامج دفعة لأعضائها تقدم لا يتغير.
// قاعدة في الذاكرة بنمط program_gate_test.ts، بلا شبكة.
import { placeOrgMembers } from './_fake_db.ts';
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail } = await import('./core.ts');
const { cohortSave, cohortEnroll, defaultProgramId, orgCohortSetups, cohortDefinitionFor, cohortGroups, journeyDefinition } = await import('./programs.ts');
const { cohortPlanAction } = await import('./cohort-plan.ts');

type Row = Record<string, any>;
const MAX_ROWS = 1000;
function install(tables: Record<string, Row[]>) {
  placeOrgMembers(tables);
  let seq = 0;
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let single = false, limit = Infinity, range: [number, number] | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') { for (const r of out) Object.assign(r, payload); return { data: single ? out[0] ?? null : out, error: null }; }
      if (mode === 'delete') { tables[table] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      // كالإنتاج: القراءة الواحدة تقف عند max_rows (1000) بلا خطأ، فما لا يقرأ بصفحات range يُقتطع
      const cut = range ? out.slice(range[0], Math.min(range[1] + 1, range[0] + MAX_ROWS)) : out.slice(0, Math.min(limit, MAX_ROWS));
      return { data: single ? cut[0] ?? null : cut, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        // رابط بمعرفات كثيرة يتجاوز حده في الإنتاج: allFor يقسمها 150
        if (k === 'in') return (c: string, vs: unknown[]) => { if (vs.length > 150) throw new Error(`in بـ${vs.length} معرّفًا`); filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'range') return (f: number, t: number) => { range = [f, t]; return q; };
        if (k === 'limit') return (n: number) => { limit = n; return q; };
        if (k === 'maybeSingle' || k === 'single') return () => { single = true; return q; };
        return () => q;
      },
    });
    return q;
  };
  const prev = { from: (db as any).from };
  Object.assign(db as any, { from });
  return { tables, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(1), PA = U(2), PB = U(3), C1 = U(4), P1 = U(5), P2 = U(6), R1 = U(7), R2 = U(8);
const admin = { email: 'a@x.sa', role: 'admin' as const };
function world() {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null }, { id: PB, is_default: false, archived_at: null }],
    program_versions: [],
    // البرنامج الآخر برحلة من مرحلة وبند: الدفعة الجديدة تُثبَّت على نسخة، والبرنامج بلا متطلبات لا نسخة له (program_pin_test.ts)
    journey_stages: [{ program_id: PA, key: 's1', title_ar: 'التمهيد', sort: 1, active: true, rules: {} },
      { program_id: PB, key: 'b1', title_ar: 'مرحلة سفراء', sort: 1, active: true, rules: {} }],
    stage_requirements: [
      { id: R1, program_id: PA, stage_key: 's1', code: 'A-ONE', title_ar: 'بند', kind: 'check', required: true, active: true, sort: 1 },
      { id: R2, program_id: PA, stage_key: 's1', code: 'A-TWO', title_ar: 'بند اختياري', kind: 'check', required: false, active: true, sort: 2 },
      { id: U(40), program_id: PB, stage_key: 'b1', code: 'S-ONE', title_ar: 'بند سفراء', kind: 'check', required: false, active: true, sort: 1 },
    ],
    cohorts: [{ id: C1, name: 'سفراء 2026', organization_id: ORG, program_id: PA, program_version_id: null, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }],
    enrollments: [],
    participants: [{ id: P1, organization_id: ORG, is_demo: false }, { id: P2, organization_id: ORG, is_demo: false }],
    participant_requirements: [{ participant_id: P1, requirement_id: R1, status: 'done' }],
    cohort_experts: [], audit_log: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const second = (program_id: string) => ({ name: 'دفعة 2027', organization_id: ORG, program_id, status: 'open', starts_on: '2027-01-01' });

// تصور المرحلة 4: الدفعة إلحاق صريح، فدفعة جهة ثانية لا تنقل أحدًا: تُحفظ بلا سؤال، وأعضاء الأولى باقون فيها
Deno.test('دفعة جهة ثانية على برنامج آخر لا تنقل أحدًا: تُحفظ بلا تأكيد ويبقى الأعضاء في دفعتهم', async () => {
  const w = world();
  try {
    assertEquals(((await cohortSave(admin, second(PB))) as any).success, true);
    assertEquals(w.tables.cohorts.length, 2);
    assertEquals(w.tables.enrollments.filter((e: any) => e.status !== 'withdrawn').map((e: any) => e.cohort_id), [C1, C1]);
  } finally { w.restore(); }
});

Deno.test('confirm_move الصريح يقبل الحفظ', async () => {
  const w = world();
  try {
    const r: any = await cohortSave(admin, { ...second(PB), confirm_move: true });
    assertEquals(r.success, true);
    assertEquals(w.tables.cohorts.length, 2);
  } finally { w.restore(); }
});

Deno.test('على البرنامج نفسه لا تأكيد: معرفات المتطلبات واحدة', async () => {
  const w = world();
  try {
    assertEquals(((await cohortSave(admin, second(PA))) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('إخفاء آخر بند إلزامي في مرحلة تكتمل بإلزاميتها يُرفض، والاختياري يمر', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, hidden_requirements: ['A-ONE'] }));
    assertEquals(e.code, 'hide_breaks_stage');
    assertEquals(e.message.includes('«التمهيد»'), true);
    assertEquals(w.tables.cohorts[0].hidden_requirements, []);
    assertEquals(((await cohortSave(admin, { id: C1, hidden_requirements: ['A-TWO'] })) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('تغيير برنامج دفعة لأعضائها تقدم يُرفض، وبلا تقدم يمر', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, program_id: PB }));
    assertEquals(e.code, 'program_locked');
    assertEquals(e.extra.affected, 1);
    assertEquals(w.tables.cohorts[0].program_id, PA);
    w.tables.participant_requirements = [];
    assertEquals(((await cohortSave(admin, { id: C1, program_id: PB })) as any).success, true);
    assertEquals(w.tables.cohorts[0].program_id, PB);
  } finally { w.restore(); }
});

const DEF = U(20), C2 = U(21), ORG2 = U(22);
const openDefault = { id: DEF, name: 'الدفعة المفتوحة', is_default: true, organization_id: null, program_id: PA, program_version_id: null, status: 'open', starts_on: null, created_at: '2026-01-01T00:00:00Z', hidden_requirements: [] };

Deno.test('أول دفعة للجهة على برنامج آخر لا تنقل من على الدفعة المفتوحة بلا إلحاق: تُحفظ بلا تأكيد', async () => {
  const w = world();
  w.tables.cohorts = [openDefault];
  w.tables.enrollments = [];
  try {
    assertEquals(((await cohortSave(admin, second(PB))) as any).success, true);
  } finally { w.restore(); }
});

Deno.test('تغيير برنامج الدفعة المفتوحة يُرفض ومن يتبعها بلا تسجيل له تقدم', async () => {
  const w = world();
  w.tables.cohorts = [openDefault];
  w.tables.participants = [{ id: P1, organization_id: null, is_demo: false }];
  try {
    const e = await failOf(() => cohortSave(admin, { id: DEF, program_id: PB }));
    assertEquals(e.code, 'program_locked');
    assertEquals(e.extra.affected, 1);
    assertEquals(w.tables.cohorts[0].program_id, PA);
    // تغيير حالتها وحده لا يمس أحدًا
    assertEquals(((await cohortSave(admin, { id: DEF, status: 'running' })) as any).success, true);
  } finally { w.restore(); }
});

// القرار 5: الإغلاق لا يسحب الإلحاقات، فأعضاء الدفعة باقون عليها حتى يُنقلوا صراحة
Deno.test('إغلاق دفعة الجهة أو نقلها لجهة أخرى لا يُخرج أعضاءها: بلا تأكيد، وإلحاقهم باقٍ', async () => {
  const w = world();
  w.tables.cohorts.push({ id: C2, name: 'دفعة 2027', organization_id: ORG, program_id: PB, program_version_id: null, status: 'running', starts_on: '2027-01-01', created_at: '2027-01-01T00:00:00Z', hidden_requirements: [] });
  w.tables.enrollments = [{ participant_id: P1, cohort_id: C2, status: 'active', created_at: '2027-01-02' }];
  try {
    assertEquals(((await cohortSave(admin, { id: C2, organization_id: ORG2 })) as any).success, true);
    assertEquals(((await cohortSave(admin, { id: C2, status: 'closed' })) as any).success, true);
    assertEquals(w.tables.enrollments.map((e: any) => [e.cohort_id, e.status]), [[C2, 'active']]);
  } finally { w.restore(); }
});

Deno.test('مجموعة إخفاء كاسرة قائمة لا تمنع إغلاق الدفعة ولا تعديل اسمها، وزيادتها تُرفض', async () => {
  const w = world();
  w.tables.cohorts[0].hidden_requirements = ['A-ONE'];
  w.tables.participant_requirements = [];
  try {
    assertEquals(((await cohortSave(admin, { id: C1, name: 'سفراء 2026 أ', status: 'closed', hidden_requirements: ['A-ONE'] })) as any).success, true);
    w.tables.journey_stages.push({ program_id: PA, key: 's2', title_ar: 'التطبيق', sort: 2, active: true, rules: { complete: 'any' } });
    // البند إلزامي: هو ما يكمل المرحلة «بأي بند». الاختياري لا يكملها أصلًا (قاعدة «الاختياري لا يُحسب» 2026-11-21)، فإخفاؤه لا يكسر شيئًا جديدًا
    w.tables.stage_requirements.push({ id: U(30), program_id: PA, stage_key: 's2', code: 'B-ONE', title_ar: 'بند', kind: 'check', required: true, active: true, sort: 3 });
    const e = await failOf(() => cohortSave(admin, { id: C1, hidden_requirements: ['A-ONE', 'B-ONE'] }));
    assertEquals(e.code, 'hide_breaks_stage');
    assertEquals(e.extra.stages, ['s2']);
  } finally { w.restore(); }
});

Deno.test('عالم الحارس يُقرأ بصفحات: ما بعد الألف صف الأولى يُعد', async () => {
  const w = world();
  // 40 عضوًا ملحقون يدويًا بدفعتهم فلا ينتقلون، لكل منهم 30 صف تقدم قبل صف المنتقل الوحيد
  const stay = Array.from({ length: 40 }, (_, i) => U(100 + i));
  w.tables.participants = [...stay.map((id) => ({ id, organization_id: ORG, is_demo: false })), { id: P1, organization_id: ORG, is_demo: false }];
  w.tables.enrollments = stay.map((id, i) => ({ id: `en${i}`, participant_id: id, cohort_id: C1, status: 'active', created_at: '2026-09-02' }));
  w.tables.participant_requirements = [...stay.flatMap((id) => Array.from({ length: 30 }, (_, j) => ({ participant_id: id, requirement_id: `r${j}` }))), { participant_id: P1, requirement_id: R1 }];
  w.tables.cohorts.push({ id: U(30), name: 'أفراد ب', organization_id: null, program_id: PB, program_version_id: null, status: 'open', starts_on: '2026-10-01', created_at: '2026-10-01T00:00:00Z', hidden_requirements: [] });
  w.tables.enrollments.push({ id: 'enp1', participant_id: P1, cohort_id: C1, status: 'active', created_at: '2026-09-02' });
  try {
    // نقل الإحدى والأربعين صراحة إلى دفعة على برنامج آخر: كلهم لهم تقدم، وصفوف تقدمهم تتجاوز الألف
    const e = await failOf(() => cohortEnroll(admin, { cohort_id: U(30), participant_ids: [...stay, P1] }));
    assertEquals(e.code, 'confirm_move');
    assertEquals(e.extra.affected, 41);
  } finally { w.restore(); }
});

// الإلحاق الصريح (admin.cohort-enroll) بالحارس نفسه: كان يسحب التسجيلات ويلحق بدفعة على برنامج آخر بصمت
const E2 = U(30), E3 = U(31);
function withTargets(w: ReturnType<typeof world>) {
  w.tables.cohorts.push({ id: E2, name: 'أفراد ب', organization_id: null, program_id: PB, program_version_id: null, status: 'open', starts_on: '2026-10-01', created_at: '2026-10-01T00:00:00Z', hidden_requirements: [] });
  w.tables.cohorts.push({ id: E3, name: 'أفراد أ', organization_id: null, program_id: PA, program_version_id: null, status: 'open', starts_on: '2026-10-01', created_at: '2026-10-01T00:00:00Z', hidden_requirements: [] });
  return w;
}
Deno.test('الإلحاق بدفعة على برنامج آخر لمن له تقدم يُرفض بلا تأكيد، ولا يُسحب أحد ولا يُلحق', async () => {
  const w = withTargets(world());
  try {
    const e = await failOf(() => cohortEnroll(admin, { cohort_id: E2, participant_ids: [P1, P2] }));
    assertEquals(e.code, 'confirm_move');
    assertEquals(e.extra.affected, 1);
    assertEquals((e.extra.from as any[])[0].name, 'سفراء 2026');
    assertEquals((e.extra.to as any[])[0].name, 'أفراد ب');
    assertEquals(w.tables.enrollments.map((x: any) => [x.cohort_id, x.status]), [[C1, 'active'], [C1, 'active']]);
  } finally { w.restore(); }
});
Deno.test('الإلحاق المؤكد يمر، وعلى البرنامج نفسه أو بلا تقدم لا يُسأل', async () => {
  const w = withTargets(world());
  try {
    assertEquals(((await cohortEnroll(admin, { cohort_id: E3, participant_ids: [P1] })) as any).enrolled, 1);
    assertEquals(((await cohortEnroll(admin, { cohort_id: E2, participant_ids: [P2] })) as any).enrolled, 1);
    assertEquals(((await cohortEnroll(admin, { cohort_id: E2, participant_ids: [P1], confirm_move: true })) as any).enrolled, 1);
  } finally { w.restore(); }
});

// ── P4: وراثة برنامج الجهة ──
Deno.test('البرنامج الافتراضي يُقرأ بلا تخزين: تغيير is_default يظهر في القراءة التالية', async () => {
  const w = world();
  try {
    assertEquals(await defaultProgramId(), PA);
    w.tables.programs[0].is_default = false;
    w.tables.programs[1].is_default = true;
    assertEquals(await defaultProgramId(), PB);
  } finally { w.restore(); }
});

Deno.test('جاهزية دفعة الجهة تحمل برنامج الجهة المشتق من دفعتها الحالية، ولا تقترح المؤرشف', async () => {
  const w = world();
  try {
    w.tables.programs = [{ id: PA, name: 'برنامج القادة', is_default: true, archived_at: null }, { id: PB, name: 'برنامج سفراء', is_default: false, archived_at: null }];
    w.tables.workshop_sessions = [];
    const r: any = await orgCohortSetups([ORG]);
    assertEquals(r[ORG].program, { id: PA, name: 'برنامج القادة', via: 'current', cohort_id: C1, cohort_name: 'سفراء 2026' });
    w.tables.programs[0].archived_at = '2026-11-01T00:00:00Z';
    assertEquals(((await orgCohortSetups([ORG])) as any)[ORG].program, null);
  } finally { w.restore(); }
});

// ── P5: تعريف الدفعة مصدرًا واحدًا لنوافذها ──
const V1 = U(30);
function pinned() {
  const w = world();
  w.tables.program_versions = [{ id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: {
    stages: [{ key: 's9', title_ar: 'مرحلة النسخة', sort: 1, active: true, rules: {} }],
    requirements: [
      { id: R1, stage_key: 's9', code: 'A-ONE', title_ar: 'بند النسخة', kind: 'check', required: true, active: true, sort: 1 },
      { id: U(31), stage_key: 's9', code: 'V-OPT', title_ar: 'اختياري النسخة', kind: 'check', required: false, active: true, sort: 2 },
    ],
  } }];
  Object.assign(w.tables.cohorts[0], { program_version_id: V1, hidden_requirements: ['V-OPT'], schedule: {} });
  return w;
}

Deno.test('دفعة مثبتة على نسخة تختلف عن الحي: تعريفها مراحل النسخة وحدها، والمخفي يرجع بعلامة hidden', async () => {
  const w = pinned();
  try {
    const r: any = await cohortDefinitionFor({ cohort_id: C1 });
    assertEquals(r.version, { id: V1, number: 1, label: 'الإطلاق' });
    assertEquals(r.stages.map((s: any) => s.key), ['s9']);
    assertEquals(r.requirements.map((x: any) => [x.code, x.hidden, x.stage_title_ar]), [['A-ONE', false, 'مرحلة النسخة'], ['V-OPT', true, 'مرحلة النسخة']]);
    assertEquals(r.hidden, ['V-OPT']);
    // ما يختاره المحرر قبل الحفظ: برنامج آخر بلا نسخة يُعاين كما هو، وهو ما تُنشأ منه نسخته الأولى عند الحفظ
    const other: any = await cohortDefinitionFor({ cohort_id: C1, program_id: PB });
    assertEquals([other.version, other.stages.map((s: any) => s.key)], [null, ['b1']]);
    const live: any = await cohortDefinitionFor({ cohort_id: C1, program_version_id: '' });
    assertEquals(live.stages.map((s: any) => s.key), ['s1']);
    const e = await failOf(() => cohortDefinitionFor({ cohort_id: U(99) }));
    assertEquals(e.status, 404);
  } finally { w.restore(); }
});

// خطة الدفعة كاتبها الوحيد admin.cohort-plan (R2a، القرار 23): cohortSave يرفض schedule، والخطة تُحفظ بمراحل النسخة
Deno.test('خطة الدفعة المثبتة تُحفظ بمراحل النسخة من admin.cohort-plan، وcohortSave يرفض schedule', async () => {
  const w = pinned();
  try {
    const e = await failOf(() => cohortSave(admin, { id: C1, schedule: { s9: { start: '2026-09-01' } } }));
    assertEquals(e.code, 'use_cohort_plan');
    const bad = await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'save', days: { s1: 5 } }));
    assertEquals(bad.code, 'plan_invalid');
    await cohortPlanAction(admin, { cohort_id: C1, op: 'save', days: { s9: 5 } });
    assertEquals(w.tables.cohorts[0].schedule, { s9: { days: 5 } });
    // وضع المراحل والمجموعات من التعريف نفسه
    await cohortSave(admin, { id: C1, stage_modes: { s9: 'groups', s1: 'groups' } });
    assertEquals(w.tables.cohorts[0].stage_modes, { s9: 'groups' });
    w.tables.cohort_groups = []; w.tables.cohort_group_members = []; w.tables.experts = []; w.tables.placements = [];
    const g: any = await cohortGroups({ cohort_id: C1 });
    assertEquals(g.stages, [{ key: 's9', title_ar: 'مرحلة النسخة' }]);
  } finally { w.restore(); }
});

Deno.test('موعد مرحلة موقوفة في النسخة يبقى عند حفظ الخطة، ولا يُعد مُسقطًا', async () => {
  const w = pinned();
  try {
    (w.tables.program_versions[0].data as any).stages.push({ key: 's8', title_ar: 'مرحلة موقوفة', sort: 2, active: false, rules: {} });
    w.tables.cohorts[0].schedule = { s8: { start: '2026-10-01' } };
    await cohortPlanAction(admin, { cohort_id: C1, op: 'save', days: { s9: 4 } });
    assertEquals(w.tables.cohorts[0].schedule, { s8: { start: '2026-10-01' }, s9: { days: 4 } });
  } finally { w.restore(); }
});

// ── P6: ما يحفظه المحرر من الإخفاء يختفي من رحلة العضو، ولا يُحذف تقدمه ──
Deno.test('إخفاء بند من المحرر يحفظ hidden_requirements نفسها ويختفي من رحلة عضو الدفعة، وتقدمه باقٍ', async () => {
  const w = world();
  try {
    w.tables.participant_requirements.push({ participant_id: P1, requirement_id: R2, status: 'done' });
    const before: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(before.requirements.map((r: any) => r.code), ['A-ONE', 'A-TWO']);
    await cohortSave(admin, { id: C1, hidden_requirements: ['A-TWO'] });
    assertEquals(w.tables.cohorts[0].hidden_requirements, ['A-TWO']);
    const after: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(after.requirements.map((r: any) => r.code), ['A-ONE']);
    assertEquals(w.tables.participant_requirements.filter((r: Row) => r.requirement_id === R2).length, 1);
    // تعريف الدفعة للمحرر يبقيه بعلامته
    const d: any = await cohortDefinitionFor({ cohort_id: C1 });
    assertEquals(d.requirements.find((r: any) => r.code === 'A-TWO').hidden, true);
  } finally { w.restore(); }
});
