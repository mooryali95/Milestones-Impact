// تصور تبويبات الإدارة 2026-11-24 (المرحلتان أ وأ2، معتمد): «الإعداد › صحة المنصة» بيت جاهزية الإطلاق وفحوص المنصة
// وحالة النظام وبيئة التجربة، كل بند ناقص برابط إلى مكان إصلاحه؛ وأعمدة المشاركين بثلاث طبقات ومنتقٍ محفوظ لكل مدير
// واسم ثابت عند التمرير الأفقي. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const ops = () => ({
  success: true, at: ago(0),
  mail: { key: true, cap: 80, sent: 12, codes: { sent: 9, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 } },
  slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null },
  alerts: { email: true, webhook: true },
});
const health = {
  success: true, pending_migrations: [{ name: '20261201000000_x', gate: 'blocking' }], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 },
  readiness: [
    { key: 'baseline', ok: true, where: 'assessment', label: 'أسئلة القياس القبلي' },
    { key: 'cert', ok: false, where: 'certs', label: 'قالب الشهادة بموقّع' },
    { key: 'cohort', ok: false, where: 'programs', label: 'كل برنامج له دفعة', refs: [{ kind: 'program', id: 'pg1', name: 'برنامج القيادة' }] },
  ],
};
const ph = { success: true, level: 'bad', checks: [
  { key: 'migrations', label: 'ترحيلات القاعدة', level: 'bad', line: '1 لم يُطبَّق', remedy: 'شغّل سير «migrate».' },
  { key: 'cron', label: 'المهمة الساعية', level: 'ok', line: 'تعمل', remedy: '' },
] };
const pl = (m) => [['milestone', m], ['impact', 'beginner'], ['leadership', 'intermediate']].map(([dimension, level]) => ({ dimension, level, approved_at: null }));
const people = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, full_name: `مشارك رقم ${i}`, email: `u${i}@x.com`, organization_id: 'o1', organization_name: 'وزارة التجربة', job_title: 'مدير', status: 'enrolled', placements: pl('beginner'), waiting: { who: null }, created_at: '2026-10-01' }));
const orgs = [{ id: 'o1', name: 'وزارة التجربة', short_name: 'وت', status: 'active', seats: 10, stats: { total: 4, registered: 4, profiled: 4, assessed: 4, approved: 4, completed: 0, pending_approval: 0, active_week: 1 } }];

async function setup(page, { role = 'super_admin', hash = '#/leaders/health', email = 'a@x.com', width = 1280, keepStorage = false } = {}) {
  await page.setViewportSize({ width, height: 900 });
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.ops-health': ops(), 'admin.health': health, 'admin.platform-health': ph,
      'admin.orgs': { success: true, orgs, unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.inbox': { success: true, total: 0, items: [], skipped: [], counts: {} }, 'admin.overview': { success: true, total: 4, by_status: {} },
      'admin.today': { success: true, alerts: [], pulse: [], skipped: [], unchecked: [] }, 'admin.programs': { success: true, programs: [], cohorts: [], organizations: [] },
      'admin.demo-links': { success: true, links: [] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(([r, e, keep]) => {
    sessionStorage.clear();
    if (!keep) { try { localStorage.clear(); } catch { /* */ } }
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'هند', email: e, role_id: r }, ts: Date.now() }));
  }, [role, email, keepStorage]);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  return calls;
}

test('صحة المنصة: في مجموعة الإعداد، برأس حكم واحد وكل بطاقة مرة واحدة، وكل ناقص برابط إصلاحه', async ({ page }) => {
  const calls = await setup(page);
  const head = page.locator('.ph-head');
  await expect(head).toHaveAttribute('data-level', 'bad');
  await expect(head).toContainText('صحة المنصة: خلل');
  const ready = page.getByRole('region', { name: 'جاهزية الإطلاق', exact: true });
  await expect(ready).toContainText('1 من 3');
  await expect(ready.locator('li[data-key="cert"]').getByRole('link', { name: /اضبطه/ })).toHaveAttribute('href', '#/leaders/certs');
  await expect(ready.getByRole('link', { name: 'برنامج القيادة' })).toHaveAttribute('href', '#/leaders/programs');
  // المكتمل مطوي تحت عدده
  await expect(ready.getByText('أسئلة القياس القبلي')).toBeHidden();
  await ready.locator('summary').click();
  await expect(ready.getByText('أسئلة القياس القبلي')).toBeVisible();
  const checks = page.getByRole('region', { name: 'الفحوص التشغيلية' });
  await expect(checks.locator('.ph-row')).toHaveCount(2);
  await expect(checks.locator('.ph-row[data-level="bad"]')).toContainText('شغّل سير «migrate»');
  await expect(page.getByRole('status', { name: 'حالة النظام' })).toContainText('20261201000000_x.sql');
  // صحة البريد حكمها سطر برابط إلى مركز البريد، والبطاقة الكاملة هناك وحدها
  await expect(page.locator('#ops-health')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'البريد والتنبيه' }).getByRole('link', { name: /مركز البريد/ })).toHaveAttribute('href', '#/leaders/mailcenter');
  await expect(page.getByRole('region', { name: 'جاهزية الجهات' })).toBeVisible();
  // بيئة التجربة مطوية
  await expect(page.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeHidden();
  await page.locator('#ph-demo > summary').click();
  await expect(page.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeVisible();
  // أعد الفحص يطلب من جديد
  const n = () => calls.filter((c) => c.action === 'admin.platform-health').length;
  const before = n();
  const cnt = (k) => calls.filter((c) => c.action === k).length;
  const opsBefore = cnt('admin.ops-health'), orgsBefore = cnt('admin.orgs');
  await page.getByRole('button', { name: 'أعد الفحص' }).click();
  await expect.poll(n).toBe(before + 1);
  // ومعها صحة البريد والجهات
  await expect.poll(() => cnt('admin.ops-health')).toBeGreaterThan(opsBefore);
  await expect.poll(() => cnt('admin.orgs')).toBeGreaterThan(orgsBefore);
  // في الشريط تحت «الإعداد»
  const nav = page.getByRole('button', { name: 'صحة المنصة' });
  await expect(nav).toHaveClass(/on/);
});

