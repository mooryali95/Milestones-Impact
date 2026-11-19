// admin.cohort-plan (R2a في تصور محرر رحلة الدفعة): المعاينة لكل مدير والحفظ والتراجع للكاتب، والحراس (المغلقة والمفتوحة غير
// المثبتة والمثبت والحدود والحقول اللاحقة والنسخة القديمة)، والسجل في audit_log بقيمته قبل وبعد، والأثر على عضو حي من رحلته
// كما يراها، وadmin.cohort-save يرفض schedule وdistribute (كاتب واحد، القرار 23). قاعدة في الذاكرة بنمط cohort_guard_test.ts.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { db, Fail } = await import('./core.ts');
const { writer } = await import('./admin.ts');
const { cohortPlanAction } = await import('./cohort-plan.ts');
const { cohortSave, journeyDefinition, cohortDefinitionFor } = await import('./programs.ts');
const { R0_DATED_SINCE } = await import('./milestones.js');

type Row = Record<string, any>;
function install(tables: Record<string, Row[]>) {
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
      const cut = range ? out.slice(range[0], range[1] + 1) : out.slice(0, limit);
      return { data: single ? cut[0] ?? null : cut, error: null };
    };
    const q: any = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
        if (k === 'insert' || k === 'update') return (x: any) => { mode = k; payload = x; return q; };
        if (k === 'upsert') return (x: any) => { mode = 'insert'; payload = x; return q; };
        if (k === 'gte') return (c: string, v: any) => { filters.push((r) => String(r[c] ?? '') >= String(v)); return q; };
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
        if (k === 'is') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
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
const ORG = U(1), PA = U(2), C1 = U(3), V1 = U(4), P1 = U(5), OPEN = U(6);
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
// بداية الدفعة قبل عشرة أيام: التدريب (14 يومًا) جارٍ اليوم، وتقصيره إلى 3 أيام يجعل «نهاية التدريب» متأخرة ستة أيام
const START = iso(-10);
const admin = { email: 'a@x.sa', role: 'admin' as const, method: 'passkey' } as any;
const viewer = { email: 'v@x.sa', role: 'viewer', method: 'passkey' } as any;
const stages = [
  { key: 'profile', title_ar: 'الملف', sort: 1, active: true, duration_days: 2, rules: {} },
  { key: 'training', title_ar: 'التدريب', sort: 2, active: true, duration_days: 14, rules: {} },
  { key: 'support', title_ar: 'الدعم', sort: 3, active: true, duration_days: 30, rules: {} },
];
const requirements = [
  { id: U(10), stage_key: 'profile', code: 'P-INFO', kind: 'auto', title_ar: 'الملف', required: true, active: true, sort: 1 },
  { id: U(11), stage_key: 'training', code: 'T-ONE', kind: 'check', title_ar: 'بند التدريب', required: true, active: true, sort: 1 },
  { id: U(12), stage_key: 'support', code: 'S-ONE', kind: 'check', title_ar: 'بند الدعم', required: true, active: true, sort: 1 },
];
function world(cohort: Row = {}) {
  return install({
    programs: [{ id: PA, is_default: true, archived_at: null, name: 'البرنامج' }],
    program_versions: [{ id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: { stages, requirements } }],
    journey_stages: stages.map((s) => ({ ...s, program_id: PA })), stage_requirements: requirements.map((r) => ({ ...r, program_id: PA })),
    cohorts: [
      { id: C1, name: 'دفعة يناير', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: START, ends_on: iso(80),
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', hidden_requirements: [], schedule: {}, ...cohort },
      { id: OPEN, name: 'المفتوحة', is_default: true, organization_id: null, program_id: PA, program_version_id: null, status: 'open', created_at: '2026-01-01T00:00:00Z', schedule: {} },
    ],
    enrollments: [],
    participants: [{ id: P1, organization_id: ORG, is_demo: false, status: 'enrolled', full_name: 'سارة', profile_completed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' }],
    program_milestones: [{ id: U(20), program_id: PA, title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, sort: 1 }],
    audit_log: [], participant_stage_overrides: [], participant_observations: [], coaching_sessions: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
// ما بُنيت عليه المسودة كما ترسله اللوحة: مطلوب في الحفظ والتراجع
const B = (w: any, i = 0) => (w.tables.cohorts[i].updated_at ? { base_updated_at: w.tables.cohorts[i].updated_at } : {});

Deno.test('الصلاحيات: المعاينة والسجل لكل مدير، والحفظ والتراجع للكاتب وحده بعامله الثاني', async () => {
  const w = world();
  try {
    const p: any = await cohortPlanAction(viewer, { cohort_id: C1, op: 'preview', days: { training: 3 } });
    assertEquals(p.preview, true);
    const asWriter = (who: any) => () => Promise.resolve().then(() => writer(who, cohortPlanAction, { cohort_id: C1, op: 'save', days: { training: 3 } }));
    assertEquals((await failOf(asWriter(viewer))).status, 403);
    assertEquals((await failOf(asWriter({ ...admin, method: 'email' }))).code, 'mfa_required');
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
    assertEquals((await failOf(() => cohortPlanAction(admin, { op: 'preview' }))).status, 400);
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: U(99), op: 'preview' }))).status, 404);
  } finally { w.restore(); }
});

Deno.test('المعاينة: الخطة الجديدة بتواريخها الشاملة، وأثرها على العضو الحي من رحلته، والبريد المحجوب، بلا كتابة', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', days: { training: 3 } });
    assertEquals(r.changed, true);
    assertEquals(r.locked, null);
    const tr = r.plan.stages.find((s: any) => s.key === 'training');
    assertEquals([tr.days, tr.source, tr.from, tr.to], [3, 'cohort', iso(-8), iso(-6)]);
    assertEquals(r.impact.changes.map((x: any) => x.key), ['training', 'support']);
    assertEquals(r.impact.end.shift, -11);
    // العضو في التدريب الآن، و«نهاية التدريب» تنقلب متأخرة ستة أيام، وبريدها محجوب بحارس الخطة
    assertEquals(r.impact.people, { total: 1, by_stage: [{ key: 'training', title: 'التدريب', here: 1 }] });
    assertEquals(r.impact.late, { milestones: 1, people: 1, cleared: 0 });
    // يُحجب بحارس الخطة، وما موعده قبل يوم R0 محجوب أصلًا بحارس R0 فلا يُعد مرتين
    assertEquals(r.impact.mail, { send: 0, held: iso(-6) >= R0_DATED_SINCE ? 1 : 0 });
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('الحفظ: الخطة في cohorts.schedule وصف في السجل بقيمته قبل وبعد، ورحلة المشارك تقرأ المدة الجديدة', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'save', days: { training: 3 }, base_updated_at: '2026-11-01T00:00:00Z' });
    assertEquals(r.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { training: { days: 3 } });
    const [row] = w.tables.audit_log;
    assertEquals([row.action, row.entity, row.entity_id, row.actor], ['cohort.plan', 'cohorts', C1, 'a@x.sa']);
    assertEquals(row.before, { schedule: {} });
    assertEquals(row.after.schedule, { training: { days: 3 } });
    assertEquals(row.after.summary.changes, [{ key: 'training', before: 14, after: 3 }, { key: 'support', before: 30, after: 30 }]);
    assertEquals(row.after.summary.held, iso(-6) >= R0_DATED_SINCE ? 1 : 0);
    // رحلة المشارك (journeyDefinition) والمعاينة للوحة (cohort_plan) من الخطة نفسها
    const def: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(def.stages.find((s: any) => s.key === 'training').duration_days, 3);
    const forCohort: any = await journeyDefinition({}, w.tables.cohorts[0]);
    assertEquals(forCohort.cohort.schedule, { training: { days: 3 } });
    const view: any = await cohortDefinitionFor({ cohort_id: C1 });
    assertEquals(view.cohort_plan.schedule, { training: { days: 3 } });
    assertEquals(view.stages.find((s: any) => s.key === 'training').duration_days, 14);
    // الحفظ نفسه مرة ثانية لا يكتب شيئًا
    const again: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 3 } });
    assertEquals(again.unchanged, true);
    assertEquals(w.tables.audit_log.length, 1);
  } finally { w.restore(); }
});

