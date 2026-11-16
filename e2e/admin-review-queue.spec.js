// المراجعة المتتالية لملفات المشاركين (اعتمدها المالك 2026-11-16): فتح مشارك من القائمة المفلترة يحفظ ترتيبها،
// فيتنقل المدير بالسابق والتالي ولوحة المفاتيح، و«اعتمد وانتقل للتالي» يفتح التالي بعد نجاح الاعتماد. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const P = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-03' },
  { id: 'p2', full_name: 'خالد العمر', email: 'k@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-02' },
  { id: 'p3', full_name: 'منى السالم', email: 'm@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' },
  { id: 'p4', full_name: 'معتمد سابقًا', email: 'z@x.com', status: 'placed', placements: [], created_at: '2026-09-01' },
];
const ev = (level) => ({ level, composite: 60, borderline: false, flags: [], reason: '', items_to_flip: 2 });
const person = (p) => ({
  success: true, participant: p, progress: 0, history: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [],
  placement_model: { min_intermediate: 55, min_advanced: 80, borderline: 8, floor_intermediate: 50 },
  profile: { approved: false, track: { key: 'M2I2L2', title: 'مسار' }, dimensions: [] },
  assessments: [{ id: `a-${p.id}`, status: 'submitted', submitted_at: '2026-11-02T10:00:00Z', assessment_results: ['milestone', 'impact', 'leadership'].map((d) => (
    { dimension: d, knowledge_pct: 60, skill_pct: 60, behavior_pct: 60, evaluation: ev('intermediate') })) }],
});

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: P },
      'admin.participant': person(P.find((x) => x.id === b.id) || P[0]),
      'admin.approve': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    window.location.hash = '#/leaders/participants?view=approval';
  });
  await page.reload();
  return calls;
}
const nav = (page) => page.getByRole('navigation', { name: 'التنقل بين ملفات القائمة' });
const heading = (page, name) => expect(page.locator('.la-person h3').first()).toHaveText(name);

for (const vp of [{ name: 'الحاسوب', size: { width: 1280, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`المراجعة المتتالية (${vp.name}): الموضع، والسابق والتالي، والعودة بالفلتر نفسه`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    await setup(page);
    await page.getByText('خالد العمر').click();
    await heading(page, 'خالد العمر');
    await expect(nav(page)).toContainText('2 من 3 · بانتظار الاعتماد');
    await nav(page).getByRole('button', { name: /التالي/ }).click();
    await heading(page, 'منى السالم');
    await expect(nav(page).getByRole('button', { name: /التالي/ })).toBeDisabled();
    await nav(page).getByRole('button', { name: /السابق/ }).click();
    await nav(page).getByRole('button', { name: /السابق/ }).click();
    await heading(page, 'سارة الأحمد');
    await expect(nav(page).getByRole('button', { name: /السابق/ })).toBeDisabled();
    // العودة للقائمة بالعرض المفلتر نفسه
    await nav(page).getByRole('button', { name: /القائمة/ }).click();
    await expect(page.getByText('معتمد سابقًا')).toHaveCount(0);
    await expect(page.getByText('منى السالم')).toBeVisible();
  });
}

test('اختصارات لوحة المفاتيح تتنقل، ولا تعمل داخل حقل كتابة', async ({ page }) => {
  await setup(page);
  await page.getByText('سارة الأحمد').click();
  await heading(page, 'سارة الأحمد');
  await page.keyboard.press('ArrowLeft');
  await heading(page, 'خالد العمر');
  await page.keyboard.press('KeyJ');
  await heading(page, 'منى السالم');
  await page.keyboard.press('KeyK');
  await heading(page, 'خالد العمر');
  await page.keyboard.press('ArrowRight');
  await heading(page, 'سارة الأحمد');
  // داخل حقل: السهم يحرك المؤشر فقط
  const field = page.locator('.la-person input, .la-person textarea').first();
  if (await field.count()) {
    await field.focus();
    await page.keyboard.press('ArrowLeft');
    await heading(page, 'سارة الأحمد');
  }
});

test('«اعتمد وانتقل للتالي» يعتمد ثم يفتح التالي، ويختفي في آخر القائمة', async ({ page }) => {
  const calls = await setup(page);
  await page.getByText('خالد العمر').click();
  await heading(page, 'خالد العمر');
  await page.getByRole('button', { name: 'اعتمد وانتقل للتالي' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.approve')?.participant_id).toBe('p2');
  await heading(page, 'منى السالم');
  await expect(page.getByRole('button', { name: 'اعتمد وانتقل للتالي' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' })).toBeVisible();
});

test('ملف مفتوح برابط مباشر بلا قائمة: لا شريط تنقل، والعودة كما كانت', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { sessionStorage.removeItem('mi_admin_review_queue'); window.location.hash = '#/leaders/participants/p1'; });
  await heading(page, 'سارة الأحمد');
  await expect(nav(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '→ كل المشاركين' })).toBeVisible();
});
