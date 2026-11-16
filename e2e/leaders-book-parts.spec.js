// القراءة بالجزء وتحميله (تصور «أجزاء الكتاب وخبير المحتوى»، المرحلة 2، اعتمده المالك 2026-11-16):
// مفتاح «الجزء وحده» أو «الكتاب كاملًا» في شريط القارئ يقصر الفهرس والتقليب على الجزء الحالي ويُحفظ مع موضع القراءة،
// وزر «نسخة PDF» يفتح اختيار الكتاب كاملًا أو جزء واحد (جزء مقعد العضو أولًا)، والجزء يخرج كتابًا مكتملًا:
// غلافه، ثم «عن هذا الجزء»، ثم فهرسه وأبوابه، ثم «يتكامل مع»، ثم الغلاف الخلفي. الخلفية مُحاكاة.
import { test, expect, devices } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.BOOKPARTS_SHOTS;
const PLEDGE = ['أطّلع على الكتاب الأم بصفتي عضوًا في لجنة مراجعته، وما فيه سري لا أنقله ولا أشاركه خارج اللجنة.'];
const id = (n) => `00000000-0000-4000-8000-0000000000${n}`;
const MD = '## المدخل\n\nنص الباب.\n\n:::min=intermediate\n## للمتوسط\n\nفقرة لا يراها المستوى التأسيسي.\n:::\n\n> الفكرة المحورية للباب.';
const chapter = (n, dimension, chapter_key, title, sort) => ({ id: id(n), dimension, chapter_key, sort, title, min_level: 'beginner', md: MD, quiz_md: '', reflection: 'ما الذي تغيّر في عملك؟', updated_at: '2026-11-10T00:00:00Z' });
const CHAPTERS = [
  chapter('a1', 'milestone', 'intro', 'تمهيد المعالم', 1), chapter('a2', 'milestone', 'close', 'خاتمة المعالم', 2),
  chapter('b1', 'impact', 'intro', 'تمهيد الأثر', 1), chapter('b2', 'impact', 'close', 'خاتمة الأثر', 2),
  chapter('c1', 'leadership', 'intro', 'تمهيد القيادة', 1), chapter('c2', 'leadership', 'close', 'خاتمة القيادة', 2),
];
const book = () => ({
  success: true, version: 'v3.1', generated_at: '2026-11-16T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role: 'لجنة المحتوى', email: 'h@x.com', write: true, resolve: false, watermark: 'د. هند الشمري · h@x.com', seat: ['leadership'] },
  chapters: CHAPTERS, comments: [], counts: { total: 0, byModule: {}, bySection: {} },
});

async function mount(page) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, pledge: PLEDGE, switch_to: [], expert: { full_name: 'د. هند الشمري', email: 'h@x.com', roles: [], committees: ['content'], dimensions: ['leadership'], status: 'active' } } });
    if (b.action === 'xp.book') return route.fulfill({ json: book() });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  // موضع القراءة يُمسح في أول تحميل وحده، فتبقى إعادة التحميل على ما حُفظ
  await page.addInitScript((t) => { localStorage.setItem('mi_leaders_expert_session', t); if (!sessionStorage.getItem('mb-fresh')) { Object.keys(localStorage).filter((k) => k.startsWith('mi-master-book')).forEach((k) => localStorage.removeItem(k)); sessionStorage.setItem('mb-fresh', '1'); } }, XP_TOKEN);
  await page.goto(PORTAL);
  await expect(page.locator('.mb-shelf')).toBeVisible();
}

const scopeBtn = (page, name) => page.getByRole('radiogroup', { name: 'نطاق القراءة' }).getByRole('radio', { name });

