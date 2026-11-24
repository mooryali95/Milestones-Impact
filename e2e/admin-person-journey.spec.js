// تبويب «الرحلة» في ملف المشارك بخط واحد (تصور 2026-11-23): أطوار رحلته بترتيبها، والمعلم شريحة في مرحلته، ومصدر
// اكتمال كل بند، ونقله إلى مرحلة بمعاينة وسبب، و«المبادرة» حية، و«السجل» الكامل صفحة صفحة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const journey = [
  { key: 'intro', title_ar: 'التهيئة', phase: 'admission', status: 'done', items: [{ id: 'a1', code: 'P-INFO', kind: 'auto', auto: true, title_ar: 'الملف الشخصي', status: 'done', required: true, completed_at: '2026-10-05T10:00:00Z' }] },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', done: 0, total: 2, items: [
    { id: 'r1', kind: 'reading', title_ar: 'قراءة الأبواب', status: 'pending', required: true, activity: { type: 'reading', count: 2, total: 3, chapters: [] } },
    { id: 'r2', kind: 'upload', title_ar: 'خطة التطوير', status: 'submitted', required: true },
  ] },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', status: 'locked', lock_reason: 'تُفتح بعد اكتمال: التدريب', items: [] },
  { key: 'consulting', title_ar: 'الاستشارة', phase: 'impact', status: 'locked', items: [] },
];
const file = {
  success: true, participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled', placements: [], created_at: '2026-10-01' },
  progress: 35, history: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [], profile: null, assessments: [], journey,
  milestones: [
    { id: 'm1', stage_key: 'training', title_ar: 'نهاية التدريب', status: 'late', due: '2026-11-20', late_days: 2, done: false, scores: {} },
    { id: 'm2', stage_key: null, title_ar: 'لقاء الدفعة', status: 'on_time', due: '2026-12-10', late_days: 0, done: false, scores: {} },
  ],
  milestone_summary: { total: 2, done: 0, late: 1, max_late: 2 }, flags: [], observations: [], sessions: [], timeline: [], feedback360: [], attendance: [],
};

async function setup(page, vp = { width: 1280, height: 900 }, more = {}) {
  await page.setViewportSize(vp);
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participant': file, 'admin.final-eval': { success: false, message: 'لا تقييم' },
      'admin.stage-move': { success: true }, 'admin.review': { success: true },
      ...more,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    sessionStorage.setItem('mi_admin_pf_tab', 'journey');
    window.location.hash = '#/leaders/participants/p1';
  });
  await page.reload();
  await expect(page.locator('.pf-head h3')).toHaveText('سارة الأحمد');
  return calls;
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });

