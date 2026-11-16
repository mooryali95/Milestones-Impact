// تثبيت الدفعة على نسخة (ترحيل 20261116110000): كل دفعة تُثبَّت على نسخة من برنامجها عند إنشائها، وتغيير البرنامج يثبّتها
// على أحدث نسخ الهدف، وإلغاء التثبيت يُرفض، وكل برنامج جديد يولد بنسخته الأولى. حفظ النسخة واسترجاعها يمسان المسودة
// وحدها، والترقية وحدها تنقل الدفعة بمعاينة وحارس الإخفاء وإعادة ضبط إعدادها على الهدف. قاعدة في الذاكرة بلا شبكة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { cohortSave, cohortUpgrade, journeyDefinition, programPublish, programRestore, programSave, list } = await import('./programs.ts');

type Row = Record<string, any>;
// نمط cohort_guard_test.ts: eq وneq وin وrange وlimit وmaybeSingle وsingle، والإدراج والتحديث والحذف. الترتيب لا يغيّر النتيجة،
// فما يعتمد على «أحدث نسخة» يُختبر بترتيب إدراج معكوس
// hooks[table]: يُنادى قبل كل إدراج في الجدول، وما يرده خطأ يُعاد بدل الإدراج (القيد الفريد، أو رفض قيد الدفعة)
function install(tables: Record<string, Row[]>) {
  let seq = 0;
  const hooks: Record<string, (payload: any) => any> = {};
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let conflict = ['id'];
    let payload: any = null;
    let single = false, limit = Infinity, range: [number, number] | null = null;
    const run = () => {
      const rows = tables[table] ||= [];
      if (mode === 'insert') {
        const err = hooks[table]?.(payload);
        if (err) return { data: null, error: err };
        const added = (Array.isArray(payload) ? payload : [payload]).map((x) => ({ id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...x }));
        rows.push(...added);
        return { data: single ? added[0] : added, error: null };
      }
      if (mode === 'upsert') {
        for (const x of Array.isArray(payload) ? payload : [payload]) {
          const hit = rows.find((r) => conflict.every((c) => r[c] === x[c]));
          if (hit) Object.assign(hit, x); else rows.push({ id: `${table}-${++seq}`, ...x });
        }
        return { data: null, error: null };
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
        if (k === 'delete') return () => { mode = 'delete'; return q; };
        if (k === 'upsert') return (x: any, o?: { onConflict?: string }) => { mode = 'upsert'; payload = x; if (o?.onConflict) conflict = o.onConflict.split(','); return q; };
        if (k === 'eq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; };
        if (k === 'neq') return (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; };
        if (k === 'in') return (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
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
  return { tables, hooks, restore: () => Object.assign(db as any, prev) };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(1), PA = U(2), PB = U(3), PE = U(4), C1 = U(5), P1 = U(6), R1 = U(7), R2 = U(8), RB = U(9), V1 = U(10), V2 = U(11), VB = U(12);
const admin = { email: 'a@x.sa', role: 'admin' as const };
const stage = (program_id: string, key: string, title_ar: string, sort = 1, rules = {}) => ({ program_id, key, title_ar, sort, active: true, rules });
const req = (id: string, program_id: string, stage_key: string, code: string, extra: Row = {}) =>
  ({ id, program_id, stage_key, code, title_ar: code, kind: 'check', required: false, active: true, sort: 1, config: {}, ...extra });
// لقطة نسخة بالشكل الذي يكتبه programSnapshot
const snap = (stages: Row[], reqs: Row[]) => ({
  stages: stages.map(({ program_id: _p, ...s }) => s), requirements: reqs.map(({ program_id: _p, ...r }) => r),
});

function world() {
  return install({
    programs: [
      { id: PA, name: 'القادة', is_default: true, archived_at: null },
      { id: PB, name: 'سفراء', is_default: false, archived_at: null },
      { id: PE, name: 'فارغ', is_default: false, archived_at: null },
    ],
    program_versions: [],
    journey_stages: [stage(PA, 's1', 'التمهيد'), stage(PB, 'b1', 'مرحلة سفراء')],
    stage_requirements: [req(R1, PA, 's1', 'A-ONE', { required: true }), req(R2, PA, 's1', 'A-TWO'), req(RB, PB, 'b1', 'B-ONE')],
    cohorts: [], enrollments: [], participants: [{ id: P1, organization_id: ORG, is_demo: false }], participant_requirements: [],
    cohort_experts: [], audit_log: [],
  });
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const fresh = (program_id: string, extra: Row = {}) => ({ name: 'دفعة 2027', organization_id: ORG, program_id, status: 'open', ...extra });

Deno.test('دفعة جديدة على برنامج بلا نسخة تُنشئ النسخة 1 من حاله وتُثبَّت عليها', async () => {
  const w = world();
  try {
    const r: any = await cohortSave(admin, fresh(PA));
    assertEquals(w.tables.program_versions.length, 1);
    const v = w.tables.program_versions[0];
    assertEquals([v.program_id, v.number, v.label], [PA, 1, 'النسخة 1']);
    assertEquals(v.data.requirements.map((x: Row) => x.code), ['A-ONE', 'A-TWO']);
    assertEquals(v.data.requirements[0].program_id, undefined);
    assertEquals(w.tables.cohorts[0].program_version_id, v.id);
    assertEquals(r.version_created, { id: v.id, number: 1, label: 'النسخة 1' });
    assertEquals(w.tables.audit_log.some((x: Row) => x.action === 'program.version'), true);
  } finally { w.restore(); }
});

Deno.test('الدفعة الجديدة تُثبَّت على أعلى النسخ رقمًا أيًا كان ترتيب القراءة، و«latest» و«» مثلها', async () => {
  for (const order of [[1, 2], [2, 1]]) {
    const w = world();
    w.tables.program_versions = order.map((n) => ({ id: n === 1 ? V1 : V2, program_id: PA, number: n, label: `النسخة ${n}`, data: snap([], []) }));
    try {
      await cohortSave(admin, fresh(PA));
      await cohortSave(admin, fresh(PA, { name: 'ب', program_version_id: 'latest' }));
      await cohortSave(admin, fresh(PA, { name: 'ج', program_version_id: '' }));
      assertEquals(w.tables.cohorts.map((c: Row) => c.program_version_id), [V2, V2, V2]);
      assertEquals(w.tables.program_versions.length, 2);
      // نسخة صريحة من البرنامج تُحترم، ومن غيره تُرفض
      await cohortSave(admin, fresh(PA, { name: 'د', program_version_id: V1 }));
      assertEquals(w.tables.cohorts[3].program_version_id, V1);
      w.tables.program_versions.push({ id: VB, program_id: PB, number: 1, label: 'س', data: snap([], []) });
      assertEquals((await failOf(() => cohortSave(admin, fresh(PA, { name: 'هـ', program_version_id: VB })))).message, 'النسخة لا تخص هذا البرنامج');
    } finally { w.restore(); }
  }
});

Deno.test('حفظ مرفوض بحارس النقل لا يكتب نسخة ولا دفعة', async () => {
  const w = world();
  w.tables.cohorts = [{ id: C1, name: 'سفراء 2026', organization_id: ORG, program_id: PA, program_version_id: null, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }];
  w.tables.participant_requirements = [{ participant_id: P1, requirement_id: R1 }];
  try {
    assertEquals((await failOf(() => cohortSave(admin, fresh(PB)))).code, 'confirm_move');
    assertEquals([w.tables.program_versions.length, w.tables.cohorts.length], [0, 1]);
    await cohortSave(admin, { ...fresh(PB), confirm_move: true });
    assertEquals(w.tables.program_versions.map((v: Row) => v.program_id), [PB]);
  } finally { w.restore(); }
});

Deno.test('تغيير البرنامج بلا نسخة صريحة يثبّت على أحدث نسخ الهدف، لا «آخر تعديل»', async () => {
  const w = world();
  w.tables.program_versions = [{ id: V1, program_id: PA, number: 1, label: 'أ', data: snap([], []) }, { id: VB, program_id: PB, number: 1, label: 'س', data: snap([], []) }];
  w.tables.cohorts = [{ id: C1, name: 'أفراد', organization_id: null, program_id: PA, program_version_id: V1, status: 'planned', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }];
  try {
    await cohortSave(admin, { id: C1, program_id: PB });
    assertEquals([w.tables.cohorts[0].program_id, w.tables.cohorts[0].program_version_id], [PB, VB]);
    // والفارغ مع تغيير البرنامج (المحرر قبل اختيار نسخة) مثله
    await cohortSave(admin, { id: C1, program_id: PA, program_version_id: '' });
    assertEquals(w.tables.cohorts[0].program_version_id, V1);
  } finally { w.restore(); }
});

Deno.test('إلغاء تثبيت دفعة مثبتة يُرفض، ونسختها لا تتغير من الحفظ إلا بالترقية، والحفظ بلا الحقل أو بنسختها نفسها لا يمسها', async () => {
  const w = world();
  w.tables.program_versions = [{ id: V1, program_id: PA, number: 1, label: 'أ', data: snap([], []) }, { id: V2, program_id: PA, number: 2, label: 'ب', data: snap([], []) }];
  w.tables.cohorts = [
    { id: C1, name: 'مثبتة', organization_id: null, program_id: PA, program_version_id: V1, status: 'planned', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] },
    { id: U(30), name: 'قديمة', organization_id: null, program_id: PA, program_version_id: null, status: 'planned', created_at: '2026-09-02T00:00:00Z', hidden_requirements: [] },
  ];
  try {
    for (const v of ['', null, 'follow']) {
      const e = await failOf(() => cohortSave(admin, { id: C1, program_version_id: v }));
      assertEquals(e.code, 'version_required');
    }
    // نسخة أخرى (مسماة أو «الأحدث») من المحرر تتجاوز معاينة الترقية: تُرفض وتُحال إلى الترقية
    for (const v of [V2, 'latest']) assertEquals((await failOf(() => cohortSave(admin, { id: C1, program_version_id: v }))).code, 'use_upgrade');
    await cohortSave(admin, { id: C1, name: 'مثبتة أ', program_version_id: V1 });
    assertEquals([w.tables.cohorts[0].name, w.tables.cohorts[0].program_version_id], ['مثبتة أ', V1]);
    // غير المثبتة وللبرنامج نسخة: الحفظ (والمحرر يرسل الفارغ دائمًا) لا يثبّتها بصمت، والتثبيت بالترقية بمعاينة الفرق
    await cohortSave(admin, { id: U(30), name: 'قديمة أ' });
    await cohortSave(admin, { id: U(30), name: 'قديمة ب', program_version_id: '' });
    assertEquals([w.tables.cohorts[1].name, w.tables.cohorts[1].program_version_id], ['قديمة ب', null]);
    for (const v of ['latest', V2]) assertEquals((await failOf(() => cohortSave(admin, { id: U(30), program_version_id: v }))).code, 'use_upgrade');
    assertEquals(w.tables.program_versions.length, 2);
  } finally { w.restore(); }
});

Deno.test('غير المثبتة على برنامج بلا نسخة: الحفظ ينشئ نسخته الأولى من حاله الآن، والبرنامج الفارغ لا يمنع إغلاقها أو تسميتها', async () => {
  const w = world();
  w.tables.cohorts = [
    { id: C1, name: 'على القادة', organization_id: null, program_id: PA, program_version_id: null, status: 'planned', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] },
    { id: U(31), name: 'على الفارغ', organization_id: null, program_id: PE, program_version_id: null, status: 'open', created_at: '2026-09-02T00:00:00Z', hidden_requirements: [] },
  ];
  try {
    const r: any = await cohortSave(admin, { id: C1, name: 'على القادة أ', program_version_id: '' });
    assertEquals(r.version_created?.number, 1);
    assertEquals(w.tables.cohorts[0].program_version_id, w.tables.program_versions[0].id);
    await cohortSave(admin, { id: U(31), name: 'على الفارغ (مغلقة)', status: 'closed', program_version_id: '' });
    assertEquals([w.tables.cohorts[1].status, w.tables.cohorts[1].program_version_id], ['closed', null]);
    assertEquals(w.tables.program_versions.map((v: Row) => v.program_id), [PA]);
  } finally { w.restore(); }
});

Deno.test('حفظان متزامنان لأول دفعة على برنامج بلا نسخة: الثاني يُثبَّت على النسخة التي سبقته، ورفض حفظ الدفعة لا يترك نسخة', async () => {
  const w = world();
  try {
    // حفظ آخر أدرج النسخة 1 بين قراءة الرقم والإدراج: القيد الفريد يرد هذا الإدراج
    let raced = false;
    w.hooks.program_versions = () => {
      if (raced) return null;
      raced = true;
      w.tables.program_versions.push({ id: V1, program_id: PA, number: 1, label: 'النسخة 1', data: snap([], []) });
      return { code: '23505', message: 'duplicate key' };
    };
    const r: any = await cohortSave(admin, fresh(PA));
    assertEquals(w.tables.cohorts[0].program_version_id, V1);
    assertEquals([w.tables.program_versions.length, r.version_created], [1, undefined]);
    // ونسخة أُنشئت ثم رُفض إدراج الدفعة: تُحذف
    delete w.hooks.program_versions;
    w.hooks.cohorts = () => ({ code: '23514', message: 'check' });
    await failOf(() => cohortSave(admin, fresh(PB)));
    assertEquals(w.tables.program_versions.map((v: Row) => v.program_id), [PA]);
  } finally { w.restore(); }
});

Deno.test('برنامج بلا متطلبات لا تُنشأ عليه دفعة، فلا تُثبَّت على نسخة فارغة', async () => {
  const w = world();
  try {
    const e = await failOf(() => cohortSave(admin, fresh(PE)));
    assertEquals(e.code, 'program_empty');
    assertEquals([w.tables.program_versions.length, w.tables.cohorts.length], [0, 0]);
  } finally { w.restore(); }
});

Deno.test('برنامج بلا متطلب فعّال لا تُحفظ له نسخة، فلا تصير نسخة فارغة «أحدث نسخة» تُثبَّت عليها الدفعات', async () => {
  const w = world();
  w.tables.stage_requirements.push(req(U(40), PE, 'e1', 'E-OFF', { active: false }));
  try {
    for (const id of [PE, PA]) {
      if (id === PA) for (const r of w.tables.stage_requirements) if (r.program_id === PA) r.active = false;
      assertEquals((await failOf(() => programPublish(admin, { id }))).code, 'program_empty');
    }
    assertEquals(w.tables.program_versions.length, 0);
  } finally { w.restore(); }
});

Deno.test('قاعدة «تبدأ مع» كاسرة تمنع إنشاء النسخة الأولى كما تمنع حفظ النسخة', async () => {
  const w = world();
  w.tables.journey_stages.push(stage(PA, 's0', 'قبل التمهيد', 0, { unlock: 'with', with: 's1' }));
  try {
    const e = await failOf(() => cohortSave(admin, fresh(PA)));
    assertEquals(e.code, 'rules');
    assertEquals((await failOf(() => programPublish(admin, { id: PA }))).code, 'rules');
    assertEquals(w.tables.program_versions.length, 0);
  } finally { w.restore(); }
});

Deno.test('البرنامج الجديد يولد بنسخته الأولى، والفارغ بلا نسخة', async () => {
  const w = world();
  try {
    const r: any = await programSave(admin, { name: 'سفراء 2', from: PB });
    assertEquals(r.version.number, 1);
    const v = w.tables.program_versions.find((x: Row) => x.program_id === r.program.id)!;
    assertEquals(v.data.requirements.map((x: Row) => x.code), ['B-ONE']);
    const e: any = await programSave(admin, { name: 'من فارغ', from: PE });
    assertEquals(e.version, null);
  } finally { w.restore(); }
});

Deno.test('حفظ نسخة واسترجاع أخرى لا يغيّران رحلة دفعة مثبتة، ويُقال كم دفعة بقيت على نسخة أقدم', async () => {
  const w = world();
  w.tables.cohorts = [{ id: C1, name: 'سفراء 2026', organization_id: ORG, program_id: PA, program_version_id: null, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z', hidden_requirements: [] }];
  try {
    await cohortSave(admin, { id: C1, program_version_id: 'latest' });
    const pinned = w.tables.cohorts[0].program_version_id;
    const before: any = await journeyDefinition({ id: P1, organization_id: ORG });
    // تعديل على المسودة ثم حفظ نسخة ثم استرجاع الأولى: الدفعة على نسختها
    w.tables.stage_requirements.find((r: Row) => r.id === R2)!.title_ar = 'عنوان جديد';
    w.tables.stage_requirements.push(req(U(50), PA, 's1', 'A-NEW'));
    const pub: any = await programPublish(admin, { id: PA, label: 'بعد المراجعة' });
    assertEquals([pub.version.number, pub.behind], [2, 1]);
    await programRestore(admin, { version_id: pinned });
    assertEquals(w.tables.cohorts[0].program_version_id, pinned);
    const after: any = await journeyDefinition({ id: P1, organization_id: ORG });
    assertEquals(after.requirements.map((r: Row) => [r.code, r.title_ar]), before.requirements.map((r: Row) => [r.code, r.title_ar]));
    assertEquals(after.version.number, 1);
  } finally { w.restore(); }
});

Deno.test('بعد الاسترجاع «أحدث نسخة» هي المسترجعة لا الاحتياطية: الدفعة الجديدة وزر الترقية يقرآن ما رجع إليه المدير', async () => {
  const w = world();
  try {
    await cohortSave(admin, fresh(PA));
    const v1 = w.tables.program_versions[0];
    // تعديل سيئ يُحفظ نسخة 2، ثم يُسترجع 1
    w.tables.stage_requirements.find((r: Row) => r.id === R2)!.title_ar = 'تعديل سيئ';
    await programPublish(admin, { id: PA, label: 'تعديل سيئ' });
    const r: any = await programRestore(admin, { version_id: v1.id });
    assertEquals([r.backup.number, r.restored_as.number], [3, 4]);
    const v4 = w.tables.program_versions.find((v: Row) => v.number === 4)!;
    assertEquals(v4.data.requirements.find((x: Row) => x.id === R2).title_ar, 'A-TWO');
    await cohortSave(admin, fresh(PA, { name: 'بعد الاسترجاع' }));
    assertEquals(w.tables.cohorts[1].program_version_id, v4.id);
    assertEquals(((await cohortUpgrade(admin, { id: w.tables.cohorts[0].id })) as any).to.number, 4);
  } finally { w.restore(); }
});

Deno.test('الاتصال الفوري لدفعة مثبتة: التوفر ورابط الغرفة من البرنامج الحالي إن خلت النسخة منه، ورابط النسخة أولى', async () => {
  const w = world();
  const C = U(90);
  const until = new Date(Date.now() + 30 * 6e4).toISOString();
  w.tables.stage_requirements.push(req(C, PA, 's1', 'O-COACH', { kind: 'coaching', config: { mode: 'online' } }));
  try {
    await cohortSave(admin, fresh(PA));
    const live = w.tables.stage_requirements.find((r: Row) => r.id === C)!;
    live.config = { mode: 'online', instant_url: 'https://meet.example/room', instant_until: until };
    const coach = async () => ((await journeyDefinition({ id: P1, organization_id: ORG })) as any).requirements.find((r: Row) => r.id === C).config;
    assertEquals([(await coach()).instant_url, (await coach()).instant_until], ['https://meet.example/room', until]);
    (w.tables.program_versions[0].data as any).requirements.find((r: Row) => r.id === C).config.instant_url = 'https://meet.example/pinned';
    assertEquals((await coach()).instant_url, 'https://meet.example/pinned');
    // بلا توفر معلن لا يُضاف الرابط
    live.config = { mode: 'online', instant_url: 'https://meet.example/room' };
    (w.tables.program_versions[0].data as any).requirements.find((r: Row) => r.id === C).config = { mode: 'online' };
    assertEquals((await coach()).instant_url, undefined);
  } finally { w.restore(); }
});

function upgradeWorld() {
  const w = world();
  const s1 = stage(PA, 's1', 'التمهيد'), s2 = stage(PA, 's2', 'التطبيق', 2), s3 = stage(PA, 's3', 'الختام', 3);
  const coach = req(U(60), PA, 's2', 'O-SESS', { kind: 'coaching', config: { sessions_required: 2, mode: 'online' } });
  w.tables.program_versions = [
    { id: V1, program_id: PA, number: 1, label: 'الإطلاق', data: snap([s1, s2], [req(R1, PA, 's1', 'A-ONE', { required: true }), req(R2, PA, 's1', 'A-TWO'), coach]) },
    // النسخة 2: حُذف A-TWO ونشاط التوجيه ومرحلة التطبيق، وأُضيفت مرحلة الختام
    { id: V2, program_id: PA, number: 2, label: 'بعد المراجعة', data: snap([{ ...s1, title_ar: 'التمهيد المحدّث' }, s3], [req(R1, PA, 's1', 'A-ONE', { required: true }), req(U(61), PA, 's3', 'F-END')]) },
    { id: VB, program_id: PB, number: 1, label: 'س', data: snap([], []) },
  ];
  w.tables.cohorts = [{ id: C1, name: 'سفراء 2026', organization_id: ORG, program_id: PA, program_version_id: V1, status: 'running', starts_on: '2026-09-01', created_at: '2026-09-01T00:00:00Z',
    hidden_requirements: [], delivery: { 'O-SESS': { mode: 'in_person' } }, schedule: { s1: { start: '2026-09-01' }, s2: { start: '2026-10-01' } }, stage_modes: { s2: 'groups' } }];
  w.tables.participant_requirements = [{ participant_id: P1, requirement_id: R2, status: 'done' }, { participant_id: U(70), requirement_id: R2, status: 'done' }];
  w.tables.participants.push({ id: U(70), organization_id: U(71), is_demo: false });
  return w;
}

Deno.test('معاينة الترقية: فرق المتطلبات والمراحل، ومن له تقدم فيما يختفي من أعضائها، وما يُسقط من إعدادها، بلا كتابة', async () => {
  const w = upgradeWorld();
  try {
    const r: any = await cohortUpgrade(admin, { id: C1 });
    assertEquals(r.preview, true);
    assertEquals(r.to.number, 2);
    assertEquals(r.diff.removed.map((x: Row) => x.code), ['A-TWO', 'O-SESS']);
    assertEquals(r.diff.added.map((x: Row) => x.code), ['F-END']);
    assertEquals(r.diff.stages, { added: [{ key: 's3', title: 'الختام' }], removed: [{ key: 's2', title: 'التطبيق' }], changed: [{ key: 's1', title: 'التمهيد المحدّث' }] });
    // عضو الدفعة وحده يُعد: الآخر له تقدم في البند نفسه وهو من جهة أخرى
    assertEquals(r.affected, 1);
    assertEquals(r.dropped, { delivery: ['O-SESS'], schedule: ['التطبيق'], stage_modes: ['التطبيق'] });
    assertEquals(r.blocked, null);
    assertEquals(w.tables.cohorts[0].program_version_id, V1);
    assertEquals(w.tables.audit_log.length, 0);
  } finally { w.restore(); }
});

Deno.test('تأكيد الترقية يثبّت الهدف ويعيد ضبط التنفيذ والجدول ووضع المراحل عليه، ويسجل من وإلى', async () => {
  const w = upgradeWorld();
  try {
    await cohortUpgrade(admin, { id: C1, confirm: true });
    const c = w.tables.cohorts[0];
    assertEquals(c.program_version_id, V2);
    assertEquals([c.delivery, c.schedule, c.stage_modes], [{}, { s1: { start: '2026-09-01' } }, {}]);
    const log = w.tables.audit_log.find((x: Row) => x.action === 'cohort.upgrade')!;
    assertEquals([log.after.from, log.after.to, log.after.affected], [1, 2, 1]);
    // التقدم لا يُحذف
    assertEquals(w.tables.participant_requirements.length, 2);
    assertEquals((await cohortUpgrade(admin, { id: C1 }) as any).unchanged, true);
  } finally { w.restore(); }
});

Deno.test('الترقية إلى نسخة مسماة من البرنامج نفسه، ونسخة برنامج آخر تُرفض، والإخفاء الكاسر في الهدف يمنع التأكيد', async () => {
  const w = upgradeWorld();
  try {
    assertEquals((await failOf(() => cohortUpgrade(admin, { id: C1, version_id: VB }))).message, 'النسخة لا تخص برنامج الدفعة');
    // الإخفاء كاسر في الهدف وحده: في النسخة 1 للتمهيد بند إلزامي ثانٍ يكمله، وفي النسخة 2 لا يبقى غير المخفي
    (w.tables.program_versions[0].data as any).requirements.push({ id: U(62), stage_key: 's1', code: 'A-REQ2', title_ar: 'إلزامي ثانٍ', kind: 'check', required: true, active: true, sort: 3, config: {} });
    w.tables.cohorts[0].hidden_requirements = ['A-ONE'];
    const p: any = await cohortUpgrade(admin, { id: C1, version_id: V2 });
    assertEquals(p.blocked?.includes('«التمهيد المحدّث»'), true);
    const e = await failOf(() => cohortUpgrade(admin, { id: C1, version_id: V2, confirm: true }));
    assertEquals(e.code, 'upgrade_blocked');
    assertEquals(w.tables.cohorts[0].program_version_id, V1);
  } finally { w.restore(); }
});

Deno.test('قائمة البرامج: عدد دفعات كل نسخة والجارية منها، والمسودة المعدّلة بعد آخر نسخة، والدفعات غير المثبتة', async () => {
  const w = upgradeWorld();
  w.tables.organizations = []; w.tables.workshop_sessions = [];
  // الحي الآن مطابق للنسخة 2 إلا عنوان مرحلة
  w.tables.journey_stages = [stage(PA, 's1', 'التمهيد المحدّث'), stage(PA, 's3', 'الختام', 3)];
  w.tables.stage_requirements = [req(R1, PA, 's1', 'A-ONE', { required: true }), req(U(61), PA, 's3', 'F-END'), req(RB, PB, 'b1', 'B-ONE')];
  w.tables.cohorts.push({ id: U(80), name: 'قديمة', organization_id: null, program_id: PA, program_version_id: null, status: 'closed', created_at: '2026-01-01T00:00:00Z' });
  try {
    const pa = () => list().then((r: any) => r.programs.find((p: Row) => p.id === PA));
    let p: any = await pa();
    assertEquals(p.versions.map((v: Row) => [v.number, v.cohorts, v.live_cohorts]), [[1, 1, 1], [2, 0, 0]]);
    assertEquals([p.draft_changed, p.unpinned_cohorts], [false, 1]);
    w.tables.journey_stages[1].title_ar = 'الختام والتخرج';
    p = await pa();
    assertEquals(p.draft_changed, true);
    const pb: any = (await list() as any).programs.find((x: Row) => x.id === PE);
    assertEquals(pb.draft_changed, null);
  } finally { w.restore(); }
});
