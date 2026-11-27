// الخدمة في اللوحة (T2، تصور 2026-11-18 ب5.2): في تبويب «الرحلة» بملف الدفعة صف «الخدمات» في الخط الزمني بلا شريط ولا أيام،
// وبطاقة الاستشارة بمؤشر الاستخدام («استفاد 7 من 20») بدل الحالة، والدعم يبدأ بعد التدريب مباشرة. وفي «الرحلة والمتطلبات» نموذج
// المرحلة يختار «خدمة لمن يريد» بإتاحتها، ونموذج النشاط يضبط «حد الجلسات للمشارك». الخلفية مُحاكاة، واليوم 16 نوفمبر 2026.
// T2_SHOTS: مجلد تُحفظ فيه اللقطات (صف الخدمات 1440، وإعدادات الخدمة 1440).
import { test, expect } from '@playwright/test';
import { cohortPlan } from '../supabase/functions/leaders-api/stage-windows.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.T2_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const SERVICE = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, duration_label: 'يوما عمل', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'consulting', title_ar: 'الاستشارة', phase: 'qualification', sort: 5, duration_days: 14, duration_label: 'عند الحاجة', active: true, rules: SERVICE },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 6, duration_days: 60, duration_label: 'شهران', active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 7, duration_days: 7, duration_label: 'أسبوع', active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول', sort: 1, active: true },
  { id: 'r3', code: 'C-MEET', stage_key: 'consulting', kind: 'coaching', required: false, title_ar: 'لقاء استشاري مع خبير', sort: 1, active: true,
    config: { sessions_required: 1, minutes: 90, max_sessions: 2, mode: 'online', booking_url: 'https://cal.com/coach/consult' } },
  { id: 'r4', code: 'S-REP', stage_key: 'support', kind: 'upload', required: true, title_ar: 'تقرير الأثر', sort: 1, active: true },
];
const definition = {
  success: true, program_id: 'pa', version: { id: 'v1', number: 3, label: 'الخدمة' }, stages, hidden: [], sessions: [],
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
};
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [{ id: 'v1', number: 3, label: 'الخدمة', created_at: '2026-11-18' }] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-02', ends_on: '2027-02-28', delivery: {}, members: 20, schedule: {} }];
const catalog = {
  success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements,
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {},
};

async function setup(page, width = 1440, { schedule = {} } = {}) {
  const calls = [];
  const cohort = { ...cohorts[0], schedule };
  const off = !!schedule.consulting?.off;
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const plan = cohortPlan(stages, cohort);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts: [cohort], organizations: [] },
      'admin.catalog': catalog,
      'admin.cohort-definition': { ...definition, cohort_plan: { schedule, starts_on: cohorts[0].starts_on, is_default: false, status: 'running', program_version_id: 'v1', updated_at: 'u0' } },
      'admin.cohort-plan': { success: true, history: [], can_undo: false },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.program-milestones': { success: true, milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: { program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة نوفمبر', starts_on: '2026-11-02', today_stage: 'training', today_stages: ['training'] },
        totals: { total: 20, finished: 0, late: 0, not_started: 0 }, bottleneck: { stage: 'training' }, milestones: [],
        stages: stages.map((s) => ({ key: s.key, title: s.title_ar, phase: s.phase, duration_days: plan.byKey[s.key].days, here: { training: 17, approval: 3 }[s.key] || 0,
          done: { profile: 20, assessment: 20, approval: 17 }[s.key] || 0, late: 0, window: plan.windows[s.key] || null, people: [],
          ...(s.key === 'consulting' ? (off ? { service: true, off: true, used: 0, of: 0, usage_ar: '' } : { service: true, used: 7, of: 20, usage_ar: 'استفاد 7 من 20' }) : {}) })) } },
      'admin.save': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return calls;
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
  test(`الدفعة (${width}): صف «الخدمات» بلا أيام، وبطاقة الاستشارة بمؤشر الاستخدام، والدعم بعد التدريب مباشرة`, async ({ page }) => {
    await setup(page, width);
    const panel = await openJourney(page);
    await expect(panel.getByRole('article', { name: 'التدريب' }).locator('.cj-window')).toContainText('5 نوفمبر إلى 18 نوفمبر');
    await expect(panel.getByRole('article', { name: 'الدعم والتمكين' }).locator('.cj-window')).toContainText('19 نوفمبر إلى 17 يناير');
    const svc = panel.getByTestId('cj-services');
    await expect(svc.getByRole('heading', { name: 'الخدمات' })).toBeVisible();
    const card = svc.getByRole('article', { name: 'الاستشارة' });
    await expect(card.locator('.cj-svc')).toHaveText('خدمة');
    await expect(card.locator('.cj-window')).toContainText('تُتاح بعد اكتمال «اعتماد المستوى» حتى نهاية الرحلة');
    await expect(card.locator('.cj-usage')).toHaveText('استفاد 7 من 20');
    await expect(card).toContainText('حتى جلستين للمشارك');
    await expect(card.locator('.cj-state')).toHaveCount(0);
    // لا تُعد في المراحل، ومؤشرها في الصف
    await expect(panel.locator('.cj-kpis')).toContainText('6 مراحل');
    await expect(panel.locator('.cj-kpis')).toContainText('الاستشارة (استفاد 7 من 20)');
    const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
    if (width > 640) {
      const row = tl.getByRole('group', { name: 'الخدمات' });
      await expect(row.locator('[data-service="consulting"]')).toContainText('الاستشارة');
      await expect(row.locator('[data-service="consulting"]')).toContainText('تُتاح بعد اكتمال «اعتماد المستوى» حتى نهاية الرحلة، حتى جلستين للمشارك، استفاد 7 من 20');
      await expect(tl.locator('.jt-slots')).not.toContainText('الاستشارة');
      if (SHOTS) {
        await row.scrollIntoViewIfNeeded();
        await tl.screenshot({ path: `${SHOTS}/admin-services-row-1440.png` });
      }
    } else {
      await expect(tl.getByRole('list', { name: 'الخدمات' })).toContainText('الاستشارة');
      await expect(tl.getByRole('list', { name: 'مراحل الرحلة' })).not.toContainText('الاستشارة');
    }
    expect(await noOverflow(page)).toBe(true);
  });
}

