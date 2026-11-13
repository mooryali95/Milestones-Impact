// لوحة الإدارة على admin.sunkvalue.com: ضمانات نُقلت من اللوحة القديمة قبل حذفها.
// الخلفية مُحاكاة بالكامل.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const signedIn = () => (u) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: u, ts: Date.now() }));

test('Enter على زر المتابعة يرسل الرمز مرة واحدة فقط', async ({ page }) => {
  const sends = [];
  await page.route(/supabase\.co\/functions\/v1\//, async (route) => {
    sends.push(route.request().postDataJSON().action);
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: { success: true } });
  });
  await page.goto(BASE);
  await page.getByLabel('البريد الإلكتروني').fill('admin@example.com');
  await page.getByRole('button', { name: 'متابعة' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('الرمز المكوّن من 6 أرقام')).toBeVisible();
  expect(sends).toEqual(['login-send']);
});

// قيم الطلبات يكتبها أي زائر عبر REST مباشرة، فيجب أن تُعرض نصًا لا كودًا
test('قيم طلب التواصل تُعرض نصًا ولا تُنفَّذ', async ({ page }) => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  await page.route(/supabase\.co\/functions\/v1\//, (route) => route.fulfill({ json: route.request().postDataJSON().action === 'list-contacts'
    ? { success: true, contacts: [{ id: 'r1', name: evil, email: 'e@x.com', phone: evil, organization: evil, status: 'read', product: 'MI-HOME', created_at: new Date().toISOString() }] }
    : { success: true } }));
  await page.addInitScript(signedIn(), { email: 'a@example.com', name: 'A', role_id: 'admin' });
  await page.goto(`${BASE}#/contacts`);
  await expect(page.getByText(evil).first()).toBeVisible();
  await page.getByText(evil).first().click();
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('حساب المالك مقفل في جدول المستخدمين', async ({ page }) => {
  await page.route(/supabase\.co\/functions\/v1\//, (route) => route.fulfill({ json: {
    'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' },
    'sessions-list': { success: true, sessions: [] },
    'list-users': { success: true, users: [
      { id: 'u1', name: 'المالك', email: 'o@example.com', role_id: 'super_admin', is_active: true, is_owner: true },
      { id: 'u2', name: 'مدير', email: 'm@example.com', role_id: 'admin', is_active: true },
    ] },
  }[route.request().postDataJSON().action] || { success: true, contacts: [] } }));
  await page.addInitScript(signedIn(), { email: 'o@example.com', name: 'المالك', role_id: 'super_admin', is_owner: true });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click();
  await expect(page.getByLabel('دور المالك')).toBeDisabled();
  await expect(page.getByLabel('دور مدير')).toBeEnabled();
});

test('زر الدخول بمفتاح المرور يظهر حين يدعمه المتصفح', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByRole('button', { name: /مفتاح المرور/ })).toBeVisible();
});

test('رد 503 المؤقت من بوابة الدوال يُعاد تلقائيًا ولا يظهر للمدير', async ({ page }) => {
  let n = 0;
  await page.route(/supabase\.co\/functions\/v1\/admin-api/, async (route) => {
    const b = route.request().postDataJSON();
    if (b.action === 'list-contacts' && n++ === 0) return route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable' } });
    await route.fulfill({ json: b.action === 'list-contacts' ? { success: true, contacts: [{ id: 'c1', name: 'طلب بعد الإقلاع', email: 'a@b.c', status: 'new', product: 'MI-HOME', created_at: '2026-10-01T00:00:00Z' }] } : { success: true } });
  });
  await page.addInitScript(signedIn(), { name: 'م', email: 'a@x', role_id: 'admin' });
  await page.goto(`${BASE}#/contacts`);
  await expect(page.getByText('طلب بعد الإقلاع')).toBeVisible();
  await expect(page.getByText('Service is temporarily unavailable')).toHaveCount(0);
  expect(n).toBe(2);
});