Deno.test('التراجع: يعيد ما قبل آخر حفظ بالحراس نفسها، وصالح حتى أي حفظ تالٍ، ولا يمر بعد تغيّر الخطة من غيره', async () => {
  const w = world({ schedule: { support: { days: 20 } } });
  try {
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 21 } });
    assertEquals(w.tables.cohorts[0].schedule, { support: { days: 20 }, training: { days: 21 } });
    const h: any = await cohortPlanAction(viewer, { cohort_id: C1, op: 'history' });
    assertEquals([h.history.length, h.can_undo], [1, true]);
    const u: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals(u.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { support: { days: 20 } });
    const last = w.tables.audit_log.at(-1)!;
    assertEquals([last.action, last.after.undoes], ['cohort.plan-undo', w.tables.audit_log[0].id]);
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' }))).code, 'nothing_to_undo');
    // حفظ ثم تغيّر الخطة من مكان آخر (ترقية مثلًا): لا تراجع تلقائي
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 10 } });
    w.tables.cohorts[0].schedule = { training: { days: 11 } };
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' }))).code, 'plan_changed');
  } finally { w.restore(); }
});

Deno.test('الحراس: المغلقة، والمفتوحة غير المثبتة (القرار 21)، والمثبت، والحدود، والحقول اللاحقة، والنسخة القديمة', async () => {
  const w = world();
  try {
    w.tables.cohorts[0].status = 'closed';
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 3 } }))).code, 'cohort_closed');
    w.tables.cohorts[0].status = 'running';
    // المفتوحة: المعاينة تقول السبب، والحفظ يُرفض في الخادم، ثم يمر بعد تثبيتها على نسخة
    const op: any = await cohortPlanAction(admin, { cohort_id: OPEN, op: 'preview', days: { training: 3 } });
    assertEquals(op.locked.code, 'open_unpinned');
    assert(op.impact.open, 'المفتوحة تسمي من يمسه التعديل');
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w, 1), cohort_id: OPEN, op: 'save', days: { training: 3 } }))).code, 'open_unpinned');
    w.tables.cohorts[1].program_version_id = V1;
    assertEquals(((await cohortPlanAction(admin, { ...B(w, 1), cohort_id: OPEN, op: 'save', days: { training: 3 } })) as any).saved, true);
    assertEquals(w.tables.cohorts[1].schedule, { training: { days: 3 } });
    // الحدود: الإلزامية من 1، والمرحلة الغريبة
    const e = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 0, nope: 2 } }));
    assertEquals(e.code, 'plan_invalid');
    assertEquals((e.extra.errors as any[]).map((x) => x.code), ['range', 'unknown']);
    // التثبيت للدفعة في مرحلة لاحقة: لا يُقبل بصمت (الإيقاف صار مقبولًا في R2b والتوازي في R3a)
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', start: { training: '2027-01-01' } }))).code, 'plan_field');
    // نسخة أقدم من الحالية
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 3 }, base_updated_at: '2020-01-01T00:00:00Z' }))).code, 'stale');
    assertEquals(w.tables.cohorts[0].schedule, {});
  } finally { w.restore(); }
});

