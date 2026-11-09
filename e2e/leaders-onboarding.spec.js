// الفيديو التعريفي ومعالج البداية: المشغّل من شاشة الدخول، ثم ترحيب المشارك الجديد بالفيديو،
// ثم رأس الخطوات فوق الملف والقياس، ثم بطاقة «ما بعد ذلك» في الرحلة حتى الاعتماد.
import { test, expect } from '@playwright/test';
import { PARTICIPANT_VIDEO as VIDEO } from '../shared/video/scenes.js';   // التطبيق يعرض فيديو المشارك

const APP = 'http://localhost:4304/';

function server() {
  const s = { profileDone: false, assessed: false };
  const stage = (key, title_ar, phase, status, items = []) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length });
  const me = () => ({
    success: true,
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: s.assessed ? 'pending_approval' : 'registered', consented_at: '2026-11-01T00:00:00Z' },
    profile: { full_name: 'سارة عبدالله الأحمد', phone: s.profileDone ? '0500000000' : '', job_title: s.profileDone ? 'مديرة مشاريع' : '', organization_name: s.profileDone ? 'جهة الاختبار' : '', years_experience: s.profileDone ? 8 : null, approved: false, level: null, track: null },
    journey: [
      stage('profile', 'الملف الشخصي', 'admission', s.profileDone ? 'done' : 'active', [{ id: 'i1', code: 'P-INFO', kind: 'system', title_ar: 'بيانات الملف', required: true, status: s.profileDone ? 'done' : 'pending' }]),
      stage('assessment', 'تحديد المستوى', 'admission', s.assessed ? 'done' : s.profileDone ? 'active' : 'locked', [{ id: 'i2', code: 'A-DONE', kind: 'system', title_ar: 'إرسال القياس', required: true, status: s.assessed ? 'done' : 'pending' }]),
      { ...stage('approval', 'اعتماد المستوى', 'admission', s.assessed ? 'active' : 'locked'), duration_label: '3 أيام عمل' },
    ],
    progress: s.assessed ? 20 : 5, passkeys: 1, prompt_passkey: false,
  });
  const reply = (b) => {
    switch (b.action) {
      case 'me': return me();
      case 'profile.save': s.profileDone = true; return me();
      case 'assessment.get': return {
        success: true, assessment: { id: 'a1', kind: 'baseline', status: 'in_progress', est_minutes: 12 },
        questions: [{ id: 'q1', dimension: 'milestone', tier: 'behavior', kind: 'likert', text: 'أراجع المعالم مع فريقي كل أسبوع.', options: ['نادرًا جدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا'].map((label, k) => ({ k, label })) }],
        answers: {}, before: {},
      };
      case 'assessment.answer': return { success: true };
      case 'certificate': return { success: true, certificate: null };
      case 'assessment.submit': s.assessed = true; return me();
      case 'lab.list': return { success: true, items: [], points: 0 };
      case 'logout': return { success: true };
      default: return { success: true };
    }
  };
  return { reply };
}

test('شاشة الدخول: زر الفيديو يفتح مشغّلًا داخل الصفحة ويُغلق بـEsc', async ({ page }) => {
  await page.goto(APP);
  const btn = page.getByRole('button', { name: new RegExp(VIDEO.label) });
  await expect(btn).toBeVisible();
  await btn.click();
  const dialog = page.getByRole('dialog', { name: VIDEO.title });
  await expect(dialog).toBeVisible();
  const video = dialog.locator('video');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute('src', `/media/${VIDEO.file}.mp4`);
  await expect(video.locator('track[kind="captions"]')).toHaveAttribute('src', `/media/${VIDEO.file}.vtt`);
  // الملف نفسه يُخدم فعلًا من التطبيق المبني
  const res = await page.request.get(APP + `media/${VIDEO.file}.mp4`);
  expect(res.status()).toBe(200);
  expect(Number(res.headers()['content-length'])).toBeLessThan(VIDEO.maxBytes);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(btn).toBeFocused();
});

test('مشارك جديد: ترحيب بالفيديو ثم رأس الخطوات فوق الملف والقياس ثم بطاقة ما بعد ذلك', async ({ page }) => {
  const srv = server();
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: srv.reply(b) });
  });
  // جلسة محفوظة بلا علم الترحيب: أول دخول
  await page.addInitScript(() => localStorage.setItem('mi_leaders_session', 'tok-onboarding-0000000000000000'));
  await page.goto(APP);

  // الخطوة 1: الترحيب والفيديو المضمّن
  await expect(page.getByRole('heading', { name: 'أهلًا سارة، لنبدأ' })).toBeVisible();
  await expect(page.locator('.onb-welcome video')).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'خطوات البداية' });
  await expect(rail.getByText('الخطوة 1 من 4')).toBeVisible();
  await page.getByRole('button', { name: 'لنبدأ' }).click();

  // الخطوة 2: الملف كما هو، تحت رأس الخطوات
  await expect(page.getByRole('heading', { name: /عرّفنا بك/ })).toBeVisible();
  await expect(rail.getByText('الخطوة 2 من 4')).toBeVisible();
  await expect(rail.locator('li[aria-current="step"]')).toContainText('عرّفنا بك');
  await page.getByLabel(/رقم الجوال/).fill('0500000000');
  await page.getByLabel(/المسمى الوظيفي/).fill('مديرة مشاريع');
  await page.getByLabel(/جهة العمل/).fill('جهة الاختبار');
  await page.getByLabel(/سنوات الخبرة/).fill('8');
  await page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' }).click();

  // الخطوة 3: القياس تحت الرأس، ثم إرساله
  await expect(page.getByRole('heading', { name: 'لنحدد نقطة انطلاقك' })).toBeVisible();
  await expect(rail.getByText('الخطوة 3 من 4')).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();

  // الخطوة 4: بطاقة «ما بعد ذلك» في الرحلة بمدة الاعتماد من المرحلة نفسها، وتُغلق مرة واحدة
  await expect(page.getByRole('heading', { name: /نتيجتك قيد المراجعة/ })).toBeVisible();
  const card = page.getByRole('status').filter({ hasText: 'أرسلت قياسك. ما بعد ذلك' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('3 أيام عمل');
  await expect(rail).toHaveCount(0);
  await card.getByRole('button', { name: 'فهمت' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: /نتيجتك قيد المراجعة/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'أرسلت قياسك' })).toHaveCount(0);
});
