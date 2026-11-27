// المرحلة 20 (الكتاب الأم في القارئ المشترك): بوابة الخبير كما هي إلا بند الإصدار. البطل وأفعاله باقية، ولا «إجراءات ▾»،
// والإصدار الغائب «لم يصدر بعد» لا «·»، والعلامة المائية حاضرة بشفافية 0.09 (الإطار الافتراضي). الخلفية مُحاكاة. SHOTS_DIR: لقطات.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const SHOTS = process.env.SHOTS_DIR || '';
const reviewer = { full_name: 'د. هند الشمري', title: 'محكّمة مناهج', email: 'h@x.com', roles: [], committees: ['content'], dimensions: ['impact'], status: 'active' };
const BOOK = (version) => ({
  success: true, version, generated_at: '2026-11-15T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role: 'لجنة المحتوى', write: true, resolve: false, watermark: 'د. هند الشمري · h@x.com' },
  chapters: [{ id: '00000000-0000-4000-8000-000000000001', dimension: 'impact', chapter_key: 'i1', sort: 1, title: 'من المخرج إلى الأثر', min_level: 'beginner', md: '## المدخل\n\nنص الباب.', quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' }],
  comments: [], counts: { total: 0, byModule: {}, bySection: {} },
});

async function mount(page, version) {
  const dash = { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, pledge: [], switch_to: [], expert: reviewer };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: dash });
    if (b.action === 'xp.book') return route.fulfill({ json: BOOK(version) });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), 'x'.repeat(40));
}

for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
  test(`بوابة الخبير (${size.width}): البطل كما هو، و«لم يصدر بعد»، والعلامة المائية حاضرة`, async ({ page }) => {
    await page.setViewportSize(size);
    await mount(page, null);
    await page.goto(PORTAL);
    await expect(page.getByText('تقرأ بصفتك:')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.mb-hero')).toHaveCount(1);
    await expect(page.locator('.mb-facts')).toContainText('لم يصدر بعد');
    await expect(page.locator('.mb-facts')).not.toContainText('·');
    await expect(page.getByRole('button', { name: /^إجراءات/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^أصدر الكتاب/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'نسخة PDF' })).toBeVisible();
    const wm = page.locator('.mb-wm');
    await expect(wm).toHaveCount(1);
    await expect(wm).toHaveAttribute('aria-hidden', 'true');
    await expect(wm).toHaveCSS('pointer-events', 'none');
    await expect(wm).toHaveCSS('opacity', '0.09');
    expect(decodeURIComponent(await wm.evaluate((el) => el.style.backgroundImage))).toContain('width="520" height="220"');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/p20-expert-shelf-${size.width}.png` }); }
  });
}

test('بوابة الخبير: إصدار قائم يُعرض كما هو', async ({ page }) => {
  await mount(page, 'v3.1');
  await page.goto(PORTAL);
  await expect(page.locator('.mb-facts')).toContainText('v3.1');
});
