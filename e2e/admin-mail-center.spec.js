// مركز البريد: الحصة، وتشخيص عنوان، وصندوق «لم يُرسل»، ورابط الدخول اليدوي للمدير الأعلى. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const series = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, sent: i, blocked: i === 13 ? 2 : 0, failed: 0 }));
const center = (over = {}) => ({
  success: true, counter_ok: true, budget: { cap: 80, sent: 46, remaining: 34, pct: 58, codes: 6, nonCode: 40, nonCodeLimit: 40, nonCodeLeft: 0, state: 'share' },
  budget_ar: 'حصة الإشعارات انتهت: رموز الدخول وحدها تخرج، والإشعارات تنتظر في الصندوق', next_free_at: null,
  by_kind: { code: 6, notify: 40 }, by_source: { 'leaders-api': 46 }, blocked_24h: 2, failed_24h: 0, series,
  queue: [{ id: 'q1', created_at: '2026-11-14T08:00:00Z', kind: 'notify', to_email: 's@x.com', subject: 'موعد جلستك غدًا', attempts: 0, state: 'waiting' }],
  lost: [{ id: 9, at: '2026-11-14T08:00:00Z', kind: 'notify', source: 'leaders-api', status: 'blocked', subject: 'موعد جلستك غدًا', to_domain: 'x.com' }],
  provider: { readable: true, reason: null, domains: [{ name: 'sunkvalue.com', status: 'verified', sender: true }], quota: {}, usage: null },
  retention_days: 180, traceable: true, alert_channel: false, ...over,
});
const trace = {
  success: true, email: 's@x.com', traceable: true, delivery_readable: true,
  account: { participant: { id: 'p1', full_name: 'سارة الأحمد', status: 'enrolled', phone: '0501234567', last_login_at: null }, expert: null, coordinator: null },
  events: [{ id: 1, created_at: '2026-11-14T09:00:00Z', kind: 'code', source: 'leaders-api', status: 'sent', resend_id: 're_1', subject: 'رمز الدخول إلى رحلتك', delivery: { event: 'bounced', label: 'ارتدّ: العنوان لا يستقبل', tone: 'bad' } }],
  waiting: [], diagnosis: { tone: 'bad', title: 'الرسالة ارتدّت: عنوانه لا يستقبل منا', advice: 'اطلب منه بريدًا آخر، أو أنشئ له رابط دخول وأرسله بواتساب.' },
};

async function setup(page, role = 'super_admin') {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.mail-center': center(), 'admin.mail-trace': trace,
      'admin.mail-queue-body': { success: true, id: 'q1', to: 's@x.com', subject: 'موعد جلستك غدًا', html: '<p>جلستك غدًا 10:00</p>', text: 'جلستك غدًا 10:00', mailto: 'mailto:s%40x.com?subject=x&body=y' },
      'admin.mail-queue-send': { success: true }, 'admin.mail-queue-cancel': { success: true },
      'admin.mail-login-link': { success: true, url: 'https://leaders.example/verify?e=s%40x.com&t=abc', minutes: 15, full_name: 'سارة الأحمد' },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() }));
    localStorage.clear();
  }, role);
  await page.goto(`${BASE}#/leaders/mailcenter`);
  await page.reload();
  return calls;
}

test('الحصة: المتبقي والحالة والمؤشرات وحالة المزوّد', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.mc-hero .pay-total')).toHaveText('34');
  await expect(page.getByText('رسالة باقية من 80 · أُرسل 46')).toBeVisible();
  await expect(page.locator('.mc-hero')).toContainText('حصة الإشعارات انتهت');
  await expect(page.getByRole('img', { name: 'أُرسل 46 من 80 في آخر 24 ساعة' })).toBeVisible();
  await expect(page.getByText('sunkvalue.com', { exact: true })).toBeVisible();
  await expect(page.getByText(/غير مضبوطة: أضف رابط Slack/)).toBeVisible();
});

test('لماذا لم يصل البريد: الحكم، وسجل العنوان، ورابط دخول يدوي بعد تأكيد', async ({ page }) => {
  const calls = await setup(page);
  await page.getByLabel('بريد المشتكي').fill('S@x.com');
  await page.getByRole('button', { name: 'ابحث' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'الرسالة ارتدّت' })).toBeVisible();
  await expect(page.getByText('ارتدّ: العنوان لا يستقبل')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.mail-trace').email).toBe('S@x.com');
  await page.getByRole('button', { name: 'أنشئ رابط دخول' }).click();
  expect(calls.some((c) => c.action === 'admin.mail-login-link')).toBe(false);
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByText('رابط الدخول جاهز')).toBeVisible();
  await expect(page.getByRole('link', { name: 'أرسله بواتساب' })).toHaveAttribute('href', /^https:\/\/wa\.me\/966501234567\?text=/);
  expect(calls.find((c) => c.action === 'admin.mail-login-link')).toMatchObject({ participant_id: 'p1' });
});

test('صندوق «لم يُرسل»: النص، وأرسل الآن بعد تأكيد، وأرسلتها بنفسي', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: 'النص', exact: true }).click();
  await expect(page.getByRole('link', { name: 'افتحها في بريدي' })).toHaveAttribute('href', /^mailto:/);
  await expect(page.locator('iframe.mg-frame')).toHaveAttribute('sandbox', '');
  await page.getByRole('button', { name: 'أرسل الآن' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.mail-queue-send')).toMatchObject({ id: 'q1' });
  await page.getByRole('button', { name: 'أرسلتها بنفسي' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.mail-queue-cancel')).toMatchObject({ id: 'q1', manual: true });
});

test('المدير غير الأعلى لا يرى زر رابط الدخول، والقارئ بلا أفعال', async ({ page }) => {
  await setup(page, 'admin');
  await page.getByLabel('بريد المشتكي').fill('s@x.com');
  await page.getByRole('button', { name: 'ابحث' }).click();
  await expect(page.getByRole('button', { name: 'ملفه' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'أنشئ رابط دخول' })).toHaveCount(0);
  await setup(page, 'viewer');
  await expect(page.locator('.mc-hero .pay-total')).toHaveText('34');
  await expect(page.getByLabel('بريد المشتكي')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'النص', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'أرسل الآن' })).toHaveCount(0);
});
