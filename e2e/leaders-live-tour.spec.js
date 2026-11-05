// الجولة الحيّة لحساب العرض: من رابط اللوحة إلى شاشة الدخول، ثم الدخول وتعبئة الملف وإرسال القياس
// بضغطات الجولة، ثم خطوات الرحلة بإضاءة عناصرها، ثم طلب أقران تجريبي، ثم الملف والأمان والختام.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const TOKEN = 'demo-token-0123456789abcdefghij';

function server() {
  const s = { profileDone: false, assessed: false, peers: [] };
  const stage = (key, title_ar, phase, status, items = []) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length });
  const me = () => ({
    success: true,
    participant: { id: 'demo', full_name: 'مشارك العرض', email: 'demo@example.invalid', status: s.assessed ? 'placed' : 'registered', is_demo: true, consented_at: '2026-11-01T00:00:00Z' },
    profile: { full_name: 'مشارك العرض', phone: s.profileDone ? '0500000000' : '', job_title: s.profileDone ? 'مدير إدارة المشاريع' : '', organization_name: s.profileDone ? 'جهة العرض' : '', years_experience: s.profileDone ? 8 : null,
      approved: s.assessed, level: s.assessed ? 'intermediate' : null, track: s.assessed ? { title: 'القيادة من خلال الآخرين', summary: 'ملخص', strengths: 'قوة', journey: 'رحلة' } : null },
    journey: [
      stage('profile', 'الملف الشخصي', 'admission', s.profileDone ? 'done' : 'active', [{ id: 'i1', code: 'P-INFO', kind: 'system', title_ar: 'بيانات الملف', required: true, status: s.profileDone ? 'done' : 'pending' }]),
      stage('assessment', 'تحديد المستوى', 'admission', s.assessed ? 'done' : s.profileDone ? 'active' : 'locked', [{ id: 'i2', code: 'A-DONE', kind: 'system', title_ar: 'إرسال القياس', required: true, status: s.assessed ? 'done' : 'pending' }]),
      stage('training', 'التدريب', 'qualification', s.assessed ? 'active' : 'locked', [{ id: 'r1', code: 'T-HB', kind: 'reading', title_ar: 'قراءة كتيبك', required: true, status: 'pending' }]),
    ],
    milestones: s.assessed ? [{ id: 'm1', title_ar: 'تسمية المبادرة', due_on: '2026-12-01', status: 'on_time', days: 12 }] : [],
    milestone_summary: { done: 0, total: 1 },
    continuous: s.assessed ? { index: 62, trend: 'up', components: [], events: [] } : null,
    progress: s.assessed ? 30 : 5, passkeys: 1, prompt_passkey: false,
  });
  const reply = (b) => {
    switch (b.action) {
      case 'me': return me();
      case 'demo.fill-profile': s.profileDone = true; return me();
      case 'demo.fill-assessment': s.assessed = true; return me();
      case 'peer.list': return { success: true, items: s.peers, teams: { support: 'الدعم' }, supervision: 'peers_expert', advisor: 'م. عمر', my_team: 'support' };
      case 'peer.ask': s.peers.push({ id: 'pr1', text: b.text, source: 'free', status: 'open', created_at: '2026-11-05T09:00:00Z', answers: [], mine: true, author: 'مشارك العرض' }); return { success: true, id: 'pr1' };
      case 'lab.list': return { success: true, items: [], points: 0 };
      case 'certificate': return { success: true, certificate: null };
      case 'profile.org-visibility': return { success: true, list: false, scores: false, share_consented: false };
      case 'passkey.list': return { success: true, items: [] };
      case 'logout': return { success: true };
      default: return { success: false, message: `لا محاكاة لـ${b.action}` };
    }
  };
  return { reply, s };
}

