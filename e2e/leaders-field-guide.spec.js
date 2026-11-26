// مرافق بناء المبادرة (4أ): دليل الحقل يتلاشى بمستوى المشارك في إطار الفصل
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const model = (level) => ({ id: 'm1', key: 'cost-plan', dimension: 'milestone', title_ar: 'الموارد والتكلفة', points: 40, min_level: 'beginner', capstone_sort: 100, level,
  fields: [
    { key: 'items', type: 'table', label: 'بنود التكلفة', columns: ['رمز الحزمة', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'], min_rows: 3, required: true, hint: 'المبالغ بالريال' },
    { key: 'envelope', type: 'text', label: 'الميزانية المتاحة أو المعتمدة (ريال)', required: true },
    { key: 'funding', type: 'textarea', label: 'مصدر التمويل ومن يعتمده', required: true },
  ] });

async function open(page, level, viewport = { width: 1280, height: 900 }, examples = undefined) {
  await page.setViewportSize(viewport);
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const m = model(level);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'models.list') return route.fulfill({ json: { success: true, points: { total: 0, rank: null }, models: [{ ...m, capstone: true, fields_n: 3, progress: { filled: 0, total: 3 }, submission: null }] } });
    if (b.action === 'models.get') return route.fulfill({ json: { success: true, model: m, submission: null, initiative: 'رقمنة خدمات المستفيدين', sector: 'القطاع الصحي', examples, imports: {}, capstone: { status: 'draft', locked: false } } });
    await route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-demo-recording-000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  await page.locator('[data-tour="nav-handbook"]').filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: /النماذج التعليمية/ }).click();
  await page.getByText('الموارد والتكلفة').first().click();
  await expect(page.getByRole('heading', { name: 'الموارد والتكلفة' })).toBeVisible();
}

test('التأسيسي: المطلوب ظاهر بجانب كل حقل، والخطأ الشائع خلف «اقرأ المزيد»، والمثال خلف «أرني مثالًا»', async ({ page }) => {
  await open(page, 'beginner');
  const notes = page.getByRole('note').filter({ hasText: 'المطلوب:' });
  await expect(notes).toHaveCount(3);
  // المعنى للتأسيسي بأعمدته وحدها (meaning_beginner)
  await expect(notes.first()).toContainText('ما تحتاجه للمبادرة وكلفته التقديرية');
  await expect(page.getByText('سؤال الخبير')).toHaveCount(0);
  // الإرشاد المختصر (تخفيف وثيقة المبادرة للتأسيسي، المرحلة 3): الخطأ الشائع مطوي حتى يطلبه
  const avoid = notes.first().getByText('تجنّب:');
  await expect(avoid).toBeHidden();
  await notes.first().getByText('اقرأ المزيد').click();
  await expect(avoid).toBeVisible();
  // المثال التطوعي المحلول بأعمدة التأسيسي، ثم مثال قطاعه: أول صفوف جدول المبادرة الصحية المحلولة
  await notes.first().getByText('أرني مثالًا').click();
  await expect(notes.first()).toContainText('مثال من العمل التطوعي');
  await expect(notes.first()).toContainText('مثال من الصحة:');
  await expect(notes.first().locator('table').last()).toContainText('تحليل بيانات المواعيد');
});

test('النقل من المثال يُنبَّه عليه عند الكتابة ولا يمنع، والمكتوب من الواقع لا يُنبَّه', async ({ page }) => {
  await open(page, 'beginner');
  const funding = page.getByLabel('مصدر التمويل ومن يعتمده');
  const warn = page.getByRole('status').filter({ hasText: 'قريب جدًا من المثال' });
  await funding.fill('ميزانية التشغيل للتجمع الصحي (بند تحسين الوصول)، ويعتمدها المدير التنفيذي للتجمع بتوصية من المدير الطبي.');
  await expect(warn).toBeVisible();
  await funding.fill('من بند المبادرات النوعية في ميزانية إدارة الجودة، ويعتمده مدير الشؤون المالية بعد موافقة اللجنة التنفيذية.');
  await expect(warn).toHaveCount(0);
  await expect(funding).toBeEditable();
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
  await expect(page.getByText('مثال من الصحة:')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('المالك حجب مثال الصحة: يرى المشارك أقرب مثال مفتوح، وحجب العرض بجانب الحقل يخفي المثال ويبقي الدليل', async ({ page }) => {
  await open(page, 'beginner', undefined, { field: true, doc: true, sectors: ['gov'] });
  const notes = page.getByRole('note').filter({ hasText: 'المطلوب:' });
  await expect(notes.first()).toContainText('مثال من الخدمات الحكومية:');
  await expect(page.getByText('مثال من الصحة:')).toHaveCount(0);
});

test('المالك حجب الأمثلة بجانب الحقل: الدليل باقٍ بلا مثال', async ({ page }) => {
  await open(page, 'beginner', undefined, { field: false, doc: true, sectors: ['gov', 'health'] });
  await expect(page.getByRole('note').filter({ hasText: 'المطلوب:' })).toHaveCount(3);
  await expect(page.getByText(/مثال من /)).toHaveCount(0);
});

test('هيكل البداية: يُدرج في الجدول الفارغ وحده، وما بقي كما أُدرج يُنبَّه عليه', async ({ page }) => {
  await open(page, 'beginner');
  const start = page.getByRole('button', { name: '▤ ابدأ من هيكل' });
  await start.click();
  await expect(page.getByLabel('البند 1')).toHaveValue('الكوادر والاستشارات');
  await expect(page.getByRole('status').filter({ hasText: 'صفوف من الهيكل كما أُدرج' })).toBeVisible();
  await expect(start).toHaveCount(0);
  await page.getByLabel('الكمية 1').fill('2');
  await expect(page.getByRole('status').filter({ hasText: '4 صفوف من الهيكل' })).toBeVisible();
});

test('«عندي سؤال هنا» في الفصل يفتح السؤال عن الفصل نفسه', async ({ page }) => {
  await open(page, 'beginner');
  await page.getByRole('button', { name: 'لديّ سؤال عن هذا الفصل' }).click();
  await expect(page.getByRole('region', { name: 'اسأل خبيرًا عن «الموارد والتكلفة»' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'ما الذي تحتاجه؟' }).getByRole('radio')).toHaveCount(3);
});
