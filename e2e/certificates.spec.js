// الشهادات: صفحة التحقق العامة، وتبويب الإدارة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const snap = { serial: 'MI-LDR-2026-7K3QX9', name_ar: 'سارة الأحمد', name_en: 'Sarah Alahmad', program_ar: 'برنامج القادة', program_en: 'Leaders Program',
  track_ar: 'مسار التوازن', issued_at: '2026-10-23T09:00:00Z', org: { name: 'هيئة التطوير' }, signatories: [], verify_url: 'https://leaders.sunkvalue.com/v/MI-LDR-2026-7K3QX9' };

test('التحقق العام: سارية، ثم رقم غير موجود', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    expect(b.action).toBe('cert.verify');
    await route.fulfill({ json: b.serial === snap.serial
      ? { success: true, found: true, authentic: true, status: 'valid', certificate: snap }
      : { success: true, found: false } });
  });
  await page.goto('http://localhost:4304/v/mi-ldr-2026-7k3qx9');
  await expect(page.getByText('شهادة صحيحة وسارية')).toBeVisible();
  await expect(page.getByText('سارة الأحمد')).toBeVisible();
  await expect(page.getByText('هيئة التطوير')).toBeVisible();
  await page.getByLabel('رقم الشهادة').fill('MI-LDR-2026-AAAAAA');
  await page.getByRole('button', { name: 'تحقّق' }).click();
  await expect(page.getByText('لا توجد شهادة بهذا الرقم')).toBeVisible();
  await expect(page).toHaveURL(/\/v\/MI-LDR-2026-AAAAAA$/);
});

test('الإدارة: سجل الشهادات وإلغاء شهادة بسبب', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.cert-settings': { success: true, settings: { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: 48, signatory: null } },
      'admin.certificates': { success: true, checks: 3, certificates: [{ id: 'c1', serial: snap.serial, status: 'valid', name_ar: 'سارة الأحمد', org_name: 'هيئة التطوير', issued_at: snap.issued_at, participant_id: 'p1' }] },
      'admin.certificate-revoke': { success: true },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/next/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الشهادات' }).click();
  await expect(page.getByText(snap.serial)).toBeVisible();
  await expect(page.getByLabel('اسم البرنامج', { exact: true })).toHaveValue('برنامج القادة');
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await page.getByRole('dialog').locator('input').fill('صدرت بالخطأ');
  await page.getByRole('button', { name: 'إلغاء الشهادة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.certificate-revoke')).toMatchObject({ id: 'c1', reason: 'صدرت بالخطأ' });
});

test('شهادة الجهة: يُحفظ التخصيص وحده، والفارغ يُورث من العام', async ({ page }) => {
  const calls = [];
  const org = { id: 'o1', name: 'هيئة التطوير', color: '#12414E', invite_code: 'hd01', status: 'active', domains: [], cert: { hours: 30 },
    stats: { total: 0, registered: 0, pending_approval: 0, active_week: 0 } };
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.org': { success: true, org, participants: [], funnel: { registered: 0, withdrawn: 0 }, by_track: {}, by_via: {}, by_campaign: {}, by_site: {} },
      'admin.coordinator': { success: true, coordinator: null },
      'admin.cert-settings': { success: true, settings: { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: 48, signatory: { name: 'أ. خالد', title: 'المدير' } } },
      'admin.save': { success: true, row: { id: 'o1' } },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/next/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await page.locator('.la-org').getByRole('button', { name: 'تحرير' }).click();
  const f = page.getByRole('dialog', { name: /هيئة التطوير/ });
  await expect(f.getByLabel('الساعات التدريبية')).toHaveValue('30');
  await expect(f.getByRole('radio', { name: 'العام: أ. خالد' })).toHaveAttribute('aria-checked', 'true');
  await f.getByLabel('اسم البرنامج على شهادات الجهة').fill('برنامج قادة الهيئة');
  await f.getByRole('radio', { name: /بلا موقّع/ }).click();
  await f.getByRole('button', { name: /حفظ/ }).first().click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row?.cert).toEqual({ hours: 30, program_ar: 'برنامج قادة الهيئة', signatory: null });
});
