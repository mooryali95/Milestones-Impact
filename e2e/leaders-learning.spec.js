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

