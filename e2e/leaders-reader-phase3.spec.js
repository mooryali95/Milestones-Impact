// القارئ، المرحلة 3 (تصور «فصل خبراء الرحلة عن لجان المحتوى» §4.4 و§6): «تابع القراءة» تستأنف الباب الأول وقسمه،
// و«Aa» للخط وحجمه ومسافاته وأوضاعه محفوظة لكل قارئ، والبحث بلا تشكيل، والعلامات، ومناطق اللمس 44 بكسل. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.READER_SHOTS;
const PLEDGE = ['أطّلع على الكتاب الأم بصفتي عضوًا في لجنة مراجعته، وما فيه سري لا أنقله ولا أشاركه خارج اللجنة.'];
const id = (n) => `00000000-0000-4000-8000-0000000000${n}`;
const PARA = 'المعلم في هذه المنهجية **نقطة قرار** يقف عندها الفريق ليسأل: هل ما زالت القيمة التي بدأنا من أجلها قائمة، وهل نستمر أم نعدّل المسار أم نتوقف؟ ومن غير هذا السؤال يتحول المعلم إلى تاريخ يمر في الخطة.';
const LONG = ['المدخل', 'إدارة المخاطر', 'الأسئلة الأربعة', 'الخلاصة'].map((t, i) => `## ${t}\n\n${i === 1 ? 'إدارةُ المخاطرِ مسؤوليةُ الفريقِ كلِّه. ' : ''}${PARA}\n\n${PARA}\n\n${PARA}\n\n${PARA}`).join('\n\n');
const chapter = (n, dimension, title, md) => ({ id: id(n), dimension, chapter_key: `k${n}`, sort: 1, title, min_level: 'beginner', md, quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' });
const CHAPTERS = [chapter('a1', 'milestone', 'تمهيد المعالم', LONG), chapter('a2', 'milestone', 'خاتمة المعالم', '## الخلاصة\n\nنص قصير.'), chapter('b1', 'impact', 'تمهيد الأثر', '## المدخل\n\nنص الأثر.')];
const book = (email) => ({
  success: true, version: 'v3.1', generated_at: '2026-11-16T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role: 'لجنة المحتوى', email, write: true, resolve: false, watermark: `د. هند الشمري · ${email}`, seat: ['milestone'] },
  chapters: CHAPTERS, comments: [], counts: { total: 0, byModule: {}, bySection: {} },
});

async function mount(page, who = { email: 'h@x.com' }) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, pledge: PLEDGE, switch_to: [], expert: { full_name: 'د. هند الشمري', email: who.email, roles: [], committees: ['content'], dimensions: ['milestone'], status: 'active' } } });
    if (b.action === 'xp.book') return route.fulfill({ json: book(who.email) });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  await page.addInitScript((t) => { localStorage.setItem('mi_leaders_expert_session', t); if (!sessionStorage.getItem('mb-fresh')) { Object.keys(localStorage).filter((k) => k.startsWith('mi-master-book')).forEach((k) => localStorage.removeItem(k)); sessionStorage.setItem('mb-fresh', '1'); } }, XP_TOKEN);
  await page.goto(PORTAL);
  await expect(page.locator('.mb-shelf')).toBeVisible();
}
const title = (page) => page.locator('.mb-top-t b');

test('«تابع القراءة» في الباب الأول: تظهر بعد فتحه وتعود إلى القسم الذي بلغه القارئ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page);
  // لم يُفتح باب بعد: «افتح الكتاب» لا «تابع القراءة»، ولو حُفظ موضع قديم برقم ترتيب
  await expect(page.getByRole('button', { name: 'افتح الكتاب', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'افتح الكتاب', exact: true }).click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
  // يبلغ القسم الثالث من الباب الأول
  await page.locator('.mb-inside').getByRole('link', { name: /الأسئلة الأربعة/ }).click();
  const sec = page.locator('.mb-sec[data-section="الأسئلة الأربعة"]');
  await expect.poll(() => sec.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(200);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('mi-master-book:'))))?.pos))
    .toEqual({ id: id('a1'), section: 'الأسئلة الأربعة' });
  await page.reload();
  // الباب الأول ترتيبه 0، وكانت العلة أن 0 لا يُعد موضعًا
  await expect(page.getByRole('button', { name: 'تابع القراءة' })).toBeVisible();
  await expect(page.locator('.mb-last')).toContainText('تمهيد المعالم · الأسئلة الأربعة');
  await page.getByRole('button', { name: 'تابع القراءة' }).click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
  await expect.poll(() => sec.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(200);
  expect(await sec.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(0);
});

