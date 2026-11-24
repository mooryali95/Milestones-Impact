// تدقيق لوحة الإدارة 2026-11-23، المرحلة 2: معمارية الشريط بخمس مجموعات (العمل، الأشخاص، المنهج والمحتوى، التقارير، الإعداد)،
// الإعداد مطوي افتراضيًا ويُفتح حين يكون قسمه هو المفتوح، والروابط القديمة تفتح شاشتها، وحال المجموعات محفوظة، والبحث يسمي المجموعة،
// وقوائم ⋯ للأفعال الثانوية في المشاركين والجهات. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const people = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'enrolled', placements: [], created_at: '2026-10-01' }];
const orgs = [{ id: 'o1', name: 'جهة النور', short_name: 'نور', sector: 'حكومي', status: 'active', invite_code: 'n1', stats: { total: 1, pending_approval: 0, active_week: 0 } }];

async function open(page, hash, { size = { width: 1280, height: 800 }, keep = false } = {}) {
  await page.setViewportSize(size);
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs, unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
      'admin.catalog': { success: false, message: 'لا كتالوج في هذا الاختبار' },
    };
    return route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((k) => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'super_admin' }, ts: Date.now() })); if (!k) localStorage.clear(); }, keep);
  await page.goto(BASE + hash);
  await page.reload();
  return page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
}
const GROUPS = ['العمل', 'الأشخاص', 'المنهج والمحتوى', 'التقارير', 'الإعداد'];
const groupBtn = (nav, g) => nav.getByRole('button', { name: new RegExp(`^مجموعة ${g}`) });

test('خمس مجموعات بترتيبها وبنودها، والإعداد في الأسفل مطوي افتراضيًا', async ({ page }) => {
  const nav = await open(page, '#/leaders/overview');
  await expect(nav.getByRole('group')).toHaveCount(5);
  for (const [i, g] of GROUPS.entries()) await expect(nav.getByRole('group').nth(i)).toHaveAttribute('aria-label', g);
  const items = (g) => nav.getByRole('group', { name: g }).locator('button:not(.la-tab-group-label)');
  await expect(items('العمل')).toHaveText([/نظرة عامة/, /المشاركون/, /الجهات/, /البرامج والدفعات/, /الحضور والجلسات/, /مشاريع التخرج/, /القاعة الحية/]);
  await expect(items('الأشخاص')).toHaveText([/الخبراء/]);
  await expect(items('المنهج والمحتوى')).toHaveText([/الرحلة والمتطلبات/, /الكتاب الأم/, /كتاب القائد/, /بنك المحتوى/, /مختبر القائد/, /أسئلة القياس/, /المستويات والتسكين/, /المسارات الـ27/, /بنك كاتون/]);
  // الأقسام المخفية عن المستخدمين (الميزات مطفأة في هذه الخلفية) آخر مجموعتها تحت «تجريبي» وبنقطتها
  for (const [g, k] of [['العمل', 'القاعة الحية'], ['المنهج والمحتوى', 'بنك كاتون'], ['التقارير', 'تقييم 360']]) {
    await expect(nav.getByRole('group', { name: g }).locator('.la-tab-trial')).toHaveText('تجريبي');
    await expect(nav.getByRole('group', { name: g }).getByRole('button', { name: new RegExp(k) }).locator('.ft-hidden-dot')).toHaveCount(1);
  }
  await expect(items('التقارير')).toHaveText([/الرؤية الشاملة/, /قياس الأثر/, /تقييم 360/]);
  await expect(groupBtn(nav, 'الإعداد')).toHaveAttribute('aria-expanded', 'false');
  await expect(items('الإعداد').first()).toBeHidden();
  for (const g of GROUPS.slice(0, 4)) await expect(groupBtn(nav, g)).toHaveAttribute('aria-expanded', 'true');
  // بلوحة المفاتيح: الزر يفتح المجموعة ويظهر بنودها
  await groupBtn(nav, 'الإعداد').focus();
  await page.keyboard.press('Enter');
  await expect(groupBtn(nav, 'الإعداد')).toHaveAttribute('aria-expanded', 'true');
  await expect(items('الإعداد')).toHaveText([/مركز البريد/, /قوالب البريد/, /الشهادات/, /المدفوعات/, /المساعد الذكي/, /الإعدادات العامة/, /صحة المنصة/]);
  // آخر مجموعة في الأسفل فعلًا
  const boxes = await Promise.all(GROUPS.map((g) => nav.getByRole('group', { name: g }).boundingBox()));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
});

