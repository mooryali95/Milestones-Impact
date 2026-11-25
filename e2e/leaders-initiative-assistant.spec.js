// «اسأل المساعد» من المبادرة: المساعد نفسه ببوابته وحدوده ومحادثته، يُفتح من الحقل بسياق اسمه ولا تُرسل المسودة.
// الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const MODEL = { id: 'm-wbs', key: 'wbs', dimension: 'milestone', title_ar: 'هيكل تجزئة العمل', points: 40, min_level: 'beginner', level: 'intermediate',
  fields: [{ key: 'goal', type: 'textarea', label: 'الهدف الأعلى', required: true }, { key: 'owner', type: 'text', label: 'مالك الحزمة', required: true }] };
const DRAFT = 'نص المسودة السري لا يُرسل';

function server({ gate = { ok: true, reason: null }, demo = false, ai = true } = {}) {
  const calls = [];
  const st = { messages: [{ id: 1, role: 'user', body: 'سؤال من التوجيه والإرشاد' }, { id: 2, role: 'assistant', body: 'رد سابق', verdict: 'answered', sources: ['إعادة تعريف المعلم'] }], left: { day: 8, month: 30 } };
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', is_demo: demo },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']].map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })),
    progress: 60, passkeys: 1, prompt_passkey: false, milestones: [], notices: [], nudge: null, guidance: { ready: true, signals: [], ai },
  };
  const capstone = {
    success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate', track: { title: 'مسار' },
    capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
    sections: [{ id: 'm-wbs', key: 'wbs', title: 'هيكل تجزئة العمل', icon: '◆', dimension: 'milestone', complete: false, missing: 2, status: 'draft' }],
    checks: [], readiness: 40, ready_min: 80, card: { state: 'approved' }, can_submit: false, blocker: null,
    rubric: [{ key: 'k', title: 'الاتساق', anchors: ['1', '2', '3', '4'] }],
  };
  const reply = (b) => {
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return capstone;
      // بطاقة المتابعة لحساب العرض ليست موضوع هذا الملف
      case 'tracking.get': return { success: false, message: 'غير متاح' };
      case 'models.get': return { success: true, model: MODEL, submission: { status: 'draft', answers: { goal: DRAFT } }, initiative: 'رقمنة خدمات المستفيدين', sector: null, imports: {}, capstone: { status: 'draft', locked: false } };
      case 'guide.state': return { success: true, gate: { ...gate, message: gate.ok ? null : gate.message }, left: st.left, retention_days: 90, messages: st.messages };
      case 'guide.ask':
        st.left = { day: st.left.day - 1, month: st.left.month - 1 };
        st.messages = [...st.messages, { id: 3, role: 'user', body: b.text }, { id: 4, role: 'assistant', body: 'اكتب الهدف نتيجة تقاس لا نشاطًا.', verdict: 'answered', sources: ['الإدارة القائمة على النتائج'] }];
        return { success: true, reply: { id: 4, text: 'اكتب الهدف نتيجة تقاس لا نشاطًا.', verdict: 'answered', sources: ['الإدارة القائمة على النتائج'] }, left: st.left };
      case 'experts.suggest': return { success: true, role: 'coach', roles: [{ key: 'coach', title: 'موجّه', hint: '' }], contexts: {}, dimensions: {}, requests: [], candidates: [] };
      case 'peer.list': return { success: true, supervision: 'peers_expert', supervision_ar: '', team: 'guide', team_ar: '', teams: {}, advisor: '', mine_open: 0, items: [] };
      default: return { success: true };
    }
  };
  return { calls, route: async (r) => { const b = JSON.parse(r.request().postData() || '{}'); calls.push(b); await r.fulfill({ json: reply(b) }); } };
}

