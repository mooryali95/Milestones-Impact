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
  // مثبتة على النسخة 1، وفي جدولها موعد قديم لمرحلة من البرنامج الحي ليست في نسختها
  { id: 'c2', name: 'دفعة مثبتة', organization_id: null, program_id: 'pa', program_version_id: 'v1', status: 'planned', delivery: {}, capacity: 20, members: 0, schedule: { s1: { start: '2026-09-01' } } },
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

async function setup(page, opts = {}) {
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
      'admin.cohort-definition': () => (opts.defFail ? { success: false, message: 'تعذّرت قراءة رحلة الدفعة' } : definition(b)),
      'admin.milestones': { success: true, milestones: [] },
      'admin.cohort-save': () => ({ success: true, cohort: { id: b.id || 'c9', name: b.name, schedule: b.schedule || {} },
        ...(b.schedule?.s1 && b.id === 'c2' ? { schedule_dropped: 'لم تُحفظ مواعيد مرحلة «التأسيس»، لأنها ليست من مراحل برنامج الدفعة أو نسختها المثبتة. بقية الجدول حُفظ.' } : {}) }),
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
    await expect(wiz.locator('.wiz-source')).toHaveText(/من دفعة الجهة الحالية «سفراء 2026»: «برنامج سفراء»\./);
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
    // تُثبَّت دائمًا على أحدث نسخة، والبرنامج بلا نسخة تُنشأ نسخته الأولى في الخادم عند الإنشاء
    await expect(wiz).toContainText('النسخة 1 (تُنشأ عند الإنشاء)');
    await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ organization_id: 'o1', program_id: 'pb', program_version_id: 'latest' });
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

test('جدول الدفعة المثبتة يعرض مراحل نسختها وحدها، وما أسقطه الخادم يُقال (P5)', async ({ page }) => {
  const calls = await setup(page);
  await page.locator('.data-table tbody tr', { hasText: 'دفعة مثبتة' }).getByRole('button', { name: /^الجدول/ }).click();
  const dlg = page.getByRole('dialog', { name: 'جدول الدفعة' });
  await expect(dlg).toContainText('مراحل النسخة 1 المثبتة للدفعة (الإطلاق).');
  await expect(dlg.locator('tbody tr')).toHaveCount(1);
  await expect(dlg.locator('tbody tr')).toContainText('مرحلة النسخة الأولى');
  await expect(dlg).not.toContainText('التأسيس');
  expect(calls.find((c) => c.action === 'admin.cohort-definition')).toMatchObject({ cohort_id: 'c2' });
  await dlg.getByLabel('بداية مرحلة النسخة الأولى').fill('2026-10-01');
  await dlg.getByRole('button', { name: 'حفظ الجدول' }).click();
  await expect(page.getByRole('status').getByText(/لم تُحفظ مواعيد مرحلة «التأسيس»/)).toBeVisible();
});

// ── P6: محرر الدفعة بالأقسام ──
const openEditor = async (page, name) => {
  await page.locator('.data-table tbody tr', { hasText: name }).getByRole('button', { name: 'تحرير', exact: true }).click();
  const ed = page.getByRole('dialog', { name: `دفعة: ${name}` });
  await expect(ed.locator('.ce-stage').first()).toBeVisible();
  return ed;
};
const sw = (ed, label) => ed.getByRole('switch', { name: `إظهار ${label} في رحلة الدفعة` });

