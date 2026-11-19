// تبويب «المتابعة» في ملف الدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 1): صف لكل عضو بمرحلته وسبب توقفه وعلى من الدور،
// بحث بالاسم والجوال، وفلتر المرحلة من خريطة الرحلة، وتصدير، وفتح ملف العضو على رحلته. الخلفية مُحاكاة، والخريطة والصفوف
// من journeyMap نفسها (roster) كما يحسبها الخادم، فالعدد في الخريطة هو عدد الصفوف. اليوم 20 نوفمبر 2026.
// COHORT_ROSTER_SHOTS: مجلد تُحفظ فيه اللقطات بعرضي 1440 و390.
import { test, expect } from '@playwright/test';
import { journeyMap, mapLanes } from '../supabase/functions/leaders-api/journey-map.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.COHORT_ROSTER_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const TODAY = new Date('2026-11-20T09:00:00Z');

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 2, active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 10, active: true },
  { key: 'ojt', title_ar: 'التطبيق في العمل', phase: 'qualification', sort: 4, duration_days: 10, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'habit', title_ar: 'كتاب القائد', phase: 'qualification', sort: 5, duration_days: 0, active: true, rules: { lane: 'track' } },
  { key: 'advice', title_ar: 'الاستشارة', phase: 'qualification', sort: 6, duration_days: 0, active: true, rules: { lane: 'service' } },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 7, duration_days: 30, active: true },
];
const item = (title_ar, status, more = {}) => ({ title_ar, status, required: true, kind: 'upload', completed_at: status === 'done' ? '2026-11-04T09:00:00Z' : null, ...more });
const st = (key, status, items, more = {}) => {
  const s = stages.find((x) => x.key === key);
  return { key, title_ar: s.title_ar, rules: s.rules, stage_mode: 'required', status, items, ...(s.rules?.lane ? { lane: s.rules.lane } : {}), ...more };
};
const workshop = (attended) => item('احضر أيام التدريب', 'pending', { kind: 'workshop', activity: { type: 'workshop', done: false, count: attended.length, total: 3, sessions: [
  { id: 's1', starts_at: '2026-11-08T06:00:00Z', ends_at: '2026-11-08T10:00:00Z', attended: attended.includes('s1'), undated: false },
  { id: 's2', starts_at: '2026-11-15T06:00:00Z', ends_at: '2026-11-15T10:00:00Z', attended: attended.includes('s2'), undated: false },
  { id: 's3', starts_at: '2026-11-24T06:00:00Z', ends_at: '2026-11-24T10:00:00Z', attended: false, undated: false },
] } });
const coaching = (used) => item('جلسة استشارة', 'pending', { kind: 'coaching', required: false, activity: { type: 'coaching', done: false, count: used, total: 1, can_book: true, max: 2, used, sessions: [] } });
// رحلة عضو: at موضعه، وما قبله منجز
const journey = ({ at, training = [item('ارفع واجب التدريب', 'pending')], ojt = 'active', habit = 'active', used = 0 }) => {
  const order = ['profile', 'approval', 'training', 'final', 'end'];
  const i = order.indexOf(at);
  const state = (k) => { const n = order.indexOf(k); return n < i ? 'done' : n === i ? 'active' : 'locked'; };
  return [
    st('profile', state('profile'), [item('أكمل ملفك', state('profile') === 'done' ? 'done' : 'pending', { kind: 'auto', code: 'P-INFO' })]),
    st('approval', state('approval'), [item('اعتماد مسارك', state('approval') === 'done' ? 'done' : 'pending', { kind: 'auto', code: 'AP-OK' })]),
    st('training', state('training'), state('training') === 'done' ? [item('ارفع واجب التدريب', 'done')] : training),
    st('ojt', i > 2 ? 'done' : i === 2 ? ojt : 'locked', [item('خطة التطبيق', i > 2 || ojt === 'done' ? 'done' : 'pending', { kind: 'form' })]),
    st('habit', i < 2 ? 'locked' : habit, [item('اقرأ أبواب الكتاب', habit === 'done' ? 'done' : 'pending', { kind: 'reading', activity: { done: false } })]),
    st('advice', 'available', [coaching(used)], { stage_mode: 'on_demand' }),
    st('final', state('final'), [item('استلم تقريرك', state('final') === 'done' ? 'done' : 'pending', { kind: 'auto', code: 'R-ISSUE' })]),
  ];
};
const P = (id, name, phone, j, more = {}) => ({ id, name, status: 'enrolled', created_at: '2026-10-25T08:00:00Z', journey: j, milestones: [], dates: [], progress: 0, phone, ...more });
const people = [
  P('p-sara', 'سارة العتيبي', '+966551112233', journey({ at: 'training', training: [item('ارفع واجب التدريب', 'submitted'), workshop(['s1'])], used: 1 }), { progress: 55, job_title: 'مديرة مشاريع', group: 'أ', seen: '2026-11-19T08:00:00Z' }),
  P('p-osama', 'أسامة الحربي', '+966559998877', journey({ at: 'training', training: [workshop(['s1', 's2'])], ojt: 'done' }), { progress: 60, job_title: 'قائد فريق', group: 'أ', seen: '2026-11-20T07:00:00Z' }),
  P('p-reem', 'ريم الدوسري', '+966553334455', journey({ at: 'training', training: [item('ارفع واجب التدريب', 'pending'), workshop([])] }), { progress: 42, job_title: 'محللة', group: 'ب', seen: '2026-11-05T08:00:00Z' }),
  P('p-fahd', 'فهد القحطاني', '+966554445566', journey({ at: 'approval' }), { status: 'pending_approval', progress: 20, job_title: 'مشرف', seen: '2026-11-18T08:00:00Z' }),
  P('p-noura', 'نورة السبيعي', null, journey({ at: 'profile' }), { status: 'registered', progress: 0, seen: null, onboarding: { step: 'profile', label: 'لم يكمل الملف', remaining: 'ينقص الملف: الجوال، المسمى الوظيفي' } }),
  P('p-huda', 'هدى المطيري', '+966556667788', journey({ at: 'final', habit: 'done', used: 2 }), { progress: 88, job_title: 'مديرة إدارة', group: 'ب', seen: '2026-11-20T06:00:00Z' }),
  P('p-ali', 'علي الزهراني', '+966557778899', journey({ at: 'end', habit: 'done' }), { status: 'completed', progress: 100, job_title: 'مدير عام', seen: '2026-11-12T08:00:00Z' }),
  P('p-majed', 'ماجد الشهري', '+966558889900', journey({ at: 'training' }), { status: 'withdrawn', progress: 30, seen: '2026-10-30T08:00:00Z' }),
];
const cohortRow = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-01', is_default: false };
const built = journeyMap({ stages, people, cohort: cohortRow, program: { name: 'برنامج القادة' }, today: TODAY, list: true, activity: true, roster: true });
const { members, ...map } = built;
map.lanes = mapLanes(stages);
const by = Object.fromEntries(people.map((p) => [p.id, p]));
const roster = members.map((m) => ({ ...m, email: `${m.id.slice(2)}@example.sa`, phone: by[m.id].phone, job_title: by[m.id].job_title || null, organization_name: 'هيئة المثال', group: by[m.id].group || null,
  last_active_at: by[m.id].seen, last_login_at: by[m.id].seen, onboarding: by[m.id].onboarding || null }));
