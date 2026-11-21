// الورشة الاختيارية عند المشارك والمدرب (قرار المالك 2026-11-21، القاعدة في optional.js)، وإصلاح شارة الجلسة الجماعية:
// المشارك يرى الورشة الاختيارية بوسمها «اختيارية، لا تُحسب في تقدمك»، وحضورها مسجل ولا يدخل عدّاد نشاطه، والنشاط الاختياري
// في البرنامج بوسمه كذلك. والمدرب يراها معلَّمة في بوابته. والجلسة الجماعية الحضورية في نشاط توجيه عن بعد تحمل شارة «حضوري»
// لا شارة النشاط «عن بعد». بعرضي 1440 و390. الخلفية مُحاكاة بدوال الخادم نفسها (workshopStatus وcoachingStatus).
// SHOTS_DIR: مجلد اللقطات.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { resolveStages } from '../supabase/functions/leaders-api/journey.js';
import { buildJourney, coachingStatus, journeyProgress, workshopStatus } from '../supabase/functions/leaders-api/logic.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-25T10:00:00Z';
const shot = async (page, name) => { if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const S = (key, title_ar, phase, sort, rules = null) => ({ key, title_ar, phase, sort, duration_days: 14, active: true, ...(rules ? { rules } : {}) });
const STAGES = [
  S('profile', 'الملف الشخصي', 'admission', 1), S('assessment', 'تحديد المستوى', 'admission', 2), S('approval', 'اعتماد المستوى', 'admission', 3),
  S('training', 'التدريب', 'qualification', 4), S('consulting', 'الاستشارة', 'qualification', 5, { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] }),
  S('support', 'الدعم والتمكين', 'impact', 6),
];
const it = (id, title_ar, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'reading', title_ar, required: true, status, ...extra });
async function participant(page, width, journey) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    await route.fulfill({ json: b.action === 'me' ? { ...r, journey, progress: journeyProgress(journey), milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, cohort: { name: 'دفعة نوفمبر 2026', starts_on: '2026-11-04', ends_on: '2027-03-31', schedule: {} } } : r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-opt-00000000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); });
  await page.goto(APP);
}

