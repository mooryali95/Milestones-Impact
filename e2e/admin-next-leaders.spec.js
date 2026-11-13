// لوحة الإدارة الجديدة: تطبيق القادة (المشاركون والجهات). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const pl = (m, i, l, ok = true) => [['milestone', m], ['impact', i], ['leadership', l]].map(([dimension, level]) => ({ dimension, level, approved_at: ok ? '2026-10-01' : null }));
const people = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'pending_approval', placements: pl('beginner', 'beginner', 'intermediate', false), created_at: '2026-10-01' },
  { id: 'p2', full_name: 'Omar Ali', email: 'o@x.com', job_title: 'مهندس', organization_id: null, organization_name: 'شركة', status: 'enrolled', placements: pl('advanced', 'advanced', 'advanced'), created_at: '2026-10-02' },
];
const orgs = [{ id: 'o1', name: 'وزارة التجربة', short_name: 'وت', color: '#12414E', invite_code: 'wt01', seats: 10, status: 'active', domains: ['wt.gov.sa'], stats: { total: 1, registered: 1, profiled: 1, assessed: 1, approved: 0, completed: 0, pending_approval: 1, active_week: 1 } }];
const person = {
  success: true, participant: { ...people[0], phone: '0500', last_login_at: '2026-10-20' }, progress: 20, history: [],
  profile: { approved: false, dimensions: [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'intermediate' }] },
  assessments: [{ status: 'submitted', assessment_results: [{ dimension: 'milestone', knowledge_pct: 50, evaluation: { level: 'beginner', composite: 48 } }] }],
  journey: [{ key: 's1', title_ar: 'التهيئة', status: 'active', items: [{ id: 'r1', title_ar: 'خطة التطوير', status: 'submitted', evidence_path: 'e/1.pdf' }] }],
  points: { total: 30, rank: { title: 'مستكشف' } }, book: [], models: [],
};

async function setup(page, overrides = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs, unassigned: { total: 1, typed: [{ name: 'شركة', n: 1 }] } },
      'admin.participants': { success: true, participants: b.status ? people.filter((p) => p.status === b.status) : people },
      'admin.participant': person,
      'admin.org': { success: true, org: orgs[0], participants: [{ ...people[0], track: 'M1I1L2', track_title: 'مسار البداية' }], funnel: { ...orgs[0].stats, withdrawn: 0 }, by_track: { M1I1L2: 1 }, by_via: { link: 1 }, by_campaign: {}, by_site: {} },
      'admin.approve': { success: true }, 'admin.review': { success: true }, 'admin.assign-org': { success: true, moved: 1 },
      'admin.save': { success: true, row: { id: 'o1' } }, 'admin.create-participant': { success: true },
      'admin.coordinator': { success: true, coordinator: null },
      ...overrides,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    localStorage.removeItem('mi_admin_list_filters');
  });
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  return calls;
}

test('قائمة المشاركين: شريط الفلترة الموحّد، والعروض السريعة، والفلاتر في عنوان الصفحة', async ({ page }) => {
  await setup(page);
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('وت', { exact: true })).toBeVisible();
  await page.getByLabel('بحث', { exact: true }).fill('omar');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('بحث', { exact: true }).fill('');
  await page.getByRole('combobox', { name: 'المسارات' }).selectOption('M1I1L2');
  await expect(rows).toHaveCount(1);
  await page.getByRole('combobox', { name: 'المسارات' }).selectOption('');
  // عرض سريع بعدّاده: واحدة بانتظار الاعتماد
  const approval = page.getByRole('button', { name: /بانتظار الاعتماد/ });
  await expect(approval).toContainText('1');
  await approval.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('سارة الأحمد');
  await approval.click();
  await page.getByRole('combobox', { name: 'الحالات' }).selectOption('enrolled');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('الحالات: في البرنامج')).toBeVisible();
  expect(page.url()).toContain('status=enrolled');
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
  await expect(page.getByRole('combobox', { name: 'الحالات' })).toHaveValue('enrolled');
  await page.getByRole('button', { name: 'مسح الكل' }).click();
  await expect(page.getByRole('combobox', { name: 'الحالات' })).toHaveValue('');
  await expect(rows).toHaveCount(2);
});

