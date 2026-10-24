// لوحة الإدارة: البرامج ونسخها والدفعات. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/next/';
const versions = [
  { id: 'v2', program_id: 'pa', number: 2, label: 'بعد مراجعة أكتوبر', created_at: '2026-10-20', created_by: 'a@x' },
  { id: 'v1', program_id: 'pa', number: 1, label: 'الإطلاق', created_at: '2026-09-01' },
];
const programs = [
  { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 35, versions },
  { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 30, versions: [] },
];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', delivery: {}, enrolled: 0 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-02-01', delivery: { 'T-ATTEND': { verify: 'join' } }, enrolled: 12 },
];
const reqs = [
  { id: 'r1', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية', kind: 'workshop', active: true, config: { sessions_required: 4, verify: 'qr' } },
  { id: 'r2', code: 'O-SESS', title_ar: 'جلسات التوجيه', kind: 'coaching', active: true, config: { sessions_required: 2, mode: 'online' } },
  { id: 'r3', code: 'T-HB', title_ar: 'قراءة الكتيب', kind: 'reading', active: true, config: {} },
];

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'جمعية سفراء', stats: {} }], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [{ id: 'o1', name: 'جمعية سفراء' }, { id: 'o2', name: 'منظومة' }] },
      'admin.program': { success: true, program: programs[0], stages: [], requirements: reqs },
      'admin.program-version': { success: true, version: { id: 'v3', number: 3 } },
      'admin.program-compare': { success: true, version: { number: 1, label: 'الإطلاق' }, diff: { added: [{ code: 'T-VID', title: 'فيديو التمهيد' }], removed: [], changed: [{ code: 'T-ATTEND', title: 'حضور الأيام التدريبية' }] } },
      'admin.program-restore': { success: true, restored: 1, backup: { number: 3 } },
      'admin.program-save': { success: true, program: { id: 'pc' } },
      'admin.cohort-save': { success: true, cohort: { id: 'c2' } },
      'admin.cohort-upgrade': b.confirm ? { success: true, to: { number: 2 }, diff: { added: [], removed: [], changed: [] } }
        : { success: true, preview: true, to: { number: 2, label: 'بعد مراجعة أكتوبر' }, diff: { added: [{ code: 'T-VID', title: 'فيديو التمهيد' }], removed: [], changed: [] } },
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

test('البرامج: حفظ نسخة، المقارنة، الاسترجاع، والتكرار', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.getByText('برنامج سفراء')).toBeVisible();
  await expect(page.getByText(/آخر نسخة محفوظة: 2، بعد مراجعة أكتوبر/)).toBeVisible();

  await page.getByRole('button', { name: 'احفظ نسخة' }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('قبل دفعة سفراء');
  await page.getByRole('dialog').getByRole('button', { name: /موافق|تأكيد|حفظ/ }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-version')).toMatchObject({ id: 'pa', label: 'قبل دفعة سفراء' });

  await page.getByRole('button', { name: 'النسخ (2)' }).click();
  await page.getByRole('button', { name: 'قارن بالحالي' }).last().click();
  await expect(page.getByText(/أُضيف: T-VID فيديو التمهيد/)).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق' }).click();

  await page.getByRole('button', { name: 'استرجع' }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-restore')?.version_id).toBe('v1');
  await expect(page.getByText(/استُرجعت النسخة 1، وحُفظ ما قبلها باسم النسخة 3/)).toBeVisible();
});

test('الدفعات: طريقة التنفيذ لكل نشاط، والترقية بعد عرض الفرق', async ({ page }) => {
  const calls = await setup(page);
  const row = page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' });
  await expect(row).toContainText('جمعية سفراء');
  await expect(row).toContainText('النسخة 1');

  await row.getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: سفراء 2026' });
  await expect(form.getByLabel('T-ATTEND · حضور الأيام التدريبية: توثيق الحضور')).toHaveValue('join');
  await form.getByLabel('O-SESS · جلسات التوجيه: طريقة الجلسة').selectOption('in_person');
  await form.getByLabel('O-SESS · جلسات التوجيه: المكان').fill('مقر الجمعية');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({
    id: 'c1', organization_id: 'o1', program_version_id: 'v1',
    delivery: { 'T-ATTEND': { verify: 'join' }, 'O-SESS': { mode: 'in_person', location_ar: 'مقر الجمعية' } },
  });

  await row.getByRole('button', { name: 'رقِّ إلى 2' }).click();
  await expect(page.getByText('ترقية «سفراء 2026» إلى النسخة 2')).toBeVisible();
  await expect(page.getByText(/أُضيف: T-VID/)).toBeVisible();
  await page.getByRole('button', { name: 'رقِّ الدفعة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-upgrade' && c.confirm)?.id).toBe('c1');
});

test('الدفعة المفتوحة لا ترتبط بجهة ولا تُغلق', async ({ page }) => {
  await setup(page);
  await page.locator('.data-table tbody tr', { hasText: 'الدفعة المفتوحة' }).getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: الدفعة المفتوحة' });
  await expect(form.getByLabel('الجهة')).toHaveCount(0);
  await expect(form.getByLabel('الحالة').locator('option')).toHaveCount(2);
});
