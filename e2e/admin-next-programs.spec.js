// لوحة الإدارة: البرامج ونسخها والدفعات. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const versions = [
  { id: 'v2', program_id: 'pa', number: 2, label: 'بعد مراجعة أكتوبر', created_at: '2026-10-20', created_by: 'a@x' },
  { id: 'v1', program_id: 'pa', number: 1, label: 'الإطلاق', created_at: '2026-09-01' },
];
const programs = [
  { id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 35, versions, unpinned_cohorts: 1 },
  { id: 'pb', name: 'برنامج سفراء', is_default: false, requirements: 30, versions: [] },
];
const cohorts = [
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', delivery: {}, enrolled: 0 },
  { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-02-01', delivery: { 'T-ATTEND': { verify: 'join' } }, enrolled: 12 },
];
const reqs = [
  { id: 'r1', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية', kind: 'workshop', active: true, config: { sessions_required: 4, verify: 'qr' } },
  { id: 'r2', code: 'O-SESS', title_ar: 'جلسات التوجيه', kind: 'coaching', active: true, config: { sessions_required: 2, mode: 'online' } },
  { id: 'r3', code: 'T-HB', title_ar: 'قراءة الكتاب', kind: 'reading', active: true, config: {} },
];

const cohortMap = {
  program: { name: 'برنامج القادة' },
  cohort: { name: 'سفراء 2026', starts_on: '2026-11-01', today_stage: 'training' },
  totals: { total: 3, finished: 0, late: 1, not_started: 0 },
  bottleneck: { stage: 'training' },
  stages: [
    { key: 'approval', title: 'اعتماد المستوى', phase: 'admission', duration_days: 2, here: 0, done: 3, late: 0, window: { from: '2026-11-01', to: '2026-11-03' }, people: [] },
    { key: 'training', title: 'التدريب', phase: 'qualification', duration_days: 14, here: 2, done: 1, late: 1, window: { from: '2026-11-03', to: '2026-11-17' },
      people: [{ id: 'p1', name: 'سارة', days: 12, late: true, needs: 'حضور الأيام التدريبية' }, { id: 'p2', name: 'خالد', days: 3, late: false, needs: null }] },
    { key: 'support', title: 'الدعم', phase: 'impact', duration_days: 30, here: 1, done: 0, late: 0, window: { from: '2026-11-17', to: '2026-12-17' }, people: [{ id: 'p3', name: 'نورة', days: 1, late: false, needs: null }] },
  ],
  milestones: [{ id: 'm1', title: 'نهاية التدريب', due: '2026-11-17', done: 1, late: 0 }],
};

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'جمعية سفراء', stats: {} }], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [{ id: 'o1', name: 'جمعية سفراء', status: 'active', invite_code: 'sufara' }, { id: 'o2', name: 'منظومة', status: 'active' }] },
      'admin.program': { success: true, program: programs[0], stages: [], requirements: reqs },
      'admin.cohort-definition': { success: true, program_id: 'pa', version: null, stages: [], requirements: reqs, hidden: [] },
      'admin.program-version': { success: true, version: { id: 'v3', number: 3 } },
      'admin.program-compare': { success: true, version: { number: 1, label: 'الإطلاق' }, diff: { added: [{ code: 'T-VID', title: 'فيديو التمهيد' }], removed: [], changed: [{ code: 'T-ATTEND', title: 'حضور الأيام التدريبية' }] } },
      'admin.program-restore': { success: true, restored: 1, backup: { number: 3 }, restored_as: { id: 'v4', number: 4 } },
      'admin.program-save': { success: true, program: { id: 'pc' } },
      'admin.cohort-save': { success: true, cohort: { id: 'c2' } },
      'admin.cohort-visibility': { success: true, ready: true, cohort: { id: 'c1', name: 'سفراء 2026' }, keys: [
        { key: 'adv_contact', audience: 'advisor', audience_ar: 'مستشار الدفعة وخبير المجموعة', label: 'وسائل التواصل', hint: 'بريد المشارك وجواله.', general: true, override: null, effective: true },
        { key: 'adv_answers', audience: 'advisor', audience_ar: 'مستشار الدفعة وخبير المجموعة', label: 'إجابات القياس', hint: 'ورقة الإجابات.', general: false, override: true, effective: true },
        { key: 'asg_levels', audience: 'assigned', audience_ar: 'الخبير المسند بطلب خدمة', label: 'المستويات ونتيجة القياس', hint: 'مستوى المشارك.', general: true, override: null, effective: true },
      ] },
      'admin.cohort-visibility-save': { success: true, widened: [] },
      // خريطة رحلة الدفعة في ملفها (R0): شكل journeyMap نفسه، والنهايات من نافذة الدفعة
      // والخادم لا يرجع null: برنامج بلا مراحل يرجع stages فارغة
      'admin.cohort-journey': b.cohort_id === 'c1' ? { success: true, journey_map: cohortMap } : { success: true, journey_map: { ...cohortMap, cohort: { name: 'الدفعة المفتوحة', starts_on: null, is_default: true, today_stage: null }, totals: { total: 0, finished: 0, late: 0, not_started: 0 }, bottleneck: null, stages: [], milestones: [] } },
      'admin.cohort-upgrade': b.confirm ? { success: true, to: { id: 'v2', number: 2 }, diff: { added: [], removed: [], changed: [] } }
        : { success: true, preview: true, to: { id: 'v2', number: 2, label: 'بعد مراجعة أكتوبر' },
          diff: { added: [{ code: 'T-VID', title: 'فيديو التمهيد' }], removed: [{ code: 'R-OLD', title: 'تأمل قديم' }], changed: [], stages: { added: [{ key: 's9', title: 'الختام' }], removed: [], changed: [{ key: 's1', title: 'التمهيد' }] } },
          affected: b.id === 'c0' ? 3 : 0, dropped: { delivery: [], schedule: b.id === 'c0' ? ['التطبيق'] : [], stage_modes: [] }, blocked: null },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}

