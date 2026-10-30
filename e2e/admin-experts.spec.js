// شبكة الخبراء في لوحة الإدارة، وصفحة «انضم كخبير». الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const SHOT = process.env.SHOT_DIR;
const experts = [
  { id: 'e1', full_name: 'د. سارة الحربي', email: 's@x.com', title: 'مستشارة محافظ PMP', roles: ['coach', 'advisor'], dimensions: ['milestone', 'impact'], levels: ['intermediate', 'advanced'], sectors: ['حكومي'], languages: ['ar', 'en'], weekly_hours: 6, status: 'active', source: 'admin', created_at: '2026-10-01', updated_at: '2026-10-01' },
  { id: 'e2', full_name: 'خالد العتيبي', email: 'k@x.com', title: 'مدرب قيادة', roles: ['mentor'], dimensions: ['leadership'], levels: ['beginner'], sectors: [], languages: ['ar'], weekly_hours: 4, status: 'applied', source: 'application', created_at: '2026-10-28', updated_at: '2026-10-28' },
];

async function admin(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.experts': { success: true, experts },
      'admin.expert': { success: true, expert: experts.find((e) => e.id === b.id), activity: [{ action: 'expert.apply', actor: 'k@x.com', created_at: '2026-10-28' }] },
      'admin.expert-set-status': { success: true },
      'admin.expert-save': { success: true, expert: { ...experts[0], id: 'e3' }, invited: true },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الخبراء' }).click();
  return calls;
}

test('شبكة الخبراء: المؤشرات والفلترة ثم اعتماد طلب انضمام', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  const calls = await admin(page);
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: /طلبات بانتظار المراجعة/ }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: /طلبات بانتظار المراجعة/ }).click();
  await page.getByRole('combobox', { name: 'الأدوار' }).selectOption('coach');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('د. سارة الحربي');
  if (SHOT) await page.locator('.ex').screenshot({ path: `${SHOT}/experts.png` });
  await page.getByRole('button', { name: 'مسح الكل' }).click();
  await page.getByText('خالد العتيبي').click();
  await expect(page.getByRole('heading', { name: 'خالد العتيبي' })).toBeVisible();
  if (SHOT) await page.locator('.ex-profile').screenshot({ path: `${SHOT}/expert.png` });
  await page.getByRole('button', { name: 'اعتماد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-set-status')).toMatchObject({ id: 'e2', status: 'active' });
});

test('إضافة خبير بدعوة، والسعر حقل إداري', async ({ page }) => {
  const calls = await admin(page);
  await page.getByRole('button', { name: '+ خبير' }).click();
  await page.getByLabel('الاسم *').fill('منى القحطاني');
  await page.getByLabel('البريد *').fill('m@x.com');
  await page.locator('.ex-tg', { hasText: 'كوتش' }).click();
  await page.getByLabel('سعر الساعة (ريال)').fill('0');
  await page.getByRole('button', { name: 'إضافة وإرسال الدعوة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-save')).toMatchObject({ full_name: 'منى القحطاني', email: 'm@x.com', roles: ['coach'], hourly_rate: '0' });
});

test('انضم كخبير: التحقق ثم الإرسال', async ({ page }) => {
  let sent = null;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'expert.apply') sent = b;
    await route.fulfill({ json: b.action === 'expert.apply' ? { success: true, received: true } : { success: false } });
  });
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto('http://localhost:4304/expert');
  await expect(page.getByRole('heading', { name: 'انضم إلى شبكة خبراء برنامج القادة' })).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/apply.png`, fullPage: true });
  await page.getByLabel('الاسم الكامل *').fill('سارة الحربي');
  await page.getByLabel('البريد الإلكتروني *').fill('s@x.com');
  await page.locator('.xp-opt', { hasText: 'مستشار' }).first().click();
  await page.locator('.xp-opt', { hasText: 'تمكين القائد' }).click();
  await page.getByLabel('عرّف بخبرتك *').fill('خبرة خمسة عشر عامًا في قيادة محافظ المشاريع الحكومية وتحويلها إلى أثر قابل للقياس، وتدريب القادة.');
  await page.getByRole('button', { name: 'أرسل طلب الانضمام' }).click();
  await expect(page.getByRole('heading', { name: 'وصل طلبك' })).toBeVisible();
  expect(sent).toMatchObject({ full_name: 'سارة الحربي', roles: ['advisor'], dimensions: ['leadership'] });
});
