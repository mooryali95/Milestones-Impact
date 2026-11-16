// «انضم كخبير محتوى» (تصور أجزاء الكتاب وخبير المحتوى، المرحلة 3، اعتمده المالك 2026-11-16): /expert تبدأ ببطاقتي المسار،
// ونموذج خبير المحتوى مختصر بلا حقول الرحلة ويرسل track: content، واللوحة تسم الطلب «طلب عضوية لجنة» بلجنته وإطاره.
// الخلفية مُحاكاة.
import { test, expect, devices } from '@playwright/test';

const APP = 'http://localhost:4304';
const SHOT = process.env.SHOT_DIR;
const TURNSTILE = `window.turnstile = { render(el, o) { el.textContent = 'تحقق'; setTimeout(() => o.callback('tok-human-0123456789'), 50); return 'w1'; }, remove() {} };`;
const BIO = 'خبرة اثني عشر عامًا في تأليف المحتوى المهني وتصميم برامج التعلم للقادة، وتحكيم الأطر المعرفية في الجهات الحكومية.';

async function mock(page) {
  const applies = [];
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'expert.apply') return route.fulfill({ json: { success: false } });
    applies.push(b);
    await route.fulfill({ json: b.captcha ? { success: true, received: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
  });
  return applies;
}
const noScrollX = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('البطاقتان، ثم نموذج المحتوى بلا حقول الرحلة، والإطار شرط للجنة المحتوى، والإرسال بـ track: content', async ({ page }) => {
  const applies = await mock(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${APP}/expert`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('انضم إلى خبراء برنامج القادة');
  const journey = page.getByRole('button', { name: /خبير رحلة/ });
  const content = page.getByRole('button', { name: /خبير محتوى/ });
  await expect(journey).toContainText('يرافق القادة كوتشًا ومستشارًا ومقيّمًا.');
  await expect(content).toContainText('يراجع الكتاب الأم ومحتوى البرنامج ضمن لجنة المحتوى أو لجنة القياس.');
  if (SHOT) await page.screenshot({ path: `${SHOT}/apply-tracks-desktop.png`, fullPage: true });

  await content.click();
  await expect(page).toHaveURL(/\/expert\?track=content$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('انضم كخبير محتوى');
  for (const t of ['لماذا تنضم', 'ماذا تراجع، وكم يأخذ من وقتك', 'كيف يُنسب تعليقك', 'السرية']) await expect(page.locator('.xp-why dt', { hasText: t })).toBeVisible();
  await expect(page.locator('.xp-why')).toContainText('خبير من خارج الإطار');
  await expect(page.locator('.xp-why')).toContainText('علامة مائية باسمك وبريدك');
  // لا أدوار ولا مستويات ولا ساعات ولا قطاعات
  for (const l of ['كيف تحب أن تخدم؟ *', 'مستويات القادة التي تناسبك', 'الساعات المتاحة أسبوعيًا', 'القطاعات التي عملت فيها']) await expect(page.getByText(l, { exact: true })).toHaveCount(0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/apply-content-desktop.png`, fullPage: true });

  await page.getByLabel('الاسم الكامل *').fill('هند المراجعة');
  await page.getByLabel('البريد الإلكتروني *').fill('hind@example.sa');
  await page.getByLabel('المسمى المهني').fill('مصممة تعلم');
  await page.getByLabel('خبرتك في المحتوى *').fill(BIO);
  await page.getByLabel('رابط لأعمالك أو سيرتك').fill('https://example.com/cv');
  // بلا لجنة: تنبيه قبل الإرسال
  await page.getByRole('button', { name: 'أرسل طلب العضوية' }).click();
  await expect(page.getByRole('alert')).toHaveText('اختر اللجنة التي تطلب عضويتها');
  // لجنة المحتوى بلا إطار: الإطار شرط
  await page.locator('.xp-opt', { hasText: 'لجنة المحتوى' }).click();
  await expect(page.getByText('الإطار الذي تراجعه *', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'أرسل طلب العضوية' }).click();
  await expect(page.getByRole('alert')).toHaveText('اختر الإطار الذي تراجعه في لجنة المحتوى');
  expect(applies).toEqual([]);
  await page.locator('.xp-opt', { hasText: 'تمكين القائد' }).click();
  await page.getByRole('button', { name: 'أرسل طلب العضوية' }).click();
  await expect(page.getByRole('heading', { name: 'وصل طلب عضويتك' })).toBeVisible();
  expect(applies.map((b) => b.captcha || null)).toEqual([null, 'tok-human-0123456789']);
  const sent = applies[1];
  expect(sent).toMatchObject({ track: 'content', full_name: 'هند المراجعة', email: 'hind@example.sa', title: 'مصممة تعلم', committees: ['content'], dimensions: ['leadership'], bio: BIO, work_url: 'https://example.com/cv' });
  for (const k of ['roles', 'levels', 'sectors', 'weekly_hours']) expect(k in sent, k).toBe(false);
});

