// قرار طلب الحذف من ملف المشارك (erasure.ts): القراءة لكل مدير، والتنفيذ والرفض والسحب للمدير الأعلى وحده بعامل ثانٍ،
// ورسالة لكل قرار إلى المشارك، وتذكير المالك قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const { CONFIG, ERASE_DECLINED_SUBJECT, ERASE_DONE_SUBJECT, ERASE_WITHDRAWN_SUBJECT, Fail, storage } = await import('./core.ts');
const ER = await import('./erasure.ts');

type Row = Record<string, any>;
const PID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const boss = { email: 'owner@x.sa', role: 'super_admin' as const, method: 'passkey' };
const admin = { email: 'ops@x.sa', role: 'admin' as const, method: 'passkey' };
const viewer = { email: 'view@x.sa', role: 'viewer' as const, method: 'email' };
const bossByEmail = { ...boss, method: 'email' };
const DAY = 864e5;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const seed = (over: Row = {}): Record<string, Row[]> => ({
  participants: [{ id: PID, full_name: 'سارة أحمد الأحمد', email: 'sara@x.sa', is_demo: false }],
  erasure_requests: [{ id: RID, participant_id: PID, status: 'pending', reason: 'انتهى البرنامج', created_at: ago(6), note: null, reminder_stage: 0, ...over }],
  certificates: [], payments: [{ id: 'pay1', participant_id: PID, status: 'paid' }], assessments: [], model_submissions: [], capstones: [], participant_requirements: [], auth_sessions: [],
  mail_queue: [], raters: [], experts: [], org_coordinators: [], mail_events: [], audit_log: [],
});
const setNull = (table: string, rows: Row[], tables: Record<string, Row[]>) => {
  if (table !== 'participants') return;
  for (const r of tables.erasure_requests || []) if (rows.some((p) => p.id === r.participant_id)) r.participant_id = null;
  for (const r of tables.payments || []) if (rows.some((p) => p.id === r.participant_id)) r.participant_id = null;
};
function noFiles() {
  const s = storage as any;
  const saved = s.from;
  s.from = () => ({ list: () => Promise.resolve({ data: [], error: null }), remove: () => Promise.resolve({ data: null, error: null }) });
  return () => { s.from = saved; };
}
function withMail<T>(fn: () => Promise<T>, alertEmail = '') {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: 80, alertEmail });
  return fn().finally(() => Object.assign(CONFIG, saved));
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;

// ── الصلاحيات ──
Deno.test('القرار للمدير الأعلى وحده: المدير والمراقب ومن دخل برمز البريد يُرفضون في المسارات الثلاثة ولا يتغير شيء', async () => {
  const w = installFake(seed(), { onDelete: setNull });
  try {
    const bodies = { execute: { request_id: RID, confirm_name: 'سارة أحمد الأحمد' }, decline: { request_id: RID, ground: 'repeat' }, withdrawn: { request_id: RID, via: 'email', note: 'طلب السحب بالبريد' } };
    for (const [fn, body] of Object.entries(bodies)) {
      for (const [who, code] of [[admin, 'super_required'], [viewer, 'forbidden'], [bossByEmail, 'mfa_required']] as const) {
        const e = await failOf(() => (ER as any)[fn](who, body));
        assertEquals([fn, e.status, e.code], [fn, 403, code]);
      }
    }
    assertEquals([w.tables.participants.length, w.tables.erasure_requests[0].status, w.writes.length], [1, 'pending', 0]);
  } finally { w.restore(); }
});

