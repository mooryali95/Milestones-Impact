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

test('حالة النظام: المؤجل بقرار لا يُطلب تطبيقه، والحاجب والمتسامح كلٌّ بسطره (ops-4)', async ({ page }) => {
  await setup(page, {
    'admin.overview': { success: true, total: 0, by_status: {}, pending_reviews: 0, matrix: empty },
    'admin.health': { success: true, missing_migrations: ['20261201100000_blocking_one', '20261201110000_tolerant_one'], migrations_ledger: true,
      pending_migrations: [
        { name: '20261201100000_blocking_one', gate: 'blocking', note: '' },
        { name: '20261201110000_tolerant_one', gate: 'tolerant', note: 'الدالة تتحمل غياب العمود' },
        { name: '20261201120000_deferred_one', gate: 'deferred', note: 'بقرار D99 بعد توقيع اللجنة' },
      ],
      missing_secrets: ['LEADERS_ALERT_WEBHOOK'], mail: { today: 0, cap: 80 } },
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  const note = page.getByRole('status').filter({ hasText: 'حالة النظام' });
  const line = (t) => note.locator('p').filter({ hasText: t });
  await expect(line('قبل نشر الدوال')).toContainText('20261201100000_blocking_one.sql');
  await expect(line('في أقرب نافذة')).toContainText('20261201110000_tolerant_one.sql');
  await expect(line('مؤجلة بقرار')).toContainText('20261201120000_deferred_one.sql');
  await expect(line('مؤجلة بقرار')).toContainText('بقرار D99 بعد توقيع اللجنة');
  // لا سطر يطلب تطبيق المؤجل
  await expect(note.locator('p').filter({ hasText: 'migrate.yml' }).filter({ hasText: 'deferred_one' })).toHaveCount(0);
  await expect(note).toContainText('LEADERS_ALERT_WEBHOOK');
});

test('جاهزية الإطلاق: بنود الإطلاق التجريبي من الخادم، والبند الذي يُضبط خارج اللوحة بلا زر ضبط', async ({ page }) => {
  await setup(page, {
    'admin.overview': { success: true, total: 0, by_status: {}, pending_reviews: 0, matrix: empty },
    'admin.health': { success: true, missing_migrations: [], missing_secrets: [], mail: { today: 0, cap: 80 }, readiness: [
      { key: 'certificate', ok: true, where: 'certs', label: 'الشهادة مكتملة الإعداد' },
      { key: 'advisor', ok: false, where: 'programs', label: 'دفعات جهات بلا مستشار أساسي: دفعة أ' },
      { key: 'release-pinned', ok: false, where: null, label: 'دفعات جارية بلا إصدار محتوى مثبّت (يُثبَّت بترحيل إصدار المحتوى): دفعة أ' },
    ] },
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  const card = page.getByRole('region', { name: 'جاهزية الإطلاق' });
  await expect(card).toContainText('1 من 3');
  await expect(card.locator('li').filter({ hasText: 'إصدار محتوى' }).getByRole('button')).toHaveCount(0);
  await card.locator('li').filter({ hasText: 'مستشار أساسي' }).getByRole('button', { name: 'اضبطه' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs/);
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

test('جاهزية الإطلاق: البنود الناقصة تنقل إلى تبويب ضبطها، وتختفي حين تكتمل', async ({ page }) => {
  await setup(page, {
    'admin.overview': { success: true, total: 0, by_status: {}, pending_reviews: 0, matrix: empty },
    'admin.health': { success: true, missing_migrations: [], missing_secrets: [], mail: { today: 0, cap: 80 }, readiness: [
      { key: 'baseline', ok: true, where: 'assessment', label: 'القياس القبلي المفعّل baseline-v3' },
      { key: 'certificate', ok: false, where: 'certs', label: 'الشهادة بلا موقّع' },
    ] },
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  const card = page.getByRole('region', { name: 'جاهزية الإطلاق' });
  await expect(card).toContainText('1 من 2');
  await card.getByRole('button', { name: 'اضبطه' }).click();
  await expect(page).toHaveURL(/#\/leaders\/certs/);
});

test('من المنظومة إلى الجهة إلى الدفعة: الناقص بأسمائه يفتح ملف كلٍّ منها، وجاهزية الجهات سطر لكل جهة', async ({ page }) => {
  await setup(page, {
    'admin.overview': { success: true, total: 0, by_status: {}, pending_reviews: 0, matrix: empty },
    'admin.orgs': { success: true, unassigned: { total: 0, typed: [] }, orgs: [
      { id: 'o1', name: 'سفراء', status: 'active', invite_code: 'sufara', seats: 40, contract_ends: '2099-01-01', logo: 'x', stats: { total: 29, pending_approval: 12 }, access: { state: 'none' },
        cohort_setup: { cohort: { id: 'c1', name: 'دفعة سفراء', status: 'open' }, setup_missing: 1, setup: [{ title: 'المستشار الأساسي', ok: false }] } },
      { id: 'o2', name: 'منظومة', status: 'active', invite_code: 'mnz', seats: 20, contract_ends: '2099-01-01', logo: 'x', stats: { total: 5, pending_approval: 0 }, access: { state: 'active', n: 1 } },
      { id: 'o3', name: 'جهة موقوفة', status: 'paused', stats: { total: 0 } },
    ] },
    'admin.health': { success: true, missing_migrations: [], missing_secrets: [], mail: { today: 0, cap: 80 }, readiness: [
      { key: 'cohort-per-org', ok: false, where: 'programs', label: 'جهات فعّالة بلا دفعة مفتوحة أو جارية: منظومة', refs: [{ kind: 'org', id: 'o2', name: 'منظومة' }] },
      { key: 'advisor', ok: false, where: 'programs', label: 'دفعات جهات بلا مستشار أساسي: دفعة سفراء', refs: [{ kind: 'cohort', id: 'c1', name: 'دفعة سفراء' }] },
    ] },
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  const launch = page.getByRole('region', { name: 'جاهزية الإطلاق' });
  // ما يسمّي جهة أو دفعة يفتح ملفها مباشرة بدل التبويب العام
  await expect(launch.getByRole('button', { name: 'اضبطه' })).toHaveCount(0);
  await expect(launch.getByRole('link', { name: 'دفعة سفراء' })).toHaveAttribute('href', '#/leaders/programs/c1');
  await expect(launch.getByRole('link', { name: 'منظومة' })).toHaveAttribute('href', '#/leaders/orgs/o2');
  // الجهات الفعّالة وحدها، والأكثر نقصًا أولًا
  const orgs = page.getByRole('region', { name: 'جاهزية الجهات' });
  await expect(orgs).toContainText('1 من 2 جاهزة');
  await expect(orgs.locator('li')).toHaveCount(2);
  await expect(orgs.locator('li').first()).toContainText('سفراء');
  // بند الدفعة من الخادم (orgCohortSetups) كما في صفحة الجهة، فلا يقول السطر «جاهزة» وصفحتها غير ذلك
  await expect(orgs.locator('li').first()).toContainText('الدفعة، منسق الجهة، الاعتماد');
  await expect(orgs).not.toContainText('جهة موقوفة');
  await orgs.getByRole('button', { name: 'سفراء' }).click();
  await expect(page).toHaveURL(/#\/leaders\/orgs\/o1$/);
});
