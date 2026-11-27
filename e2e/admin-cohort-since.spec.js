// شريط «منذ آخر زيارة» في تبويب «المتابعة»، وتنبيه المتأخرين الجدد في «نظرة عامة» (تصور تشغيل الدفعة 2026-11-19، المرحلة 3).
// الخلفية مُحاكاة. الصفوف من journeyMap نفسها (roster) برحلات معلَّمة بلحظاتها كما يعلّمها الخادم، والسطور من cohortChanges
// نفسها، والتنبيه من deskOf نفسها بلقطة الدفعة. اليوم 20 نوفمبر 2026، 12:00 بالرياض.
// COHORT_SINCE_SHOTS: مجلد تُحفظ فيه اللقطات بعرضي 1440 و390.
import { test, expect } from '@playwright/test';
import { journeyMap, mapLanes } from '../supabase/functions/leaders-api/journey-map.js';
import { deskOf } from '../supabase/functions/leaders-api/today-desk.js';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.COHORT_SINCE_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const TODAY = new Date('2026-11-20T09:00:00Z');
const AT = TODAY.toISOString();
const LAST_VISIT = '2026-11-17T08:00:00.000Z';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 2, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 12, active: true },
  { key: 'apply', title_ar: 'التطبيق في العمل', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 4, duration_days: 20, active: true },
];
// الدفعة تبدأ 1 نوفمبر: الملف 1 إلى 2، التدريب 3 إلى 14 (مهلته تنقضي 18 نوفمبر)، التطبيق 15 إلى 28
const cohortRow = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-01', is_default: false };
const it = (id, status, more = {}) => ({ id, title_ar: more.title_ar || id, status, required: true, kind: 'upload', completed_at: null, ...more });
const st = (key, status, items) => ({ key, title_ar: stages.find((s) => s.key === key).title_ar, stage_mode: 'required', status, items });
const ws = (attendedAt) => it('w', attendedAt ? 'done' : 'pending', { title_ar: 'احضر ورشة اليوم الثاني', kind: 'workshop', ...(attendedAt ? { done_at: attendedAt } : {}),
  activity: { type: 'workshop', done: !!attendedAt, count: attendedAt ? 1 : 0, total: 1, sessions: [{ id: 's2', title: 'ورشة اليوم الثاني', starts_at: '2026-11-19T06:00:00Z', ends_at: '2026-11-19T10:00:00Z', attended: !!attendedAt, undated: false, ...(attendedAt ? { attended_at: attendedAt } : {}) }] } });