test('البرامج: حفظ نسخة، المقارنة، الاسترجاع، والتكرار', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.getByText('برنامج سفراء')).toBeVisible();
  await expect(page.getByText(/آخر نسخة محفوظة: 2، بعد مراجعة أكتوبر/)).toBeVisible();

  await page.getByRole('button', { name: 'احفظ نسخة' }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('قبل دفعة سفراء');
  await page.getByRole('dialog').getByRole('button', { name: /موافق|تأكيد|حفظ/ }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-version')).toMatchObject({ id: 'pa', label: 'قبل دفعة سفراء' });

  await page.getByRole('button', { name: 'النسخ (2)' }).click();
  await page.getByRole('button', { name: 'قارن بالحالي' }).last().click();
  await expect(page.getByText(/أُضيف: فيديو التمهيد/)).toBeVisible();
  // الرمز الداخلي لا يظهر للمدير في الفروق
  await expect(page.locator('.la-diff')).not.toContainText('T-VID');
  await page.getByRole('button', { name: 'إغلاق' }).click();

  await page.getByRole('button', { name: 'استرجع' }).last().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.program-restore')?.version_id).toBe('v1');
  // المسترجع نسخة أحدث من الاحتياطية، فالدفعات الجديدة تُثبَّت عليه لا على ما تُرجع عنه
  await expect(page.getByText(/استُرجعت النسخة 1 وحُفظت باسم النسخة 4، وحُفظ ما قبلها باسم النسخة 3. الدفعات الجديدة تُثبَّت على 4/)).toBeVisible();
});

test('الدفعات: طريقة التنفيذ لكل نشاط، والترقية بعد عرض الفرق', async ({ page }) => {
  const calls = await setup(page);
  const row = page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' });
  await expect(row).toContainText('جمعية سفراء');
  await expect(row).toContainText('النسخة 1');

  await row.getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: سفراء 2026' });
  await form.getByRole('button', { name: 'التنفيذ' }).click();
  await expect(form.getByLabel('حضور الأيام التدريبية: توثيق الحضور')).toHaveValue('join');
  await form.getByLabel('جلسات التوجيه: طريقة الجلسة').selectOption('in_person');
  await form.getByLabel('جلسات التوجيه: المكان').fill('مقر الجمعية');
  await form.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({
    id: 'c1', organization_id: 'o1', program_version_id: 'v1',
    delivery: { 'T-ATTEND': { verify: 'join' }, 'O-SESS': { mode: 'in_person', location_ar: 'مقر الجمعية' } },
  });

  await row.getByRole('button', { name: 'رقِّ إلى 2' }).click();
  await expect(page.getByText('ترقية «سفراء 2026» إلى النسخة 2')).toBeVisible();
  await expect(page.getByText(/أُضيف: فيديو التمهيد/)).toBeVisible();
  await page.getByRole('button', { name: 'رقِّ الدفعة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-upgrade' && c.confirm)?.id).toBe('c1');
});

