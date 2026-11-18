// حضور لا يتعثر (W1، تصور الحضور 2026-11-18): مسح رمز الحضور بكاميرا الجوال قبل الدخول يحفظ إيصالًا من الخادم، ثم الدخول
// برمز البريد يسجّل الحضور به في الرحلة نفسها بلا مسح ثانٍ. والرفض لحظة المسح (رمز منتهٍ أو نافذة مغلقة) أو بعد الدخول
// (جلسة دفعة أخرى أو إيصال منتهٍ) يُعرض بسببه. وفي الإدارة: المتوقع وأسماء من لم يحضر على شاشة الرمز. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR;
// اللقطات بدقة مضاعفة لحدود الشاشة وحدها
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const later = (h) => new Date(Date.now() + h * 36e5).toISOString();
const RECEIPT = `r1.0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.1b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.${Math.floor(Date.now() / 1000) + 900}.${'a'.repeat(32)}`;

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', items: [], done: 0, total: 1 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

async function signedOut(page, replies) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'auth.start') return route.fulfill({ json: { success: true, sent: true } });
    if (b.action === 'auth.verify') return route.fulfill({ json: { token: 'tok-receipt-00000000000000000000', ...me } });
    const r = replies[b.action];
    return route.fulfill({ json: typeof r === 'function' ? r(b) : r ?? me });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  return calls;
}
async function signIn(page) {
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('رمز التحقق').fill('246810');
}

for (const width of [390, 1440]) {
  test(`مسح قبل الدخول ثم دخول: يُسجَّل الحضور بالإيصال بلا مسح ثانٍ (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const calls = await signedOut(page, {
      'workshop.scan': { success: true, receipt: RECEIPT, expires_at: later(0.25), session: { title: 'اليوم الثالث' } },
      'workshop.checkin': { success: true, already: false, session: { title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر' }, at: new Date().toISOString() },
    });
    await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab`);
    await expect(page.getByText('حفظنا مسحك لـ«اليوم الثالث»', { exact: false })).toBeVisible();
    await expect(page.getByText('دون مسح الرمز مرة أخرى', { exact: false })).toBeVisible();
    // الرمز لا يبقى في الرابط، والإيصال وحده في الجهاز
    expect(new URL(page.url()).search).toBe('');
    expect(calls.filter((c) => c.action === 'workshop.scan').map((c) => [c.t, c.token ?? null])).toEqual([['0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab', null]]);
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem('mi_checkin')));
    expect([kept.r, kept.t]).toEqual([RECEIPT, undefined]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-scan-signin-${width}.png` });
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'سُجل حضورك' })).toBeVisible();
    expect(calls.filter((c) => c.action === 'workshop.checkin').map((c) => [c.r, c.t])).toEqual([[RECEIPT, undefined]]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-checkin-done-${width}.png` });
    await page.getByRole('button', { name: '→ رحلتي' }).click();
    await expect(page.getByText('مراحل الرحلة')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('mi_checkin'))).toBeNull();
  });
}

test('رفض لحظة المسح: الرمز المنتهي يُقال سببه في شاشة الدخول ولا يُحفظ شيء', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signedOut(page, { 'workshop.scan': { success: false, code: 'qr_expired', message: 'انتهت صلاحية الرمز، امسح الرمز المعروض الآن' } });
  await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.1.abcdefabcdefabcdefab`);
  await expect(page.getByText('انتهت صلاحية الرمز، امسح الرمز المعروض الآن ادخل لمتابعة رحلتك', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mi_checkin'))).toBeNull();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-scan-expired-390.png` });
});

test('رفض لحظة المسح: نافذة الحضور مغلقة، فلا شاشة حضور بعد الدخول', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await signedOut(page, { 'workshop.scan': { success: false, code: 'closed', message: 'تسجيل الحضور لهذه الجلسة غير متاح الآن' } });
  await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.1.abcdefabcdefabcdefab`);
  await expect(page.getByText('تسجيل الحضور لهذه الجلسة غير متاح الآن', { exact: false })).toBeVisible();
  await signIn(page);
  await expect(page.getByText('مراحل الرحلة')).toBeVisible();
  expect(calls.some((c) => c.action === 'workshop.checkin')).toBe(false);
});

test('بعد الدخول: إيصال لجلسة دفعة أخرى أو منتهٍ يُرد بسببه، ويُزال من الجهاز', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let n = 0;
  await signedOut(page, {
    'workshop.scan': { success: true, receipt: RECEIPT, expires_at: later(0.25), session: { title: 'اليوم الثالث' } },
    'workshop.checkin': () => (n++ === 0
      ? { success: false, code: 'cohort', message: 'هذه الجلسة لدفعة أخرى' }
      : { success: false, code: 'receipt_expired', message: 'مضت أكثر من ربع ساعة على المسح، امسح الرمز المعروض الآن' }),
  });
  await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab`);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'لم يُسجل الحضور' })).toBeVisible();
  await expect(page.getByText('هذه الجلسة لدفعة أخرى', { exact: false })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-checkin-other-cohort-390.png` });
  await page.getByRole('button', { name: '→ رحلتي' }).click();
  await expect(page.getByText('مراحل الرحلة')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mi_checkin'))).toBeNull();
  // إيصال منتهٍ محفوظ من تبويب سابق ما زال صالحًا في الجهاز ورده الخادم منتهيًا
  await page.evaluate((r) => localStorage.setItem('mi_checkin', JSON.stringify({ r, exp: new Date(Date.now() + 6e4).toISOString(), title: 'اليوم الثالث', at: Date.now() })), RECEIPT);
  await page.reload();
  await expect(page.getByText('مضت أكثر من ربع ساعة على المسح', { exact: false })).toBeVisible();
});

test('المسح وهو داخل يسجّل بالرمز نفسه، ولا يطلب إيصالًا', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await signedOut(page, { 'workshop.checkin': { success: true, already: false, session: { title: 'اليوم الثالث' }, at: new Date().toISOString() } });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'));
  await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab`);
  await expect(page.getByRole('heading', { name: 'سُجل حضورك' })).toBeVisible();
  expect(calls.some((c) => c.action === 'workshop.scan')).toBe(false);
  expect(calls.find((c) => c.action === 'workshop.checkin').t).toBe('0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab');
});

