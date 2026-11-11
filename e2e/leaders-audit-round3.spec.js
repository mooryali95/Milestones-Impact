// تدقيق الإنتاج، الجولة 3: الخروج من الأدوار، ولوحة الجهة (المرحلة الجارية والجدول لقارئ الشاشة والعدد). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const dashboard = (over = {}) => ({ success: true, org: { name: 'هيئة التطوير', seats: 50 }, permissions: { list: true, scores: false, activity: false },
  funnel: { registered: 1, approved: 1, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: {},
  kpis: { total: 1, joined_week: 0, active_week: 1, approved: 1, completed: 0, avg_progress: 30, seats: 50, seats_used: 1, seats_waiting: 0 },
  participants: [{ id: 'p1', full_name: 'سارة الأحمد', job_title: 'مديرة', status: 'approved', stage: 'التدريب', approved: true, progress: 30 }],
  impact: { counts: { paired: 0, baseline: 1, post: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [], ...over });

async function org(page, extra = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push({ action: b.action, token: b.token });
    if (b.action === 'coord.me') return route.fulfill({ json: { success: true, coordinator: { full_name: 'منسق', email: 'c@x.sa' }, org: { name: 'هيئة التطوير' }, switch_to: [], consent_needed: false,
      preload: { dashboard: dashboard(), sus: { success: true, due: false } } } });
    return route.fulfill({ json: extra[b.action] || { success: true } });
  });
  return calls;
}

test('لوحة الجهة: المرحلة الجارية لا الحالة الإدارية، و«من 50 مقعدًا»، والجدول بعنوانه ورؤوس أعمدته', async ({ page }) => {
  await org(page);
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
  const table = page.getByRole('table', { name: /مشاركو هيئة التطوير/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'المرحلة' })).toBeVisible();
  await expect(table.getByText('التدريب')).toBeVisible();
  await expect(table.getByText('معتمد المستوى')).toHaveCount(0);
  await expect(page.getByText('من 50 مقعدًا')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'ابحث' })).toBeVisible();
});

// فحص الجاهزية p-entry-9: السؤال نافذة من التطبيق بثلاثة أزرار صريحة، لا سؤال المتصفح الذي كان «إلغاء» فيه خروجًا
test('الخروج من لوحة الجهة وفي الجهاز جلسة مشارك: «اخرج من كل الأدوار» يلغي الجلستين على الخادم', async ({ page }) => {
  const calls = await org(page);
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)); localStorage.setItem('mi_leaders_session', 'p'.repeat(40)); });
  await page.goto('http://localhost:4304/org');
  await page.getByRole('button', { name: 'خروج' }).click();
  const dlg = page.getByRole('dialog', { name: 'الخروج من المنصة' });
  await expect(dlg).toContainText('بصفة مشارك');
  await dlg.getByRole('button', { name: 'اخرج من كل الأدوار' }).click();
  await expect.poll(() => calls.map((c) => c.action).filter((a) => a.endsWith('logout')).sort()).toEqual(['coord.logout', 'logout']);
  expect(await page.evaluate(() => [localStorage.getItem('mi_leaders_coord_session'), localStorage.getItem('mi_leaders_session')])).toEqual([null, null]);
  await expect(dlg).toHaveCount(0);
});

test('«اخرج من حساب منسق جهة وحده» يبقي جلسة المشارك', async ({ page }) => {
  const calls = await org(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)); localStorage.setItem('mi_leaders_session', 'p'.repeat(40)); } });
  await page.goto('http://localhost:4304/org');
  await page.getByRole('button', { name: 'خروج' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اخرج من حساب منسق جهة وحده' }).click();
  await expect.poll(() => calls.filter((c) => c.action.endsWith('logout')).map((c) => c.action)).toEqual(['coord.logout']);
  expect(await page.evaluate(() => [localStorage.getItem('mi_leaders_coord_session'), localStorage.getItem('mi_leaders_session')])).toEqual([null, 'p'.repeat(40)]);
});

test('«تراجع» وEscape لا يُخرجان: الجلستان باقيتان واللوحة كما هي، والتركيز يعود إلى «خروج»', async ({ page }) => {
  const calls = await org(page);
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)); localStorage.setItem('mi_leaders_session', 'p'.repeat(40)); });
  await page.goto('http://localhost:4304/org');
  const out = page.getByRole('button', { name: 'خروج' });
  await out.click();
  await page.getByRole('dialog').getByRole('button', { name: 'تراجع' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(out).toBeFocused();
  await out.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'اخرج من كل الأدوار' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(calls.filter((c) => c.action.endsWith('logout'))).toEqual([]);
  expect(await page.evaluate(() => [localStorage.getItem('mi_leaders_coord_session'), localStorage.getItem('mi_leaders_session')])).toEqual(['c'.repeat(40), 'p'.repeat(40)]);
  await expect(page.getByText('من 50 مقعدًا')).toBeVisible();
});
