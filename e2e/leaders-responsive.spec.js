// حارس التجاوب: الجوال والآيباد (رأسي وأفقي) والحاسب. لا تمرير أفقي، وأهداف اللمس 44 بكسل على شاشات اللمس،
// وفهرس الكتيب بجانب الباب من الآيباد الرأسي. الخلفية خادم محاكاة الفيديو.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const DEVICES = [
  ['جوال', { width: 390, height: 844 }, true],
  ['آيباد رأسي', { width: 820, height: 1180 }, true],
  ['آيباد أفقي', { width: 1180, height: 820 }, true],
  ['حاسب', { width: 1440, height: 900 }, false],
];

for (const [name, viewport, touch] of DEVICES) {
  test(`${name}: لا تمرير أفقي، وأهداف التنقل تُلمس، وفهرس الكتيب في موضعه`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch && viewport.width < 600, locale: 'ar-SA' });
    const page = await ctx.newPage();
    const srv = createMockServer();
    Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
    await page.route(/functions\/v1\/leaders-api/, async (route) => route.fulfill({ json: srv.reply(JSON.parse(route.request().postData() || '{}')) }));
    await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-demo-recording-000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const navItems = () => page.locator('[data-tour^="nav-"]').filter({ visible: true });

    await page.goto(APP);
    await expect(navItems().first()).toBeVisible();
    expect(await overflow(), 'الرئيسية').toBeLessThanOrEqual(1);
    if (touch) {
      const sizes = await navItems().evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(Math.min(r.height, r.width)); }));
      expect(Math.min(...sizes), `أصغر هدف تنقل: ${sizes}`).toBeGreaterThanOrEqual(44);
      const who = page.locator('.topbar .who');
      if (await who.count()) { const b = await who.first().boundingBox(); expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44); }
    }

    await page.locator('[data-tour="nav-handbook"]').filter({ visible: true }).first().click();
    await expect(page.locator('button.toc-ch').first()).toBeVisible();
    expect(await overflow(), 'الكتيب').toBeLessThanOrEqual(1);
    await page.locator('button.toc-ch').nth(1).click();
    await expect(page.locator('.toc-ch.on')).toHaveCount(1);
    // من 700 بكسل: الفهرس عمود بجانب الباب لا فوقه
    const side = await page.evaluate(() => { const t = document.querySelector('.book-toc').getBoundingClientRect(); const g = document.querySelector('.book-grid').getBoundingClientRect(); return t.width < g.width * 0.6; });
    expect(side, 'الفهرس بجانب الباب').toBe(viewport.width >= 700);
    // رقم الباب المفتوح مقروء على خلفيته (4.5 إلى 1)
    const ratio = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const n = document.querySelector('.toc-ch.on .toc-num'); const a = lum(getComputedStyle(n).color), b = lum(getComputedStyle(n.closest('.toc-ch')).backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await ctx.close();
  });
}

test('بطاقة المبادرة: تلميح التاريخ يُعرض باتجاهه، وبريد الراعي الناقص يُنبَّه عليه عند الكتابة', async ({ page }) => {
  const model = { id: 'm1', key: 'initiative-charter', dimension: 'milestone', title_ar: 'بطاقة المبادرة', points: 20, min_level: 'beginner', capstone_sort: 1,
    fields: [{ key: 'start', type: 'text', label: 'تاريخ البدء', hint: 'بصيغة 2026-03-15', required: true }, { key: 'sponsor_email', type: 'text', label: 'بريد الراعي', required: false }] };
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'models.list') return route.fulfill({ json: { success: true, points: { total: 0, rank: null }, models: [{ ...model, capstone: true, fields_n: 2, progress: { filled: 0, total: 1 }, submission: null }] } });
    if (b.action === 'models.get') return route.fulfill({ json: { success: true, model, submission: null, initiative: null, imports: {}, capstone: { status: 'draft', locked: false } } });
    await route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-demo-recording-000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  await page.locator('[data-tour="nav-handbook"]').filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: /النماذج التعليمية/ }).click();
  await page.getByText('بطاقة المبادرة').first().click();
  const date = page.locator('bdi[dir="ltr"]', { hasText: '2026-03-15' });
  await expect(date).toBeVisible();
  const email = page.getByLabel(/بريد الراعي/);
  await email.fill('sponsor@company');
  await expect(page.getByRole('alert').filter({ hasText: 'هذا البريد غير مكتمل' })).toBeVisible();
  await email.fill('sponsor@company.sa');
  await expect(page.getByRole('alert').filter({ hasText: 'هذا البريد غير مكتمل' })).toHaveCount(0);
});
