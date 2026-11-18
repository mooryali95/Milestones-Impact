// الأرقام الستة والماسح داخل التطبيق وعرض الخبير (W2، تصور الحضور 2026-11-18 ب5.5): «سجّل حضوري» يفتح لوحًا بالكاميرا
// والأرقام الستة والبديل اليدوي. الأرقام الخاطئة تُرد بما بقي من محاولات، والصحيحة تسجّل بطريقة code. وبلا BarcodeDetector
// يقرأ البديل المستضاف ذاتيًا الرمز من الكاميرا (بثّ لوحة رسم مُحاكاة) فيسجّل بمسار المسح نفسه، وتُطفأ الكاميرا عند الإغلاق.
// وشاشة الرمز بأرقامها في الإدارة وفي بوابة الخبير المكلف، والخبير غير المكلف يُرد. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR;
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const later = (h) => new Date(Date.now() + h * 36e5).toISOString();
const SID = '0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f';
const TOKEN = `${SID}.${Math.floor(Date.now() / 30000)}.abcdefabcdefabcdefab`;
const CODE = '482913';
const DONE = { success: true, already: false, session: { title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر' }, at: new Date().toISOString() };

const items = (attended = false) => [{ id: 'r3', code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', required: true, status: 'pending',
  activity: { type: 'workshop', done: false, count: attended ? 3 : 2, total: 4, verify: 'qr', sessions: [
    { id: 'w3', title: 'اليوم الثالث', mode: 'in_person', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5), attended, open: true },
  ] } }];
const me = (attended = false) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', items: items(attended), done: 0, total: 1 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
});

async function participant(page, checkin) {
  const calls = [];
  let attended = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'workshop.checkin') { const r = checkin(b); if (r.success) attended = true; return route.fulfill({ json: r }); }
    return route.fulfill({ json: me(attended) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  return calls;
}

// كاميرا مُحاكاة: بثّ لوحة رسم فيها صورة (رمز QR أو إطار فارغ)، بلا BarcodeDetector فيعمل البديل المستضاف ذاتيًا.
// وكل مسار يُعلَّم عند إطفائه، فيُتحقق أن الإغلاق يطفئ الكاميرا
async function fakeCamera(page, dataUrl) {
  await page.addInitScript((src) => {
    delete window.BarcodeDetector;
    window.__stopped = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let img = null;
    if (src) { const i = new Image(); i.onload = () => { img = i; }; i.src = src; }
    // البثّ لا يرسل إطارًا إلا حين تتغير اللوحة، فتُعاد رسمها دوريًا
    let tick = 0;
    const paint = () => { ctx.fillStyle = tick++ % 2 ? '#eeeeee' : '#efefef'; ctx.fillRect(0, 0, 480, 360); if (img) ctx.drawImage(img, 120, 60, 240, 240); };
    paint();
    setInterval(paint, 100);
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = canvas.captureStream(10);
      for (const t of stream.getTracks()) { const stop = t.stop.bind(t); t.stop = () => { window.__stopped++; stop(); }; }
      return stream;
    };
  }, dataUrl);
}

