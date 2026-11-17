// تبويب «الرحلة» في ملف الدفعة (R1 في تصور محرر رحلة الدفعة): الرأس والخط الحي وبطاقات المراحل بالمحاور، والمتوازية
// ممرات تحت بعضها، والمعالم بمواعيدها ومصدرها، وأعداد الناس من خريطة الرحلة. للقراءة فقط. الخلفية مُحاكاة، واليوم 16 نوفمبر 2026.
// COHORT_JOURNEY_SHOTS: مجلد تُحفظ فيه لقطتا التبويب بعرضي 1440 و390.
import { test, expect } from '@playwright/test';
import { cohortPlan } from '../supabase/functions/leaders-api/stage-windows.js';
import { planEdit, planImpact, sameSchedule } from '../supabase/functions/leaders-api/cohort-plan.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.COHORT_JOURNEY_SHOTS || '';
// اللقطات بكثافة الشاشات الحديثة، والفحص العادي بالكثافة الافتراضية
test.use({ deviceScaleFactor: SHOTS || process.env.R2A_SHOTS || process.env.R2B_SHOTS ? 2 : 1 });
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

// خطة الدفعة على «الخادم» المحاكى (admin.cohort-plan): المنطق المشترك نفسه (planEdit وplanImpact)، وأعضاء في التدريب
const PLAN_PEOPLE = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, at: 'training', stagesDone: ['profile', 'assessment', 'approval'], records: {} }));
function planServer(state, b) {
  const c = { ...cohorts.find((x) => x.id === b.cohort_id), schedule: state.schedule, updated_at: state.updated_at };
  const live = stages.filter((s) => s.active !== false);
  const out = (schedule) => { const p = cohortPlan(live, { ...c, schedule }); return { schedule, start: p.start, end: p.end, total_days: p.total_days, stages: p.stages, issues: p.issues }; };
  if (b.op === 'history') return { success: true, history: state.history, can_undo: state.history[0]?.action === 'cohort.plan' };
  if (b.op === 'undo') {
    const last = state.history[0];
    if (!last || last.action !== 'cohort.plan') return { success: false, message: 'لا حفظ للخطة يُتراجع عنه.' };
    state.schedule = last.before;
    state.updated_at = `u${state.history.length + 1}`;
    state.history.unshift({ id: `h${state.history.length + 1}`, action: 'cohort.plan-undo', actor: 'a@x', at: '2026-11-16T09:10:00Z', summary: null });
    return { success: true, saved: true, cohort: { id: c.id, schedule: state.schedule, updated_at: state.updated_at }, plan: out(state.schedule) };
  }
  const r = planEdit({ stages: live, schedule: c.schedule, edit: { days: b.days || {}, follow: b.follow, off: b.off || {} }, cohort: c, requirements });
  if (r.errors.length) return { success: false, message: r.errors.map((e) => e.msg).join('، ') };
  const impact = planImpact({ stages: live, before: c.schedule, after: r.schedule, cohort: c, milestones, people: PLAN_PEOPLE, today: '2026-11-16T09:00:00Z', cutoff: '2026-11-01' });
  if (b.op === 'preview') return { success: true, preview: true, locked: null, changed: !sameSchedule(c.schedule, r.schedule), plan: out(r.schedule), impact };
  const before = state.schedule;
  state.schedule = r.schedule;
  state.updated_at = `u${state.history.length + 1}`;
  state.history.unshift({ id: `h${state.history.length + 1}`, action: 'cohort.plan', actor: 'a@x', at: '2026-11-16T09:05:00Z', before,
    summary: { changes: impact.changes.map((x) => ({ key: x.key, before: x.before.days, after: x.after.days, ...(x.off ? { off: x.off } : {}) })), shift: impact.end.shift, stopped: impact.stopped, started: impact.started } });
  return { success: true, saved: true, cohort: { id: c.id, schedule: state.schedule, updated_at: state.updated_at }, plan: out(state.schedule), impact,
    exempted: 0, notified: b.notify ? impact.notify.members : null };
}

