// طلب إعادة القياس من الإدارة (تصور وسم المستعجلين، 2026-11-13): بطاقة فوق مقدمة القياس بنص البريد نفسه، بدور تنبيه،
// ولا تظهر لمن لا طلب عليه. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const TITLE = 'نحتاج منك إعادة قياس تحديد المستوى';
const TEXT = 'أظهرت مراجعة إجاباتك أن كثيرًا منها جاء أسرع من الوقت اللازم لقراءة السؤال، فلا يمكننا الاعتماد على النتيجة لتحديد مسارك. مسارك في البرنامج يُبنى على هذا القياس، لذلك نطلب منك إعادته بتأنٍّ. يأخذ نحو 35 دقيقة، وتقدمك يُحفظ سؤالًا سؤالًا فتكمله على أكثر من جلسة.';
const Q = [{ id: 'm3', dimension: 'milestone', tier: 'knowledge', kind: 'choice', text: 'أي النقاط تمثل بوابة مرحلة؟', options: [{ k: 0, label: 'الاجتماع الأسبوعي' }, { k: 1, label: 'قرار الاستمرار' }] }];

async function open(page, retake) {
  const stage = (key, title_ar, status) => ({ key, title_ar, phase: 'admission', status, items: [], done: 0, total: 0 });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: 'profiled', consented_at: '2026-11-01T00:00:00Z' },
    profile: { full_name: 'سارة عبدالله الأحمد', phone: '+966500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة', years_experience: 8, approved: false, level: null, track: null },
    journey: [stage('profile', 'الملف الشخصي', 'done'), stage('assessment', 'تحديد المستوى', 'active')], progress: 10, passkeys: 1, prompt_passkey: false,
  };
  await page.route(/functions\/v1\/leaders-api/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    route.fulfill({ json: b.action === 'assessment.get'
      ? { success: true, assessment: { id: 'a2', kind: 'baseline', status: 'in_progress', est_minutes: 35 }, questions: Q, answers: {}, before: {}, retake }
      : me });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-retake-000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
}

test('طلب إعادة قائم: بطاقة تنبيه فوق مقدمة القياس بعنوانها ونصها، وزر البدء تحتها', async ({ page }) => {
  await open(page, { title: TITLE, text: TEXT, requested_at: '2026-11-13T10:00:00Z' });
  const card = page.locator('.retake-card');
  await expect(card).toHaveAttribute('role', 'alert');
  await expect(card.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(card).toContainText('نطلب منك إعادته بتأنٍّ');
  await expect(card).not.toContainText('يدخل في تقييمك');
  await expect(page.getByRole('button', { name: 'ابدأ' })).toBeVisible();
  // 390: البطاقة لا تسبب تمريرًا أفقيًا
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('بلا طلب إعادة: لا بطاقة', async ({ page }) => {
  await open(page, null);
  await expect(page.getByRole('button', { name: 'ابدأ' })).toBeVisible();
  await expect(page.locator('.retake-card')).toHaveCount(0);
});