for (const width of [390, 1440]) test(`الأرقام الستة: الخاطئة تُرد بما بقي، والصحيحة تسجّل بطريقة code وتحدّث الرحلة (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await fakeCamera(page, null);
  let n = 0;
  const calls = await participant(page, (b) => (b.code === CODE ? { ...DONE, method: 'code' }
    : { success: false, code: 'code_wrong', left: 4 - n++, message: 'الأرقام غير صحيحة أو تغيّرت. اكتب الأرقام الظاهرة الآن (بقيت 4 محاولات)' }));
  await page.goto(APP);
  const card = page.locator('.j-session');
  await card.getByRole('button', { name: 'سجّل حضوري' }).click();
  const sheet = page.getByRole('dialog', { name: 'سجّل حضورك في «اليوم الثالث»' });
  const input = sheet.getByLabel('أو اكتب الأرقام الستة الظاهرة تحت الرمز');
  await expect(sheet.getByRole('button', { name: 'سجّل', exact: true })).toBeDisabled();
  await input.fill('111111');
  await sheet.getByRole('button', { name: 'سجّل', exact: true }).click();
  await expect(sheet.getByRole('alert').filter({ hasText: 'بقيت 4 محاولات' })).toBeVisible();
  // الأرقام العربية بمسافة تُرسل لاتينية متصلة
  await input.fill('٤٨٢ ٩١٣');
  await expect(input).toHaveAttribute('dir', 'ltr');
  await expect(input).toHaveValue('482 913');
  await expect(sheet.getByText('اطلب من المدرب تسجيل حضورك', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  if (SHOTS) { await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); await page.screenshot({ path: `${SHOTS}/w2-participant-code-${width}.png` }); }
  await sheet.getByRole('button', { name: 'سجّل', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'سُجّل حضورك في «اليوم الثالث»' })).toBeVisible();
  expect(calls.filter((c) => c.action === 'workshop.checkin').map((c) => c.code)).toEqual(['111111', CODE]);
  // النجاح يطفئ الكاميرا، و«تم» يحدّث الرحلة فيختفي الزر
  await expect.poll(() => page.evaluate(() => window.__stopped)).toBeGreaterThan(0);
  await page.getByRole('dialog').getByRole('button', { name: 'تم', exact: true }).click();
  await expect(card.getByText('سُجّل حضورك')).toBeVisible();
  await expect(card.getByRole('button', { name: 'سجّل حضوري' })).toHaveCount(0);
});

test('حد المحاولات وجلسة لدفعة أخرى: رسالة الخادم تُعرض كما هي ولا يُسجَّل شيء', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeCamera(page, null);
  await participant(page, () => ({ success: false, code: 'code_rate', message: 'محاولات خاطئة كثيرة. امسح الرمز بالكاميرا، أو اطلب من المدرب تسجيل حضورك، أو أعد المحاولة بعد عشر دقائق' }));
  await page.goto(APP);
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('أو اكتب الأرقام الستة الظاهرة تحت الرمز').fill(CODE);
  await sheet.getByRole('button', { name: 'سجّل', exact: true }).click();
  await expect(sheet.getByRole('alert').filter({ hasText: 'أعد المحاولة بعد عشر دقائق.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /سُجّل حضورك/ })).toHaveCount(0);
});

test('الماسح بلا BarcodeDetector: البديل المستضاف ذاتيًا يقرأ الرمز من الكاميرا ويسجّل بمسار المسح نفسه', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const url = `https://leaders.sunkvalue.com/?checkin=${encodeURIComponent(TOKEN)}`;
  await fakeCamera(page, await QRCode.toDataURL(url, { width: 480, margin: 2 }));
  const scripts = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).host); });
  const calls = await participant(page, (b) => (b.t === TOKEN ? DONE : { success: false, code: 'qr_invalid', message: 'رمز الحضور غير صالح' }));
  await page.goto(APP);
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  await expect(page.getByRole('heading', { name: 'سُجّل حضورك في «اليوم الثالث»' })).toBeVisible({ timeout: 15000 });
  expect(calls.filter((c) => c.action === 'workshop.checkin').map((c) => [c.t, c.code])).toEqual([[TOKEN, undefined]]);
  // الفاك من التطبيق نفسه، لا من شبكة أخرى
  expect([...new Set(scripts)]).toEqual(['localhost:4304']);
  await expect.poll(() => page.evaluate(() => window.__stopped)).toBeGreaterThan(0);
});

test('الماسح: الكاميرا حية بإطار التوجيه، والإغلاق يطفئها، والرفض يقول البديل', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeCamera(page, null);
  await participant(page, () => DONE);
  await page.goto(APP);
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('وجّه الكاميرا إلى الرمز على شاشة القاعة', { exact: false })).toBeVisible();
  await expect(sheet.locator('.ck-frame')).toBeVisible();
  if (SHOTS) { await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); await page.screenshot({ path: `${SHOTS}/w2-scanner-sheet-390.png` }); }
  await sheet.getByRole('button', { name: 'إغلاق' }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__stopped)).toBeGreaterThan(0);
  // رفض الإذن: يُقال بالعربية، والأرقام الستة باقية
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('x', 'NotAllowedError'); }; });
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  await expect(page.getByRole('dialog').getByText('لم يُسمح للتطبيق باستعمال الكاميرا', { exact: false })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('أو اكتب الأرقام الستة الظاهرة تحت الرمز')).toBeVisible();
});

