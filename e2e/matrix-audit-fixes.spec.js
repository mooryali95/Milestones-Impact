// تطبيق المصفوفة: إصلاحات فحص الجاهزية (النوافذ والمعالم، إشعار الخصوصية، الهاتف، التحليل الديموغرافي)
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4302';
const FN = /supabase\.co\/functions\/v1\/user-api/;
const KEYS = ['creation', 'innovation', 'establishment', 'making'].flatMap((t) => [1, 2, 3, 4].map((p) => `${t}-${p}`));

// جلسة محفوظة محليًا، والخادم يعيد التسجيل نفسه، ويحفظ ما يُرسل إليه
async function seed(page, registration = {}) {
  const reg = { id: 'r1', name: 'مستخدم', phone: '0500000000', email: 'user@example.com', dates: {}, confirmed: {}, ...registration };
  await page.addInitScript((reg) => {
    localStorage.setItem('mi_local_session', JSON.stringify({
      user: { name: reg.name, phone: reg.phone, email: reg.email }, sessionId: 'r1', token: 'test-token',
      dates: reg.dates, confirmed: reg.confirmed, submitted: !!reg.submitted, reopenRequested: false, savedAt: Date.now(),
    }));
  }, reg);
  const saves = [];
  await page.route(FN, async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'save') saves.push(body);
    const res = body.action === 'get' ? { success: true, registration: reg } : { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  return saves;
}

const focusIn = (page, sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);

// ── visitor-3: النوافذ تدير التركيز، والشاشة لها معالم ──

test('نافذة العملية تأخذ التركيز وتحصر Tab داخلها وتُغلق بـ Esc', async ({ page }) => {
  await seed(page);
  await page.goto(BASE + '/');
  await page.locator('.cell', { hasText: 'تحليل ديموغرافي' }).click();
  await expect(page.locator('.modal')).toBeVisible();
  await expect.poll(() => focusIn(page, '.modal')).toBe(true);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
    expect(await focusIn(page, '.modal')).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
});

test('نافذة التأكيد تركّز على الخيار الأسلم وتعيد التركيز إلى زر فتحها', async ({ page }) => {
  await seed(page, { dates: { 'creation-1': '2099-01-01' } });
  await page.goto(BASE + '/');
  const logout = page.getByRole('button', { name: 'خروج' });
  await logout.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('alertdialog', { name: 'تأكيد الخروج' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAccessibleDescription(/بيانات غير مُقدَّمة/);
  await expect(dlg.getByRole('button', { name: 'إلغاء' })).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await focusIn(page, '.confirm-box')).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(logout).toBeFocused();
});

test('الشاشة الرئيسية لها معلم main وعنوان h1، والتبويب النشط معلَن', async ({ page }) => {
  await seed(page);
  await page.goto(BASE + '/');
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('main .cell').first()).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.tab[aria-current="page"]')).toHaveText('المصفوفة');
  await page.locator('.tab', { hasText: 'الجدول' }).click();
  await expect(page.locator('.tab[aria-current="page"]')).toHaveText('الجدول');
  await expect(page.locator('.tab[aria-current]')).toHaveCount(1);
});

test('حقول التسجيل تقبل التعبئة التلقائية وتُربط بأخطائها، والرسالة عربية لا رسالة المتصفح', async ({ page }) => {
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'بدء الرحلة' }).first().click();
  await expect(page.locator('#reg-name')).toHaveAttribute('autocomplete', 'name');
  await expect(page.locator('#reg-phone')).toHaveAttribute('autocomplete', 'tel');
  await expect(page.locator('#reg-email')).toHaveAttribute('autocomplete', 'email');
  await page.locator('#reg-email').fill('بلا-علامة');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  for (const [id, msg] of [['reg-name', 'الاسم مطلوب'], ['reg-phone', /صيغة غير صحيحة/], ['reg-email', 'بريد إلكتروني غير صحيح']]) {
    const input = page.locator(`#${id}`);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(msg);
  }
  await page.locator('#reg-name').fill('م');
  await expect(page.locator('#reg-name')).not.toHaveAttribute('aria-invalid', 'true');
});

// ── visitor-6: إشعار الخصوصية عند الجمع، وروابط الوثائق في التذييلين ──

