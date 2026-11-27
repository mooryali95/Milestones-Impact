// تدقيق لوحة الإدارة 2026-11-23، المرحلة 1 (مكاسب سريعة): الشريط الجانبي لا يُقص ولا تلتف أسماؤه، وأهداف الجدول 24×24
// على الأقل (WCAG 2.2 معيار 2.5.8)، ولمحة الرحلة لا تطبع «undefined»، ورأس الصفحة سطر واحد، وفعل أساسي واحد لكل صف دفعة.
// ترتيب «نظرة عامة» (القرارات أولًا) في admin-today.spec.js. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const lv = (m, i, l) => [['milestone', m], ['impact', i], ['leadership', l]].map(([dimension, level]) => ({ dimension, level, approved_at: '2026-10-01' }));
const people = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'pending_approval', placements: lv('beginner', 'beginner', 'intermediate'), created_at: '2026-10-01' },
  { id: 'p2', full_name: 'Omar Ali', email: 'o@x.com', job_title: 'مهندس', organization_id: null, organization_name: 'شركة', status: 'enrolled', placements: lv('advanced', 'advanced', 'advanced'), created_at: '2026-10-02' },
];
// مراحل بلا duration_days: الحال التي طبعت «undefined أيام» في بطاقة «المدة»
const catalog = {
  success: true,
  journey_stages: [
    { key: 's1', title_ar: 'التهيئة', phase: 'admission', sort: 1, duration_label: 'أسبوع', active: true },
    { key: 's2', title_ar: 'التأهيل', phase: 'qualification', sort: 2, duration_label: 'شهر', active: true },
  ],
  stage_requirements: [{ id: 'r1', stage_key: 's1', code: 'T-1', title_ar: 'خطة التطوير', kind: 'upload', sort: 1, required: true, active: true }],
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [], tracks: [], track_stats: {},
};
const cohorts = [{ id: 'c1', name: 'سفراء 2026', program_id: 'pa', status: 'running', kind: 'org', organization_id: 'o1', members: 3 }];

async function open(page, hash, { size = { width: 1280, height: 800 }, role = 'admin' } = {}) {
  await page.setViewportSize(size);
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.catalog': catalog,
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
      'admin.programs': { success: true, programs: [{ id: 'pa', name: 'برنامج سفراء', versions: [], is_default: false }], cohorts, organizations: [] },
      // admin.settings بلا قيم: القاعة وكاتون و360 مطفأة، فتظهر علامة «مخفي عن المستخدمين» على أقسامها
    };
    return route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() })); localStorage.clear(); }, role);
  await page.goto(BASE + hash);
  await page.reload();
  return page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
}

test('الشريط الجانبي: داخل الشاشة بتمرير داخلي يبلغ آخر بند، ولا يلتف اسم قسم إلى سطرين', async ({ page }) => {
  const nav = await open(page, '#/leaders/participants');
  await expect(nav.getByRole('button', { name: /المشاركون/ })).toBeVisible();
  // بعد تمرير الصفحة يلتصق الشريط تحت الرأس ولا يتجاوز أسفل الشاشة: ما لا يتسع يُمرَّر داخله، لا يُقص خارجها
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 600); });
  await expect.poll(async () => (await nav.boundingBox()).y).toBeLessThan(90);
  const box = await nav.boundingBox();
  const vh = page.viewportSize().height;
  expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
  const m = await nav.evaluate((el) => ({ oy: getComputedStyle(el).overflowY, sh: el.scrollHeight, ch: el.clientHeight, pos: getComputedStyle(el).position }));
  expect(m.pos).toBe('sticky');
  if (m.sh > m.ch) expect(['auto', 'scroll']).toContain(m.oy);
  // آخر بند يُبلغ بالتمرير ويُرى كاملًا داخل الشريط (مجموعة الإعداد مطوية افتراضيًا منذ المرحلة 2، فتُفتح ليُختبر آخر بند فعلًا)
  await nav.getByRole('button', { name: 'مجموعة الإعداد' }).click();
  // وآخر مجموعة «تجريبي» (الأقسام المخفية عن المستخدمين، مطوية افتراضيًا منذ المرحلة 7)
  await nav.getByRole('button', { name: 'مجموعة تجريبي' }).click();
  const items = nav.locator('.la-tab-group > button:not(.la-tab-group-label)');
  const last = items.last();
  await last.scrollIntoViewIfNeeded();
  const lb = await last.boundingBox();
  const nb = await nav.boundingBox();
  expect(lb.y).toBeGreaterThanOrEqual(nb.y - 1);
  expect(lb.y + lb.height).toBeLessThanOrEqual(nb.y + nb.height + 1);
  // «مخفي عن المستخدمين» نقطة بتلميح ونص مسموع، لا شارة عريضة
  const hall = nav.getByRole('button', { name: /القاعة الحية/ });
  await expect(hall.locator('.ft-hidden-dot')).toHaveAttribute('title', 'مخفي عن المستخدمين');
  await expect(hall).toContainText('مخفي عن المستخدمين');
  // كل اسم في سطر واحد: ارتفاع البند لا يبلغ سطرين، وكل بند هدف 24 بكسل على الأقل
  const heights = await items.evaluateAll((bs) => bs.filter((b) => b.offsetParent).map((b) => [b.textContent, b.getBoundingClientRect().height]));
  for (const [name, h] of heights) {
    expect(h, name).toBeLessThan(40);
    expect(h, name).toBeGreaterThanOrEqual(24);
  }
});

