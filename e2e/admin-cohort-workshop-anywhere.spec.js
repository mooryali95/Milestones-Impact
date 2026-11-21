// الورشة من أي مكان (تصور تشغيل الدفعة 2026-11-19، المرحلة 4): زر «+ ورشة على الخط» في المحور الزمني الكامل وفي لوحة الرحلة يدخل
// وضع إضافة صريحًا، وفيه نقرة على يوم في صف مرحلة (أو الأسهم ثم Enter) تفتح نموذج الجلسة نفسه معبأً بالمرحلة والتاريخ بتوقيت
// الرياض، ثم تأكيد قبل الحفظ بـadmin.workshop-save نفسه. فتظهر الورشة في بطاقة المرحلة وعلى الخط وفي ورقة الحضور وفي رحلة المشارك
// باسم مدربها. وخارج الوضع نقرة الشريط تفتح بطاقته وحدها. والمرحلة بلا نشاط حضور تقول جملتها وتعرض طريقيها (المسار الموجّه في admin-workshop-counting.spec.js).
// الخلفية مُحاكاة بحالة واحدة يقرؤها الطرفان، واليوم 16 نوفمبر 2026، والمتصفح بتوقيت UTC (فالتاسعة بالرياض 06:00 في الحقل).
// SHOTS_DIR: مجلد اللقطات (1440 و390): الزر والعلامة على المحور، النموذج بالمدرب والدعوة، الورشة على الخط، رحلة المشارك.
import { test, expect } from '@playwright/test';
import { workshopStatus } from '../supabase/functions/leaders-api/logic.js';

const ADMIN = 'http://localhost:4303/';
const APP = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';

// الدفعة تبدأ 2 نوفمبر: الاعتماد 2 إلى 4، التدريب 5 إلى 18 (اليوم فيه)، التقرير النهائي 19 إلى 25
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 4, duration_days: 7, active: true },
];
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'A-OK', stage_key: 'approval', kind: 'auto', required: true, title_ar: 'اعتماد مسارك', sort: 1, active: true },
  { id: R, code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 4, verify: 'qr' } },
  { id: 'r4', code: 'F-UP', stage_key: 'final', kind: 'upload', required: true, title_ar: 'ارفع تقريرك', sort: 1, active: true },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2026-11-30', delivery: {}, members: 22, schedule: {} }];
const TRAINERS = [{ id: 'e0000000-0000-4000-8000-000000000001', full_name: 'د. منى القحطاني' }, { id: 'e0000000-0000-4000-8000-000000000002', full_name: 'أ. خالد العتيبي' }];
const definition = (state) => ({
  success: true, program_id: 'pa', version: null, stages, hidden: [], sessions: state.sessions.map(({ capacity, expert_id, ...s }) => s),
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
});
const firstDay = { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', join_url: null,
  starts_at: '2026-11-09T06:00:00Z', ends_at: '2026-11-09T12:00:00Z', active: true, invited_at: '2026-11-05T08:00:00Z', expert_id: null };
const PEOPLE = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.sa', organization_name: 'جهة', attendance: null }, { id: 'p2', full_name: 'فهد العمري', email: 'f@x.sa', organization_name: 'جهة', attendance: null }];

