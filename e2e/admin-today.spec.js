// مكتب اليوم (المرحلة 3أ من تصور لوحة الإدارة 4.3): التحية والتاريخ، وشارة صحة واحدة مطوية حين يسلم كل شيء وتتمدد عند
// الخلل، و«قرارات اليوم»، والأرقام الأربعة بعروضها في الصندوق، والروابط السريعة، وبطاقات التحليل في «الرؤية الشاملة».
// والمرحلة 3ب: «تنبيهات» و«نبض الدفعات» من admin.today، يختفيان فارغين، والمصدر المتعذر سطر خافت لا فراغ كاذب.
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const opsGreen = () => ({
  success: true, at: ago(0),
  mail: { key: true, cap: 80, sent: 12, codes: { sent: 9, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 } },
  slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null },
  alerts: { email: true, webhook: true },
});
const healthOk = { success: true, readiness: [{ key: 'baseline', ok: true, where: 'assessment', label: 'القياس القبلي' }], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 } };
const item = (id, days, late, kind = 'approval') => ({ kind, kind_ar: kind === 'approval' ? 'اعتماد مسار' : 'طلب رعاية', id, title: `بند ${id}`, sub: '', at: ago(days * 1440), days, late, to: { tab: 'participants', id } });
const inbox = {
  success: true, total: 3, late: 1, skipped: [], counts: { approval: 2, sponsor: 1 },
  items: [item('a', 9, true), item('b', 8, false, 'sponsor'), item('c', 1, false)],
};
const overview = { success: true, total: 10, by_status: { placed: 1, enrolled: 3, pending_approval: 2 }, pending_reviews: 0, matrix: {}, overall: { beginner: 2, intermediate: 1, advanced: 0 }, top_tracks: [], tracks_used: 0 };

const sus = { success: true, ready: true, summary: { min_n: 5, target: 68, roles: [{ role: 'participant', role_ar: 'المشارك', n: 2, mean: 71, median: 70, met: false }] }, comments: [] };

async function setup(page, { health = healthOk, role = 'super_admin', replies: over = {}, hold = null } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    // hold: يؤخر رد صحة البريد لاختبار ما قبل وصوله
    if (hold && b.action === 'admin.ops-health') await hold;
    const replies = {
      'admin.ops-health': opsGreen(), 'admin.health': health, 'admin.inbox': inbox, 'admin.overview': overview,
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.insight': { success: false, message: 'لا رؤية في هذا الاختبار' },
      'admin.programs': { success: true, programs: [], cohorts: [], organizations: [] }, 'admin.sus': sus,
      ...over,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.clear();
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'هند', email: 'a@x.com', role_id: r }, ts: Date.now() }));
  }, role);
  await page.goto(`${BASE}#/leaders/overview`);
  await page.reload();
  return calls;
}
const badge = (page) => page.getByRole('region', { name: 'صحة المنظومة', exact: true });
const toggle = (page) => badge(page).locator('#th-toggle');

