// المرحلة 1 من تصور الحساب التجريبي (2026-11-19): «تخطَّ هذه المرحلة» و«افتح كل المراحل» ومعاينة الشهادة، على الموجّه
// الحقيقي (index.ts) بقاعدة في الذاكرة. يثبت: أن التخطي يكتب تجاوزًا على صف الحساب التجريبي وحده ولا يكتب إنجازًا ولا
// حضورًا ولا درجة ولا شهادة ولا بريدًا، وأن أرقام الإدارة لا تتغير به، وأن المشارك الحقيقي يُرد، وأن زائر الرابط يتخطى
// داخل الحساب ولا يبلغ فعل إدارة، وأن إعادة الضبط تمسح كل شيء، وأن لا فعل مفتوحًا للحساب يُرد بـ«مقفل» بعد «افتح الكل».
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';

let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error('no handler'));
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }; };
const { db, publicDb, hash } = await import('./core.ts');
const { ACTION_GATES } = (await import('./index.ts')) as any;
const D = await import('./demo.ts');
const A = await import('./admin.ts');
const S = await import('./system.ts');
const IN = await import('./insight.ts');
const Z = await import('./certificates.ts');
const X = await import('./capstone.ts');
const T = await import('./tracking.ts');
const { resetSettingsCache } = await import('./settings.ts');
const { DEMO_NAME_AR, DEMO_NOT_REAL_AR, DEMO_SKIPPED_AR, DEMO_RESTART_EXTRA, DEMO_RESTART_KEEP, DEMO_ROW_KEEP, DEMO_ROW_RESET, demoCurrentStage, demoLockedStages, demoSkipTarget } = await import('./demo-stage.js');
const { EXPORT_SKIPPED, EXPORT_TABLES } = await import('./privacy.js');

type Row = Record<string, any>;
// الشرطتان المتوسطة والطويلة برمزيهما، فلا يحملهما هذا الملف نفسه
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(900), COHORT = U(901), REAL = U(1), REAL2 = U(2), MODEL = U(600);
const ADMIN: any = { email: 'admin@example.sa', role: 'admin', id: 'a1' };
const SUPER: any = { email: 'owner@example.sa', role: 'super_admin', id: 'a0' };
const CTX = { ip: '203.0.113.7', ua: 'test-agent' };
const DEMO_EMAIL = 'demo@demo.milestone-impact.org';
const now = new Date().toISOString();

// رحلة بكل أنواع القفل التي يعرفها resolveStages: التتابع (الافتراضي)، وتاريخ بعيد (day)، واعتماد الإدارة (approval)،
// وبعد مراحل بعينها (stages)، ومع مرحلة (with)، ومسار مستمر يشترط قبل التقرير، وخدمة عند الحاجة
const STAGES: Row[] = [
  ['profile', 'الملف الشخصي', 'admission', {}], ['assessment', 'تحديد المستوى', 'admission', {}], ['approval', 'اعتماد المستوى', 'admission', {}],
  ['training', 'التدريب', 'qualification', {}], ['ojt', 'التوجيه على رأس العمل', 'qualification', { unlock: 'day', day: 4000 }],
  ['consulting', 'الاستشارة', 'qualification', { unlock: 'approval' }], ['leadership', 'التوجيه القيادي', 'qualification', { unlock: 'with', with: 'consulting' }],
  ['support', 'الدعم والتمكين', 'impact', { unlock: 'stages', after: ['ojt', 'consulting'] }], ['evaluation', 'التقييم والقياس', 'impact', {}],
  ['report', 'التقرير النهائي', 'impact', {}], ['reading', 'القراءة المستمرة', 'qualification', { lane: 'track', due_before: 'report' }],
  ['ask', 'اسأل خبيرًا', 'qualification', { lane: 'service', unlock: 'stages', after: ['approval'] }],
].map(([key, title_ar, phase, rules], i) => ({ program_id: PROG, key, sort: i + 1, title_ar, phase, rules, active: true, duration_days: 7, duration_label: 'أسبوع' }));
const REQS: Row[] = [
  ['profile', 'P-INFO', 'auto'], ['assessment', 'A-DONE', 'auto'], ['approval', 'AP-OK', 'auto'],
  ['training', 'T-MB', 'check'], ['training', 'T-PLAN', 'upload'], ['ojt', 'O-NOTE', 'check'], ['consulting', 'C-BRIEF', 'check'],
  ['leadership', 'L-PLAN', 'check'], ['support', 'S-COP', 'check'], ['evaluation', 'E-POST', 'auto'], ['evaluation', 'E-CASE', 'check'],
  ['report', 'R-ISSUE', 'auto'], ['reading', 'K-READ', 'check'], ['ask', 'Q-ASK', 'check'],
].map(([stage_key, code, kind], i) => ({ id: U(500 + i), program_id: PROG, stage_key, code, kind, sort: i, title_ar: `متطلب ${code}`, required: true, needs_review: kind === 'upload', active: true, dimension: null, level: null, config: {} }));
const placed = (pid: string) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: pid, dimension, level: 'intermediate', approved_at: now }));
const person = (id: string, extra: Row = {}) => ({ id, full_name: 'مشاركة حقيقية', email: `p${id.slice(-1)}@example.sa`, is_demo: false, is_test: false, organization_id: null, status: 'enrolled',
  created_at: now, last_login_at: now, profile_completed_at: now, consented_at: now, ...extra });

