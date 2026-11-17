// مكتب اليوم (المرحلة 3أ من تصور لوحة الإدارة 4.3): التحية والتاريخ، وشارة صحة واحدة مطوية حين يسلم كل شيء وتتمدد عند
// الخلل، و«قرارات اليوم»، والأرقام الأربعة بعروضها في الصندوق، والروابط السريعة، وبطاقات التحليل في «الرؤية الشاملة».
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
  // داخلها البطاقات كما كانت: صحة البريد وحساب العرض
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const details = page.getByRole('region', { name: 'تفاصيل صحة المنظومة' });
  await expect(details.getByRole('region', { name: 'صحة البريد والتنبيه' })).toHaveAttribute('data-level', 'green');
  await expect(details.getByRole('button', { name: 'افتح حساب العرض' })).toBeVisible();
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
  // لا نقطة جديدة على الخادم: الأرقام من الطلبات القائمة وحدها
  expect(calls.some((c) => c.action === 'admin.today')).toBe(false);
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