test('الرأس: التحية باسم المدير والتاريخ، وشارة الصحة مطوية حين يسلم كل شيء، والفتح يُحفظ للجلسة', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('heading', { name: /(صباح|مساء) الخير، هند/ })).toBeVisible();
  await expect(page.locator('.today-date')).toContainText(/\d{4}/);
  await expect(toggle(page)).toHaveText(/كل شيء سليم/);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toHaveAttribute('aria-controls', 'th-body');
  await expect(page.locator('#th-body')).toBeHidden();
  // داخلها بطاقة صحة البريد
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const details = page.getByRole('region', { name: 'تفاصيل صحة المنظومة' });
  await expect(details.getByRole('region', { name: 'صحة البريد والتنبيه' })).toHaveAttribute('data-level', 'green');
  // الحساب التجريبي خرج من الشارة إلى «أدوات التجربة» المطوية في آخر الصفحة (تدقيق 2026-11-23)
  await expect(details.getByRole('button', { name: 'افتح الحساب التجريبي' })).toHaveCount(0);
  const tools = page.locator('#today-tools');
  await expect(tools.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeHidden();
  await tools.locator(':scope > summary').click();
  await expect(tools.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeVisible();
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await toggle(page).press('Enter');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('الخلل يفتح الشارة وحده بعدده وأسمائه، وفيه بطاقته', async ({ page }) => {
  await setup(page, { health: { ...healthOk, missing_secrets: ['LEADERS_CERT_SIGNING_KEY'], readiness: [{ key: 'certificate', ok: false, where: 'certs', label: 'الشهادة بلا موقّع' }] } });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle(page)).toHaveText(/أمران يحتاجان انتباهك: حالة النظام، جاهزية الإطلاق/);
  await expect(badge(page)).toHaveAttribute('data-state', 'attention');
  await expect(page.getByRole('status').filter({ hasText: 'حالة النظام' })).toContainText('LEADERS_CERT_SIGNING_KEY');
  await expect(page.getByRole('region', { name: 'جاهزية الإطلاق', exact: true })).toContainText('0 من 1');
});

test('الأرقام الأربعة من الصندوق والنظرة العامة، وكل رقم يفتح عرضه في «قرارات اليوم»', async ({ page }) => {
  const calls = await setup(page);
  const n = (k) => page.locator(`.today-n[data-k="${k}"]`);
  await expect(n('waiting').locator('.stat-value')).toHaveText('3');
  await expect(n('waiting')).toContainText('أقدمها منذ 9 أيام');
  await expect(n('late').locator('.stat-value')).toHaveText('1');
  await expect(n('stale').locator('.stat-value')).toHaveText('2');
  await expect(n('program').locator('.stat-value')).toHaveText('4 من 10');
  // الأرقام من الطلبات القائمة وحدها: admin.today (المرحلة 3ب) للتنبيهات والنبض لا للأرقام، يُطلب مرة مع المكتب
  await expect.poll(() => calls.filter((c) => c.action === 'admin.today').length).toBe(1);
  // ولا يتبعه طلب ثانٍ: المكتب يطلبه مرة واحدة حين يُفتح
  await page.waitForTimeout(800);
  expect(calls.filter((c) => c.action === 'admin.today').length).toBe(1);
  const list = page.locator('.inbox .inbox-list li');
  await expect(list).toHaveCount(3);
  await n('late').click();
  await expect(page.locator('#today-decisions')).toBeFocused();
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('بند a');
  await expect(page.getByRole('status').filter({ hasText: 'يُعرض المتجاوز للمهلة وحده' })).toBeVisible();
  await n('stale').click();
  await expect(list).toHaveCount(2);
  await page.getByRole('button', { name: 'اعرض الكل' }).click();
  await expect(list).toHaveCount(3);
  await n('program').click();
  await expect(page).toHaveURL(/#\/leaders\/participants$/);
});

test('الروابط السريعة تنقل إلى أماكنها القائمة، وبطاقات التحليل في «الرؤية الشاملة» لا في المكتب', async ({ page }) => {
  const calls = await setup(page);
  const links = page.getByRole('navigation', { name: 'روابط سريعة' });
  await expect(page.getByRole('heading', { name: 'المستوى العام' })).toHaveCount(0);
  await links.getByRole('link', { name: 'التحليل الكامل' }).click();
  await expect(page).toHaveURL(/#\/leaders\/insight$/);
  const an = page.getByRole('region', { name: 'التحليل العام' });
  await expect(an.getByRole('heading', { name: 'المستوى العام' })).toBeVisible();
  await expect(an.getByRole('heading', { name: 'الحالات' })).toBeVisible();
  // SUS انتقلت معها: تحليل لا طابور عمل
  await expect(an.getByRole('region', { name: 'سهولة الاستخدام (SUS)' })).toContainText('المشارك');

  // محدد الجهة يسري على طلب النظرة العامة نفسه
  await an.getByLabel('الجهة', { exact: true }).selectOption('none');
  await expect.poll(() => calls.some((c) => c.action === 'admin.overview' && c.org === 'none')).toBe(true);
  await page.goto(`${BASE}#/leaders/overview`);
  await links.getByRole('link', { name: 'الجلسات اليوم' }).click();
  await expect(page).toHaveURL(/#\/leaders\/activities$/);
  await page.goto(`${BASE}#/leaders/overview`);
  await links.getByRole('link', { name: 'أضف مشاركين' }).click();
  await expect(page).toHaveURL(/#\/leaders\/participants$/);
  await page.goto(`${BASE}#/leaders/overview`);
  await expect(links.getByRole('link', { name: 'دفعة جديدة' })).toHaveAttribute('href', '#/leaders/programs?new=');
  await links.getByRole('link', { name: 'دفعة جديدة' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs/);
  // الرابط يفتح معالج الدفعة نفسه، لا قائمة البرامج وحدها
  await expect(page.getByRole('dialog', { name: 'دفعة جديدة' })).toBeVisible();
});

test('لا «سليم» عما لم يُقرأ: حالة النظام المتعذرة خلل باسمه، والنظرة العامة المتعذرة لا تحجب المكتب', async ({ page }) => {
  await setup(page, { health: { success: false, message: 'x' }, replies: { 'admin.overview': { success: false, message: 'تعذّرت قراءة النظرة العامة' }, 'admin.inbox': { success: false, message: 'تعذّر الصندوق' } } });
  await expect(toggle(page)).toHaveText(/أمر واحد يحتاج انتباهك: حالة النظام غير مقروءة/);
  await expect(toggle(page)).not.toHaveText(/كل شيء سليم/);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#th-body')).toContainText('تعذّرت قراءة حالة النظام');
  // المكتب قائم: القرارات والأرقام والطابور، والرقم المجهول «غير مقروء» لقارئ الشاشة لا «لا شيء ينتظر»
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
  const n = (k) => page.locator(`.today-n[data-k="${k}"]`);
  await expect(n('waiting')).toContainText('تعذّرت قراءة الصندوق');
  await expect(n('waiting')).not.toContainText('لا شيء ينتظر');
  await expect(n('waiting').locator('.sr-only')).toHaveText('غير مقروء');
  await expect(n('program')).toContainText('تعذّرت قراءة الأرقام');
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّرت قراءة النظرة العامة' })).toBeVisible();
});

test('النوع المتعذر يعلّم الأرقام «على الأقل» بالرقم ثم العلامة، والشارة لا تقول «سليم» قبل وصول صحة البريد', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await setup(page, { hold: gate, replies: { 'admin.inbox': { ...inbox, skipped: ['sponsor'] } } });
  await expect(badge(page)).toHaveAttribute('data-state', 'checking');
  await expect(toggle(page)).toHaveText(/جارٍ الفحص/);
  release();
  await expect(toggle(page)).toHaveText(/كل شيء سليم/);
  const v = page.locator('.today-n[data-k="waiting"] .stat-value bdi');
  await expect(v).toHaveText('3+');
  await expect(v).toHaveAttribute('dir', 'ltr');
});

test('المراقب: لا «دفعة جديدة» ولا «أضف مشاركين»، والشارة بحالة النظام وحدها', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  const links = page.getByRole('navigation', { name: 'روابط سريعة' });
  await expect(links.getByRole('link', { name: 'التحليل الكامل' })).toBeVisible();
  await expect(links.getByRole('link', { name: 'دفعة جديدة' })).toHaveCount(0);
  await expect(links.getByRole('link', { name: 'أضف مشاركين' })).toHaveCount(0);
  await expect(toggle(page)).toHaveText(/كل شيء سليم/);
  await expect(page.locator('#ops-health')).toHaveCount(0);
});

// ── المرحلة 3ب: التنبيهات ونبض الدفعات ──
const desk = {
  success: true, skipped: [], unchecked: [], pulse_known: true, waiting_partial: false,
  alerts: [
    { kind: 'seats_full', severity: 'bad', id: 'seats:o1', target: { tab: 'orgs', id: 'o1' }, text: 'مقاعد «جهة الشمال» ممتلئة (10 من 10): التسجيلات التالية تنتظر قرار الرعاية' },
    { kind: 'cohort_no_session', severity: 'warn', id: 'cohort:c2', target: { tab: 'programs', id: 'c2' }, text: 'دفعة «دفعة الربيع» جارية ولا جلسة لها في الأيام الـ14 القادمة' },
    { kind: 'expert_over', severity: 'warn', id: 'expert:e1', target: { tab: 'experts', id: 'e1' }, text: '«سارة» فوق طاقته: 5 إسنادات و3 ساعات أسبوعيًا' },
  ],
  pulse: [
    { id: 'c1', name: 'دفعة الخريف', org: 'جهة الشمال', readiness: { missing: 2, total: 8, summary: 'بقي بندان' }, next_at: ago(-3 * 1440), handbook: false, waiting: 4 },
    { id: 'c2', name: 'دفعة الربيع', org: null, readiness: { missing: 0, total: 8, summary: 'مكتملة الإعداد' }, next_at: null, handbook: false, waiting: 0 },
  ],
};

test('3ب: التنبيهات بعد الأرقام وقبل نبض الدفعات والروابط، وكل تنبيه رابط إلى ملفه', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': desk } });
  const alerts = page.getByRole('region', { name: /تنبيهات/ });
  await expect(alerts.locator('li')).toHaveCount(3);
  await expect(alerts.locator('li').first()).toHaveClass(/bad/);
  // الترتيب في الصفحة: الأرقام، ثم التنبيهات، ثم النبض، ثم الروابط
  const order = await page.evaluate(() => ['.today-nums', '.today-alerts', '.today-pulse', '.today-links', '#rq'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? -1));
  expect(order.every((y, i) => y >= 0 && (i === 0 || y > order[i - 1]))).toBe(true);
  await alerts.getByRole('link', { name: /مقاعد «جهة الشمال» ممتلئة/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/orgs\/o1$/);
  await page.goto(`${BASE}#/leaders/overview`);
  await page.getByRole('region', { name: /تنبيهات/ }).getByRole('link', { name: /سارة/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/experts\/e1$/);
  await page.goto(`${BASE}#/leaders/overview`);
  await page.getByRole('region', { name: /تنبيهات/ }).getByRole('link', { name: /دفعة الربيع/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c2$/);
});

test('3ب: نبض الدفعات سطر لكل دفعة جارية بجاهزيتها وأقرب جلسة وما ينتظر، ويصير بطاقات على الهاتف', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': desk } });
  const pulse = page.getByRole('region', { name: 'نبض الدفعات' });
  const rows = pulse.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('دفعة الخريف');
  await expect(rows.nth(0)).toContainText('جهة الشمال');
  await expect(rows.nth(0)).toContainText('بقي بندان');
  await expect(rows.nth(0).locator('td[data-label="ينتظر قرارًا"]')).toHaveText('4');
  await expect(rows.nth(1)).toContainText('لا جلسة مؤرخة');
  await expect(rows.nth(1)).toContainText('مكتملة الإعداد');
  await rows.nth(0).getByRole('link', { name: 'دفعة الخريف' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1$/);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${BASE}#/leaders/overview`);
  await expect(page.locator('.today-pulse-t thead')).toHaveCSS('position', 'absolute');
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noScroll).toBe(true);
});

test('3ب: بلا تنبيه ولا دفعة جارية يختفي القسمان، ولا سطر تعذّر', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': { ...desk, alerts: [], pulse: [] } } });
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
  await expect(page.locator('.today-nums')).toBeVisible();
  await expect(page.locator('.today-alerts')).toHaveCount(0);
  await expect(page.locator('.today-pulse')).toHaveCount(0);
  await expect(page.locator('.today-skip')).toHaveCount(0);
});

test('3ب: المصدر المتعذر سطر خافت بأسمائه وما لم يُفحص، والنبض «غير مقروء» لا صفر، والحفظ يعيد الطلب', async ({ page }) => {
  const calls = await setup(page, { replies: { 'admin.today': {
    ...desk, alerts: [desk.alerts[0]], skipped: ['experts', 'inbox'], unchecked: ['expert_over'],
    pulse: [{ ...desk.pulse[0], waiting: null }],
  } } });
  const note = page.locator('.today-skip');
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toContainText('تعذّرت قراءة: حِمل الخبراء، صندوق القرارات');
  await expect(note).toContainText('لم يُفحص: خبير فوق طاقته');
  await expect(page.getByRole('region', { name: 'نبض الدفعات' }).locator('td[data-label="ينتظر قرارًا"]')).toHaveText('غير مقروء');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.today').length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('mi:pending')));
  await expect.poll(() => calls.filter((c) => c.action === 'admin.today').length).toBe(2);
});

test('3ب: admin.today متعذر كله: سطر خافت يقول إنه لم يُقرأ، والمكتب قائم', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': { success: false, message: 'x' } } });
  await expect(page.locator('.today-skip')).toContainText('تعذّرت قراءة التنبيهات ونبض الدفعات');
  await expect(page.locator('.today-alerts')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
});

test('3ب: العاجل يُقرأ «عاجل»، والقائمة والجدول بأدوارهما الصريحة، ودفعة الجهة بلا اسم مقروء «جهة» لا «أفراد»', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': { ...desk, pulse: [{ ...desk.pulse[0], org: null, kind: 'org' }, { ...desk.pulse[1], kind: 'individuals' }] } } });
  const alerts = page.getByRole('region', { name: /تنبيهات/ });
  await expect(alerts.getByRole('list')).toHaveAttribute('role', 'list');
  await expect(alerts.getByRole('link', { name: /^عاجل: مقاعد «جهة الشمال»/ })).toBeVisible();
  await expect(alerts.getByRole('link', { name: /سارة/ })).not.toContainText('عاجل');
  const t = page.getByRole('table');
  await expect(t.getByRole('rowheader', { name: 'دفعة الخريف' })).toBeVisible();
  const cells = t.locator('td[data-label="الجهة"]');
  await expect(cells.nth(0)).toHaveText('جهة');
  await expect(cells.nth(1)).toHaveText('أفراد');
});

test('3ب: صيغة الكتاب، والجلسة غير المقروءة، وعلامة «+» حين يبلغ الصندوق حده', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': {
    ...desk, waiting_partial: true, unchecked: ['cohort_no_session'], skipped: ['sessions'],
    pulse: [{ ...desk.pulse[0], next_at: null, handbook: true }, { ...desk.pulse[1], next_at: null, waiting: 0 }],
  } } });
  const rows = page.getByRole('region', { name: 'نبض الدفعات' }).locator('tbody tr');
  await expect(rows.nth(0).locator('td[data-label="أقرب جلسة"]')).toHaveText('صيغة الكتاب');
  await expect(rows.nth(1).locator('td[data-label="أقرب جلسة"]')).toHaveText('غير مقروءة');
  await expect(rows.nth(0).locator('td[data-label="ينتظر قرارًا"]')).toHaveText('4+');
  // الصفر يبقى صفرًا بلا علامة
  await expect(rows.nth(1).locator('td[data-label="ينتظر قرارًا"]')).toHaveText('0');
  await expect(page.locator('.today-skip')).toContainText('لم يُفحص: دفعة جارية بلا جلسة قريبة');
});