test('صحة المنصة للمراقب: الفحوص وحالة النظام بلا جاهزية ولا بيئة تجربة', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await expect(page.getByRole('region', { name: 'الفحوص التشغيلية' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'جاهزية الإطلاق', exact: true })).toHaveCount(0);
  await expect(page.locator('#ph-demo')).toHaveCount(0);
});

test('البحث (Ctrl K) يجد «صحة المنصة» بجاهزية الإطلاق', async ({ page }) => {
  await setup(page, { hash: '#/leaders/overview' });
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('جاهزية الإطلاق');
  await expect(page.getByRole('option', { name: /صحة المنصة/ }).first()).toBeVisible();
});

const table = (page) => page.locator('table.pt-table');
const visibleHeads = (page) => table(page).locator('thead th').evaluateAll((ths) => ths.filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.textContent.replace(/[▲▼↕]/g, '').trim()));

test('أعمدة المشاركين: الدائمة ظاهرة، والاختيارية مخفية حتى تُختار، والاختيار يُحفظ لهذا المدير وحده', async ({ page }) => {
  await setup(page, { hash: '#/leaders/participants' });
  await expect(table(page).locator('tbody tr')).toHaveCount(4);
  let heads = await visibleHeads(page);
  for (const h of ['الاسم', 'الحالة', 'أين توقف', 'بانتظار', 'الجهة', 'المسار']) expect(heads, h).toContain(h);
  expect(heads).not.toContain('التسجيل');
  expect(heads.some((h) => /المنهجية|الأثر|القيادة/.test(h))).toBe(false);
  await page.getByRole('button', { name: /^الأعمدة/ }).click();
  // التركيز الأول على أول خانة، وEscape يغلق ويعيد التركيز إلى الزر
  await expect(page.getByRole('group', { name: 'أعمدة اختيارية' }).getByLabel('المستويات الثلاثة')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'أعمدة اختيارية' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^الأعمدة/ })).toBeFocused();
  await page.getByRole('button', { name: /^الأعمدة/ }).click();
  await page.getByRole('group', { name: 'أعمدة اختيارية' }).getByLabel('تاريخ التسجيل').check();
  heads = await visibleHeads(page);
  expect(heads).toContain('التسجيل');
  await page.reload();
  await expect(table(page).locator('tbody tr')).toHaveCount(4);
  expect(await visibleHeads(page)).toContain('التسجيل');
  await expect(page.getByRole('button', { name: /^الأعمدة \(\+1\)/ })).toBeVisible();
  // مدير آخر على المتصفح نفسه لا يرث الاختيار
  await setup(page, { hash: '#/leaders/participants', email: 'b@x.com', keepStorage: true });
  await expect(table(page).locator('tbody tr')).toHaveCount(4);
  expect(await visibleHeads(page)).not.toContain('التسجيل');
});

test('أعمدة المشاركين: الجهة والمسار تختفيان دون 1280، والاسم ثابت عند التمرير الأفقي، وبطاقات الهاتف كما هي', async ({ page }) => {
  await setup(page, { hash: '#/leaders/participants', width: 1100 });
  await expect(table(page).locator('tbody tr')).toHaveCount(4);
  const heads = await visibleHeads(page);
  expect(heads).not.toContain('الجهة');
  expect(heads).not.toContain('المسار');
  // كل الأعمدة الاختيارية ظاهرة تجبر الجدول على التمرير داخل إطاره
  await page.getByRole('button', { name: /^الأعمدة/ }).click();
  const g = page.getByRole('group', { name: 'أعمدة اختيارية' });
  await g.getByLabel('المستويات الثلاثة').check();
  await g.getByLabel('تاريخ التسجيل').check();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 760, height: 900 });
  const name = table(page).locator('tbody tr').first().locator('td.col-name');
  await expect(name).toHaveCSS('position', 'sticky');
  const wrap = page.locator('.table-wrap').filter({ has: table(page) });
  const scrollable = await wrap.evaluate((w) => w.scrollWidth > w.clientWidth);
  expect(scrollable).toBe(true);
  const x0 = (await name.boundingBox()).x;
  await wrap.evaluate((w) => { w.scrollLeft = -400; w.scrollLeft = w.scrollLeft || 400; });
  await page.waitForTimeout(100);
  expect(Math.abs((await name.boundingBox()).x - x0)).toBeLessThan(2);
  // الهاتف: البطاقات بكل قيمها كما كانت (لا إخفاء ولا تثبيت)
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(table(page).locator('thead')).toBeHidden();
  const cell = table(page).locator('tbody tr').first().locator('td[data-label="الجهة"]');
  await expect(cell).toBeVisible();
  await expect(name).not.toHaveCSS('position', 'sticky');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
