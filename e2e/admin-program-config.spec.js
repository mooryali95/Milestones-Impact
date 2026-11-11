// إعداد البرنامج في لوحة الإدارة (التدقيق 2026-11-11، المجموعة b5): استثناء الدفعة الجارية بتعليل،
// وربط الجلسة بدفعة البرنامج الوحيدة، وتمديد المعلم بحقل تاريخ، والقاعة الحية على الجوال. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ADMIN = { name: 'مدير', email: 'a@x', role_id: 'admin' };

async function open(page, hash, replies, user = ADMIN) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const base = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
    };
    const r = replies[b.action] ?? base[b.action];
    return route.fulfill({ json: (typeof r === 'function' ? r(b) : r) ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((u) => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: u, ts: Date.now() })); localStorage.clear(); }, user);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}

test.describe('القاعة الحية على الجوال (admin-program-11)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('نموذج فتح القاعة لا يفيض أفقيًا بعرض 390', async ({ page }) => {
    const hall = {
      success: true, session: null, version: 0,
      topics: [{ id: 't1', title_ar: 'موضوع كاتون الأول عن قرار البوابة الحمراء في المشروع', status: 'published' }],
      workshops: [{ id: 'w1', title: 'اليوم الأول من التدريب الحضوري', starts_at: '2026-11-20T06:00:00Z', open: false }],
    };
    await open(page, '#/leaders/hall', {
      'admin.programs': { success: true, programs: [], cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', status: 'running' }] },
      'admin.hall': hall, 'admin.peer': { success: true, items: [] },
    });
    await expect(page.getByLabel('نمط القاعة')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});

test.describe('تمديد معلم لمشارك (admin-program-6)', () => {
  const person = (extended) => ({
    success: true, participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled', placements: [] }, progress: 20, history: [],
    profile: null, assessments: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [],
    milestones: [{ id: 'm1', title_ar: 'نهاية التدريب', status: 'late', due: extended ? '2026-12-01' : '2026-11-01', late_days: 10, extended, done: false, scores: {} }],
    milestone_summary: { total: 1, done: 0, late: 1, max_late: 10 },
  });
  test('التمديد بحقل تاريخ يرسل اليوم بصيغته، لا نصًا حرًا يُلغي التمديد بصمت', async ({ page }) => {
    const calls = await open(page, '#/leaders/participants/p1', { 'admin.participant': person(false), 'admin.participant-milestone': { success: true } });
    await page.getByRole('button', { name: 'مدّد له' }).click();
    const form = page.getByRole('dialog', { name: 'تمديد «نهاية التدريب» لهذا المشارك وحده' });
    await expect(form.getByLabel('الموعد الجديد')).toHaveAttribute('type', 'date');
    await form.getByLabel('الموعد الجديد').fill('2026-12-15');
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.participant-milestone')).toMatchObject({ participant_id: 'p1', milestone_id: 'm1', due_override: '2026-12-15' });
    await expect(page.getByRole('status').filter({ hasText: 'مُدّد الموعد لهذا المشارك' })).toBeVisible();
  });
  test('إلغاء التمديد زر صريح بتأكيد', async ({ page }) => {
    const calls = await open(page, '#/leaders/participants/p1', { 'admin.participant': person(true), 'admin.participant-milestone': { success: true } });
    await expect(page.getByRole('button', { name: 'عدّل التمديد' })).toBeVisible();
    await page.getByRole('button', { name: 'ألغِ التمديد' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.participant-milestone')).toMatchObject({ milestone_id: 'm1', due_override: null });
  });
});

test.describe('جلسات برنامج بدفعة واحدة (admin-program-3)', () => {
  const later = new Date(Date.now() + 7 * 864e5).toISOString();
  const activities = {
    success: true, coaching: [], programs: [{ id: 'pa', name: 'برنامج القادة' }],
    cohorts: [{ id: '11111111-1111-1111-1111-111111111111', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running' }],
    requirements: [{ id: 'r1', program_id: 'pa', kind: 'workshop', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية', config: { verify: 'manual' } }],
    workshops: [{ id: 'w1', requirement_id: 'r1', title_ar: 'اليوم الأول', mode: 'in_person', location_ar: 'القاعة', starts_at: later, ends_at: later, active: true, attended: 0, cohort_id: '11111111-1111-1111-1111-111111111111' }],
  };
  test('حقل الدفعة يظهر مع الدفعة الوحيدة وهي الافتراضي، وتحرير جلسة مربوطة لا يفك ربطها', async ({ page }) => {
    const calls = await open(page, '#/leaders/activities', { 'admin.activities': activities, 'admin.workshop-save': { success: true, id: 'w2' } });
    await expect(page.getByRole('button', { name: 'أرسل الدعوة' })).toBeVisible();
    await page.getByRole('button', { name: '+ موعد' }).click();
    const form = page.getByRole('dialog', { name: 'موعد جديد' });
    await expect(form.getByLabel('الدفعة')).toHaveValue('11111111-1111-1111-1111-111111111111');
    await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('اليوم الثاني');
    await form.getByLabel('المكان (القاعة والمدينة)').fill('القاعة الكبرى');
    await form.getByLabel('تبدأ').fill('2026-12-01T09:00');
    await form.getByLabel('تنتهي').fill('2026-12-01T15:00');
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(() => calls.find((c) => c.action === 'admin.workshop-save')?.row).toMatchObject({ requirement_id: 'r1', cohort_id: '11111111-1111-1111-1111-111111111111' });
    await page.getByRole('button', { name: 'تحرير' }).click();
    await page.getByRole('dialog', { name: 'تحرير موعد' }).getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(() => calls.filter((c) => c.action === 'admin.workshop-save')[1]?.row).toMatchObject({ id: 'w1', cohort_id: '11111111-1111-1111-1111-111111111111' });
  });
});

test.describe('معيار التسكين أثناء دفعة جارية (admin-program-2)', () => {
  const catalog = {
    success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], tracks: [], track_stats: {},
    grid_cells: [], level_rules: [], running_cohort: 'دفعة نوفمبر',
    placement_model: [{ id: 1, w_knowledge: 30, w_skill: 45, w_behavior: 25, min_intermediate: 55, min_advanced: 80, floor_intermediate: 25, floor_advanced: 50, borderline: 5 }],
  };
  const LOCKED = { success: false, code: 'cohort_running', message: 'دفعة «دفعة نوفمبر» جارية. معيار التسكين مقفل أثناءها إلا للمدير الأعلى بتعليل مكتوب' };
  const save = (b) => (String(b.reason || '').length >= 10 ? { success: true } : LOCKED);
  test('القفل ظاهر قبل التعديل، والمدير العام يحفظ بتعليل يُرسل مع الطلب', async ({ page }) => {
    const calls = await open(page, '#/leaders/levels', { 'admin.catalog': catalog, 'admin.save': save }, { name: 'مدير', email: 'a@x', role_id: 'super_admin' });
    await expect(page.getByRole('note').filter({ hasText: 'دفعة «دفعة نوفمبر» جارية، فمعيار التسكين وإعدادات الحكم بالتغير مقفلة أثناءها' })).toBeVisible();
    await page.getByRole('button', { name: 'حفظ المعيار' }).click();
    const ask = page.getByRole('dialog').filter({ hasText: 'بصفتك المدير العام اكتب تعليل التعديل' });
    await ask.getByRole('textbox').fill('خفض الحد بعد مراجعة لجنة القياس');
    await ask.getByRole('button', { name: 'احفظ بالتعليل' }).click();
    await expect.poll(() => calls.filter((c) => c.action === 'admin.save').map((c) => c.reason ?? null)).toEqual([null, 'خفض الحد بعد مراجعة لجنة القياس']);
    await expect(page.getByRole('status').filter({ hasText: 'حُفظ معيار التسكين' })).toBeVisible();
  });
  test('مدير النظام يرى رسالة الخادم ولا يُسأل عن تعليل لا يُقبل منه', async ({ page }) => {
    const calls = await open(page, '#/leaders/levels', { 'admin.catalog': catalog, 'admin.save': save });
    await page.getByRole('button', { name: 'حفظ المعيار' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'مقفل أثناءها إلا للمدير الأعلى' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(calls.filter((c) => c.action === 'admin.save')).toHaveLength(1);
  });
});
