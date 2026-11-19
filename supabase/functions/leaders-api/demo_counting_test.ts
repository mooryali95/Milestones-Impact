// المرحلة 0 من تصور الحساب التجريبي (2026-11-19): حساب العرض خارج كل رقم وقائمة وشهادة وبريد لطرف ثالث. اختبار لكل ثغرة
// وُجدت في العدّ، على قاعدة في الذاكرة تطبّق المرشحات والتضمين (participants!inner)، فإزالة القاعدة من استعلام تُسقط اختباره.
// الحضور بالمسح والأرقام على الموجّه الحقيقي في workshop_code_test.ts، والحارس النصي في counting_guard_test.ts.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG, Fail } = await import('./core.ts');
const V = await import('./activities.ts');
const S = await import('./system.ts');
const I = await import('./impact.ts');
const Z = await import('./certificates.ts');
const F = await import('./final.ts');
const X = await import('./capstone.ts');
const T = await import('./tracking.ts');
const A = await import('./admin.ts');
const { counted, isCounted, isListed, listed, simulated } = await import('./counting.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REAL = U(1), DEMO = U(2), TEST = U(3), WS = U(10), REQ = U(11), INST = U(12);
const now = new Date().toISOString();
const person = (id: string, extra: Row = {}) => ({
  id, full_name: id === DEMO ? 'مشارك العرض' : id === TEST ? 'حساب اختبار' : 'مشارك حقيقي', email: id === DEMO ? 'demo@demo.milestone-impact.org' : `p${id.slice(-1)}@example.sa`,
  is_demo: id === DEMO, is_test: id === TEST, organization_id: null, status: 'pending_approval', created_at: now, last_login_at: now, name_confirmed_at: now, ...extra,
});
const people = () => [person(REAL), person(DEMO), person(TEST)];
// كل جدول يحمل participant_id يضمَّن معه صف صاحبه، كما يفعل PostgREST مع participants!inner
const embed = (_t: string, r: Row, tables: Record<string, Row[]>) => (r.participant_id ? { participants: (tables.participants || []).find((p) => p.id === r.participant_id) ?? null } : null);
const fake = (tables: Record<string, Row[]>) => installFake(tables, { embed });
const placed = (pid: string) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: pid, dimension, level: 'intermediate', approved_at: now }));
const code = async (fn: () => Promise<unknown>) => ((await assertRejects(fn, Fail)) as InstanceType<typeof Fail>).code;

Deno.test('القواعد المسماة: حساب العرض خارج القوائم والأرقام، وحساب الاختبار خارج الأرقام وحدها', () => {
  assertEquals([isListed({ is_demo: true }), isListed({ is_test: true }), isListed({})], [false, true, true]);
  assertEquals([isCounted({ is_demo: true }), isCounted({ is_test: true }), isCounted({})], [false, false, true]);
  assertEquals([simulated({ is_demo: true }), simulated({ is_test: true }), simulated(null)], [true, false, false]);
  const seen: [string, unknown][] = [];
  const q: any = { eq: (c: string, v: unknown) => { seen.push([c, v]); return q; } };
  listed(q); counted(q); listed(q, 'participants'); counted(q, 'participants');
  assertEquals(seen, [['is_demo', false], ['is_demo', false], ['is_test', false], ['participants.is_demo', false], ['participants.is_demo', false], ['participants.is_test', false]]);
});

Deno.test('الحضور: حساب العرض ليس في المتوقعين ولا في عدّاد «حضر»، ولا يُكتب له حضور يدوي', async () => {
  const f = fake({
    participants: [person(REAL, { status: 'enrolled' }), person(DEMO, { status: 'placed' })],
    placements: [...placed(REAL), ...placed(DEMO)],
    stage_requirements: [{ id: REQ, kind: 'workshop', dimension: null, level: null, title_ar: 'الأيام التدريبية', config: { verify: 'qr' } }],
    workshop_sessions: [{ id: WS, requirement_id: REQ, cohort_id: null, title_ar: 'اليوم الأول', location_ar: 'القاعة', secret: 's'.repeat(32), mode: 'in_person', active: true,
      starts_at: new Date(Date.now() - 6e5).toISOString(), ends_at: new Date(Date.now() + 72e5).toISOString() }],
    // صف قديم لحساب العرض من قبل المحاكاة: لا يُعرض ولا يُعد
    workshop_attendance: [{ session_id: WS, participant_id: REAL, method: 'qr', checked_in_at: now }, { session_id: WS, participant_id: DEMO, method: 'qr', checked_in_at: now }],
    audit_log: [],
  });
  try {
    const att: any = await V.workshopAttendance({ id: WS });
    assertEquals(att.people.map((p: any) => p.id), [REAL]);
    assertEquals(((await V.workshopQr({ id: WS })) as any).attended, 1);
    assertEquals(await code(() => V.workshopMark({ email: 'admin@example.sa' }, { session_id: WS, participant_id: DEMO, present: true })), 'demo');
    assertEquals(f.writes.filter((w) => w.table === 'workshop_attendance').length, 0);
    // والحقيقي يُسجَّل يدويًا كما كان
    await V.workshopMark({ email: 'admin@example.sa' }, { session_id: WS, participant_id: REAL, present: true });
    assertEquals(f.writes.filter((w) => w.table === 'workshop_attendance').length, 1);
  } finally { f.restore(); }
});