Deno.test('القراءة لكل مدير: الطلب وأيامه وأثره وخطه الزمني، ويقول هل يقرر هذا المدير. الدفع لا يمنع، وحساب العرض وحده يمنع', async () => {
  const t = seed();
  t.audit_log = [
    { action: 'system.alert', entity: 'system', entity_id: `erase_request:${RID}`, created_at: ago(6) },
    { action: 'erasure.remind', entity: 'erasure_requests', entity_id: RID, actor: 'erasure', created_at: ago(1), after: { stage: 1 } },
  ];
  const w = installFake(t);
  try {
    for (const [who, can] of [[viewer, false], [admin, false], [bossByEmail, false], [boss, true]] as const) {
      const r: any = await ER.get(who as any, { participant_id: PID });
      assertEquals([r.success, r.ready, r.can_decide, r.request.id, r.request.days_left, r.request.urgency], [true, true, can, RID, 24, 'ok']);
    }
    const r: any = await ER.get(viewer as any, { participant_id: PID });
    assertEquals([r.participant.full_name, r.counts.payments, r.blockers], ['سارة أحمد الأحمد', 1, []]);
    assertEquals(r.timeline.map((x: any) => x.text), ['استُلم الطلب من المشارك', 'أُبلغت بالطلب', 'ذُكّرت بالطلب']);
    t.participants[0].is_demo = true;
    assertEquals(((await ER.get(boss as any, { participant_id: PID })) as any).blockers.length, 1);
  } finally { w.restore(); }
});

Deno.test('القراءة: بلا طلب قائم يُعاد آخر طلب مُغلق لسطر السجل، وقبل ترحيل الجدول ready:false', async () => {
  const w = installFake(seed({ status: 'rejected', ground: 'repeat', decided_at: ago(1) }));
  try {
    const r: any = await ER.get(viewer as any, { participant_id: PID });
    assertEquals([r.request, r.last.status_ar, r.last.ground], [null, 'رُفض', 'repeat']);
  } finally { w.restore(); }
  const m = installFake(seed(), { fail: (t) => (t === 'erasure_requests' ? { code: 'PGRST205', message: 'relation erasure_requests not found' } : null) });
  try { assertEquals(((await ER.get(viewer as any, { participant_id: PID })) as any).ready, false); } finally { m.restore(); }
});

// ── التنفيذ ──
Deno.test('التنفيذ: الاسم يُطابَق بتطبيع الهمزات والمسافات، والخطأ فيه لا يمس شيئًا', async () => {
  const w = installFake(seed(), { onDelete: setNull });
  const unstore = noFiles();
  try {
    await withMail(() => withNet(async (calls) => {
      const e = await failOf(() => ER.execute(boss as any, { request_id: RID, confirm_name: 'سارة الأحمد' }));
      assertEquals([e.status, e.code, w.tables.participants.length, resendCalls(calls).length], [400, 'confirm', 1, 0]);
      const r: any = await ER.execute(boss as any, { request_id: RID, confirm_name: '  ساره  احمد   الاحمد ' });
      assertEquals([r.success, r.mailed, r.request], [true, true, RID]);
      assertEquals(w.tables.participants, []);
      // سجل الدفع يبقى بلا ربط بحسابه (قرار المالك 3)
      assertEquals(w.tables.payments.map((p) => [p.id, p.participant_id]), [['pay1', null]]);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, req.decided_by, typeof req.email_hash, typeof req.notified_at], ['done', 'owner@x.sa', 'string', 'string']);
      const mail = resendCalls(calls);
      assertEquals([mail.length, mail[0].body.subject], [1, ERASE_DONE_SUBJECT]);
      // البريد يذكر الشهادة وسجل الدفع والنسخ الاحتياطية بمدتها
      for (const s of ['الشهادة', '10 سنوات', '30 يومًا', 'الشهرية سنة']) assertEquals(String(mail[0].body.html).includes(s), true, s);
    }));
  } finally { unstore(); w.restore(); }
});

Deno.test('التنفيذ: طلب قُرِّر فيه، أو حساب العرض، أو طلب بلا صاحب، لا يُنفَّذ', async () => {
  for (const [over, code] of [[{ status: 'rejected' }, 'decided'], [{ participant_id: null }, 'gone']] as const) {
    const w = installFake(seed(over as Row), { onDelete: setNull });
    try { assertEquals((await failOf(() => ER.execute(boss as any, { request_id: RID, confirm_name: 'سارة أحمد الأحمد' }))).code, code); } finally { w.restore(); }
  }
  const t = seed();
  t.participants[0].is_demo = true;
  const w = installFake(t, { onDelete: setNull });
  try {
    const e = await failOf(() => ER.execute(boss as any, { request_id: RID, confirm_name: 'سارة أحمد الأحمد' }));
    assertEquals([e.status, e.code, w.tables.participants.length], [409, 'blocked', 1]);
  } finally { w.restore(); }
});

