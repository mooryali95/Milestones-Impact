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
