// تصور المرحلة 2 (docs/content/2026-11-26-تصور-المرحلة-2-الحلقة-الأخيرة-وجودة-الاعتماد-v1.md): دورة حياة رابط الراعي.
// 2.1: الراعي يقرأ إشعار الخصوصية في صفحتي التأييد وتأكيد الأثر، ويُسجَّل قبوله بالإرسال كما في صفحة المقيّم. بقاعدة في الذاكرة (_fake_db.ts)
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, withNet } from './_fake_db.ts';
const X = await import('./capstone.ts');
const T = await import('./tracking.ts');
const { CONFIG, hash } = await import('./core.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = U(910001), UPD = U(910002);
const TOKEN = 'sponsor-token-0123456789-abcdef';
const DAY = 864e5;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function world(extra: Row = {}) {
  const participant = { id: P, full_name: 'قائد', email: 'lead@example.sa', is_demo: false, is_test: false };
  const tables: Record<string, Row[]> = {
    participants: [participant],
    participant_emails: [],
    capstones: [{ id: P, participant_id: P, status: 'accepted', sponsor_status: 'pending', sponsor_email: 'boss@example.sa', sponsor_name: 'الراعي',
      sponsor_token_hash: await hash(TOKEN), sponsor_invited_at: iso(-3 * DAY), sponsor_expires_at: iso(18 * DAY), ...extra }],
    capstone_updates: [{ id: UPD, participant_id: P, verify_status: 'pending', verify_email: 'boss@example.sa', verify_token_hash: await hash(TOKEN), verify_expires_at: iso(5 * DAY) }],
    consent_events: [], audit_log: [], mail_events: [], mail_queue: [], points_ledger: [],
  };
  installFake(tables, { embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null) });
  return tables;
}

Deno.test('2.1 طلب التعديل من الراعي يسجل موافقته في سجل الموافقات بمعرّف الوثيقة وحده', async () => {
  const tables = await world();
  await withNet(() => X.sponsorSubmit({ t: TOKEN, decision: 'decline', note: 'عدّل الميزانية' }));
  assertEquals(tables.consent_events.length, 1);
  const c = tables.consent_events[0];
  assertEquals([c.subject, c.subject_id, c.kind], ['sponsor', P, 'accept']);
  assert(!JSON.stringify(c).includes('@'), 'لا بريد في سطر الموافقة');
});

Deno.test('2.1 تأكيد الأثر من الراعي يسجل موافقته بمعرّف المراجعة', async () => {
  const tables = await world();
  await withNet(() => T.verifySubmit({ t: TOKEN, decision: 'dispute', note: 'الأرقام لا تطابق' }));
  assertEquals(tables.consent_events.map((c) => [c.subject, c.subject_id]), [['sponsor', UPD]]);
});

// 20261129170000 مطبّق: رفض القيد لم يعد متوقعًا، فتعذّر السجل يفشل القرار كسائر الموافقات (لا قرار بلا دليله)
Deno.test('2.1 تعذّر سجل موافقة الراعي يفشل قراره ولا يُبتلع', async () => {
  const tables = await world();
  installFake(tables, {
    embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null),
    fail: (t, op) => (t === 'consent_events' && op.kind === 'insert' ? { code: '23514', message: 'violates check constraint "consent_events_subject_check"' } : null),
  });
  const e: any = await assertRejects(() => withNet(() => X.sponsorSubmit({ t: TOKEN, decision: 'decline', note: 'عدّل الميزانية' })));
  assertEquals(e.code, 'consent_unavailable');
});

// 2.2: «منتهٍ» حالة مشتقة لا مخزنة: pending مع sponsor_expires_at ماضٍ، بقاعدة واحدة (sponsorState في capstone.js)
const { sponsorState, SPONSOR_LINK_EXPIRED_AR } = await import('./capstone.js');
const { CONTACT_EMAIL } = await import('./labels.js');

