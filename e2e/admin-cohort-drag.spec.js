// السحب في الدفعة (D1، تصور 2026-11-18 ب5.3): في وضع تحرير خطة الدفعة يُسحب طرف الشريط لتغيير المدة وبدايته لتغيير الإزاحة،
// فيكتب في المسودة نفسها التي تكتبها العدادات، ثم الحفظ بنافذة الأثر. والشبح يعرض التواريخ الناتجة، وEsc يلغي، ولوحة المفاتيح
// بديل كامل، والإفلات في «مسارات مستمرة» يُرفض برابط «غيّرها في البرنامج»، ولا مقابض على 390 ولا لمن يقرأ فقط.
// الخلفية مُحاكاة بـplanEdit وplanImpact المشتركين، واليوم 16 نوفمبر 2026. D1_SHOTS: مجلد اللقطات (deviceScaleFactor 2).
import { test, expect } from '@playwright/test';
import { cohortPlan } from '../supabase/functions/leaders-api/stage-windows.js';
import { impactSummary, planEdit, planImpact, sameSchedule } from '../supabase/functions/leaders-api/cohort-plan.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.D1_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const TRACK = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'final' };
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, duration_label: 'يوما عمل', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'reading', title_ar: 'القراءة الموجهة', phase: 'qualification', sort: 4.5, duration_days: 7, duration_label: 'أسبوع', active: true, rules: { unlock: 'with', with: 'training' } },
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

async function setup(page, width = 1440, role = 'admin') {
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
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() })), role);
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

// العداد بالأيام: مدة التدريب (14 يومًا) تُعرض بالأسابيع افتراضيًا، فتُختار الأيام ليُقارن الرقم باليوم
const inDays = async (panel, title = 'التدريب') => panel.getByRole('article', { name: title }).getByRole('combobox', { name: `وحدة مدة ${title}` }).selectOption('days');
const startEdit = async (page) => {
  const panel = await openJourney(page);
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await inDays(panel);
  // الخط في وسط الشاشة، فالمؤشر يقع على ما يسحبه
  await panel.locator('.jt-track').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  return panel;
};
const days = (panel, title) => panel.getByRole('article', { name: title }).getByRole('textbox', { name: `مدة ${title} بالأيام` });
const offset = (panel, title) => panel.getByRole('article', { name: title }).getByRole('textbox', { name: new RegExp(`^إزاحة ${title}`) });
// يسحب من وسط عنصر بمقدار dx بكسل (سالب: إلى اليسار، أي لاحقًا في RTL) ويبقي الزر مضغوطًا إن طُلب
async function dragBy(page, el, dx, { dy = 0, hold = false, steps = 8 } = {}) {
  await el.evaluate((x) => x.closest('.jt-track').scrollIntoView({ block: 'center' }));
  const b = await el.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps });
  await page.mouse.move(x + dx, y + dy, { steps });
  if (!hold) await page.mouse.up();
}