function world() {
  resetSettingsCache();
  const tables: Record<string, Row[]> = {
    participants: [person(REAL), person(REAL2)], auth_sessions: [], demo_links: [], audit_log: [], certificates: [], mail_queue: [], mail_log: [],
    payment_settings: [{ id: true, enabled: false }], programs: [{ id: PROG, is_default: true, name: 'برنامج القادة', katon_points: null, final_eval: null, cert: {} }],
    cohorts: [{ id: COHORT, name: 'الدفعة المفتوحة', is_default: true, organization_id: null, status: 'running', program_id: PROG, starts_on: '2026-11-01', ends_on: '2027-03-01', schedule: {} }],
    enrollments: [], entitlements: [], journey_stages: STAGES.map((s) => ({ ...s })), stage_requirements: REQS.map((r) => ({ ...r })),
    // القاعة وكاتون و360 مُظهَرة، فلا يحجب مفتاح ميزة حارسًا خلفه
    app_settings: [{ key: 'features', value: { hall: true, katon: true, f360: true } }], organizations: [],
    placements: [...placed(REAL), ...placed(REAL2)],
    assessments: [REAL, REAL2].map((participant_id, i) => ({ id: U(100 + i), participant_id, status: 'submitted', submitted_at: now, instruments: { key: 'b', kind: 'baseline', title_ar: 'المبدئي', active: true }, assessment_results: [] })),
    participant_requirements: [{ participant_id: REAL, requirement_id: REQS[3].id, status: 'done', completed_at: now }],
    // فصل «سجل المعالم» من وثيقة المبادرة: منه خطة المتابعة (trackingPlan)
    learning_models: [{ id: MODEL, key: 'milestone-register', dimension: 'milestone', sort: 1, min_level: 'beginner', active: true, scopes: null, capstone_sort: 1, title_ar: 'سجل المعالم', icon: null, summary_ar: null, points: 10,
      fields: [{ key: 'milestones', type: 'table', label: 'المعالم', columns: ['المعلم', 'النوع', 'التاريخ', 'معيار القبول', 'صاحب القرار'] }] }],
    model_submissions: [{ id: U(601), participant_id: REAL, model_id: MODEL, status: 'draft', rating: null, answers: { milestones: [['إطلاق التجربة', 'قرار', '2027-01-15', 'اعتماد اللجنة', 'مدير المشروع']] }, updated_at: now }],
    capstones: [{ id: U(602), participant_id: REAL, status: 'draft', snapshot: null, approved_at: null, revisions: 0 }], capstone_updates: [],
    participant_stage_overrides: [], workshop_attendance: [], final_evaluations: [], points_ledger: [], handbook_progress: [], reports: [], tracks: [],
  };
  // حذف المشارك يحذف جلساته وتجاوزاته (on delete cascade في المخطط)، وتضمين participants!inner لمرشحات العد
  const f = installFake(tables, {
    embed: (_t, r, t) => (r.participant_id ? { participants: (t.participants || []).find((p) => p.id === r.participant_id) ?? null } : null),
    onDelete: (table, rows, t) => {
      if (table !== 'participants') return;
      for (const k of ['auth_sessions', 'participant_stage_overrides', 'placements', 'assessments', 'participant_requirements', 'model_submissions', 'capstone_updates', 'points_ledger', 'capstones']) t[k] = (t[k] || []).filter((x) => !rows.some((p) => p.id === x.participant_id));
    },
  });
  const pub = (publicDb as any).from;
  // جلسات الإدارة في المخطط العام (api_sessions): القاعدة المزيفة نفسها، ولا جلسة إدارة فيها أصلًا
  (publicDb as any).from = (db as any).from;
  const call = async (action: string, body: Row = {}) => {
    const res = await handler(new Request('http://leaders.test/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://leaders.test', 'x-forwarded-for': CTX.ip }, body: JSON.stringify({ action, ...body }),
    }));
    return { status: res.status, ...(await res.json()) } as Row;
  };
  const demo = () => f.tables.participants.find((p) => p.is_demo)!;
  // الحساب التجريبي بعد زرّي القبول القائمين (الملف والقياس واعتماد المسار الآلي): حالته كما يكتبانها
  const ready = () => {
    const d = demo();
    Object.assign(d, { profile_completed_at: now, status: 'placed' });
    f.tables.placements.push(...placed(d.id));
    // ما كتبه الحساب التجريبي بيده في فصل سجل المعالم (models.save): بيانات حقيقية على صفه وحده
    f.tables.model_submissions.push({ id: U(699), participant_id: d.id, model_id: MODEL, status: 'draft', rating: null, answers: { milestones: [['تجربة أولى للعرض', 'قرار', '2027-02-01', 'موافقة الراعي', 'قائد المبادرة']] }, updated_at: now });
    f.tables.assessments.push({ id: U(199), participant_id: d.id, status: 'submitted', submitted_at: now, instruments: { key: 'b', kind: 'baseline', title_ar: 'المبدئي', active: true }, assessment_results: [] });
  };
  const adminOpen = async () => ((await D.open(ADMIN, {}, CTX)) as any).url.split('#demo=')[1] as string;
  const overrides = () => { const m: Record<string, string> = {}; for (const o of f.tables.participant_stage_overrides) m[`${o.participant_id}:${o.stage_key}`] = o.action; return m; };
  const realSession = async (pid = REAL) => { const token = `real-session-token-${pid}`; f.tables.auth_sessions.push({ id: U(700), participant_id: pid, token_hash: await hash(token), method: 'code', created_at: now, expires_at: new Date(Date.now() + 864e5).toISOString(), revoked_at: null }); return token; };
  return { ...f, call, demo, ready, adminOpen, overrides, realSession, restore: () => { f.restore(); (publicDb as any).from = pub; resetSettingsCache(); } };
}
const stageOf = (r: Row, key: string) => (r.journey as Row[]).find((s) => s.key === key)!;
const statuses = (r: Row) => Object.fromEntries((r.journey as Row[]).map((s) => [s.key, s.status]));
// كل ما يدخل رقمًا أو تقريرًا أو شهادة أو بريدًا: لا يتغير منه شيء بالتخطي
const COUNTED_TABLES = ['capstones', 'participant_requirements', 'workshop_attendance', 'certificates', 'final_evaluations', 'points_ledger', 'handbook_progress', 'model_submissions', 'reports', 'mail_queue', 'mail_log', 'placements', 'assessments', 'enrollments', 'entitlements'];
const frozen = (t: Record<string, Row[]>) => JSON.stringify(COUNTED_TABLES.map((k) => t[k] || []));

