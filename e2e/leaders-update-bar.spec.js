// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 5: تحديث بالدعوة لا بالكسر.
// يُحاكى النشر برد /version.json ببصمة أخرى. المطلوب: شريط سطر واحد «تحديث جديد متاح» وزر «حدّث» بلا رقم نسخة، ثم إعادة
// تحميل واحدة عند أول تنقل داخلي إلى القسم المطلوب نفسه، ورد الخادم update_required يُظهر الشريط نفسه. وفي اللوحة كذلك.
// الخلفية مُحاكاة. REL5_SHOTS: مجلد لقطات المراجعة (390 و1440 بدقة مضاعفة)، لا في CI.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
// عامل الخدمة يجلب الملفات بنفسه فلا يراها page.route، وقراراته في update-safety.test.js وapp-update.test.jsx
test.use({ serviceWorkers: 'block' });
const SHOTS = process.env.REL5_SHOTS || '';

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })),
  progress: 80, passkeys: 1, prompt_passkey: false,
};
const capstone = {
  success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate',
  track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' },
  capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
  sections: [{ id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' }],
  checks: [], readiness: 58, ready_min: 80, card: { state: 'waiting', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [],
};

async function shot(page, name, width, height) {
  if (!SHOTS) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
  await page.waitForTimeout(400);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}-${width}.png`, Buffer.from(data, 'base64'));
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function participant(page, { replies = {} } = {}) {
  const state = { docs: 0, version: 'same', versionHits: 0 };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    const reply = { me, 'capstone.get': capstone, certificate: { success: true, certificate: null }, ...replies }[b.action] || { success: true };
    return r.fulfill({ status: reply.code === 'update_required' ? 426 : 200, json: reply });
  });
  // النشر: بعد أن يُفتح التبويب يصير version.json ببصمة أخرى
  await page.route(/\/version\.json(?:\?|$)/, async (r) => {
    state.versionHits += 1;
    if (state.version === 'same') return r.continue();
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: '{"build":"NEWbuild1"}' });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-update-bar-000000000000'); });
  return state;
}

test('القادة: تحديث منشور يُظهر الشريط عند التنقل، ثم أول تنقل بعده يعيد التحميل مرة إلى القسم المطلوب', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = await participant(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await expect(nav.getByRole('button', { name: 'رحلتي' })).toHaveAttribute('aria-current', 'page');
  const bar = page.getByTestId('update-bar');
  // قبل النشر: لا شريط
  await expect(bar).toHaveCount(0);
  // النشر، ثم الرجوع إلى التبويب (أول فحص في الصفحة، والفحوص المتقاربة بفاصل دقيقة): الشريط بسطره وزره وحدهما
  state.version = 'new';
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(bar).toBeVisible();
  expect(state.versionHits).toBe(1);
  await expect(bar).toHaveText('تحديث جديد متاححدّث');
  await expect(bar.getByRole('button', { name: 'حدّث' })).toBeVisible();
  expect(await bar.textContent()).not.toMatch(/\d|NEWbuild/);
  expect(state.docs).toBe(1);
  await shot(page, 'update-bar-leaders', 1440, 900);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'update-bar-leaders', 390, 844);
  await page.setViewportSize({ width: 1440, height: 900 });
  // أول تنقل داخلي: إعادة تحميل واحدة إلى «ملفي» نفسها، لا «رحلتي»
  await nav.getByRole('button', { name: 'ملفي' }).click();
  await expect.poll(() => state.docs).toBe(2);
  await expect(page.locator('nav.nav-tabs').getByRole('button', { name: 'ملفي' })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).searchParams.has('tab')).toBe(false);
  await expect(page.getByRole('heading', { name: 'تعذّر عرض الصفحة' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('القادة: «حدّث» يعيد التحميل إلى القسم المفتوح نفسه', async ({ page }) => {
  const state = await participant(page);
  await page.goto(`${APP}?tab=capstone`);
  await expect(page.getByText('رقمنة خدمات المستفيدين').first()).toBeVisible();
  state.version = 'new';
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const bar = page.getByTestId('update-bar');
  await bar.getByRole('button', { name: 'حدّث' }).click();
  await expect.poll(() => state.docs).toBe(2);
  await expect(page.locator('nav.nav-tabs').getByRole('button', { name: 'مبادرتي' })).toHaveAttribute('aria-current', 'page');
});

test('القادة: رد الخادم update_required يُظهر الشريط نفسه برسالة التحديث', async ({ page }) => {
  const state = await participant(page, { replies: { 'capstone.get': { success: false, code: 'update_required', message: 'صدر تحديث للمنصة، فحدّث الصفحة.' } } });
  await page.goto(APP);
  await page.locator('nav.nav-tabs').getByRole('button', { name: 'مبادرتي' }).click();
  await expect(page.getByTestId('update-bar')).toBeVisible();
  await expect(page.getByTestId('update-bar')).toHaveText('تحديث جديد متاححدّث');
  expect(state.docs).toBe(1);
});

test('اللوحة: الشريط بعد النشر، وأول تنقل بين الشاشات يعيد التحميل إلى الشاشة نفسها', async ({ page }) => {
  const state = { docs: 0, version: 'same' };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, by_tab: {}, items: [] },
      'admin.programs': { success: true, programs: [], cohorts: [] },
    };
    return r.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.route(/\/version\.json(?:\?|$)/, (r) => (state.version === 'same' ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/json', body: '{"build":"NEWadmin1"}' })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ADMIN);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(`${ADMIN}#/leaders/participants`);
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  await expect(nav.getByRole('button', { name: /المشاركون/ })).toHaveAttribute('aria-current', 'page');
  const opened = state.docs;
  state.version = 'new';
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const bar = page.getByTestId('update-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveText('تحديث جديد متاححدّث');
  await shot(page, 'update-bar-admin', 1440, 900);
  await nav.getByRole('button', { name: /الجهات/ }).click();
  await expect.poll(() => state.docs).toBe(opened + 1);
  expect(new URL(page.url()).hash).toBe('#/leaders/orgs');
  await expect(page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: /الجهات/ })).toHaveAttribute('aria-current', 'page');
});