Deno.test('2.2 الحالة المشتقة: المنتظر المنقضي منتهٍ، وما سواه بحاله', () => {
  const s = (sponsor_status: string | null, ms: number | null) => sponsorState({ sponsor_status, sponsor_expires_at: ms == null ? null : iso(ms) });
  assertEquals(s('pending', -DAY), 'expired');
  assertEquals(s('pending', DAY), 'pending');
  assertEquals(s('pending', null), 'pending');
  assertEquals(s('endorsed', -DAY), 'endorsed');
  assertEquals(s('declined', -DAY), 'declined');
  assertEquals(s(null, -DAY), null);
});

Deno.test('2.2 الرابط المنتهي يرد 410 برسالة تحيل إلى فريق البرنامج وبريده لا إلى المستشار', async () => {
  await world({ sponsor_expires_at: iso(-DAY) });
  const e = await X.sponsorGet({ t: TOKEN }).then(() => null, (x: any) => x);
  assertEquals([e?.status, e?.code], [410, 'expired']);
  assertEquals(e.message, SPONSOR_LINK_EXPIRED_AR);
  assert(SPONSOR_LINK_EXPIRED_AR.includes('فريق البرنامج') && SPONSOR_LINK_EXPIRED_AR.includes(CONTACT_EMAIL));
  assert(!SPONSOR_LINK_EXPIRED_AR.includes('المستشار'));
});

Deno.test('2.2 قائمة الإدارة تحمل الحالة المشتقة لكل وثيقة', async () => {
  const tables = await world({ sponsor_expires_at: iso(-DAY), submitted_at: iso(-30 * DAY) });
  tables.model_submissions = [];
  const r = await X.adminList({});
  assertEquals(r.capstones.map((c: any) => c.sponsor_state), ['expired']);
});

// 2.3: تذكير واحد للراعي قبل الانتهاء بسبعة أيام على المجدول الأسبوعي القائم، يُسجَّل في sponsor_reminded_at فلا يتكرر،
// ولا يُذكَّر من أيّد أو اعتُمدت وثيقته دون تأييد، ولا يخرج بريد لحساب العرض. والمنتهي يُعدّ لملخص المدير، وسطر للمشارك
const { SPONSOR_EXPIRED_PARTICIPANT_AR } = await import('./capstone.js');
const { resendCalls } = await import('./_fake_db.ts');

// البريد مهيأ بمفتاح وهمي (الشبكة محاكاة بـ withNet)، ويُعاد بعد كل اختبار
async function mailOn<T>(fn: () => Promise<T>) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 100, alertEmail: '' });
  try { return await fn(); } finally { Object.assign(CONFIG, saved); }
}
async function remindWorld(rows: Row[]) {
  const tables = await world();
  tables.participants.push({ id: U(910010), full_name: 'عرض', email: 'demo@demo.milestone-impact.org', is_demo: true, is_test: false });
  rows.forEach((r, i) => { if (!r.participant_id) tables.participants.push({ id: U(910100 + i), full_name: `قائد ${i}`, email: `l${i}@example.sa`, is_demo: false, is_test: false }); });
  tables.capstones = rows.map((r, i) => ({ participant_id: U(910100 + i), status: 'accepted', sponsor_status: 'pending', sponsor_email: `s${i}@example.sa`, sponsor_name: 'راعٍ',
    sponsor_token_hash: `h${i}`, sponsor_invited_at: iso(-15 * DAY), sponsor_expires_at: iso(5 * DAY), sponsor_reminded_at: null, ...r }));
  return tables;
}

Deno.test('2.3 تذكير واحد قبل الانتهاء بسبعة أيام، ولا يتكرر في التشغيلة التالية', () => mailOn(async () => {
  const tables = await remindWorld([{}]);
  const first = await withNet(async (calls) => { const r = await X.sponsorReminders(); return { r, mails: resendCalls(calls).length }; });
  assertEquals([first.r.reminded, first.mails], [1, 1]);
  assert(tables.capstones[0].sponsor_reminded_at, 'سُجّل التذكير');
  assert(tables.capstones[0].sponsor_token_hash !== 'h0', 'برمز جديد في البريد');
  assertEquals(tables.capstones[0].sponsor_expires_at > iso(4 * DAY) && tables.capstones[0].sponsor_expires_at < iso(6 * DAY), true, 'بلا تمديد للمهلة');
  const second = await withNet(async (calls) => { const r = await X.sponsorReminders(); return { r, mails: resendCalls(calls).length }; });
  assertEquals([second.r.reminded, second.mails], [0, 0]);
}));

