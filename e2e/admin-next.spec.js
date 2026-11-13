// لوحة الإدارة (React): الدخول وطلبات التواصل والإعدادات.
// الخلفية مُحاكاة بالكامل؛ كل طلب يُسجَّل للتحقق مما أُرسل.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const USER = { name: 'مدير الاختبار', email: 'a@mi.test', role_id: 'super_admin', totp_enabled: false };
const contacts = Array.from({ length: 23 }, (_, i) => ({
  id: `c${i}`, name: i === 0 ? 'سارة الأولى' : `متواصل ${i}`, email: `p${i}@x.com`, phone: '0500000000',
  organization: i % 2 ? 'وزارة' : 'شركة', interest: 'leaders', product: i % 3 ? 'MI-HOME' : 'MI-LEADERS',
  status: i === 0 ? 'new' : 'read', created_at: '2026-10-01T10:00:00Z', context: i === 0 ? 'نص السياق' : null,
}));

async function mock(page, overrides = {}) {
  const calls = [];
  await page.route(/supabase\.co\/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'login-send': { success: true },
      'login-verify': b.code === '123456' ? { success: true, token: 't1', user: USER } : { success: false, message: 'الرمز غير صحيح' },
      'list-contacts': { success: true, contacts },
      'update-contact': { success: true },
      'security-status': { success: true, passkeys: [], passkey_only: false, method: 'email' },
      'sessions-list': { success: true, sessions: [{ current: true, method: 'email', ip: '1.1.1.1', ua: 'test' }] },
      'list-users': { success: true, users: [{ id: 'u1', name: 'المالك', email: 'o@mi.test', role_id: 'super_admin', is_owner: true, is_active: true }] },
      logout: { success: true },
      ...overrides,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  return calls;
}

async function signIn(page) {
  await page.goto(BASE);
  await page.getByLabel('البريد الإلكتروني').fill('a@mi.test');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('الرمز المكوّن من 6 أرقام').fill('123456');
  await page.getByRole('button', { name: 'تأكيد الدخول' }).click();
  await expect(page.getByText('مدير الاختبار')).toBeVisible();
}

test('الدخول برمز خاطئ يعرض الخطأ، والصحيح يفتح اللوحة ويحفظ الجلسة', async ({ page }) => {
  await mock(page);
  await page.goto(BASE);
  await page.getByLabel('البريد الإلكتروني').fill('بريد-خطأ');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.getByRole('alert')).toHaveText('يرجى إدخال بريد إلكتروني صحيح');
  await page.getByLabel('البريد الإلكتروني').fill('a@mi.test');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('الرمز المكوّن من 6 أرقام').fill('000000');
  await page.getByRole('button', { name: 'تأكيد الدخول' }).click();
  await expect(page.getByRole('alert')).toHaveText('الرمز غير صحيح');
  await page.getByLabel('الرمز المكوّن من 6 أرقام').fill('123456');
  await page.getByRole('button', { name: 'تأكيد الدخول' }).click();
  await expect(page.getByText('مدير الاختبار')).toBeVisible();
  // الجلسة محفوظة فتبقى بعد التحديث
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('mi_admin_v3')));
  expect(saved.token).toBe('t1');
  await page.reload();
  await expect(page.getByText('مدير الاختبار')).toBeVisible();
});

test('طلبات التواصل: إحصاءات وبحث وصفحات ودرج يغيّر الحالة', async ({ page }) => {
  const calls = await mock(page);
  await signIn(page);
  await page.getByRole('button', { name: 'طلبات التواصل' }).click();   // الدخول يفتح تطبيق القادة، وهذا الاختبار لطلبات التواصل
  await expect(page.locator('.stat-card.s-total .stat-value')).toHaveText('23');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(3);

  await page.getByLabel('بحث').fill('سارة');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByText('سارة الأولى').click();
  const drawer = page.getByRole('dialog', { name: /سارة الأولى/ });
  await expect(drawer.getByText('نص السياق')).toBeVisible();
  // فتح طلب جديد يجعله مقروءًا
  await expect.poll(() => calls.find((c) => c.action === 'update-contact')?.fields.status).toBe('read');
  await drawer.getByRole('button', { name: 'مؤرشف' }).click();
  await expect(page.getByRole('status')).toContainText('مؤرشف');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('.status-badge.archived')).toHaveCount(1);
});

test('فشل تغيير الحالة يعيدها كما كانت', async ({ page }) => {
  await mock(page, { 'update-contact': { success: false, message: 'رفض الخادم' } });
  await signIn(page);
  await page.getByRole('button', { name: 'طلبات التواصل' }).click();   // الدخول يفتح تطبيق القادة، وهذا الاختبار لطلبات التواصل
  await page.getByText('متواصل 1', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تم الرد' }).click();
  await expect(page.getByRole('status')).toHaveText('رفض الخادم');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'مقروء' })).toHaveAttribute('aria-pressed', 'true');
});

test('خطأ التحميل يعرض زر إعادة المحاولة', async ({ page }) => {
  await mock(page, { 'list-contacts': { success: false, message: 'تعذّر الاتصال' } });
  await signIn(page);
  await page.getByRole('button', { name: 'طلبات التواصل' }).click();   // الدخول يفتح تطبيق القادة، وهذا الاختبار لطلبات التواصل
  await expect(page.getByText('خطأ في تحميل البيانات: تعذّر الاتصال')).toBeVisible();
  await expect(page.getByRole('button', { name: 'حاول مرة أخرى' })).toBeVisible();
});

test('الإعدادات: الملف والجلسات والمستخدمون، وتأكيد بنافذة الهوية', async ({ page }) => {
  const calls = await mock(page, { 'sessions-revoke-others': { success: true, message: 'أُنهيت الجلسات' } });
  await signIn(page);
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'الإعدادات' });
  await expect(dlg.getByText('a@mi.test')).toBeVisible();
  await expect(dlg.getByText('● هذه الجلسة')).toBeVisible();
  await expect(dlg.getByText('o@mi.test')).toBeVisible();
  await dlg.getByRole('button', { name: 'إنهاء الجلسات الأخرى' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  expect(calls.some((c) => c.action === 'sessions-revoke-others')).toBe(false);
  await dlg.getByRole('button', { name: 'إنهاء الجلسات الأخرى' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByRole('status')).toContainText('أُنهيت الجلسات');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test('الخروج يمسح الجلسة', async ({ page }) => {
  await mock(page);
  await signIn(page);
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('mi_admin_v3'))).toBeNull();
});
