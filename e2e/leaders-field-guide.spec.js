// مرافق بناء المبادرة (4أ): دليل الحقل يتلاشى بمستوى المشارك في إطار الفصل
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const model = (level) => ({ id: 'm1', key: 'cost-plan', dimension: 'milestone', title_ar: 'الموارد والتكلفة', points: 40, min_level: 'beginner', capstone_sort: 100, level,
  fields: [
    { key: 'items', type: 'table', label: 'بنود التكلفة', columns: ['رمز الحزمة', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'], min_rows: 3, required: true, hint: 'المبالغ بالريال' },
    { key: 'envelope', type: 'text', label: 'الميزانية المتاحة أو المعتمدة (ريال)', required: true },
  ] });

async function open(page, level, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const m = model(level);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'models.list') return route.fulfill({ json: { success: true, points: { total: 0, rank: null }, models: [{ ...m, capstone: true, fields_n: 2, progress: { filled: 0, total: 2 }, submission: null }] } });
    if (b.action === 'models.get') return route.fulfill({ json: { success: true, model: m, submission: null, initiative: 'رقمنة خدمات المستفيدين', imports: {}, capstone: { status: 'draft', locked: false } } });
    await route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-demo-recording-000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  await page.locator('[data-tour="nav-handbook"]').filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: /النماذج التعليمية/ }).click();
  await page.getByText('الموارد والتكلفة').first().click();
  await expect(page.getByRole('heading', { name: 'الموارد والتكلفة' })).toBeVisible();
}

test('التأسيسي: المطلوب والخطأ الشائع مفتوحان بجانب كل حقل', async ({ page }) => {
  await open(page, 'beginner');
  const notes = page.getByRole('note').filter({ hasText: 'المطلوب:' });
  await expect(notes).toHaveCount(2);
  await expect(notes.first()).toContainText('لا مبادرة بلا رقم');
  await expect(notes.first()).toContainText('تجنّب:');
  await expect(page.getByText('سؤال الخبير')).toHaveCount(0);
});

test('المتوسط: «كيف أكتبه؟» مطوي، ويفتح المطلوب وسؤالًا يرفع الجودة', async ({ page }) => {
  await open(page, 'intermediate');
  await expect(page.getByRole('note').filter({ hasText: 'المطلوب:' })).toHaveCount(0);
  const how = page.locator('summary', { hasText: 'كيف أكتبه؟' }).first();
  await expect(page.getByText('ارفع جودته:').first()).toBeHidden();
  await how.click();
  await expect(page.getByText('ارفع جودته:').first()).toBeVisible();
});

test('المتقدم: «سؤال الخبير» تحدٍّ لا شرح', async ({ page }) => {
  await open(page, 'advanced', { width: 390, height: 844 });
  await expect(page.locator('summary', { hasText: 'كيف أكتبه؟' })).toHaveCount(0);
  await page.locator('summary', { hasText: 'سؤال الخبير' }).first().click();
  await expect(page.getByText('اختبر جوابك:').first()).toBeVisible();
  await expect(page.getByText('المطلوب:')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
