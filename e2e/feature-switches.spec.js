// مفاتيح الميزات P2 وP3: القاعة الحية وكاتون وتقييم 360 تُخفى عن المشارك والخبير والمقيّم بزر المدير، والمفاتيح من
// حمولة الخادم (me.features ولوحة الخبير). المدير يرى «الميزات قيد البناء» بمفاتيحها الثلاثة متجاورة، وشارة «مخفي عن
// المستخدمين» على أقسامها وشريطًا في أعلى شاشاتها. على الشاشة العريضة وعرض 390. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { DEFAULTS, SETTINGS } from '../supabase/functions/leaders-api/settings.js';
import { RATER_PAUSED_AR } from '../supabase/functions/leaders-api/features.js';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const OFF = { hall: false, katon: false, f360: false };
const ON = { hall: true, katon: true, f360: true };
const SIZES = [['الشاشة العريضة', { width: 1280, height: 860 }], ['عرض 390', { width: 390, height: 844 }]];

async function participant(page, features) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true, features });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    const own = { 'f360.mine': { success: true, enabled: true, ready: true, cycles: [] } }[b.action];
    await route.fulfill({ json: own || srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  return calls;
}

async function expert(page, features) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = {
      'xp.dashboard': { success: true, features, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 3, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر 2026' }] },
      'xp.participants': { success: true, items: [], cohorts: [] }, 'xp.reviews': { success: true, advisor: true, items: [] }, 'xp.peer-list': { success: true, advisor: true, cohorts: [], items: [], pending: 0 },
      'xp.f360': { success: true, approvals: [{ id: 'f1', wave: 't1', status: 'approval', participant: 'سارة الأحمد', participant_id: 'p1', self_done: true, nominees: [{ id: 'n1', email: 'k@x.sa', full_name: 'خالد', relation: 'peer', relation_ar: 'زميل', flags_ar: [] }] }], reports: [] },
      'xp.hall': { success: true, session: null, topics: [], workshops: [] },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true, items: [] } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
}

async function admin(page, start) {
  const values = structuredClone(DEFAULTS);
  Object.assign(values.features, { hall: start.hall, katon: start.katon });
  values.feedback360.enabled = start.f360;
  const calls = [];
  const settings = () => ({ success: true, schema: SETTINGS, defaults: DEFAULTS, values, ready: true, updated: {} });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.settings-save') Object.assign(values[b.group], b.values);
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.settings': settings(), 'admin.settings-save': settings(),
      'admin.hall': { success: true, session: null, topics: [], workshops: [], cohorts: [] },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true, items: [], cycles: [], totals: {} } });
  });
  await page.goto(ADMIN);
  await page.evaluate((h) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    window.location.hash = h;
  }, '#/leaders/settings');
  await page.reload();
  return calls;
}