Deno.test('المنطق الخالص: المرحلة الحالية أول متتابعة لم تنتهِ ثم المسار، والخدمة خارجها، والمقفلة وحدها تُفتح', () => {
  const j = [{ key: 'a', status: 'done' }, { key: 'srv', status: 'available', lane: 'service' }, { key: 'trk', status: 'active', lane: 'track' }, { key: 'b', status: 'locked' }, { key: 'c', status: 'active' }];
  assertEquals(demoCurrentStage(j)?.key, 'b');
  assertEquals(demoCurrentStage(j.filter((s) => !['b', 'c'].includes(s.key)))?.key, 'trk');
  assertEquals(demoCurrentStage([{ key: 'a', status: 'done' }, { key: 'srv', status: 'available', lane: 'service' }]), null);
  assertEquals(demoLockedStages(j).map((s: any) => s.key), ['b']);
  assertEquals(demoSkipTarget({ profileDone: false, approved: false, journey: j }).kind, 'profile');
  assertEquals(demoSkipTarget({ profileDone: true, approved: false, journey: j }).kind, 'assessment');
  assertEquals([demoSkipTarget({ profileDone: true, approved: true, journey: j }).kind, demoSkipTarget({ profileDone: true, approved: true, journey: j }).stage.key], ['stage', 'b']);
  assertEquals(demoSkipTarget({ profileDone: true, approved: true, journey: [] }).kind, 'none');
  assertEquals([DEMO_NAME_AR, DEMO_SKIPPED_AR], ['حساب تجريبي', 'تم تخطيها للعرض']);
  for (const t of [DEMO_NAME_AR, DEMO_SKIPPED_AR, DEMO_NOT_REAL_AR]) assert(!DASH.test(t));
});

Deno.test('كل فعل جديد مصنّف: للحساب التجريبي مفتوح، وقبل الاعتماد، وبلا بوابة دفع، ولا فعل منها مفتوح بلا جلسة', () => {
  for (const a of ['demo.skip-stage', 'demo.open-all', 'demo.certificate-preview']) {
    assert(ACTION_GATES.actions.includes(a), a);
    assertEquals([ACTION_GATES.demoOpen.has(a), ACTION_GATES.demoBlocked.has(a), ACTION_GATES.pre.has(a), ACTION_GATES.payFree.has(a), ACTION_GATES.open.includes(a)], [true, false, true, true, false], a);
  }
});

Deno.test('المشارك الحقيقي يُرد عن التخطي وفتح الكل ومعاينة الشهادة، ولا يُكتب له شيء ولو أرسل معرّفه أو معرّف غيره', async () => {
  const w = world();
  try {
    const token = await w.realSession();
    const before = frozen(w.tables);
    for (const action of ['demo.skip-stage', 'demo.open-all', 'demo.certificate-preview']) {
      const r = await w.call(action, { token, participant_id: REAL2, stage_key: 'training' });
      assertEquals([action, r.status, r.code], [action, 403, 'demo_only']);
    }
    assertEquals(w.tables.participant_stage_overrides.length, 0);
    assertEquals(frozen(w.tables), before);
    assertEquals(w.tables.audit_log.filter((x) => String(x.action).startsWith('demo.')).length, 0);
    // وبلا جلسة أصلًا
    for (const action of ['demo.skip-stage', 'demo.open-all', 'demo.certificate-preview']) assertEquals((await w.call(action, {})).status, 401, action);
  } finally { w.restore(); }
});

Deno.test('التخطي: مرحلة واحدة في كل ضغطة بترتيب الرحلة، بوسم «تم تخطيها»، وصف تجاوز للحساب التجريبي وحده، ولا يُكتب دليل', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    const demoId = w.demo().id;
    const before = frozen(w.tables);
    const first = await w.call('me', { token });
    assertEquals([first.status, first.participant.is_demo, stageOf(first, 'training').status, stageOf(first, 'ojt').status], [200, true, 'active', 'locked']);
    const progress0 = first.progress;
    const order: string[] = [];
    // معرّف مشارك حقيقي ومفتاح مرحلة في الجسم لا يغيّران شيئًا: الصف صف صاحب الجلسة، والمرحلة الحالية وحدها
    for (let i = 0; i < 20; i++) {
      const r = await w.call('demo.skip-stage', { token, participant_id: REAL, stage_key: 'report' });
      if (r.status !== 200) { assertEquals([r.status, r.code], [409, 'demo_done']); break; }
      order.push(r.skipped);
      const st = stageOf(r, r.skipped);
      assertEquals([st.status, st.skipped, st.override], ['done', true, 'skip'], r.skipped);
      // بنود المرحلة المتخطاة تبقى كما هي: لا إنجاز مختلق
      assert(st.items.every((it: Row) => it.status !== 'done' || ['P-INFO', 'A-DONE', 'AP-OK'].includes(it.code)), r.skipped);
    }
    // المتتابعة بترتيبها ثم المسار المستمر، والخدمة لا تُتخطى (يطلبها من يريد)
    assertEquals(order, ['training', 'ojt', 'consulting', 'leadership', 'support', 'evaluation', 'report', 'reading']);
    const rows = w.tables.participant_stage_overrides;
    assertEquals(rows.map((o) => [o.participant_id, o.program_id, o.stage_key, o.action, o.by_email]), order.map((k) => [demoId, PROG, k, 'skip', 'حساب تجريبي']));
    assert(rows.every((o) => o.participant_id === demoId), 'لا صف لغير الحساب التجريبي');
    // لا إنجاز ولا حضور ولا درجة ولا شهادة ولا بريد ولا تقييم ختامي ولا نقاط: الجداول كلها كما كانت
    assertEquals(frozen(w.tables), before);
    assertEquals(new Set(w.writes.filter((x) => x.kind !== 'update' || x.table !== 'auth_sessions').map((x) => x.table).filter((t) => !['auth_sessions', 'participants'].includes(t))), new Set(['participant_stage_overrides', 'audit_log']));
    // وكتابات participants هي إنشاء الحساب وآخر دخوله وحدهما
    assert(w.writes.filter((x) => x.table === 'participants').every((x) => x.kind === 'insert' || Object.keys(x.value).join() === 'last_login_at'));
    // السجل: كل تخطٍّ سطر باسم المدير الذي فتح الجلسة
    const log = w.tables.audit_log.filter((x) => x.action === 'demo.stage-skip');
    assertEquals(log.map((x) => [x.actor_type, x.actor, x.entity_id, x.after.stage, x.after.by.admin]), order.map((k) => ['participant', demoId, demoId, k, ADMIN.email]));
    // الحالة بعده: لا نتيجة ختامية ولا شهادة، والشهادة للمشارك فارغة
    const end = await w.call('me', { token });
    assertEquals([end.final, end.participant.status], [null, 'placed']);
    assert(end.progress >= progress0);
    assertEquals((await w.call('certificate', { token })).certificate, null);
    assertEquals(w.tables.certificates.length, 0);
  } finally { w.restore(); }
});