const hereOf = (k) => map.stages.find((s) => s.key === k).here;

const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [{ id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [
  { id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-01-15', delivery: {}, members: 7, schedule: {} },
  { id: 'c2', name: 'دفعة فارغة', program_id: 'pa', program_version_id: 'v1', status: 'draft', starts_on: '2026-12-01', delivery: {}, members: 0, schedule: {} },
  { id: 'c0', name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: null, status: 'running', delivery: {}, members: 40, schedule: {} },
];
const definition = { success: true, program_id: 'pa', version: { id: 'v1', number: 1, label: 'الإطلاق' }, stages, hidden: [], sessions: [], requirements: [] };
const emptyMap = journeyMap({ stages, people: [], cohort: { id: 'c2', name: 'دفعة فارغة', starts_on: '2026-12-01' }, program: { name: 'برنامج القادة' }, today: TODAY, list: true, activity: true });

// extra: ردود إضافية لاختبار بعينه (b) => رد أو undefined
async function setup(page, { width = 1440, role = 'admin', extra = () => undefined } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(TODAY);
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': { ...definition, cohort_plan: { schedule: {}, starts_on: cohorts.find((x) => x.id === b.cohort_id)?.starts_on || null, is_default: false, status: 'running', program_version_id: 'v1', updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': b.cohort_id === 'c2' ? { success: true, journey_map: emptyMap, roster: [] }
        : b.cohort_id === 'c0' ? { success: false, message: 'الدفعة أكبر من أن تُرسم خريطتها هنا (1600 عضوًا، والحد 1500). اعرضها من «أين توقفوا» أو من صفحة كل جهة' }
          : { success: true, journey_map: map, roster },
    };
    await route.fulfill({ json: extra(b) ?? replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'مدير', email: 'a@x.sa', role_id: r, totp_enabled: true }, ts: Date.now() })), role);
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  return calls;
}
const openCohort = (page, name = 'دفعة نوفمبر') => page.locator('.data-table tbody tr', { hasText: name }).getByRole('button', { name, exact: true }).click();
const openFollow = async (page, name) => {
  await openCohort(page, name);
  await page.getByRole('tablist', { name: 'أقسام ملف الدفعة' }).getByRole('tab', { name: 'المتابعة' }).click();
  return page.getByTestId('cohort-roster');
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const rows = (page) => page.locator('.cr-table tbody tr');
// اللقطة بعد أن تهدأ الحركة والمؤشر خارج الجدول
const shot = async (page, name) => { if (!SHOTS) return; await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
// لا شيء يشبه رقم جوال في العنوان ولا في ما يحفظه المتصفح
const leaks = (page, digits) => page.evaluate((d) => {
  const all = [location.href, ...Object.values({ ...sessionStorage }), ...Object.values({ ...localStorage })].join('\n');
  return all.replace(/\D/g, '').includes(d) || all.includes(d);
}, digits);

test('التبويب الثالث: صف لكل عضو بمرحلته وسبب توقفه وعلى من الدور، والعنوان يحفظ التبويب', async ({ page }) => {
  const calls = await setup(page);
  const box = await openFollow(page);
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=follow$/);
  await expect(page.getByRole('tab', { name: 'المتابعة' })).toHaveAttribute('aria-selected', 'true');
  await expect(rows(page)).toHaveCount(8);
  await expect(box.getByText('8 عضو')).toBeVisible();
  // الأعمدة العشرة كلها داخل إطار الجدول على الحاسوب: لا عمود مقصوص ولا تمرير
  expect(await box.locator('.table-wrap').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await noOverflow(page)).toBe(true);
  // مرحلتان معًا تُسميان معًا، والمسار المستمر بجانبهما، ولكل مرحلة سببها ودورها
  const sara = rows(page).filter({ hasText: 'سارة العتيبي' });
  await expect(sara).toContainText('التدريب والتطبيق في العمل معًا');
  await expect(sara).toContainText('مسار مستمر: كتاب القائد');
  await expect(sara).toContainText('ارفع واجب التدريب');
  await expect(sara).toContainText('عليك');
  await expect(sara).toContainText('تسليم ينتظر المراجعة');
  await expect(sara).toContainText('متأخر');
  await expect(sara).toContainText('حضر 1 من 2');
  await expect(sara).toContainText('استفاد 1 من 2');
  await expect(sara).toContainText('55%');
  // اعتماد المسار على الإدارة، وجلسة قادمة على موعد، وما لا يُستنتج «غير محدد» بلا تخمين
  await expect(rows(page).filter({ hasText: 'فهد القحطاني' })).toContainText('عليك');
  await expect(rows(page).filter({ hasText: 'أسامة الحربي' })).toContainText('على موعد');
  await expect(rows(page).filter({ hasText: 'هدى المطيري' })).toContainText('غير محدد');
  // قبل الاعتماد: «أين توقف» القائمة. ومن أتم ومن خرج صفان بلا مرحلة
  await expect(rows(page).filter({ hasText: 'نورة السبيعي' })).toContainText('لم يكمل الملف: ينقص الملف');
  await expect(rows(page).filter({ hasText: 'علي الزهراني' })).toContainText('أتم الرحلة');
  await expect(rows(page).filter({ hasText: 'ماجد الشهري' })).toContainText('منسحب');
  // الجوال لا يُعرض في الصف إلا لمن وُجد برقمه
  await expect(box).not.toContainText('+966551112233');
  await shot(page, 'roster-1440');
  // قراءة واحدة بالإجراء القائم، ولا كتابة
  expect(calls.filter((c) => c.action === 'admin.cohort-journey').length).toBe(1);
  expect(calls.map((c) => c.action).filter((a) => !['admin.orgs', 'admin.participants', 'admin.programs', 'admin.cohort-journey', 'admin.pending', 'admin.features', 'admin.me', 'admin.inbox', 'admin.today'].includes(a) && /save|update|status|enroll|nudge|approve|delete/.test(a))).toEqual([]);
  // التحديث يفتح على التبويب نفسه
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
  await expect(page.getByRole('tab', { name: 'المتابعة' })).toHaveAttribute('aria-selected', 'true');
  await expect(rows(page)).toHaveCount(8);
});

test('البحث بالاسم بتوحيد الحروف، وبالجوال بصيغة 05، ولا يصل الرقم إلى العنوان ولا إلى ما يُحفظ', async ({ page }) => {
  await setup(page);
  const box = await openFollow(page);
  const search = box.getByRole('searchbox', { name: 'بحث' });
  await search.fill('اسامه');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('أسامة الحربي');
  await expect(box.getByText('1 من 8 عضو')).toBeVisible();
  await search.fill('0551112233');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('سارة العتيبي');
  // وُجدت برقمها: الرقم ظاهر تحت الاسم
  await expect(rows(page).first().locator('.pt-phone')).toHaveText('+966551112233');
  await expect(search).toHaveAttribute('dir', 'ltr');
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=follow$/);
  expect(await leaks(page, '551112233')).toBe(false);
  await shot(page, 'roster-phone-search-1440');
  // بأرقام عربية ومسافات
  await search.fill('٠٥٥ ٩٩٩ ٨٨٧٧');
  await expect(rows(page).first()).toContainText('أسامة الحربي');
  expect(await leaks(page, '559998877')).toBe(false);
  // لا نتيجة: حالة فارغة واضحة ومسح الكل
  await search.fill('0500000000');
  await expect(box.getByText('لا أعضاء لهذه الفلاتر')).toBeVisible();
  await box.getByRole('button', { name: 'مسح الكل' }).click();
  await expect(rows(page)).toHaveCount(8);
  // حفظ عرض ونص البحث رقم: لا يُحفظ الرقم
  await search.fill('0551112233');
  page.once('dialog', (d) => d.accept('بحثي'));
  await box.getByRole('button', { name: 'حفظ هذا العرض' }).click();
  expect(await leaks(page, '551112233')).toBe(false);
});

