// لوحة الإدارة الجديدة: تطبيق القادة (المشاركون والجهات). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const pl = (m, i, l, ok = true) => [['milestone', m], ['impact', i], ['leadership', l]].map(([dimension, level]) => ({ dimension, level, approved_at: ok ? '2026-10-01' : null }));
const people = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'pending_approval', placements: pl('beginner', 'beginner', 'intermediate', false), created_at: '2026-10-01' },
  { id: 'p2', full_name: 'Omar Ali', email: 'o@x.com', job_title: 'مهندس', organization_id: null, organization_name: 'شركة', status: 'enrolled', placements: pl('advanced', 'advanced', 'advanced'), created_at: '2026-10-02' },
];
const orgs = [{ id: 'o1', name: 'وزارة التجربة', short_name: 'وت', color: '#12414E', invite_code: 'wt01', seats: 10, status: 'active', domains: ['wt.gov.sa'], stats: { total: 1, registered: 1, profiled: 1, assessed: 1, approved: 0, completed: 0, pending_approval: 1, active_week: 1 } }];
const person = {
  success: true, participant: { ...people[0], phone: '0500', last_login_at: '2026-10-20' }, progress: 20, history: [],
  profile: { approved: false, dimensions: [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'intermediate' }] },
  assessments: [{ status: 'submitted', assessment_results: [{ dimension: 'milestone', knowledge_pct: 50, evaluation: { level: 'beginner', composite: 48 } }] }],
  journey: [{ key: 's1', title_ar: 'التهيئة', status: 'active', items: [{ id: 'r1', title_ar: 'خطة التطوير', status: 'submitted', evidence_path: 'e/1.pdf' }] }],
  points: { total: 30, rank: { title: 'مستكشف' } }, book: [], models: [],
};

async function setup(page, overrides = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs, unassigned: { total: 1, typed: [{ name: 'شركة', n: 1 }] } },
      'admin.participants': { success: true, participants: b.status ? people.filter((p) => p.status === b.status) : people },
      'admin.participant': person,
      'admin.org': { success: true, org: orgs[0], participants: [{ ...people[0], track: 'M1I1L2', track_title: 'مسار البداية' }], funnel: { ...orgs[0].stats, withdrawn: 0 }, by_track: { M1I1L2: 1 }, by_via: { link: 1 }, by_campaign: {}, by_site: {} },
      'admin.approve': { success: true }, 'admin.review': { success: true }, 'admin.assign-org': { success: true, moved: 1 },
      'admin.save': { success: true, row: { id: 'o1' } }, 'admin.create-participant': { success: true },
      'admin.coordinator': { success: true, coordinator: null },
      ...overrides,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    localStorage.removeItem('mi_admin_list_filters');
  });
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return calls;
}

test('قائمة المشاركين: تصفية فورية ومسار، وحفظ فلاتر الخادم بعد التحديث', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
  await expect(page.getByText('وت', { exact: true })).toBeVisible();
  await page.getByLabel('بحث وتصفية').fill('omar');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByLabel('بحث وتصفية').fill('');
  await page.getByLabel('المسار').selectOption('M1I1L2');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByLabel('الحالة').selectOption('enrolled');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.participants').at(-1)?.status).toBe('enrolled');
  await page.reload();
  await expect(page.getByLabel('الحالة')).toHaveValue('enrolled');
  await page.getByRole('button', { name: 'مسح الفلاتر' }).click();
  await expect(page.getByLabel('الحالة')).toHaveValue('');
});

test('النقل الجماعي إلى جهة بتأكيد', async ({ page }) => {
  const calls = await setup(page);
  await page.getByLabel('تحديد Omar Ali').check();
  await page.getByLabel('نقل إلى جهة').selectOption('o1');
  await page.getByRole('button', { name: 'نقل', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.assign-org')).toMatchObject({ participant_ids: ['p2'], organization_id: 'o1' });
});

test('ملف المشارك: اعتماد المستويات، وإعادة بند بملاحظة', async ({ page }) => {
  const calls = await setup(page);
  await page.getByText('سارة الأحمد').click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  await expect(page.getByLabel('مستوى Leadership')).toHaveValue('intermediate');
  await page.getByLabel('مستوى Impact').selectOption('advanced');
  await page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.approve')?.levels).toEqual({ milestone: 'beginner', impact: 'advanced', leadership: 'intermediate' });

  await page.getByRole('button', { name: 'إعادة مع ملاحظة' }).click();
  await page.getByRole('dialog').locator('input').fill('أضف المؤشرات');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review')).toMatchObject({ status: 'returned', note: 'أضف المؤشرات', requirement_id: 'r1' });
  await page.getByRole('button', { name: '→ كل المشاركين' }).click();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
});

test('الجهات: البطاقات ولوحة الجهة ورابط الحملة والتحرير', async ({ page }) => {
  const calls = await setup(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await expect(page.locator('.la-org b', { hasText: 'وزارة التجربة' })).toBeVisible();
  await expect(page.getByText('1 بانتظار اعتمادك')).toBeVisible();
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  await expect(page.getByText('https://leaders.sunkvalue.com/j/wt01')).toBeVisible();
  await page.getByLabel('اسم الحملة').fill('واتساب');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toContainText('اسم الحملة');
  await page.getByLabel('اسم الحملة').fill('whatsapp');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toHaveText('نُسخ رابط الحملة');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://leaders.sunkvalue.com/j/wt01/whatsapp');

  await page.getByRole('button', { name: 'تحرير', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: /وزارة التجربة/ });
  await expect(form.getByText('wt.gov.sa')).toBeVisible();
  await expect(form.getByRole('button', { name: 'حفظ التعديلات' })).toBeDisabled();
  await form.getByRole('button', { name: 'زيادة' }).click();
  await form.getByLabel('أضف موقعًا').fill('portal.wt.gov.sa');
  await form.getByLabel('أضف موقعًا').press('Enter');
  await form.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({ id: 'o1', seats: 11, domains: 'wt.gov.sa,portal.wt.gov.sa' });
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
});

test('المراقب يرى دون أدوات التعديل', async ({ page }) => {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: true, participants: people, orgs, unassigned: {} } }));
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مراقب', email: 'v@x', role_id: 'viewer' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await expect(page.getByText('عرض فقط')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ مشارك' })).toHaveCount(0);
  await expect(page.getByLabel('تحديد الكل')).toHaveCount(0);
});
