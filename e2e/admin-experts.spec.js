// شبكة الخبراء في لوحة الإدارة، وصفحة «انضم كخبير». الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const SHOT = process.env.SHOT_DIR;
const experts = [
  { id: 'e1', full_name: 'د. سارة الحربي', email: 's@x.com', title: 'مستشارة محافظ PMP', roles: ['coach', 'advisor'], dimensions: ['milestone', 'impact'], levels: ['intermediate', 'advanced'], sectors: ['حكومي'], languages: ['ar', 'en'], weekly_hours: 6, status: 'active', source: 'admin', created_at: '2026-10-01', updated_at: '2026-10-01' },
  { id: 'e2', full_name: 'خالد العتيبي', email: 'k@x.com', title: 'مدرب قيادة', roles: ['mentor'], dimensions: ['leadership'], levels: ['beginner'], sectors: [], languages: ['ar'], weekly_hours: 4, status: 'applied', source: 'application', created_at: '2026-10-28', updated_at: '2026-10-28' },
];

async function admin(page) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.experts': { success: true, experts },
      'admin.expert': { success: true, expert: experts.find((e) => e.id === b.id), activity: [{ action: 'expert.apply', actor: 'k@x.com', created_at: '2026-10-28' }],
        service: { sessions: 4, attended: 3, no_show: 1, upcoming: 0, participants: 2, hours: 2.5, cost: 750, reviews: { requirements: 1, models: 3, capstones: 1 }, recent: [{ id: 'c1', status: 'attended', starts_at: '2026-10-20', participants: { full_name: 'سارة' } }] } },
      'admin.expert-set-status': { success: true },
      'admin.expert-save': { success: true, expert: { ...experts[0], id: 'e3' }, invited: true },
      'admin.expert-requests': { success: true, requests: [
        { id: 'r1', participant_id: 'p1', role: 'coach', dimension: 'impact', status: 'unmatched', tried: ['e9'], created_at: '2026-10-29', participants: { full_name: 'سارة' } },
        { id: 'r2', participant_id: 'p2', role: 'advisor', dimension: null, status: 'accepted', expert_id: 'e1', score: 82.5, created_at: '2026-10-28', participants: { full_name: 'عمر' }, experts: { full_name: 'د. سارة الحربي' } },
      ] },
      'admin.expert-request-retry': { success: true, status: 'offered' },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الخبراء' }).click();
  return calls;
}

test('شبكة الخبراء: المؤشرات والفلترة ثم اعتماد طلب انضمام', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  const calls = await admin(page);
  const rows = page.locator('.ex-table tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: /طلبات بانتظار المراجعة/ }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: /طلبات بانتظار المراجعة/ }).click();
  await page.getByRole('combobox', { name: 'الأدوار' }).selectOption('coach');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('د. سارة الحربي');
  if (SHOT) await page.locator('.ex').screenshot({ path: `${SHOT}/experts.png` });
  await page.getByRole('button', { name: 'مسح الكل' }).click();
  await page.getByText('خالد العتيبي').click();
  await expect(page.getByRole('heading', { name: 'خالد العتيبي' })).toBeVisible();
  await expect(page.locator('.ex-service')).toContainText('2.5');
  await expect(page.locator('.ex-service')).toContainText('750 ريال');
  if (SHOT) await page.locator('.ex-profile').screenshot({ path: `${SHOT}/expert.png` });
  await page.getByRole('button', { name: 'اعتماد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-set-status')).toMatchObject({ id: 'e2', status: 'active' });
});

test('إضافة خبير بدعوة، والسعر حقل إداري', async ({ page }) => {
  const calls = await admin(page);
  await page.getByRole('button', { name: '+ خبير' }).click();
  await page.getByLabel('الاسم *').fill('منى القحطاني');
  await page.getByLabel('البريد *').fill('m@x.com');
  await page.locator('.ex-tg', { hasText: 'موجّه' }).click();
  await page.getByLabel('سعر الساعة (ريال)').fill('0');
  await page.getByRole('button', { name: 'إضافة وإرسال الدعوة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-save')).toMatchObject({ full_name: 'منى القحطاني', email: 'm@x.com', roles: ['coach'], hourly_rate: '0' });
});

