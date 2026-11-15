// الدفعة من إنشائها إلى تحريرها: وراثة برنامج الجهة في المعالج (P4)، والجدول من تعريف الدفعة (P5)،
// ومحرر الدفعة بأقسامه الأربعة والرحلة المرئية (P6). الخلفية مُحاكاة.
// COHORT_SHOTS: مجلد تُحفظ فيه اللقطات بعرضي 1440 و390 وكثافة 2.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.COHORT_SHOTS || '';
const programs = [
  { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 5, versions: [{ id: 'v1', program_id: 'pa', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] },
  { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 5, versions: [] },
  { id: 'px', name: 'برنامج قديم', is_default: false, requirements: 2, versions: [], archived_at: '2026-06-01' },
];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', status: 'running', delivery: {}, members: 40 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pb', status: 'running', starts_on: '2026-09-01', ends_on: '2027-01-31', delivery: {}, hidden_requirements: ['R-B'], members: 31, schedule: {} },
  { id: 'c2', name: 'دفعة مثبتة', organization_id: null, program_id: 'pa', program_version_id: 'v1', status: 'planned', delivery: {}, capacity: 20, members: 0, schedule: {} },
];
const organizations = [
  { id: 'o1', name: 'جمعية سفراء', status: 'active', invite_code: 'sufara', seats: 50, seats_used: 31, delivery_default: 'in_person', auto_cohort: { id: 'c1', name: 'سفراء 2026', via: 'organization' } },
  { id: 'o2', name: 'منظومة', status: 'active', seats: null, seats_used: 0, auto_cohort: { id: 'c0', name: 'الدفعة المفتوحة', via: 'default' } },
];
const stage = (key, title_ar, rules = { complete: 'required' }) => ({ key, title_ar, rules, active: true });
// تعريف كل برنامج كما يرجعه admin.cohort-definition: المراحل والمتطلبات، والمخفي بعلامة hidden لا محذوفًا
const defs = {
  pa: { stages: [stage('s1', 'التأسيس'), stage('s2', 'التطبيق')], requirements: [
    { id: 'r1', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', kind: 'workshop', required: true, stage_key: 's1', config: { sessions_required: 3, verify: 'qr' } },
    { id: 'r2', code: 'O-SESS', title_ar: 'جلسات التوجيه ({sessions:O-SESS})', kind: 'coaching', required: true, stage_key: 's2', config: { sessions_required: 4, mode: 'online' } },
    { id: 'r3', code: 'R-A', title_ar: 'تأمل', kind: 'check', required: false, stage_key: 's1' },
    { id: 'r4', code: 'R-B', title_ar: 'تأمل', kind: 'check', required: false, stage_key: 's2' },
    { id: 'r5', code: 'E-MGR', title_ar: 'تقدير المدير', kind: 'check', required: false, stage_key: 's2' },
  ] },
  pb: { stages: [stage('s1', 'الانطلاق'), stage('s2', 'المشروع'), stage('s3', 'الختام')], requirements: [
    { id: 'b1', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', kind: 'workshop', required: true, stage_key: 's1', config: { sessions_required: 2, verify: 'qr' } },
    { id: 'b2', code: 'R-B', title_ar: 'تأمل الانطلاق', kind: 'check', required: false, stage_key: 's1' },
    { id: 'b3', code: 'P-PLAN', title_ar: 'خطة المشروع', kind: 'check', required: true, stage_key: 's2' },
    { id: 'b4', code: 'P-EXTRA', title_ar: 'قراءة إضافية', kind: 'check', required: false, stage_key: 's2' },
    { id: 'b5', code: 'F-END', title_ar: 'التقييم الختامي', kind: 'check', required: true, stage_key: 's3' },
  ] },
};
// النسخة 1 من البرنامج الافتراضي: مرحلة واحدة غير مراحل البرنامج الحي
const v1 = { stages: [stage('s9', 'مرحلة النسخة الأولى')], requirements: [
  { id: 'r9', code: 'T-OLD', title_ar: 'بند النسخة الأولى', kind: 'check', required: true, stage_key: 's9' },
] };
const definition = (b) => {
  const c = cohorts.find((x) => x.id === b.cohort_id) || {};
  const pid = b.program_id || c.program_id;
  const vid = 'program_version_id' in b ? b.program_version_id : (pid === c.program_id ? c.program_version_id : null);
  const base = vid === 'v1' ? v1 : defs[pid];
  const hidden = new Set(c.hidden_requirements || []);
  const title = new Map(base.stages.map((s) => [s.key, s]));
  return {
    success: true, program_id: pid, version: vid === 'v1' ? { id: 'v1', number: 1, label: 'الإطلاق' } : null,
    stages: base.stages, hidden: [...hidden],
    requirements: base.requirements.map((r) => ({ ...r, active: true, stage_title_ar: title.get(r.stage_key)?.title_ar, stage_rules: title.get(r.stage_key)?.rules, stage_active: true, hidden: hidden.has(r.code) })),
  };
};

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations },
      'admin.program': { success: true, program: programs[0], stages: defs.pa.stages, requirements: defs.pa.requirements },
      'admin.cohort-definition': () => definition(b),
      'admin.milestones': { success: true, milestones: [] },
      'admin.cohort-save': () => ({ success: true, cohort: { id: b.id || 'c9', name: b.name, schedule: b.schedule || {} } }),
    };
    const r = replies[b.action];
    await route.fulfill({ json: (typeof r === 'function' ? r() : r) ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const shot = async (page, name, target = page) => {
  if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.use({ deviceScaleFactor: 2 });

for (const width of [1440, 390]) {
  test(`المعالج يقترح برنامج الجهة من دفعتها الحالية، والمؤرشف لا يُعرض (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const calls = await setup(page);
    await page.getByRole('button', { name: '+ دفعة جديدة' }).click();
    const wiz = page.getByRole('dialog', { name: 'دفعة جديدة' });
    await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o1');
    await wiz.getByRole('button', { name: 'التالي' }).click();
    const prog = wiz.getByRole('combobox', { name: 'البرنامج' });
    await expect(prog).toHaveValue('pb');
    await expect(prog.locator('option', { hasText: 'برنامج قديم' })).toHaveCount(0);
    await expect(wiz.locator('.wiz-source')).toHaveText(/من دفعة الجهة الحالية «سفراء 2026»: برنامج «برنامج سفراء»/);
    await shot(page, 'wizard-program-prefill', wiz);
    // برنامج آخر يُنبَّه إليه، والرجوع إلى برنامج الجهة بنقرة
    await prog.selectOption('pa');
    await expect(wiz.locator('.wiz-source.warn')).toContainText('اخترت برنامجًا آخر');
    await shot(page, 'wizard-program-other', wiz);
    await wiz.getByRole('button', { name: 'ارجع إلى برنامج الجهة' }).click();
    await expect(prog).toHaveValue('pb');
    // جهة بلا دفعة: البرنامج الافتراضي بلا سطر مصدر
    await wiz.getByRole('button', { name: 'السابق' }).click();
    await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o2');
    await wiz.getByRole('button', { name: 'التالي' }).click();
    await expect(prog).toHaveValue('pa');
    await expect(wiz.locator('.wiz-source')).toHaveCount(0);
    await wiz.getByRole('button', { name: 'السابق' }).click();
    await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o1');
    await wiz.getByRole('button', { name: 'التالي' }).click();
    await wiz.getByRole('button', { name: 'التالي' }).click();
    await wiz.getByRole('button', { name: 'التالي' }).click();
    await wiz.getByRole('button', { name: 'أنشئ الدفعة' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ organization_id: 'o1', program_id: 'pb', program_version_id: '' });
    expect(await noOverflow(page)).toBe(true);
  });
}

test('«أنشئ له دفعة» من بطاقة البرنامج يبقى على البرنامج المختار ولا يستبدله ببرنامج الجهة', async ({ page }) => {
  await setup(page);
  await page.locator('.la-card', { hasText: 'برنامج القادة' }).first().getByRole('button', { name: 'أنشئ له دفعة' }).click();
  const wiz = page.getByRole('dialog', { name: 'دفعة جديدة' });
  await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o1');
  await wiz.getByRole('button', { name: 'التالي' }).click();
  await expect(wiz.getByRole('combobox', { name: 'البرنامج' })).toHaveValue('pa');
  await expect(wiz.locator('.wiz-source.warn')).toContainText('برنامج الجهة «برنامج سفراء»');
});
