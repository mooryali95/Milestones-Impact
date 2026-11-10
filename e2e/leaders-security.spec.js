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

test('تسجيل جديد: الرد نفسه لكل بريد، والاسم بعد الرمز، والرمز يعود مع الاسم', async ({ page }) => {
  const sent = [];
  await page.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action === 'auth.start') return route.fulfill({ json: b.captcha ? { success: true, sent: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
    if (b.action === 'auth.verify') {
      if (!b.full_name) return route.fulfill({ json: { success: false, code: 'needs_name', needs_name: true, message: 'أكمل اسمك' } });
      if (b.phone === '12') return route.fulfill({ json: { success: false, code: 'phone', message: 'رقم الجوال غير صحيح. اكتبه بصيغة 05XXXXXXXX.' } });
      return route.fulfill({ json: { token: 'tok-new-000000000000000000000', ...me } });
    }
    return route.fulfill({ json: me });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('new@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  // لا خطوة اسم قبل الرمز: الشاشة نفسها لمسجل وجديد
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  await expect(page.getByLabel('الاسم الكامل')).toHaveCount(0);
  await page.getByLabel('رمز التحقق').fill('246810');
  await expect(page.getByRole('heading', { name: 'أهلًا بك في البرنامج' })).toBeVisible();
  await page.getByLabel('الاسم الكامل').fill('نورة السالم');
  await page.getByLabel(/رقم الجوال/).fill('12');
  await page.getByRole('button', { name: 'أنشئ حسابي' }).click();
  // خطأ في الملف يبقي خطوة الاسم بما كُتب فيها
  await expect(page.getByText('رقم الجوال غير صحيح')).toBeVisible();
  await expect(page.getByLabel('الاسم الكامل')).toHaveValue('نورة السالم');
  await page.getByLabel(/رقم الجوال/).fill('0500000000');
  await page.getByRole('button', { name: 'أنشئ حسابي' }).click();
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  const starts = sent.filter((b) => b.action === 'auth.start');
  expect(starts.every((b) => !('full_name' in b) && !('pass' in b))).toBe(true);
  expect(sent.filter((b) => b.action === 'auth.verify').map((b) => [b.code, b.full_name || null, b.confirm_new || null])).toEqual([
    ['246810', null, null], ['246810', 'نورة السالم', true], ['246810', 'نورة السالم', true],
  ]);
});

test('رابط البريد لبريد جديد يفتح خطوة الاسم، والرابط نفسه يعود مع الاسم', async ({ page }) => {
  const verifies = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'auth.verify') return route.fulfill({ json: me });
    verifies.push(b);
    await route.fulfill({ json: b.full_name ? { token: 'tok-new-000000000000000000000', ...me } : { success: false, code: 'needs_name', needs_name: true, message: 'أكمل اسمك' } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(`${APP}verify?e=new%40x.sa&t=link-token-1`);
  await expect(page.getByText('تحقّقنا من بريدك')).toBeVisible();
  await page.getByLabel('الاسم الكامل').fill('نورة السالم');
  await page.getByRole('button', { name: 'أنشئ حسابي' }).click();
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  expect(verifies.map((b) => [b.email, b.link, b.full_name || null])).toEqual([
    ['new@x.sa', 'link-token-1', null], ['new@x.sa', 'link-token-1', 'نورة السالم'],
  ]);
});

test('رابط مستعمل وفي الجهاز جلسة سارية: يدخل صاحبه بدل رسالة خطأ', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'auth.verify') return route.fulfill({ json: { success: false, code: 'used', message: 'استُخدم رابط الدخول هذا من قبل' } });
    return route.fulfill({ json: b.action === 'me' ? me : { success: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-security-0000000000000000'); });
  await page.goto(`${APP}verify?e=sara%40x.sa&t=used-token`);
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  await expect(page.getByText('استُخدم رابط الدخول')).toHaveCount(0);
});

test('رابط مستعمل بلا جلسة: رسالة تسمّي الرابط لا الرمز', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: { success: false, code: 'used', message: 'استُخدم رابط الدخول هذا من قبل، فكل رابط لمرة واحدة.' } }));
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(`${APP}verify?e=sara%40x.sa&t=used-token`);
  await expect(page.getByText('استُخدم رابط الدخول هذا من قبل')).toBeVisible();
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
});

test('/verify بلا رابط كامل: شاشة الدخول بلا رسالة خطأ ولا طلب تحقق', async ({ page }) => {
  const actions = [];
  await page.route(/functions\/v1\/leaders-api/, (route) => { actions.push(JSON.parse(route.request().postData() || '{}').action); return route.fulfill({ json: { success: false } }); });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(`${APP}verify`);
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  await expect(page.locator('.alert.err')).toHaveCount(0);
  expect(actions).not.toContain('auth.verify');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('التحقق البشري: فشل التحميل غير فشل التحقق، وزر يعيد المحاولة', async ({ page }) => {
  let mode = 'block';
  // المرة الأولى يُحجب السكربت، ثم يُحمَّل وأداته ترفض، ثم تنجح بعد إعادة المحاولة
  const FAILING = `window.turnstile = { n: 0, render(el, o) { this.o = o; el.textContent = 'تحقق'; setTimeout(() => o['error-callback'](), 30); return 'w1'; }, reset() { setTimeout(() => this.o.callback('tok-human-0123456789'), 30); }, remove() {} };`;
  await page.route(/challenges\.cloudflare\.com/, (r) => (mode === 'block' ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: FAILING })));
  const starts = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    starts.push(b);
    await route.fulfill({ json: b.captcha ? { success: true, sent: true } : { success: false, code: 'captcha', site_key: '0x4AAA', message: 'أكّد أنك لست برنامجًا آليًا' } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.getByText('تعذّر تحميل أداة التحقق')).toBeVisible();
  mode = 'fail';
  await page.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(page.getByText('لم يكتمل التحقق')).toBeVisible();
  await expect(page.getByText('تعذّر تحميل أداة التحقق')).toHaveCount(0);
  await page.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(page.getByLabel('رمز التحقق')).toBeVisible();
  expect(starts.map((s) => s.captcha || null)).toEqual([null, 'tok-human-0123456789']);
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