test('لجنة القياس وحدها بلا إطار تُرسل، والرجوع من المتصفح يعيد إلى البطاقتين، والرابط المباشر يفتح المسار', async ({ page }) => {
  const applies = await mock(page);
  await page.goto(`${APP}/expert?track=content`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('انضم كخبير محتوى');
  await page.getByLabel('الاسم الكامل *').fill('عبدالله القياس');
  await page.getByLabel('البريد الإلكتروني *').fill('m@example.sa');
  await page.locator('.xp-opt', { hasText: 'لجنة القياس' }).click();
  await expect(page.getByText('الإطار الذي تراجعه', { exact: true })).toBeVisible();
  await page.getByLabel('خبرتك في المحتوى *').fill(BIO);
  await page.getByRole('button', { name: 'أرسل طلب العضوية' }).click();
  await expect(page.getByRole('heading', { name: 'وصل طلب عضويتك' })).toBeVisible();
  expect(applies[1]).toMatchObject({ track: 'content', committees: ['measurement'], dimensions: [] });

  await page.goto(`${APP}/expert`);
  await page.getByRole('button', { name: /خبير محتوى/ }).click();
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/expert`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('انضم إلى خبراء برنامج القادة');
  await page.getByRole('button', { name: /خبير رحلة/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('انضم إلى شبكة خبراء برنامج القادة');
  await page.getByRole('button', { name: 'المساران' }).click();
  await expect(page.getByRole('button', { name: /خبير محتوى/ })).toBeVisible();
});

test.describe('iPhone 13', () => {
  const { defaultBrowserType, ...iphone } = devices['iPhone 13']; // eslint-disable-line no-unused-vars
  test.use(iphone);
  test('البطاقتان ونموذج المحتوى بلا تمرير أفقي', async ({ page }) => {
    await mock(page);
    await page.goto(`${APP}/expert`);
    await expect(page.getByRole('button', { name: /خبير محتوى/ })).toBeVisible();
    expect(await noScrollX(page)).toBe(true);
    if (SHOT) await page.screenshot({ path: `${SHOT}/apply-tracks-iphone13.png`, fullPage: true });
    await page.getByRole('button', { name: /خبير محتوى/ }).click();
    await page.locator('.xp-opt', { hasText: 'لجنة المحتوى' }).click();
    await expect(page.getByText('الإطار الذي تراجعه *', { exact: true })).toBeVisible();
    expect(await noScrollX(page)).toBe(true);
    if (SHOT) await page.screenshot({ path: `${SHOT}/apply-content-iphone13.png`, fullPage: true });
  });
});

// اللوحة: الطلب موسوم «طلب عضوية لجنة» بلجنته وإطاره، في القائمة وفي الملف
const APP_ROW = { id: 'c1', full_name: 'هند المراجعة', email: 'hind@example.sa', title: 'مصممة تعلم', roles: [], committees: ['content'], dimensions: ['leadership'], levels: [], sectors: [], languages: ['ar'], weekly_hours: null, status: 'applied', source: 'application', created_at: '2026-11-16', updated_at: '2026-11-16' };
const COACH = { id: 'e1', full_name: 'خالد العتيبي', email: 'k@x.com', title: 'مدرب قيادة', roles: ['mentor'], committees: [], dimensions: ['leadership'], levels: ['beginner'], sectors: [], languages: ['ar'], weekly_hours: 4, status: 'applied', source: 'application', created_at: '2026-10-28', updated_at: '2026-10-28' };
async function adminPanel(page) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.experts': { success: true, experts: [APP_ROW, COACH], committees: [] },
      'admin.expert': { success: true, expert: [APP_ROW, COACH].find((e) => e.id === b.id), activity: [{ action: 'expert.apply', actor: 'hind@example.sa', created_at: '2026-11-16' }], assignments: [],
        service: { sessions: 0, attended: 0, no_show: 0, upcoming: 0, participants: 0, hours: 0, cost: 0, reviews: { requirements: 0, models: 0, capstones: 0 }, recent: [] }, ratings: { summary: { count: 0 }, criteria: {}, comments: [], given: 0 } },
      'admin.expert-requests': { success: true, requests: [] },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الخبراء' }).click();
}
test('اللوحة: «طلب عضوية لجنة» بلجنته وإطاره في القائمة والملف، وخبير الرحلة بلا وسم', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await adminPanel(page);
  const row = page.locator('tr', { hasText: 'هند المراجعة' });
  await expect(row.locator('.la-chip', { hasText: 'طلب عضوية لجنة' })).toBeVisible();
  await expect(row).toContainText('لجنة المحتوى · إطار تمكين القائد');
  await expect(page.locator('tr', { hasText: 'خالد العتيبي' }).locator('.la-chip', { hasText: 'طلب عضوية لجنة' })).toHaveCount(0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-committee-request-desktop.png`, fullPage: true });
  await row.click();
  await expect(page.locator('.ex-app')).toContainText('طلب عضوية لجنة');
  await expect(page.locator('.ex-app')).toContainText('لجنة المحتوى · إطار تمكين القائد');
  await expect(page.getByRole('button', { name: 'اعتماد' })).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/admin-committee-profile-desktop.png`, fullPage: false });
});
