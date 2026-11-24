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

// pref: اختيار الطي المحفوظ في المتصفح ('open' افتراضًا لاختبارات المحتوى، وnull كأول زيارة). health: رد ops-health من سجل الطلبات حتى الآن.
// badge: البطاقة داخل شارة الصحة في مكتب اليوم، والشارة مطوية حين يسلم كل شيء؛ اختبارات المحتوى تفتحها (اختيار الجلسة نفسه).
// true يفتحها، وfalse كأول زيارة بلا اختيار، وكائن {sig, open} اختيار محفوظ بعينه
async function setup(page, { state = 'green', role = 'super_admin', hash = '#/leaders/overview', alertTest, pref = 'open', health, badge = true } = {}) {
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
      'admin.ops-health': health ? health(calls) : STATES[state](),
      'admin.overview': { success: true, total: 4, by_status: { pending_approval: 1, enrolled: 2 }, pending_reviews: 0, matrix: { milestone: { beginner: 1, intermediate: 1, advanced: 0 }, impact: { beginner: 2, intermediate: 0, advanced: 0 }, leadership: { beginner: 1, intermediate: 1, advanced: 0 } } },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] },
      'admin.health': { success: true, readiness: [], missing_migrations: [], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 12, cap: 80 } },
      'admin.alert-test': alertTest ?? { success: true, channels: { webhook: true, email: true, slack: true }, mail_key: true, delivered: { webhook: true, email: false } },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(([r, p, b]) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() }));
    if (b) sessionStorage.setItem('mi_admin_today_health', JSON.stringify(b === true ? { sig: '', open: true } : b)); else sessionStorage.removeItem('mi_admin_today_health');
    localStorage.clear();
    if (p) localStorage.setItem('mi_admin_ops_card', p);
  }, [role, pref, badge]);
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
  await expect(card(page).getByRole('heading', { name: 'البريد اليوم' })).toBeVisible();
  await expect(card(page)).toContainText('منذ 4 دقائق');
  await expect(page.locator('.ops-banner')).toHaveCount(0);
  await expect(card(page).locator('.ops-meter')).not.toHaveClass(/near|full/);
  // البطاقة أول ما في شارة الصحة، والشارة بعد «قرارات اليوم» (تدقيق 2026-11-23: القرارات أول النظرة العامة)
  const first = await page.locator('#th-body .la-card').first().getAttribute('id');
  expect(first).toBe('ops-health');
  expect((await page.locator('#today-decisions').boundingBox()).y).toBeLessThan((await page.locator('.today-health').boundingBox()).y);
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
  await expect(card(page)).toContainText('البريد اليوم 61 من 80');
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