test('بوابة الخبير: شاشة جلسة لم يُفتح رمزها تنتقل إلى الرمز وحدها حين تُفتح النافذة، بلا إعادة تحميل', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  let open = false;
  const calls = await expert(page, null);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'xp.workshop-qr') return route.fallback();
    calls.push(b);
    return route.fulfill({ json: { ...QR, open, refresh_in: 5, session: { ...QR.session, id: 'w4', title: 'اليوم الرابع' } } });
  });
  await page.goto(`${APP}x`);
  const card = page.getByRole('region', { name: 'رمز الحضور' });
  await expect(card.getByText('اليوم الرابع')).toBeVisible();
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/w2-expert-list-390.png` });
  await card.locator('.xpp-attend').filter({ hasText: 'اليوم الرابع' }).getByRole('button', { name: 'اعرض رمز الحضور' }).click();
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await expect(screen.getByText('ويظهر الرمز هنا وحده حين يُفتح', { exact: false })).toBeVisible();
  await expect(screen.getByRole('img', { name: 'رمز الحضور' })).toHaveCount(0);
  open = true;
  await page.clock.runFor(6000);
  await expect(screen.getByRole('img', { name: 'رمز الحضور' })).toBeVisible();
  await expect(screen.locator('bdi.pq-digits')).toHaveText('482 913');
  // الأرقام تُنطق رقمًا رقمًا، ولا اسم على الحاوية العامة
  await expect(screen.locator('bdi.pq-digits')).toHaveAttribute('aria-label', '4 8 2 9 1 3');
  await expect(screen.locator('.pq-code')).not.toHaveAttribute('aria-label', /.*/);
  expect(calls.filter((c) => c.action === 'xp.workshop-qr').length).toBeGreaterThanOrEqual(2);
});

// الرمز نفسه أمام الكاميرا لا يُرسل مرتين: الرفض النهائي يوقف المسح ويطفئ الكاميرا ويقول السبب وحده، والرمز المنتهي ينتظر
// رمزًا آخر. فلا حلقة طلبات ما دام اللوح مفتوحًا
for (const [code, message, final] of [
  ['closed', 'تسجيل الحضور لهذه الجلسة غير متاح الآن', true],
  ['forbidden', 'هذه الجلسة ليست لدفعتك', true],
  ['qr_expired', 'انتهت صلاحية الرمز، امسح الرمز المعروض الآن', false],
]) test(`الماسح: رفض ${code} للرمز الممسوح لا يكرر الطلب`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const url = `https://leaders.sunkvalue.com/?checkin=${encodeURIComponent(TOKEN)}`;
  await fakeCamera(page, await QRCode.toDataURL(url, { width: 480, margin: 2 }));
  const calls = await participant(page, () => ({ success: false, code, message }));
  await page.goto(APP);
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  const sheet = page.getByRole('dialog');
  if (final) {
    const alert = sheet.locator('.ck-cam').getByRole('alert');
    await expect(alert).toContainText(`${message}.`, { timeout: 15000 });
    await expect(alert).not.toContainText('نحاول مع الرمز الظاهر الآن');
    await expect.poll(() => page.evaluate(() => window.__stopped)).toBeGreaterThan(0);
    await expect(sheet.locator('.ck-frame')).toHaveCount(0);
    if (SHOTS && code === 'closed') { await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); await page.screenshot({ path: `${SHOTS}/w2-scan-stopped-390.png` }); }
  } else {
    await expect(sheet.getByText(`${message}. نحاول مع الرمز الظاهر الآن.`)).toBeVisible({ timeout: 15000 });
  }
  // ثانيتان والرمز نفسه أمام الكاميرا (ثماني قراءات): طلب واحد لا أكثر
  await page.waitForTimeout(2000);
  expect(calls.filter((c) => c.action === 'workshop.checkin').map((c) => c.t)).toEqual([TOKEN]);
  // والأرقام الستة باقية بديلًا
  await expect(sheet.getByLabel('أو اكتب الأرقام الستة الظاهرة تحت الرمز')).toBeVisible();
  if (final) {
    // «امسح مرة أخرى» يعيد فتح الكاميرا ويُرسل مرة واحدة أخرى
    await sheet.getByRole('button', { name: 'امسح مرة أخرى' }).click();
    await expect.poll(() => calls.filter((c) => c.action === 'workshop.checkin').length, { timeout: 15000 }).toBe(2);
  }
});

