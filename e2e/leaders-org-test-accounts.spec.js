// حساب الاختبار في بوابة الجهة (بلاغ المالك 2026-11-11): خارج المقاعد كما هو خارج الخريطة والمؤشرات، وعدده مذكور بصدق
// بصيغة العدد العربية، ولا ملاحظة حين لا حساب اختبار. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const dashboard = (kpis) => ({ success: true, org: { name: 'منظومة', seats: 50 }, permissions: { list: true, scores: false, activity: false },
  funnel: { registered: 0, approved: 0, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: {},
  kpis: { total: 0, joined_week: 0, active_week: 0, approved: 0, completed: 0, avg_progress: 0, seats: 50, seats_used: 0, seats_waiting: 0, ...kpis },
  participants: [], impact: { counts: { paired: 0, baseline: 0, post: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [], journey_map: null });

async function mount(page, d) {
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const q = JSON.parse(r.request().postData() || '{}');
    if (q.action === 'coord.me') return r.fulfill({ json: { success: true, coordinator: { full_name: 'منسق', email: 'c@x.sa' }, org: { name: 'منظومة' }, switch_to: [], consent_needed: false, preload: { dashboard: d, sus: { success: true, due: false } } } });
    return r.fulfill({ json: { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
}

test('حساب اختبار واحد: المقاعد صفر والملاحظة بالمفرد', async ({ page }) => {
  await mount(page, dashboard({ test_accounts: 1 }));
  await expect(page.locator('.op-seats b')).toHaveText('0');
  await expect(page.locator('.op-test')).toHaveText('حساب اختبار واحد خارج الإحصاءات');
});

test('صيغ العدد: اثنان وثلاثة', async ({ page }) => {
  await mount(page, dashboard({ test_accounts: 2 }));
  await expect(page.locator('.op-test')).toHaveText('حسابا اختبار خارج الإحصاءات');
  await page.unrouteAll();
  await mount(page, dashboard({ test_accounts: 3 }));
  await expect(page.locator('.op-test')).toHaveText('3 حسابات اختبار خارج الإحصاءات');
});

test('بلا حساب اختبار: لا ملاحظة', async ({ page }) => {
  await mount(page, dashboard({ test_accounts: 0, seats_used: 4 }));
  await expect(page.locator('.op-seats b')).toHaveText('4');
  await expect(page.locator('.op-test')).toHaveCount(0);
});
