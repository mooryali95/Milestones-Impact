// اختيار الخبير: المشارك المعتمد يرى ثلاثة مرشحين بلا سعر ولا ساعات، يختار أحدهم،
// فتتحول البطاقة إلى حالة الطلب. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';

test('المشارك يختار خبيره من ثلاثة مرشحين', async ({ page }) => {
  const s = { chosen: null };
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', years_experience: 8, approved: true, level: 'intermediate', track: { title: 'مسار' } },
    journey: ['profile', 'assessment'].map((key) => ({ key, title_ar: key, phase: 'admission', status: 'done', items: [], done: 0, total: 0 })), progress: 30, passkeys: 1, prompt_passkey: false,
  };
  const cards = [
    { id: 'e1', full_name: 'خالد المطيري', title: 'مدرب تنفيذي', bio: 'عشرون عامًا في قيادة المشاريع', years: 20, sectors: [], languages: [], rating: { avg: 4.7, count: 9 } },
    { id: 'e2', full_name: 'نورة السالم', title: 'مدربة قيادة', bio: null, years: 8, sectors: [], languages: [], rating: null },
    { id: 'e3', full_name: 'فهد العتيبي', title: null, bio: null, years: null, sectors: [], languages: [], rating: null },
  ];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = {
      me,
      'experts.suggest': () => ({
        success: true, role: b.role, role_ar: 'كوتش',
        roles: [{ key: 'coach', title: 'كوتش', hint: 'جلسات التوجيه الفردية' }, { key: 'specialist', title: 'خبير موضوعي', hint: 'ورش' }],
        contexts: { program: 'خلال البرنامج', capstone: 'أثناء بناء المبادرة', tracking: 'أثناء تنفيذ المبادرة' },
        dimensions: { milestone: 'إدارة المشروعات', impact: 'الأثر', leadership: 'تمكين القائد' },
        requests: s.chosen ? [{ id: 'r1', role: 'coach', role_ar: 'كوتش', status: 'offered', status_ar: 'معروض على خبير', expert: s.chosen, note: s.note }] : [],
        candidates: s.chosen && b.role === 'coach' ? [] : cards,
      }),
      'experts.choose': () => { const e = cards.find((c) => c.id === b.expert_id); s.chosen = e?.full_name; s.note = b.note; s.sent = b; return { success: true, status: 'offered', expert: s.chosen }; },
    }[b.action];
    await route.fulfill({ json: typeof r === 'function' ? r() : r || { success: true, items: [] } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-choose-00000000000000000000'); });
  await page.goto(APP);
  const card = page.locator('section', { has: page.locator('#cx-h') });
  await card.getByRole('button', { name: 'اطلب الآن' }).click();
  await expect(card.getByText('خالد المطيري')).toBeVisible();
  await expect(card.getByRole('button', { name: 'اختره' }).first()).toBeDisabled();
  await card.getByLabel(/ما الذي تحتاجه/).fill('مراجعة سجل المخاطر قبل عرضه على الراعي');
  await card.getByLabel('متى').selectOption('tracking');
  // غياب التقييم المعلن لا يُقرأ «خبيرًا جديدًا» (تصور 360، المرحلة 0)، والمشارك لا يرى نجوم الخبير
  // ولو وصلت من خادم قديم (المرحلة 0ب): التقييم داخل الترتيب وحده، وتشرحه «كيف نرشّح؟»
  await expect(card).not.toContainText('جديد');
  await expect(card).not.toContainText('★');
  await expect(card).not.toContainText('4.7');
  await card.getByText('كيف نرشّح؟').click();
  await expect(card).toContainText('لا نعرض تقييم الخبير');
  await expect(card).not.toContainText(/ريال|ساعة/);
  await card.getByRole('button', { name: 'اختره' }).first().click();
  await expect(card).toContainText('معروض على خبير');
  await expect(card).toContainText('مراجعة سجل المخاطر');
  expect(s.sent).toMatchObject({ role: 'coach', context: 'tracking', expert_id: 'e1' });
  await expect(card).toContainText('خالد المطيري');
});
