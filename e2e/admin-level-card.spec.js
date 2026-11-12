// بطاقة «المستوى في الأبعاد الثلاثة» في ملف المشارك بعد تخفيف الزحام (تصور 2026-11-11، المرحلة 1). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const participant = { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' };
const ev = (level, composite, extra = {}) => ({ level, composite, borderline: false, flags: [], reason: `المؤشر ${composite} من 100`, items_to_flip: 2, ...extra });
const person = {
  success: true, participant, progress: 20, history: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [],
  placement_model: { min_intermediate: 55, min_advanced: 80, borderline: 8, floor_intermediate: 50 },
  profile: {
    approved: false,
    track: { key: 'M2I1L3', title: 'قائد ينفذ بأثر يُقاس', summary: 'ملخص المسار الطويل', strengths: 'نقاط القوة' },
    dimensions: [{ dimension: 'milestone', level: 'intermediate' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'advanced' }],
  },
  assessments: [{ id: 'a1', status: 'submitted', submitted_at: '2026-11-02T10:00:00Z', assessment_results: [
    { dimension: 'milestone', knowledge_pct: 70, skill_pct: 60, behavior_pct: 55, evaluation: ev('intermediate', 62) },
    { dimension: 'impact', knowledge_pct: 40, skill_pct: 50, behavior_pct: 90, evaluation: ev('beginner', 48, { borderline: true, flags: [{ key: 'acquiescence', reason_ar: 'ممارسة بأعلى درجة في كل العبارات' }] }) },
    { dimension: 'leadership', knowledge_pct: 90, skill_pct: 85, behavior_pct: 70, evaluation: ev('advanced', 84, { items_to_flip: null }) },
  ] }],
};

async function open(page, { role = 'admin' } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [participant] },
      'admin.participant': person, 'admin.approve': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() }));
    localStorage.removeItem('mi_admin_list_filters');
    window.location.hash = '#/leaders/participants/p1';
  }, role);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'المستوى في الأبعاد الثلاثة' })).toBeVisible();
  return calls;
}
const card = (page) => page.locator('section.lc');
const row = (page, name) => card(page).getByRole('button', { name: new RegExp(`^${name}`) });

for (const vp of [{ name: 'الحاسوب', size: { width: 1280, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`بطاقة المستوى (${vp.name}): ملخص لكل بُعد، والحدّي والمعلَّم مفتوح وحده، والأعلام نص عادي`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    // الهادئ مطوي، والحدّي المعلَّم مفتوح تلقائيًا بعدد ما يستحق الانتباه
    await expect(row(page, 'Milestone')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Leadership')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Impact')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Impact')).toContainText('⚠2');
    const det = card(page).locator('#lc-det-impact');
    await expect(det.locator('.lc-flags li')).toHaveText(['حالة حدّية: المستوى التالي في متناول هامش صغير', 'ممارسة بأعلى درجة في كل العبارات']);
    await expect(det).toContainText('يفصله سؤالان عن المستوى التالي');
    // لا شارات أعلام مكدسة في الملخص، ولا حقل ملاحظة دائم الظهور
    await expect(card(page).locator('.la-chip.warn', { hasText: 'ممارسة بأعلى' })).toHaveCount(0);
    await expect(card(page).getByLabel('ملاحظة Impact')).toHaveCount(0);
    await expect(det.getByRole('button', { name: '+ ملاحظة' })).toBeVisible();
    // مقياس المؤشر بحدود المستويات من النموذج
    await expect(card(page).getByRole('img', { name: 'المؤشر 48 من 100. حد متوسط 55، وحد احترافي 80' })).toBeVisible();
    await expect(card(page).getByRole('img', { name: 'ممارسة 90%' })).toBeVisible();
    // المسار سطر واحد، و«المزيد» يكشف الملخص
    await expect(page.getByText('ملخص المسار الطويل')).toHaveCount(0);
    await card(page).getByRole('button', { name: 'المزيد' }).click();
    await expect(page.getByText('ملخص المسار الطويل')).toBeVisible();
    // لا تمرير أفقي في الصفحة
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test('بطاقة المستوى بلوحة المفاتيح: Enter يفتح الصف، والاعتماد الناقص ينقل التركيز إلى التعليل ولا يُرسل', async ({ page }) => {
  const calls = await open(page);
  await row(page, 'Milestone').focus();
  await page.keyboard.press('Enter');
  await expect(row(page, 'Milestone')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('مستوى Milestone')).toBeFocused();
  await page.getByLabel('مستوى Milestone').selectOption('advanced');
  const btn = page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' });
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#lc-block')).toHaveText('اكتب سبب مخالفة المستوى المحسوب في Milestone (10 أحرف على الأقل)');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('ملاحظة Milestone')).toBeFocused();
  expect(calls.some((c) => c.action === 'admin.approve')).toBe(false);
  await page.keyboard.type('أداؤه في المختبر يفوق المحسوب بوضوح');
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await btn.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.approve')).toMatchObject({
    levels: { milestone: 'advanced', impact: 'beginner', leadership: 'advanced' }, notes: { milestone: 'أداؤه في المختبر يفوق المحسوب بوضوح' },
  });
});

test('بطاقة المستوى لدور العرض: المستوى نصًا بلا قائمة ولا زر اعتماد', async ({ page }) => {
  await open(page, { role: 'viewer' });
  await row(page, 'Leadership').click();
  await expect(card(page).locator('#lc-det-leadership')).toContainText('المستوى: احترافي');
  await expect(page.getByLabel('مستوى Leadership')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' })).toHaveCount(0);
});