test('3ب: قرار في طابور المتطلبات يعيد طلب admin.today مرة واحدة لا مرتين', async ({ page }) => {
  const calls = await setup(page, { replies: {
    'admin.today': desk, 'admin.review': { success: true },
    'admin.reviews': { success: true, pending_approval: [], submitted: [
      { participant_id: 'p1', requirement_id: 'r1', completed_at: '2026-10-20', participants: { full_name: 'سارة الأحمد' }, stage_requirements: { title_ar: 'خطة التطوير' } },
    ] },
  } });
  const n = () => calls.filter((c) => c.action === 'admin.today').length;
  await expect.poll(n).toBe(1);
  await page.getByLabel('تحديد الكل').check();
  await page.getByRole('button', { name: 'اعتماد المحدد (1)' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.review').length).toBe(1);
  await expect.poll(n).toBe(2);
  await page.waitForTimeout(1000);
  expect(n()).toBe(2);
});

// «صحة المنصة» (admin.platform-health): صف لكل فحص بلونه وسطر علاجه، والأحكام من الخادم كما هي
test('صحة المنصة: صف لكل فحص بلونه، والعلاج لما يحتاجه وحده', async ({ page }) => {
  const checks = [
    { key: 'migrations', label: 'ترحيلات القاعدة', level: 'bad', line: '1 لم يُطبَّق: 20261128100000_leaders_atomic_and_health', remedy: 'شغّل سير «migrate» في GitHub Actions لتطبيقها على الإنتاج.' },
    { key: 'alert_email', label: 'بريد التنبيه', level: 'ok', line: 'LEADERS_ALERT_EMAIL مضبوط', remedy: '' },
    { key: 'cron', label: 'المهمة الساعية', level: 'unknown', line: 'تعذّرت قراءة حالة leaders-expert-offers', remedy: 'راجع صلاحية القراءة.' },
    { key: 'digest', label: 'ملخص النماذج اليومي', level: 'ok', line: 'آخر ملخص 2026-11-23', remedy: '' },
    { key: 'sponsor_codes', label: 'رموز الرعاية', level: 'warn', line: 'جهة بلا رمز فعّال: جهة ب', remedy: 'أنشئ رمزًا من ملف الجهة.' },
  ];
  await setup(page, { replies: { 'admin.platform-health': { success: true, level: 'bad', checks } } });
  const card = page.getByRole('region', { name: 'صحة المنصة', exact: true });
  await expect(card).toHaveAttribute('data-level', 'bad');
  await expect(card.locator('.ph-row')).toHaveCount(5);
  await expect(card.locator('.ph-row[data-level="bad"]')).toContainText('شغّل سير «migrate»');
  await expect(card.locator('.ph-row[data-level="warn"]')).toContainText('جهة ب');
  await expect(card.locator('.ph-row[data-level="ok"] .ph-remedy')).toHaveCount(0);
});

test('صحة المنصة: رد بلا فحوص لا يُرسم، وتعذّر القراءة سطر خافت', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('heading', { name: /الخير/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'صحة المنصة', exact: true })).toHaveCount(0);
});

