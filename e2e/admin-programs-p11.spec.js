// البرامج والدفعات (المرحلة 11): شارة نسخة واحدة وزر الحفظ، وسطر الملخص، وdl، وقسم المؤرشفة، و«سجل النسخ»، وطي الشرح. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.P11_SHOTS || '';
const v1 = { id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' };

function fixture() {
  return [
    { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 35, versions: [v1], draft_changed: true, unpinned_cohorts: 1 },
    { id: 'pb', name: 'برنامج سفراء', requirements: 30, versions: [] },
    { id: 'pc', name: 'برنامج فارغ', requirements: 0, versions: [] },
    { id: 'pd', name: 'برنامج مستقر', requirements: 12, versions: [{ ...v1, id: 'v9' }] },
    { id: 'pz', name: 'برنامج قديم', requirements: 5, versions: [{ ...v1, id: 'v8' }], archived_at: '2026-01-01' },
  ];
}

async function setup(page, { canWrite = true, programs = fixture() } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.program-archive') {
      const p = programs.find((x) => x.id === b.id);
      p.archived_at = b.archive ? '2026-11-27' : null;
      return route.fulfill({ json: { success: true } });
    }
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts: [], organizations: [] },
      'admin.program-version': { success: true, version: { id: 'v2', number: 2 } },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((role) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: role }, ts: Date.now() })), canWrite ? 'admin' : 'viewer');
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const card = (page, name) => page.locator('section.la-card', { hasText: name }).first();

test('شارة نسخة واحدة لكل برنامج، والملخص، وdl، وزر الحفظ حيث يلزم', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.locator('.prog-drafts')).toHaveText('برنامج واحد بمسودة غير محفوظة');
  await expect(card(page, 'برنامج القادة').locator('.ver-chip')).toHaveText('مسودة معدلة');
  await expect(card(page, 'برنامج سفراء').locator('.ver-chip')).toHaveText('بلا نسخة');
  await expect(card(page, 'برنامج فارغ').locator('.ver-chip')).toHaveText('بلا متطلبات');
  await expect(card(page, 'برنامج مستقر').locator('.ver-chip')).toHaveText('محفوظ');
  for (const n of ['برنامج القادة', 'برنامج سفراء', 'برنامج فارغ', 'برنامج مستقر']) await expect(card(page, n).locator('.la-chip.st-chip')).toHaveCount(1);
  const meta = card(page, 'برنامج القادة').locator('dl.prog-meta');
  await expect(meta).toContainText('المتطلبات');
  await expect(meta).toContainText('35');
  await expect(meta).toContainText('1، الإطلاق');
  await expect(meta).toContainText('غير مثبتة');
  // زر الحفظ للمسودة وما بلا نسخة فقط
  await expect(card(page, 'برنامج مستقر').getByRole('button', { name: 'احفظ نسخة' })).toHaveCount(0);
  await expect(card(page, 'برنامج فارغ').getByRole('button', { name: 'احفظ نسخة' })).toHaveCount(0);
  await card(page, 'برنامج القادة').getByRole('button', { name: 'احفظ نسخة' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /موافق|تأكيد|حفظ/ }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-version')?.id).toBe('pa');
  // سجل النسخ بسهم وaria-expanded
  const log = card(page, 'برنامج القادة').getByRole('button', { name: /^سجل النسخ \(1\)/ });
  await expect(log).toHaveAttribute('aria-expanded', 'false');
  await log.click();
  await expect(log).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page, 'برنامج القادة').getByRole('button', { name: 'قارن بالحالي' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p11-programs-1280.png`, fullPage: true });
});

test('المؤرشف في «مؤرشفة (n)» آخر الصفحة، وينتقل بين القسمين بعد الرد', async ({ page }) => {
  await setup(page);
  const arch = page.locator('details.prog-archived');
  await expect(arch.locator('summary')).toHaveText('مؤرشفة (1)');
  await expect(arch).not.toHaveAttribute('open', '');
  await expect(page.locator('details.prog-archived section', { hasText: 'برنامج قديم' })).toHaveCount(1);
  // المؤرشف بعد جدول الدفعات
  const after = await page.evaluate(() => !!(document.querySelector('.table-wrap').compareDocumentPosition(document.querySelector('details.prog-archived')) & Node.DOCUMENT_POSITION_FOLLOWING));
  expect(after).toBe(true);
  await card(page, 'برنامج مستقر').getByRole('button', { name: /^إجراءات أخرى لبرنامج/ }).click();
  await page.getByRole('menuitem', { name: 'أرشفة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(arch.locator('summary')).toHaveText('مؤرشفة (2)');
  await arch.locator('summary').click();
  await expect(arch.locator('section', { hasText: 'برنامج مستقر' })).toBeVisible();
  await expect(arch.locator('section', { hasText: 'برنامج مستقر' }).locator('.ver-chip')).toHaveText('مؤرشف');
  await arch.locator('section', { hasText: 'برنامج قديم' }).getByRole('button', { name: /^إجراءات أخرى لبرنامج/ }).click();
  await page.getByRole('menuitem', { name: 'إعادة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(arch.locator('summary')).toHaveText('مؤرشفة (1)');
  await expect(page.locator('section.la-card:not(details section)', { hasText: 'برنامج قديم' })).toHaveCount(1);
});

test('شرح الخطوات مطوي حين توجد برامج ويُحفظ التفضيل، ومفتوح حين لا برامج', async ({ page }) => {
  await setup(page);
  const how = page.locator('details.how-it-works');
  await expect(how).not.toHaveAttribute('open', '');
  await how.locator('summary').click();
  await expect(how).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('la.programs.how'))).toBe('1');
  await page.setViewportSize({ width: 375, height: 800 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/p11-programs-375.png`, fullPage: true });
});

test('بلا برامج: الشرح مفتوح ولو كان التفضيل مطويًا', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('la.programs.how', '0'); } catch { /* */ } });
  await setup(page, { programs: [] });
  await expect(page.locator('details.how-it-works')).toHaveAttribute('open', '');
  await expect(page.locator('.prog-drafts')).toHaveCount(0);
  await expect(page.locator('details.prog-archived')).toHaveCount(0);
});