const journey = ({ at, profileAt = '2026-11-02T08:00:00Z', training = [], trainingAt = null }) => [
  st('profile', at === 'profile' ? 'active' : 'done', [it('p1', at === 'profile' ? 'pending' : 'done', { title_ar: 'أكمل ملفك', ...(at === 'profile' ? {} : { done_at: profileAt }) })]),
  st('training', at === 'profile' ? 'locked' : at === 'training' ? 'active' : 'done', at === 'training' ? training : [it('t1', 'done', { title_ar: 'واجب التدريب', done_at: trainingAt || '2026-11-10T08:00:00Z' })]),
  st('apply', at === 'apply' ? 'active' : at === 'final' ? 'done' : 'locked', [it('a1', at === 'final' ? 'done' : 'pending', { title_ar: 'خطة التطبيق' })]),
  st('final', at === 'final' ? 'active' : 'locked', [it('f1', 'pending', { title_ar: 'استلم تقريرك' })]),
];
const P = (id, name, j, more = {}) => ({ id, name, status: 'enrolled', created_at: '2026-10-25T08:00:00Z', journey: j, milestones: [], dates: [], progress: 40, seen: '2026-11-20T07:00:00Z', ...more });
const people = [
  // دخلت «التطبيق» أمس بعد إتمام واجب التدريب
  P('p-sara', 'سارة العتيبي', journey({ at: 'apply', trainingAt: '2026-11-19T11:00:00Z' }), { progress: 62 }),
  // في التدريب: حضر ورشة أمس، وأنجز نشاطًا اليوم، وما زال عليه واجب. انقضت مهلة التدريب يوم 18 فصار متأخرًا
  P('p-osama', 'أسامة الحربي', journey({ at: 'training', training: [ws('2026-11-19T06:10:00Z'), it('t2', 'done', { title_ar: 'شاهد المقطع', done_at: '2026-11-20T06:00:00Z' }), it('t1', 'pending', { title_ar: 'ارفع واجب التدريب' })] }), { progress: 48 }),
  // سلّمت واجبها أمس وينتظر المراجعة، ولم تحضر الورشة
  P('p-reem', 'ريم الدوسري', journey({ at: 'training', training: [it('t1', 'submitted', { title_ar: 'ارفع واجب التدريب', waiting_at: '2026-11-19T13:00:00Z' }), ws(null)] }), { progress: 35 }),
  // لم تدخل منذ 12 نوفمبر: أتمت سبعة أيام بلا نشاط أمس
  P('p-huda', 'هدى المطيري', journey({ at: 'training', training: [it('t1', 'pending', { title_ar: 'ارفع واجب التدريب' }), ws(null)] }), { progress: 30, seen: '2026-11-12T10:00:00Z' }),
  // انضم أمس وما زال عند ملفه
  P('p-fahd', 'فهد القحطاني', journey({ at: 'profile' }), { status: 'registered', progress: 0, created_at: '2026-11-19T07:00:00Z', joined_at: '2026-11-19T07:00:00Z', seen: '2026-11-19T07:10:00Z' }),
  // في التطبيق منذ أسبوع، لا جديد عنده
  P('p-ali', 'علي الزهراني', journey({ at: 'apply', trainingAt: '2026-11-12T08:00:00Z' }), { progress: 70 }),
];
const built = journeyMap({ stages, people, cohort: cohortRow, program: { name: 'برنامج القادة' }, today: TODAY, list: true, activity: true, roster: true });
const { members, ...map } = built;
map.lanes = mapLanes(stages);
const by = Object.fromEntries(people.map((p) => [p.id, p]));
const roster = members.map((m) => ({ ...m, email: `${m.id.slice(2)}@example.sa`, phone: '+966551112233', job_title: 'قائد فريق', organization_name: 'هيئة المثال', group: null,
  last_active_at: by[m.id].seen, last_login_at: by[m.id].seen, onboarding: null }));

const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [{ id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-01-15', delivery: {}, members: 6, schedule: {} }];
const definition = { success: true, program_id: 'pa', version: { id: 'v1', number: 1, label: 'الإطلاق' }, stages, hidden: [], sessions: [], requirements: [] };
// مكتب اليوم من deskOf نفسها بلقطة الدفعة: خمسة صاروا متأخرين منذ أمس، والمتأخرون الآن سبعة
const desk = deskOf({ now: TODAY.getTime(), orgs: [], programs: { cohorts, organizations: [], programs }, inbox: { items: [], skipped: [] }, experts: [], members: {},
  sessions: { workshops: [{ cohort_id: 'c1', active: true, starts_at: '2026-11-24T06:00:00Z', ends_at: '2026-11-24T10:00:00Z' }], coaching: [] },
  snapshots: [{ cohort_id: 'c1', taken_at: '2026-11-20T00:17:00Z', late: 7, late_new: 5 }] });

// visit: ما يرده الخادم عن آخر زيارة. journeyOver: رد بديل لـadmin.cohort-journey
async function setup(page, { width = 1440, role = 'admin', visit = { since: LAST_VISIT, first: false }, journeyOver = null, hash = '' } = {}) {
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
      'admin.cohort-definition': { ...definition, cohort_plan: { schedule: {}, starts_on: '2026-11-01', is_default: false, status: 'running', program_version_id: 'v1', updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': journeyOver || { success: true, journey_map: map, roster, at: AT, visit },
      'admin.cohort-visit': { success: true, since: b.op === 'read' ? b.at : visit.since },
      'admin.today': desk,
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
      'admin.overview': { success: true, total: 6, by_status: { enrolled: 5, registered: 1 }, pending_reviews: 0, matrix: {}, overall: {}, top_tracks: [], tracks_used: 0 },
      'admin.health': { success: true, readiness: [], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 } },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] },
      'admin.insight': { success: false, message: 'لا رؤية في هذا الاختبار' },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'مدير', email: 'a@x.sa', role_id: r, totp_enabled: true }, ts: Date.now() })), role);
  await page.goto(`${BASE}${hash || '#/leaders/programs/c1?view=follow'}`);
  await page.reload();
  return calls;
}
const strip = (page) => page.getByTestId('cohort-since');
const lines = (page) => strip(page).locator('.cs-line');
const rows = (page) => page.locator('.cr-table tbody tr');
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (!SHOTS) return; await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const visits = (calls, op) => calls.filter((c) => c.action === 'admin.cohort-visit' && (!op || c.op === op));

