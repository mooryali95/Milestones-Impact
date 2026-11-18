// الخدمة عند المشارك (T2، تصور 2026-11-18 ب5.2): الاستشارة في «خدمات متاحة لك» منفصلة عن تسلسل المراحل، بزر حجزها، ولا تُعد
// في «أنجزت X من Y» ولا في عد الطور. وعند بلوغ حد الجلسات يُخفى زر الحجز ويُقال لماذا. الرحلة من المنطق المشترك نفسه
// (resolveStages وcoachingStatus) والخلفية خادم المحاكاة. T2_SHOTS: مجلد لقطة الرف على 390.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { resolveStages } from '../supabase/functions/leaders-api/journey.js';
import { coachingStatus, journeyProgress } from '../supabase/functions/leaders-api/logic.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.T2_SHOTS || '';
const SERVICE = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const S = (key, title_ar, phase, sort, duration_days, duration_label, rules = null) => ({ key, title_ar, phase, sort, duration_days, duration_label, active: true, ...(rules ? { rules } : {}) });
const STAGES = [
  S('profile', 'الملف الشخصي', 'admission', 1, 0, 'دقائق'), S('assessment', 'تحديد المستوى', 'admission', 2, 0, '12 دقيقة'), S('approval', 'اعتماد المستوى', 'admission', 3, 2, 'يوما عمل'),
  S('training', 'التدريب', 'qualification', 4, 14, 'أسبوعان'), S('consulting', 'الاستشارة', 'qualification', 5, 14, 'عند الحاجة', SERVICE),
  S('support', 'الدعم والتمكين', 'impact', 6, 60, 'شهران'), S('report', 'التقرير النهائي', 'impact', 7, 7, 'أسبوع'),
];
const CFG = { sessions_required: 1, minutes: 90, max_sessions: 2 };
const it = (id, title_ar, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'reading', title_ar, required: true, status, ...extra });
const session = (id, status, day) => ({ id, status, starts_at: `2026-12-${day}T09:00:00Z`, ends_at: `2026-12-${day}T10:30:00Z`, join_url: null });
const coach = (sessions) => ({ ...coachingStatus(CFG, sessions, Date.parse('2026-11-25T10:00:00Z')), book_url: 'https://cal.com/coach/consult', provider: 'calcom', instant: false, mode: 'online', location: null });
const items = (sessions) => ({
  profile: [it('p1', 'بيانات الملف', 'done')], assessment: [it('a1', 'إرسال القياس', 'done')], approval: [it('ap', 'اعتماد مسارك', 'done')],
  training: [it('t1', 'قراءة كتابك الشخصي', 'done'), it('t2', 'تسمية مبادرتك')],
  consulting: [it('c-meet', 'لقاء استشاري مع خبير', 'pending', { kind: 'coaching', required: false, activity: coach(sessions) })],
  support: [it('s1', 'تقرير الأثر')], report: [it('r1', 'استلام التقرير')],
});
const journeyOf = (sessions) => {
  const I = items(sessions);
  return resolveStages(STAGES.map((s) => ({ ...s, items: I[s.key], done: I[s.key].filter((x) => x.status === 'done').length, total: I[s.key].length })), { cohortStart: '2026-11-04', today: '2026-11-25' });
};
const COHORT = { name: 'دفعة نوفمبر 2026', starts_on: '2026-11-04', ends_on: '2027-03-31', schedule: {} };

async function open(page, journey) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    await route.fulfill({ json: b.action === 'me' ? { ...r, journey, progress: journeyProgress(journey), milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, cohort: COHORT } : r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-svc-00000000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); });
  await page.goto(APP);
}

for (const [name, viewport] of [['الهاتف', { width: 390, height: 844 }], ['الحاسب', { width: 1440, height: 900 }]]) {
  test(`${name}: «خدمات متاحة لك» فيها الاستشارة وزر حجزها، منفصلة عن المراحل وعدها`, async ({ browser }) => {
    const journey = journeyOf([session('x1', 'attended', '01')]);
    expect(Object.fromEntries(journey.map((s) => [s.key, s.status]))).toMatchObject({ consulting: 'available', training: 'active', support: 'locked' });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'ar-SA', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await ctx.newPage();
    await open(page, journey);
    // العد بلا الخدمة: 3 من 6 مراحل (بلا الاستشارة)
    await expect(page.locator('.hero')).toContainText('المرحلة الحالية: التدريب');
    await expect(page.locator('.hero')).toContainText('أنجزت 3 من 6 مراحل');
    const shelf = page.getByTestId('services');
    await expect(shelf).toHaveCount(1);
    await expect(shelf.getByRole('heading', { name: 'خدمات متاحة لك' })).toBeVisible();
    await expect(shelf).toContainText('لمن يريد، ولا تُحسب في تقدمك');
    await expect(shelf).toContainText('متاحة لك حتى نهاية رحلتك، حجزت 1 من 2');
    // ليست في تسلسل المراحل
    await expect(page.locator('.j-main .phase #stage-consulting')).toHaveCount(0);
    await expect(shelf.locator('#stage-consulting')).toBeVisible();
    await shelf.locator('#stage-consulting .stage-top').click();
    await expect(shelf.getByRole('button', { name: 'احجز موعدًا' })).toBeVisible();
    await expect(shelf.getByTestId('sessions-max')).toHaveText('حجزت 1 من 2 متاحة لك.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (SHOTS && viewport.width === 390) {
      await shelf.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
      await page.screenshot({ path: `${SHOTS}/participant-services-390.png` });
    }
    await ctx.close();
  });
}

test('عند بلوغ حد الجلسات: يُخفى زر الحجز ويُقال لماذا', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, journeyOf([session('x1', 'attended', '01'), session('x2', 'booked', '09')]));
  const shelf = page.getByTestId('services');
  await expect(shelf).toContainText('استفدت من كل جلساتك المتاحة');
  await shelf.locator('#stage-consulting .stage-top').click();
  await expect(shelf.getByTestId('sessions-max')).toHaveText('استفدت من جلساتك الـ2 المتاحة، فلا حجز جديد.');
  await expect(shelf.getByRole('button', { name: 'احجز موعدًا' })).toHaveCount(0);
});

test('قبل اعتماد المستوى: الخدمة ظاهرة مقفلة بسببها، بلا زر حجز', async ({ page }) => {
  const I = items([]);
  I.approval = [it('ap', 'اعتماد مسارك')];
  const j = resolveStages(STAGES.map((s) => ({ ...s, items: I[s.key], done: I[s.key].filter((x) => x.status === 'done').length, total: I[s.key].length })), { cohortStart: '2026-11-04', today: '2026-11-25' });
  await open(page, j);
  const shelf = page.getByTestId('services');
  await expect(shelf).toContainText('تُفتح بعد اكتمال: اعتماد المستوى');
});

test('برنامج بلا خدمة لا يتغير: لا رف، والاستشارة مرحلة تُعد كما كانت', async ({ page }) => {
  const plain = journeyOf([]).map(({ lane: _l, ...s }) => (s.key === 'consulting' ? { ...s, rules: { mode: 'on_demand' }, stage_mode: 'on_demand' } : s));
  await open(page, plain);
  await expect(page.getByTestId('services')).toHaveCount(0);
  await expect(page.locator('.j-main .phase #stage-consulting')).toHaveCount(1);
});