test('الدفعة غير المثبتة: شارتها وزر «ثبّت على»، والمعاينة بفرق المراحل ومن له تقدم وما يُسقط، ثم التثبيت بنسخة مسماة', async ({ page }) => {
  const calls = await setup(page);
  const row = page.locator('.data-table tbody tr', { hasText: 'الدفعة المفتوحة' });
  await expect(row.locator('.la-chip.warn', { hasText: 'غير مثبتة' })).toBeVisible();
  await expect(page.locator('.la-card', { hasText: 'برنامج القادة' }).first()).toContainText('دفعة غير مثبتة');
  await row.getByRole('button', { name: 'ثبّت على 2' }).click();
  const dlg = page.getByRole('dialog', { name: 'الفرق' });
  await expect(dlg).toContainText('تثبيت «الدفعة المفتوحة» على النسخة 2');
  await expect(dlg).toContainText('مراحل أُضيفت: الختام');
  await expect(dlg).toContainText('مراحل تغيّرت: التمهيد');
  await expect(dlg).toContainText('حُذف: تأمل قديم');
  await expect(dlg).toContainText('3 أعضاء لهم تقدم في متطلبات تختفي من الرحلة');
  await expect(dlg).toContainText('تُسقط من خطة الدفعة مراحل ليست في النسخة: التطبيق.');
  await dlg.getByRole('button', { name: 'ثبّت الدفعة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-upgrade' && c.confirm)).toMatchObject({ id: 'c0', version_id: 'v2' });
});

test('الدفعة المفتوحة لا ترتبط بجهة ولا تُغلق', async ({ page }) => {
  await setup(page);
  await page.locator('.data-table tbody tr', { hasText: 'الدفعة المفتوحة' }).getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: الدفعة المفتوحة' });
  await expect(form.getByLabel('الجهة')).toHaveCount(0);
  await expect(form.getByLabel('الحالة').locator('option')).toHaveCount(2);
});

test('رؤية الدفعة: لكل مفتاح الإعداد العام واستثناء الدفعة، والحفظ يرسل الاستثناءات وحدها', async ({ page }) => {
  const calls = await setup(page);
  await page.locator('tr', { hasText: 'سفراء 2026' }).getByRole('button', { name: 'الرؤية' }).click();
  const dlg = page.getByRole('dialog', { name: 'رؤية دفعة سفراء 2026' });
  await expect(dlg.getByRole('group', { name: 'مستشار الدفعة وخبير المجموعة' })).toBeVisible();
  const contact = dlg.getByLabel('مستشار الدفعة وخبير المجموعة: وسائل التواصل');
  await expect(contact).toHaveValue('');
  await expect(contact.locator('option').first()).toHaveText('كالإعداد العام (مرئي)');
  // استثناء قائم يظهر باختياره، والإعداد العام محجوب بجانبه
  const answers = dlg.getByLabel('مستشار الدفعة وخبير المجموعة: إجابات القياس');
  await expect(answers).toHaveValue('on');
  await expect(answers.locator('option').first()).toHaveText('كالإعداد العام (محجوب)');
  await contact.selectOption('off');
  await answers.selectOption('');
  await dlg.getByRole('button', { name: 'احفظ الاستثناءات' }).click();
  await expect(page.getByText('حُفظت استثناءات الرؤية')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.cohort-visibility-save')).toMatchObject({ cohort_id: 'c1', visibility: { adv_contact: false } });
  expect(calls.find((c) => c.action === 'admin.cohort-visibility-save').visibility).not.toHaveProperty('adv_answers');
});

test('صفحة الدفعة برابطها: جاهزيتها بندًا بندًا، والناقص يفتح نافذة ضبطه، والتحديث يبقيك فيها', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'سفراء 2026' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1$/);
  await page.reload();
  const card = page.locator('.cohort-page');
  // اسم الدفعة عنوان واحد في ملفها: الخريطة داخله لا تكرره (embedded)
  await expect(card.getByRole('heading', { name: 'سفراء 2026' })).toBeVisible();
  // المدة مضبوطة، والمستشار ناقص وله زر يفتح نافذته. وخطة المراحل ناجحة بتاريخ البداية (R2a): تُحسب من المدد بلا جدول مكتوب
  await expect(card.locator('.cohort-setup li.ok', { hasText: 'مدة الدفعة' })).toHaveCount(1);
  const advisor = card.locator('.cohort-setup li.no', { hasText: 'المستشار والفريق' });
  await expect(advisor.getByRole('button', { name: 'الفريق والمجموعات' })).toBeVisible();
  await expect(card.getByRole('link', { name: /المشاركون/ })).toHaveAttribute('href', '#/leaders/participants?cohort=c1');
  // «أين توقفوا» يحمل الدفعة نفسها، والجاهزية تُقرأ «كذا من كذا» لا كسرًا ينقلب في العربية
  await expect(card.getByRole('link', { name: /أين توقفوا/ })).toHaveAttribute('href', '#/leaders/insight?cohort=c1');
  await expect(card.locator('.stat-card', { hasText: 'الجاهزية' }).locator('.stat-value')).toContainText(' من ');
  // نوعها بجملة، والالتحاق تلقائي برابط الجهة، والإعدادات كلها في لوحة واحدة
  await expect(card.locator('.cohort-kind')).toContainText('يدخلها تلقائيًا كل من يسجّل برابط الجهة');
  await expect(card.locator('.cohort-setup li', { hasText: 'الالتحاق' })).toContainText('دون أي إلحاق يدوي');
  for (const t of ['الأساسيات', 'الرحلة', 'الرؤية', 'رحلة البرنامج', 'الشهادة', 'التقييم الختامي', 'الجهة']) await expect(card.locator('.cohort-tile', { hasText: t }).first()).toBeVisible();
  // لا بلاطة «الجدول» ولا نافذته (القرار 23): المواعيد والمدد في تبويب «الرحلة»
  await expect(card.locator('.cohort-tile', { hasText: /^الجدول/ })).toHaveCount(0);
  await expect(card.locator('.cohort-setup li.ok', { hasText: 'خطة المراحل' })).toContainText('تواريخ المراحل من بداية الدفعة ومدد البرنامج');
  await advisor.getByRole('button', { name: 'الفريق والمجموعات' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /كل البرامج والدفعات/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs$/);
  await expect(page.getByRole('heading', { name: 'الدفعات' })).toBeVisible();
});