Deno.test('أرقام الإدارة وقوائمها لا تتغير بتخطي الحساب التجريبي كل مراحله وفتحها: النظرة العامة والصحة والاتجاهات وأين توقفوا', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    const reports = async () => JSON.stringify([await A.overview({}), await S.weeklyNumbers(), await S.trends(), await IN.adminInsight()]);
    const before = await reports();
    assert(!before.includes(w.demo().id) && !before.includes(DEMO_EMAIL), 'الحساب التجريبي خارج التقارير أصلًا');
    const mail = await withNet(async (calls) => {
      assertEquals((await w.call('demo.open-all', { token })).status, 200);
      for (let i = 0; i < 12; i++) if ((await w.call('demo.skip-stage', { token })).status !== 200) break;
      return resendCalls(calls).length;
    });
    assertEquals(mail, 0, 'لا بريد يخرج بالتخطي');
    assertEquals(w.tables.mail_queue.length, 0);
    assert(w.tables.participant_stage_overrides.length >= 8);
    assertEquals(await reports(), before);
    // «ماذا تغيّر» للدفعة يُبنى من أعضائها (listed)، فلا يحمل سطور الحساب التجريبي. والسجل العام يحملها كما يحمل فتحه وضبطه
    const ch: any = await IN.adminChanges({ cohort_id: COHORT });
    assertEquals(ch.changes.filter((c: Row) => JSON.stringify(c).includes('demo.')).length, 0);
    // ومشارك حقيقي لا يتأثر: رحلته كما هي ولا تجاوز له
    const real = await w.call('me', { token: await w.realSession() });
    assertEquals([stageOf(real, 'training').status, stageOf(real, 'ojt').status, (real.journey as Row[]).some((s) => s.skipped)], ['active', 'locked', false]);
  } finally { w.restore(); }
});

// أفعال مفتوحة للحساب التجريبي بجسم يكفي ليبلغ الفعل حارس القفل إن وُجد. ما بقي من DEMO_OPEN يُطلب بجسم فارغ
const BODIES: Record<string, (ids: Record<string, string>) => Row> = {
  'requirement.update': (ids) => ({ requirement_id: ids.check }),
  'assessment.get': () => ({ kind: 'post' }),
  'handbook.chapter': () => ({ module_id: U(801) }), 'handbook.complete': () => ({ module_id: U(801) }),
  'models.get': () => ({ key: 'm1' }), 'models.save': () => ({ key: 'm1', fields: {} }),
  'lab.start': () => ({ item_id: U(802) }), 'content.open': (ids) => ({ requirement_id: ids.check }), 'content.ping': (ids) => ({ requirement_id: ids.check, seconds: 10 }),
  'video.ping': (ids) => ({ requirement_id: ids.check, seconds: 10 }), 'handbook.ping': () => ({ module_id: U(801), seconds: 10 }),
  'workshop.checkin': () => ({ code: '1234' }), 'capstone.summary': () => ({ summary: 'ملخص' }), 'tracking.save': () => ({ narrative: 'تحديث' }),
  'peer.ask': () => ({ text: 'سؤال تجريبي عن المعالم', source: 'free' }), 'katon.answer': () => ({ sentence_id: U(803), verdict: 'true', confidence: 2 }),
};
// ردود معروفة ليست قفل مرحلة: حالة حقيقية أخرى للحساب، مسماة هنا بسببها فلا تمر صامتة
// (المتابعة tracking.get وtracking.save كانت هنا بـnot_approved حتى قرار المالك 2026-11-21: تُفتح للحساب التجريبي للعرض)
const NOT_STAGE_LOCK: Record<string, string> = {};
// وفعلان مفتوحان في التصنيف يردهما حارسهما الداخلي عن الحساب التجريبي بقرار سابق (لا استبيان ولا تصدير بيانات له)
const REFUSED_INSIDE: Record<string, string> = { 'sus.submit': 'demo', 'me.export': 'demo' };

Deno.test('«افتح كل المراحل»: كل مقفلة بتتابع أو تاريخ أو اعتماد أو «مع» تُفتح ولا تُعد منتهية، وقبل الاعتماد يُرد', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    // قبل الملف والقياس: لا فتح (بوابة البرنامج تقف مهما فُتحت المراحل)
    const early = await w.call('demo.open-all', { token });
    assertEquals([early.status, early.code], [409, 'demo_gates']);
    assertEquals(w.tables.participant_stage_overrides.length, 0);
    w.ready();
    const before = frozen(w.tables);
    const was = statuses(await w.call('me', { token }));
    assertEquals([was.ojt, was.consulting, was.leadership, was.support, was.evaluation, was.report], Array(6).fill('locked'));
    const r = await w.call('demo.open-all', { token });
    assertEquals(r.status, 200);
    assertEquals(r.opened.sort(), Object.keys(was).filter((k) => was[k] === 'locked').sort());
    const st = statuses(r);
    assert(Object.values(st).every((x) => x !== 'locked'), JSON.stringify(st));
    // الفتح لا يُنهي مرحلة: ما كان منتهيًا بقي، وما فُتح نشط أو متاح، والتقدم كما هو
    assertEquals(Object.keys(st).filter((k) => st[k] === 'done').sort(), Object.keys(was).filter((k) => was[k] === 'done').sort());
    assert((r.journey as Row[]).every((s) => !s.skipped));
    assertEquals(frozen(w.tables), before);
    assertEquals(w.tables.participant_stage_overrides.every((o) => o.action === 'open' && o.participant_id === w.demo().id), true);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.open-all').map((x) => [x.actor, x.after.stages.length, x.after.by.admin]), [[w.demo().id, r.opened.length, ADMIN.email]]);
    // ضغطة ثانية بلا أثر ولا سطر سجل
    const again = await w.call('demo.open-all', { token });
    assertEquals([again.status, again.opened], [200, []]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.open-all').length, 1);
  } finally { w.restore(); }
});

