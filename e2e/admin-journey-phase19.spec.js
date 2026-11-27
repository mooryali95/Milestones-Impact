// المرحلة 19 (الرحلة): الشريط المتمرر بحافتيه وزريه، والبلاطات بأسمائها والتفاصيل الملاصقة (درج سفلي على الهاتف)، وسطر الحالة.
// P19_SHOTS: مجلد تُحفظ فيه لقطات RTL بعرضي 1280 و375.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.P19_SHOTS || '';
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, active: true },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 6, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 7, duration_days: 90, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 7, active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'يوم ورشة عن بعد', sort: 1, active: true, config: { sessions_required: 1, verify: 'join' } },
  { id: 'r3', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول من كل إطار', sort: 2, active: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 1, active: true, config: { mode: 'online' } },
  { id: 'r5', code: 'C-UP', stage_key: 'consult', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 1, active: true },
  { id: 'r6', code: 'S-MEET', stage_key: 'support', kind: 'workshop', required: true, title_ar: 'لقاء منتصف الدعم', sort: 1, active: true },
];
const catalog = {
  success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements,
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {},
};
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2027-03-31', delivery: {}, members: 12, schedule: {} }];
const sessions = [
  { id: 's1', requirement_id: 'r2', cohort_id: 'c1', title_ar: 'يوم الورشة', starts_at: null, ends_at: null, mode: 'online', active: true },
  { id: 's2', requirement_id: 'r6', cohort_id: 'c1', title_ar: 'لقاء', starts_at: '2027-01-17T06:00:00Z', ends_at: '2027-01-17T08:00:00Z', mode: 'in_person', active: true },
];
const definition = {
  success: true, program_id: 'pa', version: null, stages, hidden: [], sessions,
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
};

async function setup(page, width) {
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': catalog,
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': definition,
      'admin.milestones': { success: true, milestones: [] },
      'admin.program-milestones': { success: true, milestones: [] },
      'admin.activities': { success: true, requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })),
        workshops: sessions.map((s) => ({ ...s, attended: 0 })), coaching: [], programs, cohorts },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
}
const tab = (page, name) => page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name }).click();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/p19-${name}-${page.viewportSize().width}.png` }); };

test('1280: سطر الحالة في الترويسة، والشريط بحافة وزر، والبلاطة تفتح تفاصيلها ملاصقة وEsc يعيد التركيز', async ({ page }) => {
  await setup(page, 1280);
  await tab(page, 'الرحلة والمتطلبات');
  const head = page.locator('.screen-head');
  await expect(page.getByRole('heading', { level: 1, name: 'الرحلة والمتطلبات' })).toBeVisible();
  const line = head.locator('.j-status-line');
  await expect(line.locator('[data-status="no_version"]')).toHaveText('بلا نسخة');
  // الدفعة على البرنامج غير مثبتة على نسخة: يصلها التعديل فورًا، فلا تُقال «لا تمس الدفعة الجارية» ويظهر تنبيهها
  await expect(line).not.toContainText('لا تمس الدفعة الجارية');
  await expect(head.locator('.j-audience > .la-note')).toContainText('يصل ما تحرره هنا فورًا');
  await expect(head.locator('details.j-details')).not.toHaveAttribute('open', '');
  await expect(page.getByText('الرحلة متسقة')).toHaveCount(0);
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  // المرحلة 21: تفصيل الأنشطة الزمني مطوي تحت الشريط القصير
  await page.locator('details.j-tl-detail > summary').click();
  const sc = tl.getByRole('group', { name: 'الخط الزمني، يتحرك بالأسهم' });
  await expect(sc).toHaveAttribute('tabindex', '0');
  // المسطرة مختصرة لا تلتف، والكامل في title
  const wk = tl.locator('.jt-ruler span[title="الأسبوع 1"]');
  await expect(wk).toHaveText('أ١');
  expect(await wk.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  await shot(page, 'journey');
  const tile = tl.locator('.jt-desk .jt-tile', { hasText: 'قراءة الباب الأول' });
  await tile.click();
  const pop = tl.locator('.jt-pop');
  await expect(pop.getByRole('heading', { name: 'قراءة الباب الأول من كل إطار' })).toBeVisible();
  await expect(pop).toBeFocused();
  // ملاصقة للبلاطة: أعلاها قرب أسفل البلاطة
  const tb = await tile.boundingBox(), pb = await pop.boundingBox();
  expect(Math.abs(pb.y - (tb.y + tb.height))).toBeLessThan(24);
  await shot(page, 'tile-open');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(tile).toBeFocused();
  expect(await noOverflow(page)).toBe(true);
});

test('375: الهاتف بخطه الرأسي بلا تمرير أفقي، وسطر الحالة يلتف', async ({ page }) => {
  await setup(page, 375);
  await tab(page, 'الرحلة والمتطلبات');
  await expect(page.locator('.screen-head .j-status-line [data-status="no_version"]')).toBeVisible();
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  // المرحلة 21: تفصيل الأنشطة الزمني مطوي تحت الشريط القصير
  await page.locator('details.j-tl-detail > summary').click();
  await expect(tl.getByRole('list', { name: 'مراحل الرحلة' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await shot(page, 'journey');
  await page.locator('.screen-head details.j-details summary').click();
  await expect(page.getByLabel('من يصله التعديل')).toBeVisible();
  await shot(page, 'details');
});

test('375: التفاصيل درج سفلي على الهاتف، وEsc يغلقه ويعيد التركيز إلى زره', async ({ page }) => {
  await setup(page, 375);
  await tab(page, 'الرحلة والمتطلبات');
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  // المرحلة 21: تفصيل الأنشطة الزمني مطوي تحت الشريط القصير
  await page.locator('details.j-tl-detail > summary').click();
  await expect(tl.locator('.jt-desk')).toBeHidden();
  const stage = tl.locator('.jt-m-stage', { hasText: 'قراءة الباب الأول' }).first();
  if (!(await stage.locator('details').evaluate((d) => d.open))) await stage.locator('summary').click();
  const btn = stage.getByRole('button', { name: /^التفاصيل: قراءة الباب الأول/ });
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const pop = tl.locator('.jt-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toBeFocused();
  // درج سفلي بعرض الشاشة ملتصق بأسفلها
  const vp = page.viewportSize(), pb = await pop.boundingBox();
  expect(Math.round(pb.width)).toBe(vp.width);
  expect(Math.abs(pb.y + pb.height - vp.height)).toBeLessThan(2);
  expect(await pop.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await shot(page, 'drawer');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(btn).toBeFocused();
  expect(await noOverflow(page)).toBe(true);
});
