// تبويب «الرحلة» في ملف الدفعة (R1 في تصور محرر رحلة الدفعة): الرأس والخط الحي وبطاقات المراحل بالمحاور، والمتوازية
// ممرات تحت بعضها، والمعالم بمواعيدها ومصدرها، وأعداد الناس من خريطة الرحلة. للقراءة فقط. الخلفية مُحاكاة، واليوم 16 نوفمبر 2026.
// COHORT_JOURNEY_SHOTS: مجلد تُحفظ فيه لقطتا التبويب بعرضي 1440 و390.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.COHORT_JOURNEY_SHOTS || '';
// اللقطات بكثافة الشاشات الحديثة، والفحص العادي بالكثافة الافتراضية
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, active: true },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 6, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training', mode: 'optional' } },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 7, duration_days: 90, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 7, active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'يوم ورشة عن بعد', sort: 1, active: true, config: { sessions_required: 1, verify: 'join' } },
  { id: 'r3', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول من كل إطار', sort: 2, active: true, hidden: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 1, active: true, config: { mode: 'online' } },
  { id: 'r5', code: 'C-UP', stage_key: 'consult', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 1, active: true },
  { id: 'r6', code: 'S-MEET', stage_key: 'support', kind: 'workshop', required: true, title_ar: 'لقاء منتصف الدعم', sort: 1, active: true },
];
const sessions = [
  { id: 's1', requirement_id: 'r2', cohort_id: 'c1', title_ar: 'يوم الورشة', starts_at: null, ends_at: null, mode: 'online', active: true },
  { id: 's2', requirement_id: 'r6', cohort_id: 'c1', title_ar: 'لقاء', starts_at: '2027-01-17T06:00:00Z', ends_at: '2027-01-17T08:00:00Z', mode: 'in_person', active: true },
];
const definition = {
  success: true, program_id: 'pa', version: { id: 'v1', number: 1, label: 'الإطلاق' }, stages, hidden: ['T-READ'], sessions,
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: !!r.hidden })),
};
const milestones = [
  { id: 'm1', title_ar: 'نهاية التدريب', anchor: 'stage_end', stage_key: 'training', offset_days: 0, active: true, sort: 1 },
  { id: 'm2', title_ar: 'خطة الأثر', anchor: 'stage_start', stage_key: 'support', offset_days: 7, active: true, sort: 2 },
  { id: 'm3', title_ar: 'التقرير الختامي', anchor: 'cohort_end', offset_days: 0, active: true, sort: 3 },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [{ id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [
  { id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-02', ends_on: '2027-02-15', delivery: {}, members: 12, schedule: {} },
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', delivery: {}, members: 40, schedule: {} },
];
const journeyMap = {
  program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة نوفمبر', starts_on: '2026-11-02', today_stage: 'training' },
  totals: { total: 12, finished: 0, late: 2, not_started: 0 }, bottleneck: { stage: 'training' },
  stages: stages.map((s) => ({ key: s.key, title: s.title_ar, phase: s.phase, duration_days: s.duration_days, here: { training: 7, ojt: 3, approval: 2 }[s.key] || 0,
    done: { profile: 12, assessment: 12, approval: 10, training: 0 }[s.key] || 0, late: s.key === 'training' ? 2 : 0, window: null, people: [] })),
  milestones: [{ id: 'm1', title: 'نهاية التدريب', due: '2026-11-19', done: 0, late: 0 }],
};

// queue: ردود تُستهلك بالترتيب لإجراء بعينه قبل رده المعتاد (فشل ثم نجاح عند «أعد المحاولة»)
async function setup(page, width = 1440, queue = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': definition,
      'admin.milestones': { success: true, program_id: 'pa', milestones },
      'admin.cohort-journey': { success: true, journey_map: journeyMap },
      'admin.catalog': { success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements, instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {} },
    };
    const q = queue[b.action];
    await route.fulfill({ json: (q && q.length ? q.shift() : replies[b.action]) ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const openCohort = (page, name = 'دفعة نوفمبر') => page.locator('.data-table tbody tr', { hasText: name }).getByRole('button', { name, exact: true }).click();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('التبويب: الملف ثم الرحلة بالأسهم، والعنوان يحفظ المختار، والقراءة بإجراءات قائمة وحدها', async ({ page }) => {
  const calls = await setup(page);
  await openCohort(page);
  const tabs = page.getByRole('tablist', { name: 'أقسام ملف الدفعة' });
  await expect(tabs.getByRole('tab', { name: 'الملف' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cohort-setup')).toBeVisible();
  // الأسهم تنقل بين التبويبين (يسار في الاتجاه من اليمين لليسار = التالي)
  await tabs.getByRole('tab', { name: 'الملف' }).focus();
  await page.keyboard.press('ArrowLeft');
  const jt = tabs.getByRole('tab', { name: 'الرحلة' });
  await expect(jt).toHaveAttribute('aria-selected', 'true');
  await expect(jt).toBeFocused();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=journey$/);
  await expect(page.getByRole('tabpanel', { name: 'الرحلة' })).toBeVisible();
  await expect(page.locator('.cohort-setup')).toHaveCount(0);
  // التحديث يفتح على التبويب نفسه
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
  // لا كتابة: إجراءات القراءة الثلاثة وحدها
  const actions = [...new Set(calls.map((c) => c.action))];
  expect(actions).toEqual(expect.arrayContaining(['admin.cohort-definition', 'admin.milestones', 'admin.cohort-journey']));
  expect(actions.filter((a) => /save|upgrade|delete|plan/.test(a))).toEqual([]);
  // بلاطة «الرحلة» في الملف تفتح التبويب أيضًا
  await page.getByRole('tab', { name: 'الملف' }).click();
  await page.locator('.cohort-tile', { hasText: 'المراحل بتواريخها' }).click();
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
});

test('الحاسوب 1440: الرأس والمؤشرات والخط والبطاقات بالمحاور، والمتوازية ممرات، والمعالم بمصدرها', async ({ page }) => {
  await setup(page, 1440);
  await openCohort(page);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  // الرأس: البداية بيومها، والنهاية من الخط نفسه، والمدة، واليوم
  const hero = panel.locator('.cj-hero');
  await expect(hero).toContainText('تبدأ الدفعة الاثنين، 2 نوفمبر 2026');
  await expect(hero).toContainText('وتنتهي الرحلة');
  await expect(hero).toContainText('النسخة 1 المثبتة (الإطلاق)');
  await expect(hero.getByRole('status')).toContainText('اليوم 16 نوفمبر');
  await expect(hero.getByRole('status')).toContainText('الأسبوع 3، 3 مراحل تسير معًا');
  // نهاية الرحلة المحسوبة بعد نهاية الدفعة المسجلة: تنبيه لا تعديل
  await expect(panel.locator('.cj-alert')).toContainText('نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة (15 فبراير 2027)');
  await expect(panel.locator('.cj-kpis')).toContainText('8 مراحل في 3 محاور');
  await expect(panel.locator('.cj-kpis')).toContainText('مجموعة واحدة');
  await expect(panel.locator('.cj-kpis')).toContainText('3 معالم');
  await expect(panel.locator('.cj-kpis .tone-warn')).toContainText('12 عضوًا، منهم 2 تجاوز موعده');
  // الخط الزمني نفسه، والنقر على اسم مرحلة ينقل إلى بطاقتها
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  await expect(tl.locator('.jt-today')).toContainText('اليوم 16 نوفمبر');
  await tl.getByRole('button', { name: 'الاستشارة: انتقل إلى بطاقتها' }).click();
  await expect(panel.locator('#cj-stage-consult')).toBeFocused();
  // النقر بالفأرة لا يُظهر :focus-visible، فإبراز قصير يدل على البطاقة ثم يزول
  await expect(panel.locator('#cj-stage-consult')).toHaveClass(/\bflash\b/);
  await expect(panel.locator('#cj-stage-consult')).not.toHaveClass(/\bflash\b/, { timeout: 4000 });
  // لا تكرار: المدة والنافذة والآن في الرأس والمؤشرات وحدها، ويبقى في الخط ما لا يقوله غيره
  await expect(tl.locator('.jt-cards')).not.toContainText('النافذة');
  await expect(tl.locator('.jt-cards')).not.toContainText('الأسبوع 3');
  await expect(tl.locator('.jt-cards')).toContainText('ينقص');
  // المخطط: أقسام التبويب بجوار الخط (h3)، والمحاور تحتها (h4)، والبطاقات (h5)
  await expect(panel.getByRole('heading', { level: 3, name: 'المراحل', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { level: 3, name: 'خريطة الرحلة', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { level: 5, name: 'التدريب', exact: true })).toBeVisible();
  // المحاور الثلاثة، والتأهيل مجموعة واحدة بثلاثة ممرات
  const stagesSec = panel.getByRole('region', { name: 'المراحل' });
  await expect(stagesSec.getByRole('heading', { level: 4 })).toHaveText(['القبول', 'التأهيل', 'الأثر', 'معالم الدفعة']);
  const group = stagesSec.getByRole('group', { name: /^مراحل تسير معًا/ });
  await expect(group).toHaveCount(1);
  await expect(group.locator('.cj-card')).toHaveCount(3);
  await expect(group).toContainText('«التدريب»، ومعها «التوجيه على رأس العمل» و«الاستشارة»، في الأسابيع نفسها');
  // بطاقة التدريب: النافذة ومصدرها والمدة والحال والأنشطة الظاهرة والناس والمعلم بموعده المحسوب
  const training = stagesSec.getByRole('article', { name: 'التدريب' });
  await expect(training.locator('.cj-dur')).toHaveText('أسبوعان');
  await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 19 نوفمبر');
  await expect(training.locator('.cj-window')).toContainText('محسوبة من بداية الدفعة ومدد المراحل');
  await expect(training.locator('.cj-state')).toHaveText('جارية');
  await expect(training).toContainText('نشاطان، الظاهر منها 1');
  await expect(training).toContainText('موعد يُحدد لاحقًا');
  await expect(training).toContainText('7 الآن');
  await expect(training).toContainText('2 تجاوز موعدها');
  const ms = training.getByRole('list', { name: 'معالم التدريب' });
  await expect(ms).toContainText('نهاية التدريب');
  await expect(ms).toContainText('19 نوفمبر 2026');
  await expect(ms).toContainText('محسوب من مدد المراحل');
  const ojt = stagesSec.getByRole('article', { name: 'التوجيه على رأس العمل' });
  await expect(ojt).toContainText('تبدأ مع «التدريب»');
  await expect(stagesSec.getByRole('article', { name: 'الاستشارة' })).toContainText('اختيارية');
  await expect(stagesSec.getByRole('article', { name: 'اعتماد المستوى' }).locator('.cj-state')).toHaveText('انتهت');
  // معالم الدفعة: المرتبط بنهاية الدفعة
  await expect(stagesSec.locator('.cj-cohort-ms')).toContainText('التقرير الختامي');
  await expect(stagesSec.locator('.cj-cohort-ms')).toContainText('15 فبراير 2027');
  await expect(stagesSec.locator('.cj-cohort-ms')).toContainText('من تاريخ الدفعة');
  // خريطة الرحلة (R0) في التبويب نفسه
  await expect(panel.getByRole('region', { name: 'خريطة الرحلة', exact: true }).locator('.jm')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  if (SHOTS) {
    await page.locator('.cohort-page').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${SHOTS}/cohort-journey-1440.png`, fullPage: true });
  }
});

test('الهاتف 390: لا تمرير أفقي، والخط رأسي، والممرات تحت بعضها', async ({ page }) => {
  await setup(page, 390);
  await openCohort(page);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(panel.locator('.jt-desk')).toBeHidden();
  await expect(panel.getByRole('list', { name: 'مراحل الرحلة' })).toBeVisible();
  const lanes = panel.locator('.cj-group.together .cj-card');
  await expect(lanes).toHaveCount(3);
  const [a, b] = [await lanes.nth(0).boundingBox(), await lanes.nth(1).boundingBox()];
  expect(b.y).toBeGreaterThan(a.y + a.height - 1);
  expect(await noOverflow(page)).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cohort-journey-390.png`, fullPage: true });
});

test('الدفعة المفتوحة: بلا تواريخ مطلقة، والخريطة بطلب صريح', async ({ page }) => {
  const calls = await setup(page, 1440);
  await openCohort(page, 'الدفعة المفتوحة');
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(panel.locator('.cj-hero')).toContainText('دفعة مفتوحة: المدد نسبية من دخول كل مشارك، ولا تواريخ مطلقة.');
  await expect(panel.locator('.jt-today')).toHaveCount(0);
  await expect(panel.getByRole('article', { name: 'التدريب' })).toContainText('بلا تواريخ');
  expect(calls.filter((c) => c.action === 'admin.cohort-journey')).toHaveLength(0);
  await panel.getByRole('button', { name: 'اعرض خريطة الرحلة' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.cohort-journey').length).toBe(1);
});

test('فشل القراءة يُقال صراحة: المعالم وأعداد الناس، و«أعد المحاولة» يستعيدهما', async ({ page }) => {
  const calls = await setup(page, 1440, {
    'admin.milestones': [{ success: false, message: 'تعذّرت قراءة معالم البرنامج' }],
    'admin.cohort-journey': [{ success: false, message: 'تعذّرت قراءة خريطة الرحلة' }],
  });
  await openCohort(page);
  // التبويب غير المختار لا يشير إلى لوحة غير موجودة
  await expect(page.getByRole('tab', { name: 'الرحلة' })).not.toHaveAttribute('aria-controls', /.+/);
  await expect(page.getByRole('tab', { name: 'الملف' })).toHaveAttribute('aria-controls', 'cohort-panel-overview');
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(page.getByRole('tab', { name: 'الملف' })).not.toHaveAttribute('aria-controls', /.+/);
  await expect(panel.locator('.cj-kpis div', { hasText: 'المعالم' }).locator('dd')).toHaveText('تعذّرت القراءة');
  const msAlert = panel.getByRole('alert').filter({ hasText: 'تعذّرت قراءة معالم البرنامج' });
  await expect(msAlert).toBeVisible();
  await expect(panel.getByText('تعذّرت قراءة أعداد الناس، فلا تظهر في البطاقات.')).toBeVisible();
  await expect(panel.getByRole('article', { name: 'التدريب' })).not.toContainText('الناس');
  const mapSec = panel.getByRole('region', { name: 'خريطة الرحلة', exact: true });
  await expect(mapSec.getByRole('alert')).toContainText('تعذّرت قراءة خريطة الرحلة');
  // إعادة الخريطة وحدها، ثم المعالم
  await mapSec.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(mapSec.locator('.jm')).toBeVisible();
  await expect(panel.getByRole('article', { name: 'التدريب' })).toContainText('7 الآن');
  await msAlert.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(panel.locator('.cj-kpis')).toContainText('3 معالم');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(calls.filter((c) => c.action === 'admin.milestones')).toHaveLength(2);
});