test('الضغط على مرحلة في الخريطة يفتح «المتابعة» مفلترًا بها، وعدد الصفوف هو عدد الخريطة', async ({ page }) => {
  await setup(page);
  await openCohort(page);
  await page.getByRole('tablist', { name: 'أقسام ملف الدفعة' }).getByRole('tab', { name: 'الرحلة' }).click();
  const jm = page.locator('.cohort-journey .jm');
  await jm.locator('.jm-stage', { hasText: 'التدريب' }).first().getByRole('button').first().click();
  const panel = page.locator('#jm-panel-training');
  await expect(panel).toBeVisible();
  const n = hereOf('training');
  expect(n).toBe(3);
  await panel.getByRole('button', { name: `اعرضهم في «المتابعة» (${n})` }).click();
  await expect(page.getByRole('tab', { name: 'المتابعة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=follow&stage=training$/);
  const box = page.getByTestId('cohort-roster');
  await expect(rows(page)).toHaveCount(n);
  await expect(box.locator('.flt-chip', { hasText: 'المراحل: التدريب' })).toBeVisible();
  await expect(box.getByText(`${n} من 8 عضو`)).toBeVisible();
  // كل مرحلة في الفلتر: صفوفها عدد «هنا الآن» في الخريطة، والمسار المستمر بمن يسير فيه
  const stage = box.getByRole('combobox', { name: 'المراحل' });
  for (const s of map.stages.filter((x) => !x.service && !x.off)) {
    await stage.selectOption(s.key);
    if (s.here) await expect(rows(page)).toHaveCount(s.here); else await expect(box.getByText('لا أعضاء لهذه الفلاتر')).toBeVisible();
  }
  await stage.selectOption('training');
  // فلتر الدور والمتأخرين فوق المرحلة
  await box.getByRole('combobox', { name: 'على من الدور' }).selectOption('admin');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('سارة العتيبي');
  await shot(page, 'roster-filtered-1440');
  await box.locator('.flt-chip', { hasText: 'الدور' }).getByRole('button').click();
  await box.getByRole('button', { name: /^متأخرون/ }).click();
  await expect(rows(page)).toHaveCount(map.stages.find((s) => s.key === 'training').late);
  // الفرز برأس العمود
  await box.getByRole('button', { name: 'مسح الكل' }).click();
  await box.getByRole('columnheader', { name: /التقدم/ }).getByRole('button').click();
  await expect(rows(page).first()).toContainText('نورة السبيعي');
  await box.getByRole('columnheader', { name: /التقدم/ }).getByRole('button').click();
  await expect(rows(page).first()).toContainText('علي الزهراني');
});

test('التصدير بالزر الموحد يخرج الصفوف المفلترة، والصف يفتح ملف العضو على رحلته', async ({ page }) => {
  await setup(page);
  const box = await openFollow(page);
  await box.getByRole('combobox', { name: 'المراحل' }).selectOption('training');
  await box.getByRole('button', { name: /^تصدير Excel \(3\)/ }).click();
  const dlg = page.getByRole('dialog', { name: 'تصدير Excel' });
  await expect(dlg.getByText('ما في القائمة الآن')).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'صدّر 3 عضو' }).click()]);
  expect(file.suggestedFilename()).toMatch(/CohortFollowUp.*\.xlsx$/);
  await expect(dlg).toBeHidden();
  // لوحة المفاتيح: الصف يُركَّز ويفتح بـEnter
  const sara = rows(page).filter({ hasText: 'سارة العتيبي' });
  await sara.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/leaders\/participants\/p-sara$/);
  expect(await page.evaluate(() => sessionStorage.getItem('mi_admin_pf_tab'))).toBe('journey');
  // ترتيب القائمة المفلترة محفوظ لـ«السابق والتالي» في الملف
  expect(await page.evaluate(() => Object.values({ ...sessionStorage }).some((v) => v.includes('p-sara') && v.includes('p-osama') && v.includes('p-reem')))).toBe(true);
  // الرجوع يعيد التبويب بفلتره
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'المتابعة' })).toHaveAttribute('aria-selected', 'true');
  await expect(rows(page)).toHaveCount(3);
  await rows(page).filter({ hasText: 'ريم الدوسري' }).click();
  await expect(page).toHaveURL(/#\/leaders\/participants\/p-reem$/);
});

