// صفحة العملية في سجل المدفوعات: التفاصيل والعميل والخط الزمني والملاحظة والتذكير ومفاتيح البريد. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const old = new Date(Date.now() - 5 * 36e5).toISOString();
const pays = [
  { id: 'pay1', participant_id: 'p1', email: 's@x.com', item: 'assessment', amount_cents: 199, currency: 'USD', status: 'paid', mode: 'live', order_id: 'ord_1', paid_at: '2026-11-13T19:02:00Z', created_at: '2026-11-13T19:00:00Z', participants: { full_name: 'سارة الأحمد', phone: '0501234567' } },
  { id: 'pay2', participant_id: 'p2', email: 'o@x.com', item: 'program', amount_cents: 500, currency: 'USD', status: 'pending', mode: 'live', created_at: old, participants: { full_name: 'عمر علي' } },
];
const settings = { enabled: true, mode: 'live', assessment_product: 'prod_a', program_product: 'prod_p', assessment_cents: 199, program_cents: 500, currency: 'USD', notify: {} };
const file = (p, extra = {}) => ({
  success: true, payment: { ...p, subtotal_cents: 199, tax_cents: 0, country: 'SA', customer_name: 'Sara A', transaction_id: 'tran_1', admin_note: null },
  item_ar: 'القياس', participant: { id: p.participant_id, full_name: p.participants.full_name, email: p.email, phone: p.participants.phone || null, status: 'enrolled', created_at: '2026-10-01' },
  whatsapp: p.participants.phone ? 'https://wa.me/966501234567' : null, creem_url: p.order_id ? 'https://www.creem.io/dashboard/orders/ord_1' : null,
  timeline: [{ at: p.created_at, tone: 'info', text: 'فُتحت صفحة الدفع', detail: '' }, ...(p.paid_at ? [{ at: p.paid_at, tone: 'ok', text: 'تأكد الدفع', detail: '' }] : [])], ...extra,
});

async function setup(page, hash, role = 'admin') {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.payments': { success: true, settings, configured: true, payments: pays, entitlements: [], daily: [], health: { api_key: true, mode: 'live', webhook_secret: true, last_event: null, failed_events: 0, webhook_url: 'https://x/creem-webhook' }, kpis: { revenue_cents: 199, refunds_cents: 0, assessment_paid: 1, program_paid: 0, conversion: 0, pending: 1, grants: 0 } },
      'admin.payment': file(pays.find((p) => p.id === b.id) || pays[0]),
      'admin.payment-note': { success: true }, 'admin.payment-remind': { success: true }, 'admin.payment-settings': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() }));
    localStorage.clear();
  }, role);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}

test('العملية المدفوعة: تفاصيلها وعميلها وأزرار التواصل والخط الزمني', async ({ page }) => {
  await setup(page, '#/leaders/payments/pay1');
  await expect(page.getByRole('heading', { name: /1\.99 USD/ })).toBeVisible();
  await expect(page.getByText('tran_1')).toBeVisible();
  await expect(page.getByText('Sara A')).toBeVisible();
  await expect(page.getByRole('link', { name: 'واتساب' })).toHaveAttribute('href', 'https://wa.me/966501234567');
  await expect(page.getByRole('link', { name: 'راسله بالبريد' })).toHaveAttribute('href', 'mailto:s@x.com');
  await expect(page.getByRole('link', { name: /استردّها من Creem/ })).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('.payf-line li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'ذكّره بإكمال الدفع' })).toHaveCount(0);
});

test('الملاحظة تُحفظ، والمعلّقة تُذكَّر بعد تأكيد', async ({ page }) => {
  const calls = await setup(page, '#/leaders/payments/pay2');
  await page.getByLabel('ملاحظة الإدارة على العملية').fill('اتصلت به وسيدفع غدًا');
  await page.getByRole('button', { name: 'احفظ الملاحظة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.payment-note')).toMatchObject({ id: 'pay2', note: 'اتصلت به وسيدفع غدًا' });
  await page.getByRole('button', { name: 'ذكّره بإكمال الدفع' }).click();
  await expect(page.getByRole('alertdialog')).toHaveAccessibleName(/عمر علي/);
  expect(calls.some((c) => c.action === 'admin.payment-remind')).toBe(false);
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.some((c) => c.action === 'admin.payment-remind')).toBe(true);
});

test('من القائمة: عرض «لم يكملوا الدفع» وفتح العملية والرجوع', async ({ page }) => {
  await setup(page, '#/leaders/payments');
  await page.getByRole('button', { name: /لم يكملوا الدفع/ }).click();
  await expect(page.getByTitle('افتح العملية')).toHaveCount(1);
  await page.getByTitle('افتح العملية').click();
  await expect(page).toHaveURL(/#\/leaders\/payments\/pay2/);
  await page.getByRole('button', { name: /كل العمليات/ }).click();
  await expect(page).toHaveURL(/#\/leaders\/payments$/);
});

test('مفاتيح بريد الدفع مغلقة أصلًا وتُحفظ مع الإعدادات', async ({ page }) => {
  const calls = await setup(page, '#/leaders/payments');
  await page.getByRole('button', { name: 'الإعداد', exact: true }).click();
  const box = page.getByRole('checkbox', { name: /تأكيد الدفع للعميل/ });
  await expect(box).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /تنبيه الإدارة/ })).not.toBeChecked();
  await box.check();
  await page.getByRole('button', { name: 'احفظ', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.payment-settings')?.notify).toMatchObject({ receipt: true });
});

test('القارئ يرى العملية بلا أفعال', async ({ page }) => {
  await setup(page, '#/leaders/payments/pay2', 'viewer');
  await expect(page.getByLabel('ملاحظة الإدارة على العملية')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ذكّره بإكمال الدفع' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'احفظ الملاحظة' })).toHaveCount(0);
});