// الخدمة الموقوفة لهذه الدفعة: بطاقتها في «الخدمات» موقوفة بمفتاح إعادتها، لا بطاقة مرحلة في المحور ولا «واحدة موقوفة» في المراحل
test('الدفعة: الخدمة الموقوفة تبقى في «الخدمات» بعلامتها، لا في المحاور ولا في عدد الموقوفة', async ({ page }) => {
  await setup(page, 1440, { schedule: { consulting: { off: true } } });
  const panel = await openJourney(page);
  const card = panel.getByTestId('cj-services').getByRole('article', { name: 'الاستشارة' });
  await expect(card).toHaveClass(/\boff\b/);
  await expect(card.locator('.cj-window')).toContainText('موقوفة لهذه الدفعة');
  await expect(card.locator('.cj-usage')).toHaveText('لا حجز ما دامت موقوفة');
  await expect(panel.locator('.cj-kpis')).toContainText('6 مراحل');
  await expect(panel.locator('.cj-kpis')).not.toContainText('موقوفة');
  await expect(panel.locator('.cj-group.off')).toHaveCount(0);
  if (SHOTS) {
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${SHOTS}/admin-service-off-1440.png` });
  }
});

test('البرنامج: نموذج المرحلة يختار «خدمة لمن يريد» بإتاحتها، ونموذج النشاط يضبط حد الجلسات', async ({ page }) => {
  const calls = await setup(page, 1440);
  await nav(page, 'الرحلة والمتطلبات');
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  // المرحلة 21: تفصيل الأنشطة الزمني مطوي تحت الشريط القصير
  await page.locator('details.j-tl-detail > summary').click();
  await expect(tl.getByRole('group', { name: 'الخدمات' })).toContainText('الاستشارة');
  const sec = page.locator('.la-stage-ed', { hasText: 'الاستشارة' });
  await expect(sec.locator('.la-rule')).toHaveText('خدمة موازية · تُتاح بعد اكتمال «اعتماد المستوى» حتى نهاية الرحلة · لا تأخذ من الرحلة أيامًا ولا تُحسب في التقدم ولا يُشترط اكتمالها');
  // المرحلة 22: التحرير في وضع البناء من «⋯»، و«شروط متقدمة» مطوية في اللوحة الجانبية
  await page.getByRole('radio', { name: 'بناء' }).click();
  await sec.getByRole('button', { name: /^إجراءات المرحلة/ }).first().click();
  await page.getByRole('menuitem', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'مرحلة: الاستشارة' });
  await form.getByText('شروط متقدمة').click();
  await expect(form.getByRole('combobox', { name: /^طبيعتها في الرحلة/ })).toHaveValue('service');
  await expect(form.getByRole('combobox', { name: /^نوع المرحلة/ })).toHaveCount(0);
  await expect(form.getByRole('combobox', { name: /^متى تُتاح/ })).toHaveValue('stages');
  await expect(form).toContainText('لا تأخذ من الرحلة أيامًا ولا تُحسب في التقدم ولا يُشترط اكتمالها');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/methodology-service-settings-1440.png` });
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row?.rules).toEqual({ mode: 'on_demand', unlock: 'stages', complete: 'required', lane: 'service', after: ['approval'] });
  // نموذج النشاط: حد الجلسات للمشارك
  await page.locator('.la-reqs li', { hasText: 'لقاء استشاري مع خبير' }).getByRole('button', { name: /^إجراءات نشاط/ }).click();
  await page.getByRole('menuitem', { name: 'تحرير' }).click();
  const rf = page.getByRole('dialog').filter({ hasText: 'حد الجلسات للمشارك' });
  const max = rf.getByRole('spinbutton', { name: /^حد الجلسات للمشارك/ });
  await expect(max).toHaveValue('2');
  await max.fill('3');
  await rf.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.save' && c.entity === 'stage_requirements').at(-1)?.row?.config?.max_sessions).toBe(3);
});

test('مرحلة متتابعة تختار «خدمة»: «بعد ما قبلها» يُحفظ بالموصى به، بعد اعتماد المستوى', async ({ page }) => {
  const calls = await setup(page, 1440);
  await nav(page, 'الرحلة والمتطلبات');
  const sec = page.locator('.la-stage-ed', { hasText: 'الدعم والتمكين' });
  // المرحلة 22: التحرير في وضع البناء من «⋯»، و«شروط متقدمة» مطوية في اللوحة الجانبية
  await page.getByRole('radio', { name: 'بناء' }).click();
  await sec.getByRole('button', { name: /^إجراءات المرحلة/ }).first().click();
  await page.getByRole('menuitem', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'مرحلة: الدعم والتمكين' });
  await form.getByText('شروط متقدمة').click();
  await form.getByRole('combobox', { name: /^طبيعتها في الرحلة/ }).selectOption('service');
  await expect(form.getByRole('combobox', { name: /^متى تُتاح/ })).toHaveValue('previous');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row?.rules).toEqual({ mode: 'on_demand', unlock: 'stages', complete: 'required', lane: 'service', after: ['approval'] });
});