Deno.test('2.3 لا تذكير لما بعد سبعة أيام، ولا للمؤيد أو المعتمد دون تأييد أو المنتهي، ولا بريد لحساب العرض', () => mailOn(async () => {
  const tables = await remindWorld([
    { sponsor_expires_at: iso(12 * DAY) },
    { sponsor_status: 'endorsed', status: 'approved' },
    { status: 'approved', sponsor_waived: 'الراعي في إجازة طويلة' },
    { sponsor_expires_at: iso(-DAY) },
    { participant_id: U(910010) },
    // ذُكّر لدعوة سابقة ثم أُعيدت الدعوة: الدعوة الجديدة لها تذكيرها
    { sponsor_reminded_at: iso(-20 * DAY) },
  ]);
  const out = await withNet(async (calls) => ({ r: await X.sponsorReminders(), mails: resendCalls(calls).length }));
  assertEquals([out.r.reminded, out.mails], [1, 1]);
  assertEquals(out.r.expired, 1);
  assertEquals(tables.capstones.map((c) => !!c.sponsor_reminded_at && c.sponsor_reminded_at > iso(-DAY)), [false, false, false, false, false, true]);
}));

Deno.test('2.3 تعذّر تذكير واحد لا يوقف غيره', () => mailOn(async () => {
  const tables = await remindWorld([{}, {}]);
  let n = 0;
  installFake(tables, { fail: (t, op) => (t === 'capstones' && op.kind === 'update' && n++ === 0 ? { message: 'boom' } : null),
    embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null) });
  const out = await withNet(async (calls) => ({ r: await X.sponsorReminders(), mails: resendCalls(calls).length }));
  assertEquals([out.r.reminded, out.r.failed, out.mails], [1, 1, 1]);
}));

// 20261129180000 مطبّق: غياب العمود خطأ يُرفع لا تجاوز صامت
Deno.test('2.3 تعذّر قراءة sponsor_reminded_at يرمي ولا يرسل بريدًا', () => mailOn(async () => {
  const tables = await remindWorld([{}]);
  installFake(tables, { fail: (t, op) => (t === 'capstones' && op.kind === 'select' && String(op.cols).includes('sponsor_reminded_at') ? { code: '42703', message: 'column capstones.sponsor_reminded_at does not exist' } : null),
    embed: (t, r, all) => (t === 'capstones' ? { participants: all.participants.find((x) => x.id === r.participant_id) || null } : null) });
  await withNet(async (calls) => {
    await assertRejects(() => X.sponsorReminders());
    assertEquals(resendCalls(calls).length, 0);
  });
}));

Deno.test('2.3 المشارك يرى سطر انتهاء مهلة الراعي في صفحة مبادرته، ونصه لا يحيل إلى المستشار', () => {
  assertEquals(SPONSOR_EXPIRED_PARTICIPANT_AR, 'انتهت مهلة الراعي، يتابعها فريق البرنامج');
});

// مراجعة المرحلة 2: إن تعذّر بريد التذكير لا يُقتل رابط الدعوة الأولى، فلا يعلق الراعي بلا رابط صالح ولا بريد
Deno.test('2.3 تعذّر بريد التذكير يعيد بصمة الرابط الأول، ويبقى التذكير مسجلًا فلا يتكرر', async () => {
  const saved = { ...CONFIG };
  Object.assign(CONFIG, { resendKey: '' });
  try {
    const tables = await remindWorld([{}]);
    const r = await X.sponsorReminders();
    assertEquals([r.reminded, r.failed], [0, 1]);
    assertEquals(tables.capstones[0].sponsor_token_hash, 'h0', 'الرابط الأول صالح كما كان');
    assert(tables.capstones[0].sponsor_reminded_at, 'لا يتكرر كل أسبوع');
  } finally { Object.assign(CONFIG, saved); }
});
