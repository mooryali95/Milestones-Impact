// المرحلة 22 (تصور الرحلة والمسار 2026-11-27): وضع العرض والبناء، واللوحة الجانبية، وقائمة «⋯»، والنقل الذري، والإخفاء بدل الحذف.
// الخلفية مُحاكاة. BUILD_SHOTS: مجلد تُحفظ فيه لقطات 375 و1280 بالاتجاه من اليمين إلى اليسار.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.BUILD_SHOTS || '';
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'ojt', title_ar: 'التطبيق', phase: 'qualification', sort: 3, duration_days: 28, active: true },
  { key: 'report', title_ar: 'التقرير النهائي', phase: 'impact', sort: 4, duration_days: 7, active: true },
];
const reqs = [
  { id: 'r1', code: 'P-INFO', stage_key: 'profile', kind: 'auto', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول', sort: 1, active: true },
  { id: 'r3', code: 'T-UP', stage_key: 'training', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 2, active: true },
  { id: 'r4', code: 'O-1', stage_key: 'ojt', kind: 'check', required: true, title_ar: 'سجل التطبيق', sort: 1, active: true },
];

async function setup(page, { width = 1280, role = 'admin', replies = {} } = {}) {
  await page.setViewportSize({ width, height: width > 500 ? 900 : 812 });
  const calls = [];
  const catalog = { success: true, program_id: 'pa', journey_stages: stages, stage_requirements: reqs.map((r) => ({ ...r })),
    instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {} };
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const base = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': catalog,
      'admin.programs': { success: true, programs: [{ id: 'pa', name: 'برنامج القادة', is_default: true, versions: [] }], cohorts: [], organizations: [] },
      'admin.milestones': { success: true, milestones: [] },
    };
    const r = replies[b.action] ?? base[b.action] ?? { success: true };
    await route.fulfill({ json: typeof r === 'function' ? r(b) : r });
  });
  await page.goto(BASE);
  await page.evaluate((role_id) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id }, ts: Date.now() })), role);
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الرحلة والمتطلبات' }).click();
  await expect(page.locator('.j-board')).toBeVisible();
  return calls;
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/j22-${name}.png`, fullPage: false }); };

test('القارئ: لا مفتاح بناء ولا «⋯»، والرابط ‎?mode=build‎ يبقى عرضًا', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await expect(page.getByRole('radiogroup', { name: 'وضع الصفحة' })).toHaveCount(0);
  await page.evaluate(() => { location.hash = `${location.hash.split('?')[0]}?mode=build`; });
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
  await expect(page.locator('.j-build')).toHaveCount(0);
  await expect(page.locator('.pf-more-btn')).toHaveCount(0);
});

for (const width of [1280, 375]) {
  test(`${width}: البناء يثبت في الرابط، و«⋯» بهدف 44px، واللوحة الجانبية أو الدرج، بلا تمرير أفقي`, async ({ page }) => {
    await setup(page, { width });
    await shot(page, `view-${width}`);
    await page.getByRole('radio', { name: 'بناء' }).click();
    await expect(page).toHaveURL(/\?mode=build$/);
    const more = page.getByRole('button', { name: 'إجراءات نشاط «قراءة الباب الأول»' });
    if (width < 1024) await expect(more).toBeVisible();
    await more.focus();
    await expect(more).toBeVisible();
    const box = await more.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, `build-${width}`);
    await page.locator('#j-st-training button').click();
    const panel = page.getByRole('dialog', { name: 'مرحلة: التدريب' });
    await expect(panel).toBeVisible();
    const pb = await panel.boundingBox();
    if (width >= 1024) {
      expect(Math.round(pb.width)).toBe(480);
      expect(pb.x).toBeLessThan(5);   // جهة نهاية السطر: اليسار في RTL
    } else {
      expect(Math.round(pb.width)).toBe(width);
      expect(pb.y + pb.height).toBeGreaterThan(800);   // درج سفلي
    }
    await shot(page, `panel-${width}`);
    // Esc يغلق اللوحة ويعيد التركيز إلى ما فتحها
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('#j-st-training button')).toBeFocused();
  });
}

test('لوحة المفاتيح: «⋯» يفتح بالإدخال، والأسهم بين البنود، و«نقل إلى…» يرسل النقل الذري ويعلن الموضع', async ({ page }) => {
  const calls = await setup(page, { replies: {
    'admin.requirement-move': (b) => ({ success: true, from: 'training', to: b.stage_key, position: 1, stage_title: 'التطبيق',
      rows: [{ ...reqs[1] }, { ...reqs[2], stage_key: 'ojt', sort: 1 }, { ...reqs[3], sort: 2 }] }),
  } });
  await page.getByRole('radio', { name: 'عرض' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'بناء' })).toHaveAttribute('aria-checked', 'true');
  const more = page.getByRole('button', { name: 'إجراءات نشاط «ارفع خطتك»' });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'تحرير' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'أعلى' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'نقل نشاط «ارفع خطتك»' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('إلى مرحلة').selectOption('ojt');
  await panel.getByLabel('في الموضع (فراغ: آخر المرحلة)').fill('1');
  await panel.getByRole('button', { name: 'انقل' }).click();
  await expect(panel).toBeHidden();
  const mv = calls.filter((c) => c.action === 'admin.requirement-move');
  expect(mv).toHaveLength(1);
  expect(mv[0]).toMatchObject({ id: 'r3', program_id: 'pa', stage_key: 'ojt', position: 1, expect_stage: 'training', expect_sort: 2, target_ids: ['r4'] });
  // المرحلتان وحدهما تُحدَّثان، بلا إعادة تحميل الكتالوج
  expect(calls.filter((c) => c.action === 'admin.catalog')).toHaveLength(1);
  await expect(page.getByTestId('j-said')).toHaveText('نُقل إلى الموضع 1 في مرحلة التطبيق');
  await expect(page.locator('.la-stage-ed', { hasText: 'التطبيق' }).locator('#jreq-r3')).toBeVisible();
});

test('الإخفاء بدل الحذف، و«+ مرحلة» بأربعة حقول تُدرج آخر محورها', async ({ page }) => {
  const calls = await setup(page, { replies: { 'admin.stage-create': { success: true, row: { key: 's-new' }, next: 'report' } } });
  await page.getByRole('radio', { name: 'بناء' }).click();
  await page.getByRole('button', { name: 'إجراءات نشاط «سجل التطبيق»' }).click();
  await page.getByRole('menuitem', { name: 'إخفاء' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'stage_requirements', row: { id: 'r4', active: false } });
  expect(calls.some((c) => c.action === 'admin.delete')).toBe(false);
  await page.locator('[data-add-stage="qualification"]').click();
  const panel = page.getByRole('dialog', { name: 'مرحلة جديدة' });
  await expect(panel.locator('input, select, textarea')).toHaveCount(4);
  await expect(panel.getByLabel('المحور')).toHaveValue('qualification');
  await panel.getByLabel('اسم المرحلة').fill('مختبر تطبيقي');
  await panel.getByLabel('نوع المرحلة').selectOption('optional');
  await panel.getByLabel('المدة بالأيام').fill('10');
  await shot(page, 'add-stage-1280');
  await panel.getByRole('button', { name: 'أضف المرحلة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.stage-create')).toMatchObject({ program_id: 'pa', title_ar: 'مختبر تطبيقي', phase: 'qualification', mode: 'optional', duration_days: 10 });
});
