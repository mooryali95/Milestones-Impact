// تصور «تحديث المنصة بلا أثر على المستخدمين»: آخر ملخص رحلة معروف (المرحلة 3 البند 5) والرصد من جهة العميل (المرحلة 4).
// الخلفية مُحاكاة.
// - فتح ناجح يحفظ ملخص الرحلة، وفتح بلا اتصال يعرضه للقراءة فقط مع «لا اتصال بالإنترنت»، بلا زر فيه، ثم تعود الرحلة وحدها.
// - إخفاق الفتح بلا اتصال يُحفظ حدثًا في طابور الجهاز، ويُرسل إلى client.event بعد عودة الاتصال بلا رمز ولا بيانات شخصية.
// - الخروج يمسح الملخص.
// لقطة المراجعة بعرض 390 وبدقة مضاعفة حين يُضبط REL4_SHOTS بمجلد (لا في CI).
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const TOKEN = 'tok-telemetry-00000000000000000000';
const SHOTS = process.env.REL4_SHOTS || '';
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, ...(SHOTS && { deviceScaleFactor: 2 }) });

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active'], ['impact', 'القياس البعدي', 'impact', 'locked']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })),
  progress: 45, passkeys: 1, prompt_passkey: false,
};

// state.hold: وعد يُمسك طلب me حتى ينقطع الاتصال ثم يُسقطه، كما في leaders-boot-resilience.spec.js (الصفحة نفسها تُحمَّل
// والاتصال قائم، لأن عامل الخدمة محجوب في الاختبار)
async function participant(page) {
  const state = { me: 0, events: [], bodies: [], hold: null, arrived: false };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const raw = route.request().postData() || '{}';
    const b = JSON.parse(raw);
    if (b.action === 'client.event') { state.events.push(...b.events); state.bodies.push(raw); return route.fulfill({ json: { success: true, stored: b.events.length } }); }
    if (b.action === 'me') {
      state.me += 1;
      if (state.hold) { state.arrived = true; const drop = await state.hold; if (drop) return route.abort('internetdisconnected'); }
      return route.fulfill({ json: me });
    }
    return route.fulfill({ json: { success: true } });
  });
  await page.addInitScript((t) => {
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('mi_leaders_session', t); sessionStorage.setItem('seeded', '1'); }
  }, TOKEN);
  return state;
}
const journeyShown = (page) => expect(page.getByRole('heading', { name: 'سارة، رحلتك مفتوحة' })).toBeVisible({ timeout: 30_000 });
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

test('فتح بلا اتصال يعرض آخر ملخص للرحلة للقراءة فقط، والحدث يُرسل بعد عودة الاتصال', async ({ page, context }) => {
  test.setTimeout(90_000);
  const state = await participant(page);
  await page.goto(APP);
  await journeyShown(page);
  // الملخص بعد الفتح الناجح: المراحل وحالها، بلا رمز ولا اسم ولا بريد
  const saved = await stored(page, 'mi_leaders_last_journey');
  expect(saved).toContain('التدريب');
  for (const s of [TOKEN, 'سارة', 'sara@x.sa']) expect(saved).not.toContain(s);

  let release = null;
  state.hold = new Promise((ok) => { release = ok; });
  await page.reload();
  await expect.poll(() => state.arrived).toBe(true);
  await context.setOffline(true);
  state.hold = null;
  release(true);
  const card = page.locator('.reconnect');
  await expect(card.getByRole('heading', { name: 'لا اتصال بالإنترنت' })).toBeVisible({ timeout: 20_000 });
  const last = page.getByTestId('last-known');
  await expect(last).toBeVisible();
  await expect(last).toContainText('آخر ما عُرف، للقراءة فقط');
  await expect(last).toContainText(/اليوم \d\d:\d\d/);
  await expect(last).toContainText('45% من الرحلة');
  await expect(last).toContainText('التدريب');
  await expect(last).toContainText('جارية');
  await expect(last.locator('button, a')).toHaveCount(0);
  // الإخفاق محفوظ في طابور الجهاز ولم يُرسل بعد
  await expect.poll(async () => JSON.parse((await stored(page, 'mi_leaders_client_events')) || '[]').map((e) => `${e.kind}:${e.act}`)).toContain('offline:me');
  expect(state.events).toEqual([]);
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/last-known-reconnecting-390.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/last-known-reconnecting-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await context.setOffline(false);
  await journeyShown(page);
  await expect.poll(() => state.events.map((e) => `${e.kind}:${e.act}`), { timeout: 15_000 }).toContain('offline:me');
  const ev = state.events.find((e) => e.act === 'me');
  expect(Object.keys(ev).sort()).toEqual(['act', 'at', 'build', 'kind', 'tries']);
  for (const raw of state.bodies) for (const s of [TOKEN, 'sara', 'p1']) expect(raw).not.toContain(s);
  await expect.poll(() => stored(page, 'mi_leaders_client_events')).toBeNull();
  // الملخص باقٍ ما دامت الجلسة
  expect(await stored(page, 'mi_leaders_last_journey')).toContain('التدريب');
});

test('خطأ صفحة يُحفظ منقّى ويُرسل، والخروج يمسح الملخص', async ({ page }) => {
  test.setTimeout(60_000);
  const state = await participant(page);
  await page.goto(APP);
  await journeyShown(page);
  expect(await stored(page, 'mi_leaders_last_journey')).toContain('التدريب');
  await page.evaluate(() => { setTimeout(() => { throw new Error('boom for sara@x.sa code 123456'); }, 0); });
  await expect.poll(() => state.events.filter((e) => e.kind === 'error').map((e) => e.message), { timeout: 15_000 }).toEqual(['boom for [email] code #']);
  await page.getByRole('button', { name: 'خروج' }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /خروج|اخرج/ }).first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  expect(await stored(page, 'mi_leaders_last_journey')).toBeNull();
  expect(await stored(page, 'mi_leaders_session')).toBeNull();
});
