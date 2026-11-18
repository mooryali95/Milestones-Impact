// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 5: تحديث بالدعوة لا بالكسر.
// يُحاكى النشر برد /version.json ببصمة أخرى. المطلوب: شريط سطر واحد «تحديث جديد متاح» وزر «حدّث» بلا رقم نسخة، ثم إعادة
// تحميل واحدة عند أول تنقل داخلي إلى القسم المطلوب نفسه، ورد الخادم update_required يُظهر الشريط نفسه. وفي اللوحة كذلك.
// الخلفية مُحاكاة. REL5_SHOTS: مجلد لقطات المراجعة (390 و1440 بدقة مضاعفة)، لا في CI.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { publicSpec, validateLab } from '../supabase/functions/leaders-api/lab.js';
import { ITEMS } from '../scripts/lab/pm-map.mjs';

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

async function participant(page, { replies = {}, publishOn = null } = {}) {
  const state = { docs: 0, version: 'same', versionHits: 0 };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    // publishOn: النشر يقع لحظة هذا الطلب، فلا يراه فحص التنقل الذي سبقه (فاصل الدقيقة يمنع فحصًا ثانيًا)
    if (publishOn && b.action === publishOn) state.version = 'new';
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

const tooOld = { 'capstone.get': { success: false, code: 'update_required', message: 'صدر تحديث للمنصة، فحدّث الصفحة.' } };

test('القادة: رد الخادم update_required يُظهر الشريط نفسه إن كان على الموقع إصدار أحدث', async ({ page }) => {
  const state = await participant(page, { replies: tooOld, publishOn: 'capstone.get' });
  await page.goto(APP);
  await page.locator('nav.nav-tabs').getByRole('button', { name: 'مبادرتي' }).click();
  await expect(page.getByTestId('update-bar')).toBeVisible();
  await expect(page.getByTestId('update-bar')).toHaveText('تحديث جديد متاححدّث');
  expect(state.docs).toBe(1);
});

test('القادة: update_required والموقع ما زال يقدّم البناء نفسه (الدوال سبقت Pages): لا شريط ولا إعادة تحميل عند التنقل', async ({ page }) => {
  const state = await participant(page, { replies: tooOld });
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await nav.getByRole('button', { name: 'مبادرتي' }).click();
  await expect.poll(() => state.versionHits).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('update-bar')).toHaveCount(0);
  await nav.getByRole('button', { name: 'رحلتي' }).click();
  await expect(nav.getByRole('button', { name: 'رحلتي' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'مبادرتي' }).click();
  await expect(nav.getByRole('button', { name: 'مبادرتي' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('update-bar')).toHaveCount(0);
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

test('القادة: «افتح في المختبر» من متطلب في الرحلة والتحديث متاح يفتح الأداة نفسها بلا إعادة تحميل', async ({ page }) => {
  const spec = validateLab(ITEMS[0].spec);
  const item = { id: 'L-pm', kind: 'tool', dimension: 'milestone', title: ITEMS[0].title_ar, summary: ITEMS[0].summary_ar, minutes: 25, points: 60, min_level: 'beginner', chapter_key: 'ch1', progress: { best: 62, open: null, attempts: 1, first: 62, last_at: null } };
  const req = { id: 'r9', code: 'T-PMMAP', kind: 'lab', title_ar: 'خريطة عمليات إدارة المشاريع في المختبر', required: true, status: 'pending',
    activity: { type: 'lab', done: false, lab_key: 'pm-process-map', item_id: 'L-pm', title: item.title, attempts: 1, best: 62, accept: 'mastery', mastery: 70 } };
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const state = { docs: 0, started: null };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'lab.list') return route.fulfill({ json: { success: true, items: [item], points: { total: 0, rank: { title: 'مستكشف', next: null } } } });
    if (b.action === 'lab.start') {
      state.started = b.id;
      return route.fulfill({ json: { success: true, item: { ...item, level: 'beginner' }, spec: publicSpec(spec, (x) => x, 'beginner'), attempt: { id: 'a1', meters: {}, path: [], results: {}, answers: {}, current: 0, done: false, draft: null, hints: {}, checks_used: 0 } } });
    }
    const r = srv.reply(b);
    if (b.action === 'me' && r?.journey) { const t = r.journey.find((s) => s.key === 'training'); t.items = [...t.items, req]; t.total += 1; }
    return route.fulfill({ json: r });
  });
  await page.route(/\/version\.json(?:\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"build":"NEWbuild1"}' }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  // التحديث معروف قبل النقر: الرجوع إلى التبويب يفحص version.json
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('update-bar')).toBeVisible();
  const li = page.locator('li.item', { hasText: 'خريطة عمليات إدارة المشاريع في المختبر' });
  await li.getByRole('button', { name: 'افتح في المختبر' }).click();
  await expect.poll(() => state.started).toBe('L-pm');
  await expect(page.getByRole('heading', { name: item.title })).toBeVisible();
  expect(state.docs).toBe(1);
});
