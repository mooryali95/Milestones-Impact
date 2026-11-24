// مكتب اليوم: التحية والتاريخ، و«قرارات اليوم»، والأرقام الأربعة بعروضها في الصندوق، وشريط «يحتاج انتباهك» (تصور تبويبات
// الإدارة 2026-11-24، المرحلة أ: سطر لكل مشكلة برابط إلى مكان إصلاحها، يختفي كله حين يسلم كل شيء)، و«تنبيهات» admin.today
// تختفي فارغة، والروابط السريعة. البطاقات الكاملة في «الإعداد › صحة المنصة» (admin-health-tab.spec.js).
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
const strip = (page) => page.getByRole('region', { name: /يحتاج انتباهك/ });

test('الرأس: التحية باسم المدير والتاريخ، وحين يسلم كل شيء لا شريط ولا بطاقة مجال في المكتب', async ({ page }) => {
  await setup(page, { replies: { 'admin.platform-health': { success: true, level: 'ok', checks: [{ key: 'cron', label: 'المهمة الساعية', level: 'ok', line: 'تعمل', remedy: '' }] } } });
  await expect(page.getByRole('heading', { name: /(صباح|مساء) الخير، هند/ })).toBeVisible();
  await expect(page.locator('.today-date')).toContainText(/\d{4}/);
  await expect(page.locator('.today-nums')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(strip(page)).toHaveCount(0);
  // البطاقات انتقلت إلى بيوتها: لا صحة بريد ولا جاهزية ولا أدوات تجربة ولا طابور متطلبات ولا نبض دفعات هنا
  for (const sel of ['#ops-health', '.la-ready', '.ph-card', '#today-tools', '#rq', '.today-pulse', '.today-health']) await expect(page.locator(sel), sel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'افتح الحساب التجريبي' })).toHaveCount(0);
});

test('الخلل سطر لكل مشكلة برابط إلى مكان إصلاحها، الأشد أولًا', async ({ page }) => {
  await setup(page, { health: { ...healthOk, missing_secrets: ['LEADERS_CERT_SIGNING_KEY'], readiness: [{ key: 'baseline', ok: true, label: 'أ' }, { key: 'certificate', ok: false, where: 'certs', label: 'الشهادة بلا موقّع' }] },
    replies: { 'admin.platform-health': { success: true, level: 'bad', checks: [{ key: 'migrations', label: 'ترحيلات القاعدة', level: 'bad', line: '1 لم يُطبَّق', remedy: 'x' }, { key: 'cron', label: 'المهمة الساعية', level: 'ok', line: 'تعمل' }] } } });
  const rows = strip(page).locator('li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('ترحيلات القاعدة: 1 لم يُطبَّق');
  await expect(rows.nth(0)).toHaveClass(/bad/);
  await expect(strip(page)).toContainText('جاهزية الإطلاق 1 من 2');
  await expect(strip(page)).toContainText('حالة النظام تحتاج انتباهًا');
  // روابط تنقُّل لا أفعال: لا زر في الشريط
  await expect(strip(page).getByRole('button')).toHaveCount(0);
  await rows.filter({ hasText: 'جاهزية الإطلاق' }).getByRole('link', { name: /صحة المنصة/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/health$/);
  await expect(page.getByRole('region', { name: 'جاهزية الإطلاق', exact: true })).toContainText('1 من 2');
});

test('خمسة أسطر ثم «و… أخرى» إلى صحة المنصة، وعطل البريد يقود إلى مركز البريد', async ({ page }) => {
  const checks = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, label: `فحص ${k}`, level: 'warn', line: 'يحتاج انتباهًا' }));
  const amber = opsGreen();
  amber.mail.sent = 78;
  await setup(page, { replies: { 'admin.platform-health': { success: true, level: 'warn', checks }, 'admin.ops-health': amber } });
  await expect(strip(page).locator('li')).toHaveCount(5);
  await expect(strip(page).getByRole('link', { name: /وأمر آخر/ })).toHaveAttribute('href', '#/leaders/health');
  await expect(strip(page).locator('li[data-key^="ops-"] a')).toHaveAttribute('href', '#/leaders/mailcenter');
});

