// لوحة الإدارة الجديدة: الروابط، وما ينتظر القرار، وحماية التعديل. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const people = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' }];
const person = { success: true, participant: { ...people[0] }, progress: 0, history: [], profile: { dimensions: [] }, assessments: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [] };
const ch = { id: 'h1', dimension: 'milestone', sort: 1, title_ar: 'المعلم', min_level: 'beginner', body_md: 'نص', quiz_md: '' };
const catalog = { success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], tracks: [], track_stats: {}, handbook_modules: [ch], learning_models: [], book_stats: {} };

const INBOX = { success: true, total: 3, late: 0, skipped: [], counts: { approval: 1, model: 2 }, by_tab: { participants: { n: 1, late: 0 }, handbook: { n: 2, late: 0 } }, items: [] };
async function setup(page, hash = '', inbox = INBOX, extra = {}) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [{ id: 'c1', status: 'new' }, { id: 'c2', status: 'read' }] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: people },
      'admin.participant': person, 'admin.catalog': catalog,
      'admin.overview': { success: true, total: 1, by_status: {}, pending_reviews: 0, matrix: { milestone: { beginner: 0, intermediate: 0, advanced: 0 }, impact: { beginner: 0, intermediate: 0, advanced: 0 }, leadership: { beginner: 0, intermediate: 0, advanced: 0 } } },
      'admin.reviews': { success: true, pending_approval: [{ id: 'p1', full_name: 'سارة الأحمد' }], submitted: [] },
      // «العدّ الواحد»: عدّادات التبويبات من الصندوق نفسه (by_tab)، لا من admin.reviews وadmin.submissions
      'admin.inbox': inbox,
      'admin.submissions': { success: true, submissions: [{ id: 's1' }, { id: 's2' }] },
    };
    const x = extra[b.action];
    await route.fulfill({ json: (typeof x === 'function' ? x(b) : x) ?? (typeof inbox === 'function' && b.action === 'admin.inbox' ? inbox() : replies[b.action]) ?? { success: false, message: 'غير متوقع' } });
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
  await expect(tabs.getByRole('button', { name: /كتاب القائد/ }).locator('.la-badge')).toHaveText('2');
  await tabs.getByRole('button', { name: 'نظرة عامة' }).click();
  await expect(page.getByRole('link', { name: 'طلبات تواصل جديدة' })).toBeVisible();
});

test('العدّاد يحمرّ حين يتأخر بند عن مهلته، و«99+» فوق التسعة والتسعين، والمتعذر لا يُظهر صفرًا', async ({ page }) => {
  const calls = [];
  page.on('request', (r) => { if (/leaders-api/.test(r.url())) calls.push(JSON.parse(r.postData() || '{}').action); });
  await setup(page, '#/leaders/overview', {
    success: true, total: 132, late: 2, skipped: ['erasure'], counts: { approval: 5, model: 120, sponsor: 7 },
    by_tab: { participants: { n: 5, late: 2 }, handbook: { n: 120, late: 0 }, orgs: { n: 7, late: 0 } }, items: [],
  });
  const tabs = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  // طلب الحذف متعذر: تبويب المشاركين بلا عدّاد بدل رقم ناقص، والمجموع معلَّم بأنه قد يزيد
  await expect(tabs.getByRole('button', { name: /كتاب القائد/ }).locator('.la-badge')).toHaveText('99+');
  // طلبات الرعاية عدّادها على «الجهات» (badge في INBOX_KINDS)، ظاهرًا في «العمل» لا في «الإعداد» المطوية
  await expect(tabs.getByRole('button', { name: /^الجهات/ }).locator('.la-badge')).toHaveText('7');
  await expect(tabs.getByRole('button', { name: /^مجموعة الإعداد/ }).locator('.la-badge')).toHaveCount(0);
  await expect(tabs.getByRole('button', { name: /^المشاركون/ }).locator('.la-badge')).toHaveCount(0);
  const ctx = page.getByRole('button', { name: /تطبيق القادة/ }).locator('.ctx-badge');
  await expect(ctx).toHaveText('99+');
  await expect(ctx).toHaveAttribute('aria-label', '127 أو أكثر بانتظارك');
  // طلب واحد لـ admin.inbox يرسم الصندوق والعدّادات معًا، ولا طلب لمصادر العدّ القديمة
  await expect(page.locator('#inbox-h')).toBeVisible();
  expect(calls.filter((a) => a === 'admin.inbox')).toHaveLength(1);
  expect(calls.filter((a) => a === 'admin.submissions' || a === 'admin.capstones')).toHaveLength(0);
});