test('ملف الدفعة: خريطة الرحلة نفسها التي في صفحة الجهة، بنوافذ الدفعة ومن تجاوز موعده (R0، وفي تبويب «الرحلة» منذ R1)', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: 'سفراء 2026' }).click();
  // الخريطة في تبويب «الرحلة» لا في «الملف»، فلا تُحسب قبل فتحه
  expect(calls.filter((c) => c.action === 'admin.cohort-journey')).toHaveLength(0);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const card = page.locator('.cohort-page');
  const map = card.getByRole('region', { name: 'خريطة الرحلة', exact: true });
  await expect(map).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.cohort-journey')).toMatchObject({ cohort_id: 'c1' });
  const jm = map.locator('.jm');
  // عنوان القسم وحده «خريطة الرحلة»، والخريطة داخله بلا عنوان ثانٍ ولا اسم الدفعة مكررًا
  await expect(map.getByRole('heading', { name: 'خريطة الرحلة' })).toHaveCount(1);
  await expect(map.getByRole('heading', { name: 'سفراء 2026' })).toHaveCount(0);
  await expect(jm.locator('.jm-totals div', { hasText: 'في الرحلة' }).locator('dd')).toHaveText('3');
  // «متأخر» في دفعة مؤرخة: تجاوز موعد المرحلة على جدول الدفعة، لا مدة المكوث فيها
  await expect(jm.locator('.jm-totals div.is-late dt')).toHaveText('تجاوزوا موعد مرحلتهم');
  await expect(map).toContainText('أيًا كان يوم دخوله إليها');
  await expect(jm.locator('.jm-stage.today')).toContainText('التدريب');
  await expect(jm.locator('.jm-late')).toHaveText('1 متأخر');
  // تفاصيل المرحلة: نافذتها في الدفعة والأسماء ومن تجاوز موعده
  await jm.getByRole('button', { name: /^التدريب/ }).click();
  const panel = jm.getByRole('region', { name: 'تفاصيل مرحلة التدريب' });
  await expect(panel).toContainText('من 3 نوفمبر إلى 17 نوفمبر');
  await expect(panel.locator('tr.is-late')).toContainText('سارة');
  // الدفعة المفتوحة تضم كل من ليس في دفعة: لا تُحسب خريطتها عند فتح الملف بل بطلب صريح، وبرنامج بلا مراحل سطر واضح لا عنوان فارغ
  await page.getByRole('button', { name: /كل البرامج والدفعات/ }).click();
  const before = calls.filter((c) => c.action === 'admin.cohort-journey').length;
  await page.getByRole('button', { name: 'الدفعة المفتوحة' }).first().click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const open = page.locator('.cohort-page').getByRole('region', { name: 'خريطة الرحلة', exact: true });
  await expect(open).toContainText('الدفعة المفتوحة تضم كل من ليس في دفعة');
  expect(calls.filter((c) => c.action === 'admin.cohort-journey').length).toBe(before);
  await open.getByRole('button', { name: 'اعرض خريطة الرحلة' }).click();
  await expect(open).toContainText('لا مراحل معرّفة لبرنامج هذه الدفعة بعد');
  expect(calls.filter((c) => c.action === 'admin.cohort-journey').at(-1)).toMatchObject({ cohort_id: 'c0' });
});

