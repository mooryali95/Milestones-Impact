// رابط عرض الخدمة للخبير (/offer?t=): كل حالة غير «معروض» منتهية بنصها، والمهلة المنقضية بلا أزرار،
// ورد الخادم «لم يعد قائمًا» يخفي الأزرار، وبعد القبول طريق إلى لوحة الخبير (links-expert-6). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const OFFER = `http://localhost:4304/offer?t=${'t'.repeat(40)}`;
const hours = (h) => new Date(Date.now() + h * 36e5).toISOString();
const offer = (o) => ({ status: 'offered', expert: 'د. سارة الحربي', role: 'coach', role_ar: 'موجّه', dimension_ar: 'المعالم', level_ar: 'متوسط', participant: 'نورة', expires_at: hours(20), note: null, context: null, ...o });

async function serve(page, o, respond = { success: true, accepted: true }) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'offer.get') return route.fulfill({ json: { success: true, offer: offer(o) } });
    if (b.action === 'offer.respond') return route.fulfill({ json: respond });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  return calls;
}

test('العرض المعروض: القبول يقود إلى لوحة الخبير، والعنوان الرئيسي واحد', async ({ page }) => {
  const calls = await serve(page, {});
  await page.goto(OFFER);
  await expect(page.getByRole('heading', { level: 1, name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  await page.getByRole('button', { name: 'أقبل الطلب' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'قُبل الطلب' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'افتح لوحة الخبير' })).toHaveAttribute('href', '/x');
  expect(calls.find((c) => c.action === 'offer.respond')).toMatchObject({ accept: true });
});

test('الخدمة المكتملة لا تعرض أزرار القبول، وتدل على اللوحة', async ({ page }) => {
  await serve(page, { status: 'completed' });
  await page.goto(OFFER);
  await expect(page.getByRole('heading', { level: 1, name: 'اكتملت هذه الخدمة' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'أقبل الطلب' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'افتح لوحة الخبير' })).toBeVisible();
});

test('العرض المقبول من اللوحة يُعرض مقبولًا برابط البريد', async ({ page }) => {
  await serve(page, { status: 'accepted', participant: 'نورة السالم' });
  await page.goto(OFFER);
  await expect(page.getByRole('heading', { level: 1, name: 'قُبل الطلب' })).toBeVisible();
});

test('الطلب الملغى منتهٍ بلا أزرار', async ({ page }) => {
  await serve(page, { status: 'cancelled' });
  await page.goto(OFFER);
  await expect(page.getByRole('heading', { level: 1, name: 'لم يعد هذا العرض قائمًا' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'أقبل الطلب' })).toHaveCount(0);
});

test('المهلة المنقضية قبل مرور المجدول: «انتهت» بلا أزرار، لا «أقل من ساعة»', async ({ page }) => {
  await serve(page, { expires_at: hours(-1) });
  await page.goto(OFFER);
  await expect(page.locator('.xo-facts')).toContainText('انتهت');
  await expect(page.locator('.xo-facts')).not.toContainText('أقل من ساعة');
  await expect(page.getByRole('status')).toContainText('انتهت مهلة هذا العرض');
  await expect(page.getByRole('button', { name: 'أقبل الطلب' })).toHaveCount(0);
});

test('رد الخادم «لم يعد قائمًا» يُعلن ويخفي الأزرار', async ({ page }) => {
  await serve(page, {}, { success: false, code: 'gone', message: 'لم يعد هذا العرض قائمًا' });
  await page.goto(OFFER);
  await page.getByRole('button', { name: 'أقبل الطلب' }).click();
  await expect(page.getByRole('alert')).toContainText('لم يعد هذا العرض قائمًا');
  await expect(page.getByRole('button', { name: 'أقبل الطلب' })).toHaveCount(0);
});
