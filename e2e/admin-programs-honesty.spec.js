// الصدق والأمان في صفحة البرامج (P9) و«جارية» واحدة (P10): «يسري على» من الأعضاء الفعليين، و«برنامج جديد من هذا»
// يسبقه سؤال «لجهة بعينها؟»، والبرنامج المختار في الرابط، ومحرر الرحلة يسمي الدفعات التي يصلها التعديل، وحالة الدفعة
// من التعريف الواحد. الخلفية مُحاكاة، واليوم مثبت على 19 نوفمبر 2026. لقطات بعرضي 1440 و390 في PROGRAMS_SHOTS إن ضُبط.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.PROGRAMS_SHOTS || '';
const versions = [{ id: 'v2', program_id: 'pa', number: 2, label: 'بعد مراجعة أكتوبر', created_at: '2026-10-20' }, { id: 'v1', program_id: 'pa', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }];
const programs = [
  { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 3, versions, unpinned_cohorts: 1 },
  { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 2, versions: [{ id: 'w1', program_id: 'pb', number: 1, label: 'الإطلاق', created_at: '2026-10-01' }] },
];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', delivery: {}, members: 30, enrolled: 0 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-02-01', delivery: {}, members: 12, enrolled: 4 },
  { id: 'c2', name: 'منظومة الربيع', organization_id: 'o2', program_id: 'pb', program_version_id: 'w1', status: 'open', starts_on: '2026-12-01', ends_on: '2027-03-01', delivery: {}, members: 0, enrolled: 0 },
];
const stages = [{ key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 1, duration_days: 14, active: true }];
const reqs = [{ id: 'r1', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 2 } }];
const catalogOf = (pid) => ({ success: true, program_id: pid, journey_stages: stages, stage_requirements: reqs, instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {} });

async function setup(page, width = 1440) {
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-19T09:00:00Z'));
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'جمعية سفراء', stats: {} }], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [{ id: 'o1', name: 'جمعية سفراء', status: 'active' }, { id: 'o2', name: 'منظومة', status: 'active' }] },
      'admin.catalog': catalogOf(b.program_id || 'pa'),
      'admin.program-milestones': { success: true, milestones: [] },
      'admin.program-save': { success: true, program: { id: 'pc' } },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return calls;
}
const tab = (page, name) => page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name }).click();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png`, fullPage: true }); };

for (const width of [1440, 390]) {
  test(`«يسري على» من الأعضاء، و«جارية» من التعريف الواحد (${width})`, async ({ page }) => {
    await setup(page, width);
    await tab(page, 'البرامج والدفعات');
    const qa = page.locator('section.la-card', { hasText: 'برنامج القادة' }).first();
    await expect(qa.locator('.la-reach')).toHaveText('يسري على 42 مشاركًا: الدفعة المفتوحة 30، جمعية سفراء 12');
    // دفعة بلا أعضاء لا تُعد سريانًا
    await expect(page.locator('section.la-card', { hasText: 'برنامج سفراء' }).locator('.la-reach')).toHaveText('دفعته بلا أعضاء بعد، فلا يسري الآن على أي مشارك.');
    // حالة الدفعة: بتاريخها، والمفتوحة العامة على الدوام، والتسجيل المفتوح قبل البدء ليس «جارية»
    await expect(page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' })).toContainText('جارية');
    await expect(page.locator('.data-table tbody tr', { hasText: 'الدفعة المفتوحة' })).toContainText('مفتوحة على الدوام');
    const spring = page.locator('.data-table tbody tr', { hasText: 'منظومة الربيع' });
    await expect(spring).toContainText('التسجيل مفتوح');
    await expect(spring).not.toContainText('جارية');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'programs-reach');
  });
}

test('«برنامج جديد من هذا» يسأل «لجهة بعينها؟» أولًا، والإلغاء لا ينشئ شيئًا', async ({ page }) => {
  const calls = await setup(page);
  await tab(page, 'البرامج والدفعات');
  const qa = page.locator('section.la-card', { hasText: 'برنامج القادة' }).first();
  await expect(qa.getByRole('button', { name: 'تكرار' })).toHaveCount(0);
  await qa.getByRole('button', { name: 'برنامج جديد من هذا' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('لجهة بعينها؟ خصّص دفعتها بدل النسخ');
  await ask.getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await qa.getByRole('button', { name: 'برنامج جديد من هذا' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'برنامج جديد من هذا' }).click();
  const name = page.getByRole('dialog').getByRole('textbox');
  await expect(name).toHaveValue('برنامج القادة (نسخة)');
  await name.fill('برنامج القادة للقطاع الصحي');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.program-save').map(({ name, from }) => ({ name, from }))).toEqual([{ name: 'برنامج القادة للقطاع الصحي', from: 'pa' }]);
});

for (const width of [1440, 390]) {
  test(`البرنامج المختار في الرابط، ومحرر الرحلة يسمي الدفعات التي يصلها التعديل (${width})`, async ({ page }) => {
    const calls = await setup(page, width);
    await tab(page, 'البرامج والدفعات');
    await page.locator('section.la-card', { hasText: 'برنامج سفراء' }).getByRole('button', { name: 'حرّر الرحلة' }).click();
    await expect(page).toHaveURL(/#\/leaders\/journey\/pb$/);
    await expect.poll(() => calls.filter((c) => c.action === 'admin.catalog').at(-1)?.program_id).toBe('pb');
    const who = page.getByLabel('من يصله التعديل');
    await expect(who).toContainText('لا يصل إلى الدفعة المثبتة حتى تحفظه نسخة');
    await expect(who).toContainText('«منظومة الربيع» على النسخة 1 (بلا أعضاء بعد)');
    await expect(page.getByText('تتبع آخر تعديل')).toHaveCount(0);
    // التحديث يفتح البرنامج نفسه لا الافتراضي
    await page.reload();
    await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
    await expect(page).toHaveURL(/#\/leaders\/journey\/pb$/);
    await expect(page.getByLabel('البرنامج', { exact: true })).toHaveValue('pb');
    // تبديل البرنامج من القائمة يكتب الرابط، والدفعة غير المثبتة تُسمى أولًا بأنه يصلها فورًا
    await page.getByLabel('البرنامج', { exact: true }).selectOption('pa');
    await expect(page).toHaveURL(/#\/leaders\/journey\/pa$/);
    await expect(page.getByLabel('من يصله التعديل').locator('.la-note')).toContainText('يصل ما تحرره هنا فورًا إلى الدفعة غير المثبتة: «الدفعة المفتوحة» (30 مشاركًا)');
    await expect(page.getByLabel('من يصله التعديل')).toContainText('«سفراء 2026» على النسخة 1 (12 مشاركًا)');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'journey-audience');
  });
}
