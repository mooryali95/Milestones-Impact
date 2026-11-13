// لوحة الإدارة الجديدة: المنهجية والمسارات ونظرة عامة (الخطوة ٤). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const catalog = {
  success: true,
  journey_stages: [
    { key: 's1', title_ar: 'التهيئة', phase: 'admission', sort: 1, duration_label: 'أسبوع', mode: 'online', active: true },
    { key: 's2', title_ar: 'التأهيل', phase: 'qualification', sort: 2, duration_label: 'شهر', active: true },
  ],
  stage_requirements: [
    { id: 'r1', stage_key: 's1', code: 'T-1', title_ar: 'خطة التطوير', kind: 'upload', sort: 1, required: true, needs_review: true, active: true },
    { id: 'r2', stage_key: 's1', code: 'T-2', title_ar: 'حضور اللقاء', kind: 'check', sort: 2, required: false, active: true },
  ],
  instruments: [{ id: 'i1', key: 'base-v1', kind: 'baseline', version: 1, title_ar: 'القياس القبلي', active: true }],
  locked_instruments: [],
  questions: [{ id: 'q1', instrument_id: 'i1', dimension: 'milestone', tier: 'knowledge', code: 'M-K1', text_ar: 'ما المعلم؟', sort: 1, active: true, options: [{ label: 'تاريخ', score: 0 }, { label: 'نقطة قرار', score: 2 }] }],
  grid_cells: [{ dimension: 'milestone', level: 'beginner', path_title_ar: 'أساس المعالم', description_ar: 'بداية' }],
  level_rules: [],
  placement_model: [{ id: 1, w_knowledge: 30, w_skill: 45, w_behavior: 25, min_intermediate: 55, min_advanced: 80, floor_intermediate: 25, floor_advanced: 50, borderline: 5 }],
  tracks: [{ key: 'M1I1L2', title_ar: 'مسار البداية', milestone_level: 'beginner' }],
  track_stats: { M1I1L2: { total: 3, active: 2, pending: 1 } },
};

async function setup(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': catalog,
      'admin.overview': { success: true, total: 5, by_status: { pending_approval: 2, enrolled: 1 }, pending_reviews: 1, matrix: { milestone: { beginner: 3, intermediate: 1, advanced: 1 }, impact: { beginner: 5, intermediate: 0, advanced: 0 }, leadership: { beginner: 2, intermediate: 2, advanced: 1 } }, funnel: { registered: 5, profiled: 4, assessed: 3, approved: 1, completed: 0 }, tracks_used: 1, top_tracks: [{ key: 'M1I1L2', title: 'مسار البداية', n: 3 }] },
      'admin.reviews': { success: true, pending_approval: [{ id: 'p1', full_name: 'سارة الأحمد' }], submitted: [] },
      // صندوق «ينتظرني» (admin.inbox): اعتماد ونموذج، بعمرهما ووجهتهما
      'admin.inbox': { success: true, total: 2, late: 1, skipped: [], counts: { approval: 1, model: 1 }, items: [
        { kind: 'approval', kind_ar: 'اعتماد مسار', id: 'p1', title: 'سارة الأحمد', sub: 'وزارة التجربة', at: '2026-11-01', days: 12, late: true, to: { tab: 'participants', id: 'p1' } },
        { kind: 'model', kind_ar: 'نموذج للتقييم', id: 'm1', title: 'خالد العتيبي', sub: 'سجل المخاطر', at: '2026-11-12', days: 1, late: false, to: { tab: 'participants', id: 'p2' } }] },
      'admin.track': { success: true, track: { key: 'M1I1L2', title_ar: 'مسار البداية', summary_ar: 'لمن يبدأ', focus_ar: '1. المعالم\n2. الأثر' }, participants: [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled', approved: true }], handbook: [{ id: 'h1', dimension: 'milestone', title: 'باب', md: '## عنوان\n- بند **مهم**\n@chain سلسلة' }], levels: { milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' } },
      'admin.save': { success: true }, 'admin.reorder': { success: true }, 'admin.delete': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return calls;
}
const tab = (page, name) => page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name }).click();

test('نظرة عامة: الأرقام وما ينتظر القرار، والانتقال إلى المسار', async ({ page }) => {
  await setup(page);
  await tab(page, 'نظرة عامة');
  await expect(page.locator('.stat-value').first()).toHaveText('5');
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  await page.getByRole('button', { name: /M1I1L2/ }).click();
  await expect(page.getByRole('heading', { name: 'مسار البداية' })).toBeVisible();
  await expect(page.locator('.la-md b')).toHaveText('مهم');
});