test('لا «سليم» عما لم يُقرأ: حالة النظام المتعذرة سطر باسمه، والنظرة العامة المتعذرة لا تحجب المكتب', async ({ page }) => {
  await setup(page, { health: { success: false, message: 'x' }, replies: { 'admin.overview': { success: false, message: 'تعذّرت قراءة النظرة العامة' }, 'admin.inbox': { success: false, message: 'تعذّر الصندوق' } } });
  await expect(strip(page)).toContainText('تعذّرت قراءة حالة النظام');
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
  const n = (k) => page.locator(`.today-n[data-k="${k}"]`);
  await expect(n('waiting')).toContainText('تعذّرت قراءة الصندوق');
  await expect(n('waiting')).not.toContainText('لا شيء ينتظر');
  await expect(n('waiting').locator('.sr-only')).toHaveText('غير مقروء');
  await expect(n('program')).toContainText('تعذّرت قراءة الأرقام');
  await expect(page.getByRole('alert').filter({ hasText: 'تعذّرت قراءة النظرة العامة' })).toBeVisible();
});

test('النوع المتعذر يعلّم الأرقام «على الأقل» بالرقم ثم العلامة', async ({ page }) => {
  await setup(page, { replies: { 'admin.inbox': { ...inbox, skipped: ['sponsor'] } } });
  const v = page.locator('.today-n[data-k="waiting"] .stat-value bdi');
  await expect(v).toHaveText('3+');
  await expect(v).toHaveAttribute('dir', 'ltr');
});

test('المراقب: لا «دفعة جديدة» ولا «أضف مشاركين»، ويرى الشريط بحالة النظام وحدها بلا أزرار', async ({ page }) => {
  await setup(page, { role: 'viewer', health: { ...healthOk, missing_secrets: ['X'], readiness: [{ key: 'c', ok: false, label: 'ناقص' }] } });
  const links = page.getByRole('navigation', { name: 'روابط سريعة' });
  await expect(links.getByRole('link', { name: 'التحليل الكامل' })).toBeVisible();
  await expect(links.getByRole('link', { name: 'دفعة جديدة' })).toHaveCount(0);
  await expect(links.getByRole('link', { name: 'أضف مشاركين' })).toHaveCount(0);
  await expect(strip(page).locator('li')).toHaveCount(1);
  await expect(strip(page)).toContainText('حالة النظام');
  await expect(strip(page).getByRole('button')).toHaveCount(0);
  await expect(page.locator('#ops-health')).toHaveCount(0);
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


test('3ب: التنبيهات بعد الأرقام وقبل الروابط، وكل تنبيه رابط إلى ملفه', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': desk } });
  const alerts = page.getByRole('region', { name: /تنبيهات/ });
  await expect(alerts.locator('li')).toHaveCount(3);
  await expect(alerts.locator('li').first()).toHaveClass(/bad/);
  const order = await page.evaluate(() => ['#today-decisions', '.today-nums', '.today-alerts', '.today-links'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? -1));
  expect(order.every((y, i) => y >= 0 && (i === 0 || y > order[i - 1]))).toBe(true);
  await alerts.getByRole('link', { name: /مقاعد «جهة الشمال» ممتلئة/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/orgs\/o1$/);
  await page.goto(`${BASE}#/leaders/overview`);
  await page.getByRole('region', { name: /تنبيهات/ }).getByRole('link', { name: /سارة/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/experts\/e1$/);
});

test('3ب: بلا تنبيه يختفي القسم، ولا سطر تعذّر، ونبض الدفعات في ملف كل دفعة لا هنا', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': { ...desk, alerts: [] } } });
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
  await expect(page.locator('.today-nums')).toBeVisible();
  await expect(page.locator('.today-alerts')).toHaveCount(0);
  await expect(page.locator('.today-skip')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'نبض الدفعات' })).toHaveCount(0);
});