// «الخادم»: admin.workshop-save يكتب في الحالة كما في activities.ts (المدرب من خبراء الدفعة، والدعوة عند الحفظ تختم الجلسة،
// وإشعار التغيير لمن دُعي حين يتغير الموعد أو المكان)، وadmin.cohort-workshops وadmin.activities ورحلة المشارك تقرأ منها.
function server(state) {
  const nameOf = (id) => TRAINERS.find((e) => e.id === id)?.full_name || null;
  return (b) => {
    if (b.action === 'admin.workshop-save') {
      const row = { ...b.row };
      if (row.expert_id && !TRAINERS.some((e) => e.id === row.expert_id)) return { success: false, message: 'المدرب ليس من خبراء هذه الدفعة. اختره من مستشارها أو فريقها' };
      const prev = row.id ? { ...state.sessions.find((s) => s.id === row.id) } : null;
      let saved;
      if (row.id) { saved = state.sessions.find((s) => s.id === row.id); Object.assign(saved, row); } else { saved = { invited_at: null, ...row, id: `w${state.sessions.length + 1}` }; state.sessions.push(saved); }
      const out = { success: true, id: saved.id };
      const changed = prev && (prev.starts_at !== saved.starts_at || prev.ends_at !== saved.ends_at || prev.location_ar !== saved.location_ar);
      if (b.notify_change === true && prev?.invited_at && changed) { saved.invited_at = NOW; out.change = { sent: 22, failed: 0, total: 22 }; }
      else if (b.invite === true) {
        if (saved.invited_at) out.invite = { skipped: 'invited' };
        else { saved.invited_at = NOW; out.invite = { sent: 22, failed: 0, total: 22 }; }
      }
      return out;
    }
    const rows = state.sessions.map((s) => ({ ...s, verify: 'qr', expected: 22, attended: Date.parse(s.ends_at) < Date.parse(NOW) ? 19 : 0, trainer: nameOf(s.expert_id) }));
    if (b.action === 'admin.cohort-workshops') return { success: true, capacity_ready: true, trainers: TRAINERS, sessions: rows };
    if (b.action === 'admin.activities') {
      return { success: true, capacity_ready: true, cohort_trainers: { c1: TRAINERS },
        requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })), workshops: rows, coaching: [], programs, cohorts };
    }
    return null;
  };
}