test('المطّلع يقرأ ولا يحدد، والكاتب يرى الإجراءات الجماعية القائمة عند التحديد وحده', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  const box = await openFollow(page);
  await expect(rows(page)).toHaveCount(8);
  await expect(box.getByRole('checkbox')).toHaveCount(0);
  await expect(box.getByTestId('cr-bulk')).toHaveCount(0);
  await expect(box.getByRole('button', { name: /تصدير Excel/ })).toBeEnabled();
});

test('الكاتب: التحديد يظهر التذكير والاعتماد والحالة والدفعة كما في قائمة المشاركين', async ({ page }) => {
  await setup(page);
  const box = await openFollow(page);
  await expect(box.getByTestId('cr-bulk')).toHaveCount(0);
  await box.getByRole('checkbox', { name: 'تحديد فهد القحطاني' }).check();
  await box.getByRole('checkbox', { name: 'تحديد سارة العتيبي' }).check();
  const bulk = box.getByTestId('cr-bulk');
  await expect(bulk).toContainText('2 محدد');
  await expect(bulk.getByRole('button', { name: 'اعتماد جماعي (1)…' })).toBeVisible();
  await expect(bulk.getByRole('button', { name: 'ذكّر المحددين (2)' })).toBeVisible();
  await expect(bulk.getByRole('combobox', { name: 'تغيير حالة المحددين' })).toBeVisible();
  // النقل إلى دفعة أخرى: غير هذه الدفعة وغير المفتوحة
  await expect(bulk.getByRole('combobox', { name: /نقل المحددين إلى دفعة أخرى/ }).locator('option')).toHaveText(['نقل إلى دفعة أخرى (استثناء)…', 'دفعة فارغة']);
  // تحديد صف لا يفتح ملفه
  await expect(page).toHaveURL(/view=follow$/);
  await bulk.getByRole('button', { name: 'إلغاء التحديد' }).click();
  await expect(box.getByTestId('cr-bulk')).toHaveCount(0);
});

