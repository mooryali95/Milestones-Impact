// المقعد والتعليق من خارج الإطار (تصور «أجزاء الكتاب وخبير المحتوى»، المرحلة 1، اعتمده المالك 2026-11-16):
// عضو لجنة المحتوى يعرف جزءه في الرف وتُعرض أجزاء مقعده أولًا، ويقرأ الكتاب كله، وتعليقه خارج مقعده يظهر موسومًا
// «خبير من خارج الإطار»، وتصفية «كل التعليقات» تفصل أصحاب الإطار عن غيرهم. وعضو القياس نطاقه الكتاب كاملًا بلا وسم.
// الخلفية مُحاكاة.
import { test, expect, devices } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.BOOKPARTS_SHOTS;
const PLEDGE = ['أطّلع على الكتاب الأم بصفتي عضوًا في لجنة مراجعته، وما فيه سري لا أنقله ولا أشاركه خارج اللجنة.'];
const L = '00000000-0000-4000-8000-0000000000a1';
const I = '00000000-0000-4000-8000-0000000000b1';
const M = '00000000-0000-4000-8000-0000000000c1';
const chapter = (id, dimension, chapter_key, title) => ({ id, dimension, chapter_key, sort: 1, title, min_level: 'beginner', md: '## المدخل\n\nنص الباب.', quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' });
const cm = (id, module_id, extra) => ({ id, module_id, section: 'المدخل', quote: '', body: 'ملاحظة على القسم', deleted: false, author_kind: 'expert', status: 'open', created_at: '2026-11-16T08:00:00Z', replies: [], out_of_seat: false, ...extra });
const COMMENTS = [
  cm('c1', I, { author_ref: 'x1', author_name: 'د. هند الشمري', author_role: 'لجنة المحتوى', body: 'المثال الثاني يحتاج رقمًا', out_of_seat: true }),
  cm('c2', L, { author_ref: 'x1', author_name: 'د. هند الشمري', author_role: 'لجنة المحتوى', body: 'العنوان أوضح بصيغة الفعل' }),
  cm('c3', I, { author_kind: 'admin', author_ref: 'a@x.com', author_name: 'الإدارة', author_role: 'الإدارة', body: 'ملاحظة الإدارة' }),
];
const book = (seat, role) => ({
  success: true, version: 'v3.1', generated_at: '2026-11-16T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role, write: true, resolve: false, watermark: 'د. هند الشمري · h@x.com', seat },
  chapters: [chapter(M, 'milestone', 'm1', 'دورة حياة المشروع'), chapter(I, 'impact', 'i1', 'من المخرج إلى الأثر'), chapter(L, 'leadership', 'l1', 'القائد الذي يمكّن')],
  comments: COMMENTS, counts: { total: 3, byModule: { [I]: 2, [L]: 1 }, bySection: { [`${I}|المدخل`]: 2, [`${L}|المدخل`]: 1 } },
});

async function mount(page, { seat = ['leadership'], committees = ['content'], role = 'لجنة المحتوى' } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'xp.dashboard') return route.fulfill({ json: { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, pledge: PLEDGE, switch_to: [], expert: { full_name: 'د. هند الشمري', email: 'h@x.com', roles: [], committees, dimensions: Array.isArray(seat) ? seat : [], status: 'active' } } });
    if (b.action === 'xp.book') return route.fulfill({ json: book(seat, role) });
    if (b.action === 'xp.book-comment') return route.fulfill({ json: { success: true, id: 'new' } });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  await page.addInitScript((t) => { localStorage.setItem('mi_leaders_expert_session', t); localStorage.removeItem('mi-master-book'); }, XP_TOKEN);
  await page.goto(PORTAL);
  // الكتاب يُفتح على رفه، وفيه سطر المقعد
  await expect(page.getByText('تقرأ بصفتك:')).toBeVisible();
  await expect(page.locator('.mb-shelf')).toBeVisible();
  return calls;
}

test('عضو المحتوى: سطر مقعده في الرف، وجزؤه أولًا، والجزآن الآخران عليهما «خارج إطارك» ويُقرآن كاملين', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page);
  await expect(page.locator('.mb-seat')).toHaveText('مقعدك: الجزء الثالث · تمكين القائد');
  const vols = page.locator('.mb-vol');
  await expect(vols).toHaveCount(3);
  await expect(vols.nth(0)).toContainText('تمكين القائد');
  await expect(vols.nth(0).locator('.mb-vol-away')).toHaveCount(0);
  for (const k of [1, 2]) await expect(vols.nth(k).locator('.mb-vol-away')).toHaveText('خارج إطارك');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seat-shelf-desktop.png`, fullPage: true });
  // الجزء خارج المقعد يُقرأ: يفتح بابه كاملًا
  await vols.nth(1).click();
  await expect(page.locator('.mb-top-t b')).toHaveText('دورة حياة المشروع');
  await expect(page.getByText('نص الباب.')).toBeVisible();
});

test('التعليق من خارج الإطار: شارته في السلسلة وفي «كل التعليقات»، والتصفية تفصل أصحاب الإطار عن غيرهم', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page);
  await page.getByRole('button', { name: /^التعليقات/ }).click();
  const sheet = page.getByRole('dialog', { name: 'كل التعليقات' });
  const rows = sheet.locator('.mb-cm-link');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'المثال الثاني يحتاج رقمًا' }).locator('.mb-outseat')).toHaveText('خبير من خارج الإطار');
  await expect(sheet.locator('.mb-outseat')).toHaveCount(1);
  const filter = sheet.getByLabel('صلة المعلّق بالإطار');
  await expect(filter.locator('option')).toHaveText(['الكل', 'من أصحاب الإطار', 'من خارج الإطار']);
  await filter.selectOption({ label: 'من خارج الإطار' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('المثال الثاني يحتاج رقمًا');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seat-filter-out-desktop.png` });
  // أصحاب الإطار: تعليق الخبير في مقعده وحده، فتعليق الإدارة لا هذا ولا ذاك
  await filter.selectOption({ label: 'من أصحاب الإطار' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('العنوان أوضح بصيغة الفعل');
  await filter.selectOption({ label: 'الكل' });
  await expect(rows).toHaveCount(3);
  // من القائمة إلى السلسلة: الشارة بجانب الصفة
  await rows.filter({ hasText: 'المثال الثاني يحتاج رقمًا' }).click();
  const thread = page.getByRole('dialog', { name: 'التعليقات' });
  await expect(thread.locator('.mb-cm').filter({ hasText: 'المثال الثاني يحتاج رقمًا' }).locator('.mb-cm-who .mb-outseat')).toHaveText('خبير من خارج الإطار');
  await expect(thread.locator('.mb-cm').filter({ hasText: 'ملاحظة الإدارة' }).locator('.mb-outseat')).toHaveCount(0);
});

