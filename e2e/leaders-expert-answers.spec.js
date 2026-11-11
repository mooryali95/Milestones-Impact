// «إجابات القياس» من بوابة الخبير: لمستشار الدفعة فيمن يشرف عليهم، بلا تصدير (قرار المالك 2026-11-11، المرحلة 2).
// الخلفية مُحاكاة، ورد الإجابات من reviewAnswers نفسها.
import { test, expect } from '@playwright/test';
import { answersReply } from './answers-fixture.js';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);

function server(scope) {
  const calls = [];
  const file = {
    success: true, scope,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', job_title: 'مديرة مشاريع', organization_name: 'جهة الاختبار', status: 'enrolled' },
    profile: { approved: true, dimensions: [{ dimension: 'milestone', level: 'intermediate', approved: true }, { dimension: 'impact', level: 'beginner', approved: true }] },
    journey: [], progress: 40, milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, group: null, continuous: null, program: { id: 'pr1' },
    assessments: [{ id: 'a1', kind: 'baseline', submitted_at: '2026-11-02T10:34:00Z', results: [] }],
    models: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], sessions: [], expert_requests: [],
    peer: { requests: [], pending_answers: [], given: [] }, final: null, needs: [], cohort: { id: 'c1', name: 'دفعة نوفمبر' },
  };
  const reply = (b) => {
    switch (b.action) {
      case 'xp.dashboard': return { success: true, expert: { full_name: 'د. سارة الحربي', roles: ['advisor'] }, stats: { hours: 0, participants: 1, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر' }] };
      case 'xp.participants': return { success: true, items: [{ id: 'p1', name: 'سارة الأحمد', first: 'سارة', status: 'enrolled', cohort: 'دفعة نوفمبر', advisor: scope === 'advisor', level: 'intermediate', level_ar: 'متوسط', approved: true, progress: 40, late: 0, continuous: null, needs: 0 }], cohorts: [] };
      case 'xp.participant': return file;
      case 'xp.assessment-answers': return answersReply();
      default: return { success: false, message: `غير متوقع: ${b.action}` };
    }
  };
  return { calls, route: async (route) => { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b); await route.fulfill({ json: reply(b) }); } };
}

async function openFile(page, scope) {
  const s = server(scope);
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.goto(PORTAL);
  await page.getByRole('region', { name: /مشاركوك/ }).getByRole('button', { name: 'افتح الملف' }).click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  return s;
}

for (const vp of [{ name: 'الحاسوب', size: { width: 1200, height: 900 } }, { name: 'الجوال 390', size: { width: 390, height: 844 } }]) {
  test(`مستشار الدفعة يرى إجابات من يشرف عليهم (${vp.name}): المختار والمفتاح، بلا CSV، وEsc يغلق ويعيد التركيز`, async ({ page }) => {
    await page.setViewportSize(vp.size);
    const s = await openFile(page, 'advisor');
    const opener = page.getByRole('region', { name: 'من هو' }).getByRole('button', { name: 'إجابات القياس' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const d = page.getByRole('dialog', { name: /إجابات القياس · سارة الأحمد/ });
    await expect(d).toBeVisible();
    await expect(d).toBeFocused();
    await expect.poll(() => s.calls.find((c) => c.action === 'xp.assessment-answers')).toMatchObject({ participant_id: 'p1' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const k01 = d.locator('.ap-item', { hasText: 'IM-K01' });
    await expect(k01.locator('li.chosen')).toContainText('نسبة المشاركين الراضين عن جودة الورش المقدمة');
    await expect(k01.locator('li.best')).toContainText('مفتاح الدرجة القصوى');
    await expect(d.getByRole('button', { name: 'طباعة' })).toBeVisible();
    await expect(d.getByRole('button', { name: 'CSV' })).toHaveCount(0);
    expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    // Tab يدور داخلها
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test('الخبير المسند بطلب خدمة وحده لا يرى إجابات القياس', async ({ page }) => {
  const s = await openFile(page, 'assigned');
  await expect(page.getByRole('button', { name: 'إجابات القياس' })).toHaveCount(0);
  expect(s.calls.some((c) => c.action === 'xp.assessment-answers')).toBe(false);
});