test('النقل الجماعي إلى جهة بتأكيد', async ({ page }) => {
  const calls = await setup(page);
  await page.getByLabel('تحديد Omar Ali').check();
  await page.getByLabel('نقل إلى جهة').selectOption('o1');
  await page.getByRole('button', { name: 'نقل', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.assign-org')).toMatchObject({ participant_ids: ['p2'], organization_id: 'o1' });
});

test('ملف المشارك: اعتماد المستويات، وإعادة بند بملاحظة', async ({ page }) => {
  const calls = await setup(page);
  await page.getByText('سارة الأحمد').click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  // بطاقة المستوى: صف ملخص لكل بُعد، والقرار في تفاصيله المطوية
  await page.getByRole('button', { name: /^Leadership/ }).click();
  await expect(page.getByLabel('مستوى Leadership')).toHaveValue('intermediate');
  await page.getByRole('button', { name: /^Impact/ }).click();
  await page.getByLabel('مستوى Impact').selectOption('advanced');
  // مخالفة المستوى القائم تلزمها علة مكتوبة: رقاقة تنبيه، وسبب ظاهر تحت الزر، ولا إرسال بدونها
  await expect(page.getByText(/يلزم تعليل/)).toBeVisible();
  await expect(page.locator('#lc-block')).toHaveText('اكتب سبب مخالفة المستوى المحسوب في Impact (10 أحرف على الأقل)');
  // الزر معطّل بـaria-disabled فيبقى قابلًا للتركيز والنقر، والنقر يفتح الحقل الناقص ولا يرسل
  await page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' }).click({ force: true });
  await expect(page.getByLabel('ملاحظة Impact')).toBeFocused();
  expect(calls.find((c) => c.action === 'admin.approve')).toBeUndefined();
  await page.getByLabel('ملاحظة Impact').fill('تقاريره الميدانية ومختبره يفوقان المحسوب بوضوح');
  await expect(page.locator('#lc-block')).toHaveCount(0);
  await page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.approve')?.levels).toEqual({ milestone: 'beginner', impact: 'advanced', leadership: 'intermediate' });
  expect(calls.find((c) => c.action === 'admin.approve').notes).toMatchObject({ impact: 'تقاريره الميدانية ومختبره يفوقان المحسوب بوضوح' });

  await page.getByRole('button', { name: 'إعادة مع ملاحظة' }).click();
  await page.getByRole('dialog').locator('input').fill('أضف المؤشرات');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review')).toMatchObject({ status: 'returned', note: 'أضف المؤشرات', requirement_id: 'r1' });
  await page.getByRole('button', { name: '→ كل المشاركين' }).click();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
});

// admin-core-1: كان فعل المرحلة يُرسل في حقل action فيحل محل اسم الإجراء، فيرد الخادم «إجراء غير معروف» ولا يصل التدخل
test('ملف المشارك: التدخل في مرحلة يصل إلى الخادم بفعله وسببه، وإلغاؤه بفعل فارغ', async ({ page }) => {
  const journey = [
    { key: 's1', title_ar: 'التهيئة', status: 'active', items: [] },
    { key: 's2', title_ar: 'التدريب', status: 'locked', override: 'skip', items: [] },
  ];
  const calls = await setup(page, { 'admin.participant': { ...person, journey }, 'admin.stage-override': { success: true } });
  await page.getByText('سارة الأحمد').click();
  await page.getByRole('button', { name: 'اعتمد اكتمالها' }).click();
  await page.getByRole('dialog').locator('input').fill('أنجزها في ورشة حضورية موثقة');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByRole('status')).toHaveText('تم');
  const sent = calls.filter((c) => c.action === 'admin.stage-override');
  expect(sent[0]).toEqual({ action: 'admin.stage-override', token: 't', participant_id: 'p1', stage_key: 's1', stage_action: 'complete', note: 'أنجزها في ورشة حضورية موثقة' });

  await page.getByRole('button', { name: 'إلغاء التدخل' }).click();
  await page.getByRole('dialog').locator('input').fill('أُعفي خطأً');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.stage-override').length).toBe(2);
  expect(calls.filter((c) => c.action === 'admin.stage-override')[1]).toMatchObject({ stage_key: 's2', stage_action: '' });
  expect(calls.some((c) => ['complete', 'open', 'skip', ''].includes(c.action))).toBe(false);
});

test('الجهات: البطاقات ولوحة الجهة ورابط الحملة والتحرير', async ({ page }) => {
  const calls = await setup(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await expect(page.locator('.la-org b', { hasText: 'وزارة التجربة' })).toBeVisible();
  await expect(page.getByText('1 بانتظار اعتمادك')).toBeVisible();
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  await expect(page.getByText('https://leaders.sunkvalue.com/j/wt01')).toBeVisible();
  await page.getByLabel('اسم الحملة').fill('واتساب');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toContainText('اسم الحملة');
  await page.getByLabel('اسم الحملة').fill('whatsapp');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toHaveText('نُسخ رابط الحملة');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://leaders.sunkvalue.com/j/wt01/whatsapp');

  await page.getByRole('button', { name: 'تحرير', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: /وزارة التجربة/ });
  await expect(form.getByText('wt.gov.sa')).toBeVisible();
  await expect(form.getByRole('button', { name: 'حفظ التعديلات' })).toBeDisabled();
  await form.getByRole('button', { name: 'زيادة' }).click();
  await form.getByLabel('أضف موقعًا').fill('portal.wt.gov.sa');
  await form.getByLabel('أضف موقعًا').press('Enter');
  await form.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({ id: 'o1', seats: 11, domains: 'wt.gov.sa,portal.wt.gov.sa' });
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
});

test('المراقب يرى دون أدوات التعديل', async ({ page }) => {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: true, participants: people, orgs, unassigned: {} } }));
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مراقب', email: 'v@x', role_id: 'viewer' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await expect(page.getByText('عرض فقط')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ مشارك' })).toHaveCount(0);
  await expect(page.getByLabel('تحديد الكل')).toHaveCount(0);
});

