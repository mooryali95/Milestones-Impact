// لوحة رحلة الدفعة والمحور الزمني وتحرير التواريخ (ملاحظات المالك 2026-11-19):
// 1) اللوحة: كل عمود مرحلة، وما «يسير معًا» منها، بعرض مقروء لا ينزل عن الحد، ولا يقص ولا يتراكب، وتتمرر اللوحة داخل إطارها وحده.
// 2) التواريخ: بداية المرحلة ونهايتها من بطاقتها، للمثبتة بتاريخ أيضًا، في المسودة نفسها ثم «راجع واحفظ» ونافذة الأثر.
// 3) المحور الزمني: محور واحد بالأشهر والأسابيع، وشريط لكل مرحلة بتواريخها، وخط اليوم، ونهاية الدفعة، ونقاط أيام الورش.
// الخلفية مُحاكاة بـplanEdit وplanImpact المشتركين، واليوم 19 نوفمبر 2026. BOARD_SHOTS: مجلد اللقطات (deviceScaleFactor 2).
import { test, expect } from '@playwright/test';
import { cohortPlan } from '../supabase/functions/leaders-api/stage-windows.js';
import { impactSummary, planEdit, planImpact, sameSchedule } from '../supabase/functions/leaders-api/cohort-plan.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.BOARD_SHOTS || '';
const TAG = process.env.BOARD_TAG || 'after';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const WITH = (k, offset = 0) => ({ unlock: 'with', with: k, ...(offset ? { offset } : {}) });
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 4, duration_label: '4 أيام', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 3, duration_label: '3 أيام', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 1, duration_label: 'يوم', active: true },
  // ثلاث تسير معًا: التدريب يوم واحد مثبت بتاريخ، ومعه مرحلتان أطول منه
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'reading', title_ar: 'القراءة الموجهة', phase: 'qualification', sort: 4.3, duration_days: 7, duration_label: 'أسبوع', active: true, rules: WITH('training') },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 4.6, duration_days: 3, duration_label: '3 أيام', active: true, rules: WITH('training', 1) },
  { key: 'lead', title_ar: 'التوجيه القيادي', phase: 'qualification', sort: 5, duration_days: 4, duration_label: '4 أيام', active: true },
  { key: 'club', title_ar: 'نادي القادة', phase: 'qualification', sort: 5.5, duration_days: 28, duration_label: 'طوال الرحلة', active: true,
    rules: { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end' } },
  // اثنتان تسيران معًا: الثانية تبدأ في آخر مرجعها
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 6, duration_days: 14, duration_label: 'أسبوعان', active: true },
  { key: 'evaluation', title_ar: 'التقييم والقياس', phase: 'impact', sort: 7, duration_days: 2, duration_label: 'يومان', active: true, rules: WITH('support', 14) },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 1, duration_label: 'يوم', active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-WS', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'ورشة القيادة', sort: 1, active: true },
  { id: 'r3', code: 'T-READ', stage_key: 'reading', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول', sort: 1, active: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 1, active: true, config: { mode: 'online' } },
  { id: 'r5', code: 'S-REP', stage_key: 'support', kind: 'upload', required: true, title_ar: 'تقرير الأثر', sort: 1, active: true },
  { id: 'r6', code: 'E-POST', stage_key: 'evaluation', kind: 'auto', required: true, title_ar: 'القياس البعدي', sort: 1, active: true },
  { id: 'r7', code: 'C-MEET', stage_key: 'club', kind: 'meeting', required: false, title_ar: 'لقاء النادي', sort: 1, active: true },
];
const sessions = [
  { id: 's1', requirement_id: 'r2', cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T12:00:00Z', active: true },
];
const definition = {
  success: true, program_id: 'pa', version: { id: 'v1', number: 3, label: 'ثلاث تسير معًا' }, stages, hidden: [], sessions,
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
};
const milestones = [{ id: 'm1', title_ar: 'نهاية التدريب', anchor: 'stage_end', stage_key: 'training', offset_days: 0, active: true, sort: 1 }];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 7, versions: [{ id: 'v1', number: 3, label: 'ثلاث تسير معًا', created_at: '2026-11-18' }] }];
// جدول سابق مثبت بتاريخ: التدريب يوم واحد، والدعم والتمكين أسبوعان
const SAVED = { training: { start: '2026-11-18', end: '2026-11-18' }, support: { start: '2026-11-29', end: '2026-12-12' } };
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-10', ends_on: '2026-12-15', delivery: {}, members: 12, schedule: SAVED }];
const catalog = {
  success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements,
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {},
};

