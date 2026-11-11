// صفحات الروابط المفتوحة بلا حساب: تأكيد الأثر على الجوال (links-expert-7)، والوصول فيها (links-expert-8):
// مجموعات التقدير مسمّاة، والخطأ يُعلن، وعنوان رئيسي واحد في كل صفحة وحالة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { readable } from './readable.js';

const BASE = 'http://localhost:4304';
const T = 'abcdefghijklmnopqrstuvwxyz';
const LIKERT = ['نادرًا جدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا', 'لا أستطيع الحكم'].map((label, k) => ({ k, label }));

async function mock(page, replies) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = replies[b.action];
    await route.fulfill({ json: (typeof r === 'function' ? r(b) : r) ?? { success: false, message: `غير متوقع: ${b.action}` } });
  });
}

const outcome = {
  success: true, done: false, decision: 'pending', sponsor: 'م. خالد', initiative: 'أتمتة طلبات الصيانة', leader: 'سارة الأحمد', org: 'جهة الاختبار',
  checkpoint: 'مراجعة اليوم 90', period: '2027-03', narrative: 'انخفض زمن الإغلاق.', blockers: 'تأخر ربط النظام المالي.', support: 'اعتماد ميزانية الربط من الإدارة.',
  statuses: { done: 'منجز', active: 'جارٍ' },
  state: {
    benefits: [{ key: 'b1', title: 'زمن إغلاق الطلب', baseline: '12 يومًا', target: '5 أيام', value: '7 أيام', realization: 0.71, evidence: null }],
    milestones: [{ key: 'm1', title: 'إطلاق النموذج', status: 'done', actual: '2027-02-14', due: '2027-03-01' }],
  },
};

test('تأكيد الأثر على الجوال: «الآن» و«التحقق» في الإطار، والتواريخ مقروءة، وما يحتاجه القائد ظاهر', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { 'outcome.get': outcome, 'outcome.submit': { success: false, message: 'تعذّر الحفظ، حاول مرة أخرى' } });
  await page.goto(`${BASE}/outcome?t=${T}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const vw = 390;
  for (const label of ['الآن', 'التحقق', 'المستهدف']) {
    const cell = page.locator(`td[data-label="${label}"]`).first();
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  }
  await expect(page.locator('td[data-label="الآن"]').first()).toContainText('7 أيام');
  const ms = page.locator('.tr-ms');
  await expect(ms).toContainText('14 فبراير 2027');
  await expect(ms).toContainText('المستهدف 1 مارس 2027');
  await expect(ms).not.toContainText('2027-03-01');
  await expect(page.getByText('اعتماد ميزانية الربط من الإدارة.')).toBeVisible();
  await expect(page.getByText('تأخر ربط النظام المالي.')).toBeVisible();
  expect(await readable(page)).toEqual({ hscroll: false, tiny: [] });
  await page.getByRole('button', { name: 'أؤكد الأرقام' }).click();
  await expect(page.getByRole('alert')).toContainText('تعذّر الحفظ');
});

test('المقيّم: كل مجموعة تقدير مسمّاة بالعبارة ووقتها، والخطأ يُعلن', async ({ page }) => {
  await mock(page, {
    'rater.get': { success: true, done: false, participant: 'سارة الأحمد', relation: 'المدير المباشر', rater: null, questions: [
      { id: 'q1', dimension: 'milestone', text: 'يختم الاجتماع بقرار موثق.', options: LIKERT },
    ] },
    'rater.submit': { success: false, message: 'انتهت صلاحية الرابط' },
  });
  await page.goto(`${BASE}/rate?t=${T}`);
  await expect(page.getByRole('radiogroup', { name: 'يختم الاجتماع بقرار موثق. الآن' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'يختم الاجتماع بقرار موثق. قبل البرنامج' })).toBeVisible();
  await page.getByRole('radiogroup', { name: /الآن$/ }).getByRole('radio', { name: 'غالبًا' }).click();
  await page.getByRole('radiogroup', { name: /قبل البرنامج$/ }).getByRole('radio', { name: 'نادرًا', exact: true }).click();
  await page.getByRole('button', { name: 'أرسل التقدير' }).click();
  await expect(page.getByRole('alert')).toContainText('انتهت صلاحية الرابط');
});

test('حالات الخطأ والصفحات بلا عنوان: عنوان رئيسي واحد وخطأ معلن', async ({ page }) => {
  await mock(page, {
    'rater.get': { success: false, message: 'انتهت صلاحية هذا الرابط' },
    'sponsor.get': { success: false, message: 'الرابط غير صحيح' },
    'outcome.get': { success: false, message: 'الرابط غير صحيح' },
    'offer.get': { success: false, message: 'انتهى هذا العرض أو لم يعد لك' },
    'cert.verify': { success: true, found: false },
  });
  for (const path of [`/rate?t=${T}`, `/sponsor?t=${T}`, `/outcome?t=${T}`, `/offer?t=${T}`]) {
    await page.goto(BASE + path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
    if (!path.startsWith('/offer')) await expect(page.getByRole('alert'), path).toBeVisible();
  }
  for (const path of ['/expert', '/v/MI-LDR-2026-000001']) {
    await page.goto(BASE + path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
  }
});