Deno.test('تقرير الصحة الأسبوعي: انضموا ونشطوا وينتظرون الاعتماد ومتطلبات المراجعة بلا حساب العرض ولا حساب الاختبار', async () => {
  const f = fake({
    participants: people(),
    participant_requirements: [REAL, DEMO, TEST].map((participant_id) => ({ participant_id, requirement_id: REQ, status: 'submitted' })),
  });
  try {
    assertEquals(await S.weeklyNumbers(), { joined: 1, active: 1, pending: 1, submitted: 1 });
  } finally { f.restore(); }
});

Deno.test('اتجاهات 12 أسبوعًا: التسجيل والقياس والاعتماد والنشاط بلا حساب العرض ولا حساب الاختبار', async () => {
  const f = fake({
    participants: people(),
    assessments: [REAL, DEMO, TEST].map((participant_id, i) => ({ id: U(100 + i), participant_id, status: 'submitted', submitted_at: now })),
    placements: [...placed(REAL), ...placed(DEMO), ...placed(TEST)],
    auth_sessions: [REAL, DEMO, DEMO, TEST].map((participant_id, i) => ({ id: U(200 + i), participant_id, created_at: now, last_seen_at: now })),
  });
  try {
    const r: any = await S.trends();
    const sum = (k: string) => r.weeks.reduce((a: number, w: any) => a + (w[k] || 0), 0);
    assertEquals([sum('joined'), sum('assessed'), sum('approved'), sum('active')], [1, 1, 1, 1]);
  } finally { f.restore(); }
});

// أداة صغيرة: أربعة بنود معرفة لإطار واحد، وإجابات لثلاثة قياسات مُرسلة
function measurement() {
  const qs = [0, 1, 2, 3].map((i) => ({ id: U(300 + i), instrument_id: INST, code: `K${i}`, dimension: 'milestone', tier: 'knowledge', kind: 'single', text_ar: `بند ${i}`, active: true, form: null,
    options: [{ score: 1 }, { score: 0 }] }));
  const sessions = [REAL, DEMO, TEST].map((participant_id, i) => ({ id: U(400 + i), participant_id, instrument_id: INST, status: 'submitted', form: null, submitted_at: now }));
  const answers = sessions.flatMap((s) => qs.map((q, k) => ({ assessment_id: s.id, question_id: q.id, score: k % 2, value: { k: k % 2 } })));
  return { questions: qs, assessments: sessions, assessment_answers: answers, instruments: [{ id: INST, key: 'baseline-test', kind: 'baseline', active: true, version: 1 }] };
}

Deno.test('تحليل البنود: يُحسب من قياسات من يُعدّون وحدهم، فإجابات حساب العرض النمطية خارجه', async () => {
  const f = fake({ participants: people(), ...measurement(), assessment_results: [], placements: [] });
  try {
    const r: any = await S.itemReport({ instrument_id: INST });
    assertEquals(r.success, true);
    assertEquals(r.respondents, 1);
    assertEquals(r.items.map((x: any) => x.n), [1, 1, 1, 1]);
  } finally { f.restore(); }
});

Deno.test('ثبات الأداة في تقرير الأثر: إجاباته تُقرأ لقياسات من يُعدّون وحدهم، وأثر التكرار كذلك', async () => {
  const m = measurement();
  const f = fake({ participants: people(), ...m, assessment_results: [], placements: [], placement_model: [{ id: 1 }], raters: [], participant_requirements: [], stage_requirements: [] });
  // أي قياسات قُرئت إجاباتها ونتائجها: يُسجَّل ما يمر بـin على assessment_id
  const { db } = await import('./core.ts');
  const base = (db as any).from;
  const read = new Set<string>();
  (db as any).from = (t: string) => {
    const q = base(t);
    if (t !== 'assessment_answers' && t !== 'assessment_results') return q;
    const spy: any = new Proxy(q, { get: (o, k: string) => (k === 'then' ? o.then.bind(o) : (...args: any[]) => {
      if (k === 'in' && args[0] === 'assessment_id') args[1].forEach((v: string) => read.add(v));
      const out = o[k](...args);
      return out === o ? spy : out;
    }) });
    return spy;
  };
  try {
    const { cfg }: any = await I.compareFor(null);
    assert(cfg.source.milestone, 'مصدر الثبات في الرد');
    // قياس المشارك الحقيقي وحده: لا قياس حساب العرض (الثاني) ولا حساب الاختبار (الثالث)
    assertEquals([...read], [m.assessments[0].id]);
  } finally { (db as any).from = base; f.restore(); }
});

