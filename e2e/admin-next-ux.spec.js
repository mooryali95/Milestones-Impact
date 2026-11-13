// لوحة الإدارة الجديدة: الروابط، وما ينتظر القرار، وحماية التعديل. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const people = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' }];
const person = { success: true, participant: { ...people[0] }, progress: 0, history: [], profile: { dimensions: [] }, assessments: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [] };
const ch = { id: 'h1', dimension: 'milestone', sort: 1, title_ar: 'المعلم', min_level: 'beginner', body_md: 'نص', quiz_md: '' };
const catalog = { success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], tracks: [], track_stats: {}, handbook_modules: [ch], learning_models: [], book_stats: {} };

async function setup(page, hash = '') {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [{ id: 'c1', status: 'new' }, { id: 'c2', status: 'read' }] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.participant': person, 'admin.catalog': catalog,
      'admin.overview': { success: true, total: 1, by_status: {}, pending_reviews: 0, matrix: { milestone: { beginner: 0, intermediate: 0, advanced: 0 }, impact: { beginner: 0, intermediate: 0, advanced: 0 }, leadership: { beginner: 0, intermediate: 0, advanced: 0 } } },
      'admin.reviews': { success: true, pending_approval: [{ id: 'p1', full_name: 'سارة الأحمد' }], submitted: [] },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
      'admin.submissions': { success: true, submissions: [{ id: 's1' }, { id: 's2' }] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(BASE + hash);
  await page.reload();
  // اللوحة تكتب سياقها في العنوان بعد أول رسم؛ الانتقال قبل ذلك يسابقها فيضيع العنوان المطلوب
  await page.waitForFunction(() => window.location.hash.length > 2);
}

test('لكل شاشة رابط: التحديث يبقيك فيها، وزر الرجوع يعيد السابقة', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /تطبيق القادة/ }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: /^المشاركون/ }).click();
  await page.getByText('سارة الأحمد').first().click();
  await expect(page).toHaveURL(/#\/leaders\/participants\/p1$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/leaders\/participants$/);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
});

test('رابط مباشر إلى تبويب يفتحه من أول تحميل', async ({ page }) => {
  await setup(page, '#/leaders/handbook');
  await expect(page.getByRole('heading', { name: 'كتاب القائد' })).toBeVisible();
});

test('أعداد ما ينتظر القرار على السياقات والتبويبات', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: /طلبات التواصل/ }).locator('.ctx-badge')).toHaveText('1');
  await expect(page.getByRole('button', { name: /تطبيق القادة/ }).locator('.ctx-badge')).toHaveText('3');
  await page.getByRole('button', { name: /تطبيق القادة/ }).click();
  const tabs = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  await expect(tabs.getByRole('button', { name: /المشاركون/ }).locator('.la-badge')).toHaveText('1');
  await expect(tabs.getByRole('button', { name: /كتيب القائد/ }).locator('.la-badge')).toHaveText('2');
  await tabs.getByRole('button', { name: 'نظرة عامة' }).click();
  await expect(page.getByRole('link', { name: 'طلبات تواصل جديدة' })).toBeVisible();
});

test('المحرر يحمي التعديل: تأكيد قبل الإغلاق، ومسودة تُستعاد', async ({ page }) => {
  await setup(page, '#/leaders/handbook');
  await page.getByRole('button', { name: /^المعلم/ }).click();
  const ed = page.getByRole('dialog', { name: 'تحرير الباب: المعلم' });
  await ed.getByLabel('محتوى الباب').fill('نص معدّل لم يُحفظ');
  await page.waitForTimeout(800);
  await ed.getByRole('button', { name: 'إغلاق' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(ed).toBeHidden();
  await page.getByRole('button', { name: /^المعلم/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'استعادة المسودة' }).click();
  await expect(page.getByLabel('محتوى الباب')).toHaveValue('نص معدّل لم يُحفظ');
});

test('البحث الشامل: Ctrl+K، والأسهم وEnter تفتح النتيجة', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: /^بحث/ })).toBeVisible();   // الإطار حاضر قبل الاختصار
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'البحث الشامل' });
  await box.fill('ساره');
  await expect(page.getByRole('option', { name: /سارة الأحمد/ })).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/#\/leaders\/participants\/p1$/);
  await page.getByRole('button', { name: /^بحث/ }).click();
  await page.getByRole('combobox', { name: 'البحث الشامل' }).fill('كتيب');
  await page.getByRole('combobox', { name: 'البحث الشامل' }).press('Enter');
  await expect(page).toHaveURL(/#\/leaders\/handbook$/);
});