test('نظرة عامة: المستوى العام والجهات والقياس والكتاب وقياس الأثر', async ({ page }) => {
  await setup(page);
  const base = { success: true, total: 5, by_status: { pending_approval: 2 }, pending_reviews: 1, matrix: { milestone: { beginner: 3, intermediate: 1, advanced: 1 }, impact: { beginner: 5, intermediate: 0, advanced: 0 }, leadership: { beginner: 2, intermediate: 2, advanced: 1 } }, funnel: { registered: 5 }, tracks_used: 0, top_tracks: [] };
  const more = {
    new_week: 2, active_week: 3, overall: { beginner: 2, intermediate: 1, advanced: 0 },
    top_orgs: [{ id: 'o1', name: 'سفراء', n: 4 }], orgs_count: 1, via: { link: 3, domain: 1, unassigned: 1 },
    instruments: [{ key: 'baseline-v2', kind: 'baseline', active: true, n: 3, avg: { milestone: 62, impact: 48, leadership: 71 } }],
    book: { readers: 3, chapters: 7, accuracy: 81, submitted: 2, to_review: 1, drafts: 1, rating: 4.5, points_avg: 120, ranks: { مستكشف: 1, ممارس: 2 } },
  };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.impact') return route.fulfill({ json: { success: true, counts: { participants: 5, baseline: 3, post: 2, paired: 2 }, cohort: { milestone: { n: 2, pre: 55, post: 70, diff: 15, reliable_up: 1 } } } });
    if (b.action !== 'admin.overview') return route.fallback();
    return route.fulfill({ json: { ...base, ...more } });
  });
  await tab(page, 'نظرة عامة');
  // البطاقة تعدّ من قائمة «ينتظر قرارك» نفسها (لا متطلبات مرسلة في البيانات) مع النماذج المنتظرة: 0 + 1
  await expect(page.locator('.stat-card').nth(2).locator('.stat-value')).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'المستوى العام' })).toBeVisible();
  await expect(page.getByText('baseline-v2')).toBeVisible();
  await expect(page.locator('.la-impact td.up')).toHaveText('+15');
  // الصندوق الواحد: النموذج المنتظر بنوعه وعمره، والمتأخر عن مهلته معلَّم، والرقاقة تفلتر بالنوع
  const inbox = page.locator('.inbox');
  await expect(inbox.getByRole('heading')).toContainText('2، منها 1 تجاوزت مهلتها');
  await expect(inbox.locator('li.late')).toContainText('سارة الأحمد');
  await inbox.getByRole('button', { name: /نموذج للتقييم/ }).click();
  await expect(inbox.locator('.inbox-list li')).toHaveCount(1);
  await expect(inbox.locator('.inbox-list li')).toContainText('سجل المخاطر');
  await expect(page.getByRole('button', { name: 'سفراء' })).toBeVisible();
});

test('المسارات: اللوحة وتحرير هوية المسار', async ({ page }) => {
  const calls = await setup(page);
  await tab(page, 'المسارات الـ27');
  await expect(page.locator('.tx-cell')).toHaveCount(27);
  await page.locator('.tx-cell', { hasText: 'M1I1L2' }).click();
  await page.getByRole('button', { name: 'تحرير هوية المسار' }).click();
  await page.getByLabel('اسم المسار').fill('مسار البداية الجديد');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'tracks', row: { key: 'M1I1L2', title_ar: 'مسار البداية الجديد' } });
});

test('الرحلة: متطلب جديد بمربعات الاختيار، وترتيب داخل المرحلة', async ({ page }) => {
  const calls = await setup(page);
  await tab(page, 'الرحلة والمتطلبات');
  await page.getByRole('button', { name: '+ متطلب' }).first().click();
  await page.getByLabel('الرمز (فريد، مثل T-ATTEND)').fill('T-9');
  await page.getByLabel('نص المتطلب').fill('رفع التقرير');
  await page.getByLabel('يعتمده المستشار بعد الإنجاز').check();
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({ stage_key: 's1', code: 'T-9', needs_review: true, required: true, dimension: null, sort: 3 });
  await page.getByRole('button', { name: 'نقل لأسفل' }).nth(1).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.reorder')).toMatchObject({ entity: 'stage_requirements', ids: ['r2', 'r1'] });
});

test('القياس: الفقرة وخياراتها ودرجاتها من المستودع، واللوحة تحرر التلميح وحده (D01)', async ({ page }) => {
  const calls = await setup(page);
  await tab(page, 'أسئلة القياس');
  await expect(page.getByText('ما المعلم؟')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'يُعدَّل من المستودع' })).toBeVisible();
  for (const name of ['إصدار جديد', 'تفعيل هذا الإصدار', /^\+ سؤال في/]) await expect(page.getByRole('button', { name })).toHaveCount(0);
  await page.getByRole('button', { name: 'تحرير', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^سؤال / });
  await expect(form.getByLabel('الخيار 1', { exact: true })).toHaveCount(0);
  await expect(form.getByLabel('نص السؤال')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'حذف' })).toHaveCount(0);
  await form.getByLabel('تلميح يظهر تحته').fill('فكّر في آخر مشروع');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row.help_ar).toBe('فكّر في آخر مشروع');
  expect(Object.keys(calls.find((c) => c.action === 'admin.save').row).sort()).toEqual(['help_ar', 'id']);
});

test('المستويات: حاسبة التسكين وحفظ المعيار', async ({ page }) => {
  const calls = await setup(page);
  await tab(page, 'المستويات والتسكين');
  await page.getByRole('button', { name: 'احسب' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'المؤشر المركّب' })).toContainText('51');
  await page.getByRole('button', { name: 'حفظ المعيار' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')).toMatchObject({ entity: 'placement_model', row: { id: 1, min_advanced: 80 } });
});

test('دخول برمز البريد وحده: تنبيه بأن الجلسة للعرض حتى يُفعَّل عامل ثانٍ', async ({ page }) => {
  await setup(page);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.overview') return route.fallback();
    await route.fulfill({ json: { success: true, total: 0, by_status: {}, pending_reviews: 0, mfa_required: true, matrix: { milestone: { beginner: 0, intermediate: 0, advanced: 0 }, impact: { beginner: 0, intermediate: 0, advanced: 0 }, leadership: { beginner: 0, intermediate: 0, advanced: 0 } } } });
  });
  await tab(page, 'نظرة عامة');
  await expect(page.getByRole('alert').filter({ hasText: 'للعرض فقط في هذه الجلسة' })).toBeVisible();
});

