// رموز الرعاية (ترحيل 20261126100000): إنشاء الإدارة، والربط من «رشّحتك جهة؟»، والحد والانتهاء والإيقاف وإيقاف الجهة،
// وعدم العدّ المزدوج، ورمز رابط الجهة لا يُقبل مكتوبًا ورابطه يعمل. بقاعدة في الذاكرة (_fake_db.ts)، والدالة redeem_sponsor_code محاكاة
// بقاعدتها في الترحيل نفسه (واختبارها الحقيقي على PGlite في admin-app/src/sponsor-codes-sql.test.js)
import './_test_env.ts';
import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const P = await import('./participant.ts');
const SC = await import('./sponsor-codes.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = U(990001), OFF = U(990002);
const ADMIN = { email: 'a@example.sa' };
const DAY = 864e5;

// كالدالة في الترحيل: الرمز، ثم الجهة غير الموقوفة، ثم صف الاستخدام الفريد، ثم العدّاد بشرطه وإلا حُذف الصف
function redeem(_n: string, a: any, t: Record<string, Row[]>) {
  if (_n !== 'redeem_sponsor_code') return null;
  const c = (t.sponsor_codes || []).find((x) => x.code === String(a.p_code).trim().toLowerCase());
  const row = (org: string | null, reason: string) => ({ data: [{ org_id: org, reason }], error: null });
  if (!c) return row(null, 'unknown');
  if (!(t.organizations || []).some((o) => o.id === c.organization_id && o.status !== 'inactive')) return row(null, 'unknown');
  const uses = t.sponsor_code_uses ||= [];
  if (uses.some((u) => u.code_id === c.id && u.participant_id === a.p_participant)) return row(c.organization_id, 'ok');
  const now = Date.now();
  if (!c.active) return row(null, 'stopped');
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return row(null, 'expired');
  if (c.max_uses != null && c.used >= c.max_uses) return row(null, 'exhausted');
  c.used += 1;
  uses.push({ code_id: c.id, participant_id: a.p_participant, used_at: new Date().toISOString() });
  return row(c.organization_id, 'ok');
}

const person = (n: number) => ({ id: U(990100 + n), full_name: `مشارك ${n}`, email: `s${n}@example.sa`, organization_id: null, status: 'registered', is_demo: false, is_test: false });
function world(extra: Row = {}) {
  const tables: Record<string, Row[]> = {
    organizations: [
      { id: ORG, name: 'منظومة', short_name: 'Manzoma', name_en: 'Manzoma', color: '#123', status: 'active', invite_code: 'manzoma-invite-01', seats: null, contract_ends: null },
      { id: OFF, name: 'جهة موقوفة', short_name: 'Off', status: 'active', invite_code: 'off-invite-0001', contract_ends: null },
    ],
    participants: [1, 2, 3, 4, 5].map(person),
    sponsor_codes: [], sponsor_code_uses: [], audit_log: [], entitlements: [], sponsor_decisions: [], payments: [],
    ...extra,
  };
  return installFake(tables, { rpc: redeem });
}
const pOf = (w: any, n: number) => w.tables.participants.find((p: Row) => p.id === U(990100 + n));
// sponsorCode يعيد ملف المشارك بعد الربط؛ ما يهم هنا الربط والعدّاد، فخطأ في بناء الملف بعد الربط لا يغيّرهما
const link = async (w: any, n: number, code: string) => {
  try { await P.sponsorCode(pOf(w, n), { sponsor_code: code }, { ip: `10.0.0.${n}` }); } catch (e) { if (!pOf(w, n).organization_id) throw e; }
  return pOf(w, n).organization_id;
};

Deno.test('الإنشاء: رمز مولّد بادئة الجهة و8 أحرف عشوائية، ومخصص 8 أحرف فأكثر، ولا يطابق رمز رابط جهة', async () => {
  const w = world();
  try {
    const r: any = await SC.adminCreate(ADMIN, { org_id: ORG, max_uses: 3, note: 'دفعة الربيع' });
    assertMatch(r.code.code, /^manz-[a-z2-9]{4}-[a-z2-9]{4}$/);
    assertEquals([r.code.max_uses, r.code.used, r.code.active, r.code.expires_at], [3, 0, true, null]);
    assert(w.tables.audit_log.some((x) => x.action === 'sponsor-code.create'));
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, code: 'short1' }), Error, 'من 8 إلى 40');
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, code: 'MANZOMA-INVITE-01' }), Error, 'مستعمل');
    const c: any = await SC.adminCreate(ADMIN, { org_id: ORG, code: 'Spring-2027' });
    assertEquals(c.code.code, 'spring-2027');
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, code: 'spring-2027' }), Error, 'مستعمل');
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG, max_uses: 0 }), Error, 'عدد المستخدمين');
  } finally { w.restore(); }
});