// ── الرفض ──
Deno.test('الرفض: سبب من القائمة إلزامي، و«سبب آخر» يلزمه نص، ولا يتغير شيء قبلها', async () => {
  const w = installFake(seed());
  try {
    assertEquals((await failOf(() => ER.decline(boss as any, { request_id: RID, ground: 'busy' }))).code, 'ground');
    assertEquals((await failOf(() => ER.decline(boss as any, { request_id: RID, ground: 'other', note: 'قصير' }))).code, 'note');
    assertEquals([w.tables.erasure_requests[0].status, w.writes.length], ['pending', 0]);
  } finally { w.restore(); }
});

Deno.test('الرفض: يُكتب rejected بسببه ونصه ومن قرر، ويبقى حسابه، ويصله السبب وأساسه وحق الشكوى إلى سدايا', async () => {
  const w = installFake(seed());
  try {
    await withMail(() => withNet(async (calls) => {
      const r: any = await ER.decline(boss as any, { request_id: RID, ground: 'litigation', note: '  دعوى منظورة   أمام المحكمة ' });
      assertEquals([r.success, r.mailed], [true, true]);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, req.ground, req.note, req.decided_by, typeof req.notified_at], ['rejected', 'litigation', 'دعوى منظورة أمام المحكمة', 'owner@x.sa', 'string']);
      assertEquals(w.tables.participants.length, 1);
      assertEquals(w.tables.audit_log.map((x) => [x.action, x.entity_id, x.after.ground]), [['erasure.reject', RID, 'litigation']]);
      const mail = resendCalls(calls);
      assertEquals([mail.length, String(mail[0].body.to), mail[0].body.subject], [1, 'sara@x.sa', ERASE_DECLINED_SUBJECT]);
      for (const s of ['سدايا', 'المادة 18', 'دعوى منظورة', 'تعيد الطلب']) assertEquals(String(mail[0].body.html).includes(s), true, s);
      // قرار ثانٍ على الطلب نفسه لا يكتب فوق الأول
      assertEquals((await failOf(() => ER.withdrawn(boss as any, { request_id: RID, via: 'phone', note: 'اتصل وسحبه' }))).code, 'decided');
    }));
  } finally { w.restore(); }
});

Deno.test('الرفض: تعذّر البريد يحفظ القرار ويعيد العنوان للمدير ولا يكتب وقت الإبلاغ', async () => {
  const w = installFake(seed());
  try {
    await withMail(() => withNet(async () => {
      const r: any = await ER.decline(boss as any, { request_id: RID, ground: 'repeat' });
      assertEquals([r.success, r.mailed, r.email], [true, false, 'sara@x.sa']);
      assertEquals([w.tables.erasure_requests[0].status, w.tables.erasure_requests[0].notified_at ?? null], ['rejected', null]);
    }, { resendStatus: 500 }));
  } finally { w.restore(); }
});

// ── السحب ──
Deno.test('السحب: كيف أبلغك ونص قصير إلزاميان، ثم cancelled ببريد المدير لا participant، ويصله تأكيد', async () => {
  const w = installFake(seed());
  try {
    assertEquals((await failOf(() => ER.withdrawn(boss as any, { request_id: RID, via: 'fax', note: 'سحبه' }))).code, 'via');
    assertEquals((await failOf(() => ER.withdrawn(boss as any, { request_id: RID, via: 'phone', note: '' }))).code, 'note');
    await withMail(() => withNet(async (calls) => {
      const r: any = await ER.withdrawn(boss as any, { request_id: RID, via: 'phone', note: 'اتصل وقال إنه سيكمل البرنامج' });
      assertEquals([r.success, r.mailed], [true, true]);
      const req = w.tables.erasure_requests[0];
      assertEquals([req.status, req.withdrawn_via, req.decided_by], ['cancelled', 'phone', 'owner@x.sa']);
      assertEquals(w.tables.participants.length, 1);
      const mail = resendCalls(calls);
      assertEquals([mail[0].body.subject, String(mail[0].body.html).includes('باتصال')], [ERASE_WITHDRAWN_SUBJECT, true]);
      assertEquals(w.tables.audit_log.map((x) => x.action), ['erasure.withdrawn']);
    }));
  } finally { w.restore(); }
});