async function openChapter(page, s, width) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-ia-0000000000000000000000'); });
  // لقطات المراجعة تُؤخذ في شبكة معزولة يراها المتصفح «دون اتصال»: لا أثر لهذا على الفحص نفسه
  if (process.env.IA_SHOTS) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true }));
  await page.goto(APP);
  if (process.env.IA_SHOTS) {
    await page.getByRole('region', { name: 'التوجيه والإرشاد' }).first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: `${process.env.IA_SHOTS}/guidance-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'مبادرتي' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'رقمنة خدمات المستفيدين' })).toBeVisible();
  if (process.env.IA_SHOTS) await page.screenshot({ path: `${process.env.IA_SHOTS}/initiative-${width}.png`, fullPage: true });
  // على الجوال خط الوثيقة شريط علوي يفتح لوحة منزلقة
  if (width < 900) await page.locator('.sp-bar').click();
  await page.locator('.sp-node').filter({ hasText: 'هيكل تجزئة العمل' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'هيكل تجزئة العمل' }).first()).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`${width}: من الحقل بسياق اسمه، والحدود والمحادثة نفسها، ولا تُرسل المسودة`, async ({ page }) => {
    const s = server();
    await openChapter(page, s, width);
    const btn = page.getByRole('button', { name: 'اسأل المساعد عن حقل الهدف الأعلى' });
    await expect(btn).toBeVisible();
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await btn.click();
    const dlg = page.getByRole('dialog', { name: 'اسأل المساعد' });
    const box = dlg.getByLabel('سؤالك');
    await expect(box).toHaveValue('في فصل «هيكل تجزئة العمل»، حقل «الهدف الأعلى»: ');
    await expect(box).toBeFocused();
    await expect(dlg).toContainText('المساعد يرشدك ولا يكتب مبادرتك عنك');
    await expect(dlg).toContainText('90 يومًا');
    // المحادثة نفسها التي في «التوجيه والإرشاد»
    await expect(dlg).toContainText('سؤال من التوجيه والإرشاد');
    await expect(dlg).toContainText('بقي لك 8 اليوم و30 هذا الشهر');
    await box.pressSequentially('كيف أصيغه؟');
    await dlg.getByRole('button', { name: 'اسأل', exact: true }).click();
    await expect(dlg).toContainText('اكتب الهدف نتيجة تقاس');
    await expect(dlg).toContainText('«الإدارة القائمة على النتائج»');
    await expect(dlg).toContainText('بقي لك 7 اليوم و29 هذا الشهر');
    const ask = s.calls.find((c) => c.action === 'guide.ask');
    expect(ask).toMatchObject({ text: 'في فصل «هيكل تجزئة العمل»، حقل «الهدف الأعلى»: كيف أصيغه؟', context: 'capstone' });
    expect(JSON.stringify(s.calls.filter((c) => c.action.startsWith('guide.')))).not.toContain(DRAFT);
    if (process.env.IA_SHOTS) await page.screenshot({ path: `${process.env.IA_SHOTS}/panel-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(btn).toBeFocused();
    if (process.env.IA_SHOTS) { await btn.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.IA_SHOTS}/chapter-${width}.png` }); }
  });
}

test('البوابة مغلقة بسبب يقدر عليه المشارك (consent): سطر واحد بالسبب ولا زر', async ({ page }) => {
  await openChapter(page, server({ gate: { ok: false, reason: 'consent', message: 'وافق على سياسة الخصوصية المحدّثة ليعمل المساعد الذكي.' } }), 390);
  await expect(page.locator('[data-guide-closed="consent"]')).toHaveCount(1);
  await expect(page.locator('[data-guide-closed="consent"]')).toContainText('وافق على سياسة الخصوصية المحدّثة');
  await expect(page.getByRole('button', { name: /اسأل المساعد عن حقل/ })).toHaveCount(0);
  if (process.env.IA_SHOTS) { await page.locator('[data-guide-closed="consent"]').evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 200)); await page.screenshot({ path: `${process.env.IA_SHOTS}/closed-390.png` }); }
});

for (const reason of ['policy', 'off', 'eval', 'pilot', 'org', 'key']) {
  test(`البوابة مغلقة لسبب عام (${reason}): لا زر ولا سطر`, async ({ page }) => {
    const s = server({ gate: { ok: false, reason, message: 'x' } });
    await openChapter(page, s, 1440);
    await expect.poll(() => s.calls.some((c) => c.action === 'guide.state')).toBe(true);
    await expect(page.getByRole('button', { name: /اسأل المساعد عن حقل/ })).toHaveCount(0);
    await expect(page.locator('[data-guide-closed]')).toHaveCount(0);
  });
}

test('حساب العرض: المساعد مغلق في المبادرة', async ({ page }) => {
  const s = server({ demo: true });
  await openChapter(page, s, 1440);
  await expect(page.getByRole('button', { name: /اسأل المساعد عن حقل/ })).toHaveCount(0);
  expect(s.calls.some((c) => c.action === 'guide.ask')).toBe(false);
});

test('المساعد مغلق عامة (ai=false): لا guide.state من المبادرة', async ({ page }) => {
  const s = server({ ai: false });
  await openChapter(page, s, 1440);
  await expect(page.getByRole('button', { name: /اسأل المساعد عن حقل/ })).toHaveCount(0);
  expect(s.calls.some((c) => c.action === 'guide.state')).toBe(false);
});