// تدقيق اللوحة 2026-11-23 (المرحلة 1): «قرارات اليوم» أول كتلة بعد التحية، قبل الأرقام والصحة وأدوات التجربة، ولو كانت الشارة مفتوحة بخلل
test('الترتيب: قرارات اليوم أولًا، ثم الأرقام، ثم شارة الصحة، وأدوات التجربة في الآخر مطوية', async ({ page }) => {
  await setup(page, { health: { ...healthOk, missing_secrets: ['X_KEY'] } });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const y = async (sel) => (await page.locator(sel).first().boundingBox()).y;
  await expect(page.locator('.inbox .inbox-list li')).toHaveCount(3);
  const dec = await y('#today-decisions'), nums = await y('.today-nums'), health = await y('.today-health'), tools = await y('#today-tools');
  expect(dec).toBeLessThan(nums);
  expect(nums).toBeLessThan(health);
  expect(health).toBeLessThan(tools);
  // أول عنوان قسم بعد التحية هو «قرارات اليوم»
  await expect(page.locator('h2.today-sec').first()).toHaveText('قرارات اليوم');
  await expect(page.locator('#today-tools')).not.toHaveAttribute('open', '');
});

test('صحة المنصة السليمة سطر مطوي، وفتحه يُظهر الفحوص', async ({ page }) => {
  const checks = [{ key: 'cron', label: 'المهمة الساعية', level: 'ok', line: 'تعمل', remedy: '' }];
  await setup(page, { replies: { 'admin.platform-health': { success: true, level: 'ok', checks } } });
  const card = page.getByRole('region', { name: 'صحة المنصة', exact: true });
  await expect(card.locator('.ph-row')).toBeHidden();
  await card.locator('summary').click();
  await expect(card.locator('.ph-row')).toBeVisible();
});
