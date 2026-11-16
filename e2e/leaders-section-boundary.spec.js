// بقايا #385 في تطبيق القادة (PR10): حبس التركيز في نوافذ الكتاب الأم في لوحة الخبير من الوحدة المشتركة مع الإدارة
// (shared/ui/modal-focus.js)، وحاجز لكل قسم في لوحة المشارك يُصفَّر بمفتاحه فلا يُسقط خطأُ قسمٍ الترويسة والتنقل.
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);
const CH = '00000000-0000-4000-8000-000000000001';
const reviewer = { full_name: 'د. هند الشمري', title: 'محكّمة مناهج', email: 'h@x.com', roles: [], committees: ['content'], dimensions: ['impact'], status: 'active' };
const BOOK = {
  success: true, version: 'v3.1', generated_at: '2026-11-15T10:00:00Z', share: null, comments_ready: true, proposals_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role: 'لجنة المحتوى', write: true, resolve: false, propose: false, decide: false, watermark: 'د. هند الشمري · h@x.com' },
  chapters: [{ id: CH, dimension: 'impact', chapter_key: 'i1', sort: 1, title: 'من المخرج إلى الأثر', min_level: 'beginner', md: '## المدخل\n\nنص الباب.', quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' }],
  comments: [], counts: { total: 0, byModule: {}, bySection: {} },
  proposals: [{ id: 'pr1', module_id: CH, section: 'المدخل', status: 'review', status_ar: 'قيد المراجعة', reason: 'توضيح المثال', author_name: 'الإدارة', updated_at: '2026-11-15T09:00:00Z', base_md: 'نص الباب.', proposed_md: 'نص الباب بمثال أوضح.', can: {} }],
  proposal_counts: { review: 1 },
};

test('لوحة الخبير: نافذة «مقترحات التعديل» تحبس التركيز في Tab وShift+Tab، وEsc يعيده إلى زر فتحها', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'xp.dashboard') return route.fulfill({ json: { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, switch_to: [], expert: reviewer } });
    if (b.action === 'xp.book') return route.fulfill({ json: BOOK });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.goto(PORTAL);
  const open = page.getByRole('button', { name: /^المقترحات/ });
  await expect(open).toBeVisible();
  await open.click();
  const dlg = page.getByRole('dialog', { name: 'مقترحات التعديل' });
  await expect(dlg).toBeVisible();
  const inside = () => dlg.evaluate((el) => el.contains(document.activeElement));
  await expect.poll(inside).toBe(true);
  // أكثر من عدد ما فيها من عناصر: لو لم يُحبس لخرج التركيز إلى القارئ خلف الغشاء
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    expect(await inside(), `Tab رقم ${i + 1}`).toBe(true);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside(), `Shift+Tab رقم ${i + 1}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(open).toBeFocused();
});

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', organization_linked: true, years_experience: 8,
    consented_at: '2026-11-05T09:00:00Z', consent: { needed: null } },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

test('لوحة المشارك: خطأ في رسم قسم «ملفي» يبقى في مكانه، والترويسة والتنقل يعملان، والانتقال يعيد القسم سليمًا', async ({ page }) => {
  let broken = true;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    let r = { success: true };
    if (b.action === 'me') r = me;
    else if (b.action === 'certificate') r = { success: true, certificate: null };
    // رد تالف يُسقط رسم «بياناتي» داخل قسم «ملفي»: كائن حيث يُنتظر عدد
    else if (b.action === 'me.privacy') r = { success: true, erase: null, erase_ready: false, exports_left: 3, contact: 'hello@x.sa', reply_days: broken ? { days: 30 } : 30 };
    await route.fulfill({ json: r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-boundary-0000000000000000'); });
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await expect(nav.getByRole('button', { name: 'رحلتي' })).toBeVisible();
  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'تعذّر عرض هذا القسم' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('بقية المنصة تعمل');
  // الإطار باقٍ: الترويسة والتنقل وزر الخروج، لا شاشة «تعذّر عرض الصفحة» للتطبيق كله
  await expect(page.getByRole('heading', { name: 'تعذّر عرض الصفحة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'خروج' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'ملفي' })).toHaveAttribute('aria-current', 'page');
  // زر «رحلتي» في الحاجز ينقل إلى الرحلة، فيزول الخطأ بتصفير الحاجز بمفتاح القسم
  await alert.getByRole('button', { name: 'رحلتي' }).click();
  await expect(alert).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'رحلتي' })).toHaveAttribute('aria-current', 'page');
  // العودة إلى القسم وقد صلح الرد: يُرسم كاملًا، لا تبقى رسالة الخطأ عالقة
  broken = false;
  await nav.getByRole('button', { name: 'ملفي' }).click();
  await expect(page.getByRole('region', { name: 'بياناتي' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّر عرض هذا القسم' })).toHaveCount(0);
  expect(errors.filter((m) => !/Objects are not valid as a React child/.test(m))).toEqual([]);
});
