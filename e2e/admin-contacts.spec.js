// طلبات التواصل (المرحلة 1 من تحسين شاشات الإدارة): بطاقات مرشِّحة، وتنقل بالأسهم، وتعليم مؤجل بالمقروء، ووسم المتأخر،
// وتاريخ نسبي، وتحديث في الخلفية، وتأكيد قبل «تم الرد». الخلفية مُحاكاة. SHOTS_DIR: لقطات 1440 و390.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
const ago = (d, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString();
const contacts = [
  { id: 'c1', name: 'ريم السالم', organization: 'شركة الأفق للاستشارات', email: 'reem@x.com', phone: '0500000001', interest: 'leaders', product: 'MI-LEADERS', status: 'new', created_at: ago(0, 2), message: 'نرغب في تسجيل عشرين من قادتنا في الدفعة القادمة، فما الخطوات؟\nhttps://example.com' },
  { id: 'c2', name: 'فهد العتيبي', organization: 'جمعية النماء', email: 'fahd@x.com', phone: '0500000002', interest: 'assessment', product: 'MI-ASSESSMENT', status: 'new', created_at: ago(5), message: 'سؤال عن مقياس الجاهزية لفريقنا.' },
  { id: 'c3', name: 'نورة القحطاني', organization: 'وزارة المثال', email: 'noura@x.com', phone: '0500000003', interest: 'partnership', product: 'MI-HOME', status: 'read', created_at: ago(12), message: 'نود مناقشة شراكة.' },
  { id: 'c4', name: 'Omar Haddad', organization: null, email: 'omar@y.com', phone: '', interest: 'general', product: 'MI-HOME', status: 'replied', created_at: ago(40), message: '' },
  { id: 'c5', name: 'سلمان', organization: 'هيئة', email: 'bad@@x', phone: '', interest: 'matrix', product: 'MI-HOME', status: 'archived', created_at: ago(400), message: 'قديم' },
];

async function setup(page, { size = { width: 1440, height: 900 }, replies = {} } = {}) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = { 'list-contacts': { success: true, contacts }, 'update-contact': { success: true }, 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] }, ...replies };
    await route.fulfill({ json: typeof r[b.action] === 'function' ? r[b.action](b) : (r[b.action] ?? { success: true, contacts: [] }) });
  });
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: { success: true } }));
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: 'super_admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(`${BASE}#/contacts`);
  await page.reload();
  await expect(page.locator('.ct-open').first()).toBeVisible();
  return calls;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/contacts-${name}-${page.viewportSize().width}.png`, fullPage: true }); } };

test('الجدول بالعرض كله حتى يُختار طلب، والجديد بنقطة وخط عريض، والتاريخ نسبي بوصفه الكامل', async ({ page }) => {
  await setup(page);
  await expect(page.locator('aside.ct-pane')).toHaveCount(0);
  await expect(page.locator('tr.ct-new')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'جديد: ريم السالم' })).toBeVisible();
  await expect(page.locator('tr', { hasText: 'ريم السالم' }).locator('time')).toHaveText(/قبل ساعتين/);
  await expect(page.locator('tr', { hasText: 'ريم السالم' }).locator('td.ct-date .sr-only')).toContainText(/\d{4}/);
  await expect(page.locator('thead')).not.toContainText('البريد');
  // المتأخر: «بانتظار الرد» بعد المهلة لما لم يُرد عليه
  await expect(page.locator('tr', { hasText: 'فهد العتيبي' }).locator('.tag-warn')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Omar' }).locator('.tag-warn')).toHaveCount(0);
  await shot(page, 'list');
});

test('البطاقات تكتب في مرشح الحالة، ومرشح المتأخر، والتصدير بلا بيانات شخصية افتراضيًا', async ({ page }) => {
  await setup(page);
  const cards = page.getByRole('group', { name: 'ترشيح بالحالة' });
  await expect(cards.getByRole('button', { name: /جديدة/ })).toContainText('2');
  await cards.getByRole('button', { name: /تم الرد/ }).click();
  await expect(page.locator('tbody .ct-open')).toHaveCount(1);
  await expect(page).toHaveURL(/status=replied/);
  await cards.getByRole('button', { name: /عرض الكل/ }).click();
  await page.getByLabel('المتأخر').selectOption('1');
  await expect(page.locator('tbody .ct-open')).toHaveCount(2);
  await page.getByLabel('المتأخر').selectOption('');
  await page.getByRole('button', { name: /تصدير Excel/ }).click();
  const dlg = page.getByRole('dialog', { name: 'تصدير Excel' });
  await expect(dlg.getByLabel('البريد')).not.toBeChecked();
  await expect(dlg.getByLabel('الاسم')).toBeChecked();
  await dlg.getByLabel('البريد').check();
  await expect(dlg.getByRole('status')).toContainText('بيانات شخصية');
});

test('الفتح لا يعلّم مقروءًا فورًا، و«غير مقروء» يعيده، والرد يسأل قبل «تم الرد»', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: /ريم السالم/ }).click();
  const pane = page.getByRole('complementary', { name: /ريم السالم/ });
  await expect(pane.locator('.ct-msg')).toContainText('https://example.com');
  await expect(pane.locator('.ct-msg a')).toHaveCount(0);   // الرسالة نص لا روابط
  expect(calls.filter((c) => c.action === 'update-contact')).toHaveLength(0);
  await expect.poll(() => calls.filter((c) => c.action === 'update-contact').map((c) => c.fields.status)).toEqual(['read']);
  await pane.getByRole('button', { name: 'علّمه غير مقروء' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'update-contact').map((c) => c.fields.status)).toEqual(['read', 'new']);
  await page.waitForTimeout(1800);
  expect(calls.filter((c) => c.action === 'update-contact')).toHaveLength(2);   // لا يعيده المؤقت مقروءًا
  await expect(pane.getByRole('button', { name: 'نسخ البريد' })).toBeVisible();
  await page.evaluate(() => { window.open = () => null; });
  await pane.getByRole('button', { name: /إرسال رد بالبريد/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  expect(calls.filter((c) => c.fields?.status === 'replied')).toHaveLength(0);
  await shot(page, 'pane');
  await page.keyboard.press('Escape');
  await expect(page.locator('aside.ct-pane')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ريم السالم/ })).toBeFocused();
});

test('البريد غير الصالح لا يصنع رابط رد', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'سلمان' }).click();
  const pane = page.getByRole('complementary', { name: /سلمان/ });
  await expect(pane.getByRole('button', { name: /إرسال رد بالبريد/ })).toHaveCount(0);
  await expect(pane).toContainText('البريد غير صالح');
});

test('التحديث في الخلفية لا يمسح الصفوف ولا يغلق اللوحة، وفشله تنبيه', async ({ page }) => {
  let fail = false;
  await setup(page, { replies: { 'list-contacts': () => (fail ? { success: false, message: 'انقطع' } : { success: true, contacts }) } });
  await page.getByRole('button', { name: /نورة/ }).click();
  fail = true;
  await page.getByRole('button', { name: 'تحديث' }).click();
  await expect(page.getByRole('alert')).toContainText('تعذّر التحديث');
  await expect(page.locator('tbody .ct-open')).toHaveCount(5);
  await expect(page.getByRole('complementary', { name: /نورة/ })).toBeVisible();
});

test('على 390: درج بالرسالة وبلا تمرير أفقي', async ({ page }) => {
  await setup(page, { size: { width: 390, height: 844 } });
  await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
  await shot(page, 'list');
  await page.getByRole('button', { name: /ريم السالم/ }).click();
  await expect(page.getByRole('dialog', { name: 'تفاصيل طلب ريم السالم' })).toBeVisible();
  await shot(page, 'drawer');
  await page.keyboard.press('Escape');
  await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0);
});
