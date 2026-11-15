// المساعد الآلي في الموقع (chat.js) على الجوال: الزر تحت درج القائمة، والحقول 16px فلا يكبّر Safari الصفحة،
// والسجل يعلن الإضافات وحدها. الخلفية مُحاكاة: status يقول إن المساعد مفعّل، ولا يُبدأ أي حديث حقيقي.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4301';
const SUPABASE = /eormhcupwgwpllhrfxxg\.supabase\.co/;

async function enabled(page) {
  await page.route(SUPABASE, async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    if (route.request().url().includes('agent-chat') && body.action === 'status') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, enabled: true, site_key: null }) });
    }
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"code":"agent_off"}' });
  });
  await page.route(/challenges\.cloudflare\.com/, (route) => route.abort());
}

test('الجوال: زر المساعد تحت درج القائمة المفتوح، وحقول اللوحة 16px، والسجل يعلن الإضافات وحدها', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enabled(page);
  await page.goto(BASE + '/');
  const launch = page.locator('.mi-chat-launch');
  await expect(launch).toBeVisible();

  // الدرج المفتوح يغطي الزر: النقطة في وسط الزر يملكها الدرج أو غطاؤه
  await page.locator('#burgerBtn').click();
  await expect(page.locator('#burgerBtn')).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(400);
  const box = await launch.boundingBox();
  const owner = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('.mi-chat-launch') ? 'launch' : 'other';
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(owner).toBe('other');
  await page.locator('#drawerCloseBtn').click();

  await launch.click();
  const input = page.locator('.mi-chat__input');
  await expect(input).toBeVisible();
  expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  for (const sel of ['.mi-chat__handoff input[name="email"]', '.mi-chat__handoff textarea']) {
    expect(parseFloat(await page.locator(sel).evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await expect(page.locator('.mi-chat__log')).toHaveAttribute('aria-relevant', 'additions');
});
