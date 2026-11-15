// نموذج الدفعة: أسماء البنود مقروءة (P2)، وسطر عقد الجهة والسعة التشغيلية المطوية (P3)، وسؤال نقل المشاركين بعددهم (P1).
// الخلفية مُحاكاة. PROG_SHOTS: مجلد تُحفظ فيه لقطات النموذج والسؤال بعرضي 1440 و390.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.PROG_SHOTS || '';
const programs = [
  { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [] },
  { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 4, versions: [] },
];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', status: 'running', delivery: {}, enrolled: 0 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', status: 'running', starts_on: '2026-09-01', delivery: {}, capacity: null, enrolled: 0, members: 31 },
  { id: 'c2', name: 'أفراد الربيع', organization_id: null, program_id: 'pa', status: 'planned', delivery: {}, capacity: 25, enrolled: 3 },
  // دفعة قديمة حُفظ إخفاؤها الكاسر قبل الحارس: تحريرها لا ينبه بمنع حفظ لم يتغير
  { id: 'c3', name: 'دفعة قديمة', organization_id: null, program_id: 'pa', status: 'running', delivery: {}, capacity: 10, enrolled: 2, hidden_requirements: ['T-ATTEND'] },
];
const organizations = [
  { id: 'o1', name: 'جمعية سفراء', status: 'active', invite_code: 'sufara', seats: 50, seats_used: 31, contract_ends: '2027-06-30', auto_cohort: { id: 'c1', name: 'سفراء 2026', via: 'organization' } },
  { id: 'o2', name: 'منظومة', status: 'active', seats: null, seats_used: 4, auto_cohort: { id: 'c0', name: 'الدفعة المفتوحة', via: 'default' } },
];
const reqs = [
  { id: 'r1', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', kind: 'workshop', active: true, required: true, stage_key: 's1', stage_title_ar: 'التأسيس', config: { sessions_required: 3, verify: 'qr' } },
  { id: 'r2', code: 'O-SESS', title_ar: 'جلسات التوجيه ({sessions:O-SESS})', kind: 'coaching', active: true, required: true, stage_key: 's2', stage_title_ar: 'التطبيق', config: { sessions_required: 4, mode: 'online' } },
  { id: 'r3', code: 'R-A', title_ar: 'تأمل', kind: 'check', active: true, required: false, stage_key: 's1', stage_title_ar: 'التأسيس' },
  { id: 'r4', code: 'R-B', title_ar: 'تأمل', kind: 'check', active: true, required: false, stage_key: 's2', stage_title_ar: 'التطبيق' },
];

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations },
      'admin.program': { success: true, program: programs[0], stages: [], requirements: reqs },
      'admin.cohort-definition': { success: true, program_id: 'pa', version: null, stages: [], requirements: reqs, hidden: [] },
      // دفعة جهة على برنامج آخر: الخادم يرفض بعدد المتأثرين حتى يصله التأكيد
      'admin.cohort-save': b.confirm_move || b.program_id !== 'pb' ? { success: true, cohort: { id: 'c9', name: b.name } }
        : { success: false, code: 'confirm_move', message: 'ينقل', affected: 7, from: [{ id: 'c1', name: 'سفراء 2026' }], to: [{ id: 'c2', name: 'أفراد الربيع' }] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png`, fullPage: false }); };

for (const width of [1440, 390]) {
  test(`نموذج دفعة الجهة: أسماء مقروءة وسطر العقد والسعة المطوية (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const calls = await setup(page);
    await page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' }).getByRole('button', { name: 'تحرير' }).click();
    const form = page.getByRole('dialog', { name: 'دفعة: سفراء 2026' });
    // الرموز محوَّلة والمرحلة تميز العنوانين المتطابقين، بلا الرمز الداخلي
    const hidden = form.getByRole('group', { name: 'بنود مخفية من رحلة هذه الدفعة' });
    await expect(hidden.getByText('جلسات التوجيه (أربع جلسات) (التطبيق)', { exact: true })).toBeVisible();
    await expect(hidden.getByText('تأمل (التأسيس)', { exact: true })).toBeVisible();
    await expect(hidden.getByText('تأمل (التطبيق)', { exact: true })).toBeVisible();
    await expect(form.getByLabel('جلسات التوجيه (أربع جلسات) (التطبيق): طريقة الجلسة')).toBeVisible();
    await expect(form).not.toContainText(/\{[a-z]+:|O-SESS|T-ATTEND/);
    // سطر العقد من الجهة، والسعة مطوية
    await expect(form).toContainText('عقد الجهة: 50 مقعدًا، المستهلك 31 من العقد كله، ينتهي \u20662027-06-30\u2069. أعضاء الجهة الجدد يدخلون الآن تلقائيًا دفعة «سفراء 2026».');
    await expect(form.getByLabel('سعة تشغيلية (اختياري)')).toHaveCount(0);
    await form.getByLabel('الجهة').scrollIntoViewIfNeeded();
    await shot(page, 'cohort-form-contract');
    await form.getByLabel('حدد سعة تشغيلية لهذه الدفعة (اختياري)').check();
    await form.getByLabel('سعة تشغيلية (اختياري)').fill('60');
    await expect(form).toContainText('تتجاوز مقاعد عقد الجهة (50)');
    await form.getByLabel('سعة تشغيلية (اختياري)').scrollIntoViewIfNeeded();
    await shot(page, 'cohort-form-capacity');
    // الإخفاء الكاسر يُنبَّه إليه قبل الحفظ
    await hidden.getByText('حضور الأيام التدريبية (ثلاثة أيام) (التأسيس)', { exact: true }).click();
    await expect(hidden).toContainText('لن يُحفظ: إخفاء هذه البنود يترك مرحلة «التأسيس»');
    await hidden.scrollIntoViewIfNeeded();
    await shot(page, 'cohort-form-names');
    await hidden.getByText('حضور الأيام التدريبية (ثلاثة أيام) (التأسيس)', { exact: true }).click();
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c1', capacity: 60 });
    expect(calls.find((c) => c.action === 'admin.cohort-save')).not.toHaveProperty('capacity_on');
  });

  test(`دفعة جهة على برنامج آخر: سؤال بعدد المتأثرين ثم التأكيد (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const calls = await setup(page);
    await page.locator('.data-table tbody tr', { hasText: 'أفراد الربيع' }).getByRole('button', { name: 'تحرير' }).click();
    const form = page.getByRole('dialog', { name: 'دفعة: أفراد الربيع' });
    // دفعة الأفراد: حقل المقاعد العادي ظاهر بلا سطر عقد
    await expect(form.getByLabel('المقاعد')).toHaveValue('25');
    await expect(form).not.toContainText('عقد الجهة');
    await form.locator('#f-organization_id').selectOption('o1');
    await form.locator('#f-program_id').selectOption('pb');
    await form.locator('#f-status').selectOption('open');
    await form.getByRole('button', { name: 'حفظ' }).click();
    const ask = page.getByRole('alertdialog');
    // العدد بصيغته العربية الصحيحة، ومن أين وإلى أين
    await expect(ask).toContainText('بهذا الحفظ ينتقل تلقائيًا 7 مشاركين من «سفراء 2026» إلى «أفراد الربيع» على برنامج آخر');
    await shot(page, 'confirm-move');
    await ask.getByRole('button', { name: 'احفظ وانقلهم' }).click();
    await expect.poll(() => calls.filter((c) => c.action === 'admin.cohort-save').length).toBe(2);
    expect(calls.filter((c) => c.action === 'admin.cohort-save')[1]).toMatchObject({ id: 'c2', organization_id: 'o1', program_id: 'pb', confirm_move: true });
    expect(calls.filter((c) => c.action === 'admin.cohort-save')[0]).not.toHaveProperty('confirm_move');
  });
}

test('رفض النقل يبقي الدفعة بلا حفظ ويقول لماذا', async ({ page }) => {
  const calls = await setup(page);
  await page.locator('.data-table tbody tr', { hasText: 'أفراد الربيع' }).getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: أفراد الربيع' });
  await form.locator('#f-organization_id').selectOption('o1');
  await form.locator('#f-program_id').selectOption('pb');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /إلغاء|تراجع/ }).click();
  await expect(form.getByRole('alert')).toContainText('لم يُؤكَّد نقل المشاركين');
  expect(calls.filter((c) => c.action === 'admin.cohort-save').length).toBe(1);
});

test('إخفاء كاسر محفوظ قبل فتح النموذج لا يُنبَّه إليه بمنع الحفظ، وكسر جديد يُنبَّه إليه', async ({ page }) => {
  const calls = await setup(page);
  await page.locator('.data-table tbody tr', { hasText: 'دفعة قديمة' }).getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: دفعة قديمة' });
  const hidden = form.getByRole('group', { name: 'بنود مخفية من رحلة هذه الدفعة' });
  await expect(hidden.getByLabel('حضور الأيام التدريبية (ثلاثة أيام) (التأسيس)')).toBeChecked();
  await expect(hidden).not.toContainText('لن يُحفظ');
  await hidden.getByText('جلسات التوجيه (أربع جلسات) (التطبيق)', { exact: true }).click();
  await expect(hidden).toContainText('لن يُحفظ: إخفاء هذه البنود يترك مرحلة «التطبيق»');
  await hidden.getByText('جلسات التوجيه (أربع جلسات) (التطبيق)', { exact: true }).click();
  await form.getByLabel('اسم الدفعة').fill('دفعة قديمة معدلة');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c3', name: 'دفعة قديمة معدلة', hidden_requirements: ['T-ATTEND'] });
  expect(calls.find((c) => c.action === 'admin.cohort-save')).not.toHaveProperty('hidden_before');
});
