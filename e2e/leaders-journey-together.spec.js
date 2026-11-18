// التوازي 2 عند المشارك (R3b في تصور محرر رحلة الدفعة): المراحل التي تسير معًا كتلة واحدة «تسير معًا» بتقدم كل منها،
// والمرحلة الحالية الجاريتان معًا في الرأس، والموقوفة لا تظهر، ومدة الدفع أطول المجموعة لا مجموعها. الخلفية خادم المحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.R3B_SHOTS || '';
const stage = (key, title_ar, phase, status, items = [], extra = {}) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length, ...extra });
const req = (id, title_ar, status = 'pending', required = true) => ({ id, code: id.toUpperCase(), kind: 'reading', title_ar, required, status });
// التدريب أسبوعان، والتوجيه يسير معه أربعة أسابيع بإزاحة أسبوع: مدة المجموعة خمسة أسابيع لا ستة. والدعم بعدها أسبوعان
const JOURNEY = [
  stage('profile', 'الملف الشخصي', 'admission', 'done', [], { duration_days: 0, sort: 1 }),
  stage('assessment', 'تحديد المستوى', 'admission', 'done', [], { duration_days: 0, sort: 2 }),
  stage('training', 'التدريب', 'qualification', 'active', [req('t1', 'قراءة كتابك الشخصي', 'done'), req('t2', 'تسمية مبادرتك')], { duration_days: 14, duration_label: 'أسبوعان', sort: 3 }),
  stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'active', [req('o1', 'جلسة التوجيه الأولى'), req('o2', 'جلسة التوجيه الثانية'), req('o3', 'خطة التطبيق')],
    { duration_days: 28, duration_label: '4 أسابيع', sort: 4, rules: { unlock: 'with', with: 'training', offset: 7 } }),
  stage('support', 'الدعم والتمكين', 'impact', 'locked', [req('s1', 'تقرير الأثر')], { duration_days: 14, duration_label: 'أسبوعان', sort: 6, lock_reason: 'تُفتح بعد اكتمال: التدريب، التوجيه على رأس العمل' }),
];

async function open(page, { journey = JOURNEY, patch = {} } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    await route.fulfill({ json: b.action === 'me' ? { ...r, journey, milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, ...patch } : r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-together-000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); });
  await page.goto(APP);
}

for (const [name, viewport] of [['الهاتف', { width: 390, height: 844 }], ['الحاسب', { width: 1280, height: 900 }]]) {
  test(`${name}: المرحلتان الجاريتان معًا في الرأس، وكتلة «تسير معًا» بتقدم كل منهما، بلا تمرير أفقي`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'ar-SA', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await ctx.newPage();
    await open(page);
    await expect(page.locator('.hero')).toContainText('مرحلتاك الحاليتان تسيران معًا: التدريب والتوجيه على رأس العمل');
    const g = page.getByTestId('together');
    await expect(g).toHaveCount(1);
    await expect(g.getByRole('heading', { name: '«التدريب» و«التوجيه على رأس العمل»' })).toBeVisible();
    await expect(g).toContainText('مرحلتان تبدآن معًا وتسيران في الأسابيع نفسها');
    // تقدم كل مرحلة بشريطها المقروء
    const bars = g.getByRole('progressbar');
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0)).toHaveAttribute('aria-valuenow', '50');
    await expect(bars.nth(0)).toHaveAttribute('aria-label', 'تقدمك في «التدريب»');
    await expect(bars.nth(1)).toHaveAttribute('aria-valuenow', '0');
    // البطاقتان داخل الكتلة، مفتوحتان لأنهما الحاليتان، والمقفلة بعدها خارجها
    await expect(g.locator('#stage-training')).toBeVisible();
    await expect(g.locator('#stage-ojt_coaching')).toBeVisible();
    await expect(g.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'true');
    await expect(g.locator('#stage-ojt_coaching .stage-top')).toHaveAttribute('aria-expanded', 'true');
    await expect(g.locator('#stage-support')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // النقطتان على خط الرحلة نفسه الذي تقف عليه المراحل خارج الكتلة
    const dotX = (sel) => page.locator(`${sel} > .dot`).evaluate((d) => Math.round(d.getBoundingClientRect().left + d.getBoundingClientRect().width / 2));
    const outside = await page.locator('#stage-profile').count() && await page.locator('#stage-profile').isVisible() ? await dotX('#stage-profile') : null;
    const inside = await dotX('#stage-ojt_coaching');
    if (outside != null) expect(Math.abs(outside - inside)).toBeLessThanOrEqual(2);
    if (SHOTS) {
      // الكتلة من رأسها تحت الشريط العلوي الثابت
      await g.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 600 ? 84 : 72)));
      await page.screenshot({ path: `${SHOTS}/journey-together-${viewport.width}.png` });
    }
    await ctx.close();
  });
}

test('مرحلة واحدة جارية من مجموعة: الرأس يسميها وحدها، والكتلة تبقى وفيها المكتملة', async ({ page }) => {
  const j = JOURNEY.map((s) => (s.key === 'training' ? { ...s, status: 'done', items: s.items.map((i) => ({ ...i, status: 'done' })), done: 2 } : s));
  await open(page, { journey: j });
  await expect(page.locator('.hero')).toContainText('المرحلة الحالية: التوجيه على رأس العمل');
  const g = page.getByTestId('together');
  await expect(g.getByRole('progressbar').nth(0)).toHaveAttribute('aria-valuenow', '100');
  await expect(g.locator('li.done')).toContainText('التدريب');
});

test('الموقوفة لهذه الدفعة لا تظهر للمشارك (R2b): رحلته بلا المرحلة، والكتلة بلا عضوها الموقوف', async ({ page }) => {
  // الخادم يُسقط الموقوفة من رحلته (cohortDefinition)، فيبقى التدريب وحده بلا كتلة
  await open(page, { journey: JOURNEY.filter((s) => s.key !== 'ojt_coaching') });
  await expect(page.getByTestId('together')).toHaveCount(0);
  await expect(page.locator('#stage-ojt_coaching')).toHaveCount(0);
  await expect(page.locator('.hero')).toContainText('المرحلة الحالية: التدريب');
});

test('بوابة الدفع: المدة من خطة الرحلة، أطول المجموعة بإزاحتها لا مجموع المدد', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar-SA', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const locked = JOURNEY.map((s) => (s.phase === 'admission' ? s : { ...s, status: 'locked' }));
  await open(page, {
    journey: locked,
    patch: {
      participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'placed', organization_linked: false, consented_at: '2026-11-01T09:00:00Z' },
      access: { enabled: true, assessment: 'paid', program: null, prices: { currency: 'USD', assessment: 100, program: 9900 }, sponsor: null, request: null },
    },
  });
  await expect(page.getByRole('heading', { name: 'أكمل رحلتك في البرنامج' })).toBeVisible();
  // 7 + 28 = 35 يومًا للمجموعة، ثم 14: سبعة أسابيع، لا ثمانية (14 + 28 + 14)
  await expect(page.getByText('نحو 7 أسابيع من بداية دفعتك')).toBeVisible();
  await expect(page.getByText('نحو 8 أسابيع')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/paywall-390.png` });
  await ctx.close();
});
