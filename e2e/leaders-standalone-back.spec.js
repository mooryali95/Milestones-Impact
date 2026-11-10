// الصفحات المستقلة (طلب الخبير، لوحة الخبير، لوحة الجهة، الوثائق، التحقق من شهادة) لها مخرج ظاهر:
// الشعار ورابط في الشريط. وصفحات الرمز التي تصل غير المشاركين بالبريد بلا رابط إلى صفحة دخول المشارك.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304';
const mock = (page) => page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: false, message: 'غير متوقع' } }));

for (const path of ['/expert', '/legal', '/v']) {
  test(`${path}: فتح مباشر يعرض «الرئيسية» والشعار رابطًا إليها`, async ({ page }) => {
    await mock(page);
    await page.goto(APP + path);
    const bar = page.getByRole('banner');
    await expect(bar.getByRole('link', { name: 'الرئيسية', exact: false }).last()).toHaveAttribute('href', '/');
    await expect(bar.getByRole('link', { name: /Milestone Impact/ })).toHaveAttribute('href', '/');
  });
}

// لوحتا الجهة والخبير لهما رئيسيتهما (التدقيق 2026-11-10، البند 8.4): الشعار يعيد إليها، ولا «الرئيسية» إلى دخول المشارك
for (const [path, home] of [['/x', '/x'], ['/org', '/org']]) {
  test(`${path}: فتح مباشر: الشعار إلى رئيسية اللوحة نفسها، ولا رابط إلى دخول المشارك`, async ({ page }) => {
    await mock(page);
    await page.goto(APP + path);
    const bar = page.getByRole('banner');
    await expect(bar.getByRole('link', { name: /Milestone Impact/ })).toHaveAttribute('href', home);
    await expect(bar.locator('a[href="/"]')).toHaveCount(0);
  });
}

test('من داخل المنصة: الرابط «رجوع» ويعيد إلى الصفحة السابقة', async ({ page }) => {
  await mock(page);
  await page.goto(`${APP}/`);
  await page.getByRole('link', { name: 'لوحة الخبير' }).click();
  await expect(page).toHaveURL(/\/x$/);
  await page.getByRole('banner').getByRole('link', { name: /رجوع/ }).click();
  await expect(page).toHaveURL(`${APP}/`);
});

for (const path of ['/rate', '/sponsor', '/outcome']) {
  test(`${path}: صفحة رمز بلا رابط إلى دخول المشارك`, async ({ page }) => {
    await mock(page);
    await page.goto(APP + path);
    await expect(page.getByRole('banner').getByRole('link')).toHaveCount(0);
  });
}

test('رابط لا تعرفه المنصة: صفحة «غير موجودة» بروابط إلى البوابات الثلاث، لا صفحة الدخول', async ({ page }) => {
  await mock(page);
  await page.goto(`${APP}/no-such-page`);
  await expect(page.getByRole('heading', { name: 'هذه الصفحة غير موجودة' })).toBeVisible();
  await expect(page.getByLabel('البريد الإلكتروني')).toHaveCount(0);
  await expect(page).toHaveTitle('صفحة غير موجودة · رحلة القادة');
  await page.getByRole('main').getByRole('link', { name: 'بوابة المشاركين' }).click();
  await expect(page).toHaveURL(`${APP}/`);
});

test('/verify بلا رمز: صفحة الدخول بلا رسالة «الرمز منتهي»، ولا يُسأل الخادم', async ({ page }) => {
  const actions = [];
  await page.route(/functions\/v1\/leaders-api/, (r) => { actions.push(JSON.parse(r.request().postData() || '{}').action); return r.fulfill({ json: { success: false, message: 'الرابط أو الرمز منتهي' } }); });
  await page.goto(`${APP}/verify`);
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  await expect(page.getByText('الرابط أو الرمز منتهي')).toHaveCount(0);
  expect(actions).not.toContain('auth.verify');
});

test('عنوان التبويب يسمّي الصفحة', async ({ page }) => {
  await mock(page);
  await page.goto(`${APP}/x`);
  await expect(page).toHaveTitle('لوحة الخبير · رحلة القادة');
  await page.goto(`${APP}/org`);
  await expect(page).toHaveTitle('لوحة الجهة · رحلة القادة');
});

test('روابط الدخول الصغيرة بمساحة لمس 44 على الجوال', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/`);
  for (const name of ['لوحة الخبير', 'لوحة الجهة']) {
    const box = await page.getByRole('link', { name }).boundingBox();
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
});
