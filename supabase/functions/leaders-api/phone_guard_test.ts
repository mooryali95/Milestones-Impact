// هاتف واحد لحساب قائم (ترحيل 20261128180000): كل طريق ينشئ حسابًا أو يغيّر الهاتف يرد هاتفًا يحجزه حساب قائم آخر، بلا خطأ خادم.
// التسجيل بالبريد (ومنه دعوة رابط الجهة) وتعديل الملف: رسالة محايدة ببريد القائم مقنَّعًا. الإضافة والاستيراد وتعديل الإدارة: الحساب
// القائم مسمًّى لترسل الإدارة الدعوة إليه. والاسم المشابه في الجهة نفسها تحذير «قد يكون مكررًا» لا منع.
// التسجيل بحساب Google لا يحمل هاتفًا (الاسم والبريد من Google)، فهاتفه يمر بتعديل الملف المختبَر هنا.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const P = await import('./participant.ts');
const A = await import('./admin.ts');
const K = await import('./phone-key.js');
const { hash } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(770001);
// الرقم المحلي يُركَّب فلا يُقرأ رقمًا منشورًا (single-source.test.js)
const L05 = (n: string) => '05' + n;
const ADMIN = { email: 'a@example.sa', role: 'admin' as const, method: 'passkey' };
const owner = { id: U(770100), full_name: 'خضر إدريس', email: 'khader@gmail.com', phone: '+966501111111', organization_id: ORG, status: 'registered', is_demo: false, is_test: false };
const suspended = { ...owner, id: U(770101), email: 'old@gmail.com', status: 'suspended' };
const demo = { ...owner, id: U(770102), email: 'demo@demo.milestone-impact.org', is_demo: true, organization_id: null };
const CONFLICT = { code: '23505', message: 'duplicate key value violates unique constraint "participants_phone_key_uniq"' };

function world(opts: Record<string, any> = {}, extra: Record<string, Row[]> = {}) {
  return installFake({
    participants: [structuredClone(owner), structuredClone(suspended), structuredClone(demo)],
    organizations: [{ id: ORG, name: 'منظومة', status: 'active' }],
    email_challenges: [], experts: [], org_coordinators: [], audit_log: [], enrollments: [], cohorts: [], cohort_placements: [], consent_events: [],
    ...extra,
  }, opts);
}
async function register(w: any, phone: string, email = 'newcomer@gmail.com') {
  const link = `link-${Math.random()}`;
  w.tables.email_challenges.push({ id: crypto.randomUUID(), email, purpose: 'register', code_hash: 'x', link_token_hash: await hash(link),
    pending_profile: {}, attempts: 0, consumed_at: null, expires_at: new Date(Date.now() + 6e5).toISOString(), created_at: new Date().toISOString() });
  return P.authVerify({ email, link, full_name: 'مشارك جديد', phone, confirm_new: true }, { ip: '127.0.0.1', ua: 'test' } as any);
}
const status = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return { status: e.status, code: e.code, message: e.message, extra: e.extra }; } };

Deno.test('المفتاح: الصيغ كلها مفتاح واحد، والصيغ المحفوظة تغطيه، والاسم يُطبَّع بلا مسافات ولا تشكيل ولا همزات', () => {
  for (const v of ['+966501111111', '00966501111111', L05('01111111'), '501111111', '٠٥٠١١١١١١١', '+966 50 111 1111']) assertEquals(K.phoneKey(v), '966501111111');
  assert(K.phoneVariants('966501111111').includes('+966501111111'));
  assert(K.phoneVariants('966501111111').includes(L05('01111111')));
  assertEquals(K.nameKey('خضر إدريس'), K.nameKey('خضرادريس'));
  assertEquals(K.nameKey('فاطِمة'), K.nameKey('فاطمه'));
  assertEquals(K.maskEmail('khader@gmail.com'), 'kha…@gmail.com');
});