test('الشريط أعلى «المتابعة»: ما تغيّر منذ آخر زيارة سطورًا بأعدادها، والضغط على سطر يصفّي الجدول بأصحابه', async ({ page }) => {
  const calls = await setup(page);
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).getByRole('heading', { name: 'منذ آخر زيارة' })).toBeVisible();
  // فوق شريط البحث والفلاتر
  const order = await page.evaluate(() => ['[data-testid="cohort-since"]', '.cr .flt', '.cr-table'].map((q) => document.querySelector(q).getBoundingClientRect().top));
  expect(order[0] < order[1] && order[1] < order[2]).toBe(true);
  await expect(lines(page)).toHaveText([
    'دخلوا مرحلة التطبيق في العمل: 1', 'أنجزوا نشاطًا: 3 أنشطة من عضوين', 'سلّموا ما ينتظر مراجعتك: 1', 'حضروا «ورشة اليوم الثاني»: 1 من 3',
    'صاروا متأخرين: 4', 'انضموا للدفعة: 1', 'توقفوا 7 أيام: 1',
  ]);
  await expect(strip(page)).toContainText('ما تغيّر منذ');
  await expect(rows(page)).toHaveCount(6);
  await shot(page, 'strip-changes-1440');
  // سطر «دخلوا مرحلة»: صاحبته وحدها
  await lines(page).filter({ hasText: 'دخلوا مرحلة' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('سارة العتيبي');
  await expect(page.getByTestId('cs-only')).toContainText('دخلوا مرحلة التطبيق في العمل: 1');
  await expect(lines(page).filter({ hasText: 'دخلوا مرحلة' })).toHaveAttribute('aria-pressed', 'true');
  // سطر التسليم: من ينتظر مراجعتك
  await lines(page).filter({ hasText: 'سلّموا' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('ريم الدوسري');
  await expect(rows(page)).toContainText('تسليم ينتظر المراجعة');
  // «اعرض الكل» يعيد الجدول، والضغط على الصف يفتح العضو كما كان
  await page.getByTestId('cs-only').getByRole('button', { name: 'اعرض الكل' }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByTestId('cs-only')).toHaveCount(0);
  // الشريط عُرض والصفحة ظاهرة: يتقدم وقت آخر زيارة مرة واحدة بلحظة القراءة، لا بالآن
  await expect.poll(() => visits(calls, 'seen').length).toBe(1);
  expect(visits(calls, 'seen')[0]).toMatchObject({ cohort_id: 'c1', at: AT, op: 'seen' });
  expect(await noOverflow(page)).toBe(true);
});

test('«منذ»: آخر زيارة أو أمس أو 7 أيام بلا طلب جديد، وبلوحة المفاتيح', async ({ page }) => {
  const calls = await setup(page);
  await expect(lines(page)).toHaveCount(7);
  const reads = () => calls.filter((c) => c.action === 'admin.cohort-journey').length;
  const before = reads();
  const opts = strip(page).getByRole('group', { name: 'اعرض ما تغيّر منذ' });
  await expect(opts.getByRole('button', { name: 'آخر زيارة' })).toHaveAttribute('aria-pressed', 'true');
  // سبعة أيام: من دخل «التطبيق» قبل ثمانية أيام خارجها، فسطر الدخول واحد
  await opts.getByRole('button', { name: '7 أيام' }).focus();
  await page.keyboard.press('Enter');
  await expect(opts.getByRole('button', { name: '7 أيام' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lines(page).filter({ hasText: 'دخلوا مرحلة' })).toHaveText('دخلوا مرحلة التطبيق في العمل: 1');
  // أمس (من منتصف ليل أمس بالرياض): ما وقع قبله يسقط
  await opts.getByRole('button', { name: 'أمس' }).click();
  // مهلة التدريب انقضت فجر 18 نوفمبر (قبل أمس): الثلاثة ليسوا جددًا منذ أمس، ومن انضم أمس والمهلة منقضية جديد
  await expect(lines(page).filter({ hasText: 'صاروا متأخرين' })).toHaveText('صاروا متأخرين: 1');
  await expect(lines(page).filter({ hasText: 'حضروا' })).toHaveText('حضروا «ورشة اليوم الثاني»: 1 من 3');
  // السطر زر: Tab يصل إليه وEnter يصفّي
  await lines(page).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cs-only')).toBeVisible();
  expect(reads()).toBe(before);
});

test('لا جديد: الحالة الفارغة بنصها، و«اعتبرها مقروءة» تفرغ الشريط وتحفظ لحظة القراءة', async ({ page }) => {
  const calls = await setup(page);
  await expect(lines(page)).toHaveCount(7);
  await strip(page).getByRole('button', { name: 'اعتبرها مقروءة' }).click();
  await expect(page.getByTestId('cs-empty')).toHaveText('لا جديد منذ آخر زيارة');
  await expect(lines(page)).toHaveCount(0);
  expect(visits(calls, 'read')).toHaveLength(1);
  expect(visits(calls, 'read')[0]).toMatchObject({ cohort_id: 'c1', at: AT, op: 'read' });
  // الجدول كما هو: الشريط يفرغ ولا يخفي أحدًا
  await expect(rows(page)).toHaveCount(6);
  await expect(strip(page).getByRole('button', { name: 'اعتبرها مقروءة' })).toBeDisabled();
  await shot(page, 'strip-empty-1440');
  // و«7 أيام» ما زالت تعرض ما مضى لمن أراد
  await strip(page).getByRole('button', { name: '7 أيام' }).click();
  await expect(lines(page)).toHaveCount(7);
});

test('زار قبل لحظات: لا جديد منذ آخر زيارة من أول فتح، وأول زيارة تعرض آخر 7 أيام بجملتها', async ({ page }) => {
  await setup(page, { visit: { since: AT, first: false } });
  await expect(page.getByTestId('cs-empty')).toHaveText('لا جديد منذ آخر زيارة');
  await expect(rows(page)).toHaveCount(6);
  await setup(page, { visit: { since: null, first: true } });
  await expect(strip(page)).toContainText('أول زيارة لك لهذه الدفعة، فنعرض آخر 7 أيام.');
  await expect(lines(page)).toHaveCount(7);
});

test('تعذّرت قراءة وقت آخر زيارة: آخر 7 أيام بجملة تقول ذلك، بلا زر «اعتبرها مقروءة» وبلا حفظ', async ({ page }) => {
  const calls = await setup(page, { visit: { failed: true, message: 'تعذّرت قراءة وقت آخر زيارة، أعد المحاولة', since: null, first: false } });
  await expect(strip(page)).toContainText('تعذّرت قراءة وقت آخر زيارة الآن، فنعرض آخر 7 أيام. حدّث الصفحة لإعادة المحاولة.');
  await expect(lines(page)).toHaveCount(7);
  await expect(strip(page).getByRole('button', { name: 'اعتبرها مقروءة' })).toHaveCount(0);
  await expect(page.locator('.la-err')).toHaveCount(0);
  expect(visits(calls)).toHaveLength(0);
  // خادم أقدم من الواجهة (رد بلا at ولا visit): الشريط يعمل بالنافذة الافتراضية
  await setup(page, { journeyOver: { success: true, journey_map: map, roster } });
  await expect(strip(page)).toContainText('تعذّرت قراءة وقت آخر زيارة الآن');
  await expect(rows(page)).toHaveCount(6);
});

test('تعذّر حفظ «اعتبرها مقروءة»: رسالة الخادم تظهر والسطور باقية', async ({ page }) => {
  await setup(page);
  await expect(lines(page)).not.toHaveCount(0);
  const n = await lines(page).count();
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.cohort-visit' && b.op === 'read') return route.fulfill({ status: 500, json: { success: false, code: 'db_error', message: 'تعذّر حفظ وقت آخر زيارة، أعد المحاولة' } });
    return route.fallback();
  });
  await strip(page).getByRole('button', { name: 'اعتبرها مقروءة' }).click();
  await expect(strip(page).locator('.la-err')).toHaveText('تعذّر حفظ وقت آخر زيارة، أعد المحاولة');
  await expect(lines(page)).toHaveCount(n);
});

test('التحميل: رسالة الانتظار قبل وصول الصفوف، والشريط معها لا قبلها', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await setup(page);
  await expect(lines(page)).toHaveCount(7);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.cohort-journey') { await gate; return route.fulfill({ json: { success: true, journey_map: map, roster, at: AT, visit: { since: LAST_VISIT, first: false } } }); }
    return route.fallback();
  });
  await page.getByRole('button', { name: 'تحديث' }).click();
  await expect(page.getByText('تُحسب مرحلة كل عضو من رحلته…')).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  release();
  await expect(lines(page)).toHaveCount(7);
});