Deno.test('المشي على كل مرحلة بعد «افتح الكل»: لا فعل مفتوح للحساب التجريبي يُرد بـ«مقفل»، ولا بقفل آخر غير مسمّى', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    assertEquals((await w.call('demo.open-all', { token })).status, 200);
    const me = await w.call('me', { token });
    const seen: Record<string, string> = {};
    const ask = async (action: string, body: Row) => {
      const r = await w.call(action, { token, ...body });
      seen[`${action}${body.requirement_id ? `:${body.requirement_id}` : ''}`] = r.success ? 'ok' : String(r.code || r.status);
      return r;
    };
    // 1) كل متطلب يدوي في كل مرحلة يُنجز: حارس requirement.update يقرأ حالة المرحلة من الرحلة نفسها
    for (const s of me.journey as Row[]) {
      for (const it of s.items as Row[]) {
        if (it.kind !== 'check') continue;
        const r = await ask('requirement.update', { requirement_id: it.id });
        assertEquals([s.key, it.code, r.status, r.code ?? null], [s.key, it.code, 200, null]);
      }
    }
    // 2) كل فعل في DEMO_OPEN: لا «مقفل» ولا «غير متاح للحساب التجريبي»
    const ids = { check: REQS.find((x) => x.code === 'E-CASE')!.id };
    for (const action of [...ACTION_GATES.demoOpen].filter((a: string) => !['logout', 'sessions.revoke', 'demo.fill-profile', 'demo.fill-assessment', 'demo.restart'].includes(a))) {
      await ask(action as string, BODIES[action as string]?.(ids) || {});
    }
    const locks = Object.entries(seen).filter(([, c]) => ['locked', 'demo', 'demo_only', 'out_of_program', 'pending'].includes(c) || c.startsWith('pay:'));
    assertEquals(Object.fromEntries(locks), REFUSED_INSIDE, 'فعل مفتوح للحساب التجريبي رُد بقفل');
    // 3) وما رُد بحالة أخرى تشبه القفل مسمّى بسببه، لا أكثر ولا أقل
    const lockish = Object.fromEntries(Object.entries(seen).filter(([, c]) => ['not_approved', 'closed', 'not_closed', 'no_cohort'].includes(c)));
    assertEquals(lockish, NOT_STAGE_LOCK);
    // متابعة الأثر: مفتوحة للحساب التجريبي للعرض (قرار المالك 2026-11-21)، وقد مُشي عليها
    assertEquals([seen['tracking.get'], seen['tracking.save']], ['ok', 'ok']);
    // القياس البعدي: حارسه حالة مرحلة التقييم، وقد فُتحت
    assert(seen['assessment.get'] !== 'locked');
    // ما أُنجز باليد إنجاز حقيقي على صف الحساب التجريبي وحده
    assert(w.tables.participant_requirements.filter((x) => x.participant_id === w.demo().id).length >= 6);
    assert(w.tables.participant_requirements.filter((x) => x.participant_id !== w.demo().id).length === 1);
  } finally { w.restore(); }
});

