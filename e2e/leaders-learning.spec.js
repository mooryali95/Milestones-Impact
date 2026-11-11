// تعلّم المشارك (تدقيق الجاهزية 2026-11-11): القاعة الحية، والكتيب، والحضور، والمختبر. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';

async function signedIn(page, extra) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = await extra(b, srv);
    if (r === 'abort') return route.abort();
    return route.fulfill({ json: r ?? srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  return calls;
}

// ── القاعة: إجابة يرفضها الخادم لا تبقى كأنها حُفظت، وملاحظة المشارك تعود إليه فلا تُمحى بتعديل لاحق ──
function hall(me) {
  const people = ['p5', 'p6', 'p7'].map((id, i) => ({ id, name: ['سارة', 'خالد', 'نورة'][i], team: 'guide', table: 5, persona: false, leader: false, joined: true, present: true, hand: false,
    answered: id === 'p7', choice: null, confidence: null, stances: [], points: null, ...(id === 'p7' ? me : {}) }));
  return {
    success: true, me: 'p7', inside: true, cohort: { id: 'c1', name: 'دفعة نوفمبر 2026' }, topic: { id: 't1', title_ar: 'الأثر قبل المخرجات' }, revealed: false, answered: 1, total: 3,
    session: { id: 's1', mode: 'live', stage: 'round', round: 3, version: 5, split_method: 'mixed', ends_at: null },
    sentence: { id: 'k3', sort: 3, question: 'why', text_ar: 'المشروع الذي سلّم مخرجاته في موعدها مشروع ناجح بالضرورة.', tasks: {} },
    sentences: [{ id: 'k1', sort: 1, question: 'why' }, { id: 'k2', sort: 2, question: 'why' }, { id: 'k3', sort: 3, question: 'why' }],
    people, tables: [{ no: 5, team: 'guide', count: 3 }], distribution: null,
    teams: { support: { count: 0, present: 0 }, lead: { count: 0, present: 0 }, guide: { count: 3, present: 3 }, eval: { count: 0, present: 0 } },
  };
}
async function openHall(page, me, onAnswer) {
  const calls = await signedIn(page, (b) => (b.action === 'katon.answer' ? onAnswer(b) : b.action === 'hall.state' ? hall(me) : null));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-hall"]').locator('visible=true').first().click();
  return calls;
}

test('القاعة: وسم رفضه الخادم يعود إلى ما استُلم، وتُعاد قراءة القاعة', async ({ page }) => {
  const calls = await openHall(page, { choice: 'false', confidence: 2, stances: [] },
    () => ({ success: false, code: 'not_current', message: 'أجب عن الجملة المعروضة الآن في القاعة' }));
  const ask = page.getByRole('button', { name: 'لدي سؤال' });
  await expect(ask).toHaveAttribute('aria-pressed', 'false');
  await ask.click();
  await expect(page.getByText('أجب عن الجملة المعروضة الآن في القاعة')).toBeVisible();
  await expect(ask).toHaveAttribute('aria-pressed', 'false');
  const at = calls.findIndex((c) => c.action === 'katon.answer');
  await expect.poll(() => calls.slice(at + 1).some((c) => c.action === 'hall.state' && c.since === 0)).toBe(true);
  // بلا مؤقت لا يُقال «حتى ينتهي الوقت»
  await expect(page.locator('.hall-receipt')).toContainText('تستطيع تعديلها حتى يُكشف المفتاح');
});

test('القاعة الحية: يعرف المشارك أن إجاباته تسجّل حضوره، ونسبتها من مصدرها', async ({ page }) => {
  await openHall(page, { choice: 'false', confidence: 2, stances: [] }, () => ({ success: true }));
  await expect(page.getByText('يُسجَّل حضورك في اليوم التدريبي حين تجيب عن 60% من الجولات على الأقل.')).toBeVisible();
});

test('القاعة: ملاحظة المشارك تبقى في حقلها وتُرسل مع تعديل الثقة، فلا تُمحى على الخادم', async ({ page }) => {
  const note = 'كيف نقيس الأثر في جهة لا تجمع بيانات خط الأساس؟';
  const calls = await openHall(page, { choice: 'false', confidence: 2, stances: ['question'], note }, () => ({ success: true }));
  const field = page.getByRole('textbox', { name: /اكتب سؤالك أو فكرتك/ });
  await expect(field).toHaveValue(note);
  await page.getByRole('radio', { name: /متيقن/ }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'katon.answer').length).toBe(1);
  expect(calls.find((c) => c.action === 'katon.answer')).toMatchObject({ sentence_id: 'k3', verdict: 'false', confidence: 3, stances: ['question'], note });
  await expect(field).toHaveValue(note);
  await expect(page.getByRole('button', { name: 'ارفعها طلب توجيه لفريقك' })).toBeVisible();
});

