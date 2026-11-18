// المسار المستمر في اللوحة (T1، تصور 2026-11-18 ب5.1): في تبويب «الرحلة» بملف الدفعة صف «مسارات مستمرة» بجانب السلسلة
// وبطاقته، والتوجيه يبدأ بعد التدريب بيوم وينتهي بنهاية الدفعة فلا يزيح الدعم، وتعديل نهايته لهذه الدفعة بنافذة الأثر ثم الحفظ.
// وفي «الرحلة والمتطلبات» نموذج المرحلة يضبط الطبيعة ومرجعها ونهايتها وما يشترطه. الخلفية مُحاكاة، واليوم 16 نوفمبر 2026.
// T1_SHOTS: مجلد تُحفظ فيه اللقطات (1440 و390 للدفعة، و1440 لإعدادات البرنامج).
import { test, expect } from '@playwright/test';
import { cohortPlan } from '../supabase/functions/leaders-api/stage-windows.js';
import { impactSummary, planEdit, planImpact, sameSchedule } from '../supabase/functions/leaders-api/cohort-plan.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.T1_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const TRACK = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'final' };
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, duration_label: 'يوما عمل', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, duration_label: 'طوال الرحلة', active: true, rules: TRACK },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 6, duration_days: 60, duration_label: 'شهران', active: true },
  { key: 'evaluation', title_ar: 'التقييم والقياس', phase: 'impact', sort: 7, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 7, duration_label: 'أسبوع', active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول', sort: 1, active: true },
  { id: 'r3', code: 'O-MREG', stage_key: 'ojt', kind: 'upload', required: true, title_ar: 'سجل المعالم لمشروعك', sort: 1, active: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 2, active: true, config: { mode: 'online' } },
  { id: 'r5', code: 'S-REP', stage_key: 'support', kind: 'upload', required: true, title_ar: 'تقرير الأثر', sort: 1, active: true },
  { id: 'r6', code: 'E-POST', stage_key: 'evaluation', kind: 'auto', required: true, title_ar: 'القياس البعدي', sort: 1, active: true },
];
const definition = {
  success: true, program_id: 'pa', version: { id: 'v1', number: 2, label: 'المسار المستمر' }, stages, hidden: [], sessions: [],
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
};
const milestones = [
  { id: 'm1', title_ar: 'نهاية التدريب', anchor: 'stage_end', stage_key: 'training', offset_days: 0, active: true, sort: 1 },
  { id: 'm2', title_ar: 'سجل التوجيه مكتمل', anchor: 'stage_end', stage_key: 'ojt', offset_days: 0, active: true, sort: 2 },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [{ id: 'v1', number: 2, label: 'المسار المستمر', created_at: '2026-11-18' }] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-02', ends_on: '2027-02-28', delivery: {}, members: 12, schedule: {} }];
const catalog = {
  success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements,
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {},
};

// خطة الدفعة على «الخادم» المحاكى: planEdit وplanImpact المشتركان، وuntil يمر كما يمر في cohort-plan.ts
const PEOPLE = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, at: 'training', ats: ['training'], stagesDone: ['profile', 'assessment', 'approval'], records: {} }));
function planServer(state, b) {
  const c = { ...cohorts[0], schedule: state.schedule, updated_at: state.updated_at };
  const out = (schedule) => { const p = cohortPlan(stages, { ...c, schedule }); return { schedule, start: p.start, end: p.end, total_days: p.total_days, stages: p.stages, issues: p.issues }; };
  if (b.op === 'history') return { success: true, history: state.history, can_undo: state.history[0]?.action === 'cohort.plan' };
  const r = planEdit({ stages, schedule: c.schedule, edit: { days: b.days || {}, off: b.off || {}, with: b.with || {}, offset: b.offset || {}, until: b.until || {} }, cohort: c, requirements });
  if (r.errors.length) return { success: false, message: r.errors.map((e) => e.msg).join('، ') };
  const impact = planImpact({ stages, before: c.schedule, after: r.schedule, cohort: c, milestones, people: PEOPLE, today: '2026-11-16T09:00:00Z', cutoff: '2026-11-17' });
  if (b.op === 'preview') return { success: true, preview: true, locked: null, changed: !sameSchedule(c.schedule, r.schedule), plan: out(r.schedule), impact };
  state.schedule = r.schedule;
  state.updated_at = `u${state.history.length + 1}`;
  state.history.unshift({ id: `h${state.history.length + 1}`, action: 'cohort.plan', actor: 'a@x', at: '2026-11-16T09:05:00Z', summary: impactSummary(impact) });
  return { success: true, saved: true, cohort: { id: c.id, schedule: state.schedule, updated_at: state.updated_at }, plan: out(state.schedule), impact, exempted: 0, notified: null };
}