for (const width of [1440, 390]) {
  test(`محرر الدفعة: أربعة أقسام، والرحلة بأسماء مقروءة ومفتاح لكل بند (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const calls = await setup(page);
    const ed = await openEditor(page, 'سفراء 2026');
    // الأساسيات ظاهرة، والرحلة مفتوحة، والتنفيذ والمتقدم مطويان بسطر خلاصة
    await expect(ed.getByLabel('اسم الدفعة')).toHaveValue('سفراء 2026');
    await expect(ed.getByRole('button', { name: 'الرحلة' })).toHaveAttribute('aria-expanded', 'true');
    await expect(ed.getByRole('button', { name: 'التنفيذ' })).toHaveAttribute('aria-expanded', 'false');
    await expect(ed.getByRole('button', { name: 'متقدم' })).toHaveAttribute('aria-expanded', 'false');
    await expect(ed.locator('.ce-summary')).toContainText(['كما في البرنامج', 'تُثبَّت على أحدث نسخة عند الحفظ']);
    // البرنامج المؤرشف لا يُعرض خيارًا
    await expect(ed.locator('#f-program_id option', { hasText: 'برنامج قديم' })).toHaveCount(0);
    // لكل مرحلة «كذا ظاهرة من كذا»، ومجموع الدفعة، والمخفي يبقى في القائمة بعلامته
    await expect(ed.locator('.ce-stage', { hasText: 'الانطلاق' }).locator('h5')).toContainText('1 ظاهرة من 2');
    await expect(ed.locator('.ce-total')).toHaveText('مجموع الدفعة: 5 بنود في 3 مراحل، الظاهر منها 4.');
    await expect(sw(ed, 'تأمل الانطلاق (الانطلاق)')).toHaveAttribute('aria-checked', 'false');
    await expect(ed).not.toContainText(/T-ATTEND|P-PLAN|\{[a-z]+:/);
    // المفتاح الكاسر معطل بشرحه
    await expect(sw(ed, 'خطة المشروع (المشروع)')).toBeDisabled();
    // السبب القصير تحت المفتاح، وشرحه مرة واحدة للمرحلة
    await expect(ed.locator('#ce-lock-P-PLAN')).toHaveText('⚠ لا يُخفى: آخر ما يكمل هذه المرحلة');
    await expect(ed.locator('.ce-stage', { hasText: 'المشروع' }).locator('.ce-stage-note')).toContainText('البند المقفل هنا لا يُخفى لأن إخفاءه يترك مرحلة «المشروع»');
    await expect(ed.locator('.ce-stage-note')).toHaveCount(3);
    await shot(page, 'editor-basics', ed);
    await ed.locator('.ce-stage').first().scrollIntoViewIfNeeded();
    await shot(page, 'editor-journey', ed);
    // إخفاء بند يحفظ hidden_requirements بالرموز نفسها، ولا يُحذف المخفي من قبل
    await sw(ed, 'قراءة إضافية (المشروع)').click();
    await expect(sw(ed, 'قراءة إضافية (المشروع)')).toHaveAttribute('aria-checked', 'false');
    await expect(ed.locator('.ce-stage', { hasText: 'المشروع' }).locator('h5')).toContainText('1 ظاهرة من 2');
    // التنفيذ مجمع بالنشاط، ومعه افتراضي الجهة
    await ed.getByRole('button', { name: 'التنفيذ' }).click();
    await expect(ed.locator('.ce-act legend')).toHaveText(['حضور الأيام التدريبية (يومان) · الانطلاق']);
    await expect(ed.getByLabel('حضور الأيام التدريبية (يومان) (الانطلاق): توثيق الحضور')).toBeVisible();
    await ed.locator('.ce-act').scrollIntoViewIfNeeded();
    await shot(page, 'editor-delivery', ed);
    await ed.getByRole('button', { name: 'متقدم' }).click();
    await expect(ed.getByLabel('نسخة البرنامج')).toBeVisible();
    await ed.getByLabel('مستويات المشاركين').selectOption('uniform');
    // خطأ مستوى المحتوى ظاهر ويمنع الحفظ
    await expect(ed.locator('.ce-err')).toHaveText('اختر مستوى المحتوى للدفعة المتجانسة');
    await ed.getByLabel('مستوى المحتوى للدفعة').scrollIntoViewIfNeeded();
    await shot(page, 'editor-advanced', ed);
    await ed.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(ed.getByRole('alert')).toHaveText('اختر مستوى المحتوى للدفعة المتجانسة');
    expect(calls.filter((c) => c.action === 'admin.cohort-save')).toHaveLength(0);
    await ed.getByLabel('مستوى المحتوى للدفعة').selectOption('intermediate');
    expect(await noOverflow(page)).toBe(true);
    await ed.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c1', program_id: 'pb', hidden_requirements: ['R-B', 'P-EXTRA'], level_mode: 'uniform', content_level: 'intermediate' });
    const body = calls.find((c) => c.action === 'admin.cohort-save');
    expect(body).not.toHaveProperty('hidden_before');
    expect(body).not.toHaveProperty('capacity_on');
  });
}

test('تغيير البرنامج يعيد تحميل الرحلة ويثبّت على أحدث نسخ البرنامج الجديد، لا «آخر تعديل»', async ({ page }) => {
  const calls = await setup(page);
  const ed = await openEditor(page, 'سفراء 2026');
  // دفعة لم تُثبَّت بعد على برنامج بلا نسخة: تعاين ما ستُثبَّت عليه عند الحفظ
  await expect(ed.locator('.ce-stage h5').first()).toContainText('الانطلاق');
  expect(calls.filter((c) => c.action === 'admin.cohort-definition').at(-1)).toMatchObject({ cohort_id: 'c1', program_id: 'pb', program_version_id: 'latest' });
  await expect(ed.locator('.ce-source').first()).toContainText('لا نسخة محفوظة لهذا البرنامج بعد: تُحفظ نسخته الأولى من حاله الآن عند الحفظ');
  await ed.locator('#f-program_id').selectOption('pa');
  await expect(ed.locator('.ce-stage h5')).toHaveText([/مرحلة النسخة الأولى/]);
  expect(calls.filter((c) => c.action === 'admin.cohort-definition').at(-1)).toMatchObject({ cohort_id: 'c1', program_id: 'pa', program_version_id: 'v1' });
  await expect(ed.locator('.ce-source').first()).toContainText('برنامج الجهة «برنامج سفراء». اخترت برنامجًا آخر');
  await expect(ed.locator('.ce-source').first()).toContainText('الرحلة من النسخة 1 المثبتة (الإطلاق).');
  // «أحدث نسخة عند الحفظ» خيار لهذه الدفعة لأنها لم تُثبَّت بعد
  await ed.getByRole('button', { name: 'متقدم' }).click();
  await expect(ed.getByLabel('نسخة البرنامج')).toHaveValue('v1');
  await expect(ed.getByLabel('نسخة البرنامج').locator('option')).toHaveText([/أحدث نسخة عند الحفظ/, /مثبتة على النسخة 1/]);
  await ed.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c1', program_id: 'pa', program_version_id: 'v1' });
});

test('Esc مع تعديل يسأل قبل الإغلاق، وبلا تعديل يغلق مباشرة', async ({ page }) => {
  await setup(page);
  const ed = await openEditor(page, 'دفعة مثبتة');
  await expect(ed.getByLabel('اسم الدفعة')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ed).toBeHidden();
  const again = await openEditor(page, 'دفعة مثبتة');
  await sw(again, 'بند النسخة الأولى (مرحلة النسخة الأولى)').isDisabled();
  await again.getByLabel('اسم الدفعة').fill('دفعة مثبتة معدلة');
  await page.keyboard.press('Escape');
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('لديك تعديلات لم تُحفظ');
  await ask.getByRole('button', { name: 'إلغاء' }).click();
  await expect(again.getByLabel('اسم الدفعة')).toHaveValue('دفعة مثبتة معدلة');
  // المثبتة تقرأ رحلتها من نسختها، ودفعة الأفراد مقاعدها ظاهرة في الأساسيات
  await expect(again.locator('.ce-source').first()).toContainText('الرحلة من النسخة 1 المثبتة (الإطلاق).');
  await expect(again.getByLabel('المقاعد')).toHaveValue('20');
  // الروابط إلى ما يُضبط في نوافذه تغلق المحرر بالسؤال نفسه
  await again.getByRole('button', { name: 'الجدول', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(page.getByRole('dialog', { name: 'جدول الدفعة' })).toBeVisible();
});

test('الدفعة المثبتة: لا خيار لإلغاء تثبيتها، وتغيير النسخة يُقال صراحة، والعودة إلى برنامجها تعيد نسختها', async ({ page }) => {
  const calls = await setup(page);
  const ed = await openEditor(page, 'دفعة مثبتة');
  await ed.getByRole('button', { name: 'متقدم' }).click();
  await expect(ed.getByLabel('نسخة البرنامج').locator('option')).toHaveText([/مثبتة على النسخة 1/]);
  await ed.locator('#f-program_id').selectOption('pb');
  await expect(ed.locator('.ce-source').first()).toContainText('كانت الدفعة على النسخة 1 من برنامجها: بعد الحفظ تنتقل إلى ما تعرضه الرحلة أدناه.');
  await expect(ed.locator('.ce-source').first()).toContainText('تُحفظ نسخته الأولى من حاله الآن عند الحفظ');
  await ed.locator('#f-program_id').selectOption('pa');
  await expect(ed.locator('.ce-source').first()).toContainText('الرحلة من النسخة 1 المثبتة (الإطلاق).');
  await expect(ed.locator('.ce-source').first()).not.toContainText('كانت الدفعة');
  expect(calls.filter((c) => c.action === 'admin.cohort-definition').at(-1)).toMatchObject({ program_id: 'pa', program_version_id: 'v1' });
  await expect(ed.getByText('تعديلات غير محفوظة')).toHaveCount(0);
});

test('تعذّرت قراءة الرحلة: الحفظ لا يرسل التنفيذ فلا يمحو تخصيصه، وإعادة المحاولة تقرؤها', async ({ page }) => {
  const opts = { defFail: true };
  const calls = await setup(page, opts);
  await page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' }).getByRole('button', { name: 'تحرير', exact: true }).click();
  const ed = page.getByRole('dialog', { name: 'دفعة: سفراء 2026' });
  await expect(ed.getByRole('alert')).toContainText('تعذّرت قراءة رحلة الدفعة');
  await ed.getByLabel('اسم الدفعة').fill('سفراء 2026 أ');
  await ed.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c1', name: 'سفراء 2026 أ' });
  expect(calls.find((c) => c.action === 'admin.cohort-save')).not.toHaveProperty('delivery');
  // المحرر أُغلق بالحفظ؛ يُفتح ثانية والقراءة تنجح بإعادة المحاولة
  await page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' }).getByRole('button', { name: 'تحرير', exact: true }).click();
  const again = page.getByRole('dialog', { name: 'دفعة: سفراء 2026' });
  await expect(again.getByRole('alert')).toContainText('تعذّرت قراءة رحلة الدفعة');
  opts.defFail = false;
  await again.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(again.locator('.ce-stage').first()).toBeVisible();
});
