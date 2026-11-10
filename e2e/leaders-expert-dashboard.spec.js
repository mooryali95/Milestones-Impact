// لوحة الخبير بعد تدقيق الإنتاج (المرحلة أ، 2026-11-10): التحميل في رحلة واحدة بهيكل بدل دائرة، وأسماء الأدوار،
// وشهادة الساعات بعد أول جلسة، و«لم يكتمل» للتقييم الغائب، وخطوات البداية للخبير الجديد، ومنطقة إعلان لقارئ الشاشة.
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);

const base = {
  success: true,
  expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor', 'coach'], bio: 'خبرة', weekly_hours: 4, dimensions: ['impact'], levels: ['beginner'] },
  stats: { hours: 0, participants: 0, attended: 0, upcoming: 0, no_show: 0 },
  rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [],
};
const preload = {
  reviews: { success: true, advisor: true, items: [{ id: 's1', status: 'submitted', submitted_at: '2026-11-01T10:00:00Z', participants: { full_name: 'خالد العتيبي' }, learning_models: { title_ar: 'اتفاق التعلم', fields: [] } }] },
  participants: { success: true, items: [{ id: 'p1', name: 'خالد العتيبي', cohort: 'دفعة نوفمبر', advisor: true, level_ar: 'متوسط', approved: true, progress: 40, late: 0, needs: 1 }], cohorts: [] },
  peers: { success: true, advisor: false, cohorts: [], items: [], pending: 0 },
  sus: { success: true, ready: true, due: false, answered: false },
};

async function mount(page, dashboard, { delay = 0 } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'xp.dashboard') {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return route.fulfill({ json: b.lite ? dashboard : { ...dashboard, preload } });
    }
    const alone = { 'xp.reviews': preload.reviews, 'xp.participants': preload.participants, 'xp.peer-list': preload.peers, 'xp.sus-state': preload.sus }[b.action];
    if (alone) return route.fulfill({ json: alone });
    if (b.action === 'xp.participant') return route.fulfill({ json: { success: false, message: 'غير متاح في هذا الاختبار' } });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  return calls;
}

test('اللوحة في رحلة واحدة: هيكل أثناء التحميل، ثم الأقسام من الطلب المجمّع بلا طلب ثانٍ', async ({ page }) => {
  const calls = await mount(page, base, { delay: 400 });
  await page.goto(PORTAL);
  await expect(page.locator('[aria-busy="true"][aria-label="جارٍ تحميل لوحتك"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  await expect(page.getByText('بانتظار تقييمك')).toBeVisible();
  await expect(page.getByText('خالد العتيبي').first()).toBeVisible();
  expect(calls.map((c) => c.action)).toEqual(['xp.dashboard']);
});

test('الرأس: أسماء الأدوار لا عددها، وتسمية عربية، وشهادة الساعات معطلة بلا ساعات، و«لم يكتمل» للتقييم الغائب', async ({ page }) => {
  await mount(page, base);
  await page.goto(PORTAL);
  await expect(page.getByText('مستشارة · مستشار، موجّه')).toBeVisible();
  await expect(page.getByText('بوابة الخبراء')).toBeVisible();
  await expect(page.getByText('EXPERT PORTAL')).toHaveCount(0);
  const cert = page.getByRole('button', { name: 'شهادة ساعات الخبرة' });
  await expect(cert).toBeDisabled();
  await expect(cert).toHaveAccessibleDescription('تُتاح بعد أول جلسة منعقدة');
  await expect(page.locator('.xpp-kpis b').nth(3)).toHaveText('لم يكتمل');
  // أهداف اللمس في الرأس 44 على الأقل (البند 6.5)
  for (const name of ['شهادة ساعات الخبرة', 'خروج']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
});

test('شهادة الساعات تُتاح بعد أول جلسة منعقدة', async ({ page }) => {
  await mount(page, { ...base, stats: { ...base.stats, hours: 3, attended: 2 } });
  await page.goto(PORTAL);
  await expect(page.getByRole('button', { name: 'شهادة ساعات الخبرة' })).toBeEnabled();
});

test('الخبير الجديد يرى خطوات البداية، ومن له عمل لا يراها', async ({ page }) => {
  await mount(page, { ...base, expert: { ...base.expert, bio: null } });
  await page.goto(PORTAL);
  await expect(page.getByRole('heading', { name: 'بداية عملك في الشبكة' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'راسلنا بما ينقصه' })).toHaveAttribute('href', /^mailto:/);
  await page.unrouteAll();
  await mount(page, { ...base, stats: { ...base.stats, participants: 1 } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'بداية عملك في الشبكة' })).toHaveCount(0);
});

test('الرد على طلب يُعلَن لقارئ الشاشة، وإعادة التحميل بعده خفيفة', async ({ page }) => {
  const offered = { id: 'r1', status: 'offered', role_ar: 'موجّه', participant: { name: 'نورة السالم' }, expires_at: new Date(Date.now() + 5 * 36e5).toISOString() };
  const calls = await mount(page, { ...base, requests: [offered] });
  await page.goto(PORTAL);
  await page.getByRole('button', { name: 'أقبل' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'قبلت طلب نورة السالم' })).toBeVisible();
  const dash = calls.filter((c) => c.action === 'xp.dashboard');
  expect(dash.map((c) => !!c.lite)).toEqual([false, true]);
});

test('فتح ملف مشارك ثم الرجوع: الأقسام تطلب حالها الحالية لا نسخة التحميل الأول', async ({ page }) => {
  const calls = await mount(page, { ...base, stats: { ...base.stats, participants: 1 } });
  await page.goto(PORTAL);
  await page.getByRole('button', { name: 'افتح الملف' }).click();
  await page.getByRole('button', { name: '→ مشاركوك' }).click();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  await expect.poll(() => calls.filter((c) => c.action === 'xp.participants').length).toBe(1);
  expect(calls.filter((c) => c.action === 'xp.reviews')).toHaveLength(1);
});
