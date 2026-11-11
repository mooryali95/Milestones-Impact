// «إجابات القياس» في ملف المشارك: لوحة جانبية للمدير ذي الكتابة (تصور 2026-11-11، المرحلة 2). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { answersReply } from './answers-fixture.js';

const BASE = 'http://localhost:4303/';
const participant = { id: '11111111-2222-3333-4444-555555555555', full_name: 'سارة الأحمد', email: 's@x.com', status: 'pending_approval', placements: [], created_at: '2026-10-01' };
const ev = (level, composite, extra = {}) => ({ level, composite, borderline: false, flags: [], reason: `المؤشر ${composite} من 100`, items_to_flip: 2, ...extra });
const person = {
  success: true, participant, progress: 20, history: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [],
  placement_model: { min_intermediate: 55, min_advanced: 80, borderline: 8 },
  profile: { approved: false, dimensions: [{ dimension: 'milestone', level: 'intermediate' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'advanced' }] },
  assessments: [{ id: 'a1', status: 'submitted', submitted_at: '2026-11-02T10:34:00Z', assessment_results: [
    { dimension: 'milestone', knowledge_pct: null, skill_pct: 100, behavior_pct: 87.5, evaluation: ev('intermediate', 62) },
    { dimension: 'impact', knowledge_pct: 41.67, skill_pct: null, behavior_pct: 50, evaluation: ev('beginner', 48, { borderline: true }) },
    { dimension: 'leadership', knowledge_pct: 90, skill_pct: 85, behavior_pct: 70, evaluation: ev('advanced', 84, { items_to_flip: null }) },
  ] }],
};

async function open(page, { role = 'admin', hash = `#/leaders/participants/${participant.id}` } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [participant] },
      'admin.participant': person,
      'admin.assessment-answers': answersReply(b.assessment_id === 'a2' ? { id: 'a2', kind: 'post' } : {}),
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(([r, h]) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() }));
    window.location.hash = h;
  }, [role, hash]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'المستوى في الأبعاد الثلاثة' })).toBeVisible();
  return calls;
}
const dialog = (page) => page.getByRole('dialog', { name: /إجابات القياس/ });

test('إجابات القياس (الحاسوب): تُحمَّل عند الطلب، الملخص ثم الأقسام، المختار والمفتاح، المرشحات وCSV وEsc', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await open(page);
  // لا تُحمَّل مع الملف: الطلب (ومعه سطر السجل في الخادم) عند الفتح وحده
  expect(calls.some((c) => c.action === 'admin.assessment-answers')).toBe(false);
  const opener = page.locator('section.lc').getByRole('button', { name: 'إجابات القياس' });
  await opener.click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d).toBeFocused();
  expect(calls.filter((c) => c.action === 'admin.assessment-answers')).toEqual([{ action: 'admin.assessment-answers', token: 't', participant_id: participant.id }]);
  expect(page.url()).toContain('answers=all');
  // الرأس: القياس والمدة التقديرية وحدودها
  await expect(d.getByLabel('القياس')).toHaveValue('a1');
  await expect(d).toContainText('الأزمنة تقديرية من وقت حفظ كل إجابة، ولا تدخل في احتساب المستوى.');
  await expect(d).toContainText('من فتح القياس إلى إرساله 34د');
  // ملخص الأقسام بنسبها من assessment_results
  await expect(d.locator('.ap-sum tbody tr')).toHaveCount(4);
  await expect(d.locator('.ap-sum tbody tr').nth(3)).toContainText('Impact · المعرفة');
  await expect(d.locator('.ap-sum tbody tr').nth(3)).toContainText('42%');
  // ما يستحق الانتباه مفتوح، والهادئ مطوي
  await expect(d.getByRole('button', { name: /Impact · المعرفة/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(d.getByRole('button', { name: /Milestone · المواقف/ })).toHaveAttribute('aria-expanded', 'false');
  // السؤال: المختار والمفتاح بعلامتين مختلفتين، ودرجة كل خيار، والزمن ⚡
  const k01 = d.locator('.ap-item', { hasText: 'IM-K01' });
  await expect(k01.locator('li.chosen')).toContainText('نسبة المشاركين الراضين عن جودة الورش المقدمة');
  await expect(k01.locator('li.chosen')).toContainText('اختاره');
  await expect(k01.locator('li.best')).toContainText('نسبة المنشآت المستمرة بعد عامين من الدعم');
  await expect(k01.locator('li.best')).toContainText('مفتاح الدرجة القصوى');
  await expect(k01.locator('.ap-opts li')).toHaveCount(4);
  await expect(k01).toContainText('◐ جزئية');
  await expect(k01).toContainText('⚡ سريع');
  await expect(k01.locator('.ap-time')).toContainText('4ث');
  // أول سؤال في القسم بعد الاستراحة: «—» مع سببه
  await expect(d.locator('.ap-item', { hasText: 'IM-B01' }).locator('.ap-time')).toContainText('أول سؤال في القسم');
  await expect(d.locator('.ap-item', { hasText: 'IM-B01' }).locator('.ap-na.chosen')).toBeVisible();
  // المرشحات
  await d.getByRole('button', { name: /⚡ سريع/ }).click();
  await expect(d.getByRole('button', { name: /⚡ سريع/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(d.locator('.ap-item:visible')).toHaveCount(1);
  await d.getByRole('button', { name: /^الكل/ }).click();
  // CSV للمدير
  const [file] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: 'CSV' }).click()]);
  expect(file.suggestedFilename()).toBe('answers-11111111-baseline.csv');
  // Esc يغلق، والتركيز يعود إلى ما فتحها، والعنوان يُنظَّف
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(page.url()).not.toContain('answers=');
});

