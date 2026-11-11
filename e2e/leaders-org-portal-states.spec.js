// بوابة منسق الجهة: تعطل الخادم عند الفتح (org-3)، ورابط البريد المستعمل مع جلسة نافذة (org-4)، وقرار المقيّم
// دون إعادة اللوحة (org-5)، و«يحتاج تدخلك» بنقرة (org-7)، والمبادرات بطاقات على الجوال (org-8)، وخطوة الرمز (org-10).
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const SESSION = 'mi_leaders_coord_session';
const ME = { success: true, consent_needed: false, coordinator: { full_name: 'منسقة' }, org: { name: 'وزارة التجربة' } };
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const raters = [
  { id: 'r1', participant_id: 'p1', participant: 'سارة الأحمد', email: 'boss@gmail.com', full_name: 'خالد', relation_ar: 'المدير المباشر', phase: 'pre', flags_ar: ['بريد عام'] },
  { id: 'r2', participant_id: 'p2', participant: 'عمر الزهراني', email: 'peer@gmail.com', full_name: 'منى', relation_ar: 'زميل', phase: 'pre', flags_ar: ['بريد عام'] },
];
const dashboard = (pending = raters) => ({
  success: true, org: { name: 'وزارة التجربة', seats: null }, permissions: { list: true, scores: false, contact: false, export: false, activity: true },
  kpis: { total: 4, joined_week: 0, active_week: 1, approved: 2, completed: 0, avg_progress: 20 }, funnel: { registered: 4, approved: 2 }, by_track: {}, by_via: {},
  participants: [
    { id: 'p1', full_name: 'سارة الأحمد', status: 'enrolled', stage: 'التدريب', progress: 40, last_login_at: day(1) },
    { id: 'p2', full_name: 'عمر الزهراني', status: 'enrolled', stage: 'التأهيل', progress: 30, last_login_at: day(20) },
    { id: 'p3', full_name: 'ليلى القحطاني', status: 'registered', stage: 'التأهيل', progress: 5, last_login_at: day(2) },
    { id: 'p4', full_name: 'فهد العتيبي', status: 'profiled', stage: 'الملف الشخصي', progress: 10, last_login_at: day(3) },
  ],
  impact: null, outcomes: null, raters_pending: pending,
  initiatives: [{ participant_id: 'p1', full_name: 'سارة الأحمد', initiative: 'رقمنة خدمة إصدار التصاريح في الجهة', objective: 'تقليل زمن الإصدار', scope: 'project', status: 'approved', status_title: 'معتمدة', cost: 250000,
    tracking: { health: 'green', health_title: 'في المسار', benefits: { realization: 40 } } }],
});

function mock(page, handlers) {
  const sent = [];
  return page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    const h = handlers[b.action];
    const r = typeof h === 'function' ? h(b, sent) : h;
    if (r?.status) return route.fulfill({ status: r.status, json: r.json });
    return route.fulfill({ json: r ?? { success: true } });
  }).then(() => sent);
}

test('org-3: تعطل الخادم عند الفتح يعرض الخطأ بمرجعه وإعادة المحاولة، لا شاشة الدخول', async ({ page }) => {
  let down = true;
  const sent = await mock(page, {
    'coord.me': () => (down ? { status: 500, json: { success: false, message: 'خطأ داخلي في الخادم (المرجع ab12cd34)', code: 'internal' } } : ME),
    'coord.dashboard': dashboard([]),
  });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org');
  await expect(page.getByRole('alert')).toContainText('ab12cd34');
  await expect(page.getByRole('heading', { name: 'دخول منسق الجهة' })).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SESSION)).toBeTruthy();
  down = false;
  await page.getByRole('button', { name: 'حاول مرة أخرى' }).click();
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  expect(sent.filter((x) => x.action === 'coord.me').length).toBeGreaterThanOrEqual(2);
});

test('org-4: رابط بريد مستعمل وفي المتصفح جلسة نافذة: تُفتح اللوحة', async ({ page }) => {
  await mock(page, {
    'coord.auth-verify': { success: false, message: 'الرابط أو الرمز مستخدم من قبل', code: 'invalid' },
    'coord.me': ME, 'coord.dashboard': dashboard([]),
  });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org/verify?e=coord%40org.sa&t=used');
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'دخول منسق الجهة' })).toHaveCount(0);
});

test('org-4: رابط بريد مستعمل بلا جلسة: الخطأ وبريد الرابط معبأ لطلب رمز جديد', async ({ page }) => {
  await mock(page, { 'coord.auth-verify': { success: false, message: 'الرابط أو الرمز مستخدم من قبل', code: 'invalid' } });
  await page.goto(APP + 'org/verify?e=coord%40org.sa&t=used');
  await expect(page.getByRole('heading', { name: 'دخول منسق الجهة' })).toBeVisible();
  await expect(page.getByText('الرابط أو الرمز مستخدم من قبل')).toBeVisible();
  await expect(page.getByLabel('البريد الإلكتروني')).toHaveValue('coord@org.sa');
});