Deno.test('المثبت القديم: لا تُعدَّل مدته، و«حرّر التواريخ لتتبع المدد» يحوله مدة بطوله الحالي فلا يتحرك تاريخ', async () => {
  const pin = { profile: { start: START, end: iso(-9) }, training: { start: iso(-8), end: iso(6) } };
  const w = world({ schedule: pin });
  try {
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 3 } }))).code, 'plan_invalid');
    const p: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', follow: true });
    // الملف بطول البرنامج (يومان) فلا يبقى له مدخل، والتدريب 15 يومًا بدل 14 فيبقى مدة خاصة
    assertEquals(p.plan.schedule, { training: { days: 15 } });
    assertEquals(p.impact.changes, []);
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', follow: true });
    assertEquals(w.tables.cohorts[0].schedule, { training: { days: 15 } });
    assertEquals(w.tables.audit_log[0].after.follow, true);
    assertEquals(w.tables.audit_log[0].before.schedule, pin);
  } finally { w.restore(); }
});

Deno.test('كاتب واحد (القرار 23): admin.cohort-save يرفض schedule وdistribute برسالة تدل على التبويب، ولا يكتب شيئًا', async () => {
  const w = world({ schedule: { training: { days: 21 } } });
  try {
    for (const body of [{ id: C1, schedule: { training: { start: '2027-01-01' } } }, { id: C1, distribute: true }, { id: C1, name: 'اسم جديد', schedule: {} }]) {
      const e = await failOf(() => cohortSave(admin, body));
      assertEquals(e.code, 'use_cohort_plan');
      assert(e.message.includes('تبويب «الرحلة»'));
    }
    assertEquals(w.tables.cohorts[0].schedule, { training: { days: 21 } });
    assertEquals(w.tables.cohorts[0].name, 'دفعة يناير');
    // وحفظ أي إعداد آخر لا يمس الخطة
    await cohortSave(admin, { id: C1, name: 'اسم جديد' });
    assertEquals(w.tables.cohorts[0].schedule, { training: { days: 21 } });
  } finally { w.restore(); }
});