// خطة الدفعة على «الخادم» المحاكى: planEdit وplanImpact المشتركان، والتواريخ تمر كما تمر في cohort-plan.ts
const PEOPLE = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, at: 'training', ats: ['training'], stagesDone: ['profile', 'assessment', 'approval'], records: {} }));
function planServer(state, b) {
  const c = { ...cohorts[0], schedule: state.schedule, updated_at: state.updated_at };
  const out = (schedule) => { const p = cohortPlan(stages, { ...c, schedule }); return { schedule, start: p.start, end: p.end, total_days: p.total_days, stages: p.stages, issues: p.issues }; };
  if (b.op === 'history') return { success: true, history: state.history, can_undo: state.history[0]?.action === 'cohort.plan' };
  const r = planEdit({ stages, schedule: c.schedule, edit: { days: b.days || {}, follow: b.follow === true, off: b.off || {}, with: b.with || {}, offset: b.offset || {}, until: b.until || {}, dates: b.dates || {} }, cohort: c, requirements });
  if (r.errors.length) return { success: false, message: r.errors.map((e) => e.msg).join('، ') };
  const impact = planImpact({ stages, before: c.schedule, after: r.schedule, cohort: c, milestones, people: PEOPLE, today: '2026-11-19T09:00:00Z', cutoff: '2026-11-17' });
  if (b.op === 'preview') return { success: true, preview: true, locked: null, changed: !sameSchedule(c.schedule, r.schedule), plan: out(r.schedule), impact };
  state.schedule = r.schedule;
  state.updated_at = `u${state.history.length + 1}`;
  state.history.unshift({ id: `h${state.history.length + 1}`, action: 'cohort.plan', actor: 'a@x', at: '2026-11-19T09:05:00Z', summary: impactSummary(impact) });
  return { success: true, saved: true, cohort: { id: c.id, schedule: state.schedule, updated_at: state.updated_at }, plan: out(state.schedule), impact, exempted: 0, notified: null };
}

async function setup(page, width = 1440) {
  const calls = [];
  const plan = { schedule: JSON.parse(JSON.stringify(SAVED)), updated_at: 'u0', history: [] };
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-19T09:00:00Z'));
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
      'admin.cohort-workshops': { success: true, capacity_ready: true, sessions: sessions.map((s) => ({ ...s, expected: 12, attended: 0, invited_at: null })) },
      'admin.milestones': { success: true, program_id: 'pa', milestones },
      'admin.program-milestones': { success: true, milestones },
      'admin.cohort-journey': { success: true, journey_map: { program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة نوفمبر', starts_on: '2026-11-10', today_stage: 'reading', today_stages: ['reading', 'ojt'] },
        totals: { total: 12, finished: 0, late: 0, not_started: 0 }, bottleneck: { stage: 'reading' }, milestones: [],
        stages: stages.map((s) => ({ key: s.key, title: s.title_ar, phase: s.phase, duration_days: s.duration_days, here: { reading: 9, ojt: 9 }[s.key] || 0,
          done: { profile: 12, assessment: 12, approval: 12, training: 12 }[s.key] || 0, late: 0, window: null, people: [] })) } },
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
const openJourney = async (page) => {
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  return page.getByRole('tabpanel', { name: 'الرحلة' });
};
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, el, name) => {
  if (!SHOTS) return;
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: `${SHOTS}/${TAG}-${name}.png` });
};

// لقطات قبل وبعد (BOARD_SHOTS): اللوحة والبطاقة بمحرر التواريخ والمحور، على 390 و1440. لا تحكم على شيء، فتعمل على البناء السابق أيضًا
for (const width of [390, 1440]) {
  test(`لقطات ${width}`, async ({ page }) => {
    test.skip(!SHOTS, 'لقطات عند الطلب وحده');
    await setup(page, width);
    const panel = await openJourney(page);
    await expect(panel.getByRole('region', { name: 'الخط الزمني للدفعة' })).toBeVisible();
    // الشريط العلوي اللاصق لا يغطي اللقطة
    await page.addStyleTag({ content: 'header, .topbar, .app-header, .cj-savebar { position: static !important; }' });
    await shot(page, panel.getByRole('region', { name: 'الخط الزمني للدفعة' }), `board-${width}`);
    const axis = panel.getByTestId('cj-axis');
    if (await axis.count()) await shot(page, axis, `timeline-${width}`);
    await panel.getByRole('button', { name: 'عدّل المدد' }).click();
    await shot(page, panel.getByRole('article', { name: 'التدريب', exact: true }), `card-${width}`);
    await shot(page, panel.getByRole('article', { name: 'التقييم والقياس' }), `card-with-${width}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${TAG}-page-${width}.png`, fullPage: true });
  });
}