test('دفعة بلا أعضاء: حالة فارغة واضحة. والدفعة المفتوحة: بزر، ورفض الخادم برسالته ورابط القائمة', async ({ page }) => {
  await setup(page);
  let box = await openFollow(page, 'دفعة فارغة');
  await expect(box.getByText('لا أعضاء في هذه الدفعة بعد')).toBeVisible();
  await shot(page, 'roster-empty-1440');
  await page.getByRole('button', { name: /كل البرامج والدفعات/ }).click();
  box = await openFollow(page, 'الدفعة المفتوحة');
  // لا قراءة قبل الطلب الصريح
  await expect(box.getByText('وتُحسب المتابعة من رحلة كل عضو')).toBeVisible();
  await box.getByRole('button', { name: 'اعرض المتابعة' }).click();
  await expect(box.getByRole('alert')).toContainText('والحد 1500');
  await expect(box.getByRole('link', { name: 'افتح قائمة المشاركين لهذه الدفعة' })).toHaveAttribute('href', '#/leaders/participants?cohort=c0');
});

for (const width of [390, 768]) {
  test(`عرض ${width}: بطاقات بلا تمرير أفقي، والبحث والفلتر والفتح تعمل`, async ({ page }) => {
    await setup(page, { width });
    const box = await openFollow(page);
    await expect(rows(page)).toHaveCount(8);
    expect(await noOverflow(page)).toBe(true);
    // رؤوس الأعمدة مخفية، ولكل قيمة عنوانها
    await expect(box.locator('.cr-table thead')).toBeHidden();
    await expect(rows(page).first().locator('td[data-label="المرحلة الحالية"]')).toBeVisible();
    await shot(page, `roster-${width}`);
    await box.getByRole('searchbox', { name: 'بحث' }).fill('055 111 2233');
    await expect(rows(page)).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, `roster-phone-search-${width}`);
    await box.getByRole('searchbox', { name: 'بحث' }).fill('');
    await box.getByRole('combobox', { name: 'المراحل' }).selectOption('training');
    await expect(rows(page)).toHaveCount(3);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, `roster-filtered-${width}`);
    // الفرز من القائمة حيث لا رؤوس أعمدة
    await box.getByRole('combobox', { name: 'الترتيب' }).selectOption('name');
    await expect(rows(page).first()).toContainText('أسامة الحربي');
    await rows(page).first().click();
    await expect(page).toHaveURL(/#\/leaders\/participants\/p-osama$/);
  });
}