async function admin(page, width, state, { readOnly = false } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.action === 'me' && readOnly) return r.fulfill({ json: { success: true, role: 'admin', method: 'email_code', can_write: false, can_elevate: true, read_only_reason: 'second_factor' } });
    return r.fulfill({ json: { success: true, contacts: [] } });
  });
  const own = server(state);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': { ...definition(state), cohort_plan: { schedule: {}, starts_on: '2026-11-02', ends_on: '2026-11-30', is_default: false, status: 'running', program_version_id: null, updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: { stages: [], totals: { total: 0 } } },
      'admin.workshop-attendance': { success: true, session: state.sessions.find((s) => s.id === b.id) || { title_ar: 'اليوم 1' }, requirement: { id: R, title_ar: 'حضور الأيام التدريبية' }, people: PEOPLE },
    };
    await route.fulfill({ json: own(b) ?? replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('cj-axis')).toBeVisible();
  return calls;
}
const shot = async (page, name, target, block = 'start') => {
  if (!SHOTS) return;
  if (target) await target.evaluate((el, b) => el.scrollIntoView({ block: b }), block);
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const saves = (calls) => calls.filter((c) => c.action === 'admin.workshop-save');
// نقطة على صف مرحلة في المحور عند يوم بعينه (رقمه من بداية الدفعة): وسط يومه على المحور الخطي، مع اتجاه RTL
async function axisPoint(page, key, day) {
  const lane = page.locator(`.ja [data-add-lane="${key}"]`);
  await lane.scrollIntoViewIfNeeded();
  return lane.evaluate((el, d) => {
    const plot = el.closest('.ja-plot').getBoundingClientRect();
    const total = Number(el.closest('.ja').dataset.days);
    const box = el.getBoundingClientRect();
    return { x: plot.right - ((d + 0.5) / total) * plot.width - box.left, y: box.height / 2 };
  }, day);
}

for (const width of [1440, 390]) {
  test(`من المحور بالمؤشر: الزر الصريح، علامة اليوم، النموذج بالمرحلة والتاريخ والمدرب والدعوة، التأكيد، ثم الورشة في البطاقة وعلى الخط وورقة الحضور (${width})`, async ({ page }) => {
    const state = { sessions: [{ ...firstDay }] };
    const calls = await admin(page, width, state);
    const axis = page.getByTestId('cj-axis');
    const toggle = axis.getByTestId('ja-add');
    await expect(toggle).toHaveText('+ ورشة على الخط');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(axis.locator('[data-add-lane]')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(axis.getByTestId('ja-add-hint')).toContainText('ولا يُحفظ شيء قبل تأكيدك');
    // صف لكل مرحلة، والمرحلة بلا نشاط حضور باهتة
    await expect(axis.locator('[data-add-lane]')).toHaveCount(4);
    await expect(axis.locator('[data-add-lane="final"]')).toHaveClass(/off/);
    await expect(axis.locator('[data-add-lane="training"]')).not.toHaveClass(/off/);

    // 17 نوفمبر هو اليوم 15 من الدفعة (0 = 2 نوفمبر)
    const lane = axis.locator('[data-add-lane="training"]');
    // الزر والتلميح والمحور في الإطار قبل تحريك المؤشر: التمرير بعده يبعد الصف عن المؤشر فتختفي العلامة
    await toggle.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 130));
    const at = await axisPoint(page, 'training', 15);
    await lane.hover({ position: at });
    await expect(axis.getByTestId('ja-add-mark')).toContainText('الثلاثاء');
    await expect(axis.getByTestId('ja-add-mark')).toContainText('17 نوفمبر');
    await shot(page, 'axis-add-affordance', null);
    await lane.click({ position: at });

    // الوضع ينتهي بالنقرة، والنموذج نفسه معبأ: المرحلة في العنوان، والتاسعة بتوقيت الرياض (06:00 في متصفح UTC)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const form = page.getByRole('dialog', { name: /^ورشة في «التدريب»، الثلاثاء/ });
    // وسم الورشة اختيار صريح بلا قيمة مسبقة (قرار المالك 2026-11-21): النموذج لا يُحفظ قبله
    await form.getByRole('radio', { name: /^إلزامية/ }).check();
    await expect(form).toBeVisible();
    await expect(form.getByLabel('تبدأ')).toHaveValue('2026-11-17T06:00');
    await expect(form.getByLabel('تنتهي')).toHaveValue('2026-11-17T09:00');
    await expect(form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)')).toHaveValue('اليوم 2');
    await expect(form.locator('#f-cohort_id')).toHaveCount(0);
    const notes = form.getByTestId('form-notes');
    await expect(notes).toContainText('المطلوب حضور 4 أيام. هذه الورشة تُحسب لمن ينقصه يوم، ولا تزيد المطلوب.');
    await expect(notes).toContainText('الموعد بتوقيت الرياض: الثلاثاء');
    await expect(notes).toContainText('9:00 ص');
    await expect(notes).not.toContainText('خارج نافذة المرحلة');
    // المدرب من خبراء الدفعة، والدعوة عند الحفظ معلَّمة لجلسة الدفعة المؤرخة
    const trainer = form.getByLabel('المدرب (اختياري)');
    await expect(trainer.locator('option')).toHaveText(['بلا مدرب مسمى', 'د. منى القحطاني', 'أ. خالد العتيبي']);
    await trainer.selectOption({ label: 'د. منى القحطاني' });
    const invite = form.getByLabel('أرسل الدعوة عند الحفظ');
    await expect(invite).toBeChecked();
    await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('ورشة التفاوض');
    await form.getByLabel('المكان (القاعة والمدينة)').fill('الرياض، قاعة الملك فهد');
    await form.getByRole('button', { name: 'أضف الورشة' }).evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await shot(page, 'add-form-trainer-invite', null);

    // التأكيد قبل الحفظ: يسمي المرحلة والموعد والدعوة. الإلغاء لا يحفظ شيئًا
    await form.getByRole('button', { name: 'أضف الورشة' }).click();
    const ask = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: 'وتُرسل دعوتها بالبريد إلى أعضاء الدفعة الآن' })).last();
    await expect(ask).toContainText('تُضاف «ورشة التفاوض» إلى «التدريب»');
    await expect(ask).toContainText('17 نوفمبر');
    await expect(ask).toContainText('وتُرسل دعوتها بالبريد إلى أعضاء الدفعة الآن');
    if (width > 500) await shot(page, 'add-confirm', null);
    await ask.getByRole('button', { name: 'إلغاء' }).click();
    expect(saves(calls)).toEqual([]);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'أضف الورشة' }).click();
    await page.getByRole('button', { name: 'أضف وأرسل الدعوة' }).click();
    await expect(form).toBeHidden();

    // حفظ واحد بـadmin.workshop-save نفسه: بند الحضور والدفعة واليوم والمدرب، والدعوة اختيار بجانب الصف
    expect(saves(calls)).toHaveLength(1);
    const save = saves(calls)[0];
    expect(save.row).toMatchObject({ requirement_id: R, cohort_id: 'c1', title_ar: 'ورشة التفاوض', mode: 'in_person', location_ar: 'الرياض، قاعة الملك فهد',
      starts_at: '2026-11-17T06:00:00.000Z', ends_at: '2026-11-17T09:00:00.000Z', expert_id: TRAINERS[0].id, active: true });
    expect([save.invite, 'invite' in save.row, 'notify_change' in save]).toEqual([true, false, false]);
    expect(calls.filter((c) => /workshop-create|day-save|session-add/.test(c.action))).toEqual([]);
    await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'أُضيفت الورشة' }).first()).toContainText('وأُرسلت الدعوة إلى 22 مشاركًا');

    // في بطاقة المرحلة باسم مدربها ودعوتها مرسلة، وعلى المحور نقطة ليومها
    const added = page.locator('#cj-days-training .cj-day', { hasText: 'ورشة التفاوض' });
    await expect(added).toContainText('الرياض، قاعة الملك فهد');
    await expect(added).toContainText('مع د. منى القحطاني');
    await expect(added.getByRole('button', { name: 'أُرسلت الدعوة' })).toBeVisible();
    await expect(page.locator('#cj-days-training .cj-days-count')).toHaveText('2 من 4 محددة');
    await expect(axis.locator('[data-axis="training"] .ja-dot')).toHaveCount(2);
    await shot(page, 'saved-on-timeline', axis);
    if (width > 500) await expect(page.locator('.jt-dates .jt-dot')).toHaveCount(2);
    await shot(page, 'saved-in-stage-card', page.locator('#cj-days-training'));

    // ورقة الحضور للورشة الجديدة
    await added.getByRole('button', { name: 'قائمة الحضور' }).click();
    const sheet = page.getByRole('dialog', { name: 'الحضور' });
    await expect(sheet).toContainText('سارة الأحمد');
    expect(calls.filter((c) => c.action === 'admin.workshop-attendance').at(-1)).toMatchObject({ id: 'w2', cohort_id: 'c1' });
    await sheet.getByRole('button', { name: 'إغلاق' }).click();
    expect(await noOverflow(page)).toBe(true);

    // وفي «الحضور والجلسات» من القراءة نفسها
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
    const row = page.locator(`#ws-${R}`).locator('tr', { hasText: 'ورشة التفاوض' });
    await expect(row).toContainText('مع د. منى القحطاني');
    await expect(row).toContainText('دفعة نوفمبر');
  });
}