test('org-5: قرار المقيّم لا يعيد اللوحة، ورسالة نتيجته تبقى ظاهرة', async ({ page }) => {
  const sent = await mock(page, { 'coord.me': ME, 'coord.dashboard': dashboard(), 'coord.rater-confirm': (b) => ({ success: true, decision: b.decision }) });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org');
  const box = page.getByRole('region', { name: /مقيّمون بانتظار تأكيدك/ });
  await expect(box).toContainText('boss@gmail.com');
  await box.getByRole('button', { name: 'أكّد وأرسل الدعوة' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'أُرسلت الدعوة إلى خالد.' })).toBeVisible();
  await expect(box).not.toContainText('boss@gmail.com');
  await expect(box).toContainText('peer@gmail.com');
  // المقيّم الأخير: تبقى الرسالة بعد أن تفرغ القائمة
  await box.getByRole('button', { name: 'أكّد وأرسل الدعوة' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'أُرسلت الدعوة إلى منى.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  expect(sent.filter((x) => x.action === 'coord.dashboard')).toHaveLength(1);
});

test('org-2 وorg-7: «يحتاج تدخلك» يعرضهم بنقرة في القائمة، والمرشّح يطابق عمود المرحلة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { 'coord.me': ME, 'coord.dashboard': dashboard([]) });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org');
  const todo = page.getByRole('region', { name: 'يحتاج تدخلك' });
  await todo.getByRole('listitem').filter({ hasText: 'لم يكملوا القياس المبدئي' }).getByRole('button', { name: 'اعرضهم في القائمة' }).click();
  await expect(page.getByLabel('المرحلة')).toHaveValue('@pre');
  const people = page.locator('table.op-people').last();
  await expect(people.locator('tbody tr')).toHaveCount(2);
  await expect(people).toContainText('ليلى القحطاني');
  await expect(people).toContainText('فهد العتيبي');
  await expect(page.getByRole('heading', { name: 'المشاركون' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'المشاركون' })).toBeInViewport();
  await todo.getByRole('listitem').filter({ hasText: 'لم يدخلوا منذ' }).getByRole('button').click();
  await expect(people.locator('tbody tr')).toHaveCount(1);
  await expect(people).toContainText('عمر الزهراني');
  // كل خيار مرحلة يعرض صفوفًا بعنوانه وحده
  await page.getByLabel('المرحلة').selectOption('التأهيل');
  await expect(people.locator('tbody tr')).toHaveCount(2);
  for (const t of await people.locator('tbody .chip').allTextContents()) expect(t).toBe('التأهيل');
});

test('org-8: جدول المبادرات بطاقات على الجوال، بلا تمرير أفقي وزر الوثيقة ظاهر', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { 'coord.me': ME, 'coord.dashboard': dashboard([]) });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org');
  const sec = page.locator('section', { has: page.getByRole('heading', { name: 'محفظة مبادرات الجهة' }) });
  const scroll = sec.locator('.op-scroll');
  await scroll.scrollIntoViewIfNeeded();
  const { sw, cw } = await scroll.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  const btn = sec.getByRole('button', { name: 'الوثيقة' });
  const box = await btn.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(sec.getByText('تحقق المنافع')).toBeVisible();
});

test('org-6: رابط تسجيل الموظفين من رسالة الدعوة ظاهر في اللوحة، وطلب المقاعد يدل على بريد التواصل', async ({ page }) => {
  const d = dashboard([]);
  d.org.join_url = 'https://leaders.example/j/tajriba';
  d.kpis.seats_waiting = 2;
  d.participants = []; d.kpis.total = 0;
  await mock(page, { 'coord.me': ME, 'coord.dashboard': d });
  await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
  await page.goto(APP + 'org');
  await expect(page.getByRole('link', { name: 'https://leaders.example/j/tajriba' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'انسخ الرابط' })).toBeVisible();
  await expect(page.getByText('شارك رابط تسجيل موظفيكم المعروض أعلى اللوحة')).toBeVisible();
  const mail = page.getByRole('link', { name: 'راسل إدارة البرنامج' });
  await expect(mail).toHaveAttribute('href', /^mailto:\S+@\S+$/);
});

test('org-10:الرمز بالأرقام العربية يُقبل، والتركيز يعود إلى الحقل بعد رمز خاطئ، وإعادة الإرسال ظاهرة', async ({ page }) => {
  const sent = await mock(page, {
    'coord.auth-start': { success: true },
    'coord.auth-verify': { success: false, message: 'الرمز غير صحيح', code: 'invalid' },
  });
  await page.goto(APP + 'org');
  await page.getByLabel('البريد الإلكتروني').fill('coord@org.sa');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  const code = page.getByLabel('رمز التحقق');
  await code.fill('١٢٣');
  await expect(code).toHaveValue('123');
  await code.fill('١٢٣٤٥٦');
  await expect(page.getByText('الرمز غير صحيح')).toBeVisible();
  expect(sent.find((x) => x.action === 'coord.auth-verify')).toMatchObject({ code: '123456' });
  await expect(code).toBeFocused();
  await expect(page.getByText(/إعادة الإرسال بعد \d+ ثانية/)).toBeVisible();
  await expect(page.getByText('لم يصل؟ تفقّد مجلد الرسائل غير المرغوبة.')).toBeVisible();
});
