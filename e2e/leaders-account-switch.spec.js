// تبديل الحساب بين لوحتي الجهة والخبير (2026-11-11، بعد لقطتي جوال من المالك): كانت قائمة «بدّل إلى» تُقص داخل البطاقة
// الداكنة (.hero overflow: hidden) وتتمدد نحو حافة الشاشة، وكانت زخرفة البطاقة تغطي «خبير ⇄» و«خروج» فلا يستجيبان.
// الآن: لوح من أسفل الشاشة على الجوال، وقائمة في جسم الصفحة على الحاسوب، وكل خيار ظاهر كاملًا ويستجيب. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304';
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

const dashboard = { success: true, org: { name: 'سفراء', seats: 50 }, permissions: { list: true, scores: false, activity: false },
  funnel: { registered: 2, approved: 0, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: {},
  kpis: { total: 2, joined_week: 2, active_week: 2, approved: 0, completed: 0, avg_progress: 5, seats: 50, seats_used: 2, seats_waiting: 0 },
  participants: [], impact: { counts: { paired: 0, baseline: 0, post: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [] };
const xpPreload = { reviews: { success: true, advisor: false, items: [] }, participants: { success: true, items: [], cohorts: [] },
  peers: { success: true, advisor: false, cohorts: [], items: [], pending: 0 }, sus: { success: true, ready: true, due: false, answered: false } };
const xp = { success: true, expert: { full_name: 'م يحيى بن حسن الحميري', title: 'مستشار', roles: ['advisor', 'coach'], bio: 'خبرة', weekly_hours: 4, dimensions: ['impact'], levels: ['beginner'] },
  stats: { hours: 0, participants: 0, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [],
  switch_to: ['org', 'participant'], preload: xpPreload };

async function mount(page, portal) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'coord.me') return route.fulfill({ json: { success: true, coordinator: { full_name: 'م. يحيى الحميري', email: 'c@x.sa' }, org: { name: 'سفراء' },
      switch_to: ['expert', 'participant'], consent_needed: false, preload: { dashboard, sus: { success: true, due: false } } } });
    if (b.action === 'xp.dashboard') return route.fulfill({ json: xp });
    const alone = { 'xp.reviews': xpPreload.reviews, 'xp.participants': xpPreload.participants, 'xp.peer-list': xpPreload.peers, 'xp.sus-state': xpPreload.sus }[b.action];
    if (alone) return route.fulfill({ json: alone });
    if (b.action === 'coord.switch' || b.action === 'xp.switch') return route.fulfill({ json: { success: true, token: 's'.repeat(40) } });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((key) => localStorage.setItem(key, 'c'.repeat(40)), portal === '/org' ? 'mi_leaders_coord_session' : 'mi_leaders_expert_session');
  await page.goto(APP + portal);
  return calls;
}

// كل خيار ظاهر كاملًا داخل الشاشة، وهو أعلى ما في الصفحة عند مركزه وطرفيه (لا يقصه شيء ولا يغطيه)
async function fullyUsable(page, locator) {
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  for (const item of await locator.all()) {
    const r = await item.boundingBox();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(vw);
    expect(r.y + r.height).toBeLessThanOrEqual(vh);
    const top = await page.evaluate(({ pts }) => pts.every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-door]')),
      { pts: [[r.x + 4, r.y + r.height / 2], [r.x + r.width / 2, r.y + r.height / 2], [r.x + r.width - 4, r.y + r.height / 2]] });
    expect(top, await item.innerText()).toBe(true);
  }
}

for (const [portal, here, target, action] of [['/org', 'منسق جهة', 'لوحة الخبير', 'coord.switch'], ['/x', 'خبير', 'لوحة الجهة', 'xp.switch']]) {
  test.describe(`${portal} على الجوال`, () => {
    test.use(PHONE);
    test(`«${here} ⇄» يفتح لوحًا من أسفل الشاشة بخيارات كاملة، ويبدّل`, async ({ page }) => {
      const calls = await mount(page, portal);
      await page.getByRole('button', { name: new RegExp(here) }).click();
      const sheet = page.getByRole('dialog', { name: 'بدّل الحساب' });
      await expect(sheet).toBeVisible();
      // بعد حركة الصعود: بعرض الشاشة، ومستقر على حافتها السفلى
      await expect.poll(async () => { const r = await sheet.boundingBox(); return [Math.round(r.width), Math.round(r.y + r.height)]; }).toEqual([390, 844]);
      await expect(sheet.getByText(`أنت الآن في حساب ${here}`)).toBeVisible();
      const options = sheet.locator('[data-door]');
      await expect(options).toHaveCount(2);
      for (const o of await options.all()) expect((await o.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await fullyUsable(page, options);
      // «إلغاء» يغلق ويعيد التركيز إلى الزر
      await sheet.getByRole('button', { name: 'إلغاء' }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByRole('button', { name: new RegExp(here) })).toBeFocused();
      // ثم التبديل فعلًا
      await page.getByRole('button', { name: new RegExp(here) }).click();
      await page.getByRole('dialog').getByRole('button', { name: target }).click();
      await expect.poll(() => calls.filter((c) => c.action === action).map((c) => c.to)).toEqual([portal === '/org' ? 'expert' : 'org']);
      await expect(page).toHaveURL(new RegExp(`${portal === '/org' ? '/x' : '/org'}$`));
    });
  });

  test.describe(`${portal} على الحاسوب`, () => {
    test.use(DESKTOP);
    test(`«${here} ⇄» يفتح قائمة غير مقصوصة، بالأسهم وEscape`, async ({ page }) => {
      await mount(page, portal);
      const btn = page.getByRole('button', { name: new RegExp(here) });
      await btn.click();   // كان يفشل في لوحة الخبير: زخرفة البطاقة تلتقط النقر
      const menu = page.getByRole('menu', { name: 'بدّل إلى' });
      await expect(menu).toBeVisible();
      await fullyUsable(page, menu.getByRole('menuitem'));
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(btn).toBeFocused();
    });
  });
}

test('زخرفة البطاقة الداكنة لا تلتقط اللمس: «خروج» في لوحة الخبير يستجيب على الجوال والحاسوب', async ({ page }) => {
  for (const vp of [PHONE.viewport, DESKTOP.viewport]) {
    await page.setViewportSize(vp);
    await mount(page, '/x');
    const out = page.locator('.xpp-head-acts').getByRole('button', { name: 'خروج' });
    const r = await out.boundingBox();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent, { x: r.x + r.width / 2, y: r.y + r.height / 2 })).toBe('خروج');
  }
});
