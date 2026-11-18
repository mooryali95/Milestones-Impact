// أيام الورشة في بطاقة المرحلة (W3) وعرض غير الإلزامية (T0)، تصور الرحلة بالسحب والورش والحضور 2026-11-18 (ب5.2 وب5.4).
// «+ يوم أو ورشة» في بطاقة التدريب بنموذج «الحضور والجلسات» وadmin.workshop-save نفسيهما، فيظهر اليوم في البطاقة وعلى الخط
// وفي «الحضور والجلسات» وفي رحلة المشارك بزر «سجّل حضوري» (W1 وW2). والسعة «X من السعة» بتنبيه لا يمنع، وقبل ترحيلها تُخفى
// ويُحفظ اليوم بلاها. والقراءة فقط بلا أدوات كتابة. والخلفية مُحاكاة بحالة واحدة يقرؤها الطرفان، واليوم 16 نوفمبر 2026.
// SHOTS_DIR: مجلد لقطات البطاقة بأيامها (1440 و390) ونموذج اليوم (1440) والخط بغير الإلزامية (1440).
import { test, expect } from '@playwright/test';
import { workshopStatus } from '../supabase/functions/leaders-api/logic.js';

const ADMIN = 'http://localhost:4303/';
const APP = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 4, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training', mode: 'on_demand' } },
  { key: 'extra', title_ar: 'قراءات إثرائية', phase: 'qualification', sort: 5, duration_days: 7, active: true, rules: { mode: 'optional' } },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 6, duration_days: 7, active: true },
];
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: R, code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 4, verify: 'qr' } },
  { id: 'r3', code: 'C-UP', stage_key: 'consult', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 1, active: true },
  { id: 'r4', code: 'E-READ', stage_key: 'extra', kind: 'reading', required: false, title_ar: 'قراءة إثرائية', sort: 1, active: true },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2027-01-31', delivery: {}, members: 22, schedule: {} }];
const definition = (state) => ({
  success: true, program_id: 'pa', version: null, stages, hidden: [], sessions: state.sessions.map(({ capacity, ...s }) => s),
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
});
const firstDay = { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', join_url: null,
  starts_at: '2026-11-09T06:00:00Z', ends_at: '2026-11-09T12:00:00Z', active: true, invited_at: '2026-11-05T08:00:00Z' };

