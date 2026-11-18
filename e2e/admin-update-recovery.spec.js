// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 1، في لوحة الإدارة: لوحة فُتحت قبل النشر ثم طلبت قسمًا لم تزره،
// وملفه حذفه النشر. الوحدة المشتركة (shared/ui/lazy-retry.js) تعيد المحاولة ثم تعيد الصفحة مرة واحدة، والعنوان (#) يحفظ القسم.
// (تطبيق القادة في leaders-update-recovery.spec.js.) الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';

test('اللوحة: ملف قسم حذفه النشر يعود إلى القسم نفسه بإعادة تحميل واحدة بلا شاشة خطأ', async ({ page }) => {
  const state = { docs: 0, blocked: 0 };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, by_tab: {}, items: [] },
      'admin.programs': { success: true, programs: [], cohorts: [] },
    };
    return r.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(`${ADMIN}#/leaders/participants`);
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  await expect(nav.getByRole('button', { name: /المشاركون/ })).toHaveAttribute('aria-current', 'page');
  // من هنا «الصفحة المفتوحة قبل النشر»: ملف الجهات غائب حتى تُعاد الصفحة
  const opened = state.docs;
  await page.route(/\/assets\/Orgs-[\w-]+\.js$/, (r) => {
    if (state.docs <= opened) { state.blocked += 1; return r.fulfill({ status: 404, contentType: 'text/html', body: 'not found' }); }
    return r.continue();
  });
  await nav.getByRole('button', { name: /الجهات/ }).click();
  await expect(nav.getByRole('button', { name: /الجهات/ })).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => state.docs).toBe(opened + 1);
  expect(state.blocked).toBeGreaterThanOrEqual(1);
  expect(new URL(page.url()).hash).toBe('#/leaders/orgs');
  await expect(page.getByText(/تعذّر عرض|صدر تحديث/)).toHaveCount(0);
});
