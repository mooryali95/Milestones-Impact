import { test, expect } from '@playwright/test';

// قياس الزيارات: ما يُرسَل، ومتى، وكم مرّة.
const HOME = 'http://localhost:4301';
const MATRIX = 'http://localhost:4302';
const VIEWS = /supabase\.co\/rest\/v1\/page_views/;

async function captureViews(page) {
  const sent = [];
  await page.route(VIEWS, (r) => { sent.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 201, body: '' }); });
  await page.route(/supabase\.co\/(rest|functions)\/v1\/(?!page_views)/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  return sent;
}

test('الصفحة الرئيسية ترسل زيارةً واحدة بلا ما يعرّف الشخص', async ({ page }) => {
  const sent = await captureViews(page);
  await page.goto(HOME + '/');
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(800);
  expect(sent.length).toBe(1);
  const v = sent[0];
  expect(v.site).toBe('mi-home');
  expect(v.path).toBe('/');
  expect(Object.keys(v).sort()).toEqual(['device', 'lang', 'path', 'referrer', 'site', 'title', 'visit_id']);
});

test('صفحات البرامج تُقاس أيضاً', async ({ page }) => {
  const sent = await captureViews(page);
  await page.goto(HOME + '/projects/');
  await expect.poll(() => sent.map((v) => v.path)).toEqual(['/projects/']);
});

test('Do Not Track يمنع الإرسال', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
  const sent = await captureViews(page);
  await page.goto(HOME + '/');
  await page.waitForTimeout(1500);
  expect(sent).toEqual([]);
});

test('المصفوفة تعدّ الشاشة الأولى مرّة واحدة لا مرّتين', async ({ page }) => {
  const sent = await captureViews(page);
  await page.goto(MATRIX + '/');
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(1200);
  expect(sent.map((v) => [v.site, v.path])).toEqual([['mi-matrix', '/']]);
});
