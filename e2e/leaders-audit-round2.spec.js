// تدقيق الإنتاج، الجولة 2: لوحة الجهة ورئيسية المشارك في رحلة واحدة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

test('لوحة الجهة: طلب واحد يحمل الهوية واللوحة، بلا طلب لوحة ثانٍ', async ({ page }) => {
  const calls = [];
  const dashboard = { success: true, org: { name: 'هيئة التطوير', seats: 50 }, permissions: { list: true, scores: false, activity: true },
    funnel: { registered: 1, approved: 1, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: {},
    kpis: { total: 1, joined_week: 1, active_week: 1, approved: 1, completed: 0, avg_progress: 30, seats: 50, seats_used: 1, seats_waiting: 0 },
    participants: [], impact: { counts: { paired: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [] };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action + (b.with_dashboard ? '+dashboard' : ''));
    if (b.action === 'coord.me') return route.fulfill({ json: { success: true, coordinator: { full_name: 'منسق', email: 'c@x.sa' }, org: { name: 'هيئة التطوير' }, switch_to: [], consent_needed: false,
      ...(b.with_dashboard ? { preload: { dashboard, sus: { success: true, due: false } } } : {}) } });
    return route.fulfill({ json: b.action === 'coord.dashboard' ? dashboard : { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
  await expect(page.getByText('هيئة التطوير').first()).toBeVisible();
  await expect(page.getByText(/من 50/).first()).toBeVisible();
  expect(calls).toEqual(['coord.me+dashboard']);
});

test('رئيسية المشارك: me يحمل المختبر وتقييم الخبير والاستبيان، بلا طلباتها المنفصلة', async ({ page }) => {
  const calls = [];
  const me = { success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', years_experience: 8 },
    profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
    journey: [{ key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
      { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 }],
    progress: 30, passkeys: 1, prompt_passkey: false };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    if (b.action === 'me') return route.fulfill({ json: { ...me, ...(b.with_home ? { preload: {
      lab: { success: true, items: [], points: 0 }, ratings: { success: true, items: [] }, sus: { success: true, due: false } } } : {}) } });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-round2-00000000000000000000'); });
  await page.goto('http://localhost:4304/');
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  await page.waitForTimeout(400);
  for (const a of ['lab.list', 'ratings.pending', 'sus.state']) expect(calls, a).not.toContain(a);
});
