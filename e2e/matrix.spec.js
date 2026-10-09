// تطبيق مصفوفة التأثير matrix.sunkvalue.com — يُبنى من src/ ويُخدم بـ vite preview
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4302';
const FN = /supabase\.co\/functions\/v1\/user-api/;

// يحاكي دالة user-api: إرسال الرمز، ثم التحقق وإصدار جلسة، ثم الحفظ.
async function mockUserApi(page, { failVerify = false } = {}) {
  const calls = [];
  await page.route(FN, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    let res = { success: true };
    if (body.action === 'register-send') res = { success: true, mode: 'new' };
    if (body.action === 'verify') res = failVerify
      ? { success: false, message: 'رمز التحقق غير صحيح' }
      : { success: true, mode: 'new', token: 'test-token',
          registration: { id: 'r1', name: body.name, phone: body.phone, email: body.email, dates: {}, confirmed: {} } };
    if (body.action === 'get') res = { success: true, registration: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  // القراءات العامة للمحتوى
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  return calls;
}

async function register(page) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
  await page.locator('#reg-name').fill('مستخدم الاختبار');
  await page.locator('#reg-phone').fill('0500000000');
  await page.locator('#reg-email').fill('user@example.com');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  await page.locator('#reg-otp').fill('123456');
  await page.getByRole('button', { name: /تحقق/ }).click();
}

test('التسجيل يرفض البيانات غير الصحيحة قبل الاتصال بالخادم', async ({ page }) => {
  const calls = await mockUserApi(page);
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
  await page.locator('#reg-phone').fill('123');
  await page.locator('#reg-email').fill('user@example.com');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  await expect(page.getByText('الاسم مطلوب')).toBeVisible();
  await expect(page.getByText(/صيغة غير صحيحة/)).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('التسجيل برمز التحقق يُدخل المستخدم إلى المصفوفة ويحفظ الجلسة', async ({ page }) => {
  const calls = await mockUserApi(page);
  await register(page);
  await expect(page.locator('.tabs')).toBeVisible();
  expect(calls.map((c) => c.action)).toEqual(expect.arrayContaining(['register-send', 'verify']));

  // إعادة التحميل تستعيد الجلسة بدل العودة للصفحة الأولى
  await page.reload();
  await expect(page.locator('.tabs')).toBeVisible();
});

test('رمز تحقق خاطئ يُظهر رسالة واضحة ولا يُدخل المستخدم', async ({ page }) => {
  await mockUserApi(page, { failVerify: true });
  await register(page);
  await expect(page.getByText('رمز التحقق غير صحيح')).toBeVisible();
  await expect(page.locator('.tabs')).toHaveCount(0);
});

test('انقطاع الشبكة أثناء التسجيل يُظهر رسالة بدل التجمد', async ({ page }) => {
  await page.route(FN, (r) => r.abort('internetdisconnected'));
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
  await page.locator('#reg-name').fill('مستخدم');
  await page.locator('#reg-phone').fill('0500000000');
  await page.locator('#reg-email').fill('user@example.com');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  await expect(page.getByText('خطأ في الاتصال بالخادم')).toBeVisible();
  await expect(page.getByRole('button', { name: /إرسال رمز التحقق/ })).toBeEnabled();
});

// جلسة محفوظة محليًا قبل تحميل الصفحة
async function seedSession(page, extra = {}) {
  await page.addInitScript((extra) => {
    localStorage.setItem('mi_local_session', JSON.stringify({
      user: { name: 'مستخدم', phone: '0500000000', email: 'user@example.com' },
      sessionId: 'r1', token: 'test-token', dates: {}, confirmed: {},
      submitted: false, reopenRequested: false, savedAt: Date.now(), ...extra,
    }));
  }, extra);
}

test('استعادة الجلسة تأخذ حالة الخطة من الخادم لا من النسخة المحلية', async ({ page }) => {
  await seedSession(page);
  await page.route(FN, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
    { success: true, registration: { id: 'r1', name: 'مستخدم', phone: '0500000000', email: 'user@example.com', dates: {}, confirmed: {}, submitted: true } }) }));
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(BASE + '/');
  await expect(page.locator('.tab', { hasText: 'النهائي' })).toBeVisible();
});