test('طرف الشريط: المدة في المسودة كما يكتبها العداد، والشبح بالتواريخ أثناء السحب، ثم نافذة الأثر', async ({ page }) => {
  const calls = await setup(page, 1440);
  const panel = await startEdit(page);
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  await expect(days(panel, 'التدريب')).toHaveValue('14');
  const edge = tl.locator('[data-edge="training"]');
  await expect(edge).toBeVisible();
  await dragBy(page, edge, -70, { hold: true });
  const ghost = tl.getByTestId('jt-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost).toContainText('«التدريب»');
  await expect(ghost).toContainText('إلى');
  // لا شيء يتغير قبل الإفلات
  await expect(days(panel, 'التدريب')).toHaveValue('14');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-cohort-drag-ghost-1440.png` });
  await page.mouse.up();
  await expect(ghost).toBeHidden();
  const after = Number(await days(panel, 'التدريب').inputValue());
  expect(after).toBeGreaterThan(14);
  const card = panel.getByRole('article', { name: 'الدعم والتمكين' });
  const supportAfterDrag = await card.locator('.cj-window').textContent();
  const barAfterDrag = await panel.locator('.cj-savebar').textContent();
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
  // العداد يكتب المسودة نفسها: نلغي ونكتب الرقم نفسه بالعداد، فتتطابق التواريخ وسطر الحفظ
  await panel.getByRole('button', { name: 'ألغِ' }).click();
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await inDays(panel);
  await days(panel, 'التدريب').fill(String(after));
  await expect(card.locator('.cj-window')).toHaveText(supportAfterDrag);
  await expect(panel.locator('.cj-savebar')).toHaveText(barAfterDrag);
  // ثم بالسحب مرة أخرى فوق المسودة نفسها، والحفظ بنافذة الأثر من الخادم
  await panel.getByRole('button', { name: 'ألغِ' }).click();
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await inDays(panel);
  await dragBy(page, edge, -70);
  await expect(days(panel, 'التدريب')).toHaveValue(String(after));
  await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
  const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
  await expect(dlg).toContainText('التدريب');
  await expect(dlg.getByRole('heading', { name: 'ما يتغير' })).toBeVisible();
  const plans = calls.filter((c) => c.action === 'admin.cohort-plan');
  expect(plans.map((c) => [c.op, c.days])).toEqual([['preview', { training: after }]]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-cohort-drag-impact-1440.png` });
  await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
  await expect(dlg).toBeHidden();
  expect(calls.plan.schedule).toEqual({ training: { days: after } });
});