test('عدّاد أحمر بوصف مسموع لما تأخر عن مهلته', async ({ page }) => {
  await setup(page, '#/leaders/overview', {
    success: true, total: 5, late: 2, skipped: [], counts: { approval: 5 }, by_tab: { participants: { n: 5, late: 2 } }, items: [],
  });
  const b = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: /^المشاركون/ }).locator('.la-badge');
  await expect(b).toHaveText('5');
  await expect(b).toHaveClass(/late/);
  await expect(b).toHaveAttribute('aria-label', '5 بانتظارك، منها 2 متأخر');
  await expect(page.getByRole('button', { name: /تطبيق القادة/ }).locator('.ctx-badge')).toHaveClass(/late/);
});

test('قرار في نوع من الصندوق يحدّث عدّاده فورًا، والمجموعة المطوية تُعلَّم ناقصة وتُسمع عددها', async ({ page }) => {
  // طلب رعاية ينتظر: عدّاد «الجهات» 1. بعد القرار يرد الصندوق بلا شيء، فيختفي العدّاد بلا انتظار الدقيقتين
  let decided = false;
  const inboxCalls = [];
  const req = { id: 'r1', participant_id: 'p1', kind: 'name', status: 'pending', typed_name: 'جهة', suggestions: [{ id: 'o1', name: 'جهة', score: 0.9 }], participants: { full_name: 'سارة الأحمد', email: 's@x.com' }, created_at: '2026-11-10T10:00:00Z' };
  await setup(page, '#/leaders/payments', () => {
    inboxCalls.push(decided);
    return decided ? { success: true, total: 0, late: 0, skipped: [], counts: {}, by_tab: {}, items: [] }
      : { success: true, total: 1, late: 0, skipped: [], counts: { sponsor: 1 }, by_tab: { orgs: { n: 1, late: 0 } }, items: [] };
  }, {
    'admin.payments': { success: true, settings: {}, configured: true, payments: [], entitlements: [], daily: [], sponsors: [], health: {}, kpis: {} },
    'admin.sponsor-requests': () => ({ success: true, requests: [{ ...req, status: decided ? 'approved' : 'pending' }], orgs: [{ id: 'o1', name: 'جهة' }] }),
    'admin.sponsor-decide': () => { decided = true; return { success: true }; },
  });
  const tabs = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  const pay = tabs.getByRole('button', { name: /^الجهات/ }).locator('.la-badge');
  await expect(pay).toHaveText('1');
  await page.getByRole('button', { name: 'طلبات الرعاية' }).click();
  await page.getByRole('button', { name: 'اربط وأعفِ' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => inboxCalls.includes(true)).toBe(true);
  await expect(pay).toHaveCount(0);
  await expect(page.getByRole('button', { name: /تطبيق القادة/ }).locator('.ctx-badge')).toHaveCount(0);
});

test('المجموعة المطوية: نوع متعذر فيها يجعل عددها ناقصًا («+»)، واسم زرها يحمل الوصف المسموع', async ({ page }) => {
  await setup(page, '#/leaders/handbook', {
    success: true, total: 4, late: 1, skipped: ['erasure'], counts: { capstone: 3, coaching_confirm: 1 },
    by_tab: { capstones: { n: 3, late: 1 }, activities: { n: 1, late: 0 } }, items: [],
  });
  const nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  const daily = nav.getByRole('button', { name: /^مجموعة العمل/ });
  await daily.click();
  await expect(daily.locator('.la-badge')).toHaveText('4+');
  await expect(daily).toHaveAttribute('aria-label', 'مجموعة العمل، 4 أو أكثر بانتظارك، منها 1 متأخر');
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
  await page.getByRole('combobox', { name: 'البحث الشامل' }).fill('كتاب');
  await page.getByRole('combobox', { name: 'البحث الشامل' }).press('Enter');
  await expect(page).toHaveURL(/#\/leaders\/handbook$/);
});

// طابور المتطلبات المحذوف انتقل إلى «قرارات اليوم» (تصور تبويبات الإدارة 2026-11-24): خانة لكل بند متطلب واعتماد جماعي بتأكيد
const reqItem = (pid, name) => ({ kind: 'requirement', kind_ar: 'متطلب للمراجعة', id: `${pid}:r1`, title: name, sub: 'خطة التطوير', at: '2026-10-20', days: 3, late: false, to: { tab: 'participants', id: pid } });
const REQ_INBOX = { success: true, total: 3, late: 0, skipped: [], counts: { requirement: 2, approval: 1 }, by_tab: { participants: { n: 3, late: 0 } },
  items: [reqItem('p1', 'سارة الأحمد'), reqItem('p2', 'عمر علي'), { kind: 'approval', kind_ar: 'اعتماد مسار', id: 'p3', title: 'خالد', sub: '', at: '2026-10-20', days: 1, late: false, to: { tab: 'participants', id: 'p3' } }] };

test('مراجعة المتطلبات دفعة واحدة من «قرارات اليوم»: تحديد وتأكيد، وadmin.review لكل واحد', async ({ page }) => {
  const reviewed = [];
  // البندان إقرار ذاتي (check): الجماعي لهما وحدهما بعلم bulk (تصور المرحلة 2، 2.4)
  const self = (pid) => ({ participant_id: pid, requirement_id: 'r1', evidence_path: null, stage_requirements: { kind: 'check' } });
  await setup(page, '#/leaders/overview', REQ_INBOX, { 'admin.review': (b) => { reviewed.push(b); return { success: true }; },
    'admin.reviews': { success: true, pending_approval: [], submitted: [self('p1'), self('p2')] } });
  const box = page.getByRole('group', { name: 'اعتماد المتطلبات' });
  await expect(box.getByRole('button', { name: 'اعتمد المحدد' })).toBeDisabled();
  // بند اعتماد المسار بلا خانة: الاعتماد الجماعي هنا للمتطلبات وحدها
  await expect(page.locator('.inbox-list li input[type="checkbox"]')).toHaveCount(2);
  await page.getByLabel('تحديد خطة التطوير لـ عمر علي').check();
  await expect(box.getByRole('button', { name: 'اعتمد المحدد (1)' })).toBeEnabled();
  await box.getByLabel(/حدد المتطلبات ذاتية الإقرار المعروضة \(2\)/).check();
  await box.getByRole('button', { name: 'اعتمد المحدد (2)' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => reviewed.length).toBe(2);
  expect(reviewed.map((x) => [x.participant_id, x.requirement_id, x.status, x.bulk])).toEqual([['p1', 'r1', 'done', true], ['p2', 'r1', 'done', true]]);
});

test('دليل المتطلب في «قرارات اليوم»: من admin.reviews نفسه، ويُفتح بطلب admin.evidence-url المسجَّل', async ({ page }) => {
  const opened = [];
  await setup(page, '#/leaders/overview', REQ_INBOX, {
    'admin.reviews': { success: true, pending_approval: [], submitted: [{ participant_id: 'p1', requirement_id: 'r1', evidence_path: 'p1/plan.pdf' }, { participant_id: 'p2', requirement_id: 'r1', evidence_path: null }] },
    'admin.evidence-url': (b) => { opened.push(b); return { success: true, url: 'about:blank' }; },
  });
  const rows = page.locator('.inbox-list li');
  await expect(rows.filter({ hasText: 'سارة الأحمد' }).getByRole('button', { name: 'الدليل' })).toBeVisible();
  await expect(rows.filter({ hasText: 'عمر علي' }).getByRole('button', { name: 'الدليل' })).toHaveCount(0);
  const popup = page.waitForEvent('popup');
  await rows.filter({ hasText: 'سارة الأحمد' }).getByRole('button', { name: 'الدليل' }).click();
  await (await popup).close();
  expect(opened).toEqual([{ action: 'admin.evidence-url', participant_id: 'p1', path: 'p1/plan.pdf' }].map(({ action, ...x }) => expect.objectContaining(x)));
});

test('اعتماد المتطلبات على المحدد الظاهر وحده: تغيير النوع يمسح التحديد، والتأكيد يسمّي، والمتعذر يُسمّى', async ({ page }) => {
  const reviewed = [];
  await setup(page, '#/leaders/overview', REQ_INBOX, { 'admin.review': (b) => { reviewed.push(b); return b.participant_id === 'p2' ? { success: false, message: 'x' } : { success: true }; } });
  const box = page.getByRole('group', { name: 'اعتماد المتطلبات' });
  await page.getByLabel('تحديد خطة التطوير لـ سارة الأحمد').check();
  await expect(box.getByRole('button', { name: 'اعتمد المحدد (1)' })).toBeEnabled();
  // تغيير النوع يمسح التحديد
  await page.getByRole('group', { name: 'نوع البند' }).getByRole('button', { name: /اعتماد مسار/ }).click();
  await page.getByRole('group', { name: 'نوع البند' }).getByRole('button', { name: /^الكل/ }).click();
  await expect(box.getByRole('button', { name: 'اعتمد المحدد' })).toBeDisabled();
  await box.getByLabel(/حدد المتطلبات المعروضة/).check();
  await box.getByRole('button', { name: 'اعتمد المحدد (2)' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('سارة الأحمد (خطة التطوير)، عمر علي (خطة التطوير)');
  await dialog.getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => reviewed.length).toBe(2);
  await expect(page.getByText('اعتُمد 1 من 2، ولم يُحفظ: عمر علي (خطة التطوير)')).toBeVisible();
  await expect(box.getByRole('button', { name: 'اعتمد المحدد' })).toBeDisabled();
});

test('المراقب لا يرى خانات اعتماد المتطلبات', async ({ page }) => {
  await setup(page, '#/leaders/overview', REQ_INBOX);
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('mi_admin_v3')); s.user.role_id = 'viewer'; sessionStorage.setItem('mi_admin_v3', JSON.stringify(s)); });
  await page.reload();
  await expect(page.locator('.inbox-list li')).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'اعتماد المتطلبات' })).toHaveCount(0);
  await expect(page.locator('.inbox-list input[type="checkbox"]')).toHaveCount(0);
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

