// الأنشطة الموثقة: القراءة والفيديو والورشة والتوجيه في رحلة المشارك، وتسجيل
// الحضور برمز QR، وشاشة الحضور والتوجيه في لوحة الإدارة. الخلفية مُحاكاة.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR;
const later = (h) => new Date(Date.now() + h * 36e5).toISOString();

const items = [
  { id: 'r1', code: 'T-HB', kind: 'reading', title_ar: 'قراءة كتيبك الشخصي', required: true, status: 'pending',
    activity: { type: 'reading', done: false, count: 1, total: 3, quiz: true, chapters: [
      { id: 'c1', title: 'المعالم نقاط قرار', state: 'read', pct: 100, quiz: true },
      { id: 'c2', title: 'سلسلة القيمة', state: 'skimmed', pct: 40, quiz: false },
      { id: 'c3', title: 'قيادة التنفيذ', state: 'unread', pct: 0, quiz: false },
    ] } },
  { id: 'r2', code: 'T-VID', kind: 'video', title_ar: 'فيديو: لماذا تفشل المشاريع', required: true, status: 'pending',
    activity: { type: 'video', done: false, pct: 35, min_pct: 90, watched: 210, duration: 600, source: { type: 'file', url: 'https://example.com/v.mp4' }, title: 'لماذا تفشل المشاريع' } },
  { id: 'r3', code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية الأربعة', required: true, status: 'pending',
    activity: { type: 'workshop', done: false, count: 1, total: 4, verify: 'qr', sessions: [
      { id: 'w1', title: 'اليوم الأول: Milestone', mode: 'in_person', location: 'الرياض، قاعة الأثر', starts_at: later(-30), ends_at: later(-24), attended: true },
      { id: 'w2', title: 'اليوم الثاني: Impact', mode: 'online', starts_at: later(0), ends_at: later(5), attended: false, can_join: true },
    ] } },
  { id: 'r4', code: 'O-SESS', kind: 'coaching', title_ar: 'حضور أربع جلسات توجيه أسبوعية', required: true, status: 'pending',
    activity: { type: 'coaching', done: false, count: 1, total: 4, can_book: true, book_url: 'about:blank', provider: 'calcom', instant: true, sessions: [
      { id: 's1', kind: 'booked', status: 'attended', starts_at: later(-100), ends_at: later(-99) },
      { id: 's2', kind: 'booked', status: 'booked', starts_at: later(48), ends_at: later(49), join_url: 'https://meet.google.com/x' },
    ] } },
];
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', mode: 'hybrid', duration_label: '4 أيام تدريبية', items, done: 0, total: 4 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

async function participant(page, replies = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = { me, 'certificate': { success: true, certificate: null }, ...replies };
    await route.fulfill({ json: r[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  return calls;
}

test('الرحلة: الأنشطة الموثقة بلا زر «أنجزته»', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1500 });
  const calls = await participant(page, { 'coaching.instant': { success: false, message: 'الموجّه غير متاح الآن' } });
  await page.goto(APP);
  await expect(page.getByText('قرأت 1 من 3 أبواب')).toBeVisible();
  await expect(page.getByText('تصفّح سريع')).toBeVisible();
  await expect(page.getByText('بقي الاختبار')).toHaveCount(0);
  await expect(page.getByText('شاهدت 35%', { exact: false })).toBeVisible();
  await expect(page.getByText('حضرت 1 من 4', { exact: true })).toBeVisible();
  await expect(page.getByText('حضرت ✓').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'انضم الآن' })).toBeVisible();
  await expect(page.getByText('عن بعد', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'أنجزته' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'احجز موعدًا' })).toBeVisible();
  await expect(page.getByRole('button', { name: /اتصل فورًا/ })).toBeVisible();
  // جلسة التوجيه المحجوزة تُضاف إلى التقويم بملف ics فيه موعدها ورابطها
  const [ics] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'أضف إلى تقويمي' }).click()]);
  const body = readFileSync(await ics.path(), 'utf8');
  expect(body).toContain('BEGIN:VEVENT');
  expect(body).toContain('URL:https://meet.google.com/x');
  expect(body).toContain('TRIGGER:-PT1H');
  if (SHOTS) await page.locator('.stage.active').screenshot({ path: `${SHOTS}/journey-activities.png` });
  await page.getByRole('button', { name: 'احجز موعدًا' }).click();
  await expect(page.locator('.act-book iframe')).toBeVisible();
  expect(calls.some((c) => c.action === 'requirement.update')).toBe(false);
});