test('عرض 390: الحالة الفارغة', async ({ page }) => {
  await setup(page, { width: 390 });
  const box = await openFollow(page, 'دفعة فارغة');
  await expect(box.getByText('لا أعضاء في هذه الدفعة بعد')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await shot(page, 'roster-empty-390');
});

// لقطة الشاشة الظاهرة وحدها: النافذة ثابتة فوق الصفحة، ولقطة الصفحة كلها تشوّهها
const vshot = async (page, name) => { if (!SHOTS) return; await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
// «سجّل حضورهم في جلسة» (المرحلة 2): المحددون يُفتحون في ورقة حضور جلسة منعقدة من جلسات الدفعة، معلَّمين مسبقًا، والحفظ واحد
for (const width of [1440, 390]) {
  test(`من «المتابعة»: سجّل حضور المحددين في جلسة منعقدة، ومن ليس من متوقعيها يُذكر باسمه ولا يُرسل (${width})`, async ({ page }) => {
    const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
    const ws = (id, title_ar, starts_at, more = {}) => ({ id, requirement_id: R1, cohort_id: 'c1', title_ar, mode: 'in_person', starts_at, ends_at: starts_at, active: true, attended: 0, ...more });
    const attendance = { 'p-osama': { method: 'qr', checked_in_at: '2026-11-15T06:03:00Z', recorded_by: null } };
    // متوقعو الجلسة: من اعتُمد مسارهم. فهد (بانتظار الاعتماد) ليس منهم
    const expected = ['p-sara', 'p-osama', 'p-reem', 'p-huda'];
    const sent = [];
    const calls = await setup(page, { width, extra: (b) => {
      if (b.action === 'admin.activities') return { success: true, requirements: [{ id: R1, kind: 'workshop', program_id: 'pa', title_ar: 'حضور الأيام التدريبية' }], coaching: [], programs: [], cohorts: [],
        workshops: [ws('s1', 'اليوم 1', '2026-11-08T06:00:00Z'), ws('s2', 'اليوم 2', '2026-11-15T06:00:00Z'), ws('s3', 'اليوم 3', '2026-11-24T06:00:00Z'), ws('x1', 'يوم دفعة أخرى', '2026-11-12T06:00:00Z', { cohort_id: 'c2' })] };
      if (b.action === 'admin.workshop-attendance') return { success: true, session: { id: b.id, title_ar: 'اليوم 2', cohort_id: 'c1', starts_at: '2026-11-15T06:00:00Z', ends_at: '2026-11-15T10:00:00Z' }, requirement: { id: R1, title_ar: 'حضور الأيام التدريبية' },
        people: roster.filter((m) => expected.includes(m.id)).map((m) => ({ id: m.id, full_name: m.name, email: m.email, organization_name: m.organization_name, attendance: attendance[m.id] || null })) };
      if (b.action === 'admin.workshop-mark-bulk') {
        sent.push(b);
        for (const id of b.present || []) attendance[id] = { method: 'manual', checked_in_at: '2026-11-20T09:00:00Z', recorded_by: 'a@x.sa', note: b.reason };
        return { success: true, marked: (b.present || []).length, unmarked: 0, already: 0, refused: [] };
      }
      return undefined;
    } });
    const box = await openFollow(page);
    for (const name of ['سارة العتيبي', 'أسامة الحربي', 'ريم الدوسري', 'فهد القحطاني']) await box.getByRole('checkbox', { name: `تحديد ${name}` }).check();
    await box.getByTestId('cr-bulk').getByRole('button', { name: 'سجّل حضورهم في جلسة…' }).click();
    const pick = page.getByTestId('cr-pick-session');
    await expect(pick.getByRole('heading')).toHaveText('سجّل حضور المحددين (4) في جلسة');
    // المنعقدة من جلسات هذه الدفعة وحدها، الأحدث أولًا: لا القادمة ولا جلسة دفعة أخرى
    await expect(pick.getByRole('combobox').locator('option')).toHaveText([/^اليوم 2 · /, /^اليوم 1 · /]);
    expect(await noOverflow(page)).toBe(true);
    await vshot(page, `roster-attend-pick-${width}`);
    await pick.getByRole('button', { name: 'افتح ورقة الحضور' }).click();

    const sheet = page.getByRole('dialog', { name: 'ورقة الحضور' });
    await expect(sheet.getByRole('heading', { name: 'اليوم 2' })).toBeVisible();
    // القراءة بأعضاء هذه الدفعة، والمحددون معلَّمون مسبقًا، ومن سجّل نفسه كما هو
    expect(calls.filter((c) => c.action === 'admin.workshop-attendance').at(-1)).toMatchObject({ id: 's2', cohort_id: 'c1' });
    await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(3);
    await expect(sheet.locator('.ats-count')).toContainText('1 من 4 حضروا');
    await expect(sheet.locator('.ats-count')).toContainText('يُسجَّل 2 (لم يُحفظ)');
    await expect(sheet.locator('.ats-warn')).toHaveText('واحد من المحددين ليس من متوقعي هذه الجلسة، فلن يُسجَّل: فهد القحطاني.');
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('سُجل لاحقًا');
    await vshot(page, `roster-attend-sheet-${width}`);
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    await sheet.getByTestId('ats-confirm').getByRole('button', { name: 'احفظ' }).click();
    await expect(sheet.getByTestId('ats-result')).toHaveText('حُفظ: سُجّل 2');
    // طلب واحد بالغائبين من المحددين وحدهم: لا من سجّل نفسه ولا من ليس في القائمة
    expect(sent.map(({ session_id, present, absent, reason }) => ({ session_id, present, absent, reason }))).toEqual([{ session_id: 's2', present: ['p-sara', 'p-reem'], absent: undefined, reason: 'سُجل لاحقًا' }]);
    expect(await noOverflow(page)).toBe(true);
    // الإغلاق بعد الحفظ يفرغ التحديد ويعيد قراءة الصفوف
    const before = calls.filter((c) => c.action === 'admin.cohort-journey').length;
    await sheet.getByRole('button', { name: 'إغلاق' }).click();
    await expect(box.getByTestId('cr-bulk')).toHaveCount(0);
    await expect.poll(() => calls.filter((c) => c.action === 'admin.cohort-journey').length).toBe(before + 1);
  });
}

test('من «المتابعة»: دفعة بلا جلسة منعقدة تقول ذلك ولا تفتح ورقة', async ({ page }) => {
  await setup(page, { extra: (b) => (b.action === 'admin.activities' ? { success: true, requirements: [], workshops: [], coaching: [] } : undefined) });
  const box = await openFollow(page);
  await box.getByRole('checkbox', { name: 'تحديد سارة العتيبي' }).check();
  await box.getByTestId('cr-bulk').getByRole('button', { name: 'سجّل حضورهم في جلسة…' }).click();
  const pick = page.getByTestId('cr-pick-session');
  await expect(pick.getByRole('heading')).toHaveText('سجّل حضور المحدد في جلسة');
  await expect(pick).toContainText('لا جلسة منعقدة لهذه الدفعة بعد');
  await expect(pick.getByRole('button', { name: 'افتح ورقة الحضور' })).toHaveCount(0);
  await pick.getByRole('button', { name: 'إلغاء' }).click();
  await expect(pick).toHaveCount(0);
  await expect(box.getByTestId('cr-bulk')).toContainText('1 محدد');
});
