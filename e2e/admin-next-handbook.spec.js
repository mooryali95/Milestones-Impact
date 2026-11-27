// لوحة الإدارة الجديدة: استوديو كتاب القائد (الخطوة ٥). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ch = { id: 'h1', dimension: 'milestone', sort: 1, title_ar: 'المعلم', min_level: 'beginner', body_md: '## المفهوم\nنص للجميع\n:::min=advanced\nفقرة الاحترافي\n:::', reflection_ar: 'ما معلمك؟', quiz_md: 'س: ما المعلم؟\n- تاريخ\n* نقطة قرار\nلماذا: لأنه قرار' };
const model = { id: 'm1', dimension: 'impact', sort: 1, title_ar: 'سجل المنافع', icon: '◆', points: 30, active: true, min_level: 'beginner', fields: [{ key: 'project', label: 'اسم المشروع', type: 'text', required: true }] };
const catalog = {
  success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [],
  tracks: [{ key: 'M1I1L1', title_ar: 'مسار التأسيس', milestone_level: 'beginner' }], track_stats: {},
  handbook_modules: [ch, { ...ch, id: 'h2', sort: 2, title_ar: 'الأنواع', quiz_md: '' }], learning_models: [model],
  book_stats: { chapters: { h1: { done: 4, score: 6, total: 8 } }, models: { m1: { submitted: 1, reviewed: 2, rating: 7, rated: 2 } }, points: { participants: 5, avg: 40 }, to_review: 1 },
};
const submission = { id: 's1', participant_id: 'p1', status: 'submitted', submitted_at: '2026-10-20', answers: { project: 'منصة التعلم' }, participants: { full_name: 'سارة الأحمد', job_title: 'مديرة' }, learning_models: model };

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
      'admin.save': { success: true }, 'admin.book-proposal-edit': { success: true, count: 1, sections: ['المفهوم'], status: 'review' }, 'admin.reorder': { success: true }, 'admin.delete': { success: true }, 'admin.review-submission': { success: true }, 'admin.review-bulk': { success: true, marked: 1 },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'كتاب القائد' }).click();
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
  // الخلاصة على سطر نصي (على سطر ::: تكسر الكتلة فيمنع المحرر الحفظ، وهذا مقصود)
  const body = ed.getByLabel('محتوى الباب');
  await body.evaluate((t) => { const i = t.value.indexOf('نص للجميع'); t.focus(); t.setSelectionRange(i, i); });
  await ed.getByRole('button', { name: 'خلاصة' }).click();
  await expect(body).toHaveValue(/\n> نص للجميع\n/);
  // D01: الاختبار والمستوى محتوى مُقاس من المستودع، فيُعرضان للقراءة ولا يُرسلان مع الحفظ
  await ed.getByRole('button', { name: /التأمل والاختبار/ }).click();
  await expect(ed.getByText('أقصى نقاط الباب: 28')).toBeVisible();
  await expect(ed.getByRole('button', { name: '+ سؤال' })).toHaveCount(0);
  await expect(ed.getByLabel('أسئلة الاختبار')).toHaveAttribute('readonly', '');
  await expect(ed.getByRole('note').filter({ hasText: 'يُعدَّل من المستودع' })).toBeVisible();
  await expect(ed.getByRole('note').filter({ hasText: 'يُرسل مقترحًا لكل قسم تغيّر' })).toBeVisible();
  // المرحلة 4 (الخطوة 3): تعديل المتن يُرسل مقترحًا بسبب مكتوب، لا حفظًا حيًا
  await ed.getByRole('button', { name: 'اعرض التعديل على اللجنة' }).click();
  await expect(ed.getByRole('alert')).toContainText('سبب التعديل');
  await ed.getByLabel('سبب التعديل').fill('خلاصة توضح الفكرة للمبتدئ');
  await ed.getByRole('button', { name: 'اعرض التعديل على اللجنة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.book-proposal-edit')).toMatchObject({ module_id: 'h1', reason: 'خلاصة توضح الفكرة للمبتدئ', submit: true });
  const p = calls.find((c) => c.action === 'admin.book-proposal-edit');
  expect(p.body_md).toMatch(/\n> نص للجميع\n/);
  expect(p).not.toHaveProperty('quiz_md');
  expect(calls.find((c) => c.action === 'admin.save')).toBeUndefined();
});

test('العنوان وحده يُحفظ مباشرة بلا مقترح', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: /^المعلم/ }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير الباب: المعلم' });
  await ed.getByLabel('عنوان الباب').fill('المعلم نقطة قرار');
  await ed.getByRole('button', { name: 'حفظ العنوان' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'handbook_modules', row: { id: 'h1', title_ar: 'المعلم نقطة قرار' } });
  expect(Object.keys(calls.find((c) => c.action === 'admin.save').row)).toEqual(['id', 'title_ar']);
  expect(calls.find((c) => c.action === 'admin.book-proposal-edit')).toBeUndefined();
});

test('الأبواب الجديدة وحذفها من المستودع: لا زر باب جديد ولا حذف في اللوحة', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: /^المعلم/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ باب جديد' })).toHaveCount(0);
  await expect(page.locator('.hb-list .hb-del')).toHaveCount(0);
  await page.getByRole('button', { name: /^المعلم/ }).click();
  await expect(page.getByRole('dialog', { name: 'تحرير الباب: المعلم' }).getByRole('button', { name: 'حذف' })).toHaveCount(0);
});