test('قائمة المشاركين: «أين توقف» للمتعثر قبل الاعتماد، وعرضه السريع بعدّاده', async ({ page }) => {
  const doing = { step: 'assessment_doing', label: 'القياس جارٍ', answered: 42, total: 63, missing: [], remaining: 'أجاب 42 من 63، وبقي 21' };
  const stuck = { id: 'p3', full_name: 'هند السالم', email: 'h@x.com', organization_id: 'o1', organization_name: 'وزارة التجربة', status: 'profiled', placements: [], created_at: '2026-11-11', onboarding: doing };
  await setup(page, {
    'admin.participants': { success: true, participants: [...people.map((p) => ({ ...p, onboarding: { step: 'done', label: 'معتمد', remaining: '' } })), stuck] },
    'admin.participant': { ...person, participant: { ...stuck, last_login_at: '2026-11-12' }, assessments: [], onboarding: { ...doing, started_at: '2026-11-11', last_answer_at: '2026-11-12' } },
  });
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(3);
  const row = rows.filter({ hasText: 'هند السالم' });
  await expect(row).toContainText('القياس جارٍ');
  await expect(row).toContainText('أجاب 42 من 63، وبقي 21');
  await expect(row.getByRole('progressbar', { name: 'أجاب 42 من 63' })).toBeVisible();
  // من اعتُمد لا يحمل شارة توقف
  await expect(rows.filter({ hasText: 'Omar Ali' })).not.toContainText('معتمد');
  const chip = page.getByRole('button', { name: /لم يكمل التسجيل/ });
  await expect(chip).toContainText('1');
  await chip.click();
  await expect(rows).toHaveCount(1);
  await row.click();
  await expect(page.locator('.la-where')).toContainText('أين توقف: القياس جارٍ. أجاب 42 من 63، وبقي 21.');
});
