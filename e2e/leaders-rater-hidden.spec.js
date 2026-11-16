// تقدير المدير والزملاء مؤجل مع تقييم 360 (قرار المالك 2026-11-16): مفتاح 360 مطفأ فلا بند T-360 في التدريب ولا E-360
// ولا E-MGR في التقييم، ولا دعوة المدير قبل البرنامج في الرحلة ولا في «ملفي»، ولا بطاقة دعوة في القياس البعدي ولا ذكرها
// في نصه، وعمودا المدير والمقيّمين في شاشة الأثر بالإدارة بشارة «مخفي عن المستخدمين». ومُظهَرًا يعود كل شيء.
// الخلفية مُحاكاة: بنود الرحلة يحذفها الخادم (journeyDefinition، rater_hide_test.ts) والواجهة تعرض ما يصلها، فلا تُختبر هنا.
// يُختبر هنا ما تقرره الواجهة بإشارات الخادم: دعوة المدير قبل البرنامج (pre_available)، ونص القياس البعدي (المفتاح)،
// وبطاقة الدعوة (invite)، وشارة الإدارة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { featureHiddenFor } from '../supabase/functions/leaders-api/features.js';
import { hideBreaksStage } from '../supabase/functions/leaders-api/logic.js';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const T360 = 'تقدير المدير والزملاء قبل البرنامج';
const E360 = 'تقدير المدير والزملاء بعد البرنامج';
const EMGR = 'إفادة المدير المباشر';
const PRE_INVITE = 'ادعُ مديرك المباشر ليقدّر ممارستك الآن، قبل البرنامج';

// البنود كما في البرنامج القائم، ثم ما يبقى منها بالمفتاح
const ITEMS = {
  training: [
    { id: 'r0', code: 'T-ATTEND', kind: 'attendance', title_ar: 'حضور الأيام التدريبية', required: true, status: 'done', auto: true },
    { id: 'r1', code: 'T-HB', kind: 'reading', title_ar: 'قراءة كتابك الشخصي', required: true, status: 'pending' },
    { id: 'r9', code: 'T-360', kind: 'system', title_ar: T360, required: false, status: 'pending', auto: true },
  ],
  evaluation: [
    { id: 'e1', code: 'E-POST', kind: 'system', title_ar: 'القياس البعدي', required: true, status: 'pending', auto: true },
    { id: 'e2', code: 'E-360', kind: 'system', title_ar: E360, required: true, status: 'pending', auto: true },
    { id: 'e3', code: 'E-MGR', kind: 'check', title_ar: EMGR, required: false, status: 'pending' },
  ],
};
function visible(f360) {
  const stages = Object.keys(ITEMS).map((key, i) => ({ key, title_ar: key, sort: i + 1, active: true, rules: {} }));
  const requirements = Object.entries(ITEMS).flatMap(([stage_key, items]) => items.map((r) => ({ ...r, stage_key, active: true })));
  const { hidden } = featureHiddenFor({ stages, requirements, flags: { f360 }, breaks: hideBreaksStage });
  return (key) => ITEMS[key].filter((r) => !hidden.includes(r.code));
}

async function participant(page, f360, { evaluationActive = false } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true, features: { hall: true, katon: false, f360 } });
  const keep = visible(f360);
  const calls = [];
  const me = () => {
    const m = srv.reply({ action: 'me' });
    if (evaluationActive) {
      // ما قبل التقييم مكتمل، فالتقييم المرحلة الحالية المفتوحة
      const at = m.journey.findIndex((st) => st.key === 'evaluation');
      m.journey.forEach((st, i) => { if (i < at) { st.status = 'done'; st.items = st.items.map((x) => ({ ...x, status: 'done' })); } });
    }
    for (const st of m.journey) {
      if (!ITEMS[st.key]) continue;
      st.items = keep(st.key).map((x) => (evaluationActive && st.key === 'training' ? { ...x, status: 'done' } : x));
      st.total = st.items.length;
      st.done = st.items.filter((x) => x.status === 'done').length;
      if (st.key === 'evaluation' && evaluationActive) st.status = 'active';
    }
    return m;
  };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    // بشكل impact.mine على الخادم: مطفأ لا دعوة ولا قائمة
    const mine = f360 ? { success: true, summary: null, raters: [], limit: 3, pre_available: true, invite: true } : { success: true, summary: null, raters: [], limit: 3, pre_available: false, invite: false };
    const r = { me: me(), 'impact.mine': mine }[b.action];
    await route.fulfill({ json: r || srv.reply(b) });
  });
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 't'.repeat(40));
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
  });
  return calls;
}

