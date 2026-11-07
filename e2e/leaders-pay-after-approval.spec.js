// D04: رسم البرنامج بعد اعتماد المسار. قبله حالة انتظار مؤرخة بلا بوابة دفع، وبعده صفحة الدفع بالمسار
// المعتمد من مصدره، بلا وعد بما لم يُفعَّل (كاتون). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const meOf = (approved) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: approved ? 'placed' : 'pending_approval', phone: '0500000000', job_title: 'مديرة', organization_linked: false, consented_at: '2026-11-01T09:00:00Z', profile_completed_at: '2026-11-01T09:00:00Z' },
  profile: { approved, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  access: { enabled: true, assessment: 'paid', program: null, prices: { currency: 'USD', assessment: 100, program: 9900 }, sponsor: null, request: null },
  baseline_submitted_at: '2026-11-05T10:00:00Z',
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'qualify', title_ar: 'التأهيل', phase: 'qualification', status: 'locked', duration_days: 42, done: 0, total: 3,
      items: [{ code: 'T-HB', kind: 'reading', status: 'pending' }, { code: 'M-1', kind: 'model', status: 'pending' }, { code: 'M-2', kind: 'model', status: 'pending' }] },
  ],
  progress: 10, passkeys: 1, prompt_passkey: false,
});
const signedIn = (page) => page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-pay-0000000000000000000'); });

async function mock(page, approved, patch = {}) {
  const sent = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b.action);
    const r = { me: { ...meOf(approved), ...patch }, 'pay.checkout': { success: false, message: 'الدفع غير متاح الآن، حاول لاحقًا' } }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  return sent;
}

test('قبل الاعتماد: حالة انتظار بموعد يومي عمل، ولا بوابة دفع ولا طلب دفع', async ({ page }) => {
  const sent = await mock(page, false);
  await signedIn(page);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مسارك قيد الاعتماد' })).toBeVisible();
  await expect(page.getByText('خلال يومي عمل، أي قبل نهاية')).toBeVisible();
  await expect(page.getByRole('button', { name: /ادفع/ })).toHaveCount(0);
  expect(sent).not.toContain('pay.checkout');
});

test('بعد الاعتماد: الدفع بالمسار المعتمد من مصدره، والسعر والضريبة والاسترداد، بلا وعد كاتون', async ({ page }) => {
  const sent = await mock(page, true);
  await signedIn(page);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'أكمل رحلتك في البرنامج' })).toBeVisible();
  await expect(page.getByText('مسارك المعتمد')).toBeVisible();
  await expect(page.getByText('3 مراحل: الملف الشخصي، تحديد المستوى، التأهيل')).toBeVisible();
  await expect(page.getByText('2 من النماذج التطبيقية يراجعها مستشارك')).toBeVisible();
  await expect(page.getByText('نحو 6 أسابيع من بداية دفعتك')).toBeVisible();
  await expect(page.locator('.pay-card')).not.toContainText('كاتون');
  await expect(page.getByRole('link', { name: 'سياسة الاسترداد' })).toBeVisible();
  await expect(page.getByText('ضريبة القيمة المضافة')).toBeVisible();
  await page.getByRole('button', { name: 'ادفع وأكمل البرنامج' }).click();
  await expect.poll(() => sent.includes('pay.checkout')).toBe(true);
});

test('رعاية بانتظار الاعتماد (D20): لا بوابة دفع، ولا ما يكشف عقد الجهة، والملف محفوظ', async ({ page }) => {
  const base = meOf(false);
  const sent = await mock(page, false, { access: { ...base.access, assessment: null, request: { status: 'pending', kind: 'seats', typed_name: 'جهة' } } });
  await signedIn(page);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'رعايتك بانتظار الاعتماد' })).toBeVisible();
  await expect(page.getByText('ملفك وقياسك محفوظان')).toBeVisible();
  await expect(page.locator('.pay-card')).not.toContainText('مقاعد');
  await expect(page.getByRole('button', { name: /ادفع/ })).toHaveCount(0);
  expect(sent).not.toContain('pay.checkout');
});