Deno.test('الشهادة: لا صف ولا رقم لحساب العرض من اعتماد ختامي، وصف قديم له لا يتحقق كأصلي', async () => {
  Deno.env.set('LEADERS_CERT_SIGNING_KEY', 'k-'.padEnd(40, 'x')); Deno.env.set('LEADERS_CERT_KEY_ID', 'k1');
  const f = fake({
    participants: [person(REAL, { status: 'completed' }), person(DEMO, { status: 'completed' })],
    certificate_settings: [{ id: 1, enabled: true }],
    // صف قديم لحساب العرض (قبل الحارس) بتوقيع صحيح الشكل، وشهادة حقيقية
    certificates: [
      { id: U(500), serial: 'MI-LDR-2026-DEMO01', participant_id: DEMO, status: 'valid', snapshot: { serial: 'MI-LDR-2026-DEMO01', name_ar: 'مشارك العرض' }, signature: 'k1:00', issued_at: now },
      { id: U(501), serial: 'MI-LDR-2026-REAL01', participant_id: REAL, status: 'valid', snapshot: { serial: 'MI-LDR-2026-REAL01', name_ar: 'مشارك حقيقي' }, signature: 'k1:00', issued_at: now },
    ],
    certificate_checks: [], audit_log: [],
  });
  try {
    const before = f.tables.certificates.length;
    const r: any = await Z.onFinalApproved(DEMO, { decision: 'pass', formula_version: 1, program_id: 'prog' }, 'admin@example.sa');
    // للحساب شهادة سارية قديمة: يُرد قبل الإصدار كما لأي مشارك. بحذفها يصل الحارس نفسه
    assertEquals(r, null);
    f.tables.certificates = f.tables.certificates.filter((c) => c.participant_id !== DEMO || c.status !== 'valid');
    const again: any = await Z.onFinalApproved(DEMO, { decision: 'pass', formula_version: 1, program_id: 'prog' }, 'admin@example.sa');
    assertEquals(again, { skipped: 'demo' });
    assertEquals(Z.certificateNotice(again), 'اعتُمد التقييم، ولا تصدر شهادة لحساب العرض');
    assertEquals(f.writes.filter((w) => w.table === 'certificates' && w.kind === 'insert').length, 0);
    assertEquals(f.tables.audit_log.map((x) => x.action), ['certificate.skipped-demo']);
    assertEquals(f.tables.certificates.length, before - 1);
    // وبتأكيد الاسم كذلك: المسار الثاني إلى الإصدار
    f.tables.final_evaluations = [{ participant_id: DEMO, program_id: 'prog', decision: 'pass', status: 'approved', decided_at: now, snapshot: {} }];
    assertEquals(await Z.issueAfterNameConfirm(DEMO), { skipped: 'demo' });
    assertEquals(f.writes.filter((w) => w.table === 'certificates' && w.kind === 'insert').length, 0);
  } finally { f.restore(); }
});

Deno.test('التحقق العام: رقم شهادة لحساب العرض يُرد «غير موجود»، ورقم المشارك الحقيقي موجود', async () => {
  const f = fake({
    participants: [person(REAL), person(DEMO)],
    certificates: [
      { id: U(500), serial: 'MI-LDR-2026-DEMO01', participant_id: DEMO, status: 'valid', snapshot: { serial: 'MI-LDR-2026-DEMO01', name_ar: 'مشارك العرض' }, signature: 'k1:00', issued_at: now },
      { id: U(501), serial: 'MI-LDR-2026-REAL01', participant_id: REAL, status: 'valid', snapshot: { serial: 'MI-LDR-2026-REAL01', name_ar: 'مشارك حقيقي' }, signature: 'k1:00', issued_at: now },
    ],
    certificate_checks: [],
  });
  try {
    const ctx = { ip: '203.0.113.9', ua: 'test' };
    const demo: any = await Z.verify({ serial: 'MI-LDR-2026-DEMO01' }, ctx);
    assertEquals(demo, { success: true, found: false });
    const real: any = await Z.verify({ serial: 'MI-LDR-2026-REAL01' }, ctx);
    assertEquals(real.found, true);
    assertEquals(f.tables.certificate_checks.map((c) => c.found), [false, true]);
  } finally { f.restore(); }
});