Deno.test('التسجيل بالبريد: هاتف قائم بأي صيغة يُرد برسالة محايدة ببريده مقنَّعًا، ولا حساب ولا استهلاك للرمز', async () => {
  const w = world();
  try {
    const r = await status(() => register(w, L05('01111111')));
    assertEquals([r?.status, r?.code], [409, 'phone_exists']);
    assertEquals(r?.message, 'لديك حساب مسجل بهذا الهاتف، ادخل ببريدك kha…@gmail.com');
    assertEquals(r?.extra, { email_hint: 'kha…@gmail.com' });
    assertEquals(w.tables.participants.length, 3);
    assertEquals(w.tables.email_challenges[0].consumed_at, null);
  } finally { w.restore(); }
});

Deno.test('التسجيل بالبريد: هاتف الموقوف والتجريبي لا يُحجز', async () => {
  const w = world();
  try {
    w.tables.participants[0].phone = '+966509999999';
    const r: any = await register(w, L05('01111111')).catch((e) => e);
    assert(!(r?.code === 'phone_exists'), 'لا رفض بهاتف الموقوف والتجريبي');
    assert(w.tables.participants.some((p: Row) => p.email === 'newcomer@gmail.com'));
  } finally { w.restore(); }
});

Deno.test('التسجيل بالبريد: سباق يرده الفهرس الفريد يُترجم إلى الرد نفسه لا خطأ خادم', async () => {
  const w = world({ fail: (t: string, op: any) => (t === 'participants' && op.kind === 'insert' ? CONFLICT : null) });
  try {
    w.tables.participants[0].phone = '+966509999999';   // الفحص قبل الكتابة لا يراه
    const r = await status(() => register(w, L05('01111111')));
    assertEquals([r?.status, r?.code], [409, 'phone_exists']);
  } finally { w.restore(); }
});

Deno.test('تعديل الملف: هاتف حساب آخر يُرد، وهاتفه نفسه بصيغة أخرى يُقبل، وتعارض الفهرس 409', async () => {
  const w = world({}, { participants: [structuredClone(owner), { ...structuredClone(owner), id: U(770200), email: 'me@example.sa', phone: '+966502222222' }] });
  try {
    const me = w.tables.participants[1];
    const r = await status(() => P.profileSave(me, { fields: { phone: L05('01111111') } }));
    assertEquals([r?.status, r?.code], [409, 'phone_exists']);
    assertEquals(me.phone, '+966502222222');
    const own = await status(() => P.profileSave(me, { fields: { phone: L05('02222222') } }));
    assert(own?.code !== 'phone_exists');
  } finally { w.restore(); }
  const f = world({ fail: (t: string, op: any) => (t === 'participants' && op.kind === 'update' ? CONFLICT : null) });
  try {
    const r = await status(() => P.profileSave({ ...owner, id: U(770300), phone: null }, { fields: { phone: L05('03333333') } }));
    assertEquals([r?.status, r?.code], [409, 'phone_exists']);
  } finally { f.restore(); }
});

Deno.test('إضافة الإدارة: الهاتف القائم يُرد باسم الحساب القائم ومعرّفه، والاسم المشابه تحذير في المعاينة لا منع', async () => {
  const w = world();
  try {
    const r = await status(() => A.createParticipant(ADMIN as any, { email: 'x@example.sa', full_name: 'شخص آخر', phone: '+966 50 111 1111' }));
    assertEquals([r?.status, r?.code], [409, 'phone_exists']);
    assertEquals((r?.extra as any).existing, { id: owner.id, full_name: owner.full_name, email: owner.email, status: 'registered' });
    assert(r?.message.includes('khader@gmail.com'));
    assertEquals(w.tables.participants.length, 3);
    w.tables.participants.push({ ...structuredClone(owner), id: U(770400), email: 'noorg@example.sa', phone: null, organization_id: null, full_name: 'سارة الأحمد' });
    const dry: any = await A.createParticipant(ADMIN as any, { email: 'y@example.sa', full_name: 'سارة  الاحمد', dry_run: true });
    assertEquals([dry.dry_run, dry.warnings[0].code], [true, 'maybe_duplicate']);
    assert(dry.warnings[0].message.startsWith('قد يكون مكررًا'));
    assertEquals(w.tables.participants.length, 4);
  } finally { w.restore(); }
});