test('مسح رمز الحضور يسجل الحضور', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const calls = await participant(page, { 'workshop.checkin': { success: true, already: false, session: { title: 'اليوم الثاني: Impact', location: 'الرياض، قاعة الأثر' }, at: new Date().toISOString() } });
  await page.goto(`${APP}?checkin=abc.123.def`);
  await expect(page.getByRole('heading', { name: 'سُجل حضورك' })).toBeVisible();
  await expect(page.getByText('اليوم الثاني: Impact', { exact: false })).toBeVisible();
  expect(calls.find((c) => c.action === 'workshop.checkin').t).toBe('abc.123.def');
  expect(new URL(page.url()).search).toBe('');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/checkin-mobile.png` });
  await page.getByRole('button', { name: 'إلى رحلتي' }).click();
  await expect(page.getByText('مراحل الرحلة')).toBeVisible();
});

test('الإدارة: جلسات الورشة ورمز الحضور وتأكيد جلسات التوجيه', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.activities': { success: true,
        requirements: [
          { id: 'r3', code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية الأربعة', kind: 'workshop', config: { sessions_required: 4 } },
          { id: 'r4', code: 'O-SESS', title_ar: 'حضور أربع جلسات توجيه أسبوعية', kind: 'coaching', config: { sessions_required: 4, minutes: 60, booking_url: 'https://cal.com/mi/coaching', provider: 'calcom', instant_url: 'https://meet.google.com/abc' }, instant_open: false },
        ],
        workshops: [
          { id: '0b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f', requirement_id: 'r3', title_ar: 'اليوم الأول: Milestone', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: later(0), ends_at: later(6), active: true, attended: 12 },
          { id: '1b7b6c9e-2f3a-4d0e-9a51-1d2b3c4d5e6f', requirement_id: 'r3', title_ar: 'اليوم الثاني: Impact', mode: 'online', join_url: 'https://zoom.us/j/1', starts_at: later(24), ends_at: later(30), active: true, attended: 0 },
        ],
        coaching: [
          { id: 'c1', requirement_id: 'r4', status: 'booked', kind: 'booked', starts_at: later(-3), ends_at: later(-2), participants: { full_name: 'سارة الأحمد' } },
          { id: 'c2', requirement_id: 'r4', status: 'booked', kind: 'booked', starts_at: later(30), ends_at: later(31), join_url: 'https://meet.google.com/x', participants: { full_name: 'خالد العتيبي' } },
        ] },
      'admin.workshop-qr': { success: true, url: 'https://leaders.sunkvalue.com/?checkin=x', refresh_in: 20, open: true, attended: 12, session: { title: 'اليوم الأول: Milestone', location: 'الرياض، قاعة الأثر', starts_at: later(0) } },
      'admin.coaching-mark': { success: true },
      'admin.coach-available': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
  await expect(page.getByText('12 حاضر')).toBeVisible();
  if (SHOTS) await page.locator('.la-body').screenshot({ path: `${SHOTS}/admin-workshops.png` });
  await expect(page.getByText('عن بعد', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'اعرض رمز الحضور' }).first().click();
  await expect(page.getByRole('img', { name: 'رمز الحضور' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-qr.png` });
  await page.getByRole('button', { name: 'إغلاق' }).click();

  await page.getByRole('button', { name: /الجلسات الفردية/ }).click();
  await expect(page.getByText('بانتظار تأكيدك (1)')).toBeVisible();
  if (SHOTS) await page.locator('.la-body').screenshot({ path: `${SHOTS}/admin-coaching.png` });
  await page.getByRole('button', { name: 'حضر', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.coaching-mark')).toMatchObject({ id: 'c1', status: 'attended' });
  await page.getByRole('button', { name: /أنا متاح لاتصال فوري/ }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.coach-available')).toMatchObject({ requirement_id: 'r4', minutes: 60 });
});
