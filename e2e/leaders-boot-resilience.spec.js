// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 3 (ش9): صمود الإقلاع أمام الأعطال العابرة. الخلفية مُحاكاة.
// - البوابة تفشل نحو 10 ثوانٍ عند الفتح ثم تعود: لا شاشة خطأ كاملة ولا «جارٍ إعادة الاتصال»، والرحلة تظهر وحدها.
// - عطل أطول من ميزانية الإعادة (20 ثانية): «جارٍ إعادة الاتصال…» بلا طريق مسدود، ويعود وحده حين تعود الخدمة، والجلسة باقية.
// - الجهاز بلا اتصال: «لا اتصال بالإنترنت»، ويكمل وحده عند عودة الاتصال.
// - «ادخل بحساب آخر» عند خطأ الشبكة لا يمسح الجلسة: شاشة الدخول والجلسة محفوظة حتى ينجح الدخول الجديد، و«رجوع» يعيد.
// - إقلاع الجلسة القديمة الجاري لا يطغى على دخول جديد سريع، و«حاول الآن» معطل بـ«جارٍ المحاولة…» أثناء إعادة تلقائية.
// - رابط البريد بلا اتصال وبلا جلسة: رسالة تدل على الخطوة التالية لا «تعذّر التأكد».
// لقطات المراجعة بعرض 390 وبدقة مضاعفة حين يُضبط REL3_SHOTS بمجلد (لا في CI).
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const TOKEN = 'tok-resilience-000000000000000000';
const SHOTS = process.env.REL3_SHOTS || '';
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, ...(SHOTS && { deviceScaleFactor: 2 }) });

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })),
  progress: 80, passkeys: 1, prompt_passkey: false,
};