test('التسجيل يعرض إشعار الخصوصية برابط السياسة والشروط', async ({ page }) => {
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(BASE + '/');
  const footer = page.locator('.lp-footer');
  await expect(footer.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('href', 'https://mi.sunkvalue.com/privacy.html');
  await expect(footer.getByRole('link', { name: 'شروط الخدمة' })).toHaveAttribute('href', 'https://mi.sunkvalue.com/terms.html');
  await page.getByRole('button', { name: 'بدء الرحلة' }).first().click();
  const notice = page.locator('.auth-privacy');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('href', 'https://mi.sunkvalue.com/privacy.html');
  await expect(notice.getByRole('link', { name: 'شروط الخدمة' })).toHaveAttribute('href', 'https://mi.sunkvalue.com/terms.html');
});

test('تذييل التطبيق وشاشة التحليل الديموغرافي يحيلان إلى سياسة الخصوصية', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto(BASE + '/');
  const link = page.locator('.app-footer').getByRole('link', { name: 'سياسة الخصوصية' });
  await expect(link).toHaveAttribute('href', 'https://mi.sunkvalue.com/privacy.html');
  // على الهاتف لا يغطيه شريط التبويب الثابت أسفل الشاشة
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  expect(await link.evaluate((el) => { const b = el.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el; })).toBe(true);
  await page.locator('.cell', { hasText: 'تحليل ديموغرافي' }).click();
  await page.getByRole('button', { name: /ابدأ تحليلك الديموغرافي/ }).click();
  const demo = page.getByRole('dialog', { name: 'التحليل الديموغرافي' });
  await expect(demo.locator('.demo-privacy')).toContainText('لا يحق لك مشاركتها');
  await expect(demo.locator('.demo-privacy').getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('href', 'https://mi.sunkvalue.com/privacy.html');
});

// ── visitor-9: الهاتف: عمود الحالة في النموذج النهائي يُبلغ بالتمرير، والإشعار الطويل يلتف ──

test('على الهاتف يُمرَّر جدول النموذج النهائي حتى عمود الحالة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dates = Object.fromEntries(KEYS.map((k, i) => [k, `2099-0${1 + (i % 9)}-${10 + i}`]));
  await seed(page, { dates, confirmed: { 'creation-1': true }, submitted: true });
  await page.goto(BASE + '/#/output');
  const th = page.locator('.output-table th', { hasText: 'الحالة' });
  await expect(th).toBeAttached();
  const r = await th.evaluate((el) => {
    // أقرب حاوية يمررها المستخدم أفقيًا (overflow-x: auto أو scroll) وفيها ما يتجاوزها
    let box = el.parentElement;
    while (box && !(['auto', 'scroll'].includes(getComputedStyle(box).overflowX) && box.scrollWidth > box.clientWidth)) box = box.parentElement;
    if (!box || box === document.body || box === document.documentElement) return { scroller: false };
    box.scrollLeft = -box.scrollWidth; // RTL: آخر الأعمدة في أقصى اليسار
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return { scroller: true, inside: a.left >= b.left - 1 && a.right <= b.right + 1, onScreen: a.left >= 0 && a.right <= innerWidth };
  });
  expect(r).toEqual({ scroller: true, inside: true, onScreen: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('الإشعار الطويل يلتف داخل الشاشة ولا يفيض عنها', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(FN, async (route) => {
    const body = route.request().postDataJSON();
    const res = body.action === 'verify'
      ? { success: true, mode: 'new', token: 't', registration: { id: 'r1', name: body.name, phone: body.phone, email: body.email, dates: {}, confirmed: {} } }
      : { success: true, mode: 'new' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(/supabase\.co\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'بدء الرحلة' }).first().click();
  // ترحيب باسم من 75 حرفًا (الحد 80): كان سطرًا واحدًا يتجاوز حافة الشاشة
  await page.locator('#reg-name').fill('عبدالرحمن بن عبدالعزيز بن محمد بن عبدالله بن سليمان بن إبراهيم آل عبدالرحمن');
  await page.locator('#reg-phone').fill('0500000000');
  await page.locator('#reg-email').fill('user@example.com');
  await page.getByRole('button', { name: /إرسال رمز التحقق/ }).click();
  await page.locator('#reg-otp').fill('123456');
  await page.getByRole('button', { name: /تحقق/ }).click();
  const toast = page.locator('.toast', { hasText: 'تم تسجيلك بنجاح' });
  await expect(toast).toBeVisible();
  const r = await toast.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left >= 0, right: b.right <= innerWidth, fits: el.scrollWidth <= el.clientWidth + 1, wide: b.width > innerWidth * 0.6 };
  });
  expect(r).toEqual({ left: true, right: true, fits: true, wide: true });
});

// ── visitor-10: التحليل الديموغرافي لا يُغلق فتضيع المدخلات ──

async function openDemo(page) {
  await page.locator('.cell', { hasText: 'تحليل ديموغرافي' }).click();
  await page.getByRole('button', { name: /ابدأ تحليلك الديموغرافي/ }).click();
  const demo = page.getByRole('dialog', { name: 'التحليل الديموغرافي' });
  await expect(demo.locator('[id$="-name"]').first()).toBeVisible();
  return demo;
}

test('النقر خارج التحليل أو الرجوع أو Esc مع تعديلات غير محفوظة يسأل قبل الخروج', async ({ page }) => {
  await seed(page);
  await page.goto(BASE + '/');
  const demo = await openDemo(page);
  const name = demo.locator('[id$="-name"]').first();
  await name.fill('شخص تجريبي');

  await page.mouse.click(5, 5);
  const ask = page.getByRole('alertdialog', { name: 'الخروج دون حفظ؟' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'العودة للتحرير' }).click();
  await expect(ask).toHaveCount(0);
  await expect(name).toHaveValue('شخص تجريبي');

  await demo.getByRole('button', { name: '← رجوع' }).click();
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape'); // Esc يغلق السؤال وحده، والتحليل باقٍ
  await expect(ask).toHaveCount(0);
  await expect(name).toHaveValue('شخص تجريبي');

  await page.keyboard.press('Escape');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'الخروج دون حفظ' }).click();
  await expect(demo).toHaveCount(0);
});