test('تجديد الموافقة لا يسبق الحضور: يُسجَّل الحضور أولًا ثم يظهر التجديد', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const renew = { ...me, participant: { ...me.participant, consent: { needed: 'renew', notice: false, version: '2026-11-07', changes: [] } } };
  await page.route(/functions\/v1\/leaders-api/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'workshop.checkin') return route.fulfill({ json: { success: true, already: false, session: { title: 'اليوم الثالث' }, at: new Date().toISOString() } });
    return route.fulfill({ json: renew });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(`${APP}?checkin=0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f.123.abcdefabcdefabcdefab`);
  await expect(page.getByRole('heading', { name: 'سُجل حضورك' })).toBeVisible();
  await page.getByRole('button', { name: '→ رحلتي' }).click();
  await expect(page.getByText('حدّثنا سياسة الخصوصية والشروط', { exact: false })).toBeVisible();
});

for (const width of [390, 1440]) test(`الرحلة: «سجّل حضوري» لجلسة حضورية جارية تُوثَّق بالرمز، بخطوات واضحة (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  const items = [{ id: 'r3', code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', required: true, status: 'pending',
    activity: { type: 'workshop', done: false, count: 2, total: 4, verify: 'qr', sessions: [
      { id: 'w3', title: 'اليوم الثالث', mode: 'in_person', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5), attended: false, open: true },
    ] } }];
  const live = { ...me, journey: me.journey.map((s) => (s.key === 'training' ? { ...s, items } : s)) };
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: live }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  const card = page.locator('.j-session');
  await expect(card.getByText('جلستك الآن')).toBeVisible();
  await card.getByRole('button', { name: 'سجّل حضوري' }).click();
  await expect(card.getByText('افتح كاميرا جوالك ووجّهها إلى الرمز على شاشة القاعة.')).toBeVisible();
  await expect(card.getByText('ادخل خلال ربع ساعة', { exact: false })).toBeVisible();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBe(0);
  await card.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-journey-cta-${width}.png` });
});

test('الإدارة: زر الرمز بطريقة الجلسة الفعلية، وشاشة الرمز تعرض المتوقع ومن لم يحضر مطويًا', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.activities': { success: true,
        requirements: [{ id: 'r3', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية الأربعة', kind: 'workshop', config: { sessions_required: 4, verify: 'qr' } }],
        workshops: [
          { id: '0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f', requirement_id: 'r3', title_ar: 'اليوم الثالث', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: later(0), ends_at: later(6), active: true, attended: 3, verify: 'qr' },
          { id: '1b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f', requirement_id: 'r3', title_ar: 'اليوم الثالث لدفعة جدة', mode: 'in_person', location_ar: 'جدة', starts_at: later(0), ends_at: later(6), active: true, attended: 0, verify: 'manual' },
        ],
        coaching: [] },
      'admin.workshop-qr': { success: true, url: 'https://leaders.sunkvalue.com/?checkin=x', refresh_in: 20, open: true, attended: 3, session: { title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: later(0), ends_at: later(6) } },
      'admin.workshop-attendance': { success: true, session: {}, requirement: { id: 'r3' }, people: [
        ...['سارة الأحمد', 'خالد العتيبي', 'نورة القحطاني'].map((n, i) => ({ id: `a${i}`, full_name: n, attendance: { method: 'qr' } })),
        { id: 'b1', full_name: 'فهد الشمري', attendance: null }, { id: 'b2', full_name: 'ريم الدوسري', attendance: null },
      ] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
  // جلسة دفعة جدة تُوثَّق يدويًا بتخصيص دفعتها: لا زر رمز لها، ووسم يقول ذلك
  await expect(page.getByRole('button', { name: 'اعرض رمز الحضور' })).toHaveCount(1);
  await expect(page.getByText('التوثيق يدويًا لهذه الدفعة')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-admin-workshops-1440.png` });
  await page.getByRole('button', { name: 'اعرض رمز الحضور' }).click();
  await expect(page.getByText('3 من 5 حضروا')).toBeVisible();
  await expect(page.getByText('فهد الشمري')).toHaveCount(0);
  await page.getByRole('button', { name: 'من لم يحضر بعد (2)' }).click();
  await expect(page.getByText('فهد الشمري')).toBeVisible();
  await expect(page.getByText('ريم الدوسري')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/w1-admin-qr-1440.png` });
});
