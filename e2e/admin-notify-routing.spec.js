// قسم «التوجيه» في مركز البريد (مركز الإشعارات، المرحلة 4): المصفوفة والإعدادات الجاهزة والصفوف المقفلة وصحة القنوات
// ومعاينة أثر 7 أيام وموعد الملخص، والحفظ للمالك وحده. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const center = {
  success: true, counter_ok: true, budget: { cap: 80, sent: 10, remaining: 70, pct: 12, codes: 4, nonCode: 6, nonCodeLimit: 40, nonCodeLeft: 34, state: 'ok' },
  budget_ar: 'الحصة سليمة', next_free_at: null, by_kind: { code: 4, notify: 6 }, by_source: { 'leaders-api': 10 }, blocked_24h: 0, failed_24h: 0,
  series: Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, sent: i, blocked: 0, failed: 0 })),
  queue: [], lost: [], provider: { readable: false, reason: 'غير متاح', domains: [], quota: {}, usage: null }, retention_days: 180, traceable: true, alert_channel: true,
};
const routing = (over = {}) => ({
  success: true, ready: true, settings: { preset: 'balanced', rows: {}, digest_hour: 9 }, saved: false, updated: null, legacy_payment_owner: false,
  owner: true, days: 7, counts: { mail_quota_70: 5, cert_key_missing: 1, sponsor_request: 3, expert_profile_done: 4 }, count_errors: [], capped: false,
  alert_mail_week: 9, alert_email: true, ...over,
});
const health = {
  success: true, mail: { key: true, cap: 80, sent: 10, codes: { failed: 0, blocked: 0 }, queue: { waiting: 0 } },
  slack: { configured: true, missing: [], readable: true, ok_at: new Date(Date.now() - 5 * 60e3).toISOString(), error_at: null, error: null },
  alerts: { email: true, webhook: false, slack: true },
};

async function setup(page, over = {}, save = { success: true, notice: { mailed: 2, changes: 1 } }) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = { 'admin.mail-center': center, 'admin.notify-routing': routing(over), 'admin.ops-health': health, 'admin.settings-save': save };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'المالك', email: 'o@x.com', role_id: 'super_admin', is_owner: true }, ts: Date.now() }));
    localStorage.clear();
  });
  await page.goto(`${BASE}#/leaders/mailcenter/routing`);
  await page.reload();
  await expect(page.locator('[data-section="routing"]')).toBeVisible();
  return calls;
}
const sec = (page) => page.locator('[data-section="routing"]');

test('التوجيه: «متوازن» افتراضيًا، والمقفل لا يُطفأ، والقناة غير المسموحة غائبة، وصحة القنوات والمعاينة وموعد الملخص', async ({ page }) => {
  await setup(page);
  const s = sec(page);
  await expect(s.getByRole('radio', { name: /متوازن/ })).toBeChecked();
  await expect(s.getByText('(الافتراضي)')).toBeVisible();
  // طلب حذف بيانات: صف مقفل، بريده مختار ومعطل
  const erase = s.locator('tr[data-event="erase_request"]');
  await expect(erase.getByText('لا يمكن إيقافه')).toBeVisible();
  await expect(erase.getByRole('checkbox', { name: /بريد$/ })).toBeChecked();
  await expect(erase.getByRole('checkbox', { name: /بريد$/ })).toBeDisabled();
  await expect(erase.getByRole('checkbox', { name: /Slack فوري$/ })).toBeEnabled();
  // مفتاح المساعد لا بريد له
  await expect(s.locator('tr[data-event="agent_key_changed"]').getByRole('checkbox', { name: /بريد$/ })).toHaveCount(0);
  // المعلوماتي في الملخص اليومي
  await expect(s.locator('tr[data-event="expert_profile_done"]').getByRole('checkbox', { name: /الملخص اليومي$/ })).toBeChecked();
  await expect(s.getByText('Slack', { exact: true })).toBeVisible();
  await expect(s.getByText(/آخر نجاح منذ/)).toBeVisible();
  await expect(s.locator('[data-impact="draft"]')).toHaveText('1');
  await expect(s.locator('[data-impact="saved"]')).toHaveText('1');
  await expect(s.getByText(/ووصل بريد التنبيه فعلًا 9 رسالة/)).toBeVisible();
  await expect(s.getByLabel('ساعة الملخص اليومي بتوقيت الرياض')).toHaveValue('9');
  await expect(s.getByRole('button', { name: 'احفظ التوجيه' })).toBeDisabled();
});

test('التوجيه: «كل شيء» يغير المعاينة، والحفظ بعد تأكيد يرسل الصفوف الدنيا وساعة الملخص ويذكر البريد الأمني', async ({ page }) => {
  const calls = await setup(page);
  const s = sec(page);
  await s.getByRole('radio', { name: /كل شيء/ }).check();
  // المهم بالبريد أيضًا: 1 حرج + 5 + 3
  await expect(s.locator('[data-impact="draft"]')).toHaveText('9');
  await s.locator('tr[data-event="sponsor_request"]').getByRole('checkbox', { name: /بريد$/ }).uncheck();
  await expect(s.locator('tr[data-event="sponsor_request"]')).toHaveClass(/custom/);
  await s.getByLabel('ساعة الملخص اليومي بتوقيت الرياض').selectOption('8');
  await s.getByRole('button', { name: 'احفظ التوجيه' }).click();
  expect(calls.some((c) => c.action === 'admin.settings-save')).toBe(false);
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByText('حُفظ التوجيه، وأُرسل البريد الأمني إلى 2 من الملاك')).toBeVisible();
  const saved = calls.find((c) => c.action === 'admin.settings-save');
  expect(saved.group).toBe('notifications');
  expect(saved.values).toEqual({ preset: 'all', rows: { sponsor_request: { email: false, slack: true, digest: true } }, digest_hour: 8 });
});

test('التوجيه: رفض الخادم يظهر برسالته', async ({ page }) => {
  await setup(page, {}, { success: false, code: 'locked_row', message: 'صف مقفل لا يُطفأ بريده: رسائل الأمان والمال والحذف تصل بالبريد دائمًا' });
  const s = sec(page);
  await s.getByRole('radio', { name: /هادئ/ }).check();
  await s.getByRole('button', { name: 'احفظ التوجيه' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(s.getByRole('alert')).toContainText('صف مقفل لا يُطفأ بريده');
});

test('التوجيه: المدير غير المالك يرى المصفوفة معطلة بلا زر حفظ، والمفتاح القديم للدفعة يظهر في صفيها', async ({ page }) => {
  await setup(page, { owner: false, legacy_payment_owner: true });
  const s = sec(page);
  await expect(s.getByText('الحفظ للمالك وحده. ترى هنا ما يجري الآن.')).toBeVisible();
  await expect(s.getByRole('radio', { name: /هادئ/ })).toBeDisabled();
  await expect(s.getByRole('button', { name: 'احفظ التوجيه' })).toHaveCount(0);
  await expect(s.getByText(/مفتاح «تنبيه الإدارة عند كل دفعة» القديم مفتوح/)).toBeVisible();
  await expect(s.locator('tr[data-event="payment_new"]').getByRole('checkbox', { name: /بريد$/ })).toBeChecked();
});