Deno.test('الإنشاء بلا تاريخ انتهاء يأخذ نهاية عقد الجهة، والجهة الموقوفة لا يُنشأ لها رمز', async () => {
  const w = world();
  try {
    const ends = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
    w.tables.organizations[0].contract_ends = ends;
    const r: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    assertEquals(r.code.expires_at, new Date(`${ends}T23:59:59+03:00`).toISOString());
    const own: any = await SC.adminCreate(ADMIN, { org_id: ORG, expires_at: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10) });
    assert(new Date(own.code.expires_at).getTime() < new Date(r.code.expires_at).getTime());
    w.tables.organizations[0].contract_ends = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG }), Error, 'انتهى عقد الجهة');
    w.tables.organizations[1].status = 'inactive';
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: OFF }), Error, 'موقوفة');
  } finally { w.restore(); }
});

Deno.test('الربط: رمز الرعاية يربط المشارك ويُعدّ مرة واحدة له، والحد يُستنفد', async () => {
  const w = world();
  try {
    const { code }: any = await SC.adminCreate(ADMIN, { org_id: ORG, max_uses: 2 });
    assertEquals(await link(w, 1, code.code.toUpperCase()), ORG);
    assertEquals(w.tables.sponsor_codes[0].used, 1);
    // المشارك نفسه مرة ثانية من الدالة مباشرة: لا عدّ ثانٍ
    assertEquals((await SC.redeemSponsorCode(code.code, U(990101))).ok, true);
    assertEquals(w.tables.sponsor_codes[0].used, 1);
    assertEquals(await link(w, 2, code.code), ORG);
    assertEquals(w.tables.sponsor_codes[0].used, 2);
    await assertRejects(() => link(w, 3, code.code), Error, 'اكتمل عدد مستخدميه');
    assertEquals([pOf(w, 3).organization_id, w.tables.sponsor_codes[0].used, w.tables.sponsor_code_uses.length], [null, 2, 2]);
    const list: any = await SC.adminList({ org_id: ORG });
    assertEquals(list.codes[0].users.map((u: Row) => u.email).sort(), ['s1@example.sa', 's2@example.sa']);
    assertEquals(list.codes[0].state, 'exhausted');
  } finally { w.restore(); }
});

Deno.test('الانتهاء والإيقاف وإيقاف الجهة: رد واضح ولا ربط ولا عدّ', async () => {
  const w = world();
  try {
    const { code: a }: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    w.tables.sponsor_codes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    await assertRejects(() => link(w, 1, a.code), Error, 'انتهت صلاحية');
    const { code: b }: any = await SC.adminCreate(ADMIN, { org_id: ORG });
    await SC.adminUpdate(ADMIN, { id: b.id, active: false });
    assert(w.tables.audit_log.some((x) => x.action === 'sponsor-code.update'));
    await assertRejects(() => link(w, 2, b.code), Error, 'انتهت صلاحية');
    await SC.adminUpdate(ADMIN, { id: b.id, active: true });
    assertEquals(await link(w, 2, b.code), ORG);
    // إيقاف الجهة يوقف رموزها فورًا: رد الرمز غير المعروف، وإن سبق الفحص فالدالة ترد unknown
    const { code: c }: any = await SC.adminCreate(ADMIN, { org_id: OFF });
    w.tables.organizations[1].status = 'inactive';
    await assertRejects(() => link(w, 3, c.code), Error, 'تعذّر التحقق');
    assertEquals((await SC.redeemSponsorCode(c.code, U(990104))).reason, 'unknown');
    assertEquals(w.tables.sponsor_codes.find((x) => x.id === c.id)?.used, 0);
    await assertRejects(() => SC.adminUpdate(ADMIN, { id: b.id, max_uses: 0 }), Error, 'عدد المستخدمين');
  } finally { w.restore(); }
});

Deno.test('قرار سارٍ للإدارة يرد المشارك قبل الربط فلا يأخذ استخدامًا', async () => {
  // طلب مقعد مرفوض له في هذه الجهة (sponsorDecision = rejected)
  const w = world({ sponsor_requests: [{ participant_id: U(990101), organization_id: ORG, status: 'rejected', kind: 'seats', created_at: '2026-11-01T08:00:00Z', decided_at: '2026-11-02T08:00:00Z' }] });
  try {
    const { code }: any = await SC.adminCreate(ADMIN, { org_id: ORG, max_uses: 1 });
    await assertRejects(() => link(w, 1, code.code), Error, 'قررت الإدارة');
    assertEquals([pOf(w, 1).organization_id, w.tables.sponsor_codes[0].used, w.tables.sponsor_code_uses.length], [null, 0, 0]);
    // فيبقى الاستخدام الوحيد لغيره
    assertEquals(await link(w, 2, code.code), ORG);
  } finally { w.restore(); }
});

