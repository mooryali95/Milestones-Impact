// عبارة الضريبة على سعر صفحة الدفع من نمط منتج Creem (المرحلة 3 من تصور مصدر السعر)، وإن لم يُعرف فالجملة العامة وحدها.
// الخلفية مُحاكاة، على 390 و1440.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.P3_SHOTS || '';
const meOf = (tax) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'placed', phone: '0500000000', job_title: 'مديرة', organization_linked: false, consented_at: '2026-11-01T09:00:00Z', profile_completed_at: '2026-11-01T09:00:00Z' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  access: { enabled: true, assessment: 'paid', program: null, prices: { currency: 'USD', assessment: 199, program: 9900, tax: { assessment: null, program: tax } }, sponsor: null, request: null },
  baseline_submitted_at: '2026-11-05T10:00:00Z',
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'qualify', title_ar: 'التأهيل', phase: 'qualification', status: 'locked', duration_days: 42, done: 0, total: 3,
      items: [{ code: 'T-HB', kind: 'reading', status: 'pending' }, { code: 'M-1', kind: 'model', status: 'pending' }, { code: 'M-2', kind: 'model', status: 'pending' }] },
  ],
  progress: 10, passkeys: 1, prompt_passkey: false,
});

for (const width of [390, 1440]) {
  test.describe(`عرض ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    for (const [tax, text] of [['exclusive', 'يُضاف عليه الضريبة إن وُجدت'], ['inclusive', 'شامل الضريبة'], [null, null]]) {
      test(`نمط الضريبة ${tax || 'غير معروف'}`, async ({ page }) => {
        await page.route(/functions\/v1\/leaders-api/, async (route) => {
          const b = JSON.parse(route.request().postData() || '{}');
          await route.fulfill({ json: b.action === 'me' ? meOf(tax) : { success: true } });
        });
        await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-pay-0000000000000000000'); });
        await page.goto(APP);
        await expect(page.getByRole('heading', { name: 'أكمل رحلتك في البرنامج' })).toBeVisible();
        const line = page.locator('.pay-price [data-tax]');
        if (text) await expect(line).toHaveText(text); else await expect(line).toHaveCount(0);
        // الجملة العامة باقية في كل حال
        await expect(page.getByText('ضريبة القيمة المضافة')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        if (SHOTS) await page.locator('.pay-card').screenshot({ path: `${SHOTS}/p3-paywall-${tax || 'unknown'}-${width}.png` });
      });
    }
  });
}