test('مطفأ: لا دعوة المدير قبل البرنامج (pre_available:false) ولا طلب دعوة، ولا رفض يظهر', async ({ page }) => {
  const calls = await participant(page, false);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
  await expect(page.getByText('قراءة كتابك الشخصي').first()).toBeVisible();
  await expect.poll(() => calls.includes('impact.mine')).toBe(true);
  await expect(page.getByText(PRE_INVITE)).toHaveCount(0);
  expect(calls).not.toContain('rater.invite');
});

test('مُظهَرًا: دعوة المدير قبل البرنامج كما كانت', async ({ page }) => {
  await participant(page, true);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
  await expect(page.getByText(PRE_INVITE)).toBeVisible();
});

// القياس البعدي قبل إرساله: نص الإرسال يذكر دعوة المدير بمفتاح 360 من me.features وحده
for (const on of [false, true]) {
  test(`القياس البعدي قبل الإرسال ${on ? 'مُظهَرًا: يذكر دعوة المدير' : 'مطفأ: بلا «ادعُ مديرك»'}`, async ({ page }) => {
    const srv = createMockServer();
    Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true, features: { hall: true, katon: false, f360: on } });
    await page.route(/functions\/v1\/leaders-api/, async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      let r = null;
      if (b.action === 'me') {
        r = srv.reply(b);
        const ev = r.journey.find((st) => st.key === 'evaluation');
        Object.assign(ev, { status: 'active', done: 0, total: 1, items: [{ id: 'e1', code: 'E-POST', title_ar: 'القياس البعدي', kind: 'system', auto: true, required: true, status: 'pending' }] });
      }
      // كل الأسئلة مجابة: «تابع» ثم «التالي» يصل إلى صفحة الإرسال
      if (b.action === 'assessment.get') { r = srv.reply(b); r.assessment = { ...r.assessment, kind: 'post' }; r.answers = { q1: 3, q2: 1, q3: 3 }; }
      await route.fulfill({ json: r || srv.reply(b) });
    });
    await page.route(/cloudflareinsights|challenges\.cloudflare/, (rt) => rt.abort());
    await page.addInitScript(() => {
      localStorage.setItem('mi_leaders_session', 't'.repeat(40));
      localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
    });
    await page.goto(APP);
    await page.getByRole('button', { name: 'أثري' }).first().click();
    await page.getByRole('button', { name: /^تابع/ }).click();
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('أرسل إجاباتك لترى ما تغيّر بين بداية رحلتك ونهايتها', { exact: false })).toBeVisible();
    await expect(page.getByText('ادعُ مديرك ليقدّر التغير من موقعه', { exact: false })).toHaveCount(on ? 1 : 0);
  });
}

