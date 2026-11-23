// الدفع الزائد في سجل المدفوعات وصياغة السعر في الإعداد (المرحلة 1 من تصور مصدر السعر). الخلفية مُحاكاة، على 390 و1440.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const pays = [
  { id: 'pay1', participant_id: 'p1', email: 's@x.com', item: 'assessment', amount_cents: 199, currency: 'USD', status: 'paid', mode: 'live', order_id: 'ord_1', note: 'overpaid expected=100 paid=199', paid_at: '2026-11-23T09:02:00Z', created_at: '2026-11-23T09:00:00Z', participants: { full_name: 'سارة الأحمد' } },
  { id: 'pay2', participant_id: 'p2', email: 'o@x.com', item: 'assessment', amount_cents: 199, currency: 'USD', status: 'paid', mode: 'live', order_id: 'ord_2', note: null, paid_at: '2026-11-22T09:02:00Z', created_at: '2026-11-22T09:00:00Z', participants: { full_name: 'عمر علي' } },
];
const settings = { enabled: true, mode: 'live', assessment_product: 'prod_a', program_product: 'prod_p', assessment_cents: 100, program_cents: 9900, currency: 'USD', notify: {} };

async function setup(page) {
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.payments': { success: true, settings, configured: true, payments: pays, entitlements: [], daily: [], health: { api_key: true, mode: 'live', webhook_secret: true, last_event: null, failed_events: 0, webhook_url: 'https://x/creem-webhook' }, kpis: { revenue_cents: 398, refunds_cents: 0, assessment_paid: 2, program_paid: 0, conversion: 0, pending: 0, grants: 0 } },
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
}

for (const width of [390, 1440]) {
  test.describe(`عرض ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('الدفعة الزائدة بعلامة فيها المدفوع والمطلوب، والفلتر يحصرها', async ({ page }) => {
      await setup(page);
      const chip = page.locator('[data-overpaid]');
      await expect(chip).toHaveCount(1);
      await expect(chip).toContainText('أعلى من المطلوب');
      await expect(chip).toContainText('$1.99');
      await expect(chip).toContainText('$1');
      await expect(page.getByText('overpaid expected')).toHaveCount(0);
      await expect(page.locator('tbody tr')).toHaveCount(2);
      await page.getByRole('button', { name: /أعلى من المطلوب/ }).first().click();
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await expect(page.locator('tbody tr')).toContainText('سارة الأحمد');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    });

    test('الإعداد: السعر هو ما يراه المتدرب، بلا «حد أدنى»', async ({ page }) => {
      await setup(page);
      await page.getByRole('button', { name: 'الإعداد', exact: true }).last().click();
      const help = page.locator('[data-price-help]');
      await expect(help).toBeVisible();
      await expect(help).toContainText('السعر الذي يراه المتدرب');
      await expect(help).toContainText('سعر المنتج في Creem');
      await expect(page.getByText('حد أدنى')).toHaveCount(0);
    });
  });
}
