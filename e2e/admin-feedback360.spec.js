// الإعدادات العامة وتقييم 360 في اللوحة: القيم التي يضبطها المالك تُحرَّر بالتحقق نفسه وتُحفظ، وحالة الدورات بلا
// نتيجة فرد، وتقرير فرد يُفتح عند الطلب (ويُسجَّل على الخادم) في نافذة تُغلق بـEsc. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { DEFAULTS, SETTINGS } from '../supabase/functions/leaders-api/settings.js';

const BASE = 'http://localhost:4303/';
async function open(page, hash, extra = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.settings': { success: true, schema: SETTINGS, defaults: DEFAULTS, values: DEFAULTS, ready: true, updated: {} },
      'admin.settings-save': { success: true, schema: SETTINGS, defaults: DEFAULTS, values: { ...DEFAULTS, feedback360: { ...DEFAULTS.feedback360, ...b.values } }, ready: true, updated: { [b.group]: { by: 'a@x', at: '2026-11-12T10:00:00Z' } } },
      ...extra,
    };
    const r = replies[b.action];
    await route.fulfill({ json: typeof r === 'function' ? r(b) : r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((h) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    window.location.hash = h;
  }, hash);
  await page.reload();
  return calls;
}

test('الإعدادات العامة: التحقق نفسه قبل الإرسال، ثم الحفظ بالمجموعة', async ({ page }) => {
  const calls = await open(page, '#/leaders/settings');
  const form = page.getByRole('form', { name: 'تقييم 360 للتطوير' });
  await expect(form).toBeVisible();
  await expect(page.getByRole('form', { name: 'زمن الإجابة في مراجعة القياس' })).toBeVisible();
  await form.getByLabel('أيام التذكير').fill('5، 20');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form.getByRole('alert')).toContainText('داخل نافذة التقدير');
  expect(calls.some((c) => c.action === 'admin.settings-save')).toBe(false);
  await form.getByLabel('أيام التذكير').fill('4، 9');
  await form.getByLabel('مفعّل للمشاركين').check();
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByText('حُفظت الإعدادات')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.settings-save')).toMatchObject({ group: 'feedback360', values: { enabled: true, remind_days: [4, 9], min_group: 3 } });
});

test('تقييم 360: الدورات بالأعداد، وتقرير فرد عند الطلب في نافذة تُغلق بـEsc', async ({ page }) => {
  const report = { releasable: false, need: 1, counts: {}, response: { invited: 3, submitted: 2 }, scale: DEFAULTS.feedback360.scale_labels, gap_points: 0.5 };
  const calls = await open(page, '#/leaders/f360', {
    'admin.f360': { success: true, ready: true, totals: { cycles: 1, open: 0, invited: 3, submitted: 2, response_pct: 67 }, cycles: [
      { id: 'c1', participant_id: 'p1', participant: 'سارة الأحمد', wave: 't1', status: 'closed', status_ar: 'أُغلق، بانتظار جلسة الاستلام', closes_at: '2026-11-20T00:00:00Z', counts: { manager: { invited: 1, submitted: 1 }, peer: { invited: 2, submitted: 1 }, report: { invited: 0, submitted: 0 }, stakeholder: { invited: 0, submitted: 0 } }, invited: 3, submitted: 2 },
    ] },
    'admin.f360-report': { success: true, cycle: { id: 'c1', wave: 't1', status: 'closed' }, participant: 'سارة الأحمد', report, notes: [] },
  });
  await expect(page.getByText('استجابة 67% (2 من 3)')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'المدير المباشر 1/1 · الزملاء 1/2' })).toBeVisible();
  expect(calls.some((c) => c.action === 'admin.f360-report')).toBe(false);
  const btn = page.getByRole('button', { name: 'تقرير سارة الأحمد' });
  await btn.click();
  const d = page.getByRole('dialog', { name: 'تقرير 360 · سارة الأحمد' });
  await expect(d).toContainText('لا تقرير لهذه الموجة');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  expect(calls.filter((c) => c.action === 'admin.f360-report')).toHaveLength(1);
});