test('قسم من الإعداد مفتوح: مجموعته مفتوحة ولا تُطوى، وحال المجموعات تُحفظ بعد التحديث', async ({ page }) => {
  let nav = await open(page, '#/leaders/mail');
  await expect(groupBtn(nav, 'الإعداد')).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: 'قوالب البريد' })).toHaveAttribute('aria-current', 'page');
  await groupBtn(nav, 'الإعداد').click();
  await expect(groupBtn(nav, 'الإعداد')).toHaveAttribute('aria-expanded', 'true');
  // طي «التقارير» يُحفظ: بعد التحديث تبقى مطوية
  await groupBtn(nav, 'التقارير').click();
  await expect(groupBtn(nav, 'التقارير')).toHaveAttribute('aria-expanded', 'false');
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  await expect(groupBtn(nav, 'التقارير')).toHaveAttribute('aria-expanded', 'false');
  await expect(groupBtn(nav, 'العمل')).toHaveAttribute('aria-expanded', 'true');
});

// كل رابط قديم يفتح شاشته نفسها: الأقسام بمفاتيحها، والأسماء البديلة القديمة للمساعد
const OLD = [['overview', 'نظرة عامة'], ['insight', 'الرؤية الشاملة'], ['participants', 'المشاركون'], ['orgs', 'الجهات'], ['tracks', 'المسارات الـ27'], ['programs', 'البرامج والدفعات'],
  ['hall', 'القاعة الحية'], ['journey', 'الرحلة والمتطلبات'], ['content', 'بنك المحتوى'], ['activities', 'الحضور والجلسات'], ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والتسكين'],
  ['book', 'الكتاب الأم'], ['handbook', 'كتاب القائد'], ['katon', 'بنك كاتون'], ['capstones', 'مشاريع التخرج'], ['lab', 'مختبر القائد'], ['experts', 'الخبراء'], ['mailcenter', 'مركز البريد'],
  ['mail', 'قوالب البريد'], ['impact', 'قياس الأثر'], ['f360', 'تقييم 360'], ['certs', 'الشهادات'], ['payments', 'المدفوعات'], ['settings', 'الإعدادات العامة'], ['ai', 'المساعد الذكي'],
  ['agent', 'المساعد الذكي'], ['guidance', 'المساعد الذكي'], ['guidance-access', 'المساعد الذكي']];
test('الروابط القديمة: كل #/leaders/<قسم> يفتح القسم نفسه ومجموعته مفتوحة', async ({ page }) => {
  const nav = await open(page, '#/leaders/overview');
  for (const [k, label] of OLD) {
    await page.evaluate((h) => { location.hash = h; }, `#/leaders/${k}`);
    const cur = nav.locator('[aria-current="page"]');
    await expect(cur, k).toHaveCount(1);
    await expect(cur, k).toContainText(label);
    await expect(cur, k).toBeVisible();
  }
});

test('البحث (Ctrl K) يسمي مجموعة كل قسم، ويجد القسم باسم مجموعته', async ({ page }) => {
  await open(page, '#/leaders/overview');
  const pal = page.getByRole('dialog');
  // المفتاح قد يسبق تركيب مستمعه أثناء تحميل الشاشة: يُعاد حتى تظهر اللوحة (لا يُعاد بعد ظهورها فلا تُغلق)
  await expect(async () => { await page.keyboard.press('Control+k'); await expect(pal).toBeVisible({ timeout: 1000 }); }).toPass();
  await pal.getByRole('combobox').or(pal.getByRole('textbox')).first().fill('قوالب البريد');
  await expect(pal.getByRole('option').filter({ hasText: 'قوالب البريد' }).first()).toContainText('الإعداد');
  await pal.getByRole('combobox').or(pal.getByRole('textbox')).first().fill('التقارير');
  await expect(pal.getByRole('option').filter({ hasText: 'قياس الأثر' })).toHaveCount(1);
});

test('المشاركون: «+ مشارك» ظاهر والاستيراد وفاعلية التذكير في «المزيد»؛ والجهة فعل أساسي واحد والبقية في ⋯', async ({ page }) => {
  await open(page, '#/leaders/participants');
  await expect(page.getByRole('button', { name: '+ مشارك' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'استيراد', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'فاعلية التذكير', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'المزيد من إجراءات المشاركين' }).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['استيراد', 'فاعلية التذكير']);
  await page.getByRole('menuitem', { name: 'استيراد' }).click();
  await expect(page.getByRole('dialog', { name: 'استيراد مشاركين' })).toBeVisible();

  await page.goto(BASE + '#/leaders/orgs');
  const card = page.locator('.la-org', { hasText: 'جهة النور' });
  await expect(card.locator('.la-org-acts').getByRole('button', { name: 'لوحة الجهة' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'نسخ رابط الدعوة' })).toHaveCount(0);
  await card.getByRole('button', { name: 'إجراءات أخرى لجهة «جهة النور»' }).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['نسخ رابط الدعوة', 'تحرير']);
});

test('الهاتف 390: لا تمرير أفقي للصفحة والمجموعات وأزرارها في الشريط', async ({ page }) => {
  const nav = await open(page, '#/leaders/participants', { size: { width: 390, height: 844 } });
  await expect(groupBtn(nav, 'العمل')).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
  await expect(groupBtn(nav, 'الإعداد')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'المزيد من إجراءات المشاركين' })).toBeVisible();
});