Deno.test('الحفظ مشروط بالنسخة: بلا base_updated_at يُرفض، وكاتب ثانٍ بنسخة صارت قديمة يُرفض ولا يكتب فوق الأول', async () => {
  const w = world();
  try {
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'save', days: { training: 3 } }))).code, 'base_required');
    assertEquals((await failOf(() => cohortPlanAction(admin, { cohort_id: C1, op: 'undo' }))).code, 'base_required');
    const base = B(w);
    await cohortPlanAction(admin, { ...base, cohort_id: C1, op: 'save', days: { training: 3 } });
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...base, cohort_id: C1, op: 'save', days: { training: 20 } }))).code, 'stale');
    assertEquals(w.tables.cohorts[0].schedule, { training: { days: 3 } });
    assertEquals(w.tables.audit_log.length, 1);
    // ويسجل الحفظ المعالم التي حرّك موعدها، فيحجب حارس البريد ما صار متأخرًا منها وحدها
    assertEquals(w.tables.audit_log[0].after.moved_ids, [U(20)]);
  } finally { w.restore(); }
});

Deno.test('تعذّر السجل بعد الحفظ: تُعاد الخطة كما كانت، فلا خطة حية بلا سطرها (لا تراجع ولا حارس بريد)', async () => {
  const w = world();
  const from = (db as any).from;
  (db as any).from = (t: string) => (t === 'audit_log' ? { insert: () => Promise.resolve({ data: null, error: { message: 'down' } }) } : from(t));
  try {
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 3 } }))).code, 'audit_failed');
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.cohorts[0].updated_at, '2026-11-01T00:00:00Z');
  } finally { (db as any).from = from; w.restore(); }
});

// ══ R2b: الإيقاف لهذه الدفعة ══
// العضو سارة في «التدريب» الآن (بلا تقدم فيه)، و«نهاية التدريب» معلم بارتكاز نهايته

