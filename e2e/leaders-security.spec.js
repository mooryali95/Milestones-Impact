// حماية الدخول والأجهزة في منصة القادة: التحقق البشري حين يطلبه الخادم،
// وقائمة الأجهزة وإنهاء جلساتها. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const TURNSTILE = `window.turnstile = { render(el, o) { el.textContent = 'تحقق'; setTimeout(() => o.callback('tok-human-0123456789'), 50); return 'w1'; }, remove() {} };`;

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', years_experience: 8 },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

test('الخادم يطلب التحقق البشري: تظهر الأداة ويُعاد الطلب برمزها، ثم خطوة الرمز', async ({ page }) => {
  const starts = [];
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'auth.start') return route.fulfill({ json: { success: false } });
    starts.push(b);
    await route.fulfill({ json: b.captcha ? { success: true, sent: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  expect(starts.map((s) => s.captcha || null)).toEqual([null, 'tok-human-0123456789']);
});

test('تسجيل جديد: التحقق البشري قبل طلب الاسم، والتصريح يحمله إلى خطوة الاسم وإعادة الإرسال بلا تحدٍّ ثانٍ', async ({ page }) => {
  const starts = [];
  const PASS = `1893456000000.${'a'.repeat(64)}`;
  // ساعة مضبوطة: عدّ إعادة الإرسال (45 ثانية) يُقدَّم ثانيةً ثانية بدل انتظاره
  await page.clock.install({ time: new Date('2026-11-05T10:00:00Z') });
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'auth.start') return route.fulfill({ json: { success: false } });
    starts.push(b);
    // الخادم لا يقول «بريد جديد» قبل التحقق البشري؛ وبعده يطلب الاسم ويعيد تصريحًا
    if (!b.captcha && !b.pass) return route.fulfill({ json: { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
    if (!b.full_name) return route.fulfill({ json: { success: true, needs_name: true, pass: PASS } });
    await route.fulfill({ json: { success: true, sent: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('new@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.locator('.captcha')).toBeVisible();
  await page.clock.runFor(100);   // الأداة الوهمية تعيد رمزها بعد 50 جزءًا من الثانية
  await expect(page.getByRole('heading', { name: 'أهلًا بك في البرنامج' })).toBeVisible();
  await page.getByLabel('الاسم الكامل').fill('نورة السالم');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  for (let i = 0; i < 46; i++) await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'أعد إرسال الرمز' }).click();
  await expect.poll(() => starts.length).toBe(4);
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  // التحدي مرة واحدة: الطلبان الأخيران يحملان التصريح والاسم بلا رمز تحقق جديد
  expect(starts.map((s) => [s.captcha || null, s.pass || null, s.full_name || null])).toEqual([
    [null, null, null], ['tok-human-0123456789', null, null], [null, PASS, 'نورة السالم'], [null, PASS, 'نورة السالم'],
  ]);
});

test('لوحة الخبير: الخادم يطلب التحقق البشري فتظهر الأداة ويُعاد الطلب برمزها، ثم خطوة الرمز', async ({ page }) => {
  const starts = [];
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'xp.auth-start') return route.fulfill({ json: { success: false, code: 'session', message: 'سجّل الدخول' } });
    starts.push(b);
    await route.fulfill({ json: b.captcha ? { success: true, sent: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
  });
  await page.goto('http://localhost:4304/x');
  await page.getByLabel('البريد الإلكتروني').fill('expert@x.sa');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  expect(starts.map((s) => s.captcha || null)).toEqual([null, 'tok-human-0123456789']);
});

test('أجهزتك: الاسم في الشريط يفتح الملف، وإنهاء الأجهزة الأخرى', async ({ page }) => {
  const sent = [];
  let sessions = [
    { id: 's1', method: 'passkey', user_agent: 'Mozilla/5.0 (Macintosh; Mac OS X) Chrome/130 Safari/537', last_seen_at: '2026-10-25T10:00:00Z', current: true },
    { id: 's2', method: 'email_code', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18) Safari/604', last_seen_at: '2026-10-20T08:00:00Z', current: false },
  ];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action === 'sessions.revoke') sessions = sessions.filter((x) => x.current);
    const r = { me, 'sessions.list': { success: true, sessions }, 'sessions.revoke': { success: true, sessions }, certificate: { success: true, certificate: null } }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-security-0000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  await expect(page.getByRole('heading', { name: 'أجهزتك' })).toBeVisible();
  await expect(page.getByText('Safari على iPhone أو iPad')).toBeVisible();
  await expect(page.getByText('هذا الجهاز')).toBeVisible();
  await page.getByRole('button', { name: 'اخرج من الأجهزة الأخرى' }).click();
  await expect(page.getByText('Safari على iPhone أو iPad')).toHaveCount(0);
  expect(sent.find((b) => b.action === 'sessions.revoke')).not.toHaveProperty('id');
});
