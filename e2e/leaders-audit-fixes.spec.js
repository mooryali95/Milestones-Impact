// إصلاحات خطة الفحص الخارجي: زر الرجوع يتنقل بين الأقسام، والقسم المقفل يقول سببه عند لمسه،
// ورمز الحضور الممسوح قبل الدخول يبقى محفوظًا لما بعده.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
test.use({ viewport: { width: 390, height: 844 } });

async function open(page, state) {
  const srv = createMockServer();
  Object.assign(srv.s, state);
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-demo-recording-00000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
  });
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: srv.reply(JSON.parse(route.request().postData() || '{}')) }));
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
}

test('زر الرجوع في المتصفح يعيد إلى القسم السابق ولا يخرج من المنصة', async ({ page }) => {
  await open(page, { named: true, profileDone: true, assessed: true, approved: true });
  const bar = page.locator('nav.tabbar');
  await bar.getByRole('button', { name: 'ملفي' }).click();
  await expect(page.getByRole('heading', { name: 'ملفي الشخصي' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
  await expect(page).toHaveURL(APP);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'ملفي الشخصي' })).toBeVisible();
});

test('القسم المقفل يقول سبب قفله عند لمسه', async ({ page }) => {
  await open(page, { named: true, profileDone: true, assessed: true, approved: true });
  const locked = page.locator('nav.tabbar .nav-item.locked').first();
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await locked.click({ force: true })   // aria-disabled: Playwright يعدّه معطّلًا، والمستخدم يلمسه فعلًا;
  await expect(page.locator('nav.tabbar .nav-hint')).toContainText('يُفتح');
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
});

test('رمز الحضور الممسوح قبل الدخول يُحفظ لما بعد الدخول', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: { success: false, code: 'session' } }));
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.goto(`${APP}?checkin=abc123`);
  await expect(page.getByText('نسجّل حضورك بعده مباشرة')).toBeVisible();
  await expect(page).toHaveURL(APP);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mi_checkin'))).t).toBe('abc123');
});
