// ملف المشارك بهيكله الجديد (P2، اعتمده المالك 2026-11-16): رأس بالهوية والإجراء الأهم و«⋯»، وست تبويبات بنمط ARIA،
// وعمود «لمحة». الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ev = { level: 'intermediate', composite: 60, borderline: false, flags: [], reason: '', items_to_flip: 2 };
const base = {
  id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', phone: '0500000000', job_title: 'مديرة مشاريع', organization_id: 'o1', organization_name: 'وزارة التجربة',
  linkedin_url: 'https://linkedin.com/in/x', placements: [{ dimension: 'milestone', level: 'intermediate', approved_at: '2026-11-01' }], created_at: '2026-10-01', last_login_at: '2026-11-14',
};
const file = (status, extra = {}) => ({
  success: true, participant: { ...base, status }, progress: 40, history: [], points: { total: 120, rank: { title: 'مستكشف' } }, book: [{}, {}], models: [],
  placement_model: { min_intermediate: 55, min_advanced: 80, borderline: 8, floor_intermediate: 50 },
  profile: { approved: status !== 'pending_approval', track: { key: 'M2I2L2', title: 'مسار' }, dimensions: [] },
  assessments: [{ id: 'a', status: 'submitted', submitted_at: '2026-11-02T10:00:00Z', assessment_results: ['milestone', 'impact', 'leadership'].map((d) => (
    { dimension: d, knowledge_pct: 60, skill_pct: 60, behavior_pct: 60, evaluation: ev })) }],
  journey: [
    { key: 's1', title_ar: 'التهيئة', status: 'done', items: [] },
    { key: 's2', title_ar: 'التدريب', status: 'active', items: [{ id: 'r1', title_ar: 'خطة المبادرة', status: 'submitted' }] },
  ],
  flags: [{ key: 'effort', tone: 'bad', label: 'أجاب القياس باستعجال' }],
  observations: [{ id: 'o1', kind: 'note', source: 'admin', body: 'ملاحظة', created_at: '2026-11-10T10:00:00Z' }],
  sessions: [{ id: 'x', status: 'attended', starts_at: '2026-11-10T09:00:00Z' }], timeline: [], feedback360: [], attendance: [],
  ...extra,
});

async function setup(page, status = 'enrolled', vp = { width: 1280, height: 900 }, more = {}) {
  await page.setViewportSize(vp);
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'وزارة التجربة', short_name: 'التجربة' }], unassigned: { total: 0, typed: [] } },
      'admin.participant': file(status),
      ...more,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    window.location.hash = '#/leaders/participants/p1';
  });
  await page.reload();
  await expect(page.locator('.pf-head h3')).toHaveText('سارة الأحمد');
  return calls;
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });

for (const vp of [{ name: 'الحاسوب', size: { width: 1280, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`الرأس والتبويبات واللمحة (${vp.name})`, async ({ page }) => {
    await setup(page, 'enrolled', vp.size);
    const head = page.locator('.pf-head');
    await expect(head).toContainText('في البرنامج');
    await expect(head.locator('code')).toHaveText('M2I2L2');
    await expect(head).toContainText('التجربة');
    await expect(head.getByRole('link', { name: /راسله/ })).toHaveAttribute('href', 'mailto:s@x.com');
    await expect(head.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(head.getByRole('list', { name: 'ملخص الأعلام' })).toContainText('أجاب القياس باستعجال');
    // المعتمد يفتح على الرحلة، وعليها عدد ما سلّمه
    await expect(tab(page, 'الرحلة')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'الرحلة').locator('.pf-badge')).toHaveText('1');
    await expect(page.getByRole('tabpanel')).toContainText('خطة المبادرة');
    // تبويب واحد ظاهر في كل مرة
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    const glance = page.getByRole('complementary', { name: 'لمحة' });
    await expect(glance).toContainText('40%');
    await expect(glance).toContainText('التدريب');
    await expect(glance).toContainText('1 حضرها');
    for (const t of ['القرار', 'التعلم', 'المبادرة والجلسات', 'الملف', 'السجل']) {
      await tab(page, t).click();
      await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', /pf-tab-/);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, t).toBeLessThanOrEqual(0);
    }
  });
}

test('المنتظر اعتماده يفتح على القرار، والإجراء الأهم «راجع واعتمد»', async ({ page }) => {
  await setup(page, 'pending_approval');
  await expect(tab(page, 'القرار')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel').getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' })).toBeVisible();
  await tab(page, 'السجل').click();
  await page.locator('.pf-id-act').getByRole('button', { name: 'راجع واعتمد' }).click();
  await expect(tab(page, 'القرار')).toHaveAttribute('aria-selected', 'true');
});

