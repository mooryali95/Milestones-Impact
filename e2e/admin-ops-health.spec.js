// صحة البريد والتنبيه: بطاقة النظرة العامة بالأخضر والكهرماني والأحمر، والشريط الأحمر أعلى كل صفحة يفتح البطاقة،
// والتنبيه التجريبي للمدير الأعلى، ولا شيء للمراقب. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const facts = (over = {}) => ({
  success: true, at: ago(0),
  mail: { key: true, cap: 80, sent: 12, codes: { sent: 9, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 2, queue: { waiting: 0, oldest_minutes: 0 }, ...over.mail },
  slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null, ...over.slack },
  alerts: { email: true, webhook: true, ...over.alerts },
});
const STATES = {
  green: () => facts(),
  amber: () => facts({ mail: { sent: 61 }, slack: { error: 'not_in_channel', error_at: ago(6), ok_at: ago(50) } }),
  // رموز مصفوفة التأثير بلغت نصيبها: متابعة لا عطل، وسلاك وحده قناة التنبيه
  matrix: () => facts({ mail: { sent: 30, codes: { sent: 9, failed: 0, blocked: 0, matrix_blocked: 4 }, code_streak: { count: 0, since: null, last_at: ago(2), last_ok_at: ago(2), open: false } }, alerts: { email: false, webhook: false, slack: true } }),
  // 695 من 1000 تُقرَّب 70٪ ودون عتبة الحكم (700): البطاقة خضراء والعداد معها
  edge: () => facts({ mail: { cap: 1000, sent: 695 } }),
  red: () => facts({ mail: { codes: { sent: 9, failed: 3, blocked: 1 }, code_streak: { count: 4, since: ago(20), last_at: ago(1), last_ok_at: ago(25), open: false }, failed_24h: 3 } }),
};

async function setup(page, { state = 'green', role = 'super_admin', hash = '#/leaders/overview', alertTest } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.ops-health': STATES[state](),
      'admin.overview': { success: true, total: 4, by_status: { pending_approval: 1, enrolled: 2 }, pending_reviews: 0, matrix: { milestone: { beginner: 1, intermediate: 1, advanced: 0 }, impact: { beginner: 2, intermediate: 0, advanced: 0 }, leadership: { beginner: 1, intermediate: 1, advanced: 0 } } },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] },
      'admin.health': { success: true, readiness: [], missing_migrations: [], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 12, cap: 80 } },
      'admin.alert-test': alertTest ?? { success: true, channels: { webhook: true, email: true, slack: true }, mail_key: true, delivered: { webhook: true, email: false } },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() }));
    localStorage.clear();
  }, role);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  return calls;
}

const card = (page) => page.getByRole('region', { name: 'صحة البريد والتنبيه' });

test('أخضر: البطاقة أعلى النظرة العامة بالكلمة والرمز، بلا شريط، والأسرار بأسمائها', async ({ page }) => {
  const calls = await setup(page, { state: 'green' });
  await expect(card(page)).toHaveAttribute('data-level', 'green');
  await expect(card(page).getByText('يعمل', { exact: true })).toBeVisible();
  await expect(card(page).getByRole('status').first()).toContainText('لا شيء يحتاج تدخلك');
  await expect(card(page)).toContainText('12 من 80');
  await expect(card(page)).toContainText('وصل 9 · تعذّر 0 · حُجب 0');
  await expect(card(page)).toContainText('تعذّر 0 · حُجب 2');
  await expect(card(page).getByRole('heading', { name: 'البريد في آخر 24 ساعة' })).toBeVisible();
  await expect(card(page)).toContainText('منذ 4 دقائق');
  await expect(page.locator('.ops-banner')).toHaveCount(0);
  await expect(card(page).locator('.ops-meter')).not.toHaveClass(/near|full/);
  // البطاقة أول ما في النظرة العامة
  const first = await page.locator('.la-card').first().getAttribute('id');
  expect(first).toBe('ops-health');
  expect(calls.filter((c) => c.action === 'admin.ops-health').length).toBe(1);
});

test('كهرماني: اقتراب السقف وخطأ سلاك برمزه وإرشاد عربي لإصلاحه، بلا شريط', async ({ page }) => {
  await setup(page, { state: 'amber' });
  await expect(card(page)).toHaveAttribute('data-level', 'amber');
  await expect(card(page).getByText('يحتاج متابعة', { exact: true })).toBeVisible();
  // المعنى العربي يتصدر، والرمز الخام تفصيل ثانوي من اليسار
  await expect(card(page).locator('.ops-issues')).toContainText('آخر نشر في سلاك تعذّر: البوت ليس عضوًا في القناة');
  await expect(card(page).locator('.ops-issues code[dir="ltr"]')).toHaveText('not_in_channel');
  await expect(card(page).locator('.ops-issues')).toContainText('إضافة تطبيق');
  await expect(card(page).getByRole('status').first()).toContainText('البريد والتنبيه: يحتاج متابعتك (أمران).');
  await expect(card(page)).toContainText('البريد في آخر 24 ساعة 61 من 80');
  await expect(card(page).locator('.ops-meter')).toHaveClass(/near/);
  await expect(page.locator('.ops-banner')).toHaveCount(0);
});