test('3ب: المصدر المتعذر سطر خافت بأسمائه وما لم يُفحص، وحدث القرار يعيد الطلب مرة', async ({ page }) => {
  const calls = await setup(page, { replies: { 'admin.today': { ...desk, alerts: [desk.alerts[0]], skipped: ['experts', 'inbox'], unchecked: ['expert_over'] } } });
  const note = page.locator('.today-skip');
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toContainText('تعذّرت قراءة: حِمل الخبراء، صندوق القرارات');
  await expect(note).toContainText('لم يُفحص: خبير فوق طاقته');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.today').length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('mi:pending')));
  await expect.poll(() => calls.filter((c) => c.action === 'admin.today').length).toBe(2);
  await page.waitForTimeout(800);
  expect(calls.filter((c) => c.action === 'admin.today').length).toBe(2);
});

test('3ب: admin.today متعذر كله: سطر خافت يقول إنه لم يُقرأ، والمكتب قائم', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': { success: false, message: 'x' } } });
  await expect(page.locator('.today-skip')).toContainText('تعذّرت قراءة التنبيهات الآن');
  await expect(page.locator('.today-alerts')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'قرارات اليوم' })).toBeVisible();
});

test('3ب: العاجل يُقرأ «عاجل»، والقائمة بدورها الصريح', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': desk } });
  const alerts = page.getByRole('region', { name: /تنبيهات/ });
  await expect(alerts.getByRole('list')).toHaveAttribute('role', 'list');
  await expect(alerts.getByRole('link', { name: /^عاجل: مقاعد «جهة الشمال»/ })).toBeVisible();
  await expect(alerts.getByRole('link', { name: /سارة/ })).not.toContainText('عاجل');
});

test('الترتيب: قرارات اليوم أولًا، ثم الأرقام، ثم «يحتاج انتباهك»', async ({ page }) => {
  await setup(page, { health: { ...healthOk, missing_secrets: ['X_KEY'] } });
  await expect(page.locator('.inbox .inbox-list li')).toHaveCount(3);
  const y = async (sel) => (await page.locator(sel).first().boundingBox()).y;
  const dec = await y('#today-decisions'), nums = await y('.today-nums'), exc = await y('.today-exc');
  expect(dec).toBeLessThan(nums);
  expect(nums).toBeLessThan(exc);
  await expect(page.locator('h2.today-sec').first()).toHaveText('قرارات اليوم');
});

// نبض الدفعات انتقل من المكتب إلى «البرامج والدفعات» (تصور تبويبات الإدارة 2026-11-24) برد admin.today نفسه
test('نبض الدفعات الجارية في البرامج والدفعات: سطر لكل دفعة بجهتها وجاهزيتها وأقرب جلسة وما ينتظر، ورابط إلى التنبيهات', async ({ page }) => {
  await setup(page, { replies: { 'admin.today': desk } });
  await expect(page.getByRole('region', { name: 'نبض الدفعات الجارية' })).toHaveCount(0);
  await page.goto(`${BASE}#/leaders/programs`);
  const pulse = page.getByRole('region', { name: 'نبض الدفعات الجارية' });
  const rows = pulse.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('جهة الشمال');
  await expect(rows.nth(0)).toContainText('بقي بندان');
  await expect(rows.nth(0).locator('td[data-label="ينتظر قرارًا"]')).toHaveText('4');
  await expect(rows.nth(1)).toContainText('لا جلسة مؤرخة');
  await expect(pulse.getByRole('link', { name: /تنبيهات/ })).toHaveAttribute('href', '#/leaders/overview');
  await rows.nth(0).getByRole('link', { name: 'دفعة الخريف' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1$/);
});