test('من المحور بلوحة المفاتيح: الزر، ثم صف المرحلة، والأسهم تغيّر اليوم، وEnter يفتح النموذج، وEsc ينهي الوضع', async ({ page }) => {
  const state = { sessions: [{ ...firstDay }] };
  const calls = await admin(page, 1440, state);
  const axis = page.getByTestId('cj-axis');
  const toggle = axis.getByTestId('ja-add');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // Esc ينهي الوضع ولا يفتح شيئًا
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  const lane = axis.locator('[data-add-lane="training"]');
  await lane.focus();
  // يبدأ من اليوم (16 نوفمبر، في التدريب). RTL: السهم الأيسر يوم لاحق، والأيمن يوم سابق، وShift أسبوع
  const mark = axis.getByTestId('ja-add-mark');
  await expect(mark).toContainText('16 نوفمبر');
  await page.keyboard.press('ArrowLeft');
  await expect(mark).toContainText('17 نوفمبر');
  await page.keyboard.press('ArrowLeft');
  await expect(mark).toContainText('18 نوفمبر');
  await page.keyboard.press('ArrowRight');
  await expect(mark).toContainText('17 نوفمبر');
  await expect(lane).toHaveAttribute('aria-label', /أضف ورشة في «التدريب»، الثلاثاء/);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(mark).toContainText('24 نوفمبر');
  await page.keyboard.press('Enter');
  const form = page.getByRole('dialog', { name: /^ورشة في «التدريب»، الثلاثاء/ });
  // وسم الورشة اختيار صريح بلا قيمة مسبقة (قرار المالك 2026-11-21): النموذج لا يُحفظ قبله
  await form.getByRole('radio', { name: /^إلزامية/ }).check();
  await expect(form.getByLabel('تبدأ')).toHaveValue('2026-11-24T06:00');
  // 24 نوفمبر بعد نافذة التدريب (تنتهي 18): التنبيه قبل الحفظ، لا منع
  await expect(form.getByTestId('form-notes')).toContainText('خارج نافذة المرحلة: الحضور يُحسب، وراجع الموعد.');
  // بلا دعوة: التأكيد يقول إنه لا بريد
  await form.getByLabel('أرسل الدعوة عند الحفظ').uncheck();
  await form.getByRole('button', { name: 'أضف الورشة' }).click();
  await expect(page.getByText('لا يُرسل بريد الآن.')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(form).toBeHidden();
  const save = saves(calls)[0];
  expect(save.row).toMatchObject({ requirement_id: R, cohort_id: 'c1', starts_at: '2026-11-24T06:00:00.000Z' });
  expect(save.invite).toBeUndefined();
  const added = page.locator('#cj-days-training .cj-day', { hasText: 'اليوم 2' });
  await expect(added.getByRole('note')).toContainText('خارج نافذة المرحلة');
  await expect(added.getByRole('button', { name: 'أرسل الدعوة' })).toBeVisible();
});

test('من اللوحة: بالمؤشر على شريط المرحلة، وبلوحة المفاتيح، بالنموذج نفسه والحفظ نفسه', async ({ page }) => {
  const state = { sessions: [{ ...firstDay }] };
  const calls = await admin(page, 1440, state);
  const board = page.locator('section.jt');
  const toggle = board.getByTestId('jt-add');
  await expect(toggle).toHaveText('+ ورشة على الخط');
  await toggle.click();
  // الوضع واحد للمحور واللوحة
  await expect(page.getByTestId('ja-add')).toHaveAttribute('aria-pressed', 'true');
  const lane = board.locator('[data-add-lane="training"]');
  await expect(lane).toBeVisible();
  await expect(board.locator('[data-add-lane="final"]')).toHaveClass(/off/);
  await toggle.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 130));
  const box = await lane.boundingBox();
  await lane.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  const mark = board.getByTestId('jt-add-mark');
  await expect(mark).toContainText('نوفمبر');
  const label = (await mark.textContent()).replace('+', '').trim();
  await shot(page, 'board-add-affordance', null);
  await lane.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const form = page.getByRole('dialog', { name: `ورشة في «التدريب»، ${label}` });
  await expect(form).toBeVisible();
  // وسم الورشة بلا قيمة مسبقة: لا اختيار معلَّم حين يُفتح النموذج (قرار المالك 2026-11-21)
  await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
  // اليوم المقترح من أيام التدريب (5 إلى 18 نوفمبر)، بالتاسعة بتوقيت الرياض
  const starts = await form.getByLabel('تبدأ').inputValue();
  expect(starts).toMatch(/^2026-11-(0[5-9]|1[0-8])T06:00$/);
  await form.getByRole('button', { name: 'إلغاء' }).click();
  await expect(form).toBeHidden();
  expect(saves(calls)).toEqual([]);

  // لوحة المفاتيح: الزر، ثم ممر الشريط، ثم الأسهم وEnter
  await toggle.focus();
  await page.keyboard.press('Enter');
  await lane.focus();
  await expect(mark).toContainText('16 نوفمبر');
  await page.keyboard.press('ArrowLeft');
  await expect(mark).toContainText('17 نوفمبر');
  // آخر أيام المرحلة حد الأسهم على شريطها
  await page.keyboard.press('End');
  await expect(mark).toContainText('18 نوفمبر');
  await page.keyboard.press('ArrowLeft');
  await expect(mark).toContainText('18 نوفمبر');
  await page.keyboard.press('Enter');
  const kbd = page.getByRole('dialog', { name: /^ورشة في «التدريب»، الأربعاء/ });
  // وسم الورشة اختيار صريح بلا قيمة مسبقة (قرار المالك 2026-11-21): النموذج لا يُحفظ قبله
  await kbd.getByRole('radio', { name: /^إلزامية/ }).check();
  await expect(kbd.getByLabel('تبدأ')).toHaveValue('2026-11-18T06:00');
  await kbd.getByLabel('أرسل الدعوة عند الحفظ').uncheck();
  await kbd.getByRole('button', { name: 'أضف الورشة' }).click();
  await page.getByRole('button', { name: 'أضف الورشة' }).last().click();
  await expect(kbd).toBeHidden();
  expect(saves(calls)).toHaveLength(1);
  expect(saves(calls)[0].row).toMatchObject({ requirement_id: R, cohort_id: 'c1', starts_at: '2026-11-18T06:00:00.000Z' });
  await expect(page.locator('.jt-dates .jt-dot')).toHaveCount(2);
});