test('في القارئ: سطر هادئ فوق صندوق التعليق في باب خارج المقعد وحده، والتعليق يُرسل كما هو (الخادم يسِمه)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mount(page);
  await page.locator('.mb-vol').filter({ hasText: 'تحويل المشروع إلى أثر' }).click();
  await page.getByRole('button', { name: 'تعليقات القسم: المدخل' }).click();
  const note = page.locator('.mb-seat-note');
  await expect(note).toHaveText('تعليقك هنا يظهر موسومًا: خبير من خارج الإطار');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seat-compose-note-desktop.png` });
  await page.locator('.mb-compose textarea').fill('ملاحظة من خارج الإطار');
  await page.getByRole('button', { name: 'أضف التعليق' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'xp.book-comment').length).toBe(1);
  const sent = calls.find((c) => c.action === 'xp.book-comment');
  expect(sent.module_id).toBe(I);
  expect('out_of_seat' in sent).toBe(false);
  await page.getByRole('button', { name: 'إغلاق' }).click();
  // باب في المقعد: لا سطر
  await page.getByRole('button', { name: 'غلاف الكتاب' }).click();
  await page.locator('.mb-vol').filter({ hasText: 'تمكين القائد' }).click();
  await page.getByRole('button', { name: 'تعليقات القسم: المدخل' }).click();
  await expect(page.locator('.mb-compose textarea')).toBeVisible();
  await expect(note).toHaveCount(0);
});

test('عضو القياس: «نطاقك: الكتاب كاملًا» بلا «خارج إطارك» ولا سطر الوسم، والأجزاء بترتيبها الثابت', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, { seat: 'all', committees: ['measurement'], role: 'لجنة القياس' });
  await expect(page.locator('.mb-seat')).toHaveText('نطاقك: الكتاب كاملًا');
  await expect(page.locator('.mb-vol-away')).toHaveCount(0);
  await expect(page.locator('.mb-vol').first()).toContainText('إدارة المشروعات');
  await page.locator('.mb-vol').filter({ hasText: 'تحويل المشروع إلى أثر' }).click();
  await page.getByRole('button', { name: 'تعليقات القسم: المدخل' }).click();
  await expect(page.locator('.mb-compose textarea')).toBeVisible();
  await expect(page.locator('.mb-seat-note')).toHaveCount(0);
});

test('على الهاتف: سطر المقعد وعلامة «خارج إطارك» والشارة والسطر الهادئ مقروءة بلا تمرير أفقي', async ({ browser }) => {
  const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iphone, locale: 'ar-SA' });
  const page = await ctx.newPage();
  await mount(page);
  await expect(page.locator('.mb-seat')).toBeVisible();
  await expect(page.locator('.mb-vol-away').first()).toBeVisible();
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(await wide()).toBe(false);
  if (SHOTS) {
    await page.locator('.mb-vols').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/seat-shelf-iphone13.png`, fullPage: true });
  }
  await page.locator('.mb-vol').filter({ hasText: 'تحويل المشروع إلى أثر' }).click();
  await page.getByRole('button', { name: 'تعليقات القسم: المدخل' }).click();
  await expect(page.locator('.mb-seat-note')).toBeVisible();
  await expect(page.locator('.mb-cm-who .mb-outseat')).toBeVisible();
  expect(await wide()).toBe(false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seat-thread-iphone13.png` });
  await page.getByRole('button', { name: 'إغلاق' }).click();
  await page.getByRole('button', { name: 'كل التعليقات' }).click();
  await page.getByLabel('صلة المعلّق بالإطار').selectOption({ label: 'من خارج الإطار' });
  await expect(page.locator('.mb-cm-link')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/seat-filter-out-iphone13.png` });
  await ctx.close();
});