for (const [label, size] of SIZES) {
  test.describe(label, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize(size); });

    test('المشارك والميزات مخفية: لا قاعة ولا كاتون ولا 360، ورابط ?tab=hall يقع على الرحلة', async ({ page }) => {
      const calls = await participant(page, OFF);
      await page.goto(`${APP}?tab=hall`);
      await expect(page.locator('[data-tour="journey-hero"]')).toBeVisible();
      await expect(page.locator('[data-tour="nav-handbook"]').locator('visible=true').first()).toBeVisible();
      await expect(page.locator('[data-tour="nav-hall"]')).toHaveCount(0);
      await expect(page.locator('[data-tour="nav-katon"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'ادخل القاعة' })).toHaveCount(0);
      expect(calls).not.toContain('hall.state');
      // «ملفي» بلا بطاقة 360، ولا يُسأل عنها الخادم
      await page.locator('[data-tour="nav-profile"]').locator('visible=true').first().click();
      await expect(page.getByRole('heading', { name: 'تقييم 360 للتطوير' })).toHaveCount(0);
      expect(calls).not.toContain('f360.mine');
    });

    test('المشارك والميزات ظاهرة: القاعة في التنقل ورابطها يفتحها، و360 في «ملفي»', async ({ page }) => {
      const calls = await participant(page, ON);
      await page.goto(APP);
      await expect(page.locator('[data-tour="nav-hall"]').locator('visible=true').first()).toBeVisible();
      await expect(page.locator('[data-tour="nav-katon"]').locator('visible=true').first()).toBeVisible();
      await page.goto(`${APP}?tab=hall`);
      await expect.poll(() => calls.includes('hall.state')).toBe(true);
      await page.locator('[data-tour="nav-profile"]').locator('visible=true').first().click();
      await expect(page.getByRole('heading', { name: 'تقييم 360 للتطوير' })).toBeVisible();
    });

    test('الخبير: بطاقتا القاعة و360 بمفتاحيهما من لوحته', async ({ page }) => {
      await expert(page, OFF);
      await page.goto(`${APP}x`);
      await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'القاعة الحية' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'تقييم 360 لمشاركيك' })).toHaveCount(0);
    });

    test('الخبير والميزات ظاهرة: القاعة و360 في بوابته', async ({ page }) => {
      await expert(page, ON);
      await page.goto(`${APP}x`);
      await expect(page.getByRole('region', { name: 'القاعة الحية' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'تقييم 360 لمشاركيك' })).toBeVisible();
    });

    test('مقيّم 360 برابطه و360 مخفي: صفحة «متوقف مؤقتًا» لا نموذج ولا خطأ', async ({ page }) => {
      await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: false, code: 'f360_off', paused: true, phase: 'f360', message: RATER_PAUSED_AR } }));
      await page.goto(`${APP}rate?t=${'r'.repeat(40)}`);
      const box = page.getByTestId('rater-paused');
      await expect(box).toContainText('تقدير متوقف مؤقتًا');
      await expect(box).toContainText(RATER_PAUSED_AR);
      await expect(page.getByText('الرابط غير متاح')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /ابدأ/ })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('360');
    });

    test('المدير: ثلاثة مفاتيح متجاورة، وشارة وشريط على القسم المخفي، والنقرة تحفظ وتزيل الشارة', async ({ page }) => {
      const calls = await admin(page, OFF);
      const panel = page.getByRole('region', { name: 'الميزات قيد البناء' });
      await expect(panel).toBeVisible();
      const sw = panel.getByRole('switch');
      await expect(sw).toHaveCount(3);
      for (const n of ['القاعة الحية', 'كاتون', 'تقييم 360']) await expect(panel).toContainText(n);
      await expect(panel.locator('.la-chip.warn')).toHaveCount(3);
      if (size.width > 640) {
        // متجاورة على الشاشة العريضة: الثلاثة في صف واحد
        const tops = await panel.locator('.ft-switch').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1);
      }
      // مفتاح 360 لا يُعرض مرة ثانية في مجموعة 360
      await expect(page.getByRole('form', { name: 'تقييم 360 للتطوير' }).getByRole('checkbox')).toHaveCount(0);
      const tabs = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
      for (const t of ['القاعة الحية', 'بنك كاتون', 'تقييم 360']) await expect(tabs.getByRole('button', { name: new RegExp(t) })).toContainText('مخفي عن المستخدمين');
      await expect(tabs.getByRole('button', { name: /المشاركون/ })).not.toContainText('مخفي');

      // المفتاح يتبع المخزن: يتغير بعد الحفظ لا قبله
      await sw.nth(0).click();
      await expect(sw.nth(0)).toBeChecked();
      await expect(page.getByText('القاعة الحية: ظاهرة للمستخدمين')).toBeVisible();
      expect(calls.find((c) => c.action === 'admin.settings-save')).toMatchObject({ group: 'features', values: { hall: true } });
      await expect(tabs.getByRole('button', { name: /القاعة الحية/ })).not.toContainText('مخفي عن المستخدمين');
      await sw.nth(2).click();
      await expect(sw.nth(2)).toBeChecked();
      await expect.poll(() => calls.filter((c) => c.action === 'admin.settings-save').at(-1)).toMatchObject({ group: 'feedback360', values: { enabled: true } });
      await expect(tabs.getByRole('button', { name: /تقييم 360/ })).not.toContainText('مخفي عن المستخدمين');

      // شاشة «كاتون» المخفية: شريط في أعلاها يقود إلى المفاتيح
      await tabs.getByRole('button', { name: /بنك كاتون/ }).click();
      const banner = page.getByTestId('feature-hidden-banner');
      await expect(banner).toContainText('مخفي عن المستخدمين');
      await banner.getByRole('button', { name: 'أظهره من «الميزات قيد البناء»' }).click();
      await expect(page.getByRole('region', { name: 'الميزات قيد البناء' })).toBeVisible();
      // القاعة الظاهرة الآن: بلا شريط
      await tabs.getByRole('button', { name: /القاعة الحية/ }).click();
      await expect(page.getByTestId('feature-hidden-banner')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}