Deno.test('كل رفض «مقفل» في الخادم مصنّف: بحالة المرحلة (يفتحها التجاوز) أو باعتماد المسار (آلي للحساب التجريبي) أو مغلق عليه أصلًا', async () => {
  // حارس جديد يرد locked يُسقط هذا الاختبار حتى يُراجع: هل يفتحه «افتح كل المراحل» للحساب التجريبي؟
  const KNOWN: Record<string, number> = {
    'activities.ts': 3,    // اعتماد المسار (levelsOf)، ورابط الجلسة وغرفة الموجّه (sessionOpen: حالة المرحلة، والفعلان مغلقان على الحساب التجريبي)
    'capstone.ts': 1,      // اعتماد المسار
    'feedback360.ts': 3,   // حالة قائمة الترشيح، وأفعالها مغلقة على الحساب التجريبي
    'index.ts': 1,         // بوابة البرنامج: اعتماد المسار
    'katon.ts': 1,         // اعتماد المسار
    'participant.ts': 4,   // القياس البعدي (اعتماد ثم حالة مرحلة التقييم)، والمتطلب (حالة مرحلته)، والكتاب (اعتماد)
  };
  const found: Record<string, number> = {};
  for await (const e of Deno.readDir(new URL('.', import.meta.url))) {
    if (!e.name.endsWith('.ts') || e.name.endsWith('_test.ts') || e.name.startsWith('_')) continue;
    const src = await Deno.readTextFile(new URL(`./${e.name}`, import.meta.url));
    const n = (src.match(/new Fail\([^\n]*,\s*'locked'/g) || []).length;
    if (n) found[e.name] = n;
  }
  assertEquals(found, KNOWN);
});

Deno.test('زائر الرابط: يتخطى ويفتح داخل الحساب التجريبي وحده باسم رابطه في السجل، ولا يبلغ فعل إدارة ولا إعادة الضبط ولا فعلًا مغلقًا', async () => {
  const w = world();
  try {
    const made: any = await D.linkCreate(ADMIN, { label: 'مدير الدفعة' });
    const opened = await w.call('demo.link-open', { t: made.url.split('#try=')[1] });
    assertEquals([opened.status, opened.demo_shared, opened.participant.is_demo], [200, true, true]);
    w.ready();
    const token = opened.token;
    const r = await w.call('demo.skip-stage', { token });
    assertEquals([r.status, r.skipped], [200, 'training']);
    assertEquals((await w.call('demo.open-all', { token })).status, 200);
    assertEquals(w.tables.audit_log.filter((x) => ['demo.stage-skip', 'demo.open-all'].includes(x.action)).map((x) => [x.after.by.label, x.after.by.link]), Array(2).fill(['مدير الدفعة', made.link.id]));
    assert(w.tables.participant_stage_overrides.every((o) => o.participant_id === w.demo().id));
    // لا قوة إدارة: الضبط وفتح الحساب وتدخل المراحل والروابط كلها تحتاج جلسة إدارة
    for (const action of ['admin.demo-reset', 'admin.demo-open', 'admin.stage-override', 'admin.demo-link-create', 'admin.participants', 'admin.overview', 'admin.certificate-issue']) {
      const x = await w.call(action, { token, participant_id: REAL, stage_key: 'training', stage_action: 'skip', label: 'محاولة' });
      assertEquals([action, x.status, x.code], [action, 401, 'session']);
    }
    // والمغلق على الحساب التجريبي يبقى مغلقًا بعد فتح كل المراحل، برسالة «لا يُنفذ فعليًا»
    for (const action of ACTION_GATES.demoBlocked) {
      const x = await w.call(action, { token });
      assertEquals([action, x.status, x.code, x.message], [action, 403, 'demo', 'في الحساب التجريبي لا يُنفذ هذا فعليًا']);
    }
    // مشارك حقيقي لم يتأثر
    assertEquals(w.tables.participant_stage_overrides.filter((o) => o.participant_id === REAL).length, 0);
  } finally { w.restore(); }
});

Deno.test('إعادة الضبط: للمدير الأعلى وحده، تمسح الحساب وتجاوزاته وما أنجزه، والفتح التالي يبدأ نظيفًا', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    await w.call('demo.open-all', { token });
    await w.call('demo.skip-stage', { token });
    await w.call('requirement.update', { token, requirement_id: REQS.find((x) => x.code === 'O-NOTE')!.id });
    const oldId = w.demo().id;
    assert(w.tables.participant_stage_overrides.length > 0 && w.tables.participant_requirements.some((x) => x.participant_id === oldId));
    // مدير بصلاحية الكتابة يفتح ولا يعيد الضبط (index.ts: superWriter)
    const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
    assert(index.includes("'admin.demo-reset': (a, b) => A.superWriter(a, D.reset, b)"));
    assert(index.includes("'admin.demo-open': (a, b, ctx) => A.writer(a, (x, y) => D.open(x, y, ctx), b)"));
    await D.reset(SUPER);
    assertEquals(w.tables.participants.filter((p) => p.is_demo).length, 0);
    assertEquals([w.tables.participant_stage_overrides.length, w.tables.participant_requirements.filter((x) => x.participant_id === oldId).length, w.tables.auth_sessions.filter((s) => s.participant_id === oldId).length], [0, 0, 0]);
    assertEquals((await w.call('me', { token })).status, 401);
    // المشاركون الحقيقيون وما أنجزوه كما هم
    assertEquals([w.tables.participants.length, w.tables.participant_requirements.length], [2, 1]);
    // الفتح التالي: حساب جديد من البداية، بلا تجاوز
    const fresh = await w.call('me', { token: await w.adminOpen() });
    assertEquals([fresh.status, fresh.participant.id !== oldId, fresh.participant.full_name, (fresh.journey as Row[]).some((s) => s.skipped || s.override)], [200, true, 'مشارك تجريبي', false]);
    assertEquals(w.tables.audit_log.filter((x) => x.action === 'demo.reset').map((x) => x.actor), [SUPER.email]);
  } finally { w.restore(); }
});

Deno.test('معاينة الشهادة: القالب ببيانات الحساب التجريبي بعلامة نموذج، بلا رقم ولا رابط تحقق ولا توقيع ولا صف، والتحقق العام لا يجد شيئًا', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    const r = await w.call('demo.certificate-preview', { token });
    assertEquals([r.status, r.certificate.sample, r.certificate.serial, r.certificate.verify_url, r.certificate.name_ar, r.certificate.program_ar], [200, true, null, null, 'مشارك تجريبي', 'برنامج القادة']);
    assert(!('signature' in r.certificate));
    assert(!/MI-LDR-/.test(JSON.stringify(r)), 'لا رقم بصيغة الشهادات');
    assertEquals(w.tables.certificates.length, 0);
    assertEquals(w.writes.filter((x) => x.table === 'certificates').length, 0);
    // لا رقم يُتحقق منه: «SAMPLE» وما يشبهه غير موجود في التحقق العام
    for (const serial of ['SAMPLE', 'MI-LDR-2026-SAMPLE']) {
      const v: any = await Z.verify({ serial }, CTX).catch((e) => ({ success: false, code: e.code, status: e.status }));
      assert(!v.certificate && v.valid !== true, serial);
    }
    // والإصدار الحقيقي ما زال مرفوضًا للحساب التجريبي بعد تخطي كل المراحل
    for (let i = 0; i < 12; i++) if ((await w.call('demo.skip-stage', { token })).status !== 200) break;
    const issued: any = await Z.issueAfterNameConfirm(w.demo().id);
    assert(!issued?.serial);
    assertEquals(w.tables.certificates.length, 0);
  } finally { w.restore(); }
});