async function setup(page, width = 1440) {
  const calls = [];
  const plan = { schedule: {}, updated_at: 'u0', history: [] };
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
      'admin.catalog': catalog,
      'admin.cohort-definition': { ...definition, cohort_plan: { schedule: plan.schedule, starts_on: cohorts[0].starts_on, is_default: false, status: 'running', program_version_id: 'v1', updated_at: plan.updated_at } },
      'admin.cohort-plan': b.action === 'admin.cohort-plan' ? planServer(plan, b) : null,
      'admin.milestones': { success: true, program_id: 'pa', milestones },
      'admin.program-milestones': { success: true, milestones },
      'admin.cohort-journey': { success: true, journey_map: { program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة نوفمبر', starts_on: '2026-11-02', today_stage: 'training', today_stages: ['training'] },
        totals: { total: 12, finished: 0, late: 0, not_started: 0 }, bottleneck: { stage: 'training' }, milestones: [],
        stages: stages.map((s) => ({ key: s.key, title: s.title_ar, phase: s.phase, duration_days: s.duration_days, here: { training: 9, ojt: 9, approval: 3 }[s.key] || 0,
          done: { profile: 12, assessment: 12, approval: 9 }[s.key] || 0, late: 0, window: null, people: [] })) } },
      'admin.save': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return Object.assign(calls, { plan });
}
const nav = (page, name) => page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name }).click();
const openJourney = async (page) => {
  await nav(page, 'البرامج والدفعات');
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  return page.getByRole('tabpanel', { name: 'الرحلة' });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const width of [1440, 390]) {
  test(`الدفعة (${width}): صف «مسارات مستمرة» بجانب السلسلة، من التدريب +1 حتى نهاية الدفعة، ولا يزيح الدعم`, async ({ page }) => {
    await setup(page, width);
    const panel = await openJourney(page);
    // الدعم يبدأ اليوم التالي لنهاية التدريب (التوجيه لا يأخذ من السلسلة يومًا)
    await expect(panel.getByRole('article', { name: 'التدريب' }).locator('.cj-window')).toContainText('5 نوفمبر إلى 18 نوفمبر');
    await expect(panel.getByRole('article', { name: 'الدعم والتمكين' }).locator('.cj-window')).toContainText('19 نوفمبر إلى 17 يناير');
    const tracks = panel.getByTestId('cj-tracks');
    await expect(tracks.getByRole('heading', { name: 'مسارات مستمرة' })).toBeVisible();
    const card = tracks.getByRole('article', { name: 'التوجيه على رأس العمل' });
    await expect(card.locator('.cj-lane')).toHaveText('مسار مستمر');
    await expect(card.locator('.cj-window')).toContainText('6 نوفمبر إلى 28 فبراير');
    await expect(card).toContainText('يبدأ بعد يوم واحد من بداية «التدريب»');
    await expect(card).toContainText('يمتد حتى نهاية الرحلة، ولا يؤخر ما بعده');
    await expect(card).toContainText('بنوده الإلزامية مطلوبة قبل «التقرير النهائي» وحدها');
    await expect(card.locator('.cj-ms')).toContainText('28 فبراير');
    // لا يُعد في المراحل، ومؤشره وحده
    await expect(panel.locator('.cj-kpis')).toContainText('7 مراحل');
    await expect(panel.locator('.cj-kpis')).toContainText('مسارات مستمرة');
    // تنتهي السلسلة قبل نهاية الدفعة: تنبيه واحد
    await expect(panel.getByTestId('chain-gap')).toContainText('والمسار المستمر يمتد إلى نهايتها');
    const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
    if (width > 640) {
      const row = tl.getByRole('group', { name: 'مسارات مستمرة' });
      await expect(row.locator('[data-track="ojt"]')).toContainText('التوجيه على رأس العمل');
      await expect(row.locator('[data-track="ojt"]')).toContainText('6 نوفمبر إلى 28 فبراير');
      await expect(tl.locator('.jt-slots [data-act]')).not.toHaveCount(0);
      await expect(tl.locator('.jt-slots')).not.toContainText('التوجيه على رأس العمل');
    } else {
      await expect(tl.getByRole('list', { name: 'مسارات مستمرة' })).toContainText('يبدأ بعد يوم واحد من بداية «التدريب»');
      await expect(tl.getByRole('list', { name: 'مراحل الرحلة' })).not.toContainText('التوجيه على رأس العمل');
    }
    expect(await noOverflow(page)).toBe(true);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-cohort-track-${width}.png`, fullPage: true });
  });
}

test('نهاية المسار لهذه الدفعة: «يمتد حتى» في بطاقته، ونافذة الأثر تسمي الامتداد بلا إزاحة، ثم الحفظ', async ({ page }) => {
  const calls = await setup(page, 1440);
  const panel = await openJourney(page);
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  const card = panel.getByTestId('cj-tracks').getByRole('article', { name: 'التوجيه على رأس العمل' });
  // لا عداد مدة لمسار ينتهي بنهاية الرحلة، و«تسير مع» بلا «لا شيء»
  await expect(card.getByRole('group', { name: 'مدة التوجيه على رأس العمل' })).toHaveCount(0);
  await expect(card.getByRole('combobox', { name: 'يبدأ مع' }).locator('option')).toHaveText(['التدريب']);
  const until = card.getByRole('combobox', { name: 'يمتد حتى' });
  await expect(until).toHaveValue('journey_end');
  await until.selectOption('stage:support');
  await expect(card.locator('.cj-window')).toContainText('6 نوفمبر إلى 17 يناير');
  await expect(card.getByRole('group', { name: 'نهاية التوجيه على رأس العمل' })).toContainText('معدّلة لهذه الدفعة');
  // الدعم كما هو
  await expect(panel.getByRole('article', { name: 'الدعم والتمكين' }).locator('.cj-window')).toContainText('19 نوفمبر إلى 17 يناير');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
  await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
  const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
  await expect(dlg).toContainText('التوجيه على رأس العمل (مسار مستمر): يمتد حتى نهاية «الدعم والتمكين»، فيصير من 6 نوفمبر 2026 إلى 17 يناير 2027، بدل «يمتد حتى نهاية الرحلة». لا يؤخر ما بعده');
  await expect(dlg).toContainText('معلم واحد يتغير موعده');
  await expect(dlg).not.toContainText('نهاية الرحلة سبعة');
  expect(calls.filter((c) => c.action === 'admin.cohort-plan').map((c) => [c.op, c.until])).toEqual([['preview', { ojt: 'stage:support' }]]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-cohort-track-impact-1440.png` });
  await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
  await expect(dlg).toBeHidden();
  expect(calls.plan.schedule).toEqual({ ojt: { until: 'stage:support' } });
  await panel.getByRole('button', { name: 'سجل الخطة' }).click();
  await expect(panel.locator('.cj-history')).toContainText('مسار مستمر واحد تغيّر امتداده');
});

