// تصدير مبادرات الدفعة، المرحلة 1 (تصور 2026-11-27): «صدّر مبادراتها» من قائمة الدفعة لكل أدوار اللوحة، يطلب
// admin.cohort-export بمعرّف الدفعة، ويعرض العدد والتقسيم، وينزّل ملخص XLSX. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [] }];
const cohorts = [
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', status: 'running', starts_on: '2026-09-01', delivery: {}, enrolled: 0, members: 3 },
  { id: 'c2', name: 'أفراد الربيع', organization_id: null, program_id: 'pa', status: 'planned', delivery: {}, enrolled: 0, members: 0 },
];
const organizations = [{ id: 'o1', name: 'جمعية سفراء', status: 'active', seats: 50, seats_used: 3 }];
const rows = [
  { participant_id: 'p1', full_name: 'أحمد', organization: 'جمعية سفراء', initiative: 'رقمنة الأرشيف', sponsor: 'منى', readiness: 80, score: 4, approved_at: '2026-11-21' },
  { participant_id: 'p2', full_name: 'سارة', organization: 'جمعية سفراء', initiative: 'تسريع الخدمة', sponsor: 'د. خالد', readiness: 92, score: 4.5, approved_at: '2026-11-20' },
];

async function setup(page, role = 'admin') {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations },
      'admin.cohort-export': b.cohort_id === 'c1'
        ? { success: true, cohort: { id: 'c1', name: 'سفراء 2026' }, rows, volumes: [{ n: 1, from: 1, to: 2, count: 2, ids: ['p1', 'p2'] }] }
        : { success: true, cohort: { id: 'c2', name: 'أفراد الربيع' }, rows: [], volumes: [] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() })), role);
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const menuOf = (page, name) => page.locator('.data-table tbody tr', { hasText: name }).getByRole('button', { name: /^إجراءات أخرى للدفعة/ });
async function openExport(page, name) {
  await menuOf(page, name).click();
  await page.getByRole('menuitem', { name: 'صدّر مبادراتها' }).click();
  return page.getByRole('dialog', { name: `تصدير مبادرات ${name}` });
}

test('المدير: يعرض عدد المعتمد وينزّل ملخص الدفعة XLSX', async ({ page }) => {
  const calls = await setup(page);
  const dlg = await openExport(page, 'سفراء 2026');
  await expect(dlg.getByTestId('cohort-export-count')).toContainText('2');
  expect(calls.filter((c) => c.action === 'admin.cohort-export').map((c) => c.cohort_id)).toEqual(['c1']);
  await expect(dlg).toContainText('من غير بريد أو هاتف');
  await dlg.getByRole('button', { name: 'ملخص الدفعة (Excel)' }).click();
  // نافذة التصدير الموحدة نفسها (ExportButton.jsx) بأعمدة الملخص
  const xls = page.getByRole('dialog', { name: 'تصدير Excel' });
  await expect(xls).toContainText('عنوان المبادرة');
  await expect(xls).not.toContainText('البريد');
  const [file] = await Promise.all([page.waitForEvent('download'), xls.getByRole('button', { name: 'صدّر 2 مبادرة' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^Milestone-Impact_Cohort-Initiatives_\d{4}-\d{2}-\d{2}\.xlsx$/);
  await dlg.getByRole('button', { name: 'إغلاق' }).click();
  await expect(dlg).toBeHidden();
});

test('دفعة بلا معتمد: رسالة واضحة والزر معطل', async ({ page }) => {
  await setup(page);
  const dlg = await openExport(page, 'أفراد الربيع');
  await expect(dlg.getByTestId('cohort-export-empty')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'ملخص الدفعة (Excel)' })).toBeDisabled();
});

test('«عرض فقط»: القائمة فيها التصدير وحده', async ({ page }) => {
  await setup(page, 'viewer');
  await menuOf(page, 'سفراء 2026').click();
  await expect(page.getByRole('menu', { name: 'إجراءات أخرى للدفعة «سفراء 2026»' }).getByRole('menuitem')).toHaveText(['صدّر مبادراتها']);
});
