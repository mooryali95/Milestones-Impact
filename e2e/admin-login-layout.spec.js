// شاشة دخول الإدارة: التخطيط على 1280 و390 (لا تمرير أفقي، لوحة العلامة شريط علوي على الجوال)،
// وفحص axe للتباين والتسميات، وحالات الإرسال والخطأ. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const AXE = require.resolve('axe-core/axe.min.js');
const BASE = 'http://localhost:4303/';

async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
  });
}
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [width, height] of [[1280, 800], [390, 844]]) {
  test(`دخول الإدارة على ${width}: العناصر ظاهرة، ولا تمرير أفقي، وaxe نظيف`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route(/supabase\.co\/functions\/v1\//, (route) => route.fulfill({ json: { success: true } }));
    await page.goto(BASE);
    await expect(page.getByRole('heading', { name: 'لوحة الإدارة الموحّدة' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'دخول الإدارة' })).toBeVisible();
    await expect(page.getByText('أدخل بريدك فيصلك رمز دخول')).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
    await expect(page.getByRole('button', { name: 'أرسل رمز الدخول' })).toBeVisible();
    await expect(page.getByText('دخول آمن بلا كلمة مرور')).toBeVisible();
    await expect(page.getByText('تعذّر الدخول؟')).toBeVisible();
    expect(await hScroll(page)).toBeLessThanOrEqual(0);
    // البطاقة في المنتصف عموديًا على الحاسوب، وبعرض الشاشة تقريبًا على الجوال
    const card = await page.locator('.login-form-wrap').boundingBox();
    if (width >= 1000) {
      expect(card.width).toBeLessThanOrEqual(400);
      expect(Math.abs(card.y + card.height / 2 - height / 2)).toBeLessThan(40);
      await expect(page.getByText('قياس الأثر ومتابعته')).toBeVisible();
      await expect(page.locator('.login-footnote')).toHaveCount(2);
    } else {
      expect(card.width).toBeGreaterThan(width - 40);
      const band = await page.locator('.login-left').boundingBox();
      expect(band.height).toBeLessThan(160);
      expect(band.y).toBe(0);
    }
    expect(await axe(page)).toEqual([]);
  });
}

test('حالات الإرسال: «جارٍ إرسال الرمز» ثم شاشة الرمز، والخطأ يظهر تنبيهًا', async ({ page }) => {
  let fail = true;
  await page.route(/supabase\.co\/functions\/v1\//, async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: fail ? { success: false, message: 'البريد غير مسجّل' } : { success: true } });
  });
  await page.goto(BASE);
  await page.getByLabel('البريد الإلكتروني').fill('admin@example.com');
  await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
  await expect(page.getByRole('button', { name: 'جارٍ إرسال الرمز...' })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('البريد غير مسجّل');
  fail = false;
  await page.getByRole('button', { name: 'أرسل رمز الدخول' }).click();
  await expect(page.getByLabel('الرمز المكوّن من 6 أرقام')).toBeVisible();
  await expect(page.getByText('admin@example.com')).toBeVisible();
});