test('البرنامج: نموذج المرحلة يضبط «مسار مستمر» ومرجعه ونهايته وما يشترطه، والخط يرسمه بجانب المراحل', async ({ page }) => {
  const calls = await setup(page, 1440);
  await nav(page, 'الرحلة والمتطلبات');
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  await expect(tl.getByRole('group', { name: 'مسارات مستمرة' })).toContainText('التوجيه على رأس العمل');
  const sec = page.locator('.la-stage-ed', { hasText: 'التوجيه على رأس العمل' });
  await expect(sec.locator('.la-rule')).toHaveText('مسار مستمر · تُفتح مع بداية «التدريب»، ومخطط بعد يوم واحد من بدايتها · يمتد حتى نهاية الرحلة · بنوده الإلزامية مطلوبة قبل «التقرير النهائي» وحدها');
  await sec.locator('.btn-sm', { hasText: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'مرحلة: التوجيه على رأس العمل' });
  await expect(form.getByRole('combobox', { name: /^طبيعتها في الرحلة/ })).toHaveValue('track');
  await expect(form.getByRole('combobox', { name: /^متى تُفتح/ })).toHaveCount(0);
  await expect(form.getByRole('combobox', { name: /^يبدأ مع / })).toHaveValue('training');
  // المرجع من أي محور، والمسارات ليست مراجع
  await expect(form.getByRole('combobox', { name: /^يبدأ مع / }).locator('option')).toHaveText(['اختر المرحلة', 'الملف الشخصي', 'تحديد المستوى', 'اعتماد المستوى', 'التدريب']);
  await expect(form.getByRole('combobox', { name: /^يمتد حتى/ })).toHaveValue('journey_end');
  await expect(form.getByRole('combobox', { name: /^بنوده الإلزامية مطلوبة قبل/ })).toHaveValue('final');
  await form.getByRole('combobox', { name: /^يمتد حتى/ }).selectOption('phase:impact');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/program-track-settings-1440.png` });
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row?.rules).toEqual({ mode: 'required', unlock: 'with', with: 'training', complete: 'required', lane: 'track', until: 'phase:impact', offset: 1, due_before: 'final' });
});