test('التبويبات بلوحة المفاتيح بنمط ARIA، والتبويب المختار يبقى عند فتح ملف آخر', async ({ page }) => {
  await setup(page, 'enrolled');
  await tab(page, 'الرحلة').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'التعلم')).toBeFocused();
  await expect(tab(page, 'التعلم')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(page, 'السجل')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab(page, 'القرار')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'السجل')).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(tab(page, 'السجل')).toHaveAttribute('aria-selected', 'true');
});

test('قائمة «⋯»: تُفتح على أول بند، وتتنقل بالأسهم، وEscape يغلقها ويعيد التركيز', async ({ page }) => {
  await setup(page, 'enrolled');
  const btn = page.getByRole('button', { name: 'إجراءات أخرى' });
  await btn.click();
  const menu = page.getByRole('menu', { name: 'إجراءات أخرى' });
  await expect(menu.getByRole('menuitem')).toHaveText(['تعديل البيانات', 'إعادة القياس', 'عاين بعين الخبير', 'اجعله حساب اختبار']);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(btn).toBeFocused();
  await btn.click();
  await menu.getByRole('menuitem', { name: 'تعديل البيانات' }).click();
  await expect(page.getByRole('dialog', { name: /تعديل بيانات/ })).toBeVisible();
});

// التذكير الموحد (P3): في تبويب «السجل» ما سيصله الآن، ومن ذكّره ومتى، وأثر كل تذكير
const ledger = (allowed) => ({
  success: true, ledger: true, total: 2, progressed: 1, gap_days: 3,
  now: { ok: true, allowed, stage: 'التدريب', days: 9, text: 'أنت في مرحلة «التدريب»، وقطعت 40% من رحلتك. خطوتك التالية: خطة المبادرة.' },
  last: { by: 'المرشد', days: allowed ? 5 : 1 },
  rows: [
    { id: 'n2', by: 'المرشد', stage_title: 'التدريب', step: 'خطة المبادرة', created_at: '2026-11-11T10:00:00Z', outcome: 'waiting' },
    { id: 'n1', by: 'الإدارة (omar)', stage_title: 'التهيئة', step: 'الملف', created_at: '2026-11-01T10:00:00Z', outcome: 'progressed', seen_at: '2026-11-02T10:00:00Z' },
  ],
});

test('سجل التذكير في الملف: ما سيصله، ومن ذكّره، والأثر، والإرسال بتأكيد يذكر آخر تذكير', async ({ page }) => {
  const calls = await setup(page, 'enrolled', undefined, { 'admin.nudge-ledger': ledger(true), 'admin.nudge': { success: true, sent: 1, skipped: {}, gap_days: 3 } });
  await tab(page, 'السجل').click();
  const card = page.getByRole('region', { name: /التذكيرات/ });
  await expect(card).toContainText('· 2 · تقدّم بعد 1');
  await expect(card.locator('.nd-sample')).toContainText('خطوتك التالية: خطة المبادرة');
  await expect(card).toContainText('ذكّره المرشد قبل 5 أيام');
  await expect(card.locator('.nd-list li')).toHaveCount(2);
  await expect(card.locator('.nd-list li').first()).toContainText('ينتظر');
  await expect(card.locator('.nd-list li').nth(1)).toContainText('تقدّم بعده');
  await expect(card.locator('.nd-list li').nth(1)).toContainText('رآه في الموقع');
  await card.getByRole('button', { name: 'ذكّره الآن' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('ذكّره المرشد قبل 5 أيام');
  await page.getByRole('alertdialog').getByRole('button', { name: 'أرسل التذكير' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.nudge')?.participant_ids).toEqual(['p1']);
});

test('الحد المشترك: ذُكِّر أمس فالزر معطل ويقول متى يُسمح', async ({ page }) => {
  await setup(page, 'enrolled', undefined, { 'admin.nudge-ledger': ledger(false) });
  await tab(page, 'السجل').click();
  const card = page.getByRole('region', { name: /التذكيرات/ });
  await expect(card.getByRole('button', { name: 'ذكّره الآن' })).toBeDisabled();
  await expect(card).toContainText('ذكّره المرشد أمس، والتذكير التالي بعد 3 أيام من آخر تذكير');
});