test('الماسح: إخفاق بعد فتح الكاميرا (تجهيز الفاك) يطفئها ولا تبقى حية خلف الرسالة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeCamera(page, null);
  await participant(page, () => DONE);
  // تجهيز البديل يرسم على لوحة: تُكسر بعد فتح الصفحة فيرمي makeDetector بعد أن فُتحت الكاميرا.
  // (تعذّر تحميل الجزء نفسه يعيد تحميل الصفحة بمعالج vite:preloadError، فيطفئ الكاميرا معه)
  await page.addInitScript(() => {
    const ce = document.createElement.bind(document);
    document.createElement = (t, ...a) => { if (window.__breakCanvas && String(t).toLowerCase() === 'canvas') throw new Error('canvas'); return ce(t, ...a); };
  });
  await page.goto(APP);
  await page.evaluate(() => { window.__breakCanvas = true; });
  await page.locator('.j-session').getByRole('button', { name: 'سجّل حضوري' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('.ck-cam').getByRole('alert')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.__stopped)).toBeGreaterThan(0);
  expect(await sheet.locator('video').evaluate((v) => v.srcObject)).toBeNull();
});

const xpDash = { success: true, features: { hall: false, katon: false, f360: false }, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 5, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] };
const PEOPLE = [
  ...['سارة الأحمد', 'خالد العتيبي', 'نورة القحطاني'].map((n, i) => ({ id: `a${i}`, full_name: n, attendance: { method: i ? 'qr' : 'code' } })),
  { id: 'b1', full_name: 'فهد الشمري', attendance: null }, { id: 'b2', full_name: 'ريم الدوسري', attendance: null },
];
async function expert(page, qr) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'xp.dashboard': xpDash,
      'xp.workshops': { success: true, sessions: [
        { id: SID, title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5), cohort: 'دفعة نوفمبر 2026', open: true },
        { id: 'w4', title: 'اليوم الرابع', location: 'الرياض، قاعة الأثر', starts_at: later(48), ends_at: later(54), cohort: 'دفعة نوفمبر 2026', open: false },
      ] },
      'xp.workshop-qr': qr,
      'xp.workshop-attendance': { success: true, people: PEOPLE },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true, items: [] } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  return calls;
}
const QR = { success: true, url: `https://leaders.sunkvalue.com/?checkin=${TOKEN}`, code: CODE, refresh_in: 20, open: true, attended: 3, session: { id: SID, title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5) } };