Deno.test('R2b المعاينة: إيقاف التدريب يسمي من فيه ومعلمه المستبعد والنهاية، بلا كتابة', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(viewer, { cohort_id: C1, op: 'preview', off: { training: true } });
    assertEquals(r.changed, true);
    assertEquals(r.plan.schedule, { training: { off: true } });
    const tr = r.plan.stages.find((s: any) => s.key === 'training');
    assertEquals([tr.off, tr.from, tr.to], [true, null, null]);
    assertEquals(r.impact.stopped, ['training']);
    assertEquals(r.impact.moving, [{ key: 'training', title: 'التدريب', here: 1 }]);
    assertEquals(r.impact.excluded.map((m: any) => m.id), [U(20)]);
    assertEquals(r.impact.end.shift, -14);
    assertEquals(r.impact.notify, { members: 1 });
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('R2b الحراس: بوابة القبول ومرجع «تبدأ مع» لا تُوقف، وقيمة الإيقاف تُفحص، والمغلقة والمفتوحة غير المثبتة كما في R2a', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { profile: true } }));
    assertEquals([e.code, (e.extra.errors as any[])[0].code], ['plan_invalid', 'protected']);
    // مرحلة تبدأ مع التدريب في النسخة: التدريب مرجعها فلا يُوقف حتى تُوقف هي أو تُنقل
    const v = w.tables.program_versions[0].data;
    v.stages = [...v.stages, { key: 'ojt', title_ar: 'التوجيه', sort: 2.5, active: true, duration_days: 7, rules: { unlock: 'with', with: 'training' } }];
    const t = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: true } }));
    assertEquals((t.extra.errors as any[])[0].code, 'with_target');
    assert(t.message.includes('أوقف أولًا ما يسير معها أو انقله'));
    assertEquals(((await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', off: { training: true, ojt: true } })) as any).impact.stopped, ['training', 'ojt']);
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: ['training'] }))).code, 'plan_invalid');
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w, 1), cohort_id: OPEN, op: 'save', off: { support: true } }))).code, 'open_unpinned');
    w.tables.cohorts[0].status = 'closed';
    assertEquals((await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { support: true } }))).code, 'cohort_closed');
    assertEquals(w.tables.cohorts[0].schedule, {});
  } finally { w.restore(); }
});

Deno.test('R2b الحفظ: الخطة والسجل، ورحلة المشارك بلا الموقوفة ينتقل إلى ما بعدها، ومعلمها لا يظهر ولا يُعد', async () => {
  const w = world();
  try {
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: true } });
    assertEquals(r.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { training: { off: true } });
    const [row] = w.tables.audit_log;
    assertEquals(row.after.summary.stopped, ['training']);
    assertEquals(row.after.summary.excluded, 1);
    assertEquals(row.after.skips, undefined);
    const def: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(def.stages.map((s: any) => s.key), ['profile', 'support']);
    assertEquals(def.requirements.map((x: any) => x.code), ['P-INFO', 'S-ONE']);
    assertEquals(def.stages_off.map((s: any) => s.key), ['training']);
    const { journeyFor } = await import('./participant.ts');
    const j: any = await journeyFor(w.tables.participants[0], { lite: true });
    assertEquals(j.journey.find((s: any) => s.status === 'active')?.key, 'support');
    assertEquals(j.milestones, []);
    assertEquals(j.milestone_summary.total, 0);
    // اللوحة (cohort-definition) تبقي الموقوفة بعلامتها في الخطة
    const view: any = await cohortDefinitionFor({ cohort_id: C1 });
    assert(view.stages.some((s: any) => s.key === 'training'));
    assertEquals(view.cohort_plan.schedule, { training: { off: true } });
  } finally { w.restore(); }
});

