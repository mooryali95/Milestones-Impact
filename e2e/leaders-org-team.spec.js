// فريق الجهة والدفعة، المرحلة 2 (تصور ربط الخبراء والمجموعات بالجهة v1): الخبير يعرف تكليفاته في «تكليفاتي» بأعداد لا أسماء،
// والمشارك يرى «مستشارك» (الاسم وحده). سطح المكتب و390px. الخلفية مُحاكاة، ولا بريد يُرسل.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const PORTAL = 'http://localhost:4304/x';
const APP = 'http://localhost:4304/';
const XP_TOKEN = 'x'.repeat(40);

const dashboard = {
  success: true,
  expert: { full_name: 'أ. خالد ن.', title: 'موجّه', roles: ['coach', 'mentor'], bio: 'خبرة', weekly_hours: 10, dimensions: ['impact'], levels: ['beginner'] },
  stats: { hours: 3, participants: 2, attended: 3, upcoming: 0, no_show: 0 },
  rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [],
  assignments: [
    { cohort_id: 'c1', cohort: 'دفعة هيئة المثال 2026', org: 'هيئة المثال', status: 'running', starts_on: '2026-03-01', ends_on: '2026-06-30',
      advisor: false, member: true, groups: [{ id: 'G4', name: 'المجموعة 4', count: 7 }], participants: 42, serves: 7 },
    { cohort_id: 'c2', cohort: 'دفعة جهة ب', org: 'جهة ب', status: 'open', starts_on: '2026-09-01', ends_on: null,
      advisor: true, member: true, groups: [], participants: 30, serves: 26 },
    { cohort_id: 'c3', cohort: 'دفعة الفريق وحده', org: null, status: 'planned', starts_on: null, ends_on: null, advisor: false, member: true, groups: [], participants: 12, serves: 0 },
    { cohort_id: 'c0', cohort: 'دفعة مغلقة 2025', org: 'هيئة المثال', status: 'closed', starts_on: '2025-03-01', ends_on: '2025-06-30', advisor: true, member: true, groups: [] },
  ],
};

async function portal(page, d) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: d });
    if (['xp.reviews', 'xp.participants', 'xp.peer-list'].includes(b.action)) return route.fulfill({ json: { success: true, items: [], cohorts: [], pending: 0 } });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.goto(PORTAL);
}

for (const vp of [{ name: 'سطح المكتب', size: { width: 1280, height: 900 } }, { name: '390px', size: { width: 390, height: 844 } }]) {
  test(`«تكليفاتي» في بوابة الخبير (${vp.name}): الجهة والدفعة وما يحمله والمدة والأعداد، والمغلقة لا تُعرض`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await portal(page, dashboard);
    const sec = page.getByRole('region', { name: /تكليفاتي/ });
    await expect(sec).toBeVisible();
    await expect(sec.getByRole('heading')).toContainText('· 3');
    const cards = sec.locator('.xpp-assign');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('هيئة المثال');
    await expect(cards.nth(0)).toContainText('دفعة هيئة المثال 2026 · خبير المجموعة 4');
    await expect(cards.nth(0)).toContainText('1 مارس 2026 إلى 30 يونيو 2026');
    await expect(cards.nth(0)).toContainText('تخدم 7 مشاركين بصفتك مستشارهم · في الدفعة 42 مشاركًا · المجموعة 4: 7');
    await expect(cards.nth(1)).toContainText('المستشار الأساسي للدفعة');
    await expect(cards.nth(1)).toContainText('من 1 سبتمبر 2026');
    await expect(cards.nth(2)).toContainText('دفعة أفراد');
    await expect(cards.nth(2)).toContainText('عضو فريق الدفعة');
    await expect(cards.nth(2)).toContainText('تُرشَّح لمشاركي الدفعة أولًا حين يطلبون خبيرًا');
    await expect(sec).not.toContainText('دفعة مغلقة 2025');
    // من له تكليف ليس «جديدًا»: لا خطوات البداية
    await expect(page.getByText('بداية عملك في الشبكة')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('تعذّر قراءة التكليفات يُقال في بطاقتها ولا يُسقط اللوحة', async ({ page }) => {
  await portal(page, { ...dashboard, assignments: { success: false, message: 'تعذّر قراءة التكليفات الآن، حاول بعد قليل' } });
  await expect(page.getByRole('heading', { name: 'أهلًا أ. خالد ن.' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّر قراءة التكليفات الآن' })).toBeVisible();
});

async function journey(page, advisor) {
  await page.setViewportSize({ width: 390, height: 844 });
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-demo-recording-00000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    return route.fulfill({ json: b.action === 'me' ? { ...r, advisor } : r });
  });
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
}

test('المشارك يرى «مستشارك» باسمه وحده، ولا سطر بلا مستشار', async ({ page }) => {
  await journey(page, { full_name: 'د. سارة العلي' });
  const b = page.getByTestId('my-advisor');
  await expect(b).toHaveText('مستشارك: د. سارة العلي. تصله النماذج التي تسلّمها ويقيّمها.');
  await expect(b).not.toContainText('@');
});

test('بلا مستشار فعلي لا يظهر السطر', async ({ page }) => {
  await journey(page, null);
  await expect(page.getByTestId('my-advisor')).toHaveCount(0);
});
