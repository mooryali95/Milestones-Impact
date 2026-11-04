// الموقع المؤسسي mi.sunkvalue.com — يُخدم من home/
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4301';
const SUPABASE = /eormhcupwgwpllhrfxxg\.supabase\.co/;
const PAGES = ['/', '/assessment/', '/leaders/', '/projects/', '/governance/', '/privacy.html', '/terms.html', '/refund.html', '/pricing.html'];

// الخلفية مُحاكاة: كل طلب إلى Supabase يُسجَّل ويُرد عليه بنجاح.
async function mockBackend(page) {
  const calls = [];
  await page.route(SUPABASE, async (route) => {
    const req = route.request();
    calls.push({ url: req.url(), body: req.postDataJSON?.() ?? null });
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"success":true}' });
  });
  return calls;
}

for (const path of PAGES) {
  test(`الصفحة ${path} تعمل بلا أخطاء`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await mockBackend(page);
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('صفحة التسعير مخفية: لا رابط إليها ولا فهرسة', async ({ page }) => {
  for (const path of PAGES.filter((p) => p !== '/pricing.html')) {
    await page.goto(BASE + path);
    await expect(page.locator('a[href*="pricing"]')).toHaveCount(0);
  }
  await page.goto(BASE + '/pricing.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const sitemap = await (await page.request.get(BASE + '/sitemap.xml')).text();
  expect(sitemap).not.toContain('pricing');
});

test('نموذج التواصل: من الترحيب إلى الشكر، ويحفظ الطلب كاملًا', async ({ page }) => {
  const calls = await mockBackend(page);
  await page.goto(BASE + '/projects/');
  await page.evaluate(() => window.openTypeform());
  await expect(page.locator('#tfModal')).toBeVisible();

  await page.locator('.tf-welcome__cta').click();
  // ثلاث خطوات: الاسم والجهة، ثم التواصل، ثم الاهتمام والسياق
  await page.locator('#qName').fill('اختبار آلي');
  await page.locator('#qOrg').fill('جهة الاختبار');
  await page.locator('#tfNext').click();
  await page.locator('#qEmail').fill('test@example.com');
  await page.locator('#qPhone').fill('+966500000000');
  await page.locator('#tfNext').click();
  await page.locator('.tf-option[data-value="B"]').click();
  await page.locator('#qContext').fill('سياق تجريبي');
  await expect(page.locator('#tfNext')).toContainText('إرسال');
  await page.locator('#tfNext').click();

  await expect(page.locator('.tf-step[data-step="thanks"]')).toHaveClass(/active/);
  // الطلب يمر بإجراء contact في الدالة (لا إدراج مباشر في الجدول)
  expect(calls.some((c) => c.url.includes('/rest/v1/contact_requests'))).toBe(false);
  const insert = calls.find((c) => c.url.includes('/functions/v1/send-otp') && c.body?.action === 'contact');
  expect(insert?.body).toMatchObject({
    name: 'اختبار آلي',
    organization: 'جهة الاختبار',
    email: 'test@example.com',
    product: 'MI-PROJECTS',
    interest: 'B',
    interest_label: 'مشروعٌ قائم يحتاج إدارة',
    context: 'سياق تجريبي',
  });
});

async function fillContactForm(page) {
  await page.evaluate(() => window.openTypeform());
  await page.locator('.tf-welcome__cta').click();
  await page.locator('#qName').fill('اختبار آلي');
  await page.locator('#qOrg').fill('جهة الاختبار');
  await page.locator('#tfNext').click();
  await page.locator('#qEmail').fill('test@example.com');
  await page.locator('#qPhone').fill('+966500000000');
  await page.locator('#tfNext').click();
  await page.locator('.tf-option').first().click();
  await page.locator('#tfNext').click();
}

for (const path of ['/', '/projects/']) {
  test(`فشل حفظ الطلب في ${path} يُظهر رسالة وإعادة محاولة، ولا تظهر شاشة الشكر`, async ({ page }) => {
    let fail = true;
    await page.route(SUPABASE, (route) => fail
      ? route.fulfill({ status: 500, body: 'down' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
    await page.goto(BASE + path);
    await fillContactForm(page);
    await expect(page.locator('.tf-submit-error')).toBeVisible();
    await expect(page.locator('.tf-step[data-step="thanks"]')).not.toHaveClass(/active/);

    fail = false;
    await page.locator('.tf-submit-error__retry').click();
    await expect(page.locator('.tf-step[data-step="thanks"]')).toHaveClass(/active/);
  });
}

test('النموذج يرفض المتابعة دون اسم الجهة', async ({ page }) => {
  await mockBackend(page);
  await page.goto(BASE + '/');
  await page.evaluate(() => window.openTypeform());
  await page.locator('.tf-welcome__cta').click();
  await page.locator('#qName').fill('اختبار آلي');
  await page.locator('#tfNext').click();
  await expect(page.locator('.tf-step[data-step="1"] .tf-step__error')).toHaveClass(/show/);
  await expect(page.locator('.tf-step[data-step="1"]')).toHaveClass(/active/);
});

test('صفحة الحوكمة: المخطط يربط المجالس، ومقاعد الأعضاء تظهر', async ({ page }) => {
  await page.goto(BASE + '/governance/');
  await expect(page.locator('.org-node')).toHaveCount(4);
  await expect(page.locator('.gov-member')).toHaveCount(16);
  await page.locator('.org-node[href="#council-operational"]').click();
  await expect(page).toHaveURL(/#council-operational$/);
});

test('الخطوط مستضافة ذاتيًا: لا طلبات إلى Google Fonts، والخط العربي محمّل', async ({ page }) => {
  const external = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()); });
  for (const path of ['/', '/governance/']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.fonts.check('700 16px "Noto Kufi Arabic"', 'مرحبا'))).toBe(true);
  }
  expect(external).toEqual([]);
});

test('لكل صفحة برنامج صورة مشاركة خاصة بها وموجودة فعلًا', async ({ page }) => {
  for (const slug of ['leaders', 'projects', 'governance', 'assessment']) {
    await page.goto(`${BASE}/${slug}/`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toBe(`https://mi.sunkvalue.com/assets/og/${slug}.png`);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', og);
    const res = await page.request.get(BASE + new URL(og).pathname);
    expect(res.status()).toBe(200);
  }
});