for (const vp of [{ name: 'الحاسوب', size: { width: 1280, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`خط واحد بأطوار رحلته، والحالية مفتوحة والمكتملة مطوية، بلا تمرير أفقي (${vp.name})`, async ({ page }) => {
    await setup(page, vp.size);
    const panel = page.getByRole('tabpanel');
    await expect(panel.locator('.pj-head')).toContainText('المرحلة الحالية: التدريب');
    await expect(panel.locator('.pj-head')).toContainText('الخطوة التالية: قراءة الأبواب');
    await expect(panel.locator('[data-phase]')).toHaveCount(3);
    await expect(panel.locator('[data-phase="admission"]')).toContainText('القبول');
    // المكتملة مطوية بتاريخ اكتمالها، والحالية مفتوحة ببنودها
    const done = panel.locator('[data-stage="intro"]');
    await expect(done.getByRole('button', { name: /التهيئة/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(done).toContainText('مكتملة في');
    await expect(panel.locator('[data-stage="training"] .pj-item')).toHaveCount(2);
    // المعلم شريحة في مرحلته، وما لا مرحلة له في «معالم عامة»
    await expect(panel.locator('[data-stage="training"] [data-milestone="m1"]')).toContainText('متأخر يومين');
    await expect(page.getByRole('region', { name: 'معالم عامة' })).toContainText('لقاء الدفعة');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
}

test('مصدر الاكتمال: البند التلقائي بلا «اعتماد» ويُتجاوز يدويًا بسبب، واليدوي يُعتمد ويُرجع', async ({ page }) => {
  const calls = await setup(page);
  const reading = page.locator('.pj-item[data-source="evidence"]');
  await expect(reading).toContainText('تلقائي');
  await expect(reading).toContainText('قرأ 2 من 3');
  await expect(reading.getByRole('button', { name: 'اعتماد' })).toHaveCount(0);
  const manual = page.locator('.pj-item[data-source="manual"]');
  await expect(manual).toContainText('يدوي');
  await expect(manual.getByRole('button', { name: 'اعتماد' })).toBeVisible();
  await expect(manual.getByRole('button', { name: 'إرجاع' })).toBeVisible();
  await reading.getByRole('button', { name: 'إجراءات «قراءة الأبواب»' }).click();
  await page.getByRole('menuitem', { name: 'تجاوز يدوي' }).click();
  await page.getByRole('dialog').locator('input').fill('قرأها مطبوعة في الورشة');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review')).toMatchObject({ requirement_id: 'r1', status: 'done', note: 'قرأها مطبوعة في الورشة', override: true });
});

test('نقل إلى مرحلة: معاينة كل ناقص قبلها باعتماد أو إعفاء، وسبب مطلوب، وسطر الخطة، وطلب واحد', async ({ page }) => {
  const calls = await setup(page, { width: 390, height: 844 });
  await page.getByRole('button', { name: 'نقل إلى مرحلة…' }).click();
  const dlg = page.getByRole('dialog', { name: /نقل سارة الأحمد/ });
  await dlg.getByLabel('المرحلة').selectOption('consulting');
  await expect(dlg.getByTestId('move-plan')).toContainText('التدريب');
  await dlg.getByRole('radiogroup', { name: 'ماذا يُفعل بـ«التوجيه على رأس العمل»' }).getByText('أعفه منها').click();
  await expect(dlg.getByRole('status')).toContainText('سينتقل إلى «الاستشارة»، وتُعتمد مرحلة واحدة ويُعفى من واحدة');
  await expect(dlg.getByRole('button', { name: 'انقله' })).toBeDisabled();
  await dlg.getByLabel(/السبب/).fill('أنهى التدريب في دفعة سابقة');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  await dlg.getByRole('button', { name: 'انقله' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.stage-move').length).toBe(1);
  expect(calls.find((c) => c.action === 'admin.stage-move')).toMatchObject({ participant_id: 'p1', stage_key: 'consulting', choices: { ojt: 'skip' }, reason: 'أنهى التدريب في دفعة سابقة', notify: true });
});

test('نقل إلى مرحلة: بريد المشارك اختياري، مفعّل افتراضيًا، وإطفاؤه يغيّر سطر الخطة ويرسل notify: false', async ({ page }) => {
  const calls = await setup(page, { width: 1280, height: 900 });
  await page.getByRole('button', { name: 'نقل إلى مرحلة…' }).click();
  const dlg = page.getByRole('dialog', { name: /نقل سارة الأحمد/ });
  await dlg.getByLabel('المرحلة').selectOption('consulting');
  const mail = dlg.getByRole('checkbox', { name: 'أرسل بريدًا للمشارك يسمي مرحلته الجديدة' });
  await expect(mail).toBeChecked();
  await expect(dlg.getByRole('status')).toContainText('يصله بريد يسمي مرحلته الجديدة');
  await mail.uncheck();
  await expect(dlg.getByRole('status')).toContainText('، ولا يصله بريد.');
  await expect(dlg.getByRole('status')).not.toContainText('يصله بريد يسمي');
  await dlg.getByLabel(/السبب/).fill('أنهى التدريب في دفعة سابقة');
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/move-dialog.png` });
  await dlg.getByRole('button', { name: 'انقله' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.stage-move').length).toBe(1);
  expect(calls.find((c) => c.action === 'admin.stage-move')).toMatchObject({ stage_key: 'consulting', notify: false });
});

test('المبادرة حية، والسجل الكامل بمرشح النوع و«اعرض الأقدم»', async ({ page }) => {
  const calls = await setup(page, undefined, {
    'admin.capstone': { success: true, doc: { meta: { initiative: 'رقمنة الطلبات' } }, capstone: { status: 'draft' }, readiness: 30,
      sections: [{ id: 'm1', key: 'initiative-charter', title: 'بطاقة المبادرة', complete: true, missing: 0, status: 'submitted', updated_at: '2026-11-05T10:00:00Z' },
        { id: 'm2', key: 'risks', title: 'سجل المخاطر', complete: false, missing: 3, status: null, updated_at: null }] },
    'admin.participant-timeline': { success: true, rows: [{ at: '2026-11-12T10:00:00Z', type: 'decision', tone: 'info', text: 'نُقل إلى مرحلة', by: 'الإدارة', detail: 'السبب: تقدم' }], next: '2026-11-12T10:00:00Z' },
  });
  await tab(page, 'المبادرة').click();
  const cap = page.getByRole('region', { name: 'رقمنة الطلبات' });
  await expect(cap).toContainText('البطاقة: مسلَّم');
  await expect(cap.locator('[data-chapter="risks"]')).toContainText('فارغ');
  await expect(cap.getByRole('button', { name: 'اقرأ الوثيقة كما هي الآن' })).toBeVisible();
  await expect(cap.getByRole('link', { name: 'صفحة المراجعة' })).toHaveAttribute('href', /capstones/);   // متاحة دائمًا، ولو بلا صف وثيقة (تُبنى من حالته الآن)
  await tab(page, 'السجل').click();
  await expect(page.getByTestId('full-timeline')).toContainText('نُقل إلى مرحلة');
  await page.getByRole('button', { name: 'اعرض الأقدم' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.participant-timeline').at(-1)?.before).toBe('2026-11-12T10:00:00Z');
  await page.getByRole('button', { name: 'قرارات الإدارة' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.participant-timeline').at(-1)?.types).toEqual(['decision']);
});
