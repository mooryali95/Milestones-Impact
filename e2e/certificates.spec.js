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
      'admin.cert-settings': { success: true, settings: { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: 48, signatories: [] } },
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