test('رأس الصفحة سطر واحد مضغوط، ومبدّل المنتج باقٍ', async ({ page }) => {
  await open(page, '#/leaders/participants');
  const head = page.locator('.page-header').first();
  await expect(head.getByRole('heading', { level: 1, name: 'المشاركون' })).toBeVisible();
  expect((await head.boundingBox()).height).toBeLessThan(60);
  // النطاق في عنوان المستند لا في الترويسة (تصور 2026-11-26، المرحلة 4)
  await expect(head).not.toContainText('sunkvalue');
  await expect(page).toHaveTitle(/^المشاركون \(leaders\.sunkvalue\.com\)/);
  // العنوان يتبع القسم (المرحلة 7)
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الجهات', exact: true }).click();
  await expect(page.locator('.page-header').first().getByRole('heading', { level: 1, name: 'الجهات' })).toBeVisible();
  await expect(page).toHaveTitle(/^الجهات \(leaders\.sunkvalue\.com\)/);
  await expect(page.locator('.ctx-tab').first()).toBeVisible();
  // أول المحتوى قبل 200 بكسل من أعلى الصفحة (كان نحو 250 للرأس وحده)
  const nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  expect((await nav.boundingBox()).y).toBeLessThan(200);
});

test('جدول المشاركين: أسهم الفرز وخانات التحديد 24×24 بكسل على الأقل', async ({ page }) => {
  await open(page, '#/leaders/participants');
  const table = page.locator('.data-table').first();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const targets = table.locator('.th-sort, input[type="checkbox"]');
  expect(await targets.count()).toBeGreaterThanOrEqual(5);
  // العمود الاختياري المخفي (منتقي «الأعمدة») ليس هدفًا: يُقاس الظاهر وحده
  const sizes = await targets.evaluateAll((els) => els.filter((e) => e.closest('th, td') && getComputedStyle(e.closest('th, td')).display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute('aria-label') || e.textContent, r.width, r.height]; }));
  for (const [name, w, h] of sizes) {
    expect(w, name).toBeGreaterThanOrEqual(24);
    expect(h, name).toBeGreaterThanOrEqual(24);
  }
});

test('الرحلة والمتطلبات: لمحة الرحلة بمراحل بلا مدد لا تطبع «undefined» ولا «NaN»، والمدة «—»', async ({ page }) => {
  await open(page, '#/leaders/journey');
  // المرحلة 21: تفصيل الأنشطة الزمني مطوي تحت الشريط القصير
  await page.locator('details.j-tl-detail > summary').click();
  const card = page.locator('.jt').first();
  await expect(card).toBeVisible();
  await expect(page.locator('#screen-dashboard')).not.toContainText('undefined');
  await expect(page.locator('#screen-dashboard')).not.toContainText('NaN');
});

test('جدول الدفعات: فعل أساسي واحد ظاهر لكل صف، والبقية في قائمة ⋯', async ({ page }) => {
  await open(page, '#/leaders/programs');
  const row = page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' });
  await expect(row.getByRole('button', { name: 'افتح ملف الدفعة' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'تحرير' })).toHaveCount(0);
  await expect(row.getByRole('link')).toHaveCount(0);
  const more = row.getByRole('button', { name: 'إجراءات أخرى للدفعة «سفراء 2026»' });
  await more.click();
  const menu = page.getByRole('menu', { name: 'إجراءات أخرى للدفعة «سفراء 2026»' });
  // «هويتها في الوثيقة»: هوية الدفعة في الوثيقة المطبوعة (CohortIdentity.jsx، ترحيل 20261129100000)
  await expect(menu.getByRole('menuitem')).toHaveText(['تحرير', 'الرحلة والمدد', 'الفريق والمجموعات', 'الرؤية', 'هويتها في الوثيقة', 'صدّر مبادراتها']);
  await menu.getByRole('menuitem', { name: 'الرحلة والمدد' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=journey$/);
});
