// استيراد المشاركين دفعة واحدة من لوحة الإدارة: لصق، ثم معاينة حال كل صف، ثم إضافة الجاهز وحده.
import { test, expect } from '@playwright/test';
import { checkImport, importCounts } from '../supabase/functions/leaders-api/import.js';

const BASE = 'http://localhost:4303/';
const PASTE = 'الاسم\tالبريد\nسارة الأحمد\tsara@example.sa\nعمر علي\tomar@example.sa\nس\tx@example.sa\nمسجل قديم\told@example.sa';

async function open(page, importReply) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.participants-import') { calls.push(b); return route.fulfill({ json: importReply(b) }); }
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'وزارة التجربة', status: 'active' }], unassigned: {} },
      'admin.participants': { success: true, participants: [] }, 'admin.reviews': { success: true, pending_approval: [], submitted: [] },
      'admin.submissions': { success: true, submissions: [] },
    };
    return route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(`${BASE}#/leaders/participants`);
  await page.reload();
  await page.getByRole('button', { name: 'استيراد' }).click();
  return { calls, dlg: page.getByRole('dialog', { name: 'استيراد مشاركين' }) };
}

test('المعاينة تصنّف الصفوف، والإضافة تأخذ الجاهز وحده', async ({ page }) => {
  const { calls, dlg } = await open(page, (b) => {
    const rows = checkImport(b.rows, new Set(['old@example.sa']));
    if (!b.dry_run) rows.forEach((r) => { if (r.status === 'ok') r.status = 'created'; });
    return { success: true, dry_run: !!b.dry_run, rows, counts: importCounts(rows), seated: 2, organization: 'وزارة التجربة' };
  });
  await dlg.locator('select').selectOption('o1');
  await dlg.locator('textarea').fill(PASTE);
  // قبل سؤال الخادم: الناقص ظاهر، والمسجل من قبل لا يُعرف بعد
  await expect(dlg.getByText('الاسم مطلوب (3 أحرف على الأقل)')).toBeVisible();
  await dlg.getByRole('button', { name: 'تحقق من المسجلين' }).click();
  await expect(dlg.getByText('مسجل من قبل، ولم يُغيَّر')).toBeVisible();
  expect(calls[0]).toMatchObject({ dry_run: true, organization_id: 'o1' });
  expect(calls[0].rows).toHaveLength(4);
  await dlg.getByRole('button', { name: 'أضف 2 مشاركًا' }).click();
  await expect(dlg.getByRole('status')).toContainText('أُضيف 2 مشاركًا إلى وزارة التجربة');
  await expect(dlg.getByRole('status')).toContainText('لم يُرسل بريد');
  expect(calls[1].dry_run).toBe(false);
});

test('قبل نشر الخادم: رسالة تقول ما يحدث', async ({ page }) => {
  const { dlg } = await open(page, () => ({ success: false, message: 'إجراء غير معروف', code: 'unknown_action' }));
  await dlg.locator('textarea').fill(PASTE);
  await dlg.getByRole('button', { name: 'تحقق من المسجلين' }).click();
  await expect(dlg.getByRole('alert')).toContainText('الاستيراد يعمل بعد نشر تحديث الخادم');
});