// الخادم يطلب التحقق البشري قبل قبول الطلب (server-sec-2): تظهر الأداة، ويُعاد الإرسال برمزها وحده
const TURNSTILE = `window.turnstile = { render(el, o) { el.textContent = 'تحقق'; setTimeout(() => o.callback('tok-human-0123456789'), 50); return 'w1'; }, remove() {} };`;
test('انضم كخبير: التحقق ثم الإرسال', async ({ page }) => {
  let sent = null;
  const applies = [];
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'expert.apply') return route.fulfill({ json: { success: false } });
    applies.push(b);
    sent = b;
    await route.fulfill({ json: b.captcha ? { success: true, received: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
  });
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto('http://localhost:4304/expert');
  await expect(page.getByRole('heading', { name: 'انضم إلى شبكة خبراء برنامج القادة' })).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/apply.png`, fullPage: true });
  await page.getByLabel('الاسم الكامل *').fill('سارة الحربي');
  await page.getByLabel('البريد الإلكتروني *').fill('s@x.com');
  await page.locator('.xp-opt', { hasText: 'مستشار' }).first().click();
  await page.locator('.xp-opt', { hasText: 'تمكين القائد' }).click();
  await page.getByLabel('عرّف بخبرتك *').fill('خبرة خمسة عشر عامًا في قيادة محافظ المشاريع الحكومية وتحويلها إلى أثر قابل للقياس، وتدريب القادة.');
  await page.getByRole('button', { name: 'أرسل طلب الانضمام' }).click();
  await expect(page.getByRole('heading', { name: 'وصل طلبك' })).toBeVisible();
  expect(applies.map((b) => b.captcha || null)).toEqual([null, 'tok-human-0123456789']);
  expect(sent).toMatchObject({ full_name: 'سارة الحربي', roles: ['advisor'], dimensions: ['leadership'] });
});

test('طلبات الإسناد: القائمة بحالاتها، وإعادة المحاولة لطلب بلا خبير', async ({ page }) => {
  const calls = await admin(page);
  const board = page.locator('.xm-board');
  await expect(board.locator('tbody tr')).toHaveCount(1);
  await expect(board).toContainText('قبِله الخبير');
  await board.getByRole('button', { name: /بلا خبير/ }).click();
  await board.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-request-retry')).toMatchObject({ id: 'r1' });
});

test('عرض الخدمة للخبير: القبول برابط الرمز', async ({ page }) => {
  let sent = null;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'offer.respond') sent = b;
    await route.fulfill({ json: b.action === 'offer.get'
      ? { success: true, offer: { status: 'offered', expert: 'د. سارة', role_ar: 'كوتش', dimension_ar: 'تحويل المشروع إلى أثر', level_ar: 'متوسط', participant: 'عمر', expires_at: new Date(Date.now() + 20 * 36e5).toISOString() } }
      : { success: true, accepted: true } });
  });
  await page.goto('http://localhost:4304/offer?t=' + 'x'.repeat(40));
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة' })).toBeVisible();
  await expect(page.locator('.xo-facts')).toContainText('20 ساعة');
  if (SHOT) await page.screenshot({ path: `${SHOT}/offer.png`, fullPage: true });
  await page.getByRole('button', { name: 'أقبل الطلب' }).click();
  await expect(page.getByRole('heading', { name: 'قُبل الطلب' })).toBeVisible();
  expect(sent).toMatchObject({ accept: true });
});

test('لوحة الخبير: الدخول بالرمز، والرد على عرض، وتقييم مشارك، ولا سعر ولا تكلفة', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'xp.auth-start': { success: true, sent: true },
      'xp.auth-verify': b.code === '123456' ? { success: true, token: 'x'.repeat(40), expert: { full_name: 'د. سارة' } } : { success: false, message: 'الرمز غير صحيح', code: 'code' },
      'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة محافظ', roles: ['coach', 'advisor'] },
        stats: { hours: 7.5, participants: 4, attended: 9, upcoming: 2, no_show: 1 }, rating: { count: 3, min: 5 },
        requests: [
          { id: 'r1', status: 'offered', role_ar: 'كوتش', dimension_ar: 'تمكين القائد', level_ar: 'متوسط', expires_at: new Date(Date.now() + 10 * 36e5).toISOString(), participant: { name: 'عمر' } },
          { id: 'r2', status: 'accepted', role_ar: 'مستشار', participant: { name: 'منى السالم', email: 'm@x.com', job_title: 'مديرة مشروع' } },
        ],
        sessions: [{ id: 's1', status: 'attended', starts_at: '2026-10-20T10:00:00Z', ends_at: '2026-10-20T11:00:00Z', participant: 'منى السالم', to_rate: true }],
        criteria: { ready: 'جاء مستعدًا', engaged: 'تفاعل بجدية', progress: 'يتقدّم في هدفه' } },
      'xp.respond': { success: true, accepted: true },
      'xp.rate': { success: true },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.setViewportSize({ width: 1200, height: 1300 });
  await page.goto('http://localhost:4304/x');
  await page.getByLabel('البريد الإلكتروني').fill('s@x.com');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await page.getByLabel('رمز التحقق').fill('123456');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  await expect(page.locator('.xpp-kpis')).toContainText('7.5');
  await expect(page.locator('.xpp-kpis')).toContainText('يظهر تقييمك بعد 5');
  await expect(page.locator('body')).not.toContainText('ريال');
  if (SHOT) await page.screenshot({ path: `${SHOT}/portal.png`, fullPage: true });
  await page.locator('.xpp-offer').getByRole('button', { name: 'أقبل' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'xp.respond')).toMatchObject({ id: 'r1', accept: true });
  await page.locator('.xpp-torate').getByRole('button', { name: 'قيّم' }).click();
  for (const l of ['جاء مستعدًا', 'تفاعل بجدية', 'يتقدّم في هدفه']) await page.getByRole('radiogroup', { name: l }).getByRole('radio', { name: '4 من 5' }).click();
  await page.getByRole('button', { name: 'احفظ التقييم' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'xp.rate')).toMatchObject({ kind: 'session', id: 's1', scores: { ready: 4, engaged: 4, progress: 4 } });
});

test('لوحة الخبير: زر الدخول بحساب Google ظاهر في شاشة الدخول', async ({ page }) => {
  await page.route(/accounts\.google\.com/, (r) => r.fulfill({ contentType: 'text/javascript', body: "window.google={accounts:{id:{initialize(){},renderButton(el){el.appendChild(document.createElement('div'));}}}};" }));
  await page.goto('http://localhost:4304/x');
  await expect(page.getByRole('heading', { name: 'لوحة الخبير' })).toBeVisible();
  await expect(page.getByText('بحساب Google بالبريد نفسه المسجل في شبكة الخبراء.')).toBeVisible();
});

test('قوالب البريد: معرض بعائلاته، ونسخة تجريبية لبريد المدير', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.mail-gallery': { success: true, mails: [
        { key: 'signin', family: 'access', label: 'رمز دخول المشارك', subject: 'رمز الدخول إلى رحلتك', html: '<h1>رمز الدخول</h1>' },
        { key: 'approved', family: 'journey', label: 'اعتماد المستوى', subject: 'اعتُمد مستواك', html: '<h1>اعتُمد</h1>' },
      ] },
      'admin.mail-send-test': { success: true, to: 'a@x' },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'قوالب البريد' }).click();
  await expect(page.getByRole('heading', { name: 'رمز الدخول إلى رحلتك' })).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد المستوى' }).click();
  await expect(page.frameLocator('.mg-frame').getByText('اعتُمد')).toBeVisible();
  await page.getByRole('button', { name: 'أرسل نسخة لي' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.mail-send-test')).toMatchObject({ key: 'approved' });
});
