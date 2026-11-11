// «فريق البرنامج» في بوابة منسق الجهة (تصور ربط الخبراء والمجموعات بالجهة v1، قرار المالك 2026-11-11): من يخدم موظفي الجهة،
// بالأسماء والأدوار بلا وسائل تواصل، والتواصل عبر إدارة البرنامج. سطح المكتب و390px. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const team = [{
  cohort: { name: 'دفعة هيئة المثال 2026', starts_on: '2026-03-01', ends_on: '2026-06-30' },
  advisor: { full_name: 'د. سارة العلي', title: 'مستشارة قيادة', roles: ['advisor'], bio: 'خمس عشرة سنة في قيادة التحول المؤسسي.' },
  team: [{ full_name: 'أ. خالد ن.', title: null, roles: ['coach', 'mentor'], groups: ['المجموعة 2'] }, { full_name: 'أ. نورة ع.', title: null, roles: ['assessor'], groups: [] }],
  groups: [{ name: 'المجموعة 1', count: 7, expert: null, members: ['منى ح.', 'سعد ك.'] }, { name: 'المجموعة 2', count: 7, expert: 'أ. خالد ن.', members: [] }],
  participants: 39,
}];
const base = { success: true, org: { name: 'هيئة المثال', seats: 50 }, permissions: { list: true, scores: false, activity: false, team: true },
  funnel: { registered: 39, approved: 30, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: { link: 39 },
  kpis: { total: 39, joined_week: 1, active_week: 20, approved: 30, completed: 0, avg_progress: 40, seats: 50, seats_used: 39, seats_waiting: 0 },
  participants: [], impact: { counts: { paired: 0, baseline: 30, post: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [], journey_map: null };

async function mount(page, d) {
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const q = JSON.parse(r.request().postData() || '{}');
    if (q.action === 'coord.me') return r.fulfill({ json: { success: true, coordinator: { full_name: 'م. يحيى', email: 'c@x.sa' }, org: { name: 'هيئة المثال' }, switch_to: [], consent_needed: false, preload: { dashboard: d, sus: { success: true, due: false } } } });
    return r.fulfill({ json: { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
}

for (const vp of [{ name: 'سطح المكتب', size: { width: 1280, height: 900 } }, { name: '390px', size: { width: 390, height: 844 } }]) {
  test(`فريق البرنامج (${vp.name}): المستشار ونبذته، والفريق بأدواره، والمجموعات، بلا وسائل تواصل`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await mount(page, { ...base, program_team: team });
    const sec = page.getByRole('region', { name: 'فريق البرنامج' });
    await expect(sec).toBeVisible();
    await expect(sec).toContainText('المستشار الأساسي');
    await expect(sec).toContainText('د. سارة العلي');
    await expect(sec).toContainText('خمس عشرة سنة في قيادة التحول المؤسسي.');
    await expect(sec.locator('.op-team-list li').first()).toContainText('أ. خالد ن. موجّه، مرشد · المجموعة 2');
    await expect(sec.locator('.op-team-list li').nth(1)).toContainText('مقيّم');
    await expect(sec).toContainText('المجموعات: 2 · 39 مشاركًا');
    await expect(sec.getByText('المجموعة 1 (7) · يتبع المستشار الأساسي')).toBeVisible();
    await sec.getByText('المجموعة 1 (7)').click();
    await expect(sec).toContainText('منى ح.، سعد ك.');
    await expect(sec).toContainText('للتواصل مع الفريق: إدارة البرنامج.');
    await expect(sec).not.toContainText('@');
    expect(await sec.locator('a[href^="mailto:"], a[href^="tel:"]').count()).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('بلا صلاحية القائمة: المجموعات بأعدادها وخبرائها وبلا أسماء أعضاء', async ({ page }) => {
  const noList = [{ ...team[0], groups: team[0].groups.map(({ members: _m, ...g }) => g) }];
  await mount(page, { ...base, permissions: { ...base.permissions, list: false }, program_team: noList });
  const sec = page.getByRole('region', { name: 'فريق البرنامج' });
  await sec.getByText('المجموعة 1 (7)').click();
  await expect(sec).toContainText('أسماء الأعضاء لمن يرى قائمة المشاركين.');
  await expect(sec).not.toContainText('منى ح.');
});

test('بلا صلاحية «فريق البرنامج» لا بطاقة، وتعذّر القراءة يُقال في البطاقة ولا يُسقط اللوحة', async ({ page }) => {
  await mount(page, { ...base, permissions: { ...base.permissions, team: false }, program_team: null });
  await expect(page.getByText('متوسط الإنجاز')).toBeVisible();
  await expect(page.getByRole('region', { name: 'فريق البرنامج' })).toHaveCount(0);
  await page.unrouteAll();
  await mount(page, { ...base, program_team: { error: 'تعذّر قراءة فريق البرنامج الآن، حاول بعد قليل' } });
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّر قراءة فريق البرنامج الآن' })).toBeVisible();
  await expect(page.getByText('متوسط الإنجاز')).toBeVisible();
});