const COL_MIN = 168;
const card = (panel, title) => panel.getByRole('article', { name: title, exact: true });
const to = (panel, title) => card(panel, title).getByLabel(`تنتهي ${title}`);

for (const width of [1440, 768]) {
  test(`اللوحة ${width}: لا عمود أضيق من حده ولو سارت ثلاث معًا، ولا قص ولا تراكب، والتمرير داخل إطارها وحده`, async ({ page }) => {
    await setup(page, width);
    const panel = await openJourney(page);
    const tl = panel.getByRole('region', { name: 'الخط الزمني للدفعة' });
    await expect(tl.locator('[data-stage="training"]')).toBeVisible();
    const m = await tl.locator('.jt-track').evaluate((track) => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
      const slots = [...track.querySelectorAll('.jt-slot')].map((slot) => ({
        box: box(slot),
        stages: [...slot.querySelectorAll('.jt-stage')].map((el) => ({
          key: el.dataset.stage, box: box(el), clipped: el.scrollWidth > el.clientWidth + 1,
          // النص لا ينكسر حرفًا حرفًا: أول كلمة في الاسم على سطر واحد
          titleLines: (() => { const b = el.querySelector('.jt-stage-head b'); const lh = parseFloat(getComputedStyle(b).lineHeight) || 18; return Math.round(b.getBoundingClientRect().height / lh); })(),
          words: el.querySelector('.jt-stage-head b').textContent.trim().split(/\s+/).length,
        })),
      }));
      const scroll = track.closest('.jt-scroll');
      const bar = track.querySelector('.jt-trackbar');
      return { slots, track: box(track), scroll: { client: scroll.clientWidth, full: scroll.scrollWidth }, bar: box(bar) };
    });
    const three = m.slots.find((x) => x.stages.length === 3);
    expect(three.stages.map((s) => s.key)).toEqual(['training', 'reading', 'ojt']);
    expect(m.slots.filter((x) => x.stages.length === 2)).toHaveLength(1);
    for (const slot of m.slots) {
      for (const s of slot.stages) {
        expect(s.box.w, `عرض ${s.key}`).toBeGreaterThanOrEqual(COL_MIN - 1);
        expect(s.clipped, `قص ${s.key}`).toBe(false);
        expect(s.titleLines, `سطور اسم ${s.key}`).toBeLessThanOrEqual(s.words);
        // داخل خانته
        expect(s.box.l).toBeGreaterThanOrEqual(slot.box.l - 0.5);
        expect(s.box.r).toBeLessThanOrEqual(slot.box.r + 0.5);
      }
      // الممرات تحت بعضها بلا تراكب
      const sorted = [...slot.stages].sort((a, b) => a.box.t - b.box.t);
      for (let i = 1; i < sorted.length; i += 1) expect(sorted[i].box.t).toBeGreaterThanOrEqual(sorted[i - 1].box.b - 0.5);
    }
    // الخانات متتالية بلا تراكب (RTL: اللاحقة إلى اليسار)
    for (let i = 1; i < m.slots.length; i += 1) expect(m.slots[i].box.r).toBeLessThanOrEqual(m.slots[i - 1].box.l + 0.5);
    // شريط المسار المستمر مقروء وداخل المسار
    expect(m.bar.w).toBeGreaterThanOrEqual(COL_MIN - 1);
    expect(m.bar.l).toBeGreaterThanOrEqual(m.track.l - 0.5);
    // المسار أعرض من إطاره فيتمرر داخله، والصفحة لا تتمرر جانبًا
    expect(m.scroll.full).toBeGreaterThan(m.scroll.client);
    expect(await noSideScroll(page)).toBe(true);
  });
}

