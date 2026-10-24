// لوحة الإدارة الجديدة: استوديو كتاب القائد (الخطوة ٥). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ch = { id: 'h1', dimension: 'milestone', sort: 1, title_ar: 'المعلم', min_level: 'beginner', body_md: '## المفهوم\nنص للجميع\n:::min=advanced\nفقرة الاحترافي\n:::', reflection_ar: 'ما معلمك؟', quiz_md: 'س: ما المعلم؟\n- تاريخ\n* نقطة قرار\nلماذا: لأنه قرار' };
const model = { id: 'm1', dimension: 'impact', sort: 1, title_ar: 'سجل المنافع', icon: '◆', points: 30, active: true, min_level: 'beginner', fields: [{ key: 'project', label: 'اسم المشروع', type: 'text', required: true }] };
const catalog = {
  success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [],
  tracks: [{ key: 'M1I1L1', title_ar: 'مسار التأسيس', milestone_level: 'beginner' }], track_stats: {},
  handbook_modules: [ch, { ...ch, id: 'h2', sort: 2, title_ar: 'الأنواع', quiz_md: '' }], learning_models: [model],
  book_stats: { chapters: { h1: { done: 4, score: 6, total: 8 } }, models: { m1: { submitted: 1, reviewed: 2, rating: 9, rated: 2 } }, points: { participants: 5, avg: 40 }, to_review: 1 },
};
const submission = { id: 's1', status: 'submitted', submitted_at: '2026-10-20', answers: { project: 'منصة التعلم' }, participants: { full_name: 'سارة الأحمد', job_title: 'مديرة' }, learning_models: model };

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.catalog': catalog,
      'admin.book-preview': { success: true, levels: { milestone: 'beginner', impact: 'beginner', leadership: 'beginner' }, chapters: [{ id: 'h1', dimension: 'milestone', min_level: 'beginner', title: 'المعلم', md: '## المفهوم\nنص للجميع', reflection: 'ما معلمك؟', quiz: [{ q: 'ما المعلم؟', options: ['تاريخ', 'نقطة قرار'], answer: 1, why: '' }] }], models: [model] },
      'admin.submissions': { success: true, submissions: [submission] }, 'admin.submission': { success: true, submission },
      'admin.save': { success: true }, 'admin.reorder': { success: true }, 'admin.delete': { success: true }, 'admin.review-submission': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'كتيب القائد' }).click();
  return calls;
}

test('الأبواب: معاينة بحسب المستوى، وأداة المحرر، والاختبار، والحفظ', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.getByText('اختبار 1 أسئلة')).toBeVisible();
  await page.getByRole('button', { name: /^المعلم/ }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير الباب: المعلم' });
  await expect(ed.locator('.la-md')).not.toContainText('فقرة الاحترافي');
  await ed.getByRole('button', { name: 'احترافي', exact: true }).click();
  await expect(ed.locator('.la-md')).toContainText('فقرة الاحترافي');
  await ed.getByLabel('محتوى الباب').press('Control+End');
  await ed.getByRole('button', { name: 'خلاصة' }).click();
  await expect(ed.getByLabel('محتوى الباب')).toHaveValue(/\n> :::$/);
  await ed.getByRole('button', { name: /التأمل والاختبار/ }).click();
  await expect(ed.getByText('أقصى نقاط الباب: 20')).toBeVisible();
  await ed.getByRole('button', { name: '+ سؤال' }).click();
  await expect(ed.getByText('أقصى نقاط الباب: 25')).toBeVisible();
  await ed.getByRole('button', { name: 'حفظ الباب' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'handbook_modules', row: { id: 'h1', title_ar: 'المعلم', reflection_ar: 'ما معلمك؟' } });
  expect(calls.find((c) => c.action === 'admin.save').row.quiz_md).toContain('الخيار الصحيح');
});

test('باب جديد يُرتَّب آخر إطاره ويُطلب عنوانه', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '+ باب جديد' }).first().click();
  const ed = page.getByRole('dialog', { name: 'باب جديد' });
  await ed.getByRole('button', { name: 'حفظ الباب' }).click();
  await expect(ed.getByRole('alert')).toHaveText('عنوان الباب مطلوب');
  await ed.getByLabel('عنوان الباب').fill('باب ثالث');
  await ed.getByRole('button', { name: 'حفظ الباب' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({ title_ar: 'باب ثالث', dimension: 'milestone', sort: 3 });
});

test('النماذج: إضافة حقل جدول ومعاينته، ثم الحفظ', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('navigation', { name: 'أقسام الكتاب' }).getByRole('button', { name: 'النماذج التعليمية' }).click();
  await expect(page.getByText('4.5★', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'تحرير', exact: true }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير النموذج: سجل المنافع' });
  await ed.getByRole('button', { name: '+ حقل' }).click();
  await ed.getByLabel('نوع الحقل 2').selectOption('table');
  await ed.getByLabel('أعمدة الحقل 2').fill('المنفعة، المؤشر');
  await expect(ed.locator('.mp-table th')).toHaveText(['#', 'المنفعة', 'المؤشر']);
  await ed.getByRole('button', { name: 'حفظ النموذج' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row.fields?.[1]).toMatchObject({ type: 'table', columns: ['المنفعة', 'المؤشر'] });
});

test('المعاينة كمشارك، والتقييم بالنجوم والملاحظات', async ({ page }) => {
  const calls = await setup(page);
  const views = page.getByRole('navigation', { name: 'أقسام الكتاب' });
  await views.getByRole('button', { name: 'كما يراه المشارك' }).click();
  await expect(page.getByText('الإجابة الصحيحة')).toBeVisible();
  await expect(page.getByText('أقصى نقاط هذا الباب: 20')).toBeVisible();
  await views.getByRole('button', { name: /التقييم/ }).click();
  await page.getByRole('button', { name: 'قيّم' }).click();
  const ed = page.getByRole('dialog', { name: 'تقييم عمل سارة الأحمد' });
  await expect(ed.getByText('منصة التعلم')).toBeVisible();
  await ed.getByRole('button', { name: 'إعادة للتطوير مع الملاحظات' }).click();
  await expect(ed.getByRole('alert')).toContainText('اكتب ملاحظاتك');
  await ed.locator('.sub-stars label').nth(3).click();
  await expect(ed.locator('.sub-stars label.on')).toHaveCount(4);
  await ed.getByLabel('ملاحظاتك للمشارك').fill('عمل متقن');
  await ed.getByRole('button', { name: 'اعتماد التقييم' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review-submission')).toMatchObject({ id: 's1', status: 'reviewed', rating: 4, feedback: 'عمل متقن' });
});
