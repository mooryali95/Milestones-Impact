// المسار المستمر عند المشارك (T1، تصور 2026-11-18 ب5.1): التوجيه كتلة «مسار مستمر» بجانب مراحله بنمط «تسير معًا»، بامتداده
// من التدريب +1 حتى نهاية الدفعة وما تنتظره بنوده، ولا يُعد في «أنجزت X من Y» ولا في عد الطور، والدعم والتقييم لا ينتظرانه
// والتقرير وحده ينتظره. الرحلة من المنطق المشترك نفسه (resolveStages وtrackWindows) والخلفية خادم المحاكاة.
// T1_SHOTS: مجلد لقطة الرحلة على 390.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { resolveStages } from '../supabase/functions/leaders-api/journey.js';
import { trackWindows } from '../supabase/functions/leaders-api/stage-windows.js';
import { journeyProgress } from '../supabase/functions/leaders-api/logic.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.T1_SHOTS || '';
const TRACK = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'report' };
const S = (key, title_ar, phase, sort, duration_days, duration_label, rules = null) => ({ key, title_ar, phase, sort, duration_days, duration_label, active: true, ...(rules ? { rules } : {}) });
const STAGES = [
  S('profile', 'الملف الشخصي', 'admission', 1, 0, 'دقائق'), S('assessment', 'تحديد المستوى', 'admission', 2, 0, '12 دقيقة'),
  S('training', 'التدريب', 'qualification', 3, 14, 'أسبوعان'), S('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 4, 28, 'طوال الرحلة', TRACK),
  S('support', 'الدعم والتمكين', 'impact', 5, 60, 'شهران'), S('evaluation', 'التقييم والقياس', 'impact', 6, 14, 'أسبوعان'), S('report', 'التقرير النهائي', 'impact', 7, 7, 'أسبوع'),
];
const it = (id, title_ar, status = 'pending') => ({ id, code: id.toUpperCase(), kind: 'reading', title_ar, required: true, status });
const ITEMS = {
  profile: [it('p1', 'بيانات الملف', 'done')], assessment: [it('a1', 'إرسال القياس', 'done')],
  training: [it('t1', 'قراءة كتابك الشخصي', 'done'), it('t2', 'تسمية مبادرتك', 'done')],
  ojt_coaching: [it('o1', 'سجل المعالم لمشروعك', 'done'), it('o2', 'سجل المنافع'), it('o3', 'جلسة بوابة موثقة')],
  support: [it('s1', 'تقرير الأثر')], evaluation: [it('e1', 'القياس البعدي')], report: [it('r1', 'استلام التقرير')],
};
const COHORT = { name: 'دفعة نوفمبر 2026', starts_on: '2026-11-04', ends_on: '2027-03-31', schedule: {} };
const built = resolveStages(STAGES.map((s) => ({ ...s, items: ITEMS[s.key], done: ITEMS[s.key].filter((x) => x.status === 'done').length, total: ITEMS[s.key].length })),
  { cohortStart: COHORT.starts_on, today: '2026-11-25' });
const tw = trackWindows(STAGES, COHORT);
const JOURNEY = built.map((s) => (tw[s.key] ? { ...s, track: tw[s.key] } : s));

async function open(page, journey = JOURNEY) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    await route.fulfill({ json: b.action === 'me' ? { ...r, journey, progress: journeyProgress(journey), milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, cohort: COHORT } : r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-track-0000000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); });
  await page.goto(APP);
}

for (const [name, viewport] of [['الهاتف', { width: 390, height: 844 }], ['الحاسب', { width: 1440, height: 900 }]]) {
  test(`${name}: التوجيه «مسار مستمر» يسير بجانب المراحل، والدعم جارٍ، والتقرير ينتظره وحده، و«X من Y» بلاه`, async ({ browser }) => {
    // الحساب نفسه قبل الرسم: الدعم لا ينتظر المسار، والتقرير ينتظره
    expect(Object.fromEntries(built.map((s) => [s.key, s.status]))).toMatchObject({ ojt_coaching: 'active', support: 'active', report: 'locked' });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'ar-SA', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await ctx.newPage();
    await open(page);
    // الرأس: المرحلة الحالية الدعم لا المسار، وأنجزت 3 من 6 مراحل (بلا التوجيه)
    await expect(page.locator('.hero')).toContainText('المرحلة الحالية: الدعم والتمكين');
    await expect(page.locator('.hero')).toContainText('أنجزت 3 من 6 مراحل');
    const t = page.getByTestId('track');
    await expect(t).toHaveCount(1);
    await expect(t.locator('.track-badge')).toHaveText('مسار مستمر');
    await expect(t.getByRole('heading', { level: 4, name: 'التوجيه على رأس العمل' })).toBeVisible();
    await expect(t).toContainText('يسير معك من 5 نوفمبر إلى 31 مارس، بجانب مراحلك، فلا يؤخر ما بعده.');
    await expect(t).toContainText('بنوده الإلزامية مطلوبة قبل «التقرير النهائي» وحدها، وما سواها لا ينتظره.');
    await expect(t.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    await expect(t.locator('#stage-ojt_coaching')).toBeVisible();
    // ليس في كتلة «تسير معًا» ولا يُعد في الطور: التأهيل 1 من 1
    await expect(page.getByTestId('together')).toHaveCount(0);
    await expect(page.locator('#stage-report')).toContainText('التوجيه على رأس العمل');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (SHOTS && viewport.width === 390) {
      await t.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
      await page.screenshot({ path: `${SHOTS}/participant-journey-track-390.png` });
    }
    await ctx.close();
  });
}

test('برنامج بلا مسار لا يتغير: لا كتلة مسار، والتوجيه مرحلة تُعد كما كانت', async ({ page }) => {
  const plain = JOURNEY.map(({ lane: _l, track: _t, ...s }) => (s.key === 'ojt_coaching' ? { ...s, rules: {} } : s));
  await open(page, plain);
  await expect(page.getByTestId('track')).toHaveCount(0);
  await expect(page.locator('.hero')).toContainText('من 7 مراحل');
});