Deno.test('التقييم الختامي: الحفظ والتصويت وإعادة الفتح مرفوضة لحساب العرض قبل أي كتابة', async () => {
  const f = fake({ participants: [person(DEMO, { status: 'enrolled' })], final_evaluations: [], audit_log: [], programs: [{ id: 'prog', is_default: true, final_eval: null }] });
  try {
    const a: any = { email: 'admin@example.sa', role: 'super_admin' };
    assertEquals(await code(() => F.save(a, { participant_id: DEMO, adjust: {} })), 'demo');
    assertEquals(await code(() => F.vote(a, { participant_id: DEMO, vote: 'approve' })), 'demo');
    assertEquals(await code(() => F.reopen(a, { participant_id: DEMO, note: 'سبب مكتوب لإعادة الفتح' })), 'demo');
    assertEquals(f.writes.length, 0);
  } finally { f.restore(); }
});

Deno.test('بريد الطرف الثالث: دعوة الراعي وتأكيد الأثر تُحاكيان لحساب العرض (الحالة تُكتب ولا يخرج بريد)، وتخرجان لغيره', async () => {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100 });
  const charter = { title: 'مبادرة تجريبية', sponsor: 'راعٍ حقيقي', sponsor_email: 'sponsor@real-org.example' };
  const f = fake({
    capstones: [{ id: U(600), participant_id: DEMO, status: 'accepted' }, { id: U(601), participant_id: REAL, status: 'accepted' }],
    capstone_updates: [{ id: U(700), participant_id: DEMO }, { id: U(701), participant_id: REAL }],
    mail_events: [], mail_queue: [], app_settings: [],
  });
  try {
    await withNet(async (calls) => {
      const demo = person(DEMO), real = person(REAL);
      // حساب العرض كتب بريدًا حقيقيًا في بطاقة مبادرته: لا يخرج إليه شيء
      await X.inviteSponsor(demo, f.tables.capstones[0], charter);
      const cap = { sponsor_email: charter.sponsor_email, sponsor_name: charter.sponsor, snapshot: { meta: {} } };
      assertEquals(await T.inviteVerifier(demo, cap, U(700), 'mid'), 'sent');
      assertEquals(resendCalls(calls).length, 0);
      assertEquals([f.tables.capstones[0].sponsor_status, f.tables.capstone_updates[0].verify_status], ['pending', 'pending']);
      // والمشارك الحقيقي يخرج بريده إلى راعيه كما كان: الاختبار يرى البريد حين يخرج
      await X.inviteSponsor(real, f.tables.capstones[1], charter);
      assertEquals(await T.inviteVerifier(real, cap, U(701), 'mid'), 'sent');
      assertEquals(resendCalls(calls).map((c) => c.body.to).flat(), [charter.sponsor_email, charter.sponsor_email]);
    });
  } finally { Object.assign(CONFIG, saved); f.restore(); }
});

Deno.test('النظرة العامة وأعداد المسارات: مصفوفة المستويات والقياس والكتاب والنقاط بلا حساب العرض ولا حساب الاختبار', async () => {
  const f = fake({
    participants: [person(REAL, { status: 'enrolled' }), person(DEMO, { status: 'placed' }), person(TEST, { status: 'enrolled' })],
    placements: [...placed(REAL), ...placed(DEMO), ...placed(TEST)],
    assessments: [REAL, DEMO, TEST].map((participant_id, i) => ({ id: U(100 + i), participant_id, status: 'submitted', instruments: { key: 'b', kind: 'baseline', title_ar: 'المبدئي', active: true }, assessment_results: [] })),
    handbook_progress: [REAL, DEMO].map((participant_id) => ({ participant_id, module_id: U(800), quiz_score: 1, quiz_total: 2 })),
    model_submissions: [REAL, DEMO].map((participant_id, i) => ({ id: U(810 + i), participant_id, status: 'submitted', rating: null })),
    points_ledger: [REAL, DEMO].map((participant_id, i) => ({ id: U(820 + i), participant_id, points: 10 })),
    participant_requirements: [], tracks: [],
  });
  try {
    const o: any = await A.overview({});
    assertEquals(o.total, 1);
    assertEquals(o.matrix.milestone.intermediate, 1);
    assertEquals(o.top_tracks.map((t: any) => t.n), [1]);
    assertEquals(o.instruments.map((x: any) => x.n), [1]);
    assertEquals([o.book.readers, o.book.submitted], [1, 1]);
  } finally { f.restore(); }
});
