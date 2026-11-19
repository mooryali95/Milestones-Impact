// قسم «التوجيه» (مركز الإشعارات، المرحلة 4، خطة الاختبار 10.5): الحفظ للمالك وحده، ولا يُطفأ صف مقفل، ويُكتب السجل،
// ويصل الملاك بريد أمني بما تغير. والقراءة تعدّ أحداث 7 أيام بمفاتيحها، والإعداد المحفوظ يحكم raiseAlert فورًا
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const { adminSave, ST } = await import('./settings.ts');
const { Fail, publicDb } = await import('./core.ts');
const NS = await import('../_shared/notify-settings.ts');
const NC = await import('./notify-center.ts');
const { ROUTING_MAIL_SUBJECT } = await import('./core.ts');

type Mail = { to: string; subject: string; html: string };
// deno-lint-ignore no-explicit-any
const OWNER: any = { email: 'owner@x.sa', role: 'super_admin', method: 'passkey', owner: true };
// deno-lint-ignore no-explicit-any
const SUPER: any = { email: 'super@x.sa', role: 'super_admin', method: 'passkey', owner: false };

function world(value: unknown = null) {
  const w = installFake({ app_settings: value ? [{ key: 'notifications', value }] : [], audit_log: [] });
  const mails: Mail[] = [];
  const saved = { owners: ST.owners, mail: ST.mail };
  ST.owners = () => Promise.resolve(['owner@x.sa', 'owner2@x.sa']);
  ST.mail = (to: string, subject: string, html: string) => { mails.push({ to, subject, html }); return Promise.resolve(); };
  NS.resetNotifySettings();
  return { ...w, mails, restore: () => { w.restore(); Object.assign(ST, saved); NS.resetNotifySettings(); } };
}
const savedRow = (t: Record<string, any[]>) => t.app_settings.filter((r) => r.key === 'notifications').at(-1)?.value;

Deno.test('التوجيه: غير المالك لا يحفظ ولو كان مديرًا أعلى، ودور العرض لا يحفظ', async () => {
  const w = world();
  try {
    await assertRejects(() => adminSave(SUPER, { group: 'notifications', values: { preset: 'quiet' } }), Fail, 'المالك وحده');
    await assertRejects(() => adminSave({ email: 'v@x.sa', role: 'viewer', owner: true } as any, { group: 'notifications', values: { preset: 'quiet' } }), Fail, 'للعرض فقط');
    assertEquals(w.writes.length, 0);
    assertEquals(w.mails.length, 0);
  } finally { w.restore(); }
});

Deno.test('التوجيه: إطفاء بريد صف مقفل يُرفض برمز locked_row ولا يُكتب شيء', async () => {
  const w = world();
  try {
    for (const key of ['owner_login_new_device', 'payment_mismatch', 'erase_request', 'contact_request']) {
      const e = await assertRejects(() => adminSave(OWNER, { group: 'notifications', values: { rows: { [key]: { email: false, slack: true, digest: false } } } }), Fail);
      assertEquals((e as any).code, 'locked_row', key);
    }
    // صف مقفل بلا حقل البريد يُعد إطفاءً
    const e = await assertRejects(() => adminSave(OWNER, { group: 'notifications', values: { rows: { erase_request: { slack: true } } } }), Fail);
    assertEquals((e as any).code, 'locked_row');
    // قناة لا يسمح بها الحدث (بريد مفتاح المساعد) تُرفض بالتحقق
    await assertRejects(() => adminSave(OWNER, { group: 'notifications', values: { rows: { agent_key_changed: { email: true, slack: true } } } }), Fail, 'لا يُرسل عبر');
    await assertRejects(() => adminSave(OWNER, { group: 'notifications', values: { preset: 'loud' } }), Fail);
    assertEquals(w.writes.filter((x) => x.table === 'app_settings').length, 0);
    assertEquals(w.mails.length, 0);
  } finally { w.restore(); }
});

