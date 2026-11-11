// خريطة الرحلة في لوحة الجهة (قرار المالك 2026-11-11): المراحل بأطوارها، ومن يقف عند كل منها، ولوح المرحلة بالصلاحيات،
// والجوال خطًا زمنيًا رأسيًا بلا تمرير أفقي، ولمن لا خريطة له أعمدة القمع كما كانت. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const st = (key, phase, title, duration_days, here, done, late = 0, extra = {}) => ({ key, phase, title, duration_days, here, done, late, ...extra });
const people = [
  { id: 'a', name: 'سارة عبدالله الأحمد', days: 31, late: true, needs: 'رفع خطة التطبيق في العمل' },
  { id: 'b', name: 'خالد محمد العتيبي', days: 29, late: true, needs: 'الجلسة الرابعة مع الموجّه' },
  { id: 'c', name: 'نورة سعد القحطاني', days: 18, late: false, needs: 'الجلسة الثالثة مع الموجّه' },
  { id: 'd', name: 'فهد ناصر الدوسري', days: 9, late: false, needs: 'تقرير الملاحظة الأولى' },
  { id: 'e', name: 'ريم إبراهيم الشهري', days: 6, late: false, needs: 'الجلسة الأولى مع الموجّه' },
];
const map = {
  program: { name: 'برنامج القادة · إدارة المشروعات' },
  cohort: { name: 'دفعة سفراء', starts_on: '2026-09-14', today_stage: 'ojt_coaching' },
  totals: { total: 24, finished: 1, late: 6, not_started: 0 },
  bottleneck: { stage: 'ojt_coaching' },
  stages: [
    st('profile', 'admission', 'الملف الشخصي', 0, 1, 23),
    st('assessment', 'admission', 'تحديد المستوى', 0, 2, 21),
    st('approval', 'admission', 'اعتماد المستوى', 2, 1, 20, 1, { window: { from: '2026-09-14', to: '2026-09-16' } }),
    st('training', 'qualification', 'التدريب', 4, 3, 17, 1, { window: { from: '2026-09-17', to: '2026-09-21' } }),
    st('ojt_coaching', 'qualification', 'التوجيه على رأس العمل', 28, 7, 10, 3, { window: { from: '2026-09-22', to: '2026-10-20' }, people }),
    st('consulting', 'qualification', 'الاستشارة', 14, 4, 6, 1, { window: { from: '2026-10-21', to: '2026-11-04' } }),
    st('leadership_coaching', 'qualification', 'التوجيه القيادي', 28, 3, 3, 0, { window: { from: '2026-11-05', to: '2026-12-03' } }),
    st('support', 'impact', 'الدعم والتمكين', 90, 2, 1),
    st('evaluation', 'impact', 'التقييم والقياس', 14, 0, 1),
    st('report', 'impact', 'التقرير النهائي', 7, 1, 0),
  ],
  milestones: [
    { id: 'm1', title: 'اعتماد مستويات الدفعة', due: '2026-09-16', done: 20, late: 1 },
    { id: 'm2', title: 'إتمام الأيام التدريبية', due: '2026-09-21', done: 17, late: 1 },
    { id: 'm3', title: 'خطة التطبيق في العمل', due: '2026-10-05', done: 12, late: 3 },
    { id: 'm4', title: 'مراجعة منتصف البرنامج', due: '2026-11-04', done: 6, late: 0 },
    { id: 'm5', title: 'تسمية المبادرة واعتمادها', due: '2026-12-03', done: 3, late: 0 },
    { id: 'm6', title: 'التقييم الختامي', due: '2027-03-01', done: 1, late: 0 },
  ],
};
const dashboard = { success: true, org: { name: 'سفراء', seats: 50 }, permissions: { list: true, scores: false, activity: false },
  funnel: { registered: 24, approved: 20, completed: 1, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: { invite: 18, domain: 6 },
  kpis: { total: 24, joined_week: 1, active_week: 17, approved: 20, completed: 1, avg_progress: 46, seats: 50, seats_used: 24, seats_waiting: 0 },
  participants: [], impact: { counts: { paired: 0, baseline: 20, post: 1 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [], journey_map: map };

async function mount(page, d) {
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const q = JSON.parse(r.request().postData() || '{}');
    if (q.action === 'coord.me') return r.fulfill({ json: { success: true, coordinator: { full_name: 'م. يحيى الحميري', email: 'c@x.sa' }, org: { name: 'سفراء' }, switch_to: [], consent_needed: false, preload: { dashboard: d, sus: { success: true, due: false } } } });
    return r.fulfill({ json: { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
}

test('الخريطة: الأطوار الثلاثة والمراحل العشر بأعدادها، و«اليوم»، والاختناق، ولوح المرحلة بالأسماء', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, dashboard);
  await expect(page.locator('section.jm')).toBeVisible();
  await expect(page.locator('.jm-phase-head b')).toHaveText(['القبول', 'التأهيل', 'الأثر']);
  await expect(page.locator('.jm-node')).toHaveCount(10);
  await expect(page.locator('.jm-here')).toHaveText(['1', '2', '1', '3', '7', '4', '3', '2', '0', '1']);
  await expect(page.locator('.jm-stage.today .jm-title')).toHaveText('التوجيه على رأس العمل');
  await expect(page.locator('.jm-alert')).toContainText('أكبر تجمع الآن 7 أشخاص عند «التوجيه على رأس العمل»، منهم 3 تجاوزوا مدتها');
  // أعمدة القمع الأربعة لا تتكرر مع الخريطة
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toHaveCount(0);
  const node = page.locator('.jm-node').nth(4);
  await expect(node).toHaveAttribute('aria-label', /التوجيه على رأس العمل \(موقع الدفعة على جدولها اليوم\): 7 أشخاص هنا، 10 تجاوزوها، 7 لم يصلوها، 3 تجاوزوا مدتها/);
  await node.click();
  await expect(node).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('region', { name: 'تفاصيل مرحلة التوجيه على رأس العمل' });
  await expect(panel.getByRole('table', { name: /من يقفون عند التوجيه على رأس العمل/ })).toBeVisible();
  await expect(panel.locator('tbody tr')).toHaveCount(5);
  await expect(panel.locator('tbody tr.is-late')).toHaveCount(2);
  await panel.getByRole('button', { name: 'إغلاق' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.jm-m')).toHaveCount(6);
  // الجدول البديل لقارئ الشاشة موجود ومخفي بصريًا
  const table = page.getByRole('table', { name: 'خريطة الرحلة: عدد المشاركين عند كل مرحلة' });
  await expect(table.locator('tbody tr')).toHaveCount(10);
  expect(await table.evaluate((t) => getComputedStyle(t).position === 'absolute' && getComputedStyle(t).clip !== 'auto')).toBe(true);
});

test('بلا صلاحية القائمة: أسباب مجمّعة بلا أسماء', async ({ page }) => {
  const m = structuredClone(map);
  for (const s of m.stages) { delete s.people; s.reasons = s.key === 'ojt_coaching' ? [{ text: 'الجلسة الثالثة مع الموجّه', count: 4 }, { text: 'رفع خطة التطبيق في العمل', count: 3 }] : []; }
  await mount(page, { ...dashboard, permissions: { list: false }, journey_map: m });
  await page.locator('.jm-node').nth(4).click();
  const panel = page.getByRole('region', { name: 'تفاصيل مرحلة التوجيه على رأس العمل' });
  await expect(panel.locator('.jm-reasons li')).toHaveText(['4 الجلسة الثالثة مع الموجّه', '3 رفع خطة التطبيق في العمل']);
  await expect(panel.getByRole('table')).toHaveCount(0);
});

test('الجوال: خط زمني رأسي بلا تمرير أفقي', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, dashboard);
  await expect(page.locator('section.jm')).toBeVisible();
  const ys = await page.locator('.jm-node').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(ys.every((y, i) => i === 0 || y > ys[i - 1])).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('بلا خريطة من الخادم: أعمدة القمع كما كانت', async ({ page }) => {
  const { journey_map, ...old } = dashboard;
  await mount(page, old);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
  await expect(page.locator('section.jm')).toHaveCount(0);
});