test('العداد يتلون بعتبة الحكم نفسها: 695 من 1000 أخضر بلا لون اقتراب', async ({ page }) => {
  await setup(page, { state: 'edge' });
  await expect(card(page)).toHaveAttribute('data-level', 'green');
  await expect(card(page)).toContainText('لا شيء يحتاج تدخلك');
  await expect(card(page).locator('.ops-meter')).toHaveAttribute('aria-label', '70٪ من السقف اليومي');
  await expect(card(page).locator('.ops-meter')).not.toHaveClass(/near|full/);
});

test('أحمر: الشريط أعلى كل صفحة بالمدة، ويفتح البطاقة ويضع التركيز عليها', async ({ page }) => {
  await setup(page, { state: 'red', hash: '#/contacts' });
  const banner = page.locator('.ops-banner');
  await expect(banner).toContainText('البريد متوقف: رموز الدخول لا تصل منذ 20 دقيقة');
  // منطقة التنبيه فيها الجملة الثابتة وحدها، والمدة المتغيرة خارجها فلا يُعاد التنبيه على قارئ الشاشة كل دقيقة
  await expect(page.getByRole('alert').filter({ hasText: 'البريد متوقف' })).toHaveText('البريد متوقف: رموز الدخول لا تصل');
  await expect(banner.locator('[aria-live="off"]')).toHaveText(/منذ 20 دقيقة/);
  await banner.getByRole('link', { name: 'افتح بطاقة صحة البريد' }).click();
  await expect(page).toHaveURL(/#\/leaders\/overview$/);
  await expect(card(page)).toHaveAttribute('data-level', 'red');
  await expect(card(page)).toBeFocused();
  await expect(card(page).getByText('عطل الآن', { exact: true })).toBeVisible();
  await expect(card(page)).toContainText('آخر 4 محاولات تعذّرت أو حُجبت متتالية');
  await expect(card(page)).toContainText('رموز الدخول لا تصل منذ 20 دقيقة');
  // الشريط باقٍ في النظرة العامة نفسها، والرابط يعيد التركيز إلى البطاقة
  await page.getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' }).focus();
  await banner.getByRole('link', { name: 'افتح بطاقة صحة البريد' }).click();
  await expect(card(page)).toBeFocused();
});

test('التنبيه التجريبي للمدير الأعلى: يستدعي admin.alert-test ويقول أين وصل', async ({ page }) => {
  const calls = await setup(page, { state: 'green' });
  await card(page).getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' }).click();
  await expect(card(page).getByRole('status').filter({ hasText: 'وصل التنبيه' })).toContainText('وصل التنبيه التجريبي عبر: رابط التنبيه');
  expect(calls.filter((c) => c.action === 'admin.alert-test').length).toBe(1);
});

test('رموز مصفوفة التأثير المحجوبة: كهرماني بسطرها بلا شريط، وسلاك وحده قناة تنبيه', async ({ page }) => {
  await setup(page, { state: 'matrix', alertTest: { success: true, channels: { webhook: false, email: false, slack: true }, mail_key: true, delivered: { webhook: false, email: false } } });
  await expect(card(page)).toHaveAttribute('data-level', 'amber');
  await expect(card(page)).toContainText('حُجب 4 من رموز دخول مصفوفة التأثير في آخر 24 ساعة (لبلوغ نصيبها أو السقف اليومي)');
  await expect(card(page)).toContainText('ومصفوفة التأثير: حُجب 4 (نصيبها أو السقف)');
  await expect(card(page)).toContainText('لا يمس دخول القادة');
  await expect(card(page)).not.toContainText('لا قناة تنبيه مضبوطة');
  await expect(page.locator('.ops-banner')).toHaveCount(0);
  await card(page).getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' }).click();
  await expect(card(page).locator('.ops-test-out')).toHaveText('أُرسل إلى سلسلة التنبيهات في سلاك، وهو قناة التنبيه الوحيدة المضبوطة.');
});

test('المدير غير الأعلى يرى البطاقة والشريط بلا زر التجربة', async ({ page }) => {
  await setup(page, { state: 'red', role: 'admin' });
  await expect(card(page)).toBeVisible();
  await expect(page.locator('.ops-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' })).toHaveCount(0);
});

test('المراقب لا يرى البطاقة ولا الشريط، ولا يُسأل الخادم', async ({ page }) => {
  const calls = await setup(page, { state: 'red', role: 'viewer' });
  await expect(page.locator('.stats-grid')).toBeVisible();
  await expect(page.locator('#ops-health')).toHaveCount(0);
  await expect(page.locator('.ops-banner')).toHaveCount(0);
  expect(calls.some((c) => c.action === 'admin.ops-health')).toBe(false);
});

// لقطات للمراجعة: OPS_SHOTS=<مجلد> وحده
for (const [w, h] of [[1440, 900], [390, 844]]) {
  test(`لقطات البطاقة والشريط بعرض ${w}`, async ({ browser }) => {
    test.skip(!process.env.OPS_SHOTS, 'اللقطات بطلب');
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const state of ['green', 'amber', 'red']) {
      await setup(page, { state });
      await expect(card(page)).toHaveAttribute('data-level', state);
      // صفحة كاملة مقصوصة على البطاقة: الترويسة الثابتة لا تغطي رأسها
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await card(page).boundingBox();
      await page.screenshot({ path: `${process.env.OPS_SHOTS}/card-${state}-${w}.png`, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    }
    await setup(page, { state: 'red', hash: '#/leaders/participants' });
    await expect(page.locator('.ops-banner')).toBeVisible();
    await page.screenshot({ path: `${process.env.OPS_SHOTS}/banner-red-${w}.png` });
    await ctx.close();
  });
}