test('الجولة الحيّة: ثماني عشرة خطوة على شاشات حقيقية بإضاءة العناصر', async ({ page }) => {
  const srv = server();
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await page.goto(`${APP}#demo=${TOKEN}`);

  const tour = page.getByRole('region', { name: 'الجولة الحيّة' });
  await expect(tour).toBeVisible();
  await expect(tour.getByText('الخطوة 1 من 18')).toBeVisible();
  await expect(tour.getByRole('heading', { name: 'الترحيب' })).toBeVisible();
  await tour.getByRole('button', { name: 'التالي' }).click();

  // 2: الدخول بحساب العرض من زر الجولة، والأبواب مضاءة
  await expect(tour.getByRole('heading', { name: 'أبواب الدخول' })).toBeVisible();
  await expect(page.locator('.tour-spot')).toBeVisible();
  await tour.getByRole('button', { name: 'ادخل بحساب العرض' }).click();

  // 3: الملف يُملأ بضغطة
  await expect(tour.getByRole('heading', { name: 'الملف الشخصي' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /عرّفنا بك/ })).toBeVisible();
  await tour.getByRole('button', { name: 'املأ الملف وأكمل' }).click();

  // 4: القياس يُرسل بضغطة
  await expect(tour.getByRole('heading', { name: 'القياس المبدئي' })).toBeVisible();
  await tour.getByRole('button', { name: 'أجب وأرسل القياس' }).click();

  // 5 إلى 9: الرحلة، وكل خطوة تضيء عنصرها
  for (const [title, anchor] of [['النتيجة والمسار', 'journey-hero'], ['الرحلة', 'stages'], ['الخطوة التالية وقائمة التحقق', 'next-step'], ['المعالم والمواعيد', 'milestones'], ['التقييم المستمر', 'continuous']]) {
    await expect(tour.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator(`[data-tour="${anchor}"]`).first()).toBeVisible();
    await expect(page.locator('.tour-spot')).toBeVisible();
    await tour.getByRole('button', { name: 'التالي' }).click();
  }

  // 10 إلى 12 تنقل إلى الكتيب والمبادرة والقاعة (بلا محاكاة لمحتواها هنا)؛ تُتجاوز بقائمة الانتقال
  await expect(tour.getByRole('heading', { name: 'كتيب القائد' })).toBeVisible();
  await tour.getByLabel('انتقل إلى خطوة').selectOption('12');

  // 13: طلب أقران تجريبي يظهر في البطاقة
  await expect(tour.getByRole('heading', { name: 'طلبات الأقران' })).toBeVisible();
  await expect(page.locator('[data-tour="peer"]')).toBeVisible();
  await tour.getByRole('button', { name: 'اطرح سؤالًا تجريبيًا' }).click();
  await expect(page.locator('[data-tour="peer"]')).toContainText('ما الفرق العملي بين معلم القيمة ومعلم الإنجاز');

  // 14: الأثر يضيء تبويبه المقفل
  await expect(tour.getByRole('heading', { name: 'الأثر' })).toBeVisible();
  await expect(page.locator('[data-tour="nav-impact"]').first()).toBeVisible();
  await tour.getByRole('button', { name: 'التالي' }).click();
  await expect(tour.getByRole('heading', { name: 'التقييم الختامي والشهادة' })).toBeVisible();
  await tour.getByRole('button', { name: 'التالي' }).click();

  // 16: الملف والأمان
  await expect(tour.getByRole('heading', { name: 'الملف والأمان' })).toBeVisible();
  await expect(page.locator('[data-tour="security"]')).toBeVisible();
  await tour.getByRole('button', { name: 'التالي' }).click();

  // 17: البوابتان روابط من اللوحة، ثم 18 الختام ثم من البداية
  await expect(tour.getByRole('heading', { name: 'بوابتا الجهة والخبير' })).toBeVisible();
  await expect(tour.getByRole('link', { name: 'لوحة الجهة' })).toHaveAttribute('href', '/org');
  await page.keyboard.press('ArrowLeft');
  await expect(tour.getByRole('heading', { name: 'الختام' })).toBeVisible();
  await expect(tour.getByText('الخطوة 18 من 18')).toBeVisible();
  await tour.getByRole('button', { name: 'وضع المقدِّم' }).click();
  await expect(page.locator('.tour.presenter')).toBeVisible();
  await tour.getByRole('button', { name: 'من البداية' }).click();
  await expect(tour.getByText('الخطوة 1 من 18')).toBeVisible();
});
