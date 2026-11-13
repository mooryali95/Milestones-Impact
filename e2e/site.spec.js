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

// بوابة تقرير مقياس الجاهزية: كانت تُدرج في contact_requests مباشرة بالمفتاح العام، والإدراج
// مغلق منذ ترحيل 20261105100000، فيضيع كل طلب. ثم تُخفي البوابة برسالة فشلها فلا يراها الزائر.
async function answerAssessment(page) {
  await page.goto(BASE + '/assessment/');
  await page.locator('#asStart').click();
  for (let i = 1; i <= 15; i++) {
    await expect(page.locator('#asCounter')).toHaveText(`${i} / 15`);
    await page.locator('.as-option').nth(i % 4).click();
  }
  await expect(page.locator('#asGate')).toBeVisible();
  await page.locator('#asGate [name="name"]').fill('اختبار آلي');
  await page.locator('#asGate [name="organization"]').fill('جهة الاختبار');
  await page.locator('#asGate [name="email"]').fill('test@example.com');
  await page.locator('#asGateBtn').click();
}
const sendOtp = (calls) => calls.filter((c) => c.url.includes('/functions/v1/send-otp') && c.body?.action === 'contact');

test('بوابة المقياس: الطلب يمر بإجراء contact في الدالة، ويُعرض التقرير', async ({ page }) => {
  const calls = await mockBackend(page);
  await answerAssessment(page);
  await expect(page.locator('#asReport')).toBeVisible();
  await expect(page.locator('#asGate')).toBeHidden();
  expect(calls.some((c) => c.url.includes('/rest/v1/contact_requests'))).toBe(false);
  const sent = sendOtp(calls);
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toMatchObject({
    product: 'MI-ASSESSMENT',
    interest: 'assessment',
    interest_label: 'مقياس جاهزية الأثر',
    name: 'اختبار آلي',
    organization: 'جهة الاختبار',
    email: 'test@example.com',
  });
  expect(sent[0].body.context).toMatch(/^الدرجة الكلية: \d+% .*؛ الإجابات: (\d,){14}\d$/);
});

test('بوابة المقياس: يُعرض التحقق البشري حين يطلبه الخادم، ثم يُعاد الإرسال برمزه', async ({ page }) => {
  // أداة Turnstile مُحاكاة: تحفظ دالة النجاح ليستدعيها الاختبار
  await page.addInitScript(() => {
    window.turnstile = { render: (el, opts) => { el.textContent = 'widget'; window.__solve = opts.callback; } };
  });
  const calls = [];
  await page.route(SUPABASE, async (route) => {
    const body = route.request().postDataJSON?.() ?? null;
    calls.push({ url: route.request().url(), body });
    const ok = body?.captcha === 'turnstile-token-123';
    await route.fulfill({ status: ok ? 200 : 400, contentType: 'application/json',
      body: JSON.stringify(ok ? { success: true } : { success: false, code: 'captcha', site_key: 'site-key-test' }) });
  });
  await answerAssessment(page);
  await expect(page.locator('#asGate .as-captcha')).toBeVisible();
  await expect(page.locator('#asReport')).toBeHidden();

  await page.evaluate(() => window.__solve('turnstile-token-123'));
  await expect(page.locator('#asReport')).toBeVisible();
  await expect(page.locator('#asGate')).toBeHidden();
  const sent = sendOtp(calls);
  expect(sent).toHaveLength(2);
  expect(sent[0].body.captcha).toBeUndefined();
  expect(sent[1].body.captcha).toBe('turnstile-token-123');
});