test('ملف الدفعة: رابط التسجيل ظاهر، والدفعة «مخطط لها» تُنبَّه بأنها لا تستقبل منضمي الجهة', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'سفراء 2026' }).click();
  const card = page.locator('.cohort-page');
  await expect(card.locator('.cohort-link code')).toHaveText('https://leaders.sunkvalue.com/j/sufara');
  await expect(page.locator('.data-table')).toHaveCount(0);
  // من الجدول: عمود الجاهزية لكل دفعة
  await page.getByRole('button', { name: /كل البرامج والدفعات/ }).click();
  await expect(page.locator('.data-table tbody tr', { hasText: 'سفراء 2026' }).locator('.la-chip', { hasText: /بقي|مكتملة/ })).toBeVisible();
});

test('برنامج بلا دفعة: الرسالة تخص البرنامج بوضوح، وزرها يفتح المعالج عليه', async ({ page }) => {
  await setup(page);
  const card = page.locator('.la-card', { hasText: 'برنامج سفراء' });
  await expect(card.locator('.la-reach.none')).toContainText('لا توجد دفعة على هذا البرنامج بعد');
  await card.getByRole('button', { name: 'أنشئ له دفعة' }).click();
  const wiz = page.getByRole('dialog', { name: 'دفعة جديدة' });
  await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o2');
  await wiz.getByRole('button', { name: 'التالي' }).click();
  await expect(wiz.getByRole('combobox', { name: 'البرنامج' })).toHaveValue('pb');
});

test('معالج الدفعة الجديدة: أربع خطوات، ثم ملف الدفعة ونافذة فريقها', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '+ دفعة جديدة' }).click();
  const wiz = page.getByRole('dialog', { name: 'دفعة جديدة' });
  await expect(wiz.locator('.wiz-steps li')).toHaveCount(4);
  // لا انتقال بلا جهة
  await wiz.getByRole('button', { name: 'التالي' }).click();
  await expect(page.getByRole('status').getByText('اختر الجهة')).toBeVisible();
  await wiz.getByRole('combobox', { name: 'الجهة' }).selectOption('o1');
  await wiz.getByRole('button', { name: 'التالي' }).click();
  // دفعة الجهة القائمة يُنبَّه إليها
  await expect(wiz.locator('.wiz-notes')).toContainText('سفراء 2026');
  await wiz.getByRole('combobox', { name: 'البرنامج' }).selectOption('pa');
  await wiz.getByRole('button', { name: 'التالي' }).click();
  await expect(wiz.getByLabel('اسم الدفعة')).toHaveValue('دفعة جمعية سفراء');
  await wiz.getByLabel('تبدأ').fill('2027-03-01');
  await wiz.getByLabel('تنتهي').fill('2027-06-01');
  await wiz.getByRole('button', { name: 'التالي' }).click();
  await expect(wiz).toContainText('ويدخلها منضموها تلقائيًا');
  await wiz.getByRole('button', { name: 'أنشئ الدفعة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({
    name: 'دفعة جمعية سفراء', organization_id: 'o1', program_id: 'pa', program_version_id: 'latest', status: 'open', starts_on: '2027-03-01', ends_on: '2027-06-01',
  });
  await expect(page).toHaveURL(/#\/leaders\/programs\/c2$/);
});

test('من صفحة الجهة: «دفعة جديدة لهذه الجهة» يفتح المعالج على الجهة', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.location.hash = '#/leaders/programs?new=o1'; });
  const wiz = page.getByRole('dialog', { name: 'دفعة جديدة' });
  await expect(wiz.getByRole('combobox', { name: 'الجهة' })).toHaveValue('o1');
});
