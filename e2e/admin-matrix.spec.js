// مصفوفة التأثير داخل لوحة الإدارة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const SHOT = process.env.SHOT_DIR;
const regs = [
  { id: 1, name: 'هيئة التطوير', email: 'a@x.com', phone: '0500', registeredAt: '2026-10-01', updatedAt: '2026-10-28', submitted: true, submittedAt: '2026-10-25', reopenRequested: true,
    dates: { 'creation-1': '2026-11-01', 'innovation-1': '2026-11-05', 'establishment-2': '2026-11-10', 'creation-2': '2026-11-12' }, confirmed: { 'creation-1': true },
    demographic_analysis: [{ name: 'وزير', role: 'راعٍ', power: { knowledge: 80, social: 70 } }] },
  { id: 2, name: 'شركة الطاقة', email: 'b@x.com', registeredAt: '2026-09-01', updatedAt: '2026-09-02', submitted: false, dates: {}, confirmed: {} },
];

async function admin(page) {
  const calls = [];
  await page.route(/rest\/v1\/process_details/, (r) => r.fulfill({ json: [] }));
  await page.route(/rest\/v1\/app_content/, (r) => r.fulfill({ json: [{ key: 'hero_title', value: 'هندسة القيمة' }, { key: 'cta_start', value: 'ابدأ رحلتك' }] }));
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = { 'list-regs': { success: true, registrations: regs }, 'unlock-reg': { success: true }, 'update-reg': { success: true }, 'save-process': { success: true }, 'save-content': { success: true }, 'list-contacts': { success: true, contacts: [] } }[b.action];
    await route.fulfill({ json: r ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: false, message: 'x' } }));
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'مصفوفة التأثير' }).click();
  return calls;
}

test('مصفوفة التأثير في اللوحة: نظرة عامة، والتسجيلات بالفلترة، وفتح خطة للتعديل', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  const calls = await admin(page);
  await expect(page.getByText('يحتاج تدخلك')).toBeVisible();
  await expect(page.locator('.la-reqs')).toContainText('هيئة التطوير');
  await expect(page.locator('.la-reqs')).toContainText('شركة الطاقة');
  if (SHOT) await page.screenshot({ path: `${SHOT}/matrix.png`, fullPage: true });
  await page.locator('.la-tabs').getByRole('button', { name: 'التسجيلات' }).click();
  await expect(page.locator('.mx-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: /تطلب إعادة الفتح/ }).click();
  await expect(page.locator('.mx-table tbody tr')).toHaveCount(1);
  await page.locator('.mx-table tbody tr').first().click();
  await expect(page.getByRole('heading', { name: 'هيئة التطوير' })).toBeVisible();
  expect(page.url()).toContain('#/matrix/regs/1');
  await page.getByRole('button', { name: 'التحليل' }).click();
  await expect(page.locator('.la-card').last()).toContainText('الجاهزية');
  await page.getByRole('button', { name: 'اقبل إعادة الفتح' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'unlock-reg')).toMatchObject({ id: 1 });
});

// «توزيع المسارات»: المقام عمليات المسار × المسجلين، فمسار اكتمل حجزه يبلغ 100% (ضمانة نُقلت من اللوحة القديمة)
test('الإحصاءات: مسار اكتمل حجزه يبلغ عموده كاملًا', async ({ page }) => {
  const full = {};
  for (const t of ['creation', 'innovation', 'establishment', 'making']) for (let ph = 1; ph <= 4; ph++) full[`${t}-${ph}`] = '2026-11-0' + ph;
  regs.splice(0, regs.length,
    { id: 'a', name: 'مكتمل', dates: full, confirmed: {}, registeredAt: '2026-10-01' },
    { id: 'b', name: 'جزئي', dates: { 'creation-1': '2026-11-01', 'creation-2': '2026-11-02' }, confirmed: {}, registeredAt: '2026-10-02' });
  await admin(page);
  await page.locator('.la-tabs').getByRole('button', { name: 'الإحصاءات' }).click();
  const widths = await page.locator('.la-fn-bar i').evaluateAll((els) => els.map((e) => e.style.width));
  expect(widths).toEqual(['75%', '50%', '50%', '50%']);
});

test('تحكم كامل: تعديل المواعيد والتأكيد، ورفض إعادة الفتح، وتحرير العملية ونصوص الموقع', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1100 });
  const calls = await admin(page);
  await page.locator('.la-tabs').getByRole('button', { name: 'التسجيلات' }).click();
  await page.locator('.mx-table tbody tr', { hasText: regs[0].name }).click();
  const d = page.locator('input[type=date]').first();
  await d.fill('2026-12-01');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'احفظ المواعيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'update-reg' && c.fields.dates)).toBeTruthy();
  const sent = calls.find((c) => c.action === 'update-reg' && c.fields.dates).fields;
  expect(Object.values(sent.dates)).toContain('2026-12-01');
  if (regs[0].reopenRequested) {
    await page.getByRole('button', { name: 'ارفض الطلب' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'update-reg' && c.fields.reopenRequested === false)).toBeTruthy();
  }
  await page.getByRole('button', { name: '→ كل التسجيلات' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'المحتوى' }).click();
  await page.locator('.la-reqs .la-link').first().click();
  await page.getByLabel('البصيرة المنهجية').fill('بصيرة جديدة');
  await page.getByRole('button', { name: 'احفظ العملية' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'save-process')).toMatchObject({ process_key: 'creation-1', updates: { insight: 'بصيرة جديدة' } });
  await page.getByRole('button', { name: 'نصوص الموقع' }).click();
  await page.getByLabel('hero_title').fill('هندسة القيمة الكامنة');
  await page.getByRole('button', { name: 'احفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'save-content')).toMatchObject({ key: 'hero_title', value: 'هندسة القيمة الكامنة' });
});