test('«أين توقفوا» من ملف الدفعة: الرابط يفتح «بالدفعة» على الدفعة وحدها، و«كل الدفعات» يعيد الجميع', async ({ page }) => {
  await setup(page);
  const stages = (o) => ({ profile: 0, assessment_todo: 0, assessment_doing: 0, approval: 0, placed: 0, enrolled: 0, completed: 0, out: 0, ...o });
  const g = (key, name, total, st, extra = {}) => ({ key, name, total, stages: stages(st), stuck: (st.profile || 0) + (st.assessment_doing || 0), waiting: st.approval || 0, active_week: 1, approved_pct: 50, completed_pct: 0, active_pct: 50, ...extra });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'admin.insight') return route.fulfill({ json: { success: true,
      by_org: { groups: [g('o1', 'وزارة التجربة', 7, { profile: 5, approval: 2 })], total: g('all', 'الإجمالي', 7, { profile: 5, approval: 2 }) },
      by_cohort: { groups: [g('c1', 'دفعة الخريف', 4, { profile: 3, approval: 1 }, { status: 'running', org: 'وزارة التجربة' }), g('c2', 'دفعة الربيع', 3, { profile: 2, approval: 1 }, { status: 'open' })], total: g('all', 'الإجمالي', 7, { profile: 5, approval: 2 }) },
      experts: [] } });
    return route.fallback();
  });
  await page.goto(`${BASE}#/leaders/insight?cohort=c2`);
  await expect(page.getByRole('tab', { name: 'بالدفعة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'الدفعة: دفعة الربيع' })).toBeVisible();
  const table = page.locator('.ins-table');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('دفعة الربيع');
  await expect(table.locator('tfoot')).toHaveCount(0);
  // البطاقات العليا للدفعة المختارة
  await expect(page.locator('.stat-card').first().locator('.stat-value')).toHaveText('3');
  await page.getByRole('button', { name: 'كل الدفعات' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.stat-card').first().locator('.stat-value')).toHaveText('7');
  await expect(page).not.toHaveURL(/cohort=/);
  // دفعة من الرابط ثم دفعة أخرى ثم الرجوع إلى رابط بلا دفعة: الشاشة تتبع الرابط فتعود إلى كل الدفعات
  await page.evaluate(() => { location.hash = '#/leaders/insight?cohort=c1'; });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr')).toContainText('دفعة الخريف');
  await page.evaluate(() => { location.hash = '#/leaders/insight?cohort=c2'; });
  await expect(table.locator('tbody tr')).toContainText('دفعة الربيع');
  await page.evaluate(() => { location.hash = '#/leaders/insight'; });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.stat-card').first().locator('.stat-value')).toHaveText('7');
  await expect(page.getByRole('status').filter({ hasText: 'الدفعة:' })).toHaveCount(0);
  // دفعة بلا مشاركين: رسالة لا جدول فارغ
  await page.goto(`${BASE}#/leaders/insight?cohort=zz`);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'لا مشاركين في هذه الدفعة بعد' })).toBeVisible();
});
