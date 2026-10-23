// وثائق المنصة بالهوية: تقرير الجهة في نافذة مستقلة، وملفات Excel حقيقية
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const org = { id: 'o1', name: 'وزارة التجربة', short_name: 'وت', color: '#12414E', invite_code: 'wt01', seats: 10, status: 'active', domains: [], stats: { total: 1, registered: 1, pending_approval: 0, active_week: 1 } };
const ps = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'مسار البداية', approved: true, created_at: '2026-10-01', last_login_at: '2026-10-20' }];

async function admin(page) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const map = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: ps },
      'admin.org': { success: true, org, participants: ps, funnel: { registered: 1, profiled: 1, assessed: 1, approved: 1, completed: 0, withdrawn: 0, pending_approval: 0 }, by_track: { M1I1L2: 1 }, by_via: { link: 1 }, by_campaign: {}, by_site: {} },
      'admin.coordinator': { success: true, coordinator: null },
    };
    await route.fulfill({ json: map[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/next/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
}

// يفك ملف xlsx ويعيد نص ورقته الأولى
function sheetXml(path) {
  return execSync(`unzip -p "${path}" xl/worksheets/sheet1.xml`).toString();
}

test('تقرير الجهة يفتح وثيقة بالهوية: الشعار والختم وحقوق النشر ورقم الوثيقة', async ({ page, context }) => {
  await admin(page);
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  const [doc] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'تقرير الجهة' }).click()]);
  await expect(doc.getByRole('heading', { name: 'تقرير وزارة التجربة' })).toBeVisible();
  await expect(doc.locator('.mast svg[aria-label="Milestone Impact"]')).toBeVisible();
  await expect(doc.locator('svg.seal')).toHaveCount(1);
  await expect(doc.getByText(/جميع الحقوق محفوظة/)).toBeVisible();
  await expect(doc.locator('.ref b')).toHaveText(/^MI-ORG-\d{8}-[A-Z0-9]{4}$/);
  await expect(doc.getByText('سارة الأحمد')).toBeVisible();
  await expect(doc.getByRole('button', { name: 'طباعة أو حفظ PDF' })).toBeVisible();
});

test('تصدير المشاركين ملف xlsx حقيقي من اليمين لليسار بالترويسة وحقوق النشر', async ({ page }) => {
  await admin(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير Excel' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^Milestone-Impact_Participants_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await dl.path();
  expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK');
  const xml = sheetXml(path);
  expect(xml).toContain('rightToLeft="1"');
  expect(xml).toMatch(/showGridLines="(0|false)"/);
  const shared = execSync(`unzip -p "${path}" xl/sharedStrings.xml`).toString();
  expect(shared).toContain('MILESTONE IMPACT');
  expect(shared).toContain('سارة الأحمد');
  expect(shared).toContain('جميع الحقوق محفوظة');
});