Deno.test('R2b التراجع عن إيقاف: تعود المرحلة، ومن تجاوزها وهي موقوفة يُعفى افتراضيًا (القرار 12)، وحارس البريد يشمل معلمها العائد', async () => {
  const w = world();
  try {
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: true } });
    const pre: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', off: { training: false } });
    assertEquals(pre.impact.started, ['training']);
    assertEquals(pre.impact.reenabled, [{ key: 'training', title: 'التدريب', passed: 1, ids: [P1] }]);
    assertEquals(pre.impact.restored.map((m: any) => m.id), [U(20)]);
    const u: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals([u.saved, u.exempted], [true, 1]);
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.participant_stage_overrides.map((o: any) => [o.participant_id, o.stage_key, o.action]), [[P1, 'training', 'skip']]);
    const last = w.tables.audit_log.at(-1)!;
    assertEquals(last.after.skips, [{ participant_id: P1, stage_key: 'training' }]);
    assertEquals(last.after.moved_ids, [U(20)]);
    // معفى: التدريب مكتمل عليه بالإعفاء، فلا يُقفل الدعم
    const { journeyFor } = await import('./participant.ts');
    const j: any = await journeyFor(w.tables.participants[0], { lite: true });
    assertEquals(j.journey.find((s: any) => s.key === 'training').status, 'done');
    assertEquals(j.journey.find((s: any) => s.key === 'support').status, 'active');
  } finally { w.restore(); }
});

Deno.test('R2b «أعدها عليهم» لا يكتب إعفاءً، والتراجع عن حفظ أعفى يحذف إعفاءه', async () => {
  const w = world({ schedule: { training: { off: true } } });
  try {
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: false }, reenable: 'apply' });
    assertEquals([r.saved, r.exempted], [true, 0]);
    assertEquals(w.tables.participant_stage_overrides, []);
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals(w.tables.cohorts[0].schedule, { training: { off: true } });
    // حفظ يعفي ثم تراجع عنه: يُحذف الإعفاء
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: false } });
    assertEquals(w.tables.participant_stage_overrides.length, 1);
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals(w.tables.participant_stage_overrides, []);
  } finally { w.restore(); }
});

// الدعم «تبدأ مع» التدريب في هذا العالم (نسخة منفصلة فلا يُمس الثابت المشترك)
const riding = (w: any) => { const d = w.tables.program_versions[0].data; d.stages = d.stages.map((s: any) => (s.key === 'support' ? { ...s, rules: { unlock: 'with', with: 'training' } } : s)); };

Deno.test('R2b إعادة تابع «تبدأ مع» ومرجعه يبقى موقوفًا تُرفض في الحفظ والتراجع (القرار 22)', async () => {
  const w = world({ schedule: { training: { off: true }, support: { off: true } } });
  try {
    riding(w);
    const e = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { support: false } }));
    assertEquals(e.code, 'plan_invalid');
    assertEquals((e.extra.errors as any[])[0].code, 'with_target_off');
    assert(e.message.includes('«الدعم» تبدأ مع «التدريب» وهي موقوفة'));
    assertEquals(w.tables.cohorts[0].schedule, { training: { off: true }, support: { off: true } });
    // التراجع لا يمر بplanEdit: حفظ سابق قبله الدعم يعمل والتدريب موقوف لا يُعاد
    w.tables.audit_log.push({ id: 'a-1', action: 'cohort.plan', entity_id: C1, actor: admin.email, created_at: new Date().toISOString(),
      before: { schedule: { training: { off: true } } }, after: { schedule: { training: { off: true }, support: { off: true } } } });
    const u = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' }));
    assertEquals(u.code, 'undo_invalid');
    assertEquals(w.tables.cohorts[0].schedule, { training: { off: true }, support: { off: true } });
    // إعادة الاثنين معًا تمر
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { support: false, training: false }, reenable: 'apply' });
    assertEquals([r.saved, w.tables.cohorts[0].schedule], [true, {}]);
  } finally { w.restore(); }
});

