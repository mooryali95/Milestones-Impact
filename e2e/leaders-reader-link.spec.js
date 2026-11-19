// رابط لكل باب في قارئ الكتاب الأم (آخر بنود المرحلة 3 من «فصل خبراء الرحلة عن لجان المحتوى»): الرابط يفتح الباب مباشرة
// ويبقى بعد التحديث، ويُنسخ من رأس الباب، والرجوع والتقدم في المتصفح بين الأبواب والرف، وباب لا يُتاح للقارئ لا يُفتح
// (الخادم يعيد ما يُتاح له وحده). في بوابة الخبير (‎#ch=…‎) واللوحة (‎#/leaders/book?ch=…‎). الخلفية مُحاكاة. SHOTS_DIR: لقطات.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const ADMIN = 'http://localhost:4303/';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const id = (n) => `00000000-0000-4000-8000-0000000000${n}`;
const PARA = 'المعلم في هذه المنهجية **نقطة قرار** يقف عندها الفريق ليسأل: هل ما زالت القيمة التي بدأنا من أجلها قائمة؟';
const chapter = (n, dimension, title) => ({ id: id(n), dimension, chapter_key: `k${n}`, sort: 1, title, min_level: 'beginner', md: ['المدخل', 'الخلاصة', 'ما بعدها'].map((t) => `## ${t}\n\n${Array(6).fill(PARA).join('\n\n')}`).join('\n\n'), quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' });
const CHAPTERS = [chapter('a1', 'milestone', 'تمهيد المعالم'), chapter('a2', 'milestone', 'خاتمة المعالم'), chapter('b1', 'impact', 'تمهيد الأثر')];
const book = (kind) => ({
  success: true, version: 'v3.1', generated_at: '2026-11-16T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind, name: 'د. هند الشمري', role: kind === 'admin' ? 'مدير' : 'لجنة المحتوى', email: 'h@x.com', write: true, resolve: false, watermark: 'د. هند الشمري · h@x.com', seat: kind === 'expert' ? ['milestone'] : null },
  chapters: CHAPTERS, comments: [], counts: { total: 0, byModule: {}, bySection: {} },
});
const PLEDGE = ['أطّلع على الكتاب الأم بصفتي عضوًا في لجنة مراجعته.'];

async function portal(page, hash = '', { access = true } = {}) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: { success: true, content_only: true, consent_needed: false, book_access: access, pledge_needed: false, pledge: PLEDGE, switch_to: [], expert: { full_name: 'د. هند الشمري', email: 'h@x.com', roles: [], committees: ['content'], dimensions: ['milestone'], status: 'active' } } });
    if (b.action === 'xp.book') return route.fulfill({ json: book('expert') });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.goto(PORTAL + hash);
}
const title = (page) => page.locator('.mb-top-t b');
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const hashOf = (page) => page.evaluate(() => location.hash);

for (const width of [390, 1440]) {
  test(`الرابط يفتح الباب ويبقى بعد التحديث، ويُنسخ من رأسه، والرجوع والتقدم بين الأبواب والرف (${width})`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4304' });
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await portal(page, '#ch=milestone.ka2');
    await expect(title(page)).toHaveText('خاتمة المعالم');
    // التحديث على الباب نفسه يعود إلى القسم الذي بلغه القارئ فيه
    await page.locator('.mb-inside').getByRole('link', { name: /الخلاصة/ }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('mi-master-book:'))))?.pos?.section)).toBe('الخلاصة');
    await page.reload();
    await expect(title(page)).toHaveText('خاتمة المعالم');
    const sec = page.locator('.mb-sec[data-section="الخلاصة"]');
    await expect.poll(() => sec.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(220);
    // النسخ: الرابط الكامل للباب، ويقول السطر إنه لمن له وصول وحده
    await page.getByRole('button', { name: 'انسخ رابط الباب' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'نُسخ رابط الباب' })).toContainText('يفتحه من له وصول إلى الكتاب وحده');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${PORTAL}#ch=milestone.ka2`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await shot(page, 'reader-link');
    // التالي يكتب الباب الجديد في العنوان، والرجوع يعيد السابق، والتقدم يعيد التالي
    await page.getByRole('navigation', { name: 'التنقل بين الأبواب' }).getByRole('button', { name: /التالي/ }).click();
    await expect(title(page)).toHaveText('تمهيد الأثر');
    expect(await hashOf(page)).toBe('#ch=impact.kb1');
    await page.goBack();
    await expect(title(page)).toHaveText('خاتمة المعالم');
    await page.goForward();
    await expect(title(page)).toHaveText('تمهيد الأثر');
    // الرف بلا باب في العنوان، والرجوع منه إلى الباب
    await page.getByRole('button', { name: 'غلاف الكتاب' }).click();
    await expect(page.locator('.mb-shelf')).toBeVisible();
    expect(await hashOf(page)).toBe('');
    await page.goBack();
    await expect(title(page)).toHaveText('تمهيد الأثر');
    // الفهرس يكتب الباب أيضًا
    await page.getByRole('button', { name: 'الفهرس' }).click();
    await page.getByRole('navigation', { name: 'فهرس الكتاب الأم' }).getByRole('button', { name: /تمهيد المعالم/ }).first().click();
    await expect(title(page)).toHaveText('تمهيد المعالم');
    expect(await hashOf(page)).toBe('#ch=milestone.ka1');
  });
}

test('باب لا يُتاح للقارئ أو لم يعد في الكتاب: الرف بتنبيه، ويُزال من العنوان', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await portal(page, '#ch=leadership.k9');
  await expect(page.locator('.mb-shelf')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('الرابط لباب غير متاح لك، أو لم يعد في الكتاب');
  expect(await hashOf(page)).toBe('');
  await shot(page, 'reader-link-missing');
  // فتح باب بعدها يزيل التنبيه
  await page.getByRole('button', { name: 'افتح الكتاب', exact: true }).click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('خبير بلا وصول إلى الكتاب: الرابط لا يفتح القارئ ولا يطلب الكتاب', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => { if (/leaders-api/.test(r.url())) asked.push(JSON.parse(r.postData() || '{}').action); });
  await page.setViewportSize({ width: 390, height: 844 });
  await portal(page, '#ch=milestone.ka2', { access: false });
  await expect(page.locator('.mb-root')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(asked).not.toContain('xp.book');
});

test('اللوحة: ‎#/leaders/book?ch=…‎ يفتح الباب، والنسخ بالمسار نفسه', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4303' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.book') return route.fulfill({ json: book('admin') });
    return route.fulfill({ json: { success: true, orgs: [], participants: [], programs: [], cohorts: [] } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.goto(`${ADMIN}#/leaders/book?ch=impact.kb1`);
  await page.reload();
  await expect(title(page)).toHaveText('تمهيد الأثر');
  await page.getByRole('button', { name: 'انسخ رابط الباب' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${ADMIN}#/leaders/book?ch=impact.kb1`);
  await page.getByRole('navigation', { name: 'التنقل بين الأبواب' }).getByRole('button', { name: /السابق/ }).click();
  await expect(title(page)).toHaveText('خاتمة المعالم');
  expect(await hashOf(page)).toBe('#/leaders/book?ch=milestone.ka2');
  await page.goBack();
  await expect(title(page)).toHaveText('تمهيد الأثر');
  await shot(page, 'admin-reader-link');
});
