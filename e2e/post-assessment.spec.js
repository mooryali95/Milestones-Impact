// القياس البعدي: تقدير الآن وقبل البرنامج، ودعوة المدير وتقديره، وتقرير الأثر في الإدارة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const LIKERT = ['نادرًا جدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا'].map((label, k) => ({ k, label }));
const stage = (key, phase, status, items = []) => ({ key, title_ar: key === 'evaluation' ? 'قياس التطور' : key, phase, sort: 1, status, items, done: 0, total: items.length });
const me = (postDone) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.sa', status: 'enrolled' },
  profile: { approved: true, level: 'intermediate', track: null },
  journey: [
    stage('profile', 'admission', 'done'), stage('assessment', 'admission', 'done'),
    stage('evaluation', 'impact', postDone ? 'done' : 'active', [
      { id: 'r1', code: 'E-POST', title_ar: 'إكمال القياس البعدي', kind: 'auto', auto: true, required: true, status: postDone ? 'done' : 'pending' },
    ]),
  ],
  progress: 80, passkeys: 1, prompt_passkey: false,
});

test('المشارك: القياس البعدي بتقديرين ثم دعوة المدير', async ({ page }) => {
  const calls = [];
  let done = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      me: me(done),
      'assessment.get': {
        success: true, assessment: { id: 'a1', kind: 'post', status: 'in_progress', est_minutes: 18, intro: 'مقدمة البعدي' },
        questions: [
          { id: 'q1', dimension: 'milestone', tier: 'behavior', kind: 'likert', retro: true, text: 'أختم الاجتماع بقرار موثق.', options: [...LIKERT, { k: 5, label: 'لا ينطبق على عملي', na: true }] },
          { id: 't1', dimension: 'leadership', tier: 'transfer', kind: 'likert', retro: false, text: 'ما تعلمته يرتبط بعملي.', options: LIKERT },
        ],
        answers: {}, before: {},
      },
      'assessment.answer': { success: true },
      'assessment.submit': (done = true) && me(true),
      'impact.mine': { success: true, summary: { before: 48.5, after: 66, reliable_up: 2, practice_then: 40, practice_now: 70 }, raters: [], limit: 3 },
      'rater.invite': { success: true, summary: { before: 48.5, after: 66, practice_then: 40, practice_now: 70 }, raters: [{ id: 'x1', email: 'boss@x.sa', relation: 'manager', status: 'invited' }], limit: 3 },
    };
    if (b.action === 'assessment.submit') done = true;
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4304/');
  await page.evaluate(() => { localStorage.setItem('mi_leaders_session', 't'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.reload();

  await page.getByRole('button', { name: 'ابدأ القياس البعدي' }).click();
  await expect(page.getByText('مقدمة البعدي')).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  // الآن، ثم يظهر سؤال قبل البرنامج ولا يتقدم قبله
  await page.getByRole('radiogroup', { name: /الآن/ }).getByRole('radio', { name: /دائمًا/ }).click();
  const before = page.getByRole('radiogroup', { name: /قبل البرنامج/ });
  await expect(before).toBeVisible();
  await expect(before.getByRole('radio')).toHaveCount(5);
  await before.getByRole('radio', { name: /نادرًا جدًا/ }).click();
  await expect(page.getByRole('heading', { name: /أنهيت/ })).toBeVisible();
  await expect(page.getByText(/تجربتك في البرنامج/).first()).toBeVisible();
  await page.getByRole('button', { name: /واصل إلى/ }).click();
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await page.getByRole('button', { name: 'أرسل واعرض ما تغيّر' }).click();

  await expect(page.getByText('المؤشر العام في الأطر الثلاثة')).toBeVisible();
  await expect(page.getByText('+17.5')).toBeVisible();
  await page.getByLabel('البريد').fill('boss@x.sa');
  await page.getByRole('button', { name: 'أرسل الدعوة' }).click();
  await expect(page.getByText('بانتظار تقديره')).toBeVisible();

  const answers = calls.filter((c) => c.action === 'assessment.answer');
  expect(answers.at(-2)).toMatchObject({ question_id: 'q1', k: 4, before: 0 });
  expect(calls.find((c) => c.action === 'assessment.get').kind).toBe('post');
  expect(calls.find((c) => c.action === 'rater.invite')).toMatchObject({ email: 'boss@x.sa', relation: 'manager' });
});

test('المقيّم: تقديران لكل عبارة من رابط البريد', async ({ page }) => {
  let sent = null;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'rater.submit') sent = b;
    const replies = {
      'rater.get': { success: true, done: false, participant: 'سارة الأحمد', relation: 'المدير المباشر', rater: null, questions: [
        { id: 'q1', dimension: 'milestone', text: 'يختم الاجتماع بقرار موثق.', options: [...LIKERT, { k: 5, label: 'لا أستطيع الحكم' }] },
      ] },
      'rater.submit': { success: true },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4304/rate?t=abcdefghijklmnopqrstuvwxyz');
  await expect(page.getByRole('heading', { name: /سارة الأحمد/ })).toBeVisible();
  const send = page.getByRole('button', { name: 'بقي 1' });
  await expect(send).toBeDisabled();
  await page.getByRole('radiogroup').nth(0).getByRole('radio', { name: 'غالبًا' }).click();
  await page.getByRole('radiogroup').nth(1).getByRole('radio', { name: 'نادرًا', exact: true }).click();
  await page.getByRole('button', { name: 'أرسل التقدير' }).click();
  await expect(page.getByRole('heading', { name: 'شكرًا لك' })).toBeVisible();
  expect(sent).toMatchObject({ t: 'abcdefghijklmnopqrstuvwxyz', answers: { q1: { now: 3, before: 1 } } });
});

test('الإدارة: تقرير الأثر قبل وبعد', async ({ page }) => {
  const dim = (d, extra = {}) => ({
    dimension: d, pre: { level: 'beginner' }, post: { level: 'intermediate' }, composite_pre: 45, composite_post: 70, change: 25, rci: 2.36,
    direction: 'up', verdict: { key: 'confirmed', label: 'تغير مؤكد', sources: ['test', 'rater'] }, ...extra,
  });
  const cohort = (n) => ({ n, pre: 45, post: 70, diff: 25, sd: 8, dz: 3.1, t: 5, effect: 'كبير', reliable_up: n, reliable_down: 0, level_up: n, verdicts: { confirmed: n }, rater: { n: 0 }, response_shift: 12 });
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': { success: true, instruments: [{ id: 'i2', key: 'post-v1', kind: 'post', active: false }], placement_model: [{ id: 1, rci_reliability: 0.75, rci_sd: 15, impact_min_n: 20, rater_threshold: 10 }], questions: [], locked_instruments: [] },
      'admin.impact': {
        success: true, counts: { participants: 3, baseline: 3, post: 2, paired: 2 },
        cohort: { milestone: cohort(2), impact: cohort(2), leadership: cohort(2) },
        transfer: [{ code: 'T-3', text: 'دعمني مديري المباشر في تطبيق ما تعلمته.', n: 2, agree_pct: 50, mean: 2.5 }],
        config: { rci_reliability: 0.75, min_n: 20, source: { milestone: { n: 3, from_data: false } } },
        caution: 'العدد 2 أقل من 20: الأرقام وصفية لهذه الدفعة ولا تُعمَّم، والثبات المستعمل افتراضي.',
        participants: [{ id: 'p1', full_name: 'سارة الأحمد', organization: 'جهة', baseline_at: '2026-01-01', post_at: '2026-06-01', raters_done: 1, raters_invited: 1, dimensions: [dim('milestone'), dim('impact'), dim('leadership')] }],
      },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'قياس الأثر' }).click();
  await expect(page.getByText('القياس البعدي غير مفعّل بعد')).toBeVisible();
  await expect(page.getByText(/أقل من 20/)).toBeVisible();
  await expect(page.getByText('دعمني مديري المباشر في تطبيق ما تعلمته.')).toBeVisible();
  await expect(page.getByText('تغير مؤكد').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'إعدادات الحكم بالتغير' })).toBeVisible();
  // التقرير النهائي بالهوية: الأرقام والتنبيه وأسماء المشاركين
  const [doc] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'تقرير الأثر PDF' }).click()]);
  await expect(doc.getByText('تقرير أثر برنامج القادة')).toBeVisible();
  await expect(doc.getByText(/أقل من 20/)).toBeVisible();
  await expect(doc.getByText('سارة الأحمد')).toBeVisible();
});