test('«Aa»: الخط والحجم والمسافات والوضع تُطبَّق فورًا وتُحفظ لهذا القارئ وحده', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await mount(page);
  await page.getByRole('button', { name: 'افتح الكتاب', exact: true }).click();
  const p = page.locator('.mb-txt p').first();
  // القرار 9: نسخ بحجم 18 افتراضيًا
  await expect.poll(() => p.evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px');
  expect(await p.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Noto Naskh Arabic');
  await page.getByRole('button', { name: 'إعدادات القراءة' }).click();
  const dlg = page.getByRole('dialog', { name: 'إعدادات القراءة' });
  await dlg.getByRole('radiogroup', { name: 'حجم الخط' }).getByRole('radio', { name: 'كبير' }).click();
  await dlg.getByRole('radiogroup', { name: 'المسافة بين الأسطر' }).getByRole('radio', { name: 'واسعة' }).click();
  await dlg.getByRole('radiogroup', { name: 'وضع القراءة' }).getByRole('radio', { name: 'ليلي' }).click();
  await expect(dlg.getByRole('radio', { name: 'ليلي' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => p.evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
  expect(await p.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(2.45, 1);
  // الوضع الليلي: خلفية داكنة ومتن فاتح، والعلامة المائية باقية
  const bg = await page.locator('.mb-reader').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(18, 25, 27)');
  await expect(page.locator('.mb-wm')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/reader-aa-night.png` });
  await dlg.getByRole('radiogroup', { name: 'الخط' }).getByRole('radio', { name: 'كوفي' }).click();
  await expect.poll(() => p.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Noto Kufi Arabic');
  await dlg.getByRole('button', { name: 'إغلاق' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'تابع القراءة' }).click();
  await expect.poll(() => p.evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
  await expect(page.locator('.mb-reader')).toHaveClass(/theme-night/);
  await ctx.close();
  // قارئ آخر على الجهاز نفسه: تفضيلاته وموضعه له، فيبدأ بالافتراضي ومن «افتح الكتاب»
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await ctx2.newPage();
  await mount(other, { email: 'z@x.com' });
  await expect(other.getByRole('button', { name: 'افتح الكتاب', exact: true })).toBeVisible();
  await ctx2.close();
});

test('البحث بلا تشكيل ولا همزات، بمقتطف حول ما طابق', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole('button', { name: 'الفهرس' }).click();
  const toc = page.getByRole('navigation', { name: 'فهرس الكتاب الأم' });
  // «اداره المخاطر» بلا همزة وبهاء، والمتن «إدارةُ المخاطرِ» بالحركات
  await toc.getByRole('searchbox').fill('اداره المخاطر');
  const hit = toc.locator('.mb-hit');
  await expect(hit.filter({ hasText: 'إدارة المخاطر' }).first()).toBeVisible();
  await expect(toc.locator('.mb-hit mark').first()).toHaveText(/إدارة(ُ)? المخاطر/);
  await toc.getByRole('searchbox').fill('المُعْلِم');
  await expect(hit.first()).toBeVisible();
  await hit.filter({ hasText: 'الخلاصة' }).first().click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
});

test('العلامات: زر القسم يضعها ويزيلها، وتظهر أعلى الفهرس وتنقل إليها', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole('button', { name: 'افتح الكتاب', exact: true }).click();
  const mark = page.getByRole('button', { name: 'ضع علامة على القسم: الخلاصة' });
  await mark.click();
  await expect(page.getByRole('button', { name: 'أزل العلامة عن القسم: الخلاصة' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^التالي/ }).click();
  await expect(title(page)).toHaveText('خاتمة المعالم');
  await page.getByRole('button', { name: 'الفهرس' }).click();
  const marks = page.getByRole('region', { name: 'علاماتك' }).or(page.locator('section.mb-marks'));
  await expect(marks).toContainText('تمهيد المعالم');
  await marks.getByRole('button', { name: /الخلاصة/ }).first().click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
  await expect.poll(() => page.locator('.mb-sec[data-section="الخلاصة"]').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(400);
  await page.getByRole('button', { name: 'أزل العلامة عن القسم: الخلاصة' }).click();
  await page.getByRole('button', { name: 'الفهرس' }).click();
  await expect(page.locator('section.mb-marks')).toHaveCount(0);
});

test('مناطق اللمس: كل زر ظاهر في القارئ وفهرسه 44 بكسل على الأقل على الهاتف', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole('button', { name: 'افتح الكتاب', exact: true }).click();
  await expect(title(page)).toHaveText('تمهيد المعالم');
  const small = async (scope) => scope.locator('button:visible').evaluateAll((els) => els
    .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; })
    .filter((x) => x.h < 44 || x.w < 44));
  expect(await small(page.locator('.mb-reader'))).toEqual([]);
  if (SHOTS) { await page.locator('.mb-sec[data-section="إدارة المخاطر"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/reader-page-mobile.png` }); }
  await page.getByRole('button', { name: 'الفهرس' }).click();
  expect(await small(page.getByRole('navigation', { name: 'فهرس الكتاب الأم' }))).toEqual([]);
  if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/reader-toc-mobile.png` }); }
});