// down(b): true يُسقط طلب me كما يُسقطه رد بوابة بلا CORS أو انقطاع الشبكة (TypeError في fetch)
async function participant(page, down) {
  const state = { me: 0, failed: 0 };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'me') {
      state.me += 1;
      if (await down(b, route)) { state.failed += 1; return route.abort('failed'); }
      return route.fulfill({ json: me });
    }
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => {
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('mi_leaders_session', t); sessionStorage.setItem('seeded', '1'); }
    // يُسجَّل كل ظهور لشاشة خطأ أو لإعادة الاتصال، فيُعرف أنها لم تظهر لحظة واحدة
    window.__seen = { error: false, reconnect: false };
    new MutationObserver(() => {
      if (document.querySelector('.alert.err')) window.__seen.error = true;
      if (document.querySelector('.reconnect')) window.__seen.reconnect = true;
    }).observe(document, { childList: true, subtree: true });
  }, TOKEN);
  return state;
}
const journeyShown = (page) => expect(page.getByRole('heading', { name: 'سارة، رحلتك مفتوحة' })).toBeVisible({ timeout: 30_000 });
const token = (page) => page.evaluate(() => localStorage.getItem('mi_leaders_session'));
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}` });
}

test('البوابة تفشل 10 ثوانٍ عند الفتح ثم تعود: لا شاشة خطأ، والرحلة تظهر وحدها', async ({ page }) => {
  test.setTimeout(60_000);
  let t0 = 0;
  const state = await participant(page, () => { t0 ||= Date.now(); return Date.now() - t0 < 10_000; });
  await page.goto(APP);
  await journeyShown(page);
  expect(state.failed).toBeGreaterThan(1);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(10_000);
  expect(await page.evaluate(() => window.__seen)).toEqual({ error: false, reconnect: false });
  await expect(page.getByText('تعذّر الاتصال')).toHaveCount(0);
  expect(await token(page)).toBe(TOKEN);
});

test('عطل أطول من ميزانية الإعادة: «جارٍ إعادة الاتصال…» ثم عودة وحدها حين تعود الخدمة، والجلسة باقية', async ({ page }) => {
  test.setTimeout(90_000);
  let up = false;
  const state = await participant(page, () => !up);
  await page.goto(APP);
  const card = page.locator('.reconnect');
  await expect(card.getByRole('heading', { name: 'جارٍ إعادة الاتصال…' })).toBeVisible({ timeout: 40_000 });
  // الطلب سقط بخطأ شبكة والجهاز متصل: لا يُلام الخادم، بل يُدعى إلى فحص الشبكة
  await expect(card).toContainText('تعذّر الوصول إلى الخدمة، تحقّق من الشبكة. نعيد المحاولة تلقائيًا.');
  await expect(card.locator('button.btn')).toBeVisible();
  // لا الطريق المسدود القديم: رسالة الخطأ بزر «حاول مرة أخرى»
  await expect(page.locator('.alert.err')).toHaveCount(0);
  expect(await token(page)).toBe(TOKEN);
  await shot(page, 'reconnecting-390.png');
  const before = state.me;
  up = true;
  // بلا ضغطة: المؤقت يعيد الإقلاع (3 ثوانٍ على الأكثر للإعادة الأولى، ثم ميزانية الطلب نفسه)
  await journeyShown(page);
  expect(state.me).toBeGreaterThan(before);
  expect(await token(page)).toBe(TOKEN);
});

test('الجهاز بلا اتصال: «لا اتصال بالإنترنت»، ويكمل وحده عند عودة الاتصال', async ({ page, context }) => {
  test.setTimeout(60_000);
  // الطلب الأول يُمسك حتى ينقطع الاتصال، ثم يسقط: الجهاز بلا اتصال لحظة الإخفاق
  let held = null;
  const gate = new Promise((ok) => { held = ok; });
  let offline = false, arrived = false;
  await participant(page, async () => { if (!offline) { arrived = true; await gate; } return offline; });
  await page.goto(APP);
  await expect.poll(() => arrived).toBe(true);
  offline = true;
  await context.setOffline(true);
  held();
  const card = page.locator('.reconnect');
  await expect(card.getByRole('heading', { name: 'لا اتصال بالإنترنت' })).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('نكمل تلقائيًا حين يعود الاتصال.');
  await expect(page.locator('.alert.err')).toHaveCount(0);
  await shot(page, 'offline-390.png');
  offline = false;
  await context.setOffline(false);
  await journeyShown(page);
  expect(await token(page)).toBe(TOKEN);
});

test('«ادخل بحساب آخر» عند خطأ الشبكة لا يمسح الجلسة، و«رجوع» يعيد إلى إعادة الاتصال', async ({ page, context }) => {
  test.setTimeout(60_000);
  let held = null;
  const gate = new Promise((ok) => { held = ok; });
  let offline = false, arrived = false;
  await participant(page, async () => { if (!offline) { arrived = true; await gate; } return offline; });
  await page.goto(APP);
  await expect.poll(() => arrived).toBe(true);
  offline = true;
  await context.setOffline(true);
  held();
  await expect(page.locator('.reconnect')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'ادخل بحساب آخر' }).click();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByText('جلستك الحالية محفوظة على هذا الجهاز حتى تدخل بالحساب الآخر.')).toBeVisible();
  // شاشة الدخول لا تقول «لا اتصال» بنفسها: الشريط يبقى
  await expect(page.locator('.offline-bar')).toBeVisible();
  await shot(page, 'switch-offline-390.png');
  expect(await token(page)).toBe(TOKEN);
  // عودة الاتصال أثناء شاشة الدخول لا تُخرج المستخدم منها (لا إقلاع تلقائي أثناء الدخول بحساب آخر)
  offline = false;
  await context.setOffline(false);
  await page.waitForTimeout(1500);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.getByRole('button', { name: 'رجوع' }).click();
  // الرجوع: إعادة الاتصال تعمل والجلسة نفسها تفتح الرحلة
  await journeyShown(page);
  expect(await token(page)).toBe(TOKEN);
});

test('إقلاع الجلسة القديمة الجاري لا يطغى على دخول بحساب آخر نجح قبله، و«حاول الآن» معطل أثناء الإعادة التلقائية', async ({ page }) => {
  test.setTimeout(90_000);
  const NEW = 'tok-resilience-new-0000000000000000';
  const other = { ...me, token: NEW, participant: { ...me.participant, id: 'p2', full_name: 'ليلى الحربي', email: 'layla@x.sa' }, profile: { ...me.profile, full_name: 'ليلى الحربي' } };
  let phase = 'fail', held = null, heldArrived = false;
  const gate = new Promise((ok) => { held = ok; });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'me' && b.token === TOKEN) {
      if (phase === 'fail') return route.abort('failed');
      heldArrived = true;
      await gate;
      return route.fulfill({ json: me }).catch(() => {});
    }
    if (b.action === 'me') return route.fulfill({ json: other });
    if (b.action === 'auth.start') return route.fulfill({ json: { success: true } });
    if (b.action === 'auth.verify') return route.fulfill({ json: other });
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => {
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('mi_leaders_session', t); sessionStorage.setItem('seeded', '1'); }
  }, TOKEN);
  await page.goto(APP);
  await expect(page.locator('.reconnect')).toBeVisible({ timeout: 40_000 });
  // الإعادة التلقائية التالية تبدأ وتُمسك: الزر يقول إنها جارية ولا يُضغط بلا أثر
  phase = 'hold';
  await expect.poll(() => heldArrived, { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'جارٍ المحاولة…' })).toBeDisabled();
  await shot(page, 'reconnecting-working-390.png');
  // دخول سريع بحساب آخر أثناء الإقلاع القديم
  await page.getByRole('button', { name: 'ادخل بحساب آخر' }).click();
  await page.locator('input[type="email"]').fill('layla@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('رمز التحقق').fill('123456');
  await expect(page.getByRole('heading', { name: 'ليلى، رحلتك مفتوحة' })).toBeVisible({ timeout: 15_000 });
  expect(await token(page)).toBe(NEW);
  // الإقلاع القديم ينجح الآن برحلة الحساب السابق: لا يُطبَّق
  held();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { name: 'ليلى، رحلتك مفتوحة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'سارة، رحلتك مفتوحة' })).toHaveCount(0);
  expect(await token(page)).toBe(NEW);
});

test('رابط البريد يفشل بخطأ شبكة ولا جلسة: رسالة تدل على طلب رمز جديد لا «تعذّر التأكد»', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'auth.verify') return route.abort('failed');
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(`${APP}verify?e=sara%40x.sa&t=link-0000000000000000`);
  await expect(page.getByText('تعذّر إكمال الدخول من الرابط، اطلب رمزًا جديدًا من شاشة الدخول')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('تعذّر التأكد')).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await shot(page, 'verify-link-network-390.png');
});