Deno.test('إضافة الإدارة: تعارض الفهرس وتكرار البريد 409 لا خطأ خادم', async () => {
  const w = world({ fail: (t: string, op: any) => (t === 'participants' && op.kind === 'insert' ? CONFLICT : null) });
  try {
    assertEquals((await status(() => A.createParticipant(ADMIN as any, { email: 'x@example.sa', full_name: 'شخص آخر', phone: L05('07777777') })))?.status, 409);
  } finally { w.restore(); }
  const f = world({ fail: (t: string, op: any) => (t === 'participants' && op.kind === 'insert' ? { code: '23505', message: 'participants_email_uniq' } : null) });
  try {
    const r = await status(() => A.createParticipant(ADMIN as any, { email: 'khader@gmail.com', full_name: 'شخص آخر' }));
    assertEquals([r?.status, r?.code], [409, 'email_exists']);
  } finally { f.restore(); }
});

Deno.test('تعديل الإدارة: هاتف حساب قائم آخر يُرد باسمه', async () => {
  const w = world({}, { participants: [structuredClone(owner), { ...structuredClone(owner), id: U(770500), email: 'b@example.sa', phone: null }] });
  try {
    const r = await status(() => A.participantSave(ADMIN as any, { participant_id: U(770500), fields: { phone: L05('01111111') } }));
    assertEquals([r?.status, r?.code, (r?.extra as any)?.existing?.id], [409, 'phone_exists', owner.id]);
  } finally { w.restore(); }
});

Deno.test('الاستيراد: هاتف قائم «مسجل من قبل» باسم القائم، وهاتف مكرر في الجدول، والاسم المشابه في الجهة تحذير يبقى معه الصف جاهزًا', async () => {
  const w = world();
  try {
    const rows = [
      { line: 2, email: 'i1@example.sa', full_name: 'مستورد أول', phone: L05('01111111') },
      { line: 3, email: 'i2@example.sa', full_name: 'مستورد ثان', phone: L05('04444444') },
      { line: 4, email: 'i3@example.sa', full_name: 'مستورد ثالث', phone: '+966504444444' },
      { line: 5, email: 'i4@example.sa', full_name: 'خضرإدريس' },
    ];
    const dry: any = await A.participantsImport(ADMIN as any, { organization_id: ORG, rows, dry_run: true });
    assertEquals(dry.rows.map((r: Row) => r.status), ['exists', 'ok', 'duplicate', 'ok']);
    assertEquals(dry.rows[0].existing.id, owner.id);
    assert(dry.rows[0].reason.includes('khader@gmail.com'));
    assertEquals(dry.rows[3].warning, 'maybe_duplicate');
    assert(dry.rows[3].reason.startsWith('قد يكون مكررًا'));
    const done: any = await A.participantsImport(ADMIN as any, { organization_id: ORG, rows });
    assertEquals(done.rows.map((r: Row) => r.status), ['exists', 'created', 'duplicate', 'created']);
  } finally { w.restore(); }
});

Deno.test('الاستيراد: تعارض الفهرس عند الكتابة يُعد «مسجلًا من قبل» ولا تفشل الدفعة', async () => {
  const w = world({ fail: (t: string, op: any) => (t === 'participants' && op.kind === 'insert' && op.value?.phone ? CONFLICT : null) });
  try {
    const done: any = await A.participantsImport(ADMIN as any, { organization_id: ORG, rows: [{ email: 'r1@example.sa', full_name: 'مستورد أول', phone: L05('08888888') }, { email: 'r2@example.sa', full_name: 'مستورد ثان' }] });
    assertEquals(done.rows.map((r: Row) => r.status), ['exists', 'created']);
  } finally { w.restore(); }
});
