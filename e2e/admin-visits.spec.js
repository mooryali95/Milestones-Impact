// لوحة الإدارة: زيارات الموقع، وحالة النظام في النظرة العامة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const empty = { milestone: { beginner: 0, intermediate: 0, advanced: 0 }, impact: { beginner: 0, intermediate: 0, advanced: 0 }, leadership: { beginner: 0, intermediate: 0, advanced: 0 } };

async function setup(page, replies) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    await route.fulfill({ json: replies[b.action] ?? { success: true, orgs: [], participants: [], pending_approval: [], submitted: [], submissions: [] } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  return calls;
}

test('زيارات الموقع: الأرقام والصفحات والمصادر، وتغيير المدة يعيد الطلب', async ({ page }) => {
  const calls = await setup(page, {
    'admin.visits': {
      success: true, days: 30, site: null,
      daily: [{ day: '2026-10-24', views: 40, visits: 20 }, { day: '2026-10-25', views: 20, visits: 10 }],
      pages: [{ site: 'mi-home', path: '/leaders/', views: 30, visits: 18 }],
      referrers: [{ kind: 'referrer', label: 'google.com', visits: 12 }],
      devices: [{ kind: 'device', label: 'mobile', visits: 21 }, { kind: 'device', label: 'desktop', visits: 9 }],
    },
  });
  await page.goto(BASE + '#/visits');
  await page.reload();
  await expect(page.locator('.stat-value').first()).toHaveText('30');
  await expect(page.locator('.stat-value').nth(2)).toHaveText('2.0');
  await expect(page.getByRole('table', { name: 'أكثر الصفحات زيارة' })).toContainText('/leaders/');
  await expect(page.getByText('google.com')).toBeVisible();
  await expect(page.locator('.vs-list').last()).toContainText('جوال');
  await expect(page.locator('.vs-list').last()).toContainText('70%');
  await page.getByLabel('المدة').selectOption('7');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.visits').at(-1)?.days).toBe(7);
});

test('قبل تشغيل الترحيل: الشاشة تقول ما الذي يُشغَّل', async ({ page }) => {
  await setup(page, { 'admin.visits': { success: false, code: 'not_ready', message: 'جدول الزيارات غير موجود بعد. شغّل ترحيل 20261025200000_site_analytics.sql' } });
  await page.goto(BASE + '#/visits');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('20261025200000_site_analytics.sql');
});

test('حالة النظام في النظرة العامة: ترحيلات وأسرار ناقصة واقتراب البريد من السقف', async ({ page }) => {
  await setup(page, {
    'admin.overview': { success: true, total: 0, by_status: {}, pending_reviews: 0, matrix: empty },
    'admin.health': { success: true, missing_migrations: ['20261025200000_site_analytics'], missing_secrets: ['LEADERS_TURNSTILE_SECRET'], mail: { today: 70, cap: 80 } },
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  const note = page.getByRole('status').filter({ hasText: 'حالة النظام' });
  await expect(note).toContainText('20261025200000_site_analytics.sql');
  await expect(note).toContainText('LEADERS_TURNSTILE_SECRET');
  await expect(note).toContainText('70 من 80');
});

test('اتجاه البرنامج: هذا الأسبوع مقارنة بالماضي، والجدول من الأحدث', async ({ page }) => {
  const w = (week, joined, assessed, approved, active) => ({ week, joined, assessed, approved, active });
  await setup(page, {
    'admin.visits': { success: true, days: 30, site: null, daily: [], pages: [], referrers: [], devices: [] },
    'admin.trends': { success: true, weeks: [w('2026-10-11', 1, 0, 0, 2), w('2026-10-18', 4, 2, 1, 5), w('2026-10-25', 6, 2, 0, 9)] },
  });
  await page.goto(BASE + '#/visits');
  await page.reload();
  const card = page.locator('section').filter({ hasText: 'اتجاه البرنامج' });
  await expect(card.locator('.stat-card').first()).toContainText('6');
  await expect(card.locator('.stat-card').first()).toContainText('+2 عن الماضي');
  await expect(card.locator('.stat-card').nth(1)).toContainText('مثل الماضي');
  await expect(card.locator('.stat-card').nth(2)).toContainText('-1 عن الماضي');
  await expect(card.getByRole('table').locator('tbody tr').first()).toContainText('2026-10-25');
});