test('بوابة المقياس: تعذّر الإرسال يُبقي الرسالة وبديل البريد ظاهرين فوق التقرير، وإعادة المحاولة ترسل', async ({ page }) => {
  let fail = true;
  const calls = [];
  await page.route(SUPABASE, (route) => {
    calls.push({ url: route.request().url(), body: route.request().postDataJSON?.() ?? null });
    return fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"code":"db"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await answerAssessment(page);
  await expect(page.locator('#asGateError')).toBeVisible();
  await expect(page.locator('#asGateError')).toContainText('تعذّر إرسال بياناتكم');
  await expect(page.locator('#asGateError a[href^="mailto:mi@sunkvalue.com"]')).toBeVisible();
  await expect(page.locator('#asReport')).toBeVisible();
  await expect(page.locator('#asGateBtn')).toHaveText('إعادة المحاولة');

  fail = false;
  await page.locator('#asGateBtn').click();
  await expect(page.locator('#asGate')).toBeHidden();
  await expect(page.locator('#asReport')).toBeVisible();
  expect(sendOtp(calls)).toHaveLength(2);
});

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

// ── visitor-4: نموذج التواصل بلوحة المفاتيح: التركيز داخل النافذة، والخطوات المخفية لا تُبلغ،
//    وEnter على الأزرار يعمل عملها، والمدخلات تبقى بعد الإغلاق، والخطأ معلن ──
const inModal = (page) => page.evaluate(() => !!document.activeElement?.closest('#tfModal'));

test('نموذج التواصل: يأخذ التركيز ويحصر Tab في الخطوة الظاهرة ويعيده إلى زر الفتح', async ({ page }) => {
  await mockBackend(page);
  await page.goto(BASE + '/');
  const trigger = page.locator('.header__cta');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tfModal')).toBeVisible();
  await expect(page.locator('.tf-welcome__cta')).toBeFocused();
  await page.keyboard.press('Enter'); // زر البدء ينقل إلى الخطوة الأولى
  await expect(page.locator('.tf-step[data-step="1"]')).toHaveClass(/active/);
  await expect(page.locator('#qName')).toBeFocused();
  const hidden = ['qEmail', 'qPhone', 'qContext'];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab');
    expect(await inModal(page)).toBe(true);
    const id = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
    expect(hidden.includes(id) || /tf-option|tf-thanks/.test(id)).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#tfModal')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('نموذج التواصل: Enter على الإغلاق يغلق وعلى السابق يرجع وعلى الخيار يختاره', async ({ page }) => {
  await mockBackend(page);
  await page.goto(BASE + '/');
  await page.evaluate(() => window.openTypeform());
  await page.locator('.tf-welcome__cta').click();
  await page.locator('#qName').fill('اختبار آلي');
  await page.locator('#qOrg').fill('جهة الاختبار');
  await page.keyboard.press('Enter'); // Enter في الحقل يتقدم
  await expect(page.locator('.tf-step[data-step="2"]')).toHaveClass(/active/);
  await page.locator('#qEmail').fill('test@example.com');
  await page.locator('#qPhone').fill('+966500000000');
  await page.locator('#tfNext').click();
  await expect(page.locator('.tf-step[data-step="3"]')).toHaveClass(/active/);
  await page.locator('.tf-option').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tf-option').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.tf-step[data-step="3"]')).toHaveClass(/active/);
  await page.locator('#tfPrev').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tf-step[data-step="2"]')).toHaveClass(/active/);
  await expect(page.locator('.tf-step[data-step="2"] .tf-step__error')).not.toHaveClass(/show/);
  await page.locator('.tf-modal__close').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tfModal')).toBeHidden();
});

test('نموذج التواصل: الإغلاق لا يمحو المدخلات، والإرسال الناجح يمحوها', async ({ page }) => {
  await mockBackend(page);
  await page.goto(BASE + '/projects/');
  await page.evaluate(() => window.openTypeform());
  await page.locator('.tf-welcome__cta').click();
  await page.locator('#qName').fill('اختبار آلي');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openTypeform());
  await expect(page.locator('#qName')).toHaveValue('اختبار آلي');
  await page.keyboard.press('Escape');
  await fillContactForm(page);
  await expect(page.locator('.tf-step[data-step="thanks"]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openTypeform());
  await expect(page.locator('#qName')).toHaveValue('');
});

test('نموذج التواصل: خطأ الخطوة معلن، والحقل المخالف موسوم ومركّز', async ({ page }) => {
  await mockBackend(page);
  await page.goto(BASE + '/');
  await page.evaluate(() => window.openTypeform());
  await page.locator('.tf-welcome__cta').click();
  await page.locator('#qName').fill('اختبار آلي');
  await page.locator('#tfNext').click();
  const err = page.locator('.tf-step[data-step="1"] .tf-step__error');
  await expect(err).toHaveAttribute('role', 'alert');
  await expect(err).toHaveText('يُرجى إدخال الاسم والجهة.');
  await expect(page.locator('#qOrg')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#qName')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#qOrg')).toBeFocused();
  const color = await err.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(154, 79, 18)');
});

// ── visitor-5: درج الجوال المغلق لا يبلغه Tab، والمفتوح يأخذ التركيز ويعيده إلى زر القائمة ──
test('درج الجوال: مغلقًا خارج ترتيب Tab، ومفتوحًا يأخذ التركيز ويعيده عند الإغلاق', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/');
  const drawer = page.locator('#mobileDrawer');
  const burger = page.locator('#burgerBtn');
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await burger.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#mobileDrawer'))).toBe(false);

  await burger.click();
  await expect(burger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#drawerCloseBtn')).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#mobileDrawer'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(burger).toHaveAttribute('aria-expanded', 'false');
  await expect(burger).toBeFocused();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
});
