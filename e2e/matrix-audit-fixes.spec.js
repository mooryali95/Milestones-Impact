// تطبيق المصفوفة: إصلاحات فحص الجاهزية (النوافذ والمعالم، إشعار الخصوصية، الهاتف، التحليل الديموغرافي)
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4302';
const FN = /supabase\.co\/functions\/v1\/user-api/;

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
