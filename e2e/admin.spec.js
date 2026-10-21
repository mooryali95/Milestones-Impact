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