Deno.test('R2b تعذّر كتابة الإعفاء بعد حفظ الخطة يعيدها كما كانت ويحذف ما كُتب، بلا سطر في السجل', async () => {
  const w = world({ schedule: { training: { off: true } } });
  const inner = (db as any).from;
  try {
    (db as any).from = (t: string) => {
      const q = inner(t);
      if (t !== 'participant_stage_overrides') return q;
      return new Proxy(q, { get: (o, k: string) => (k === 'upsert' ? () => ({ then: (ok: any) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok) }) : o[k]) });
    };
    await assertRejects(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { training: false } }));
    assertEquals(w.tables.cohorts[0].schedule, { training: { off: true } });
    assertEquals(w.tables.cohorts[0].updated_at, '2026-11-01T00:00:00Z');
    assertEquals(w.tables.audit_log, []);
    assertEquals(w.tables.participant_stage_overrides, []);
  } finally { (db as any).from = inner; w.restore(); }
});

Deno.test('R2b «أبلغ المشاركين» (القرار 13): مطفأ ما لم يُختر، ومختارًا ملاحظة واحدة لكل من في الرحلة بقالب الملاحظات', async () => {
  const w = world();
  try {
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { support: true } });
    assertEquals(w.tables.participant_observations, []);
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', off: { support: false }, notify: true });
    assertEquals(r.notified, 1);
    const [o] = w.tables.participant_observations;
    assertEquals([o.participant_id, o.code, o.kind, o.source, o.visible, o.title], [P1, 'cohort_plan', 'note', 'system', true, 'تغيّرت مواعيد رحلتك']);
    assert(o.body.includes('عادت «الدعم» إلى رحلة دفعتك.'));
    assertEquals(w.tables.audit_log.at(-1)!.after.notify, true);
  } finally { w.restore(); }
});

Deno.test('R2b جلسات التوجيه المحجوزة في مرحلة تُوقف تُسمّى ولا تمنع', async () => {
  const w = world();
  try {
    w.tables.program_versions[0].data.requirements[2] = { ...requirements[2], kind: 'coaching' };
    w.tables.enrollments.push({ participant_id: P1, cohort_id: C1, status: 'active', created_at: '2026-10-01T00:00:00Z' });
    w.tables.coaching_sessions.push({ participant_id: P1, requirement_id: U(12), status: 'booked', starts_at: new Date(Date.now() + 3 * 864e5).toISOString() });
    w.tables.coaching_sessions.push({ participant_id: P1, requirement_id: U(12), status: 'attended', starts_at: new Date(Date.now() - 3 * 864e5).toISOString() });
    const r: any = await cohortPlanAction(admin, { cohort_id: C1, op: 'preview', off: { support: true } });
    assertEquals(r.impact.booked, [{ key: 'support', title: 'الدعم', sessions: 1 }]);
  } finally { w.restore(); }
});

// ══ R3a «التوازي بإزاحة ومدة (تخطيطًا)» ══
// نسخة فيها التوجيه يسير مع التدريب، والمعالم على نهاية التوجيه
function withWorld(cohort: Row = {}) {
  const w = world(cohort);
  const v = w.tables.program_versions[0].data;
  v.stages = [...v.stages, { key: 'ojt', title_ar: 'التوجيه', sort: 2.5, active: true, duration_days: 7, rules: { unlock: 'with', with: 'training' } }];
  v.requirements = [...v.requirements, { id: U(13), stage_key: 'ojt', code: 'O-ONE', kind: 'check', title_ar: 'بند التوجيه', required: true, active: true, sort: 1 }];
  return w;
}