// queue: ردود تُستهلك بالترتيب لإجراء بعينه قبل رده المعتاد (فشل ثم نجاح عند «أعد المحاولة»)
async function setup(page, width = 1440, queue = {}, plan = { schedule: {}, updated_at: 'u0', history: [] }) {
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
      'admin.cohort-definition': { ...definition, cohort_plan: { schedule: plan.schedule, starts_on: cohorts.find((x) => x.id === b.cohort_id)?.starts_on || null, is_default: !!cohorts.find((x) => x.id === b.cohort_id)?.is_default, status: 'running', program_version_id: cohorts.find((x) => x.id === b.cohort_id)?.program_version_id || null, updated_at: plan.updated_at } },
      'admin.cohort-plan': b.action === 'admin.cohort-plan' ? planServer(plan, b) : null,
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
  return Object.assign(calls, { plan });
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
  // النهاية شاملة (القرار 18، R2a): أسبوعان من 5 نوفمبر ينتهيان 18 نوفمبر
  await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 18 نوفمبر');
  await expect(training.locator('.cj-window')).toContainText('محسوبة من بداية الدفعة ومدد المراحل');
  await expect(training.locator('.cj-state')).toHaveText('جارية');
  await expect(training).toContainText('نشاطان، الظاهر منها 1');
  await expect(training).toContainText('موعد يُحدد لاحقًا');
  await expect(training).toContainText('7 الآن');
  await expect(training).toContainText('2 تجاوز موعدها');
  const ms = training.getByRole('list', { name: 'معالم التدريب' });
  await expect(ms).toContainText('نهاية التدريب');
  await expect(ms).toContainText('18 نوفمبر 2026');
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

// ══ R2a: تعديل مدة مرحلة لهذه الدفعة، بمعاينة حية ونافذة أثر من الخادم ثم حفظ وتراجع ══
// R2A_SHOTS: مجلد تُحفظ فيه لقطتا وضع التحرير ونافذة الأثر بعرضي 1440 و390 (حدود الشاشة وحدها)
const R2A = process.env.R2A_SHOTS || '';
for (const width of [1440, 390]) {
  test(`تعديل المدة (${width}): العداد يزيح ما بعده في المعاينة، ونافذة الأثر قبل الحفظ، ثم «حُفظ. تراجع» والسجل`, async ({ page }) => {
    const calls = await setup(page, width);
    await openCohort(page);
    await page.getByRole('tab', { name: 'الرحلة' }).click();
    const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
    await expect(panel.locator('.cj-planbar')).toContainText('كل المدد من البرنامج');
    await panel.getByRole('button', { name: 'عدّل المدد' }).click();
    const training = panel.getByRole('article', { name: 'التدريب' });
    const ctl = training.getByRole('group', { name: 'مدة التدريب' });
    // الوحدة أسابيع لأن المدة أسبوعان تامان، والزيادة أسبوع تام (القرار 9)
    await expect(ctl.getByRole('combobox', { name: 'وحدة مدة التدريب' })).toHaveValue('weeks');
    await expect(ctl.getByRole('textbox')).toHaveValue('2');
    await ctl.getByRole('button', { name: 'زد مدة التدريب' }).click();
    await expect(ctl).toContainText('3 أسابيع');
    await expect(ctl).toContainText('معدّلة: البرنامج أسبوعان');
    // المعاينة الحية قبل الحفظ: نافذة التدريب الجديدة شاملة، والدعم بعد أطول المجموعة (التوجيه 28 يومًا) كما هو
    await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 25 نوفمبر');
    await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
    expect(calls.filter((c) => c.action === 'admin.cohort-plan')).toHaveLength(0);
    // التوجيه أطول من التدريب: نزيده أسبوعًا فيُزاح الدعم وتتأخر نهاية الرحلة
    const ojt = panel.getByRole('article', { name: 'التوجيه على رأس العمل' }).getByRole('group', { name: 'مدة التوجيه على رأس العمل' });
    await ojt.getByRole('button', { name: 'زد مدة التوجيه على رأس العمل' }).click();
    await expect(panel.getByRole('article', { name: 'الدعم والتمكين' }).locator('.cj-window')).toContainText('10 ديسمبر');
    await expect(panel.locator('.cj-savebar')).toContainText('تعديلان غير محفوظين');
    expect(await noOverflow(page)).toBe(true);
    if (R2A) {
      await training.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${R2A}/r2a-edit-${width}.png` });
    }
    await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
    const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
    await expect(dlg).toContainText('التدريب: أسبوعان إلى 3 أسابيع');
    await expect(dlg).toContainText('التوجيه على رأس العمل: 4 أسابيع إلى 5 أسابيع');
    await expect(dlg).toContainText('تتأخر نهاية الرحلة سبعة أيام');
    await expect(dlg).toContainText('في المراحل التي تتغير مواعيدها: 7 مشاركين في التدريب الآن');
    await expect(dlg).toContainText('البريد: لن يُرسل شيء الآن');
    expect(calls.filter((c) => c.action === 'admin.cohort-plan').map((c) => [c.op, c.days])).toEqual([['preview', { training: 21, ojt: 35 }]]);
    expect(await noOverflow(page)).toBe(true);
    if (R2A) await page.screenshot({ path: `${R2A}/r2a-impact-${width}.png` });
    await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('status').getByText('حُفظت خطة الدفعة')).toBeVisible();
    expect(calls.plan.schedule).toEqual({ training: { days: 21 }, ojt: { days: 35 } });
    expect(calls.find((c) => c.op === 'save')).toMatchObject({ base_updated_at: 'u0' });
    await expect(panel.locator('.cj-savebar')).toHaveCount(0);
    await expect(panel.locator('.cj-planbar')).toContainText('مرحلتان بمدة خاصة بهذه الدفعة');
    await expect(training.locator('.cj-tag.own')).toHaveText('معدّلة لهذه الدفعة');
    await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 25 نوفمبر');
    // السجل ثم التراجع: الخطة كما كانت قبل الحفظ
    await panel.getByRole('button', { name: 'سجل الخطة' }).click();
    await expect(panel.locator('.cj-history')).toContainText('مرحلتان تغيّرت مدتهما');
    await panel.locator('.cj-saved').getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByRole('status').getByText('تراجعت الخطة')).toBeVisible();
    expect(calls.plan.schedule).toEqual({});
    await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 18 نوفمبر');
    await expect(panel.locator('.cj-planbar')).toContainText('كل المدد من البرنامج');
  });
}

test('العداد بالأيام، و«ارجع لمدة البرنامج»، و«ألغِ» يعيد المعاينة بلا طلب للخادم', async ({ page }) => {
  const calls = await setup(page, 1440);
  await openCohort(page);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  const ctl = panel.getByRole('group', { name: 'مدة اعتماد المستوى' });
  await expect(ctl.getByRole('combobox')).toHaveValue('days');
  await ctl.getByRole('textbox').fill('5');
  await expect(ctl).toContainText('5 أيام');
  await expect(panel.getByRole('article', { name: 'التدريب' }).locator('.cj-window')).toContainText('7 نوفمبر');
  await ctl.getByRole('button', { name: 'ارجع لمدة البرنامج' }).click();
  await expect(ctl).toContainText('من البرنامج');
  await ctl.getByRole('button', { name: 'زد مدة اعتماد المستوى' }).click();
  await panel.locator('.cj-savebar').getByRole('button', { name: 'ألغِ' }).click();
  await expect(panel.getByRole('article', { name: 'التدريب' }).locator('.cj-window')).toContainText('5 نوفمبر إلى 18 نوفمبر');
  await expect(panel.locator('.cj-plan')).toHaveCount(0);
  expect(calls.filter((c) => c.action === 'admin.cohort-plan')).toHaveLength(0);
});

test('الدفعة المفتوحة غير المثبتة: لا تحرير، والسبب مكتوب (القرار 21)', async ({ page }) => {
  await setup(page, 1440);
  await openCohort(page, 'الدفعة المفتوحة');
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(panel.locator('.cj-planbar')).toContainText('لا تُعدَّل قبل تثبيتها على نسخة من برنامجها');
  await expect(panel.getByRole('button', { name: 'عدّل المدد' })).toHaveCount(0);
});

test('الدفعة الموزعة سابقًا: «حرّر التواريخ لتتبع المدد» يحول المثبت إلى مدد، والعداد مقفل قبله', async ({ page }) => {
  const plan = { schedule: { approval: { start: '2026-11-02', end: '2026-11-04' }, training: { start: '2026-11-05', end: '2026-11-21' } }, updated_at: 'u0', history: [] };
  const calls = await setup(page, 1440, {}, plan);
  await openCohort(page);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(panel.locator('.cj-pinned')).toContainText('مرحلتان مثبتتان بتاريخ');
  await panel.getByRole('button', { name: 'حرّر التواريخ لتتبع المدد' }).click();
  // التدريب مثبت 17 يومًا فيصير مدة 17 يومًا خاصة بالدفعة، والاعتماد بطول البرنامج فيعود إليه، والتواريخ لا تتحرك
  const training = panel.getByRole('article', { name: 'التدريب' });
  await expect(training.getByRole('group', { name: 'مدة التدريب' })).toContainText('17 يومًا');
  await expect(training.locator('.cj-window')).toContainText('5 نوفمبر إلى 21 نوفمبر');
  await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
  const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
  await expect(dlg).toContainText('لا تغيير في المدد أو التواريخ');
  await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
  await expect(dlg).toBeHidden();
  expect(calls.plan.schedule).toEqual({ training: { days: 17 } });
  expect(calls.find((c) => c.op === 'save')).toMatchObject({ follow: true });
});

test('تاريخ البداية من التبويب نفسه: بعد حفظه في ملف الدفعة يُقرأ الصف الأحدث، فيصير الرأس مؤرخًا بلا إعادة فتح', async ({ page }) => {
  const c2 = { id: 'c2', name: 'دفعة بلا تاريخ', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: null, ends_on: '2027-02-15', delivery: {}, members: 5, schedule: {}, updated_at: '2026-11-01T00:00:00Z' };
  const calls = await setup(page, 1440);
  // الصف على «الخادم»: الحفظ من محرر الدفعة يغيره، وقائمة الدفعات وتعريف الدفعة يقرآنه
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.programs') return route.fulfill({ json: { success: true, programs, cohorts: [...cohorts, c2], organizations: [] } });
    if (b.action === 'admin.cohort-save' && b.id === 'c2') {
      calls.push(b);
      Object.assign(c2, { starts_on: b.starts_on || c2.starts_on, updated_at: '2026-11-16T09:01:00Z' });
      return route.fulfill({ json: { success: true, cohort: { ...c2 } } });
    }
    if (b.action === 'admin.cohort-definition' && b.cohort_id === 'c2') {
      calls.push(b);
      return route.fulfill({ json: { ...definition, cohort_plan: { schedule: {}, starts_on: c2.starts_on, ends_on: c2.ends_on, is_default: false, status: 'running', program_version_id: 'v1', updated_at: c2.updated_at } } });
    }
    return route.fallback();
  });
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  await openCohort(page, 'دفعة بلا تاريخ');
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await expect(panel.locator('.cj-hero')).toContainText('لم يُحدد تاريخ بداية الدفعة بعد');
  await panel.getByRole('button', { name: 'حدد تاريخ البداية' }).click();
  const ed = page.getByRole('dialog').filter({ has: page.getByLabel('تبدأ') });
  await ed.getByLabel('تبدأ').fill('2026-11-02');
  await ed.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-save')).toMatchObject({ id: 'c2', starts_on: '2026-11-02' });
  await expect(ed).toBeHidden();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  await expect(page.getByRole('tabpanel', { name: 'الرحلة' }).locator('.cj-hero')).toContainText('تبدأ الدفعة');
});

// ══ R2b: إيقاف مرحلة لهذه الدفعة، بمفتاح في البطاقة ونافذة أثر ثم حفظ وتراجع ══
// R2B_SHOTS: مجلد تُحفظ فيه لقطتا وضع التحرير بمرحلة موقوفة ونافذة الأثر بعرضي 1440 و390 (حدود الشاشة وحدها)
const R2B = process.env.R2B_SHOTS || '';
for (const width of [1440, 390]) {
  test(`إيقاف مرحلة (${width}): المفتاح ومنعه بسببه، والمعاينة تزيح ما بعدها، ونافذة الأثر و«أبلغ المشاركين»، ثم الحفظ والتراجع`, async ({ page }) => {
    const calls = await setup(page, width);
    await openCohort(page);
    await page.getByRole('tab', { name: 'الرحلة' }).click();
    const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
    await panel.getByRole('button', { name: 'عدّل المدد' }).click();
    // المحمية: بوابة القبول، ومرجع «تبدأ مع»: المفتاح مقفل وسببه مكتوب ومربوط به
    const profile = panel.getByRole('article', { name: 'الملف الشخصي' }).getByRole('switch', { name: 'أوقف لهذه الدفعة' });
    await expect(profile).toBeDisabled();
    await expect(profile).toHaveAccessibleDescription(/من بوابات القبول/);
    const training = panel.getByRole('article', { name: 'التدريب' }).getByRole('switch', { name: 'أوقف لهذه الدفعة' });
    await expect(training).toBeDisabled();
    await expect(training).toHaveAccessibleDescription(/أوقف أولًا ما يسير معها أو انقله/);
    // الدعم يُوقف: البطاقة باهتة بعلامتها، ومعلمها مستبعد، والتقرير النهائي يبدأ في مكانه
    const support = panel.getByRole('article', { name: 'الدعم والتمكين' });
    const sw = support.getByRole('switch', { name: 'أوقف لهذه الدفعة' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(support).toHaveClass(/\boff\b/);
    await expect(support).toContainText('موقوفة لهذه الدفعة');
    await expect(support.getByRole('group', { name: 'مدة الدعم والتمكين' })).toHaveCount(0);
    await expect(support.locator('.cj-ms li.excluded')).toContainText('مستبعد لهذه الدفعة');
    await expect(panel.getByRole('article', { name: 'التقرير النهائي' }).locator('.cj-window')).toContainText('3 ديسمبر إلى 9 ديسمبر');
    await expect(panel.locator('section.jt')).not.toContainText('الدعم والتمكين');
    await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
    expect(calls.filter((c) => c.action === 'admin.cohort-plan')).toHaveLength(0);
    expect(await noOverflow(page)).toBe(true);
    if (R2B) {
      await support.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${R2B}/r2b-edit-${width}.png` });
    }
    await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
    const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
    await expect(dlg).toContainText('الدعم والتمكين: تُوقف لهذه الدفعة، فلا تأخذ من الرحلة وقتًا ويُزاح ما بعدها');
    await expect(dlg).toContainText('تتقدم نهاية الرحلة 90 يومًا');
    await expect(dlg).toContainText('لا أحد في «الدعم والتمكين» الآن');
    await expect(dlg).toContainText('«خطة الأثر»');
    await expect(dlg).toContainText('البريد: لن يُرسل شيء الآن');
    const notify = dlg.getByRole('checkbox', { name: /أبلغ المشاركين المتأثرين بالمواعيد الجديدة/ });
    await expect(notify).not.toBeChecked();
    await notify.check();
    await expect(dlg).toContainText('يصل 7 مشاركين في الرحلة إشعار «تغيّرت مواعيد رحلتك»');
    expect(calls.filter((c) => c.action === 'admin.cohort-plan').map((c) => [c.op, c.off])).toEqual([['preview', { support: true }]]);
    expect(await noOverflow(page)).toBe(true);
    if (R2B) await page.screenshot({ path: `${R2B}/r2b-impact-${width}.png` });
    await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('status').getByText('حُفظت خطة الدفعة')).toBeVisible();
    expect(calls.find((c) => c.op === 'save')).toMatchObject({ off: { support: true }, notify: true, base_updated_at: 'u0' });
    expect(calls.plan.schedule).toEqual({ support: { off: true } });
    // للقراءة بعد الحفظ: باهتة بعلامتها، والشريط يقولها
    await expect(support.locator('.cj-state.off')).toHaveText('موقوفة لهذه الدفعة');
    await expect(panel.locator('.cj-planbar')).toContainText('مرحلة واحدة موقوفة لهذه الدفعة');
    await panel.getByRole('button', { name: 'سجل الخطة' }).click();
    await expect(panel.locator('.cj-history')).toContainText('أُوقفت مرحلة');
    await panel.locator('.cj-saved').getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByRole('status').getByText('تراجعت الخطة')).toBeVisible();
    expect(calls.plan.schedule).toEqual({});
    await expect(support).not.toHaveClass(/\boff\b/);
    await expect(panel.getByRole('article', { name: 'التقرير النهائي' }).locator('.cj-window')).not.toContainText('3 ديسمبر إلى 9 ديسمبر');
  });
}

test('إيقاف التابع يفتح مفتاح مرجعه، وإعادة الموقوفة في المسودة نفسها لا تبقى تعديلًا', async ({ page }) => {
  await setup(page, 1440);
  await openCohort(page);
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  const panel = page.getByRole('tabpanel', { name: 'الرحلة' });
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  const sw = (name) => panel.getByRole('article', { name }).getByRole('switch', { name: 'أوقف لهذه الدفعة' });
  await expect(sw('التدريب')).toBeDisabled();
  await sw('التوجيه على رأس العمل').click();
  await expect(sw('التدريب')).toBeDisabled();
  await sw('الاستشارة').click();
  await expect(sw('التدريب')).toBeEnabled();
  await expect(panel.locator('.cj-savebar')).toContainText('تعديلان غير محفوظين');
  await sw('الاستشارة').click();
  await sw('التوجيه على رأس العمل').click();
  await expect(panel.locator('.cj-savebar')).toContainText('لا تعديل بعد');
  await expect(panel.getByRole('button', { name: 'راجع واحفظ' })).toBeDisabled();
});
