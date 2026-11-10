// رئيسية المشارك على الجوال: الأطوار التي لا عمل فيها مطوية، وبطاقة استبيان سهولة الاستخدام SUS
// تظهر حين يقرر الخادم استحقاقها وحده، وتختفي إن لم تُنشر دالتها بعد.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
test.use({ viewport: { width: 390, height: 844 } });

async function open(page, sus) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const sent = [];
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-demo-recording-00000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'sus.state') return route.fulfill({ json: sus });
    if (b.action === 'sus.submit') { sent.push(b); return route.fulfill({ json: { success: true, answered: true } }); }
    return route.fulfill({ json: srv.reply(b) });
  });
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
  return sent;
}

test('الأطوار التي لا عمل فيها مطوية على الجوال، والطور الحالي مفتوح', async ({ page }) => {
  await open(page, { success: false, code: 'unknown_action' });
  const folded = page.locator('details.j-fold').filter({ hasText: 'القبول' });
  await expect(folded.locator('summary')).toBeVisible();
  await expect(folded).not.toHaveAttribute('open', '');
  // الطور الذي فيه العمل ليس مطويًا: مرحلته الحالية ظاهرة بلا ضغط
  await expect(page.locator('.phase').filter({ hasText: 'التأهيل' }).getByText('التدريب').first()).toBeVisible();
  await folded.locator('summary').click();
  await expect(folded.getByText('الملف الشخصي')).toBeVisible();
});

test('المراحل المقفلة القادمة سطر يُفتح، وبطاقة الكتيب لا تتكرر على الجوال', async ({ page }) => {
  await open(page, { success: false, code: 'unknown_action' });
  const later = page.locator('details.j-later');
  await expect(later.locator('summary')).toContainText('3 مراحل قادمة');
  await expect(later.locator('summary')).toContainText('تُفتح بعد التدريب');
  await expect(later.getByText('الاستشارة')).toBeHidden();
  // قائمة تحقق المرحلة الحالية باقية كاملة بلا ضغط
  await expect(page.getByText('قائمة التحقق')).toBeVisible();
  await later.locator('summary').click();
  await expect(later.getByText('الاستشارة')).toBeVisible();
  // الكتيب في شريط التنقل، فبطاقته لا تظهر في الرئيسية
  await expect(page.locator('.j-tools')).toBeHidden();
});

test('بطاقة SUS لا تظهر قبل نشر دالتها', async ({ page }) => {
  await open(page, { success: false, message: 'إجراء غير معروف', code: 'unknown_action' });
  await expect(page.locator('.sus')).toHaveCount(0);
});

test('بطاقة SUS: تُفتح، ولا تُرسل قبل اكتمال العشر، ثم تشكر', async ({ page }) => {
  const sent = await open(page, { success: true, ready: true, due: true, answered: false });
  const card = page.locator('.sus');
  await card.getByRole('button', { name: 'ابدأ' }).click();
  const send = card.getByRole('button', { name: /بقي|أرسل/ });
  await expect(send).toBeDisabled();
  for (let i = 0; i < 10; i += 1) await card.getByRole('radiogroup').nth(i).getByRole('radio').nth(i % 2 ? 0 : 4).click();
  await expect(send).toHaveText('أرسل');
  await send.click();
  await expect(page.getByText('شكرًا لك. رأيك يدخل في قياس سهولة المنصة')).toBeVisible();
  expect(sent[0].answers).toEqual([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
});

test('بطاقة SUS: «لاحقًا» تخفيها وتسجل التأجيل', async ({ page }) => {
  const sent = await open(page, { success: true, ready: true, due: true, answered: false });
  await page.locator('.sus').getByRole('button', { name: 'لاحقًا' }).click();
  await expect(page.locator('.sus')).toHaveCount(0);
  expect(sent[0].snooze).toBe(true);
});
