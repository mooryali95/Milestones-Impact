// لوحة الإدارة — admin/index.html
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303';

test('Enter على زر المتابعة يرسل الرمز مرة واحدة فقط', async ({ page }) => {
  const sends = [];
  await page.route(/supabase\.co\/functions\/v1\//, async (route) => {
    const body = route.request().postDataJSON();
    sends.push(body.action);
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto(BASE + '/');
  await page.locator('#loginEmail').fill('admin@example.com');
  await page.locator('#loginBtnSend').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#loginStepCode')).toBeVisible();
  expect(sends).toHaveLength(1);
});

// قيم الطلبات يكتبها أي زائر عبر REST مباشرة، فيجب ألا تُنفَّذ كودًا في اللوحة.
test('قيم طلب التواصل لا تُنفَّذ كودًا عند النسخ أو الرد أو فتح الطلب', async ({ page }) => {
  const evil = "x');window.__pwned=1;//";
  await page.route(/supabase\.co\/functions\/v1\//, async (route) => {
    const body = route.request().postDataJSON();
    const json = body.action === 'list-contacts'
      ? { success: true, contacts: [{ id: "r1');window.__pwned=1;//", name: evil, email: evil, phone: evil, organization: evil, status: 'read', product: 'MI-HOME', created_at: new Date().toISOString() }] }
      : { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { email: 'a@example.com', name: 'A', role: 'admin' }, ts: Date.now() }));
    window.open = () => null;
  });
  await page.goto(BASE + '/');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#tableBody .copy-btn').first().click();
  await page.locator('#tableBody tr td').first().click();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  await page.locator('#drawerBody .copy-btn').first().click();
  await page.locator('#drawerBody .reply-btn').click();
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(evil);
});

test('الإعدادات تعرض مفاتيح المرور والجلسات، وحساب المالك مقفل في جدول المستخدمين', async ({ page }) => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  await page.route(/supabase\.co\/functions\/v1\//, async (route) => {
    const { action } = route.request().postDataJSON();
    const json = {
      'security-status': { success: true, is_owner: true, passkey_only: false, method: 'passkey',
        passkeys: [{ id: 'p1', device_label: evil, backed_up: true, created_at: new Date().toISOString() }] },
      'sessions-list': { success: true, sessions: [{ current: true, method: 'passkey', ip: '1.2.3.4', ua: evil, auth_at: Date.now() }] },
      'list-users': { success: true, users: [
        { id: 'u1', name: 'المالك', email: 'o@example.com', role_id: 'super_admin', is_active: true, is_owner: true },
        { id: 'u2', name: 'مدير', email: 'a@example.com', role_id: 'admin', is_active: true },
      ] },
    }[action] || { success: true, contacts: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { email: 'o@example.com', name: 'O', role: 'super_admin', is_owner: true }, ts: Date.now() }));
  });
  await page.goto(BASE + '/');
  await page.locator('.dash-settings-btn').click();
  await expect(page.locator('#pkList .pk-row')).toHaveCount(1);
  await expect(page.locator('#pkList')).toContainText('متزامن');
  await expect(page.locator('#pkOnlyBtn')).toHaveText('تفعيل');
  await expect(page.locator('#sessList')).toContainText('هذه الجلسة');
  await expect(page.locator('#settingsName .owner-badge')).toBeVisible();
  await expect(page.locator('select[data-user-role="u1"]')).toBeDisabled();
  await expect(page.locator('[data-user-toggle="u1"]')).toHaveCount(0);
  await expect(page.locator('[data-user-toggle="u2"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('زر الدخول بمفتاح المرور يظهر حين يدعمه المتصفح', async ({ page }) => {
  await page.goto(BASE + '/');
  await expect(page.locator('#loginBtnPasskey')).toBeVisible();
});

test('رد 503 المؤقت من بوابة الدوال يُعاد تلقائيًا ولا يظهر للمدير', async ({ page }) => {
  let n = 0;
  await page.route(/supabase\.co\/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'list-contacts' && n++ === 0) return route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable' } });
    await route.fulfill({ json: b.action === 'list-contacts' ? { success: true, contacts: [{ id: 'c1', name: 'طلب بعد الإقلاع', email: 'a@b.c', status: 'new', product: 'MI-HOME', created_at: '2026-10-01T00:00:00Z' }] } : { success: true } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'م', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await expect(page.getByText('طلب بعد الإقلاع')).toBeVisible();
  await expect(page.getByText('Service is temporarily unavailable')).toHaveCount(0);
  expect(n).toBe(2);
});
