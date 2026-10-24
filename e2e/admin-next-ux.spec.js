// لوحة الإدارة الجديدة: الروابط، وما ينتظر القرار، وحماية التعديل. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const people = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' }];
const person = { success: true, participant: { ...people[0] }, progress: 0, history: [], profile: { dimensions: [] }, assessments: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [] };
const ch = { id: 'h1', dimension: 'milestone', sort: 1, title_ar: 'المعلم', min_level: 'beginner', body_md: 'نص', quiz_md: '' };
const catalog = { success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], tracks: [], track_stats: {}, handbook_modules: [ch], learning_models: [], book_stats: {} };

async function setup(page, hash = '') {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [{ id: 'c1', status: 'new' }, { id: 'c2', status: 'read' }] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.participant': person, 'admin.catalog': catalog,
      'admin.overview': { success: true, total: 1, by_status: {}, pending_reviews: 0, matrix: { milestone: { beginner: 0, intermediate: 0, advanced: 0 }, impact: { beginner: 0, intermediate: 0, advanced: 0 }, leadership: { beginner: 0, intermediate: 0, advanced: 0 } } },
      'admin.reviews': { success: true, pending_approval: [{ id: 'p1', full_name: 'سارة الأحمد' }], submitted: [] },
      'admin.submissions': { success: true, submissions: [{ id: 's1' }, { id: 's2' }] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(BASE + hash);
  await page.reload();
}

test('لكل شاشة رابط: التحديث يبقيك فيها، وزر الرجوع يعيد السابقة', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /تطبيق القادة/ }).click();
  await page.getByText('سارة الأحمد').first().click();
  await expect(page).toHaveURL(/#\/leaders\/participants\/p1$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/leaders$/);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
});

test('رابط مباشر إلى تبويب يفتحه من أول تحميل', async ({ page }) => {
  await setup(page, '#/leaders/handbook');
  await expect(page.getByRole('heading', { name: 'كتاب القائد' })).toBeVisible();
});

test('أعداد ما ينتظر القرار على السياقات والتبويبات', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: /طلبات التواصل/ }).locator('.ctx-badge')).toHaveText('1');
  await expect(page.getByRole('button', { name: /تطبيق القادة/ }).locator('.ctx-badge')).toHaveText('3');
  await page.getByRole('button', { name: /تطبيق القادة/ }).click();
  const tabs = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  await expect(tabs.getByRole('button', { name: /المشاركون/ }).locator('.la-badge')).toHaveText('1');
  await expect(tabs.getByRole('button', { name: /كتيب القائد/ }).locator('.la-badge')).toHaveText('2');
  await tabs.getByRole('button', { name: 'نظرة عامة' }).click();
  await expect(page.getByRole('link', { name: 'طلبات تواصل جديدة' })).toBeVisible();
});

test('المحرر يحمي التعديل: تأكيد قبل الإغلاق، ومسودة تُستعاد', async ({ page }) => {
  await setup(page, '#/leaders/handbook');
  await page.getByRole('button', { name: /^المعلم/ }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير الباب: المعلم' });
  await ed.getByLabel('محتوى الباب').fill('نص معدّل لم يُحفظ');
  await page.waitForTimeout(800);
  await ed.getByRole('button', { name: 'إغلاق' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(ed).toBeHidden();
  await page.getByRole('button', { name: /^المعلم/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'استعادة المسودة' }).click();
  await expect(page.getByLabel('محتوى الباب')).toHaveValue('نص معدّل لم يُحفظ');
});