// «الخادم»: admin.workshop-save يكتب في الحالة، وadmin.cohort-workshops وadmin.activities ورحلة المشارك تقرأ منها.
// capacity: false = قبل الترحيل 20261118130000 (لا عمود: يُسقط الحقل ويُقال capacity_skipped كما في activities.ts)
function server(state) {
  return (b) => {
    if (b.action === 'admin.workshop-save') {
      const row = { ...b.row };
      let skipped = false;
      if ('capacity' in row && !state.capacity) { skipped = row.capacity != null; delete row.capacity; }
      if (row.capacity != null && !(Number.isInteger(row.capacity) && row.capacity >= 1 && row.capacity <= 10000)) return { success: false, message: 'السعة عدد صحيح من 1 إلى 10000، أو اتركها فارغة' };
      if (row.id) Object.assign(state.sessions.find((s) => s.id === row.id), row);
      else state.sessions.push({ ...row, id: `w${state.sessions.length + 1}` });
      return { success: true, id: row.id || state.sessions.at(-1).id, ...(skipped ? { capacity_skipped: true } : {}) };
    }
    const rows = state.sessions.map((s) => ({ ...s, verify: 'qr', expected: 22, attended: Date.parse(s.ends_at) < Date.parse(NOW) ? 19 : 0 }));
    if (b.action === 'admin.cohort-workshops') return { success: true, capacity_ready: state.capacity, sessions: rows };
    if (b.action === 'admin.activities') {
      return { success: true, capacity_ready: state.capacity, requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })),
        workshops: rows.map((s) => ({ ...s, attended: s.attended })), coaching: [], programs, cohorts };
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
      'admin.cohort-definition': { ...definition(state), cohort_plan: { schedule: {}, starts_on: '2026-11-02', ends_on: '2027-01-31', is_default: false, status: 'running', program_version_id: null, updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: { stages: [], totals: { total: 0 } } },
      'admin.workshop-attendance': { success: true, session: { title_ar: 'اليوم 1' }, requirement: { id: R, title_ar: 'حضور الأيام التدريبية' }, people: [] },
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
  return calls;
}
const shot = async (page, name, target) => {
  if (!SHOTS) return;
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const width of [1440, 390]) {
  test(`«+ يوم أو ورشة» من بطاقة التدريب: بالمسار نفسه، بسعته وتنبيهها، ويظهر على الخط وفي «الحضور والجلسات» (${width})`, async ({ page }) => {
    const state = { capacity: true, sessions: [{ ...firstDay }] };
    const calls = await admin(page, width, state);
    const card = page.locator('#cj-stage-training');
    const days = card.locator('#cj-days-training');
    await expect(days.getByRole('heading', { name: 'أيام التدريب' })).toBeVisible();
    await expect(days.locator('.cj-days-count')).toHaveText('1 من 4 محددة');
    const first = days.locator('.cj-day', { hasText: 'اليوم 1' });
    await expect(first).toContainText('الرياض، قاعة الأثر');
    await expect(first).toContainText('التوثيق برمز QR');
    await expect(first).toContainText('حضر 19 من 22');
    await expect(first.getByRole('button', { name: 'اعرض رمز الحضور' })).toBeVisible();

    await days.getByRole('button', { name: 'أضف يومًا أو ورشة إلى التدريب' }).click();
    const form = page.getByRole('dialog', { name: 'يوم أو ورشة في «التدريب»' });
    await expect(form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)')).toHaveValue('اليوم 2');
    // لا حقل للدفعة: اليوم لهذه الدفعة وحدها
    await expect(form.getByLabel('الدفعة')).toHaveCount(0);
    await form.getByLabel('المكان (القاعة والمدينة)').fill('الرياض، قاعة الملك فهد');
    await form.getByLabel('تبدأ').fill('2026-11-17T07:00');
    await form.getByLabel('تنتهي').fill('2026-11-17T13:00');
    await form.getByLabel('السعة (اختياري)').fill('20');
    if (width > 500) await shot(page, 'add-day-form', form);
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect(form).toBeHidden();
    // admin.workshop-save نفسه، لهذه الدفعة وبند الحضور، والسعة رقمًا
    const save = calls.find((c) => c.action === 'admin.workshop-save');
    expect(save.row).toMatchObject({ requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 2', mode: 'in_person', location_ar: 'الرياض، قاعة الملك فهد', capacity: 20, active: true });
    expect(calls.filter((c) => /workshop-create|day-save/.test(c.action))).toEqual([]);

    const added = days.locator('.cj-day', { hasText: 'اليوم 2' });
    await expect(added).toContainText('الرياض، قاعة الملك فهد');
    await expect(days.locator('.cj-days-count')).toHaveText('2 من 4 محددة');
    await expect(added).toContainText('المتوقع 22');
    await expect(added).toContainText('22 من السعة 20');
    // تنبيه لا منع: اليوم محفوظ، وأدوات الدعوة والتحرير والإلغاء متاحة
    await expect(added.getByRole('note')).toContainText('المتوقع (22) أكثر مما تسعه (20). الحضور لا يُمنع');
    await expect(added.getByRole('button', { name: 'أرسل الدعوة' })).toBeVisible();
    if (width > 500) {
      // نقطة على شريط التدريب في الخط
      await expect(page.locator('.jt-dates .jt-dot')).toHaveCount(2);
    }
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'stage-days', page.locator('#cj-stage-training .cj-window'));

    // التحرير بالنموذج نفسه، والإلغاء صف موقوف لا حذف، والإعادة بنقرة
    await added.getByRole('button', { name: 'حرّر اليوم 2' }).click();
    const edit = page.getByRole('dialog', { name: 'تحرير «اليوم 2»' });
    await expect(edit.getByLabel('السعة (اختياري)')).toHaveValue('20');
    await edit.getByLabel('السعة (اختياري)').fill('30');
    await edit.getByRole('button', { name: 'حفظ' }).click();
    await expect(added).toContainText('22 من السعة 30');
    await expect(added.getByRole('note')).toHaveCount(0);
    await added.getByRole('button', { name: 'ألغِ اليوم 2' }).click();
    await page.getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
    await expect(added).toContainText('ملغى لهذه الدفعة');
    expect(calls.filter((c) => c.action === 'admin.workshop-save').at(-1).row).toMatchObject({ id: 'w2', active: false, title_ar: 'اليوم 2' });
    await expect(days.locator('.cj-days-count')).toHaveText('1 من 4 محددة');
    await added.getByRole('button', { name: 'أعد اليوم 2' }).click();
    await expect(added).not.toContainText('ملغى لهذه الدفعة');

    // «الحضور والجلسات»: اليوم نفسه بسعته، من القراءة نفسها
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
    const ws = page.locator(`#ws-${R}`);
    const row = ws.locator('tr', { hasText: 'اليوم 2' });
    await expect(row).toContainText('الرياض، قاعة الملك فهد');
    await expect(row).toContainText('السعة 30');
    await expect(row).toContainText('دفعة نوفمبر');
  });
}

test('قبل ترحيل السعة: الحقل مخفي في البطاقة و«الحضور والجلسات»، ويُحفظ اليوم بلاها', async ({ page }) => {
  const state = { capacity: false, sessions: [{ ...firstDay }] };
  const calls = await admin(page, 1440, state);
  const days = page.locator('#cj-days-training');
  await days.getByRole('button', { name: 'أضف يومًا أو ورشة إلى التدريب' }).click();
  const form = page.getByRole('dialog', { name: 'يوم أو ورشة في «التدريب»' });
  await expect(form.getByLabel('السعة (اختياري)')).toHaveCount(0);
  await form.getByLabel('المكان (القاعة والمدينة)').fill('جدة');
  await form.getByLabel('تبدأ').fill('2026-11-18T07:00');
  await form.getByLabel('تنتهي').fill('2026-11-18T13:00');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(days.locator('.cj-day', { hasText: 'اليوم 2' })).toContainText('جدة');
  const save = calls.find((c) => c.action === 'admin.workshop-save');
  expect('capacity' in save.row).toBe(false);
  await expect(days).not.toContainText('من السعة');
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
  await page.locator(`#ws-${R}`).getByRole('button', { name: '+ موعد' }).click();
  await expect(page.getByRole('dialog', { name: 'موعد جديد' }).getByLabel('السعة (اختياري)')).toHaveCount(0);
});

test('القراءة فقط: الأيام وأعدادها ورمز الحضور ظاهرة، ولا إضافة ولا تحرير ولا إلغاء ولا دعوة', async ({ page }) => {
  const state = { capacity: true, sessions: [{ ...firstDay }, { ...firstDay, id: 'w2', title_ar: 'اليوم 2', starts_at: '2026-11-17T07:00:00Z', ends_at: '2026-11-17T13:00:00Z', invited_at: null, capacity: 25 }] };
  await admin(page, 1440, state, { readOnly: true });
  await expect(page.getByRole('status').filter({ hasText: 'للقراءة فقط' })).toBeVisible();
  const days = page.locator('#cj-days-training');
  await expect(days.locator('.cj-day')).toHaveCount(2);
  await expect(days.locator('.cj-day', { hasText: 'اليوم 2' })).toContainText('22 من السعة 25');
  await expect(days.getByRole('button', { name: 'اعرض رمز الحضور' })).toHaveCount(2);
  for (const name of [/أضف يومًا/, /^حرّر/, /^ألغِ/, 'أرسل الدعوة']) await expect(days.getByRole('button', { name })).toHaveCount(0);
});

test('غير الإلزامية (T0): «عند الحاجة» و«اختيارية» بإطار متقطع في الخط والبطاقة، والإلزامية بلا وسم', async ({ page }) => {
  const state = { capacity: true, sessions: [{ ...firstDay }] };
  await admin(page, 1440, state);
  const tl = page.locator('.jt');
  const consult = tl.locator('.jt-stage', { hasText: 'الاستشارة' });
  await expect(consult).toHaveClass(/nonreq md-on_demand/);
  await expect(consult.locator('.jt-mode')).toHaveText('عند الحاجة');
  await expect(tl.locator('.jt-stage', { hasText: 'قراءات إثرائية' }).locator('.jt-mode')).toHaveText('اختيارية');
  await expect(tl.locator('.jt-stage', { hasText: 'التدريب' }).first().locator('.jt-mode')).toHaveCount(0);
  expect(await consult.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  await expect(tl.locator('.jt-legend')).toContainText('مرحلة غير إلزامية');
  await shot(page, 't0-timeline', tl);
  const card = page.locator('#cj-stage-consult');
  await expect(card.locator('.cj-mode')).toHaveText('عند الحاجة');
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  await expect(page.locator('#cj-stage-extra .cj-mode')).toHaveText('اختيارية');
  await expect(page.locator('#cj-stage-training .cj-mode')).toHaveCount(0);
  // الهاتف: الوسم في الخط الرأسي أيضًا
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.jt-m-stage', { hasText: 'الاستشارة' }).locator('.jt-mode')).toHaveText('عند الحاجة');
  expect(await noOverflow(page)).toBe(true);
});

test('المشارك يرى اليوم المضاف من البطاقة في رحلته بزر «سجّل حضوري»، والملغى يختفي', async ({ page, browser }) => {
  const state = { capacity: true, sessions: [{ ...firstDay }] };
  await admin(page, 1440, state);
  await page.locator('#cj-days-training').getByRole('button', { name: 'أضف يومًا أو ورشة إلى التدريب' }).click();
  const form = page.getByRole('dialog', { name: 'يوم أو ورشة في «التدريب»' });
  await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('اليوم الثالث');
  await form.getByLabel('المكان (القاعة والمدينة)').fill('الرياض، قاعة الأثر');
  // اليوم نفسه: نافذة الحضور مفتوحة (من ساعة قبل البدء)
  await form.getByLabel('تبدأ').fill('2026-11-16T08:30');
  await form.getByLabel('تنتهي').fill('2026-11-16T14:00');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form).toBeHidden();

  // رحلة المشارك من الحالة نفسها بدالة الخادم (workshopStatus): جلسات دفعته العاملة
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' });
  const app = await ctx.newPage();
  await app.clock.setFixedTime(new Date(NOW));
  const journey = () => {
    const activity = workshopStatus({ verify: 'qr', sessions_required: 4 }, state.sessions.filter((s) => s.cohort_id === 'c1'), new Set(['w1']), Date.parse(NOW));
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
  let reads = 0;
  await app.route(/functions\/v1\/leaders-api/, (route) => { reads++; return route.fulfill({ json: journey() }); });
  await app.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await app.goto(APP);
  const now = app.locator('.j-session');
  await expect(now).toContainText('اليوم الثالث');
  await expect(now.getByRole('button', { name: 'سجّل حضوري' })).toBeVisible();

  // الإلغاء من البطاقة يخفيه من رحلة المشارك
  const added = page.locator('#cj-days-training .cj-day', { hasText: 'اليوم الثالث' });
  await added.getByRole('button', { name: 'ألغِ اليوم الثالث' }).click();
  await page.getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
  await expect(added).toContainText('ملغى لهذه الدفعة');
  const before = reads;
  await app.reload();
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(app.getByRole('button', { name: 'ملفي: سارة الأحمد' })).toBeVisible();
  await expect(app.locator('.j-session')).toHaveCount(0);
  await ctx.close();
});