// ── التذكير ──
Deno.test('التذكير: قبل 10 أيام وقبل 3 ويوم المهلة ثم يوميًا بعد التأخر، مرة لكل مرحلة، وبقالب المالك وزر الورقة', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const created = Date.parse('2026-11-01T09:00:00Z');   // المهلة 1 ديسمبر
  const at = (iso: string) => Date.parse(iso);
  const w = installFake({ ...seed(), erasure_requests: [{ id: RID, participant_id: PID, status: 'pending', reason: null, created_at: new Date(created).toISOString(), reminder_stage: 0 }] });
  try {
    await withMail(() => withNet(async (calls) => {
      const run = async (iso: string) => (await ER.remindSweep(at(iso))).reminded;
      assertEquals(await run('2026-11-15T09:00:00Z'), 0);   // بقي 16 يومًا
      assertEquals(await run('2026-11-21T09:00:00Z'), 1);   // بقي 10
      assertEquals(await run('2026-11-21T15:00:00Z'), 0);   // الساعة التالية: لا تكرار
      assertEquals(await run('2026-11-28T09:00:00Z'), 1);   // بقي 3
      assertEquals(await run('2026-12-01T09:00:00Z'), 1);   // يوم المهلة
      assertEquals(await run('2026-12-01T20:00:00Z'), 0);
      assertEquals(await run('2026-12-02T09:00:00Z'), 1);   // متأخر بيوم
      assertEquals(await run('2026-12-03T09:00:00Z'), 1);   // متأخر بيومين
      assertEquals(w.tables.erasure_requests[0].reminder_stage, 5);
      const hooks = calls.filter((c) => c.url.includes('hooks.example'));
      assertEquals(hooks.map((c) => c.body.detail.days_left), [10, 3, 0, -1, -2]);
      assertEquals(String(hooks[0].body.detail.url).endsWith(`/participants/${PID}?erasure=open`), true);
      assertEquals(w.tables.audit_log.filter((x) => x.action === 'erasure.remind').length, 5);
      // البريد بقالب المالك لا قالب الحادثة العام
      const mail = resendCalls(calls);
      assertEquals(mail.map((m) => m.body.subject).slice(-1)[0], 'طلب حذف سارة أحمد الأحمد تجاوز المهلة');
      assertEquals(String(mail[0].body.html).includes('افتح الطلب'), true);
    }), 'owner@x.sa');
  } finally { w.restore(); Deno.env.delete('LEADERS_ALERT_WEBHOOK'); }
});

Deno.test('التذكير: إن لم يصل من أي قناة تُعاد مرحلته فيُعاد في الساعة التالية، والطلب المقرَّر لا يُذكَّر به', async () => {
  const now = Date.parse('2026-11-21T09:00:00Z');
  const w = installFake({ ...seed(), erasure_requests: [
    // رقم غير الاختبار السابق: مهلة التهدئة في الذاكرة بمفتاح الطلب ومرحلته
    { id: 'r-undelivered', participant_id: PID, status: 'pending', created_at: '2026-11-01T09:00:00Z', reminder_stage: 0 },
    { id: 'r2', participant_id: PID, status: 'rejected', created_at: '2026-10-01T09:00:00Z', reminder_stage: 0 },
  ] });
  try {
    await withMail(() => withNet(async () => {
      const r = await ER.remindSweep(now);
      assertEquals([r.reminded, (r as any).failed], [0, 1]);
      assertEquals(w.tables.erasure_requests.map((x) => x.reminder_stage), [0, 0]);
    }));
  } finally { w.restore(); }
});

// ── الربط ──
Deno.test('المسارات الأربعة في خريطة الإدارة، والتذكير في المهمة الساعية', async () => {
  const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  for (const k of ['admin.erasure-get', 'admin.erasure-execute', 'admin.erasure-decline', 'admin.erasure-withdrawn']) assertEquals(index.includes(`'${k}':`), true, k);
  assertEquals(/'cron\.expert-offers'[\s\S]*ER\.remindSweep\(\)/.test(index), true);
});