// ── الورشة الاختيارية في رحلة المشارك ──
const session = (id, title, day, extra = {}) => ({ id, title_ar: title, mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: `2026-11-${day}T06:00:00Z`, ends_at: `2026-11-${day}T12:00:00Z`, active: true, ...extra });
function workshopJourney() {
  // يومان إلزاميان (حضر الأول، والثاني قادم) وورشة اختيارية حضرها وأخرى اختيارية قادمة. والخادم يختم البنود كما في الإنتاج
  const sessions = [session('d1', 'اليوم 1', 20), session('d2', 'اليوم 2', 30), session('x1', 'لقاء مع خبير زائر', 22, { optional: true }), session('x2', 'ورشة مهارات العرض', 27, { optional: true })];
  const act = workshopStatus({ verify: 'qr', sessions_required: 2 }, sessions, new Set(['d1', 'x1']), Date.parse(NOW));
  const reqs = [
    { id: 'p1', code: 'P1', stage_key: 'profile', kind: 'manual', title_ar: 'بيانات الملف', required: true, sort: 1, active: true },
    { id: 'a1', code: 'A1', stage_key: 'assessment', kind: 'manual', title_ar: 'إرسال القياس', required: true, sort: 1, active: true },
    { id: 'ap', code: 'AP', stage_key: 'approval', kind: 'manual', title_ar: 'اعتماد مسارك', required: true, sort: 1, active: true },
    { id: 't-attend', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', required: true, sort: 1, active: true, config: { verify: 'qr', sessions_required: 2 } },
    { id: 't-task', code: 'T-TASK', stage_key: 'training', kind: 'manual', title_ar: 'واجب التدريب', required: true, sort: 2, active: true },
    { id: 't-extra', code: 'T-EXTRA', stage_key: 'training', kind: 'manual', title_ar: 'قراءة إثرائية', required: false, sort: 3, active: true },
    { id: 's1', code: 'S1', stage_key: 'support', kind: 'manual', title_ar: 'تقرير الأثر', required: true, sort: 1, active: true },
  ];
  const done = { status: 'done' };
  const journey = buildJourney({ stages: STAGES.filter((s) => s.key !== 'consulting'), requirements: reqs, progress: { p1: done, a1: done, ap: done, 't-extra': done }, levels: {}, state: {}, activity: { 't-attend': act }, cohortStart: '2026-11-04', today: NOW });
  return { journey, act };
}

for (const width of [1440, 390]) {
  test(`المشارك يرى الورشة الاختيارية بوسمها، وحضورها لا يدخل عدّاده ولا تقدمه (${width})`, async ({ page }) => {
    const { journey, act } = workshopJourney();
    // القاعدة من الخادم: حضر يومًا إلزاميًا واحدًا من اثنين، والاختيارية المحضورة خارج العد، والنشاط الاختياري المنجز خارج النسبة
    expect([act.count, act.total, act.done]).toEqual([1, 2, false]);
    const training = journey.find((s) => s.key === 'training');
    expect([training.done, training.total, training.status]).toEqual([0, 2, 'active']);
    await participant(page, width, journey);
    // الجلسة القادمة الأقرب اختيارية: بطاقتها تقول ذلك
    const next = page.locator('.j-session');
    await expect(next).toContainText('ورشة مهارات العرض');
    await expect(next.getByTestId('session-optional')).toHaveText('اختيارية، لا تُحسب في تقدمك');
    // داخل مرحلته
    const stage = page.locator('#stage-training');
    if (!(await stage.locator('.act-session').count())) await stage.locator('.stage-top').click();
    const rows = stage.locator('.act-session');
    await expect(rows).toHaveCount(4);
    await expect(stage).toContainText('حضرت 1 من 2');
    const row = (t) => stage.locator('.act-session', { hasText: t });
    await expect(row('لقاء مع خبير زائر').getByTestId('session-optional')).toHaveText('اختيارية، لا تُحسب في تقدمك');
    await expect(row('ورشة مهارات العرض').getByTestId('session-optional')).toBeVisible();
    await expect(row('اليوم 1').getByTestId('session-optional')).toHaveCount(0);
    await expect(row('اليوم 2').getByTestId('session-optional')).toHaveCount(0);
    // والنشاط الاختياري في البرنامج بوسمه
    await expect(stage.getByTestId('item-optional')).toHaveText('(اختياري، لا يُحسب في تقدمك)');
    expect(await noOverflow(page)).toBe(true);
    await row('لقاء مع خبير زائر').scrollIntoViewIfNeeded();
    await stage.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
    await shot(page, 'participant-chip');
    await next.scrollIntoViewIfNeeded();
    await shot(page, 'participant-next-optional');
  });
}

// ── شارة الجلسة الجماعية (إصلاح من المرحلة 5) ──
const CFG = { sessions_required: 1, minutes: 90, max_sessions: 2 };
const GROUP = (mode, extra = {}) => ({ id: `row-${mode}`, status: 'booked', kind: 'manual', group_id: `g-${mode}`, starts_at: '2026-12-06T07:00:00Z', ends_at: '2026-12-06T08:30:00Z', join_url: mode === 'online' ? 'https://meet.example.sa/g' : null,
  group: { title: 'جلسة جماعية: التفاوض', with: 'د. منى القحطاني', mode, location: mode === 'in_person' ? 'قاعة الاجتماعات، الدور الثالث' : null }, ...extra });
const coachingJourney = (sessions, cfg = CFG) => {
  // النشاط نفسه عن بعد (ما يحجزه المشارك)، كما يعيده participantItem
  const act = { ...coachingStatus(cfg, sessions, Date.parse(NOW)), book_url: 'https://cal.com/coach/consult', provider: 'calcom', instant: false, mode: 'online', location: null };
  const I = {
    profile: [it('p1', 'بيانات الملف', 'done')], assessment: [it('a1', 'إرسال القياس', 'done')], approval: [it('ap', 'اعتماد مسارك', 'done')],
    training: [it('t1', 'قراءة كتابك الشخصي', 'done'), it('t2', 'تسمية مبادرتك')],
    consulting: [it('c-meet', 'لقاء استشاري مع خبير', 'pending', { kind: 'coaching', required: false, activity: act })], support: [it('s1', 'تقرير الأثر')],
  };
  return resolveStages(STAGES.map((s) => ({ ...s, items: I[s.key], done: I[s.key].filter((x) => x.status === 'done').length, total: I[s.key].length })), { cohortStart: '2026-11-04', today: NOW });
};
const openConsulting = async (page) => {
  const shelf = page.getByTestId('services');
  await shelf.locator('#stage-consulting .stage-top').click();
  await expect(shelf.locator('.act-session').first()).toBeVisible();
  return shelf;
};

for (const width of [1440, 390]) {
  test(`جلسة جماعية حضورية في نشاط عن بعد: شارتها «حضوري» في صفها، ولا شارة «عن بعد» تقول غير ذلك (${width})`, async ({ page }) => {
    await participant(page, width, coachingJourney([GROUP('in_person')]));
    const shelf = await openConsulting(page);
    const row = shelf.locator('.act-session');
    await expect(row.getByTestId('group-mode')).toHaveText('حضوري');
    await expect(row).toContainText('المكان: قاعة الاجتماعات، الدور الثالث');
    // ما زال يحجز جلسة عن بعد، والجماعية حضورية: الطريقتان مختلفتان، فلا شارة عامة أعلى النشاط
    await expect(shelf.getByTestId('coaching-mode')).toHaveCount(0);
    await expect(shelf.locator('#stage-consulting .act .chip', { hasText: 'عن بعد' })).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shelf.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
    await shot(page, 'group-chip-fix');
  });
}

test('شارة أعلى النشاط حين تصدق على كل جلساته: الجماعية عن بعد مع نشاط عن بعد، والحضورية وحدها بعد استنفاد الرصيد', async ({ page }) => {
  await participant(page, 390, coachingJourney([GROUP('online')]));
  let shelf = await openConsulting(page);
  await expect(shelf.getByTestId('coaching-mode')).toHaveText('عن بعد');
  await expect(shelf.locator('.act-session').getByTestId('group-mode')).toHaveText('عن بعد');
  // رصيد جلسة واحدة أخذته الجماعية الحضورية: لا حجز آخر، فكل ما في النشاط حضوري والشارة العامة تقول ذلك
  await participant(page, 390, coachingJourney([GROUP('in_person')], { sessions_required: 1, minutes: 90, max_sessions: 1 }));
  shelf = await openConsulting(page);
  await expect(shelf.getByTestId('coaching-mode')).toHaveText('حضوري');
  // وبلا جلسة جماعية: شارة النشاط كما كانت
  await participant(page, 390, coachingJourney([{ id: 'one', status: 'booked', kind: 'manual', starts_at: '2026-12-06T07:00:00Z', ends_at: '2026-12-06T08:00:00Z', join_url: 'https://meet.example.sa/one' }]));
  shelf = await openConsulting(page);
  await expect(shelf.getByTestId('coaching-mode')).toHaveText('عن بعد');
  await expect(shelf.getByTestId('group-mode')).toHaveCount(0);
});

// ── المدرب ──
for (const width of [1440, 390]) {
  test(`المدرب يرى الورشة الاختيارية معلَّمة في بوابته (${width})`, async ({ page }) => {
    const soon = (h) => new Date(Date.parse(NOW) + h * 36e5).toISOString();
    const sessions = [
      { id: 'w1', title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: soon(2), ends_at: soon(8), cohort: 'دفعة نوفمبر 2026', open: false, qr: true, sheet: false },
      { id: 'w2', title: 'لقاء مع خبير زائر', location: 'الرياض، قاعة الأثر', starts_at: soon(26), ends_at: soon(29), cohort: 'دفعة نوفمبر 2026', open: false, qr: true, sheet: false, optional: true },
    ];
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.clock.setFixedTime(new Date(NOW));
    await page.route(/functions\/v1\/leaders-api/, async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      const dash = { success: true, features: { hall: false, katon: false, f360: false }, expert: { full_name: 'د. منى القحطاني', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 0, participants: 0, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 },
        requests: [], sessions: [], groups: [], criteria: {}, advisor_cohorts: [] };
      await route.fulfill({ json: b.action === 'xp.dashboard' ? dash : b.action === 'xp.workshops' ? { success: true, sessions } : { success: true, items: [] } });
    });
    await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
    await page.goto(`${APP}x`);
    const row = (t) => page.locator('.xpp-attend', { hasText: t });
    await expect(row('لقاء مع خبير زائر').getByTestId('session-optional')).toHaveText('اختيارية');
    await expect(row('اليوم الثالث').getByTestId('session-optional')).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await row('لقاء مع خبير زائر').scrollIntoViewIfNeeded();
    await shot(page, 'trainer-chip');
  });
}
