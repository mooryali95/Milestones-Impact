// المجموعات في لوحة الإدارة بخمسين مشاركًا: عدد المجموعات بحقل رقمي ومعاينة الحجم، وتوازن المستويات في كل مجموعة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const LV = ['beginner', 'intermediate', 'advanced'];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر 2026', program_id: 'pa', status: 'running', starts_on: '2026-11-01', ends_on: '2027-02-01', delivery: {}, enrolled: 50, stage_modes: {} }];
const members = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: `مشارك ${i}`, group_id: i < 12 ? (i < 6 ? 'g0' : 'g1') : null, levels: { milestone: LV[i % 3], impact: LV[i % 3], leadership: LV[i % 3] } }));
const groups = [{ id: 'g0', name: 'المجموعة 1' }, { id: 'g1', name: 'المجموعة 2' }];

test('المجموعات: عدد بحقل ومعاينة الحجم، وتوازن المستويات، والتوزيع الآلي يرسل العدد بعد تأكيد', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.programs': { success: true, programs: [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 35, versions: [] }], cohorts, organizations: [] },
      'admin.cohort-groups': { success: true, cohort: cohorts[0], members, groups, stages: [{ key: 'training', title_ar: 'التدريب' }] },
      'admin.cohort-groups-auto': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true, items: [], orgs: [], participants: [] } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).first().click();
  await page.getByRole('button', { name: /المجموعات/ }).first().click();
  const dlg = page.getByRole('dialog', { name: 'المجموعات ونمط العمل' });
  // الافتراضي نحو ستة في المجموعة: 50 ÷ 6 ≈ 8 مجموعات، والمعاينة تتبع الحقل
  const count = dlg.getByLabel('عدد المجموعات');
  await expect(count).toHaveValue('8');
  await expect(dlg).toContainText('نحو 7 في المجموعة');
  await count.fill('10');
  await expect(dlg).toContainText('نحو 5 في المجموعة');
  // توازن المستويات في كل مجموعة قائمة
  await expect(dlg.locator('.la-group').first()).toContainText('تأسيسي 2 · متوسط 2 · احترافي 2');
  await dlg.getByRole('button', { name: 'توزيع متنوع المستويات' }).click();
  await page.getByRole('button', { name: /متابعة|تأكيد|نعم/ }).last().click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-groups-auto')).toMatchObject({ count: 10, by: 'mixed' });
});