test('خارج وضع الإضافة: نقرة الشريط تفتح بطاقته وحدها، ولا نموذج ولا حفظ. وفي وضع تحرير الخطة لا وضع إضافة والسحب كما هو', async ({ page }) => {
  const state = { sessions: [{ ...firstDay }] };
  const calls = await admin(page, 1440, state);
  const axis = page.getByTestId('cj-axis');
  await axis.locator('[data-axis="training"] button.ja-bar').click();
  await expect(page.locator('#cj-stage-training')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // واسم المرحلة في اللوحة كذلك
  await page.locator('section.jt .jt-stage[data-stage="final"] .jt-stage-link').click();
  await expect(page.locator('#cj-stage-final')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(saves(calls)).toEqual([]);
  // في وضع الإضافة الشريط ليس زرًا (الممر فوقه)، وبعد إنهائه يعود زرًا يفتح البطاقة
  await axis.getByTestId('ja-add').click();
  await expect(axis.locator('button.ja-bar')).toHaveCount(0);
  await axis.getByTestId('ja-add').click();
  await expect(axis.locator('button.ja-bar')).toHaveCount(4);
  // وضع تحرير الخطة: لا زر إضافة في المحور ولا اللوحة، ومقابض السحب حاضرة
  await page.getByRole('button', { name: 'عدّل المدد' }).click();
  await expect(page.getByTestId('ja-add')).toHaveCount(0);
  await expect(page.getByTestId('jt-add')).toHaveCount(0);
  await expect(page.locator('section.jt [data-grip="training"]')).toBeVisible();
  await expect(page.locator('#cj-dates-training-from')).toBeVisible();
  await page.getByRole('region', { name: 'حفظ الخطة' }).getByRole('button', { name: 'ألغِ' }).click();
  await expect(page.getByTestId('ja-add')).toBeVisible();
  expect(saves(calls)).toEqual([]);
});

// كان: «الزر باهت، ولا تُنشأ جلسة، وطريق إضافة النشاط من رحلة البرنامج». قرار المالك 2026-11-21 حسم القاعدة فبُني المسار
// الموجّه: الزر يعمل والنافذة تعرض «أضفها في هذه المرحلة» أولًا. بقية المسار (الاختيار والمعاينة والحفظ) في
// admin-workshop-counting.spec.js، وهنا ما بقي من هذا الاختبار: الجملة، والنافذة من الخط بلا إنشاء شيء، و«مرحلة أخرى» باليوم نفسه
test('مرحلة بلا نشاط حضور: الزر يعمل بجملته، والنقرة عليها في الخط تفتح الطريقين ولا تنشئ شيئًا قبل الحفظ، و«أضفها في مرحلة أخرى» يحمل اليوم', async ({ page }) => {
  const state = { sessions: [{ ...firstDay }] };
  const calls = await admin(page, 1440, state);
  // في بطاقة المرحلة
  const none = page.getByTestId('cj-noattend-final');
  await expect(none).toContainText('هذه المرحلة ليس في برنامجها نشاط حضور.');
  await expect(none).toContainText('وبأول ورشة يُنشأ لها نشاط «ورش إضافية» في برنامج الدفعة');
  await expect(none.getByRole('button', { name: 'ورشة في التقرير النهائي' })).toBeEnabled();
  await expect(none.getByRole('button', { name: 'ورشة في التقرير النهائي' })).not.toHaveAttribute('aria-disabled', 'true');
  // من الخط: 20 نوفمبر (اليوم 18) في صف التقرير النهائي
  const axis = page.getByTestId('cj-axis');
  await axis.getByTestId('ja-add').click();
  const lane = axis.locator('[data-add-lane="final"]');
  await expect(lane).toHaveAttribute('aria-label', /لا نشاط حضور في «التقرير النهائي»/);
  await lane.click({ position: await axisPoint(page, 'final', 18) });
  const dlg = page.getByTestId('cj-noattend-dialog');
  await expect(dlg).toContainText('هذه المرحلة ليس في برنامجها نشاط حضور.');
  await expect(dlg).toContainText('أضفها في هذه المرحلة');
  await expect(dlg.getByTestId('cj-na-here')).toHaveText(/^أضف ورشة في «التقرير النهائي»، الجمعة/);
  await expect(dlg.getByRole('button', { name: 'افتح رحلة البرنامج' })).toHaveCount(0);
  await shot(page, 'no-attendance-stage', null);
  expect(saves(calls)).toEqual([]);
  // «أضفها في مرحلة أخرى»: المراحل التي فيها نشاط حضور وحدها، باليوم نفسه
  await expect(dlg.locator('.cj-na-list button')).toHaveText([/^التدريب، الجمعة/]);
  await dlg.locator('.cj-na-list button').click();
  const form = page.getByRole('dialog', { name: /^ورشة في «التدريب»، الجمعة/ });
  await expect(form.getByLabel('تبدأ')).toHaveValue('2026-11-20T06:00');
  await expect(form.getByTestId('form-notes')).toContainText('خارج نافذة المرحلة');
  await form.getByRole('button', { name: 'إلغاء' }).click();
  expect(saves(calls)).toEqual([]);
});

test('تحرير جلسة دُعي أعضاؤها: تغيير الموعد يُظهر «أبلغ المدعوين بالتغيير»، والتأكيد يسأل، والحفظ يحمل الاختيار. وبلا تغيير لا سؤال', async ({ page }) => {
  const state = { sessions: [{ ...firstDay, starts_at: '2026-11-17T06:00:00Z', ends_at: '2026-11-17T12:00:00Z' }] };
  const calls = await admin(page, 1440, state);
  const day = page.locator('#cj-days-training .cj-day', { hasText: 'اليوم 1' });
  await day.getByRole('button', { name: 'حرّر: اليوم 1' }).click();
  const edit = page.getByRole('dialog', { name: 'تحرير «اليوم 1»' });
  // دُعيت ولم يتغير شيء: لا اختيار بريد
  await expect(edit.getByLabel('أبلغ المدعوين بالتغيير')).toHaveCount(0);
  await expect(edit.getByLabel('أرسل الدعوة عند الحفظ')).toHaveCount(0);
  // تغيير العنوان وحده يُحفظ بلا سؤال ولا بريد
  await edit.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('اليوم الأول');
  await edit.getByRole('button', { name: 'حفظ' }).click();
  await expect(edit).toBeHidden();
  expect([saves(calls).length, saves(calls)[0].notify_change, saves(calls)[0].invite]).toEqual([1, undefined, undefined]);

  const again = page.locator('#cj-days-training .cj-day', { hasText: 'اليوم الأول' });
  await again.getByRole('button', { name: 'حرّر: اليوم الأول' }).click();
  const edit2 = page.getByRole('dialog', { name: 'تحرير «اليوم الأول»' });
  await edit2.getByLabel('تبدأ').fill('2026-11-18T06:00');
  await edit2.getByLabel('تنتهي').fill('2026-11-18T12:00');
  const notify = edit2.getByLabel('أبلغ المدعوين بالتغيير');
  await expect(notify).toBeChecked();
  await expect(edit2).toContainText('بريد قصير بالموعد والمكان الجديدين وملف تقويم محدَّث');
  await shot(page, 'edit-notify-change', null);
  await edit2.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('ويُرسل به بريد إلى من دُعي إليها')).toBeVisible();
  await page.getByRole('button', { name: 'احفظ وأبلغهم' }).click();
  await expect(edit2).toBeHidden();
  const last = saves(calls).at(-1);
  expect(last.row).toMatchObject({ id: 'w1', starts_at: '2026-11-18T06:00:00.000Z' });
  expect([last.notify_change, 'notify_change' in last.row]).toEqual([true, false]);
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'حُفظ اليوم' }).first()).toContainText('وأُبلغ بالتغيير إلى 22 مشاركًا');
});

