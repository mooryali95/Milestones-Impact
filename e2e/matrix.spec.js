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