test('أحمر بعد طيّ الشارة على الكهرماني: الشارة تنفتح وحدها، والشريط يكشف البطاقة ولو طُويت على الأحمر نفسه', async ({ page }) => {
  // طُويت على الكهرماني: الأحمر حال أخرى فتنفتح
  await setup(page, { state: 'red', badge: { sig: 'ops-amber', open: false } });
  const toggle = page.locator('#th-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveText(/عطل في البريد/);
  // طواها المدير على الأحمر نفسه، ثم ضغط رابط الشريط: تنكشف البطاقة ويقع عليها التركيز
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(card(page)).toBeHidden();
  await page.locator('.ops-banner').getByRole('link', { name: 'افتح بطاقة صحة البريد' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toBeFocused();
  // ومن صفحة أخرى بعد إعادة التحميل والطي محفوظ: الانتقال يكشفها كذلك
  await page.goto(`${BASE}#/contacts`);
  await page.reload();
  await page.locator('.ops-banner').getByRole('link', { name: 'افتح بطاقة صحة البريد' }).click();
  await expect(page).toHaveURL(/#\/leaders\/overview$/);
  await expect(card(page)).toBeFocused();
});

test('التنبيه التجريبي للمدير الأعلى: يستدعي admin.alert-test ويقول أين وصل', async ({ page }) => {
  const calls = await setup(page, { state: 'green' });
  await card(page).getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' }).click();
  await expect(card(page).getByRole('status').filter({ hasText: 'وصل التنبيه' })).toContainText('وصل التنبيه التجريبي عبر: رابط التنبيه');
  expect(calls.filter((c) => c.action === 'admin.alert-test').length).toBe(1);
});

test('بعد التنبيه التجريبي تتحدث الأرقام وحدها: البريد فورًا، وحالة سلاك بعد ثوانٍ', async ({ page }) => {
  // قبل التجربة: 9 بلا نشر. أول سؤال بعدها: البريد عُدّ وسلاك لم يُكتب بعد. الثاني بعد ثوانٍ: كُتبت حالة سلاك
  const after = (calls) => { const t = calls.findIndex((c) => c.action === 'admin.alert-test'); return t < 0 ? 0 : calls.slice(t).filter((c) => c.action === 'admin.ops-health').length; };
  const health = (calls) => { const i = after(calls); return facts({ mail: { sent: i ? 10 : 9 }, slack: { ok_at: i >= 2 ? ago(0) : null } }); };
  const calls = await setup(page, { state: 'green', health });
  const n = () => after(calls);
  await expect(card(page)).toContainText('9 من 80');
  await expect(card(page)).toContainText('لم يُنشر شيء بعد');
  await card(page).getByRole('button', { name: 'أرسل تنبيهًا تجريبيًا' }).click();
  await expect(card(page)).toContainText('10 من 80');
  expect(n()).toBe(1);
  await expect(card(page)).toContainText('لم يُنشر شيء بعد');
  await expect.poll(n, { timeout: 8000 }).toBe(2);
  await expect(card(page).getByText('آخر نشر ناجح').locator('..')).toContainText('الآن');
  await expect(card(page)).not.toContainText('لم يُنشر شيء بعد');
  // وسؤال أخير بعد عشر ثوانٍ لسلاك البطيء، ثم لا شيء حتى سؤال الدقيقة
  await expect.poll(n, { timeout: 12000 }).toBe(3);
});

test('الطي: السليم في أول زيارة داخل شارة مطوية، وفتحها يُظهر البطاقة سطر ملخص هادئًا، وزرها يفتحها ويطويها بالفأرة ولوحة المفاتيح، والاختيار يُحفظ', async ({ page }) => {
  await setup(page, { state: 'green', pref: null, badge: false });
  // أول زيارة: الشارة مطوية لأن كل شيء سليم، والبطاقة داخلها
  const th = page.locator('#th-toggle');
  await expect(th).toHaveAttribute('aria-expanded', 'false');
  await expect(card(page)).toBeHidden();
  await th.click();
  // والبطاقة السليمة نفسها سطر ملخص مطوي (تدقيق 2026-11-23: صحة البريد لا تتمدد إلا عند الخلل)
  const toggle = card(page).getByRole('button', { name: 'صحة البريد والتنبيه' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'ops-body');
  await expect(page.locator('#ops-body')).toBeHidden();
  const strip = card(page).getByRole('list', { name: 'ملخص صحة البريد والتنبيه' });
  await expect(strip).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#ops-body')).toBeVisible();
  await expect(strip).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#ops-body')).toBeHidden();
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('img')).toHaveAttribute('aria-label', 'البريد اليوم: أُرسل 12 من 80 (15٪ من السقف اليومي)');
  await expect(strip).toContainText('وصل 9');
  await expect(strip).toContainText('تعذّر 0');
  await expect(strip).toContainText('حُجب 0');
  await expect(strip).toContainText('نُشر منذ 4 دقائق');
  await expect(strip).toContainText('3 من 3');
  await expect(card(page).getByText('يعمل', { exact: true })).toBeVisible();
  // محفوظ في المتصفح: يبقى مطويًا بعد إعادة التحميل
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // لوحة المفاتيح: Enter ثم المسافة
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page)).toContainText('وصل 9 · تعذّر 0 · حُجب 0');
  await page.keyboard.press(' ');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('الطي: أي حال غير سليمة تفتح البطاقة مهما حُفظ', async ({ page }) => {
  await setup(page, { state: 'amber', pref: 'closed' });
  await expect(card(page).getByRole('button', { name: 'صحة البريد والتنبيه' })).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page).locator('.ops-issues')).toBeVisible();
  await setup(page, { state: 'red', pref: 'closed', hash: '#/contacts' });
  await page.locator('.ops-banner').getByRole('link', { name: 'افتح بطاقة صحة البريد' }).click();
  await expect(card(page)).toBeFocused();
  await expect(page.locator('#ops-body')).toBeVisible();
  // طي بطاقة غير سليمة لهذه الجلسة وحدها: لا يُحفظ فيطوي زيارة سليمة لاحقة
  await setup(page, { state: 'amber', pref: 'open' });
  await card(page).getByRole('button', { name: 'صحة البريد والتنبيه' }).click();
  await expect(page.locator('#ops-body')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('mi_admin_ops_card'))).toBe('open');
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

// لقطتا الطي والفتح بعرض سطح المكتب: OPS_SHOTS=<مجلد> وحده
test('لقطتا البطاقة مطوية ومفتوحة', async ({ browser }) => {
  test.skip(!process.env.OPS_SHOTS, 'اللقطات بطلب');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const pref of ['closed', 'open']) {
    await setup(page, { state: 'green', pref, health: () => facts({ mail: { sent: 9 } }) });
    await expect(card(page).getByRole('button', { name: 'صحة البريد والتنبيه' })).toHaveAttribute('aria-expanded', pref === 'open' ? 'true' : 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await card(page).boundingBox();
    await page.screenshot({ path: `${process.env.OPS_SHOTS}/card-${pref === 'open' ? 'expanded' : 'collapsed'}-1440.png`, fullPage: true, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
  }
  await ctx.close();
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