Deno.test('متابعة الأثر للحساب التجريبي: تُفتح للعرض بلا اعتماد مخزَّن ولا اسم مستشار، والمشارك الحقيقي غير المعتمدة وثيقته يُرد', async () => {
  const w = world();
  try {
    const token = await w.adminOpen();
    w.ready();
    const demoId = w.demo().id;
    const reports = async () => JSON.stringify([await A.overview({}), await X.adminList({}), await T.adminOutcomes({}), await IN.adminInsight()]);
    // التقارير أولًا: بعضها يضيف حقولًا محسوبة إلى الصف المقروء في الذاكرة (أثر القاعدة المزيفة وحدها)
    const reportsBefore = await reports();
    const before = frozen(w.tables);
    const mark = w.writes.length;
    const got = await w.call('tracking.get', { token });
    assertEquals([got.status, got.simulated, got.tracking.state.milestones.map((m: Row) => m.title)], [200, true, ['تجربة أولى للعرض']]);
    // القراءة لا تكتب شيئًا، ولا صف مبادرة للحساب التجريبي، ولا اعتماد مخزَّن لأحد
    assertEquals(frozen(w.tables), before);
    assertEquals(w.tables.capstones.map((c) => [c.participant_id, c.status]), [[REAL, 'draft']]);
    // لا مستشار ولا درجة ولا اعتماد في الرد، والوثيقة نفسها ما زالت مسودة بلا متابعة ملحقة بها
    for (const k of ['approved_by', 'reviewed_by', 'score', 'sponsor']) assert(!JSON.stringify(got).includes(`"${k}"`), k);
    const doc = await w.call('capstone.doc', { token });
    assertEquals([doc.doc.meta.status, doc.doc.meta.approved_at, 'tracking' in doc.doc], ['draft', null, false]);
    assertEquals((await w.call('capstone.get', { token })).capstone.status, 'draft');
    // الحفظ: صف متابعة ونقاطه على الحساب التجريبي وحده، ولا بريد، ولا جدول آخر
    const mail = await withNet(async (calls) => {
      const saved = await w.call('tracking.save', { token, milestones: { m0: { status: 'on_track', note: 'يسير كما خُطط' } }, benefits: {}, narrative: 'تحديث أول للعرض في الحساب التجريبي', participant_id: REAL });
      assertEquals([saved.status, saved.simulated, saved.tracking.updates.length], [200, true, 1]);
      return resendCalls(calls).length;
    });
    assertEquals([mail, w.tables.mail_queue.length], [0, 0]);
    assertEquals(w.tables.capstone_updates.map((u) => u.participant_id), [demoId]);
    assert(w.tables.points_ledger.length >= 1 && w.tables.points_ledger.every((x) => x.participant_id === demoId));
    assertEquals(JSON.stringify(COUNTED_TABLES.filter((k) => k !== 'points_ledger').map((k) => w.tables[k] || [])), JSON.stringify(JSON.parse(before).filter((_: unknown, i: number) => COUNTED_TABLES[i] !== 'points_ledger')));
    assertEquals(new Set(w.writes.slice(mark).map((x) => x.table).filter((t) => !['auth_sessions', 'audit_log'].includes(t))), new Set(['capstone_updates', 'points_ledger']));
    // قوائم الإدارة وأرقامها ومحفظة المتابعة وطابور مراجعة المبادرات كما كانت
    assertEquals(await reports(), reportsBefore);
    assert(!reportsBefore.includes(demoId));
    assertEquals(((await IN.adminChanges({ cohort_id: COHORT })) as any).changes.filter((c: Row) => JSON.stringify(c).includes('tracking.')).length, 0);
    // المشارك الحقيقي بوثيقة غير معتمدة وبالمحتوى نفسه: مردود، ولو أرسل علامة المحاكاة
    const real = await w.realSession();
    for (const action of ['tracking.get', 'tracking.save']) {
      const r = await w.call(action, { token: real, simulated: true, is_demo: true, milestones: { m0: { status: 'done' } }, narrative: 'محاولة' });
      assertEquals([action, r.status, r.code], [action, 403, 'not_approved']);
    }
    assertEquals(w.tables.capstone_updates.map((u) => u.participant_id), [demoId]);
    await assertRejects(() => X.demoDoc(w.tables.participants.find((p) => p.id === REAL)), Error);
    // ومسارات الأطراف الأخرى لا تمر بباب المحاكاة: متابعة الحساب التجريبي لغير صاحب الجلسة بلا شيء
    assertEquals(await T.trackingOf(demoId), null);
    // إعادة الضبط تمسحه
    await D.reset(SUPER);
    assertEquals([w.tables.capstone_updates.length, w.tables.points_ledger.length], [0, 0]);
  } finally { w.restore(); }
});