test('القراءة فقط: بلا زر إضافة على الخط ولا في البطاقة', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'UTC' });
  const ro = await ctx.newPage();
  await admin(ro, 1440, { sessions: [{ ...firstDay }] }, { readOnly: true });
  await expect(ro.getByTestId('ja-add')).toHaveCount(0);
  await expect(ro.getByTestId('jt-add')).toHaveCount(0);
  await expect(ro.locator('[data-testid^="cj-noattend-"]')).toHaveCount(0);
  await ctx.close();
});

for (const width of [1440, 390]) {
  test(`المشارك يرى الورشة المضافة من الخط في رحلته بموعدها ومكانها واسم مدربها (${width})`, async ({ page, browser }) => {
    const state = { sessions: [{ ...firstDay }] };
    await admin(page, 1440, state);
    const axis = page.getByTestId('cj-axis');
    await axis.getByTestId('ja-add').click();
    await axis.locator('[data-add-lane="training"]').click({ position: await axisPoint(page, 'training', 15) });
    const form = page.getByRole('dialog', { name: /^ورشة في «التدريب»/ });
    // وسم الورشة اختيار صريح بلا قيمة مسبقة (قرار المالك 2026-11-21): النموذج لا يُحفظ قبله
    await form.getByRole('radio', { name: /^إلزامية/ }).check();
    await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('ورشة التفاوض');
    await form.getByLabel('المكان (القاعة والمدينة)').fill('الرياض، قاعة الملك فهد');
    await form.getByLabel('المدرب (اختياري)').selectOption({ label: 'د. منى القحطاني' });
    await form.getByRole('button', { name: 'أضف الورشة' }).click();
    await page.getByRole('button', { name: 'أضف وأرسل الدعوة' }).click();
    await expect(form).toBeHidden();

    // رحلة المشارك من الحالة نفسها بدالة الخادم (workshopStatus)، والمدرب باسمه كما يضيفه evidenceFor
    const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 }, timezoneId: 'UTC', deviceScaleFactor: SHOTS ? 2 : 1 });
    const app = await ctx.newPage();
    await app.clock.setFixedTime(new Date(NOW));
    const journey = () => {
      const sessions = state.sessions.filter((s) => s.cohort_id === 'c1').map((s) => ({ ...s, trainer: TRAINERS.find((e) => e.id === s.expert_id)?.full_name }));
      const activity = workshopStatus({ verify: 'qr', sessions_required: 4 }, sessions, new Set(['w1']), Date.parse(NOW));
      return {
        success: true,
        participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
        profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
        journey: [
          { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
          { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
          { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', done: 0, total: 1,
            items: [{ id: R, code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', required: true, status: 'pending', activity }] },
        ],
        progress: 30, passkeys: 1, prompt_passkey: false,
      };
    };
    await app.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: journey() }));
    await app.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
    await app.goto(APP);
    const next = app.locator('.j-session');
    await expect(next).toContainText('ورشة التفاوض');
    await expect(next).toContainText('الرياض، قاعة الملك فهد');
    await expect(next).toContainText('مع د. منى القحطاني');
    expect(await app.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (SHOTS) { await next.evaluate((el) => el.scrollIntoView({ block: 'center' })); await app.screenshot({ path: `${SHOTS}/participant-next-session-${width}.png` }); }
    // وفي قائمة جلسات النشاط داخل مرحلته
    const list = app.locator('.act-session', { hasText: 'ورشة التفاوض' });
    if (await list.count()) {
      await expect(list.first()).toContainText('مع د. منى القحطاني');
      if (SHOTS) { await list.first().evaluate((el) => el.scrollIntoView({ block: 'center' })); await app.screenshot({ path: `${SHOTS}/participant-stage-sessions-${width}.png` }); }
    }
    await ctx.close();
  });
}