Deno.test('R3a المعاينة: إزاحة التوجيه أسبوعًا ومدته أسبوعان تزيح ما بعدهما، وتنبيه التجاوز، بلا كتابة', async () => {
  const w = withWorld();
  try {
    const r: any = await cohortPlanAction(viewer, { cohort_id: C1, op: 'preview', offset: { ojt: 7 }, days: { ojt: 14 } });
    assertEquals(r.plan.schedule, { ojt: { offset: 7, days: 14 } });
    const ojt = r.plan.stages.find((s: any) => s.key === 'ojt');
    // الملف يومان، فالتدريب من اليوم الثالث، والتوجيه بعد أسبوع منه لأسبوعين
    assertEquals([ojt.from, ojt.to, ojt.with, ojt.offset], [iso(-1), iso(12), 'training', 7]);
    const support = r.plan.stages.find((s: any) => s.key === 'support');
    assertEquals(support.from, iso(13));
    const c = r.impact.changes.find((x: any) => x.key === 'ojt');
    assertEquals([c.with_changed, c.before.offset, c.after.offset], [true, 0, 7]);
    assert(r.impact.issues.some((x: any) => x.code === 'with_over' && x.stage === 'ojt'));
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('R3a الحفظ والتراجع: الخطة والسجل، ورحلة المشارك تفتح التوجيه مع التدريب ولا تقفله حتى موعده (القرار 6)', async () => {
  const w = withWorld();
  try {
    const r: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', offset: { ojt: 7 } });
    assertEquals(r.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { ojt: { offset: 7 } });
    const [row] = w.tables.audit_log;
    assertEquals(row.after.summary.changes.find((x: any) => x.key === 'ojt'), { key: 'ojt', before: 7, after: 7, with: ['training', 'training'], offset: [0, 7] });
    // التعريف للمشارك: قاعدة «تبدأ مع» بإزاحتها، والفتح مع التدريب
    const def: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(def.stages.find((s: any) => s.key === 'ojt').rules, { unlock: 'with', with: 'training', offset: 7 });
    // «تسير مع» مرحلة أخرى للدفعة: الدعم مع التدريب بعد 3 أيام
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', with: { support: 'training' }, offset: { support: 3 } });
    assertEquals(w.tables.cohorts[0].schedule, { ojt: { offset: 7 }, support: { with: 'training', offset: 3 } });
    const u: any = await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'undo' });
    assertEquals(u.saved, true);
    assertEquals(w.tables.cohorts[0].schedule, { ojt: { offset: 7 } });
    // «لا شيء»: التوجيه بعد ما قبله
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', with: { ojt: false } });
    assertEquals(w.tables.cohorts[0].schedule, { ojt: { with: false } });
  } finally { w.restore(); }
});

Deno.test('R3a الحراس: مرجع لاحق أو بوابة أو موقوف، وإزاحة فوق مدة المرجع أو بلا مرجع، وشكل الجسم، ولا كتابة', async () => {
  const w = withWorld();
  try {
    const codes = async (body: Row) => {
      const e = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', ...body }));
      return [e.code, ((e.extra?.errors as any[]) || []).map((x) => x.code)];
    };
    assertEquals(await codes({ with: { training: 'support' } }), ['plan_invalid', ['with_order']]);
    assertEquals(await codes({ with: { training: 'profile' } }), ['plan_invalid', ['with_gate']]);
    assertEquals(await codes({ with: { support: 'training' }, off: { training: true } }), ['plan_invalid', ['with_target', 'with_off']]);
    assertEquals(await codes({ offset: { ojt: 15 } }), ['plan_invalid', ['offset_range']]);
    assertEquals(await codes({ offset: { support: 2 } }), ['plan_invalid', ['offset_alone']]);
    assertEquals(await codes({ with: { ojt: 3 } }), ['plan_invalid', ['with_value']]);
    assertEquals(await codes({ with: ['ojt'] }), ['plan_invalid', []]);
    assertEquals(await codes({ offset: 3 }), ['plan_invalid', []]);
    assertEquals(await codes({ end: { ojt: '2027-01-01' } }), ['plan_field', []]);
    assertEquals(w.tables.cohorts[0].schedule, {});
    assertEquals(w.tables.audit_log.length, 0);
    // تقصير المرجع تحت إزاحة محفوظة يُرفض باسمه
    await cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', offset: { ojt: 10 } });
    const e = await failOf(() => cohortPlanAction(admin, { ...B(w), cohort_id: C1, op: 'save', days: { training: 7 } }));
    assert(e.message.includes('إزاحة «التوجيه» من 0 إلى مدة «التدريب»'));
  } finally { w.restore(); }
});
