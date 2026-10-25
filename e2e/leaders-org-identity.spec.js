// هوية الجهة في تطبيق المشارك، وشهادة البرنامج، والدفعة في صفحة التحقق. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  org: { name: 'جمعية سفراء الأثر', short_name: 'سفراء', color: '#7A3E9D', logo_v: '2026-10-25T09:00:00Z' },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

test('المشارك يرى شعار جهته بجانب Milestone، ويُجلب الشعار مرة واحدة', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    const r = { me, certificate: { success: true, certificate: null }, 'org.logo': { success: true, logo: LOGO } };
    await route.fulfill({ json: r[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto('http://localhost:4304/');
  const mark = page.locator('.topbar').getByRole('img', { name: 'جمعية سفراء الأثر' });
  await expect(mark).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCSS('border-bottom-color', 'rgb(122, 62, 157)');
  await page.reload();
  await expect(mark).toBeVisible();
  expect(calls.filter((a) => a === 'org.logo')).toHaveLength(1);
});

test('جهة بلا شعار: يظهر اسمها المختصر', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = { me: { ...me, org: { ...me.org, logo_v: null } }, certificate: { success: true, certificate: null } };
    await route.fulfill({ json: r[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto('http://localhost:4304/');
  await expect(page.locator('.topbar .org-mark')).toHaveText('سفراء');
});

test('صفحة التحقق تعرض الدفعة', async ({ page }) => {
  const snap = { serial: 'MI-LDR-2026-7K3QX9', name_ar: 'سارة الأحمد', program_ar: 'برنامج سفراء الأثر', program_en: 'Impact Ambassadors',
    cohort_ar: 'سفراء 2026', issued_at: '2026-10-23T09:00:00Z', org: { name: 'جمعية سفراء الأثر' }, signatories: [] };
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: { success: true, found: true, authentic: true, status: 'valid', certificate: snap } }));
  await page.goto('http://localhost:4304/v/MI-LDR-2026-7K3QX9');
  await expect(page.getByText('شهادة صحيحة وسارية')).toBeVisible();
  await expect(page.getByText('سفراء 2026')).toBeVisible();
});

test('شهادة البرنامج: يُحفظ ما يختلف عن العام فقط', async ({ page }) => {
  const calls = [];
  const programs = [
    { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 35, versions: [], cert: {} },
    { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 30, versions: [], cert: { hours: 24 } },
  ];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts: [], organizations: [] },
      'admin.cert-settings': { success: true, settings: { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: 48, signatory: { name: 'محمود', title: 'المدير التنفيذي' } } },
      'admin.program-save': { success: true, program: { id: 'pb' } },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.getByRole('button', { name: 'الشهادة (مخصصة)' }).click();
  const dlg = page.getByRole('dialog', { name: 'شهادة برنامج سفراء' });
  await expect(dlg.getByLabel('الساعات التدريبية')).toHaveValue('24');
  await expect(dlg.getByLabel('اسم البرنامج على شهادات البرنامج')).toHaveAttribute('placeholder', 'برنامج القادة');
  await dlg.getByLabel('اسم البرنامج على شهادات البرنامج').fill('برنامج سفراء الأثر');
  await dlg.getByRole('radio', { name: /بلا موقّع/ }).click();
  await dlg.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-save')).toEqual({
    action: 'admin.program-save', token: expect.anything(), id: 'pb', cert: { hours: 24, program_ar: 'برنامج سفراء الأثر', signatory: null },
  });
});
