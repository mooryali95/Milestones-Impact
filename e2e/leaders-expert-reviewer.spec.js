// فصل خدمة الرحلة عن لجان الكتاب (المرحلة 1، اعتمده المالك 2026-11-15): عضو اللجنة بلا دور يدخل /x نفسه، فلا يُطلب منه
// D18 ولا يرى أقسام الرحلة، ويتعهد بالسرية في أول دخول ثم يُفتح له القارئ مباشرة. ومن جمع الخدمتين يرى لوحته وبطاقة الكتاب.
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.EXPERTS_SHOTS;
const PLEDGE = ['أطّلع على الكتاب الأم بصفتي عضوًا في لجنة مراجعته، وما فيه سري لا أنقله ولا أشاركه خارج اللجنة.', 'أستعمل ما أطّلع عليه للمراجعة والتعليق وحدهما.'];
const reviewer = { full_name: 'د. هند الشمري', title: 'محكّمة مناهج', email: 'h@x.com', roles: [], committees: ['content'], dimensions: ['impact'], status: 'active' };
const BOOK = {
  success: true, version: 'v3.1', generated_at: '2026-11-15T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'expert', name: 'د. هند الشمري', role: 'لجنة المحتوى', write: true, resolve: false },
  chapters: [{ id: '00000000-0000-4000-8000-000000000001', dimension: 'impact', chapter_key: 'i1', sort: 1, title: 'من المخرج إلى الأثر', min_level: 'beginner', md: '## المدخل\n\nنص الباب.', quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' }],
  comments: [], counts: { total: 0, byModule: {}, bySection: {} },
};

async function mount(page, first) {
  const calls = [];
  let state = first;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    if (b.action === 'xp.dashboard') return route.fulfill({ json: state });
    if (b.action === 'xp.pledge') { state = { ...state, pledge_needed: false }; return route.fulfill({ json: state }); }
    if (b.action === 'xp.book') return route.fulfill({ json: state.pledge_needed ? { success: false, code: 'pledge', message: 'أكّد تعهد السرية أولًا ثم افتح الكتاب' } : BOOK });
    return route.fulfill({ json: { success: false, message: `غير متوقع: ${b.action}` } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  return calls;
}

test('عضو اللجنة بلا دور: بلا D18 ولا أقسام الرحلة، تعهد السرية ثم القارئ مباشرة، والرجوع إلى مدخل الكتاب وحده', async ({ browser }) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1100, height: 900 }, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const calls = await mount(page, { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: true, pledge: PLEDGE, switch_to: [], expert: reviewer });
  await page.goto(PORTAL);
  await expect(page.getByRole('heading', { name: 'تعهد السرية' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'بيانات المشاركين أمانة' })).toHaveCount(0);
  for (const l of PLEDGE) await expect(page.getByText(l)).toBeVisible();
  // لا «ليس الآن» لعضو اللجنة: لوحته الكتاب وحده
  await expect(page.getByRole('button', { name: 'ليس الآن' })).toHaveCount(0);
  const go = page.getByRole('button', { name: 'أتعهد وأفتح الكتاب' });
  await expect(go).toBeDisabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portal-reviewer-pledge.png`, fullPage: true });
  await page.getByLabel('قرأت التعهد وألتزم به').check();
  await go.click();
  await expect(page.getByText('تقرأ بصفتك:')).toBeVisible();
  expect(calls).toEqual(['xp.dashboard', 'xp.pledge', 'xp.book']);
  // الرجوع من القارئ: مدخل الكتاب وحده، بلا مؤشرات ولا طلبات ولا جلسات ولا مشاركين ولا شهادة ساعات
  await page.getByRole('button', { name: 'رجوع' }).first().click();
  await expect(page.getByRole('heading', { name: 'أهلًا د. هند الشمري' })).toBeVisible();
  await expect(page.locator('.xpp-book')).toContainText('لجنة المحتوى');
  for (const t of ['شهادة ساعات الخبرة', 'جلساتك القادمة', 'طلبات بانتظار ردك', 'مشاركوك', 'ساعة قدّمتها', 'بداية عملك في الشبكة']) await expect(page.getByText(t), t).toHaveCount(0);
  await expect(page.locator('.xpp-kpis')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portal-reviewer-entry.png`, fullPage: true });
  expect(calls.filter((a) => !['xp.dashboard', 'xp.pledge', 'xp.book'].includes(a))).toEqual([]);
  await ctx.close();
});

test('عضو لجنة تعهد من قبل: يدخل القارئ مباشرة بلا شاشة وسيطة', async ({ page }) => {
  const calls = await mount(page, { success: true, content_only: true, consent_needed: false, book_access: true, pledge_needed: false, pledge: PLEDGE, switch_to: [], expert: reviewer });
  await page.goto(PORTAL);
  await expect(page.getByText('تقرأ بصفتك:')).toBeVisible();
  expect(calls).toEqual(['xp.dashboard', 'xp.book']);
});

test('عضو اللجنة المدعو يستكمل الاسم والنبذة والإطار، بلا أدوار ولا ساعات ولا قطاع', async ({ page }) => {
  await mount(page, { success: true, onboarding: true, content_only: true, consent_needed: false, switch_to: [], expert: { ...reviewer, status: 'invited' } });
  await page.goto(PORTAL);
  await expect(page.getByRole('heading', { name: 'أكّد بياناتك لمراجعة الكتاب الأم' })).toBeVisible();
  await expect(page.getByText('كيف تحب أن تخدم؟')).toHaveCount(0);
  await expect(page.getByText('مستويات القادة التي تناسبك')).toHaveCount(0);
  await expect(page.getByLabel('الساعات المتاحة أسبوعيًا')).toHaveCount(0);
  await expect(page.getByLabel('القطاعات التي عملت فيها')).toHaveCount(0);
  await expect(page.getByText('الإطار الذي تراجعه *')).toBeVisible();
});

test('من جمع الخدمتين: لوحة الرحلة كما هي، والكتاب من بطاقته بعد تعهد يمكن تأجيله', async ({ page }) => {
  const both = { success: true, consent_needed: false, switch_to: [], book_access: true, pledge_needed: true, pledge: PLEDGE,
    expert: { ...reviewer, roles: ['coach'] }, stats: { hours: 0, participants: 0, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] };
  await mount(page, both);
  await page.goto(PORTAL);
  await expect(page.getByText('جلساتك القادمة')).toBeVisible();
  await page.locator('.xpp-book').click();
  await expect(page.getByRole('heading', { name: 'تعهد السرية' })).toBeVisible();
  await page.getByRole('button', { name: 'ليس الآن' }).click();
  await expect(page.getByText('جلساتك القادمة')).toBeVisible();
});