test('مراجعة المتطلبات دفعة واحدة من النظرة العامة', async ({ page }) => {
  const reviewed = [];
  await setup(page);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.review') { reviewed.push(b); return route.fulfill({ json: { success: true } }); }
    if (b.action === 'admin.reviews') {
      return route.fulfill({ json: { success: true, pending_approval: [], submitted: [
        { participant_id: 'p1', requirement_id: 'r1', completed_at: '2026-10-20', participants: { full_name: 'سارة الأحمد' }, stage_requirements: { title_ar: 'خطة التطوير' } },
        { participant_id: 'p2', requirement_id: 'r1', completed_at: '2026-10-21', participants: { full_name: 'عمر علي' }, stage_requirements: { title_ar: 'خطة التطوير' } },
      ] } });
    }
    return route.fallback();
  });
  await page.goto(BASE + '#/leaders/overview');
  await page.reload();
  await page.getByLabel('تحديد الكل').check();
  await page.getByRole('button', { name: 'اعتماد المحدد (2)' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => reviewed.length).toBe(2);
  expect(reviewed.map((x) => [x.participant_id, x.status])).toEqual([['p1', 'done'], ['p2', 'done']]);
});

test('القوائم: فرز بالعمود يُحفظ في العنوان، والفلاتر تبقى عند العودة للشاشة', async ({ page }) => {
  await setup(page);
  const contacts = ['منى', 'أحمد', 'سارة', 'خالد'].map((name, i) => ({ id: `c${i}`, name, email: `u${i}@x.sa`, status: 'new', product: 'MI-HOME', created_at: `2026-11-0${i + 1}T08:00:00Z` }));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts } }));
  await page.goto(`${BASE}#/contacts`);
  await page.reload();
  const names = () => page.locator('.data-table tbody tr td:first-child strong').allTextContents();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(4);
  const before = await names();
  const th = page.locator('thead th', { hasText: 'الاسم' });
  await th.getByRole('button').click();
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  await expect(page).toHaveURL(/sort=name/);
  const sorted = await names();
  expect(sorted).toEqual([...before].sort(new Intl.Collator('ar', { numeric: true, sensitivity: 'base' }).compare));
  await th.getByRole('button').click();
  await expect(th).toHaveAttribute('aria-sort', 'descending');
  expect(await names()).toEqual([...sorted].reverse());
  await expect(page.getByRole('button', { name: 'مسح الكل' })).toHaveCount(0);   // الفرز ليس فلترة
  // مغادرة الشاشة ثم العودة: الفرز والبحث كما تُركا
  await page.getByRole('search').getByLabel('بحث').fill('سار');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.goto(`${BASE}#/visits`);
  await expect(page).not.toHaveURL(/sort=/);
  await page.goto(`${BASE}#/contacts`);
  await expect(page.getByRole('search').getByLabel('بحث')).toHaveValue('سار');
  await expect(page.locator('thead th', { hasText: 'الاسم' })).toHaveAttribute('aria-sort', 'descending');
});

test('الدخول يفتح النظرة العامة لتطبيق القادة، وخطأ في رسم شاشة لا يُسقط اللوحة', async ({ page }) => {
  await setup(page);
  await expect(page).toHaveURL(/#\/leaders$/);
  await expect(page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'نظرة عامة' })).toHaveAttribute('aria-current', 'page');
  // رد يُسقط رسم شاشة المشاركين: الحاجز يعرض رسالة، والتنقل يبقى يعمل
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.participants') return route.fallback();
    await route.fulfill({ json: { success: true, participants: [null] } });
  });
  await page.goto(`${BASE}#/leaders/participants`);
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّر عرض هذه الشاشة' })).toBeVisible();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'نظرة عامة' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّر عرض هذه الشاشة' })).toHaveCount(0);
});