// ── الحضور ──
test('الحضور: الجلسة الجارية «جارية الآن» لا «قادمة»، وطريقة التسجيل الآلية مذكورة', async ({ page }) => {
  const at = (h) => new Date(Date.now() + h * 36e5).toISOString();
  await signedIn(page, (b, srv) => {
    if (b.action !== 'me') return null;
    const r = srv.reply(b);
    r.journey.find((st) => st.key === 'training').items.push({ id: 'w1', code: 'T-DAYS', kind: 'workshop', title_ar: 'الأيام التدريبية', required: true, status: 'pending',
      activity: { type: 'workshop', done: false, count: 0, total: 2, verify: 'auto', sessions: [
        { id: 's1', title: 'اليوم الأول', mode: 'in_person', location: 'قاعة التدريب', starts_at: at(-2), ends_at: at(3), attended: false, open: true, can_join: false },
        { id: 's2', title: 'اليوم الثاني', mode: 'in_person', location: 'قاعة التدريب', starts_at: at(22), ends_at: at(27), attended: false, open: false, can_join: false },
      ] } });
    return r;
  });
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.goto(APP);
  await expect(page.locator('.act-list li', { hasText: 'اليوم الأول' })).toContainText('جارية الآن');
  await expect(page.locator('.act-list li', { hasText: 'اليوم الثاني' })).toContainText('قادمة');
  await expect(page.getByText('يُحتسب حضورك تلقائيًا بانتهاء الجلسة.')).toBeVisible();
});

// ── المختبر ──
test('المختبر: لمس عنصر موضوع والتحديد على غيره يضع المحدد في خانته، فيجتمع عنصران في خانة', async ({ page }) => {
  const item = { id: 'L1', kind: 'tool', dimension: 'leadership', title: 'خريطة أصحاب المصلحة', summary: 'صنّف أصحاب المصلحة بالتأثير والاهتمام', minutes: 10, points: 20, min_level: 'beginner', chapter_key: 'ch9', progress: { best: null, open: false } };
  const step = { type: 'plot', title_ar: 'خريطة القوة والاهتمام', prompt_ar: 'ضع كل طرف في خانته', size: 2, x_ar: ['اهتمام منخفض', 'اهتمام مرتفع'], y_ar: ['تأثير منخفض', 'تأثير مرتفع'],
    items: [{ id: 'a', label: 'رؤساء أقسام العيادات' }, { id: 'b', label: 'مدير تقنية المعلومات' }, { id: 'c', label: 'المرضى' }] };
  await signedIn(page, (b) => (b.action === 'lab.list' ? { success: true, items: [item], points: { total: 0, rank: { title: 'مستكشف', next: null } } }
    : b.action === 'lab.start' ? { success: true, item, spec: { story_ar: 'مستشفى ينتقل إلى نظام مواعيد جديد.', steps: [step], meters: [] }, attempt: { id: 'att1', meters: null, path: [], results: {}, current: 0 } } : null));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-lab"]').locator('visible=true').first().click();
  await page.getByRole('button', { name: /خريطة أصحاب المصلحة/ }).click();
  await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
  const tray = page.locator('.lab-tray');
  const cell = page.getByRole('button', { name: 'اهتمام مرتفع، تأثير مرتفع', exact: true });
  await tray.getByRole('button', { name: 'مدير تقنية المعلومات' }).click();
  await cell.click();
  await expect(cell.locator('.lab-token')).toHaveCount(1);
  // العنصر الموضوع يغطي أغلب الخانة: لمسه والتحديد على غيره يضع المحدد معه
  await tray.getByRole('button', { name: 'رؤساء أقسام العيادات' }).click();
  await cell.getByRole('button', { name: 'مدير تقنية المعلومات' }).click();
  await expect(cell.locator('.lab-token')).toHaveCount(2);
  await expect(tray.locator('.lab-token')).toHaveCount(1);
  await expect(page.locator('.lab-hint')).toHaveCount(0);
  // وبلا تحديد: لمسه يحدده لتحريكه، ولمسه ثانية يلغي التحديد
  await cell.getByRole('button', { name: 'مدير تقنية المعلومات' }).click();
  await expect(page.locator('.lab-hint')).toContainText('مدير تقنية المعلومات');
  await cell.getByRole('button', { name: 'مدير تقنية المعلومات' }).click();
  await expect(page.locator('.lab-hint')).toHaveCount(0);
});