Deno.test('التوجيه: حفظ المالك يكتب المخزن والسجل قبل وبعد، ويرسل بريدًا أمنيًا لكل مالك بما تغير', async () => {
  const w = world();
  try {
    const r: any = await adminSave(OWNER, { group: 'notifications', values: { preset: 'quiet', rows: { erase_request: { email: true, slack: false, digest: false }, sponsor_request: { email: true, slack: true, digest: true } }, digest_hour: 8 } });
    assertEquals(r.success, true);
    assertEquals(savedRow(w.tables), { preset: 'quiet', rows: { erase_request: { email: true, slack: false, digest: false }, sponsor_request: { email: true, slack: true, digest: true } }, digest_hour: 8 });
    const log = w.tables.audit_log.find((x) => x.action === 'admin.settings-save' && x.entity_id === 'notifications');
    assert(log, 'سطر السجل');
    assertEquals(log.actor, 'owner@x.sa');
    assertEquals(log.before, { key: 'notifications', value: null });
    assertEquals(log.after.value.preset, 'quiet');
    assertEquals(w.mails.map((m) => m.to), ['owner@x.sa', 'owner2@x.sa']);
    assertEquals(w.mails[0].subject, ROUTING_MAIL_SUBJECT);
    for (const t of ['متوازن إلى هادئ', 'موعد الملخص اليومي', 'طلب رعاية', 'owner@x.sa']) assert(w.mails[0].html.includes(t), t);
    assertEquals(r.notice.mailed, 2);
    // المخزن الجديد يحكم القراءة فورًا في النسخة التي حفظت (مُسحت الذاكرة)
    assertEquals((await NS.notifySettings((await import('./core.ts')).db)).preset, 'quiet');
  } finally { w.restore(); }
});

Deno.test('التوجيه: حفظ لا يغير شيئًا لا يرسل بريدًا، وتعذّر البريد لا يرجع الحفظ', async () => {
  const w = world({ preset: 'balanced', rows: {}, digest_hour: 9 });
  try {
    const r: any = await adminSave(OWNER, { group: 'notifications', values: { preset: 'balanced' } });
    assertEquals(r.notice.changes, 0);
    assertEquals(w.mails.length, 0);
    ST.mail = () => Promise.reject(new Error('resend down'));
    const r2: any = await adminSave(OWNER, { group: 'notifications', values: { preset: 'all' } });
    assertEquals(r2.success, true);
    assertEquals(r2.notice.mailed, 0);
    assertEquals(savedRow(w.tables).preset, 'all');
  } finally { w.restore(); }
});

Deno.test('معاينة الأثر: أحداث 7 أيام بمفاتيحها من التنبيهات والإشعارات ودخول المالك، واللاحقة تأخذ صف أصلها', async () => {
  const now = Date.now();
  const t = new Date(now - 2 * 864e5).toISOString();
  const old = new Date(now - 9 * 864e5).toISOString();
  const w = installFake({ audit_log: [
    { action: 'system.alert', entity_id: 'mail_quota_70', created_at: t },
    { action: 'system.alert', entity_id: 'booking_not_eligible:abc', created_at: t },
    { action: 'system.alert', entity_id: 'mail_quota_70', created_at: old },
    { action: 'system.notify', entity_id: 'sponsor_request', created_at: t },
    { action: 'system.notify', entity_id: 'sponsor_request', created_at: t },
  ] });
  // deno-lint-ignore no-explicit-any
  const pub: any = publicDb;
  const savedFrom = pub.from;
  pub.from = () => {
    const q: any = { select: () => q, eq: () => q, not: () => q, gte: () => q, limit: () => Promise.resolve({ data: [{ meta: { device: 'known' } }, { meta: { device: 'new' } }, { meta: { device: 'known' } }], error: null }) };
    return q;
  };
  try {
    const r = await NC.weekCounts(now);
    assertEquals(r.errors, []);
    assertEquals(r.counts, { mail_quota_70: 1, booking_not_eligible: 1, sponsor_request: 2, owner_login_known_device: 2, owner_login_new_device: 1 });
  } finally { w.restore(); pub.from = savedFrom; }
});