test('النماذج: إضافة حقل جدول ومعاينته، ثم الحفظ', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('tablist', { name: 'أقسام الكتاب' }).getByRole('tab', { name: 'النماذج التعليمية' }).click();
  await expect(page.getByText('متوسط 3.5 من 4', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'تحرير', exact: true }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير النموذج: سجل المنافع' });
  await ed.getByRole('button', { name: '+ حقل' }).click();
  await ed.getByLabel('نوع الحقل 2').selectOption('table');
  await ed.getByLabel('أعمدة الحقل 2').fill('المنفعة، المؤشر');
  await expect(ed.locator('.mp-table th')).toHaveText(['#', 'المنفعة', 'المؤشر']);
  await ed.getByRole('button', { name: 'حفظ النموذج' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row.fields?.[1]).toMatchObject({ type: 'table', columns: ['المنفعة', 'المؤشر'] });
});

test('المعاينة كمشارك، والتقييم بالسلّم الرباعي والملاحظات', async ({ page }) => {
  const calls = await setup(page);
  const views = page.getByRole('tablist', { name: 'أقسام الكتاب' });
  await views.getByRole('tab', { name: /الكتاب الأم والكتب/ }).click();
  await expect(page.getByText('الإجابة الصحيحة')).toBeVisible();
  await expect(page.getByText('أقصى نقاط هذا الباب: 28')).toBeVisible();
  await views.getByRole('tab', { name: /التقييم/ }).click();
  await page.getByRole('button', { name: 'قيّم' }).click();
  const ed = page.getByRole('dialog', { name: 'تقييم عمل سارة الأحمد' });
  await expect(ed.getByText('منصة التعلم')).toBeVisible();
  // نموذج عادي («بوابتان، والباقي ملاحظات»): ملاحظة أو «يحتاج تعديلًا»، والتعديل يطلب ملاحظة تسمّي ما ينقص
  await ed.getByRole('button', { name: 'يحتاج تعديلًا' }).click();
  await expect(ed.getByRole('alert')).toContainText('اكتب ملاحظاتك');
  // D08: أربعة خيارات بأسمائها ومراسيها بدل النجوم الخمس
  await expect(ed.locator('.sub-scale label')).toHaveText([/دون المطلوب/, /مقبول/, /متقن/, /متميز/]);
  await expect(ed.getByRole('radio', { name: /متميز/ })).toHaveCount(1);
  await ed.locator('.sub-scale label').filter({ hasText: 'متميز' }).click();
  await expect(ed.locator('.sub-scale label.on')).toHaveText(/متميز/);
  await ed.getByLabel('ملاحظتك للمشارك (اختيارية)').fill('عمل متقن');
  await ed.getByRole('button', { name: 'حفظ الملاحظة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review-submission')).toMatchObject({ id: 's1', status: 'reviewed', rating: 4, feedback: 'عمل متقن' });
});

test('«للقراءة»: ما سُلّم مجمّعًا بالمشارك، و«قرأتها كلها» يعلّمه مقروءًا بأمر واحد', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('tablist', { name: 'أقسام الكتاب' }).getByRole('tab', { name: /التقييم/ }).click();
  const list = page.getByRole('region', { name: 'للقراءة' });
  await expect(list).toContainText('سارة الأحمد');
  await list.getByRole('button', { name: 'قرأتها كلها' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review-bulk')).toMatchObject({ participant_id: 'p1' });
});

test('المرحلة 18: الترويسة الموحدة، وشارة الجاهزية، ونقل الباب بالزر وبـAlt مع السهم', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.getByRole('heading', { name: 'كتاب القائد', level: 2 })).toBeVisible();
  await expect(page.locator('.tx-hero')).toHaveCount(0);
  const rows = page.locator('.hb-list').first().locator('.hb-ch');
  await expect(rows.nth(0).locator('.st-chip')).toHaveText('جاهز');
  await expect(rows.nth(1).locator('.st-chip')).toHaveText('بلا اختبار');
  const down = rows.nth(0).getByRole('button', { name: 'انقل الباب المعلم لأسفل' });
  await expect(down).toHaveAttribute('title', 'انقل الباب المعلم لأسفل');
  await down.click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.reorder')).toMatchObject({ entity: 'handbook_modules', ids: ['h2', 'h1'] });
  await expect(rows.nth(0).locator('[aria-live="polite"]')).toHaveText('الباب المعلم صار في الموضع 2 من 2');
  calls.length = 0;
  await rows.nth(1).getByRole('button', { name: /^الأنواع/ }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => calls.find((c) => c.action === 'admin.reorder')).toMatchObject({ ids: ['h2', 'h1'] });
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Milestones-Impact/12f93216-ad9b-5931-8b46-7212b8ad3743/scratchpad/shots/p18-handbook-1280.png', fullPage: false }).catch(() => {});
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: '/tmp/claude-0/-home-user-Milestones-Impact/12f93216-ad9b-5931-8b46-7212b8ad3743/scratchpad/shots/p18-handbook-375.png', fullPage: false }).catch(() => {});
});
