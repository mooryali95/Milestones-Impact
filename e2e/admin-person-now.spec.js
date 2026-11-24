// ملف المشارك، المرحلتان 1 و2 من تصوره (2026-11-24): شريط «أين هو الآن» من الخادم وكل حقيقة تفتح تبويبها، والفصول في
// «المبادرة» وحده بفعل «قيّم»، و«صفحة المراجعة» متاحة دائمًا، وعمود «بانتظار» في القائمة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const person = { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', organization_id: 'o1', organization_name: 'وزارة التجربة', status: 'enrolled',
  placements: [{ dimension: 'milestone', level: 'intermediate', approved_at: '2026-11-01' }], created_at: '2026-10-01', last_login_at: '2026-11-01' };
const now = {
  stage: { text: 'التدريب', week: 4, of: 12, tab: 'journey' },
  waiting_on: { who: 'admin', n: 2, text: 'مراجعتك: بندان', tab: 'initiative' },
  last_activity: { at: '2026-11-01T10:00:00Z', days: 23, tone: 'warn', text: 'قبل 23 يومًا', tab: 'log' },
  next: { text: 'جلسة توجيه مع خالد', at: '2026-11-27T09:00:00Z', tab: 'initiative' },
};
const file = {
  success: true, participant: person, progress: 40, history: [], points: { total: 10, rank: { title: 'مستكشف' } }, book: [],
  models: [
    { id: 'm1', status: 'reviewed', learning_models: { title_ar: 'خريطة أصحاب المصلحة', capstone_sort: null } },
    { id: 'm2', status: 'submitted', learning_models: { title_ar: 'بطاقة المبادرة', key: 'initiative_charter', capstone_sort: 1 } },
  ],
  capstone: { status: 'submitted' },
  profile: { approved: true, track: { key: 'M2I2L2' }, dimensions: [] }, assessments: [],
  journey: [{ key: 's1', title_ar: 'التهيئة', status: 'done', items: [] }, { key: 's2', title_ar: 'التدريب', status: 'active', items: [] }],
  flags: [], observations: [], sessions: [], timeline: [], feedback360: [], attendance: [], now,
};
const capstone = { success: true, doc: { meta: { initiative: 'رقمنة الطلبات' } }, capstone: { status: 'draft' }, readiness: 30, sections: [
  { id: 'c1', key: 'initiative_charter', title: 'بطاقة المبادرة', complete: true, missing: 0, status: 'submitted', updated_at: '2026-11-20', sub_id: 'm2' },
  { id: 'c2', key: 'stakeholders', title: 'أصحاب المصلحة', complete: false, missing: 3, status: null, updated_at: null, sub_id: null },
] };

async function setup(page, hash, vp = { width: 1280, height: 900 }) {
  await page.setViewportSize(vp);
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'وزارة التجربة' }], unassigned: { total: 0, typed: [] } },
      'admin.participant': file, 'admin.capstone': capstone,
      'admin.submission': { success: true, submission: { id: 'm2', status: 'submitted', answers: {}, learning_models: { title_ar: 'بطاقة المبادرة', fields: [] } } },
      'admin.participants': { success: true, cohorts: [], participants: [
        { ...person, waiting: now.waiting_on },
        { ...person, id: 'p2', full_name: 'خالد', waiting: { who: 'participant', n: 1, text: 'المشارك: بند أُعيد له', tab: 'journey' } },
        { ...person, id: 'p3', full_name: 'منى', waiting: { who: null, n: 0, text: 'لا شيء معلق', tab: null } },
      ] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((h) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    window.location.hash = h;
  }, hash);
  await page.reload();
  return calls;
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });

for (const vp of [{ name: 'الحاسوب', size: { width: 1280, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`«أين هو الآن»: أربع حقائق وكل منها يفتح تبويبه (${vp.name})`, async ({ page }) => {
    await setup(page, '#/leaders/participants/p1', vp.size);
    const strip = page.getByTestId('now-strip');
    await expect(strip.locator('li')).toHaveCount(4);
    await expect(strip.locator('[data-now="stage"]')).toContainText('التدريب');
    await expect(strip.locator('[data-now="stage"]')).toContainText('الأسبوع 4 من 12');
    await expect(strip.locator('[data-now="waiting"]')).toContainText('مراجعتك: بندان');
    await expect(strip.locator('[data-now="activity"]')).toHaveClass(/warn/);
    await expect(strip.locator('[data-now="next"]')).toContainText('جلسة توجيه مع خالد');
    await strip.locator('[data-now="activity"] button').click();
    await expect(tab(page, 'السجل')).toHaveAttribute('aria-selected', 'true');
    await strip.locator('[data-now="waiting"] button').click();
    await expect(tab(page, 'المبادرة')).toHaveAttribute('aria-selected', 'true');
    await strip.locator('[data-now="stage"] button').click();
    await expect(tab(page, 'الرحلة')).toHaveAttribute('aria-selected', 'true');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
}

test('الفصول في «المبادرة» وحده: «التعلم» يشير إليها، والفصل المسلَّم يُقيَّم من بطاقة المبادرة', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1');
  // شارة «المبادرة»: الفصل المسلَّم والوثيقة المسلَّمة، و«التعلم» بلا الفصول
  await expect(tab(page, 'المبادرة').locator('.pf-badge')).toHaveText('2');
  await expect(tab(page, 'التعلم').locator('.pf-badge')).toHaveCount(0);
  await tab(page, 'التعلم').click();
  const panel = page.getByRole('tabpanel');
  await expect(panel).toContainText('خريطة أصحاب المصلحة');
  await expect(panel.locator('.la-reqs')).not.toContainText('بطاقة المبادرة');
  await panel.locator('[data-chapters-link]').getByRole('button', { name: 'المبادرة' }).click();
  await expect(tab(page, 'المبادرة')).toHaveAttribute('aria-selected', 'true');
  const cap = page.locator('.pf-cap');
  await expect(cap.getByRole('link', { name: 'صفحة المراجعة' })).toHaveAttribute('href', '#/leaders/capstones/p1');
  await expect(cap.getByRole('button', { name: 'قيّم فصل بطاقة المبادرة' })).toBeVisible();
  await expect(cap.locator('[data-chapter="stakeholders"] button')).toHaveCount(0);
});

test('عمود «بانتظار» في قائمة المشاركين من الحقيقة نفسها', async ({ page }) => {
  await setup(page, '#/leaders/participants');
  await expect(page.locator('td[data-label="بانتظار"]')).toHaveCount(3);
  await expect(page.locator('td[data-label="بانتظار"]').nth(0)).toContainText('الإدارة · 2');
  await expect(page.locator('td[data-label="بانتظار"]').nth(1)).toContainText('المشارك · 1');
  await expect(page.locator('td[data-label="بانتظار"]').nth(2)).toContainText('لا شيء');
});

test('المسار المرئي في «الرحلة»: عقدة لكل مرحلة، والحالية مبرزة، والنقر ينزل إليها', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1');
  await page.getByRole('tab', { name: /^الرحلة/ }).click();
  const path = page.getByTestId('journey-path');
  await expect(path.locator('li')).toHaveCount(2);
  await expect(path.locator('li[aria-current="step"]')).toContainText('التدريب');
  await expect(path.locator('li').first()).toHaveClass(/pj-path-done/);
  await path.getByRole('button', { name: /التهيئة/ }).click();
  await expect(page.locator('#pj-st-s1')).toBeInViewport();
});
