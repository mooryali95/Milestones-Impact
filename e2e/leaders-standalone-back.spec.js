// الصفحات المستقلة (طلب الخبير، لوحة الخبير، لوحة الجهة، الوثائق، التحقق من شهادة) لها مخرج ظاهر:
// الشعار ورابط في الشريط. وصفحات الرمز التي تصل غير المشاركين بالبريد بلا رابط إلى صفحة دخول المشارك.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304';
const mock = (page) => page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: false, message: 'غير متوقع' } }));

for (const path of ['/expert', '/x', '/org', '/legal', '/v']) {
  test(`${path}: فتح مباشر يعرض «الرئيسية» والشعار رابطًا إليها`, async ({ page }) => {
    await mock(page);
    await page.goto(APP + path);
    const bar = page.getByRole('banner');
    await expect(bar.getByRole('link', { name: 'الرئيسية', exact: false }).last()).toHaveAttribute('href', '/');
    await expect(bar.getByRole('link', { name: /Milestone Impact/ })).toHaveAttribute('href', '/');
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