test('بلا تعديلات أو بعد الحفظ يُغلق التحليل مباشرة، وحذف شخص له بيانات يُطلب تأكيده', async ({ page }) => {
  const saves = await seed(page);
  await page.goto(BASE + '/');
  let demo = await openDemo(page);
  await demo.getByRole('button', { name: '← رجوع' }).click();
  await expect(demo).toHaveCount(0);

  demo = await openDemo(page);
  await demo.locator('[id$="-name"]').first().fill('سالم');
  await demo.locator('.demo-stepper-btn', { hasText: '+' }).first().click();
  await demo.getByRole('button', { name: /حفظ التحليل/ }).click();
  await expect(page.locator('.toast', { hasText: 'تم حفظ التحليل' })).toBeVisible();
  expect(saves).toHaveLength(1);
  await page.mouse.click(5, 5);
  await expect(demo).toHaveCount(0);

  demo = await openDemo(page);
  await expect(demo.locator('.demo-card')).toHaveCount(3);
  await demo.locator('[id$="-name"]').first().fill('سالم');
  await demo.locator('.demo-card').first().getByRole('button', { name: /حذف/ }).click();
  const ask = page.getByRole('alertdialog', { name: /حذف سالم/ });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'إلغاء' }).click();
  await expect(demo.locator('.demo-card')).toHaveCount(3);
  // الصف الفارغ يُحذف بلا سؤال
  await demo.locator('.demo-card').nth(2).getByRole('button', { name: /حذف/ }).click();
  await expect(demo.locator('.demo-card')).toHaveCount(2);
  await demo.locator('.demo-card').first().getByRole('button', { name: /حذف/ }).click();
  await page.getByRole('alertdialog', { name: /حذف سالم/ }).getByRole('button', { name: 'حذف' }).click();
  await expect(demo.locator('.demo-card')).toHaveCount(1);
});

// ── visitor-8: النقر على خلية بعد قفل الخطة يُعلم بالقفل وكيف يُطلب فتحها، بلا خطأ في الصفحة ──

test('النقر على خلية بعد التقديم النهائي يعرض رسالة القفل ولا يرمي خطأ', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dates = Object.fromEntries(KEYS.map((k, i) => [k, `2099-0${1 + (i % 9)}-${10 + i}`]));
  await seed(page, { dates, submitted: true });
  await page.goto(BASE + '/');
  // الخطة المقدَّمة تُفتح على النموذج النهائي، فيعود إلى المصفوفة
  await page.getByRole('button', { name: 'المصفوفة' }).click();
  const cell = page.locator('.cell', { hasText: 'تحليل ديموغرافي' });
  await cell.click();
  await expect(page.locator('.toast')).toContainText('الخطة مقفلة');
  await expect(page.locator('.toast')).toContainText('إعادة الفتح');
  await expect(page.locator('.modal')).toHaveCount(0);
  // وبلوحة المفاتيح كذلك
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('الخطة مقفلة');
  expect(errors).toEqual([]);
});
