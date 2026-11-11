// فحص الجاهزية p-entry-1: الأرقام العربية المشرقية (٠-٩) في أول شاشتين. كانت تُمحى من رمز الدخول بلا طلب ولا رسالة،
// وتُفرغ حقل سنوات الخبرة فيقول الحفظ «بقي حقل واحد». الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';

const me = (done = false) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: done ? 'profiled' : 'registered', consented_at: '2026-11-01T00:00:00Z' },
  profile: { full_name: 'سارة عبدالله الأحمد', phone: done ? '+966500000000' : '', job_title: done ? 'مديرة مشاريع' : '', organization_name: done ? 'جهة الاختبار' : '', years_experience: done ? 8 : null, approved: false, level: null, track: null },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: done ? 'done' : 'active', items: [{ id: 'i1', code: 'P-INFO', kind: 'system', title_ar: 'بيانات الملف', required: true, status: done ? 'done' : 'pending' }], done: done ? 1 : 0, total: 1 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: done ? 'active' : 'locked', items: [], done: 0, total: 0 },
  ],
  progress: 5, passkeys: 1, prompt_passkey: false,
});

test('دخول المشارك: رمز بالأرقام المشرقية يُحوَّل ويُرسل للتحقق', async ({ page }) => {
  const verifies = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'auth.start') return route.fulfill({ json: { success: true, sent: true } });
    if (b.action === 'auth.verify') { verifies.push(b); return route.fulfill({ json: { token: 'tok-digits-00000000000000000000', ...me(true) } }); }
    return route.fulfill({ json: me(true) });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('رمز التحقق').pressSequentially('٢٤٦٨١٠');
  await expect.poll(() => verifies.map((b) => b.code)).toEqual(['246810']);
});

test('بوابتا الجهة والخبير: الرمز بالأرقام المشرقية يصل الخادم لاتينيًا', async ({ page }) => {
  const sent = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action.endsWith('auth-start')) return route.fulfill({ json: { success: true, sent: true } });
    return route.fulfill({ json: { success: false, code: 'code', message: 'الرمز غير صحيح' } });
  });
  await page.goto(APP + 'org');
  await page.getByLabel('البريد الإلكتروني').fill('coord@wt.gov.sa');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await page.getByLabel('رمز التحقق').fill('١٢٣٤٥٦');
  await expect(page.getByText('الرمز غير صحيح')).toBeVisible();
  expect(sent.find((b) => b.action === 'coord.auth-verify')?.code).toBe('123456');

  await page.goto(APP + 'x');
  await page.getByLabel('البريد الإلكتروني').fill('expert@x.sa');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await page.getByLabel('رمز التحقق').fill('۶۵۴۳۲۱');
  await expect(page.getByLabel('رمز التحقق')).toHaveValue('654321');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByText('الرمز غير صحيح')).toBeVisible();
  expect(sent.find((b) => b.action === 'xp.auth-verify')?.code).toBe('654321');
});

test('الملف الشخصي: سنوات الخبرة بالأرقام المشرقية تُقبل وتُحفظ', async ({ page }) => {
  const saves = [];
  let done = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'profile.save') { saves.push(b.fields); done = true; }
    return route.fulfill({ json: b.action === 'assessment.get' ? { success: false, message: 'لاحقًا' } : me(done) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-digits-00000000000000000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: /عرّفنا بك/ })).toBeVisible();
  await page.getByLabel(/رقم الجوال/).fill('٠٥٠٠٠٠٠٠٠٠');
  await page.getByLabel(/المسمى الوظيفي/).fill('مديرة مشاريع');
  await page.getByLabel(/جهة العمل/).fill('جهة الاختبار');
  await page.getByLabel(/سنوات الخبرة/).pressSequentially('١٢');
  await expect(page.getByLabel(/سنوات الخبرة/)).toHaveValue('12');
  await page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' }).click();
  await expect(page.getByText(/بقي حقل واحد/)).toHaveCount(0);
  await expect.poll(() => saves.at(-1)?.years_experience).toBe('12');
  // الجوال يُرسل كما كُتب، والخادم يوحّده (normalizePhone يقبل المشرقية: arabic-digits.test.js)
  expect(saves.at(-1).phone).toBe('٠٥٠٠٠٠٠٠٠٠');
});
