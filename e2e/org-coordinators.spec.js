// منسق الجهة: نموذج الجهة، وتحكم المدير، وبوابة المنسق. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const PORTAL = 'http://localhost:4304/org';
const org = { id: 'o1', name: 'وزارة التجربة', short_name: 'وت', color: '#12414E', invite_code: 'wt01', seats: 10, status: 'active', domains: [], stats: { total: 0, registered: 0, pending_approval: 0, active_week: 0 } };
const coord = { id: 'c1', organization_id: 'o1', email: 'coord@wt.gov.sa', full_name: 'منسقة الجهة', status: 'active', permissions: { scores: false, contact: false, export: true }, weekly_report: true, last_login_at: '2026-10-20', invited_at: '2026-10-01' };

async function admin(page, replies) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const base = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.org': { success: true, org, participants: [], funnel: { registered: 0, withdrawn: 0 }, by_track: {}, by_via: {}, by_campaign: {}, by_site: {} },
      'admin.save': { success: true, row: { id: 'o-new' } },
      'admin.coordinator-save': { success: true, invited: true },
      'admin.coordinator-status': { success: true }, 'admin.coordinator-revoke': { success: true },
      'admin.org-impact': { success: true, participants: 3, reports: 1, coordinator: true },
      ...replies,
    };
    await route.fulfill({ json: base[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  return calls;
}

test('جهة جديدة: تحقق فوري، ثم إنشاء الجهة وحساب المنسق ودعوته', async ({ page }) => {
  const calls = await admin(page, { 'admin.coordinator': { success: true, coordinator: null } });
  await page.getByRole('button', { name: '+ جهة جديدة' }).click();
  const f = page.getByRole('dialog', { name: 'جهة جديدة' });
  await f.getByRole('button', { name: 'إنشاء الجهة' }).click();
  await expect(f.getByText('اسم الجهة مطلوب')).toBeVisible();
  await f.getByLabel('اسم الجهة *').fill('هيئة الاختبار');
  await f.getByRole('radio', { name: '#2E7D5B' }).click();
  await f.getByLabel('رمز رابط الدعوة').fill('Bad Code!');
  await expect(f.getByText(/أحرف إنجليزية صغيرة/)).toBeVisible();
  await f.getByLabel('رمز رابط الدعوة').fill('hx-2026');
  await expect(f.getByText('https://leaders.sunkvalue.com/j/hx-2026')).toBeVisible();
  await f.getByLabel('البريد').fill('lead@hx.sa');
  await f.locator('.of-switch', { hasText: 'يرى لوحة الجهة' }).click();
  await f.getByRole('button', { name: 'إنشاء الجهة' }).click();
  await expect(page.getByRole('status')).toContainText('أُرسلت الدعوة إلى lead@hx.sa');
  expect(calls.find((c) => c.action === 'admin.save').row).toMatchObject({ name: 'هيئة الاختبار', color: '#2E7D5B', invite_code: 'hx-2026' });
  expect(calls.find((c) => c.action === 'admin.coordinator-save')).toMatchObject({ organization_id: 'o-new', email: 'lead@hx.sa' });
});

test('إغلاق النموذج بتعديلات غير محفوظة يطلب التأكيد', async ({ page }) => {
  await admin(page, { 'admin.coordinator': { success: true, coordinator: null } });
  await page.getByRole('button', { name: '+ جهة جديدة' }).click();
  await page.getByLabel('اسم الجهة *').fill('مسودة');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toContainText('تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByLabel('اسم الجهة *')).toHaveValue('مسودة');
});

test('الحذف محمي: يعرض الأثر ويرفض جهة لها مشاركون، ويقترح الإيقاف', async ({ page }) => {
  await admin(page, { 'admin.coordinator': { success: true, coordinator: coord, sessions: [], activity: [] } });
  await page.locator('.la-org').getByRole('button', { name: 'تحرير' }).click();
  const f = page.getByRole('dialog', { name: /وزارة التجربة/ });
  await f.getByRole('button', { name: 'حذف الجهة…' }).click();
  await expect(f.getByText(/لا يمكن حذفها الآن/)).toBeVisible();
  await expect(f.getByRole('button', { name: 'حذف نهائي' })).toHaveCount(0);
  await expect(f.getByRole('button', { name: 'إيقاف الجهة' })).toBeVisible();
});

test('الحذف يتطلب كتابة اسم الجهة حين لا ارتباطات', async ({ page }) => {
  const calls = await admin(page, { 'admin.coordinator': { success: true, coordinator: null }, 'admin.org-impact': { success: true, participants: 0, reports: 0, coordinator: false }, 'admin.delete': { success: true } });
  await page.locator('.la-org').getByRole('button', { name: 'تحرير' }).click();
  const f = page.getByRole('dialog', { name: /وزارة التجربة/ });
  await f.getByRole('button', { name: 'حذف الجهة…' }).click();
  const del = f.getByRole('button', { name: 'حذف نهائي' });
  await expect(del).toBeDisabled();
  await f.getByLabel('اكتب اسم الجهة للتأكيد').fill('وزارة التجربة');
  await del.click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.delete')).toMatchObject({ entity: 'organizations', id: 'o1' });
});

test('لوحة المنسق في الجهة: الصلاحيات والإيقاف والمعاينة', async ({ page }) => {
  const calls = await admin(page, {
    'admin.coordinator': { success: true, coordinator: coord, sessions: [{ id: 's1', active: true, user_agent: 'Mac', ip: '1.1.1.1', created_at: '2026-10-20' }], activity: [{ actor_type: 'coordinator', action: 'coordinator.login', created_at: '2026-10-20' }] },
    'admin.coordinator-preview': { success: true, org: { name: 'وزارة التجربة' }, permissions: { scores: false, contact: false, export: true }, kpis: { total: 1, joined_week: 1, active_week: 1, avg_progress: 40 }, participants: [{ id: 'p1', full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', progress: 40 }] },
  });
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  await expect(page.getByText('coord@wt.gov.sa')).toBeVisible();
  await page.locator('.cp-perm', { hasText: 'بريد المشاركين' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.coordinator-save')?.permissions).toMatchObject({ contact: true, scores: false });
  await page.getByRole('button', { name: 'معاينة بعين المنسق' }).click();
  await expect(page.getByRole('dialog', { name: 'معاينة بعين المنسق' }).getByText('سارة')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'إيقاف الحساب' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إيقاف' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.coordinator-status')).toMatchObject({ suspended: true });
});

test('بوابة المنسق: الدخول بالرمز ثم لوحة الجهة دون حقول محجوبة', async ({ page }) => {
  const sent = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b.action);
    const r = {
      'coord.auth-start': { success: true, sent: true },
      'coord.auth-verify': b.code === '123456' ? { success: true, token: 'x'.repeat(40), coordinator: { full_name: 'منسقة' }, org: { name: 'وزارة التجربة' } } : { success: false, message: 'الرمز غير صحيح', code: 'code' },
      'coord.dashboard': { success: true, org: { name: 'وزارة التجربة', seats: 10 }, permissions: { scores: false, contact: false, export: true },
        kpis: { total: 2, joined_week: 1, active_week: 1, approved: 1, completed: 0, avg_progress: 25 }, funnel: { registered: 2, approved: 1 }, by_track: { M1I1L2: 1 }, by_via: { link: 2 },
        participants: [{ id: 'p1', full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'مسار البداية', approved: true, progress: 40 }, { id: 'p2', full_name: 'عمر', status: 'registered', progress: 10 }],
        impact: { counts: { participants: 2, baseline: 2, post: 1, paired: 1 }, caution: 'العدد 1 أقل من 20', transfer: [], participants: [],
          cohort: { milestone: { n: 1, pre: 40, post: 62, diff: 22, reliable_up: 1, verdicts: {} } } } },
      'coord.logout': { success: true },
      'coord.me': { success: true, coordinator: { full_name: 'منسقة' }, org: { name: 'وزارة التجربة' } },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(PORTAL);
  await page.getByLabel('البريد الإلكتروني').fill('coord@wt.gov.sa');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await page.getByLabel('رمز التحقق').fill('000000');
  await expect(page.getByText('الرمز غير صحيح')).toBeVisible();
  await page.getByLabel('رمز التحقق').fill('123456');
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  await expect(page.getByText('مسار البداية').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'التواصل' })).toHaveCount(0);
  // أثر الجهة: أرقام الخادم كما هي، وزر التقرير مع صلاحية التصدير
  await expect(page.getByRole('heading', { name: 'أثر البرنامج على مشاركيكم' })).toBeVisible();
  await expect(page.locator('.op-impact')).toContainText('+22');
  await expect(page.locator('.op-impact')).toContainText('1 من 1');
  const [doc] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'تقرير الأثر PDF' }).click()]);
  await expect(doc.getByText('تقرير أثر وزارة التجربة')).toBeVisible();
  await doc.close();
  await page.getByLabel('الترتيب').selectOption('progress');
  await expect(page.locator('.op-table tbody tr').first()).toContainText('سارة');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  expect(sent).toContain('coord.logout');
});