test('بوابة الخبير: المكلف يعرض الرمز والأرقام الستة و«X من Y حضروا» على الجوال', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await expert(page, QR);
  await page.goto(`${APP}x`);
  const card = page.getByRole('region', { name: 'رمز الحضور' });
  await expect(card.getByText('اليوم الثالث')).toBeVisible();
  // الزر للجلستين: الجلسة التي لم يُفتح رمزها بعد تُفتح شاشتها الآن وتنتقل إلى الرمز وحدها
  await expect(card.getByRole('button', { name: 'اعرض رمز الحضور' })).toHaveCount(2);
  await expect(card.getByText('يظهر الرمز قبل البدء بساعة، ويمكنك فتح الشاشة الآن')).toBeVisible();
  await card.getByRole('button', { name: 'اعرض رمز الحضور' }).first().click();
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await expect(screen.getByRole('img', { name: 'رمز الحضور' })).toBeVisible();
  const digits = screen.locator('bdi.pq-digits');
  await expect(digits).toHaveText('482 913');
  await expect(digits).toHaveAttribute('dir', 'ltr');
  await expect(screen.getByText('3 من 5 حضروا')).toBeVisible();
  await expect(screen.getByText('فهد الشمري')).toHaveCount(0);
  expect(calls.filter((c) => c.action === 'xp.workshop-qr').map((c) => c.id)).toContain(SID);
  expect(calls.filter((c) => c.action === 'xp.workshop-attendance').map((c) => c.id)).toContain(SID);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w2-expert-qr-390.png` });
  await page.keyboard.press('Escape');
  await expect(screen).toHaveCount(0);
});

test('بوابة الخبير: غير المكلف بدفعة الجلسة يُرد برسالة الخادم ولا رمز', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expert(page, { success: false, code: 'not_assigned', message: 'هذه الجلسة ليست من دفعاتك' });
  await page.goto(`${APP}x`);
  await page.getByRole('region', { name: 'رمز الحضور' }).getByRole('button', { name: 'اعرض رمز الحضور' }).first().click();
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await expect(screen.getByRole('alert')).toHaveText('هذه الجلسة ليست من دفعاتك');
  await expect(screen.getByRole('img', { name: 'رمز الحضور' })).toHaveCount(0);
});

async function adminQr(page) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.activities': { success: true,
        requirements: [{ id: 'r3', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية الأربعة', kind: 'workshop', config: { sessions_required: 4, verify: 'qr' } }],
        workshops: [{ id: SID, requirement_id: 'r3', title_ar: 'اليوم الثالث', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5), active: true, attended: 3, verify: 'qr' }],
        coaching: [] },
      'admin.workshop-qr': QR,
      'admin.workshop-attendance': { success: true, session: {}, requirement: { id: 'r3' }, people: PEOPLE },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
  await page.getByRole('button', { name: 'اعرض رمز الحضور' }).click();
}

test('الإدارة: شاشة الرمز بالأرقام الستة كبيرة تحت الرمز (1440)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminQr(page);
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await expect(screen.locator('bdi.pq-digits')).toHaveText('482 913');
  await expect(screen.getByText('أو اكتب الأرقام في التطبيق')).toBeVisible();
  await expect(screen.getByText('3 من 5 حضروا')).toBeVisible();
  // الأرقام مقروءة من آخر القاعة: خط كبير
  const size = await screen.locator('bdi.pq-digits').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(48);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w2-presenter-code-1440.png` });
});

// شاشة القاعة على جهاز عرض أو حاسوب: العنوان والرمز والأرقام والعدّ داخل الشاشة، ولا يُقص أعلاها إن طال المحتوى
for (const [w, h] of [[1280, 720], [1366, 768], [1024, 600]]) test(`الإدارة: شاشة الرمز لا يُقص عنوانها ويتسع محتواها (${w}x${h})`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: h });
  await adminQr(page);
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await expect(screen.locator('bdi.pq-digits')).toHaveText('482 913');
  await screen.getByRole('img', { name: 'رمز الحضور' }).evaluate((i) => i.decode());
  const box = await screen.evaluate((el) => {
    const r = (s) => el.querySelector(s).getBoundingClientRect();
    return { h2: r('h2').top, count: r('.pq-count').bottom, scroll: el.scrollHeight - el.clientHeight };
  });
  expect(box.h2).toBeGreaterThanOrEqual(0);
  if (SHOTS && w === 1280) await page.screenshot({ path: `${SHOTS}/w2-presenter-code-1280x720.png` });
  if (h >= 720) expect(box.count).toBeLessThanOrEqual(h);
  // وما زاد يُمرَّر إليه: آخر الشاشة (زر من لم يحضر) يُبلغ بالتمرير
  await screen.getByRole('button', { name: /من لم يحضر بعد/ }).scrollIntoViewIfNeeded();
  await expect(screen.getByRole('button', { name: /من لم يحضر بعد/ })).toBeInViewport();
  expect(box.scroll).toBeGreaterThanOrEqual(0);
});