// شاشة ما تغيّر بعد القياس البعدي: بطاقة الدعوة ونص الحكم بإشارة الخادم invite
for (const invite of [false, true]) {
  test(`القياس البعدي ${invite ? 'مُظهَرًا: بطاقة الدعوة كما كانت' : 'مطفأ: بلا بطاقة دعوة ولا «بتقدير مديرك»'}`, async ({ page }) => {
    const srv = createMockServer();
    Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true, features: { hall: true, katon: false, f360: invite } });
    await page.route(/functions\/v1\/leaders-api/, async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      let r = null;
      if (b.action === 'me') {
        r = srv.reply(b);
        const ev = r.journey.find((st) => st.key === 'evaluation');
        Object.assign(ev, { status: 'active', done: 1, total: 1, items: [{ id: 'e1', code: 'E-POST', title_ar: 'القياس البعدي', kind: 'system', auto: true, required: true, status: 'done' }] });
      }
      if (b.action === 'impact.mine') r = { success: true, summary: { before: 48.5, after: 66, reliable_up: 2, practice_then: 40, practice_now: 70 }, raters: [], limit: 3, pre_available: false, invite };
      await route.fulfill({ json: r || srv.reply(b) });
    });
    await page.route(/cloudflareinsights|challenges\.cloudflare/, (rt) => rt.abort());
    await page.addInitScript(() => {
      localStorage.setItem('mi_leaders_session', 't'.repeat(40));
      localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
    });
    await page.goto(APP);
    await page.getByRole('button', { name: 'أثري' }).first().click();
    await expect(page.getByText('المؤشر العام في الأطر الثلاثة')).toBeVisible();
    await expect(page.getByText(invite ? 'يكتمل الحكم بتقدير مديرك ودليل مبادرتك.' : 'يكتمل الحكم بدليل مبادرتك.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('البريد')).toHaveCount(invite ? 1 : 0);
  });
}

test('الإدارة: شاشة الأثر بشارة «مخفي عن المستخدمين» على عمودي المدير والمقيّمين حين يُطفأ 360، وبلا شارة حين يُظهَر', async ({ page }) => {
  let f360 = false;
  const cohort = (n) => ({ n, pre: 45, post: 70, diff: 25, sd: 8, dz: 3.1, t: 5, effect: 'كبير', reliable_up: n, reliable_down: 0, level_up: n, verdicts: { confirmed: n }, rater: { n: 1, pre: 2.1, post: 3.2 }, response_shift: 12 });
  const dim = (d) => ({ dimension: d, pre: { level: 'beginner' }, post: { level: 'intermediate' }, composite_pre: 45, composite_post: 70, change: 25, rci: 2.36, direction: 'up', verdict: { key: 'confirmed', label: 'تغير مؤكد', sources: ['test', 'evidence'] } });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.settings': { success: true, values: { features: { hall: false, katon: false }, feedback360: { enabled: f360 } } },
      'admin.catalog': { success: true, instruments: [{ id: 'i2', key: 'post-v1', kind: 'post', active: true }], placement_model: [{ id: 1, rci_reliability: 0.75, rci_sd: 15, impact_min_n: 20, rater_threshold: 10 }], questions: [], locked_instruments: [] },
      'admin.impact': {
        success: true, counts: { participants: 2, baseline: 2, post: 2, paired: 2 },
        cohort: { milestone: cohort(2), impact: cohort(2), leadership: cohort(2) }, transfer: [],
        config: { rci_reliability: 0.75, min_n: 20, source: {} },
        participants: [{ id: 'p1', full_name: 'سارة الأحمد', organization: 'جهة', baseline_at: '2026-01-01', post_at: '2026-06-01', raters_done: 1, raters_invited: 2, dimensions: [dim('milestone'), dim('impact'), dim('leadership')] }],
      },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  for (const on of [false, true]) {
    f360 = on;
    await page.goto(ADMIN);
    await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
    await page.reload();
    await page.getByRole('button', { name: 'تطبيق القادة' }).click();
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'قياس الأثر' }).click();
    await expect(page.getByText('سارة الأحمد').first()).toBeVisible();
    // الأرقام القائمة باقية في الحالتين
    await expect(page.getByText('1/2')).toBeVisible();
    await expect(page.getByText('2.1 ← 3.2 (1)').first()).toBeVisible();
    await expect(page.getByTestId('rater-hidden')).toHaveCount(on ? 0 : 2);
    await expect(page.getByText(/لا دعوات ولا روابط تقدير جديدة الآن/)).toHaveCount(on ? 0 : 1);
  }
});