test('انتهاء الجلسة على الخادم يُخرج المستخدم برسالة', async ({ page }) => {
  await seedSession(page);
  await page.route(FN, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
    { success: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول مجددًا' }) }));
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(BASE + '/');
  await expect(page.getByText(/انتهت الجلسة/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ابدأ رحلتك' }).first()).toBeVisible();
});

// رابطٌ مشترَك إلى تبويب: يُفتح عليه، ورجوعٌ واحد يغادر التطبيق.
// كان تأثير الكتابة يعمل في تصيير الاعتماد نفسه فيرى التبويب القديم:
// يستبدل المدخل بـ #/matrix ثم يدفع #/schedule — فالرجوع يهبط على
// المصفوفة بدل مغادرة الموقع، وهو فخّ الرجوع الذي وُجد الخطّاف ليرفعه.
test('الرابط المشترَك إلى تبويب يُفتح عليه، والرجوع منه يغادر التطبيق', async ({ page, context }) => {
  await mockUserApi(page);
  await register(page);
  await expect(page.locator('.tabs')).toBeVisible();

  // تبويبٌ جديد يشارك الجلسة ولا يشارك تاريخ التصفّح — كمن يفتح رابطاً أُرسل إليه
  page = await context.newPage();
  await mockUserApi(page);
  await page.goto('about:blank');
  await page.goto(BASE + '/#/schedule');
  await expect(page.locator('.tab.on')).toHaveText('الجدول');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/schedule');
  // مدخلان فقط: الصفحة السابقة والرابط — لا مدخل زائد لتبويبٍ لم يُزَر
  expect(await page.evaluate(() => history.length)).toBe(2);

  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

// شاشات المصادقة تملأ النافذة. كانت min-height معلنة مرّتين:
// 100vh ثم -webkit-fill-available، والثانية تغلب، وكروم يحسبها stretch
// فتنهار الشاشة إلى ارتفاع محتواها — نحو نصف النافذة — عند كل عرض.
for (const [w, h] of [[1280, 950], [1440, 900], [390, 844]]) {
  test(`شاشة التسجيل تملأ النافذة عند ${w}×${h}`, async ({ page }) => {
    await mockUserApi(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
    const box = await page.locator('.auth-screen').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(h - 1);
  });
}

// شرائح المسارات على اللوحة الداكنة تُقرأ (WCAG AA: 4.5:1 للنصّ الصغير).
// كانت بلون المسار نفسه — درجات جرافيت على أرضية جرافيت — من 1.01:1 إلى 2.35:1.
test('شرائح المسارات في لوحة الدخول تجتاز التباين', async ({ page }) => {
  await mockUserApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
  const ratios = await page.evaluate(() => {
    const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number)
      .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bg = getComputedStyle(document.querySelector('.auth-left')).backgroundColor;
    return [...document.querySelectorAll('.auth-left-track')].map((el) => {
      const [a, b] = [lum(getComputedStyle(el).color), lum(bg)];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  expect(ratios).toHaveLength(4);
  for (const r of ratios) expect(r).toBeGreaterThanOrEqual(4.5);
});

// «إعادة إرسال» لا تبعث بريداً في كل ضغطة. كان otpLastSent يُكتب في أربعة
// مواضع ولا يُقرأ في أيٍّ منها، فالمهلة المعلنة (60 ثانية) لم توجد:
// إحدى عشرة ضغطة كانت تعني أحد عشر بريداً من حصّة الإرسال.
test('زرّ إعادة الإرسال ينتظر المهلة ولا يبعث بريداً في كل ضغطة', async ({ page }) => {
  await page.clock.install();
  const calls = await mockUserApi(page);
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'ابدأ رحلتك' }).first().click();
  await page.locator('#reg-name').fill('مستخدم الاختبار');
  await page.locator('#reg-phone').fill('0500000000');
  await page.locator('#reg-email').fill('user@example.com');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  await expect(page.locator('#reg-otp')).toBeVisible();

  const resend = page.getByRole('button', { name: /إعادة/ });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/بعد \d+ ثانية/);
  for (let i = 0; i < 10; i++) await resend.click({ force: true });
  expect(calls.filter((c) => c.action === 'register-send')).toHaveLength(1);

  // وبعد المهلة يعود الزرّ ويُرسل مرّة واحدة، ثم تبدأ مهلةٌ جديدة
  await page.clock.fastForward(61_000);
  await expect(resend).toBeEnabled();
  await expect(resend).toHaveText('↻ إعادة إرسال');
  await resend.click();
  await expect.poll(() => calls.filter((c) => c.action === 'register-send').length).toBe(2);
  await expect(resend).toBeDisabled();
});

// «دخول المدير» يُنقر عند 1280×720. كان مؤشّر التمرير الزخرفيّ يغطّيه
// فيذهب النقر إليه ولا يحدث شيء — على مقاسٍ شائع في الحواسيب المحمولة.
test('زرّ دخول المدير يُنقر عند 1280×720', async ({ page }) => {
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /دخول المدير/ }).click({ timeout: 5000 });
  await expect(page.locator('#admin-email')).toBeVisible();
});

// «توزيع المسارات» في إحصائيات المدير: مسارٌ اكتمل يبلغ 100%. كان المقام
// 16 × عدد المسجّلين — عمليات المصفوفة كلها — والمسار لا يسع إلا أربعاً،
// فسقف كل عمود 25% مهما اكتمل.
test('إحصائيات المدير: مسارٌ اكتمل حجزه يبلغ عموده 100%', async ({ page }) => {
  const full = {};
  for (const t of ['creation', 'innovation', 'establishment', 'making'])
    for (let ph = 1; ph <= 4; ph++) full[`${t}-${ph}`] = '2026-11-0' + ph;
  await page.route(/supabase\.co\/functions\/v1\/admin-api/, async (route) => {
    const { action } = route.request().postDataJSON();
    const res = {
      'login-send': { success: true },
      'login-verify': { success: true, token: 'admin-token' },
      'list-regs': { success: true, registrations: [
        { id: 'a', name: 'مكتمل', dates: full, confirmed: {}, registeredAt: '2026-10-01' },
        { id: 'b', name: 'جزئيّ', dates: { 'creation-1': '2026-11-01', 'creation-2': '2026-11-02' }, confirmed: {}, registeredAt: '2026-10-02' },
      ] },
    }[action] || { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto(BASE + '/');
  await page.getByRole('button', { name: /دخول المدير/ }).click();
  await page.locator('#admin-email').fill('admin@example.com');
  await page.getByRole('button', { name: /إرسال/ }).click();
  await page.locator('#admin-code').fill('123456');
  await page.getByRole('button', { name: /دخول|تحقق/ }).last().click();
  await page.locator('.tabs .tab', { hasText: 'إحصائيات' }).click();

  // مسجّلان: الأول حجز المسارات الأربعة كاملة، والثاني عمليتين في «الخلق».
  // فالخلق 6 من 8 = 75%، وكلٌّ من البقية 4 من 8 = 50%.
  const widths = await page.locator('.rpt-bar-fill').evaluateAll((els) => els.map((e) => e.style.width));
  expect(widths).toEqual(['75%', '50%', '50%', '50%']);
});
