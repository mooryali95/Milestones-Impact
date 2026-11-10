// تنقل لوحة الإدارة: مجموعات تُطوى ويبقى عدد ما ينتظر على عنوانها، ومجموعة القسم المفتوح لا تُطوى.
// والقاعة الحية بلا دفعة مختارة تعرض الدفعات أزرارًا بدل قائمة منسدلة في صفحة فارغة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
async function open(page, hash, cohorts) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [{ id: 's1' }, { id: 's2' }] },
      'admin.programs': { success: true, programs: [], cohorts },
    };
    return route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(BASE + hash);
  await page.reload();
  return page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
}

test('مجموعة تُطوى ويبقى عددها، وتُحفظ بعد إعادة التحميل، ومجموعة القسم المفتوح لا تُطوى', async ({ page }) => {
  const nav = await open(page, '#/leaders/participants', []);
  const content = nav.getByRole('button', { name: 'مجموعة المحتوى' });
  await expect(nav.getByRole('button', { name: /كتيب القائد/ })).toBeVisible();
  await content.click();
  await expect(nav.getByRole('button', { name: /كتيب القائد/ })).toBeHidden();
  await expect(content).toHaveAttribute('aria-expanded', 'false');
  await expect(content.locator('.la-badge')).toHaveText('2');
  await page.reload();
  await expect(nav.getByRole('button', { name: /كتيب القائد/ })).toBeHidden();
  // مجموعة القسم المفتوح: الضغط على عنوانها لا يخفي القسم الذي أنت فيه
  await nav.getByRole('button', { name: 'مجموعة اليومي' }).click();
  await expect(nav.getByRole('button', { name: /المشاركون/ })).toBeVisible();
});

test('القاعة الحية بلا دفعة مختارة: شرح وأزرار الدفعات، والاختيار يفتح اللوحة', async ({ page }) => {
  await open(page, '#/leaders/hall', [{ id: 'c1', name: 'دفعة نوفمبر', status: 'running' }, { id: 'c2', name: 'دفعة العرض', status: 'open' }]);
  const pick = page.getByRole('region', { name: 'القاعة الحية' });
  await expect(pick).toContainText('اختر الدفعة التي تدير قاعتها');
  await pick.getByRole('button', { name: 'دفعة نوفمبر' }).click();
  await expect(page.getByLabel('الدفعة')).toHaveValue('c1');
});

test('القاعة الحية بدفعة واحدة مفتوحة تختارها وحدها', async ({ page }) => {
  await open(page, '#/leaders/hall', [{ id: 'c9', name: 'الدفعة الوحيدة', status: 'running' }]);
  await expect(page.getByLabel('الدفعة')).toHaveValue('c9');
});