Deno.test('رمز رابط الجهة لا يُقبل مكتوبًا (قرار المالك) ورده العام ويُحسب في الحد، ورابط الدعوة /j/ يربط كما كان', async () => {
  const w = world();
  try {
    await assertRejects(() => link(w, 1, 'MANZOMA-INVITE-01'), Error, 'تعذّر التحقق');
    assertEquals(pOf(w, 1).organization_id, null);
    await assertRejects(() => link(w, 2, 'nope-nope-nope'), Error, 'تعذّر التحقق');
    const fails = w.tables.audit_log.filter((x) => x.action === 'sponsor.code-fail').map((x) => x.actor).sort();
    assertEquals(fails, ['ip:10.0.0.1', 'ip:10.0.0.2', `p:${U(990101)}`, `p:${U(990102)}`]);
    // الرابط: orgInfo يقرأ رمز الرابط كما كان (resolveOrg)
    const info: any = await P.orgInfo({ org: 'manzoma-invite-01' }, { ip: '10.0.0.9' });
    assertEquals([info.success, info.org.name], [true, 'منظومة']);
  } finally { w.restore(); }
});

Deno.test('قبل الترحيل: لا جدول = رمز غير معروف، وقائمة الإدارة ready=false، والإنشاء not_migrated', async () => {
  const missing = { code: 'PGRST205', message: 'relation does not exist' };
  const w = installFake({ organizations: [{ id: ORG, name: 'منظومة', status: 'active', invite_code: 'manzoma-invite-01' }], participants: [person(1)], audit_log: [] },
    { fail: (t) => (t === 'sponsor_codes' || t === 'sponsor_code_uses' ? missing : null) });
  try {
    await assertRejects(() => link(w, 1, 'manz-abcd-efgh'), Error, 'تعذّر التحقق');
    assertEquals((await SC.adminList({ org_id: ORG }) as any).ready, false);
    await assertRejects(() => SC.adminCreate(ADMIN, { org_id: ORG }), Error, 'غير مفعّلة');
  } finally { w.restore(); }
});

// ترحيل 20261128100000: الاستهلاك والربط في معاملة واحدة (redeem_and_link_sponsor_code)، محاكاة بقاعدتها في _fake_db.ts
Deno.test('الاستهلاك والربط معًا: إن صار للمشارك جهة في الأثناء رُد 409 ولم يُعدّ الاستخدام', async () => {
  const w = world();
  try {
    await SC.adminCreate(ADMIN, { org_id: ORG, code: 'atomic-2027', max_uses: 1 });
    const stale = { ...pOf(w, 1) };
    pOf(w, 1).organization_id = OFF;   // رُبط بجهة أخرى بعد أن قُرئ ملفه
    const e: any = await assertRejects(() => P.sponsorCode(stale, { sponsor_code: 'atomic-2027' }, { ip: '10.0.0.1' }));
    assertEquals(e.status, 409);
    const c = w.tables.sponsor_codes.find((x) => x.code === 'atomic-2027')!;
    assertEquals([c.used, w.tables.sponsor_code_uses.length, pOf(w, 1).organization_id], [0, 0, OFF]);
    // الاستخدام الذي لم يُعدّ يبقى لغيره
    assertEquals(await link(w, 2, 'atomic-2027'), ORG);
    assertEquals(c.used, 1);
  } finally { w.restore(); }
});

Deno.test('قبل ترحيل الربط الذري (الدالة غائبة): يعود إلى الاستهلاك ثم الربط كما كان', async () => {
  const tables: Record<string, Row[]> = {
    organizations: [{ id: ORG, name: 'منظومة', short_name: 'Manzoma', color: '#123', status: 'active', invite_code: 'manzoma-invite-01', seats: null, contract_ends: null }],
    participants: [1, 2].map(person), sponsor_codes: [], sponsor_code_uses: [], audit_log: [], entitlements: [], sponsor_decisions: [], payments: [],
  };
  const w = installFake(tables, { rpc: redeem, fail: (t) => t === 'rpc:redeem_and_link_sponsor_code' ? { code: 'PGRST202', message: 'not found' } : null });
  try {
    await SC.adminCreate(ADMIN, { org_id: ORG, code: 'legacy-2027' });
    assertEquals(await link(w, 1, 'legacy-2027'), ORG);
    assertEquals(w.tables.sponsor_codes[0].used, 1);
  } finally { w.restore(); }
});