test('390: اللوحة قائمة رأسية والمحور يتمرر داخل إطاره، والصفحة لا تتمرر جانبًا', async ({ page }) => {
  await setup(page, 390);
  const panel = await openJourney(page);
  const axis = panel.getByTestId('cj-axis');
  await expect(axis.locator('[data-axis="training"] .ja-bar')).toBeVisible();
  const sc = await axis.locator('.ja-scroll').evaluate((el) => ({ client: el.clientWidth, full: el.scrollWidth }));
  expect(sc.full).toBeGreaterThan(sc.client);
  expect(await noSideScroll(page)).toBe(true);
  // يبدأ عند اليوم: خط اليوم داخل الإطار الظاهر
  const vis = await axis.locator('.ja-scroll').evaluate((el) => { const b = el.getBoundingClientRect(), t = el.querySelector('.ja-today').getBoundingClientRect(); return t.left >= b.left && t.right <= b.right; });
  expect(vis).toBe(true);
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await expect(to(panel, 'التدريب')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test('التواريخ من البطاقة: مثبتة بتاريخ تُغيَّر نهايتها، وقيد «تسير مع» برسالته، ثم نافذة الأثر والحفظ', async ({ page }) => {
  const calls = await setup(page, 1440);
  const panel = await openJourney(page);
  // من البطاقة مباشرة: يدخل وضع التحرير والتركيز في حقل البداية
  await card(panel, 'التدريب').getByRole('button', { name: 'عدّل التاريخين: التدريب' }).click();
  await expect(card(panel, 'التدريب').getByLabel('تبدأ التدريب')).toBeFocused();
  await expect(card(panel, 'التدريب')).toContainText('مثبتة بتاريخ (يوم)');
  await expect(to(panel, 'التدريب')).toHaveValue('2026-11-18');
  await to(panel, 'التدريب').fill('2026-11-20');
  await expect(card(panel, 'التدريب').locator('.cj-window b')).toHaveText('18 نوفمبر إلى 20 نوفمبر');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
  // المحور والبطاقات معاينة حية: ما بعدها يُزاح
  await expect(card(panel, 'التوجيه القيادي').locator('.cj-window b')).toHaveText('25 نوفمبر إلى 28 نوفمبر');
  // «تسير مع»: بداية خارج مدى مرجعها تُرفض بسببها ولا تتغير المسودة
  await card(panel, 'القراءة الموجهة').getByLabel('تبدأ القراءة الموجهة').fill('2026-11-25');
  const err = card(panel, 'القراءة الموجهة').getByRole('alert');
  await expect(err).toContainText('«القراءة الموجهة» تسير مع «التدريب»، فبدايتها من 18 نوفمبر 2026 إلى 21 نوفمبر 2026');
  await expect(err).toContainText('لم تتغير المسودة');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديل واحد غير محفوظ');
  // وداخل المدى إزاحة كما يكتبها عدادها
  await card(panel, 'القراءة الموجهة').getByLabel('تبدأ القراءة الموجهة').fill('2026-11-19');
  await expect(err).toBeHidden();
  await expect(card(panel, 'القراءة الموجهة').getByRole('textbox', { name: /^إزاحة القراءة الموجهة/ })).toHaveValue('1');
  await expect(panel.locator('.cj-savebar')).toContainText('تعديلان غير محفوظين');
  if (SHOTS) { await page.addStyleTag({ content: 'header { position: static !important; }' }); await shot(page, card(panel, 'القراءة الموجهة'), 'card-with-edited-1440'); }
  await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
  const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
  await expect(dlg.getByRole('heading', { name: 'ما يتغير' })).toBeVisible();
  await expect(dlg).toContainText('التدريب: يوم إلى 3 أيام، فتصير من 18 نوفمبر 2026 إلى 20 نوفمبر 2026');
  await expect(dlg).toContainText('القراءة الموجهة');
  const plans = calls.filter((c) => c.action === 'admin.cohort-plan');
  expect(plans.map((c) => [c.op, c.dates, c.offset])).toEqual([['preview', { training: { start: '2026-11-18', end: '2026-11-20' } }, { reading: 1 }]]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${TAG}-impact-1440.png` });
  await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
  await expect(dlg).toBeHidden();
  expect(calls.plan.schedule).toEqual({ training: { start: '2026-11-18', end: '2026-11-20' }, reading: { offset: 1 }, support: SAVED.support });
  expect(calls.filter((c) => c.action === 'admin.cohort-plan').map((c) => c.op)).toEqual(['preview', 'save']);
});

test('«اجعلها تتبع المدد» لمرحلة واحدة، وتغيير بداية غير المثبتة يثبتها', async ({ page }) => {
  const calls = await setup(page, 1440);
  const panel = await openJourney(page);
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await card(panel, 'الدعم والتمكين').getByRole('button', { name: 'اجعلها تتبع المدد: الدعم والتمكين' }).click();
  // صارت مدة بطولها (أسبوعان) وتبدأ بعد ما قبلها، والعداد يعمل
  await expect(card(panel, 'الدعم والتمكين').getByRole('group', { name: 'مدة الدعم والتمكين' })).toBeVisible();
  await expect(card(panel, 'الدعم والتمكين').getByLabel('تبدأ الدعم والتمكين')).toHaveValue('2026-11-29');
  // مرحلة غير مثبتة: تغيير بدايتها ينقلها بمدتها ويثبتها
  await card(panel, 'التوجيه القيادي').getByLabel('تبدأ التوجيه القيادي').fill('2026-11-26');
  await expect(card(panel, 'التوجيه القيادي').getByLabel('تنتهي التوجيه القيادي')).toHaveValue('2026-11-29');
  await expect(card(panel, 'التوجيه القيادي')).toContainText('مثبتة بتاريخ (4 أيام)');
  await expect(card(panel, 'الدعم والتمكين').getByLabel('تبدأ الدعم والتمكين')).toHaveValue('2026-11-30');
  await panel.getByRole('button', { name: 'راجع واحفظ' }).click();
  const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
  await expect(dlg).toContainText('مثبتة بتاريخها فلا تتبع ما قبلها');
  await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
  await expect(dlg).toBeHidden();
  expect(calls.plan.schedule).toEqual({ training: SAVED.training, lead: { start: '2026-11-26', end: '2026-11-29' } });
});

test('المحور الزمني: شريط لكل مرحلة بتواريخها، وما يسير معًا في صفوف، واليوم ونهاية الدفعة ونقطة الورشة، والشريط يفتح البطاقة', async ({ page }) => {
  await setup(page, 1440);
  const panel = await openJourney(page);
  const axis = panel.getByRole('region', { name: 'المحور الزمني الكامل' });
  await expect(axis).toBeVisible();
  const bars = axis.locator('.ja-row .ja-bar');
  await expect(bars).toHaveCount(11);
  await expect(axis.locator('.ja-today')).toContainText('اليوم 19 نوفمبر');
  await expect(axis.locator('.ja-foot')).toContainText('نهاية الدفعة والرحلة 15 ديسمبر');
  await expect(axis.locator('.ja-months')).toContainText('نوفمبر 2026');
  await expect(axis.locator('.ja-months')).toContainText('ديسمبر');
  await expect(axis.locator('.ja-weeks span')).toHaveCount(6);
  await expect(axis.locator('[data-axis="training"] .ja-dot')).toHaveCount(1);
  const g = await axis.locator('.ja-plot').evaluate((plot) => {
    const p = plot.getBoundingClientRect();
    const out = {};
    for (const row of plot.querySelectorAll('.ja-row')) {
      const r = row.querySelector('.ja-fill').getBoundingClientRect();
      // RTL: البداية من اليمين. النسبة من عرض المحور
      out[row.dataset.axis] = { start: ((p.right - r.right) / p.width) * 100, end: ((p.right - r.left) / p.width) * 100, top: r.top, bottom: r.bottom };
    }
    const t = plot.querySelector('.ja-today').getBoundingClientRect();
    return { rows: out, today: ((p.right - t.right) / p.width) * 100 };
  });
  // 36 يومًا من 10 نوفمبر: القراءة الموجهة من اليوم 8 إلى 15، والتوجيه على رأس العمل من 9 إلى 12
  expect(g.rows.reading.start).toBeCloseTo((8 / 36) * 100, 0);
  expect(g.rows.reading.end).toBeCloseTo((15 / 36) * 100, 0);
  expect(g.rows.ojt.start).toBeCloseTo((9 / 36) * 100, 0);
  expect(g.rows.final.end).toBeCloseTo(100, 0);
  expect(g.today).toBeCloseTo((9.5 / 36) * 100, 0);
  // تسيران معًا: متراكبتان في الزمن، وكل منهما في صف
  expect(g.rows.ojt.start).toBeLessThan(g.rows.reading.end);
  expect(g.rows.ojt.top).toBeGreaterThanOrEqual(g.rows.reading.bottom);
  expect(await noSideScroll(page)).toBe(true);
  // الشريط زر باسمه وتواريخه، ينقل إلى بطاقة مرحلته
  const bar = axis.getByRole('button', { name: /^التوجيه القيادي، 25 نوفمبر إلى 28 نوفمبر/ });
  await bar.focus();
  await page.keyboard.press('Enter');
  await expect(card(panel, 'التوجيه القيادي')).toBeFocused();
  // والمحور يتبع المسودة
  await panel.getByRole('button', { name: 'عدّل المدد' }).click();
  await to(panel, 'التدريب').fill('2026-11-21');
  await expect(axis.getByRole('button', { name: /^التدريب، 18 نوفمبر إلى 21 نوفمبر/ })).toBeVisible();
});