Deno.test('«أعد من البداية»: يمسح كل ما يحمله الحساب التجريبي ويعيد صفه إلى أوله، وتبقى جلسات الجميع وروابطهم، ولا يمس مشاركًا حقيقيًا', async () => {
  const w = world();
  try {
    const one: any = await D.linkCreate(ADMIN, { label: 'مدير الدفعة' }), two: any = await D.linkCreate(ADMIN, { label: 'مسؤول الجهة' });
    const admin = await w.adminOpen();
    const l1 = (await w.call('demo.link-open', { t: one.url.split('#try=')[1] })).token;
    const l2 = (await w.call('demo.link-open', { t: two.url.split('#try=')[1] })).token;
    w.ready();
    const demoId = w.demo().id;
    Object.assign(w.demo(), { job_title: 'مدير إدارة المشاريع', phone: '05' + '0'.repeat(8), bio: 'نبذة', name_confirmed_at: now, consented_at: now });
    await w.call('demo.open-all', { token: l1 });
    await w.call('demo.skip-stage', { token: l1 });
    await w.call('requirement.update', { token: admin, requirement_id: REQS.find((x) => x.code === 'O-NOTE')!.id });
    await w.call('tracking.save', { token: l2, milestones: { m0: { status: 'on_track' } }, benefits: {}, narrative: 'تحديث للعرض قبل الإعادة' });
    w.tables.peer_answers = [{ id: U(650), request_id: U(651), author_id: demoId, text: 'إجابة', status: 'pending' }, { id: U(652), request_id: U(651), author_id: REAL, text: 'إجابة حقيقية', status: 'pending' }];
    const held = (id: string) => Object.entries(w.tables).filter(([t, rows]) => !['participants', 'audit_log', 'auth_sessions'].includes(t) && rows.some((r) => r.participant_id === id || r.author_id === id)).map(([t]) => t).sort();
    assert(held(demoId).length >= 7, held(demoId).join());
    // كل صف ليس للحساب التجريبي، في كل جدول (الجداول الفارغة خارج المقارنة: القاعدة المزيفة تنشئها عند أول لمس)
    const others = () => JSON.stringify(Object.fromEntries(Object.entries(w.tables).filter(([t]) => !['audit_log', 'auth_sessions'].includes(t)).map(([t, rows]) => [t, rows.filter((r) => r.participant_id !== demoId && r.author_id !== demoId && r.id !== demoId)] as [string, Row[]]).filter(([, rows]) => rows.length)));
    const realBefore = others();
    const sessions = w.tables.auth_sessions.length, links = JSON.stringify(w.tables.demo_links.map((l) => [l.id, l.revoked_at ?? null]));
    // مشارك حقيقي يُرد ولا يُمسح له شيء
    const real = await w.realSession();
    const no = await w.call('demo.restart', { token: real });
    assertEquals([no.status, no.code], [403, 'demo_only']);
    // من جلسة رابط: يعود الحساب إلى أوله
    const r = await w.call('demo.restart', { token: l2, participant_id: REAL });
    assertEquals([r.status, r.restarted, r.participant.id, r.participant.full_name, r.participant.status, r.profile], [200, true, demoId, 'مشارك تجريبي', 'registered', null]);
    assertEquals(held(demoId), []);
    const row = w.demo();
    for (const [k, v] of Object.entries(DEMO_ROW_RESET)) assertEquals(row[k] ?? null, v, k);
    assertEquals([row.id, row.email, row.is_demo, row.organization_id ?? null], [demoId, DEMO_EMAIL, true, null]);
    assert((r.journey as Row[]).every((s) => !s.skipped && !s.override));
    assertEquals([stageOf(r, 'profile').status, stageOf(r, 'training').status], ['active', 'locked']);
    // الجلسات كلها قائمة (جلسة المدير وجلستا الرابطين)، والروابط كما هي
    assertEquals(await Promise.all([admin, l1, l2].map(async (t) => (await w.call('me', { token: t })).status)), [200, 200, 200]);
    assertEquals([w.tables.auth_sessions.filter((x) => x.participant_id === demoId && !x.revoked_at).length, JSON.stringify(w.tables.demo_links.map((l) => [l.id, l.revoked_at ?? null]))], [3, links]);
    assert(w.tables.auth_sessions.length >= sessions);
    assertEquals((await w.call('me', { token: l1 })).demo_shared, true);
    // لا شيء من مشارك حقيقي تغيّر
    assertEquals(others(), realBefore);
    // السجل يسمّي من فعلها (اسم الرابط) وما مُسح
    const log = w.tables.audit_log.filter((x) => x.action === 'demo.restart');
    assertEquals(log.map((x) => [x.actor_type, x.actor, x.after.by.label]), [['participant', demoId, 'مسؤول الجهة']]);
    assert(['participant_stage_overrides', 'participant_requirements', 'placements', 'assessments', 'capstone_updates', 'model_submissions', 'peer_answers'].every((t) => log[0].after.cleared.includes(t)), log[0].after.cleared.join());
    // الاعتماد سُحب فعلًا: ما كان مفتوحًا بعد الاعتماد عاد مقفلًا لهذا الحساب بمعرّفه نفسه (لا يُحفظ اعتماده في العامل)
    for (const action of ['handbook.toc', 'capstone.get', 'tracking.get', 'demo.open-all']) assert(['locked', 'demo_gates'].includes((await w.call(action, { token: admin })).code), action);
    // ثم يبدأ من جديد بالأزرار نفسها
    assertEquals((await w.call('demo.restart', { token: admin })).status, 200);
  } finally { w.restore(); }
});

Deno.test('حارس «أعد من البداية»: كل عمود في صف المشارك مصنّف (يعود أو يبقى)، وكل جدول يشير إلى المشارك داخل المسح أو مستثنى بسببه', async () => {
  const sql = await Deno.readTextFile(new URL('../../schema/baseline.sql', import.meta.url));
  const block = sql.slice(sql.indexOf('create table if not exists leaders.participants ('));
  const cols = block.slice(0, block.indexOf('\n);')).split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('constraint')).map((l) => l.split(/\s+/)[0]);
  assert(cols.length >= 30, String(cols.length));
  const known = new Set([...Object.keys(DEMO_ROW_RESET), ...DEMO_ROW_KEEP]);
  assertEquals(cols.filter((c) => !known.has(c)), [], 'عمود جديد في participants: صنّفه في DEMO_ROW_RESET أو DEMO_ROW_KEEP (demo-stage.js)');
  assertEquals(Object.keys(DEMO_ROW_RESET).filter((c) => DEMO_ROW_KEEP.includes(c)), []);
  // كل مفتاح أجنبي إلى participants: جدوله في قائمة المسح بعموده، أو يبقى (الجلسات)، أو ليس صفًا يملكه المشارك
  const NOT_OWNED: Record<string, string> = { 'hall_sessions.leader_id': 'جلسة قاعة للدفعة، والعمود يُفرَّغ', 'hall_sessions.persona_id': 'جلسة قاعة للدفعة، والعمود يُفرَّغ',
    // سجل الدمج (20261128190000): الحساب التجريبي لا يُدمج (merge_demo)، والسجل يُمحى مع الحساب نفسه
    'participant_merges.kept_id': 'سجل دمج لا يُدمج فيه التجريبي', 'participant_merges.merged_id': 'سجل دمج لا يُدمج فيه التجريبي' };
  const cleared = new Map<string, string>([...[...Object.keys(EXPORT_TABLES), ...Object.keys(EXPORT_SKIPPED)].map((t) => [t, 'participant_id'] as [string, string]), ...Object.entries(DEMO_RESTART_EXTRA as Record<string, string>)]);
  const fks = [...sql.matchAll(/alter table leaders\.(\w+) add constraint \w+ FOREIGN KEY \((\w+)\) REFERENCES leaders\.participants\(id\)/g)].map((m) => [m[1], m[2]]);
  assert(fks.length >= 40, String(fks.length));
  const missed = fks.filter(([t, c]) => !(cleared.get(t) === c) && !NOT_OWNED[`${t}.${c}`]).map(([t, c]) => `${t}.${c}`);
  assertEquals(missed, []);
  assertEquals(DEMO_RESTART_KEEP, ['auth_sessions']);
  assert(cleared.has('auth_sessions'), 'الجلسات في القائمة العامة، وتُستثنى من المسح صراحة');
});