test('إجابات القياس بلوحة المفاتيح: Tab يدور داخل اللوحة، واختيار القياس البعدي يطلبه بمعرّفه', async ({ page }) => {
  const calls = await open(page);
  await page.locator('section.lc').getByRole('button', { name: 'إجابات القياس' }).focus();
  await page.keyboard.press('Enter');
  const d = dialog(page);
  await expect(d).toBeFocused();
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await d.getByLabel('القياس').selectOption('a2');
  await expect.poll(() => calls.filter((c) => c.action === 'admin.assessment-answers').at(-1)).toMatchObject({ participant_id: participant.id, assessment_id: 'a2' });
  await expect(d.getByLabel('القياس')).toHaveValue('a2');
});

test('«عرض إجابات هذا البُعد» يفتحها على البُعد، والعنوان يفتحها مباشرة', async ({ page }) => {
  await open(page);
  // صف Impact الحدّي مفتوح تلقائيًا، ومنه الرابط
  await page.locator('#lc-det-impact').getByRole('button', { name: 'عرض إجابات هذا البُعد ←' }).click();
  await expect(dialog(page).getByLabel('البُعد')).toHaveValue('impact');
  await expect(dialog(page).getByRole('button', { name: /Milestone ·/ })).toHaveCount(0);
  expect(page.url()).toContain('answers=impact');
  // رابط منسوخ يفتح اللوحة على البُعد نفسه
  await page.reload();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel('البُعد')).toHaveValue('impact');
});

test('إجابات القياس (الجوال 390): ملء الشاشة، والمختار والمفتاح فقط حتى «عرض كل الخيارات»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('section.lc').getByRole('button', { name: 'إجابات القياس' }).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  const box = await d.boundingBox();
  expect(Math.round(box.width)).toBe(390);
  const k01 = d.locator('.ap-item', { hasText: 'IM-K01' });
  await expect(k01.locator('.ap-opts li:visible')).toHaveCount(2);
  await k01.getByRole('button', { name: 'عرض كل الخيارات' }).click();
  await expect(k01.locator('.ap-opts li:visible')).toHaveCount(4);
  await expect(k01.getByRole('button', { name: 'المختار والمفتاح فقط' })).toHaveAttribute('aria-expanded', 'true');
  // لا تمرير أفقي داخل اللوحة
  expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await d.getByRole('button', { name: 'إغلاق' }).click();
  await expect(d).toHaveCount(0);
});

test('دور العرض: لا زر لإجابات القياس ولا طلب، ولا تفتحها الروابط', async ({ page }) => {
  const calls = await open(page, { role: 'viewer', hash: `#/leaders/participants/${participant.id}?answers=impact` });
  await expect(page.locator('section.lc')).toContainText('إجابات القياس للمدير وحده');
  await expect(page.locator('section.lc').getByRole('button', { name: 'إجابات القياس' })).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  expect(calls.some((c) => c.action === 'admin.assessment-answers')).toBe(false);
});