test('الجوال 390 واللوحي 768: الشريط يلتف بلا تمرير أفقي، وأزراره بحجم اللمس', async ({ page }) => {
  for (const width of [390, 768]) {
    await setup(page, { width });
    await expect(lines(page)).toHaveCount(7);
    expect(await noOverflow(page)).toBe(true);
    const box = await lines(page).first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (width === 390) {
      await shot(page, 'strip-changes-390');
      await strip(page).getByRole('button', { name: 'اعتبرها مقروءة' }).click();
      await expect(page.getByTestId('cs-empty')).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, 'strip-empty-390');
    }
  }
});

test('«نظرة عامة»: تنبيه المتأخرين الجدد لكل دفعة، ورابطه يفتح «المتابعة» على عرض «متأخرون»', async ({ page }) => {
  for (const width of [1440, 390]) {
    const calls = await setup(page, { width, hash: '#/leaders/overview', role: 'super_admin' });
    // المرحلة 8: التنبيهات في قسم «ما يحتاج انتباهك» الواحد، بصف مشترك ووجهة «افتح ملف الدفعة ←»
    const alerts = page.getByRole('region', { name: /يحتاج انتباهك/ });
    const late = alerts.locator('li[data-kind="cohort_late"]');
    await expect(late).toContainText(/دفعة «دفعة نوفمبر»: 5 أعضاء صاروا متأخرين منذ أمس، والمتأخرون الآن 7/);
    await expect(late.getByRole('link')).toHaveAttribute('href', '#/leaders/programs/c1?view=follow&show=late');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, `overview-late-alert-${width}`);
    if (width !== 1440) continue;
    await late.getByRole('link').click();
    await expect(page).toHaveURL(/#\/leaders\/programs\/c1\?view=follow&show=late$/);
    await expect(page.getByRole('tab', { name: 'المتابعة' })).toHaveAttribute('aria-selected', 'true');
    // عرض «متأخرون» مفعّل: المتأخرون وحدهم بتعريف الخريطة نفسه
    await expect(rows(page)).toHaveCount(4);
    for (const r of await rows(page).all()) await expect(r).toContainText('متأخر');
    expect(calls.some((c) => c.action === 'admin.cohort-journey')).toBe(true);
  }
});