test('«الجزء وحده»: الفهرس والتقليب يقتصران على الجزء الحالي، والوضع يُحفظ مع موضع القراءة', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page);
  await page.locator('.mb-vol').filter({ hasText: 'تحويل المشروع إلى أثر' }).click();
  await expect(page.locator('.mb-top-t b')).toHaveText('تمهيد الأثر');
  // الافتراضي الكتاب كاملًا: التالي يعبر إلى الجزء التالي
  await expect(scopeBtn(page, 'الكتاب كاملًا')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^التالي/ }).click();
  await expect(page.locator('.mb-top-t b')).toHaveText('خاتمة الأثر');
  await expect(page.getByRole('button', { name: /^التالي/ })).toContainText('تمهيد القيادة');
  // الجزء وحده: التقليب يقف عند آخر الجزء وأوله
  await scopeBtn(page, 'الجزء وحده').click();
  await expect(scopeBtn(page, 'الجزء وحده')).toHaveAttribute('aria-checked', 'true');
  const next = page.getByRole('button', { name: /^التالي/ });
  await expect(next).toBeDisabled();
  await expect(next).toContainText('آخر الجزء');
  await expect(page.locator('.mb-colophon')).toContainText('الباب 2 من 2 في هذا الجزء');
  await page.getByRole('button', { name: /^السابق/ }).click();
  await expect(page.locator('.mb-top-t b')).toHaveText('تمهيد الأثر');
  await expect(page.getByRole('button', { name: /^السابق/ })).toBeDisabled();
  // الفهرس: الجزء وحده، والبحث فيه وحده
  await page.getByRole('button', { name: 'الفهرس' }).click();
  const toc = page.getByRole('navigation', { name: 'فهرس الكتاب الأم' });
  await expect(toc.locator('.mb-sheet-h b')).toHaveText('فهرس الجزء');
  await expect(toc.locator('.mb-toc-part')).toHaveCount(1);
  await expect(toc.locator('.mb-toc-ch')).toHaveText([/تمهيد الأثر/, /خاتمة الأثر/]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/parts-toc-desktop.png` });
  await toc.getByRole('searchbox').fill('نص الباب');
  await expect(toc.locator('.mb-hit')).toHaveCount(2);
  await expect(toc.locator('.mb-hit').filter({ hasText: 'المعالم' })).toHaveCount(0);
  await toc.getByRole('button', { name: 'إغلاق' }).click();
  // يُحفظ مع موضع القراءة: بعد إعادة التحميل يعود القارئ إلى الجزء وحده والباب نفسه
  // مفتاح لكل قارئ (المرحلة 3 من القارئ)، والموضع معرّف الباب لا رقم ترتيبه
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('mi-master-book:')))));
  expect(saved).toMatchObject({ pos: { id: id('b1') }, level: 'all', scope: 'part' });
  await page.reload();
  await page.getByRole('button', { name: 'تابع القراءة' }).click();
  await expect(page.locator('.mb-top-t b')).toHaveText('تمهيد الأثر');
  await expect(scopeBtn(page, 'الجزء وحده')).toHaveAttribute('aria-checked', 'true');
  // العودة إلى الكتاب كاملًا: الفهرس بأجزائه الثلاثة
  await scopeBtn(page, 'الكتاب كاملًا').click();
  await page.getByRole('button', { name: 'الفهرس' }).click();
  await expect(page.locator('.mb-toc-part')).toHaveCount(3);
});

test('«نسخة PDF»: الكتاب كاملًا أو جزء، وجزء المقعد أولًا، والجزء كتاب مكتمل ببدايته ونهايته', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page);
  await page.getByRole('button', { name: 'نسخة PDF' }).click();
  const sheet = page.getByRole('dialog', { name: 'نسخة PDF' });
  const opts = sheet.locator('.mb-pdf button');
  await expect(opts).toHaveCount(4);
  await expect(opts.nth(0)).toContainText('الكتاب كاملًا');
  await expect(opts.nth(1)).toContainText('تمكين القائد');
  await expect(opts.nth(1)).toContainText('مقعدك');
  await expect(opts.nth(2)).toContainText('إدارة المشروعات');
  await expect(opts.nth(3)).toContainText('تحويل المشروع إلى أثر');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/parts-pdf-choice-desktop.png` });
  const [win] = await Promise.all([page.waitForEvent('popup'), opts.nth(3).click()]);
  await expect(sheet).toHaveCount(0);
  await expect(win.locator('.bk-part')).toHaveText('الجزء الثاني من ثلاثة · تحويل المشروع إلى أثر');
  const heads = await win.locator('main > section, main > article').evaluateAll((els) => els.map((e) => e.className));
  expect(heads).toEqual(['full', 'pt-about', 'toc', 'full part', 'ch', 'ch', 'pt-bridges', 'full back']);
  await expect(win.locator('.toc .toc-ch')).toHaveText([/تمهيد الأثر/, /خاتمة الأثر/]);
  await expect(win.getByText('تمهيد المعالم')).toHaveCount(0);
  await expect(win.getByText('خاتمة القيادة')).toHaveCount(0);
  await expect(win.locator('.pt-about .fw-n.on')).toContainText('II');
  await expect(win.locator('.pt-about .legend')).toContainText('◆ للمتوسط فأعلى');
  await expect(win.locator('.pt-bridges .key')).toContainText('ماذا تقرأ بعد هذا الجزء');
  await expect(win.locator('.full.back')).toContainText('مرخصة لـ د. هند الشمري · h@x.com');
  await expect(win.locator('.full.back')).toContainText('MASTER v3.1');
  if (SHOTS) {
    await win.setViewportSize({ width: 1280, height: 900 });
    await win.screenshot({ path: `${SHOTS}/parts-edition-desktop.png`, fullPage: true });
  }
  await win.close();
  // الكتاب كاملًا: الأجزاء الثلاثة ثم الختام ثم الغلاف الخلفي نفسه
  await page.getByRole('button', { name: 'نسخة PDF' }).click();
  const [full] = await Promise.all([page.waitForEvent('popup'), page.getByRole('dialog', { name: 'نسخة PDF' }).locator('.mb-pdf button').first().click()]);
  await expect(full.locator('article.ch')).toHaveCount(6);
  await expect(full.locator('main > section').last()).toHaveClass('full back');
  await expect(full.locator('.bk-part')).toHaveCount(0);
  await full.close();
});

test('على الهاتف: المفتاح واختيار النسخة وطبعة الجزء بلا تمرير أفقي', async ({ browser }) => {
  const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iphone, locale: 'ar-SA' });
  const page = await ctx.newPage();
  await mount(page);
  const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  await page.locator('.mb-vol').filter({ hasText: 'تمكين القائد' }).click();
  await scopeBtn(page, 'الجزء وحده').click();
  await expect(page.locator('.mb-colophon')).toContainText('في هذا الجزء');
  expect(await wide(page)).toBe(false);
  if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/parts-reader-iphone13.png` }); }
  await page.getByRole('button', { name: 'غلاف الكتاب' }).click();
  await page.getByRole('button', { name: 'نسخة PDF' }).click();
  await expect(page.getByRole('dialog', { name: 'نسخة PDF' })).toBeVisible();
  expect(await wide(page)).toBe(false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/parts-pdf-choice-iphone13.png` });
  const [win] = await Promise.all([ctx.waitForEvent('page'), page.locator('.mb-pdf button').nth(1).click()]);
  await expect(win.locator('.bk-part')).toHaveText('الجزء الثالث من ثلاثة · تمكين القائد');
  await expect(win.locator('article.ch')).toHaveCount(2);
  if (SHOTS) await win.screenshot({ path: `${SHOTS}/parts-edition-iphone13.png`, fullPage: true });
  await ctx.close();
});