test('الرؤية الشاملة: الخانة تفتح أصحابها في قائمة المشاركين، وحِمل الخبراء، وماذا تغيّر', async ({ page }) => {
  await setup(page);
  const stages = (o) => ({ profile: 0, assessment_todo: 0, assessment_doing: 0, approval: 0, placed: 0, enrolled: 0, completed: 0, out: 0, ...o });
  const g = (key, name, total, st, extra = {}) => ({ key, name, total, stages: stages(st), stuck: (st.profile || 0) + (st.assessment_doing || 0), waiting: st.approval || 0, active_week: 1, approved_pct: 50, completed_pct: 0, active_pct: 50, ...extra });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.insight') return route.fulfill({ json: { success: true,
      by_org: { groups: [g('o1', 'وزارة التجربة', 3, { profile: 2, approval: 1 }), g('none', 'بدون جهة', 1, { enrolled: 1 })], total: g('all', 'الإجمالي', 4, { profile: 2, approval: 1, enrolled: 1 }) },
      by_cohort: { groups: [g('c1', 'دفعة الخريف', 4, { profile: 2, approval: 1, enrolled: 1 }, { status: 'running', org: 'وزارة التجربة' })], total: g('all', 'الإجمالي', 4, { profile: 2, approval: 1, enrolled: 1 }) },
      experts: [{ id: 'e1', name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'], hours: 4, requests: 3, upcoming: 2, people: 3, demand: 5, state: 'over', share: 125 }, { id: 'e2', name: 'خالد العتيبي', title: '', roles: ['coach'], hours: 6, requests: 0, upcoming: 0, people: 0, demand: 0, state: 'idle', share: 0 }] } });
    if (b.action === 'admin.changes') return route.fulfill({ json: { success: true, more: false, next: null, changes: [{ id: 1, at: '2026-11-13T09:00:00Z', area: 'participant', area_ar: 'المشاركون', text: 'تغيّرت حالته', known: true, actor_type: 'admin', by: 'a@x', participant_id: 'p1', who: 'سارة الأحمد', detail: 'مخالفة الميثاق' }] } });
    return route.fallback();
  });
  await page.goto(`${BASE}#/leaders/insight`);
  const table = page.locator('.ins-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tfoot')).toContainText('4');
  // خانة «لم يكمل الملف» للوزارة = 2، ورابطها يحمل فلتر الجهة والخطوة
  const cell = table.locator('tbody tr', { hasText: 'وزارة التجربة' }).locator('a.ins-n').first();
  await expect(cell).toHaveText('2');
  await expect(cell).toHaveAttribute('href', '#/leaders/participants?org=o1&step=profile');
  await page.getByRole('tab', { name: 'بالدفعة' }).click();
  await expect(page.locator('.ins-table tbody tr')).toContainText('دفعة الخريف');
  await expect(page.locator('.ins-table tbody tr a.ins-n').first()).toHaveAttribute('href', '#/leaders/participants?cohort=c1&step=profile');
  await page.getByRole('tab', { name: 'حِمل الخبراء' }).click();
  await expect(page.locator('.data-table tbody tr').first()).toContainText('فوق طاقته');
  await page.getByLabel('الحِمل', { exact: true }).selectOption('idle');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'ماذا تغيّر' }).click();
  await expect(page.locator('.ins-log li')).toContainText('تغيّرت حالته');
  await expect.poll(() => calls.find((c) => c.action === 'admin.changes')).toMatchObject({ days: 7 });
  await page.getByLabel('المجال', { exact: true }).selectOption('cohort');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.changes').at(-1)).toMatchObject({ area: 'cohort' });
  // القسم المختار يبقى عند العودة
  await page.goto(`${BASE}#/leaders/overview`);
  await page.goto(`${BASE}#/leaders/insight`);
  await expect(page.getByRole('tab', { name: 'ماذا تغيّر' })).toHaveAttribute('aria-selected', 'true');
});
