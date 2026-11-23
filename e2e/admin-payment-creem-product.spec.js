// فحص منتج Creem في إعداد الدفع (المرحلة 3 من تصور مصدر السعر): سطر لكل منتج بما يقوله Creem، وتحذيرات صريحة،
// و«تعذّر التحقق من Creem الآن» بلا منع للحفظ. الخلفية مُحاكاة، على 390 و1440.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.P3_SHOTS || '';
const ok = (id, over = {}) => ({ id, state: 'ok', billing: 'onetime', currency: 'USD', tax_mode: 'exclusive', mode: 'live', price_cents: 500, status: 'active', warnings: [], ...over });
const CASES = {
  ok: { checked_at: '2026-11-23T09:00:00Z', key_mode: 'live', assessment: ok('prod_a'), program: ok('prod_p', { tax_mode: 'inclusive', price_cents: 9900 }) },
  warn: { checked_at: '2026-11-23T09:00:00Z', key_mode: 'live', assessment: ok('prod_a', { billing: 'recurring', currency: 'EUR', mode: 'test', warnings: ['subscription', 'currency', 'mode'] }), program: { id: 'prod_p', state: 'not_found', warnings: ['not_found'] } },
  unreachable: { checked_at: '2026-11-23T09:00:00Z', key_mode: 'live', assessment: { id: 'prod_a', state: 'unreachable' }, program: { id: 'prod_p', state: 'unreachable' } },
};

async function setup(page, check, verifyReply = null) {
  const sent = [];
  const settings = { enabled: true, assessment_product: 'prod_a', program_product: 'prod_p', assessment_cents: 199, program_cents: 9900, currency: 'USD', notify: {}, creem_check: check };
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    const replies = {
      'admin.payments': { success: true, settings, configured: true, payments: [], entitlements: [], daily: [], health: { api_key: true, mode: 'live', webhook_secret: true, last_event: null, failed_events: 0, webhook_url: 'https://x/creem-webhook' }, kpis: { revenue_cents: 0, refunds_cents: 0, assessment_paid: 0, program_paid: 0, conversion: 0, pending: 0, grants: 0 } },
      'admin.payment-settings': { success: true, settings, creem_check: verifyReply || check },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: 'admin' }, ts: Date.now() }));
    localStorage.clear();
  });
  await page.goto(BASE + '#/leaders/payments');
  await page.reload();
  await page.getByRole('button', { name: 'الإعداد', exact: true }).last().click();
  return sent;
}
const noScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const shot = async (page, name, width) => {
  if (!SHOTS) return;
  await page.locator('[data-product="assessment"]').scrollIntoViewIfNeeded();
  await page.locator('.pay-form').evaluate((e) => e.closest('.la-card').scrollIntoView());
  await page.locator('.la-card', { has: page.locator('.pay-form') }).screenshot({ path: `${SHOTS}/p3-admin-${name}-${width}.png` });
};

for (const width of [390, 1440]) {
  test.describe(`عرض ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });

    test('منتج سليم: الفوترة والعملة والضريبة والوضع، وسعر Creem معلومة لا خطأ', async ({ page }) => {
      await setup(page, CASES.ok);
      const a = page.locator('[data-product="assessment"] [data-creem]');
      await expect(a).toHaveAttribute('data-creem', 'ok');
      await expect(a).toContainText('دفعة واحدة');
      await expect(a).toContainText('USD');
      await expect(a).toContainText('يُضاف عليه الضريبة');
      await expect(a).toContainText('وضع حي');
      await expect(a.locator('[data-creem-price]')).toContainText('لم يعد مستعملًا');
      await expect(page.locator('[data-product="program"] [data-creem]')).toContainText('شامل الضريبة');
      await expect(page.locator('[data-warn]')).toHaveCount(0);
      await noScroll(page);
      await shot(page, 'ok', width);
    });

    test('تحذيرات: اشتراك، وعملة، ووضع، ومنتج غير موجود', async ({ page }) => {
      await setup(page, CASES.warn);
      const a = page.locator('[data-product="assessment"]');
      await expect(a.locator('[data-warn="subscription"]')).toContainText('اشتراك متكرر');
      await expect(a.locator('[data-warn="currency"]')).toContainText('عملة');
      await expect(a.locator('[data-warn="mode"]')).toContainText('وضع المنتج');
      await expect(page.locator('[data-product="program"] [data-warn="not_found"]')).toContainText('غير موجود');
      await noScroll(page);
      await shot(page, 'subscription', width);
    });

    test('تعذّر Creem: سطر «تعذّر التحقق من Creem الآن»، والزر يعيد الفحص بلا تغيير الإعداد', async ({ page }) => {
      const sent = await setup(page, CASES.unreachable, CASES.ok);
      await expect(page.locator('[data-creem="unreachable"]')).toHaveCount(2);
      await expect(page.locator('[data-creem="unreachable"]').first()).toContainText('تعذّر التحقق من Creem الآن');
      await noScroll(page);
      await shot(page, 'unreachable', width);
      await page.locator('[data-verify-creem]').click();
      await expect(page.locator('[data-product="assessment"] [data-creem]')).toHaveAttribute('data-creem', 'ok');
      const v = sent.find((b) => b.action === 'admin.payment-settings');
      expect(v.verify_only).toBe(true);
      expect(v.assessment_cents).toBeUndefined();
    });
  });
}