test('Esc يلغي السحب ولا يتغير شيء، وبداية الممر تكتب الإزاحة', async ({ page }) => {
  await setup(page, 1440);
  const panel = await startEdit(page);
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  await dragBy(page, tl.locator('[data-edge="training"]'), -60, { hold: true });
  await expect(tl.getByTestId('jt-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tl.getByTestId('jt-ghost')).toBeHidden();
  await page.mouse.up();
  await expect(days(panel, 'التدريب')).toHaveValue('14');
  await expect(panel.locator('.cj-savebar')).toContainText('لا تعديل بعد');
  // ما زال في وضع التحرير (Esc لم يصل إلى غيره)
  await expect(panel.getByRole('button', { name: 'راجع واحفظ' })).toBeVisible();
  // بداية «القراءة الموجهة» (تسير مع التدريب): الإزاحة من 0 إلى مدة مرجعها
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('0');
  await dragBy(page, tl.locator('[data-grip="reading"]'), -40);
  const v = Number(await offset(panel, 'القراءة الموجهة').inputValue());
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThanOrEqual(14);
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
  // المرحلة المتتابعة لا تُسحب بدايتها: سببها، ولا تتغير المسودة
  await dragBy(page, tl.locator('[data-stage="support"] .jt-acts'), -40);
  await expect(panel.getByTestId('cj-drag-note')).toContainText('غيّر مدة ما قبلها');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
});

test('الإفلات في «مسارات مستمرة» يُرفض برابط «غيّرها في البرنامج»', async ({ page }) => {
  await setup(page, 1440);
  const panel = await startEdit(page);
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  const from = tl.locator('[data-stage="support"] .jt-stage-head small');
  const row = tl.getByRole('group', { name: 'مسارات مستمرة' });
  await row.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const r = await row.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + 30, r.y + r.height - 6, { steps: 10 });
  await expect(tl.getByTestId('jt-ghost')).toHaveClass(/bad/);
  await page.mouse.up();
  const note = panel.getByTestId('cj-drag-note');
  await expect(note).toContainText('يقررها البرنامج لكل دفعاته');
  await expect(note.getByRole('button', { name: 'غيّرها في البرنامج' })).toBeVisible();
  await expect(panel.locator('.cj-savebar')).toContainText('لا تعديل بعد');
});

test('لوحة المفاتيح بديل كامل: Enter يلتقط، وAlt مع السهم للمدة، وShift أسبوع، وEnter يُفلت، وEsc يلغي', async ({ page }) => {
  await setup(page, 1440);
  const panel = await startEdit(page);
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  const grip = tl.locator('[data-grip="training"]');
  await grip.focus();
  await page.keyboard.press('Enter');
  await expect(tl.locator('.jt-drag-live')).toContainText('التقطت «التدريب»');
  // RTL: السهم الأيسر لاحق
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(tl.getByTestId('jt-ghost')).toContainText('16 يومًا');
  await page.keyboard.press('Enter');
  await expect(days(panel, 'التدريب')).toHaveValue('16');
  // أسبوع للإزاحة ثم إلغاء
  await tl.locator('[data-grip="reading"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(tl.getByTestId('jt-ghost')).toContainText('تبدأ بعد سبعة أيام');
  await page.keyboard.press('Escape');
  await expect(tl.getByTestId('jt-ghost')).toBeHidden();
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('0');
  await tl.locator('[data-grip="reading"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('7');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديلان غير محفوظين');
});

test('لوحة المفاتيح: الإزاحة والمدة تجتمعان في التقاط واحد، وترك المقبض يلغي، و«حسنًا» يعيد التركيز إلى الشريط', async ({ page }) => {
  await setup(page, 1440);
  const panel = await startEdit(page);
  const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
  const grip = tl.locator('[data-grip="reading"]');
  await grip.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(tl.locator('.jt-drag-live')).toContainText('الحركة السابقة في المسودة');
  await page.keyboard.press('Enter');
  // مدة الأسبوع تُعرض بالأسابيع في العداد: ثمانية أيام 1.1
  const rdays = panel.getByRole('article', { name: 'القراءة الموجهة' }).getByRole('textbox', { name: /^مدة القراءة الموجهة/ });
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('7');
  await expect(rdays).toHaveValue('1.1');
  await expect(tl.locator('.jt-drag-live')).toContainText('8 أيام، تبدأ بعد سبعة أيام');
  // Esc بعد الجمع يعيد المسودة كما كانت عند الالتقاط
  await grip.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(tl.locator('.jt-drag-live')).toContainText('الحركة السابقة في المسودة');
  await page.keyboard.press('Escape');
  await expect(tl.locator('.jt-drag-live')).toContainText('عادت المسودة كما كانت');
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('7');
  await expect(rdays).toHaveValue('1.1');
  // الضغط وراء الحد لا يتراكم: السهم المعاكس يعيد من أول ضغطة
  await grip.focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  await expect(tl.getByTestId('jt-ghost')).toContainText('بعد 14 يومًا');
  await page.keyboard.press('ArrowRight');
  await expect(tl.getByTestId('jt-ghost')).toContainText('بعد 13 يومًا');
  // ترك المقبض يلغي الالتقاط: لا شبح ولا زر مضغوط
  await page.keyboard.press('Tab');
  await expect(tl.getByTestId('jt-ghost')).toBeHidden();
  await expect(grip).toHaveAttribute('aria-pressed', 'false');
  await expect(offset(panel, 'القراءة الموجهة')).toHaveValue('7');
  // رفض بلوحة المفاتيح: سببه في التنبيه وحده، و«حسنًا» يعيد التركيز إلى مقبض الشريط
  const sup = tl.locator('[data-grip="support"]');
  await sup.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  const note = panel.getByTestId('cj-drag-note');
  await expect(note).toContainText('غيّر مدة ما قبلها');
  await expect(tl.locator('.jt-drag-live')).toHaveText('لم يتغير شيء.');
  if (SHOTS) { await note.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/admin-cohort-drag-kbd-reject-1440.png` }); }
  await note.getByRole('button', { name: 'حسنًا' }).click();
  await expect(note).toBeHidden();
  await expect(sup).toBeFocused();
});

test('390: لا مقابض سحب، والعدادات وحدها', async ({ page }) => {
  await setup(page, 390);
  const panel = await startEdit(page);
  await expect(days(panel, 'التدريب')).toBeVisible();
  for (const sel of ['.jt-grip', '.jt-edge']) {
    const n = await panel.locator(sel).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').length);
    expect(n).toBe(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('القراءة فقط: لا سحب ولو فُتح وضع التحرير', async ({ page }) => {
  await setup(page, 1440, 'viewer');
  const panel = await openJourney(page);
  const btn = panel.getByRole('button', { name: 'عدّل المدد' });
  if (await btn.count()) await btn.click();
  await expect(panel.locator('.jt-grip')).toHaveCount(0);
  await expect(panel.locator('.jt-edge')).toHaveCount(0);
});
