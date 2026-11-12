// تقييم 360 للتطوير (تصور 2026-11-11، اعتمده المالك): المشارك يقدّر نفسه ويرشح مقيّميه بالمجموعات على الجوال
// بلوحة المفاتيح، والمقيّم يقدّر بسلم الإعدادات ووعد مجموعته، والمستشار يعتمد القائمة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const LIKERT = ['نادرًا أو أبدًا', 'في أقل من نصف المرات', 'في نحو نصف المرات', 'في أغلب المرات', 'في كل المرات تقريبًا'].map((label, k) => ({ k, label }));
const SETTINGS = { min_group: 3, min_others: 3, caps: { manager: 1, peer: 6, report: 6, stakeholder: 3 }, window_days: 14, round_gap_days: 90, scale_labels: LIKERT.map((o) => o.label) };
const GROUPS = { manager: 'المدير المباشر', peer: 'الزملاء', report: 'أعضاء الفريق', stakeholder: 'أصحاب المصلحة' };
const counts = (o = {}) => ({ manager: { invited: 0, submitted: 0 }, peer: { invited: 0, submitted: 0 }, report: { invited: 0, submitted: 0 }, stakeholder: { invited: 0, submitted: 0 }, ...o });
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', consent: { needed: null } },
  profile: { approved: true, level: 'intermediate', track: null, dimensions: [] },
  journey: [{ key: 'profile', title_ar: 'الملف', phase: 'admission', sort: 1, status: 'done', items: [], done: 0, total: 0 }, { key: 'assessment', title_ar: 'القياس', phase: 'admission', sort: 2, status: 'done', items: [], done: 0, total: 0 }],
  progress: 40, passkeys: 1, prompt_passkey: false,
};

test('المشارك على الجوال: يبدأ 360 ويقدّر نفسه بلوحة المفاتيح ثم يرشح ويرسل القائمة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = [];
  const st = { cycle: null, self: {} };
  const view = () => ({
    success: true, enabled: true, ready: true, settings: SETTINGS, groups: GROUPS, next: st.cycle ? { ok: false, reason: 't1_running' } : { ok: true, wave: 't1' },
    cycles: st.cycle ? [st.cycle] : [], self_answers: st.self,
    self_items: [
      { id: 'q1', dimension: 'milestone', text: 'أوضح للفريق ما المطلوب في المرحلة القادمة.', options: [...LIKERT, { k: 5, label: 'لا ينطبق على عملي' }] },
      { id: 'q2', dimension: 'leadership', text: 'أطلب رأي الفريق قبل القرار حين يمسهم.', options: [...LIKERT, { k: 5, label: 'لا ينطبق على عملي' }] },
    ],
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'f360.start') st.cycle = { id: 'c1', wave: 't1', status: 'nominating', self_done: false, nominees: [], counts: counts() };
    if (b.action === 'f360.self') { st.self = b.answers; st.cycle.self_done = true; }
    if (b.action === 'f360.nominate') st.cycle.nominees.push({ id: `n${st.cycle.nominees.length}`, email: b.email, full_name: b.full_name || null, relation: b.relation, verification_ar: null, flags_ar: [] });
    if (b.action === 'f360.submit') st.cycle.status = 'approval';
    const r = { me, 'f360.mine': view(), 'f360.start': view(), 'f360.self': view(), 'f360.nominate': view(), 'f360.submit': view(), 'sessions.list': { success: true, sessions: [] } }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.setItem('mi_leaders_session', 't'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('.tabbar').getByRole('button', { name: 'ملفي' }).click();
  const entry = page.getByRole('region', { name: 'تقييم 360 للتطوير' });
  await entry.getByRole('button', { name: 'ابدأ تقييم 360' }).click();
  await expect(page.getByRole('heading', { name: 'كيف يراك من يعمل معك؟' })).toBeVisible();
  await expect(page.getByText(/لا يدخل تقييمك الختامي ولا شهادتك، ولا تراه جهتك/)).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ تقييم 360' }).click();

  // التقدير الذاتي بلوحة المفاتيح، ومراسي السلم من الإعدادات
  const g1 = page.getByRole('radiogroup', { name: /ما المطلوب في المرحلة القادمة/ });
  await g1.getByRole('radio', { name: 'في أغلب المرات' }).focus();
  await page.keyboard.press('Enter');
  await expect(g1.getByRole('radio', { name: 'في أغلب المرات' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'بقي 1' })).toBeDisabled();
  await page.getByRole('radiogroup', { name: /أطلب رأي الفريق/ }).getByRole('radio', { name: 'في نحو نصف المرات' }).click();
  await page.getByRole('button', { name: 'احفظ تقديري' }).click();
  expect(calls.find((c) => c.action === 'f360.self')).toMatchObject({ cycle_id: 'c1', answers: { q1: 3, q2: 2 } });

  // الترشيح: لا يُرسل بأقل من الحد من غير المدير
  const send = page.getByRole('button', { name: 'أرسل القائمة إلى مستشاري' });
  await expect(send).toBeDisabled();
  await expect(page.getByText('أضف 3 على الأقل من غير مديرك.')).toBeVisible();
  for (const [email, rel] of [['boss@org.sa', 'المدير المباشر'], ['p1@org.sa', 'الزملاء'], ['p2@org.sa', 'الزملاء'], ['t1@org.sa', 'أعضاء الفريق']]) {
    await page.getByLabel('البريد').fill(email);
    await page.getByLabel('صلته بك').selectOption({ label: rel });
    await page.getByRole('button', { name: 'أضف إلى القائمة' }).click();
    await expect(page.getByText(email)).toBeVisible();
  }
  await expect(send).toBeEnabled();
  await send.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('أرسلت القائمة، وهي بانتظار اعتماد مستشارك.')).toBeVisible();
  expect(calls.filter((c) => c.action === 'f360.nominate').map((c) => c.relation)).toEqual(['manager', 'peer', 'peer', 'report']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('المشارك بعد فتح النافذة: أعداد لكل مجموعة لا أسماء', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cycle = { id: 'c1', wave: 't1', status: 'open', self_done: true, nominees: [], closes_at: '2026-11-26T00:00:00Z', counts: counts({ manager: { invited: 1, submitted: 1 }, peer: { invited: 4, submitted: 2 } }) };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = { me, 'f360.mine': { success: true, enabled: true, ready: true, settings: SETTINGS, groups: GROUPS, next: { ok: false }, cycles: [cycle], self_items: [], self_answers: {} } }[b.action];
    await route.fulfill({ json: r ?? { success: true, sessions: [] } });
  });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.setItem('mi_leaders_session', 't'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.reload();
  await page.locator('.tabbar').getByRole('button', { name: 'ملفي' }).click();
  await page.getByRole('region', { name: 'تقييم 360 للتطوير' }).getByRole('button', { name: 'افتح تقييم 360' }).click();
  const box = page.getByRole('region', { name: 'التقديرات حتى الآن' });
  await expect(box).toContainText('الزملاء');
  await expect(box).toContainText('2 من 4');
  await expect(box).toContainText('أرسل ✓');
  await expect(box).not.toContainText('@');
});

test('المقيّم في 360: تقدير واحد بسلم الإعدادات ووعد مجموعته، والغرض تطويري', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let sent = null;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'rater.submit') sent = b;
    const r = {
      'rater.get': { success: true, done: false, phase: 'f360', participant: 'سارة الأحمد', relation: 'زميل', rater: 'أحمد',
        promise: 'يُجمع تقديرك مع مقيّمَين آخرين على الأقل من مجموعتك، ولا يظهر منفردًا.', questions: [
          { id: 'q1', dimension: 'leadership', text: 'يطلب رأي الفريق قبل القرار حين يمسهم.', options: [...LIKERT, { k: 5, label: 'لا أستطيع الحكم' }] },
        ] },
      'rater.submit': { success: true },
    }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(APP + 'rate?t=abcdefghijklmnopqrstuvwxyz');
  await expect(page.getByText('تقييم 360 للتطوير')).toBeVisible();
  await expect(page.getByText('يُجمع تقديرك مع مقيّمَين آخرين على الأقل من مجموعتك، ولا يظهر منفردًا.')).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByRole('radio', { name: 'شهريًا' }).click();
  // تقدير واحد: لا «قبل البرنامج»
  await expect(page.getByRole('radiogroup', { name: /قبل البرنامج/ })).toHaveCount(0);
  await page.getByRole('radiogroup', { name: /يطلب رأي الفريق/ }).getByRole('radio', { name: 'في أغلب المرات' }).click();
  await expect(page.getByText(/لتقرير تطويري له يسلّمه مستشاره/)).toBeVisible();
  await page.getByRole('button', { name: 'أرسل التقدير' }).click();
  await expect(page.getByText(/تقرير تطويري يناقشه مع مستشاره/)).toBeVisible();
  expect(sent).toMatchObject({ answers: { q1: { now: 3 } }, contact_freq: 'monthly' });
});

const expertDash = { success: true, consent_needed: false, expert: { full_name: 'د. منى القحطاني', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 0, participants: 1, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] };

test('المستشار: يعتمد قائمة المقيّمين فتُرسل الدعوات، أو يعيدها بملاحظة', async ({ page }) => {
  const sent = [];
  const st = { approvals: [{ id: 'c1', wave: 't1', status: 'approval', participant: 'سارة الأحمد', participant_id: 'p1', self_done: true, nominees: [
    { id: 'n1', email: 'boss@gmail.com', full_name: 'خالد', relation: 'manager', relation_ar: 'المدير المباشر', flags_ar: ['بريد عام'] },
    { id: 'n2', email: 'p1@org.sa', full_name: null, relation: 'peer', relation_ar: 'زميل', flags_ar: [] },
  ] }] };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action === 'xp.f360-decide') st.approvals = [];
    const r = {
      'xp.dashboard': expertDash,
      'xp.participants': { success: true, items: [], cohorts: [], raters_pending: [] },
      'xp.reviews': { success: true, advisor: true, items: [] },
      'xp.peer-list': { success: true, advisor: false, cohorts: [], items: [], pending: 0 },
      'xp.f360': { success: true, approvals: st.approvals, reports: [] },
      'xp.f360-decide': { success: true, decision: 'approve', invited: 2, mailed: 2 },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), 'x'.repeat(40));
  await page.goto(APP + 'x');
  const box = page.getByRole('region', { name: 'تقييم 360 لمشاركيك' });
  await expect(box).toContainText('سارة الأحمد');
  await expect(box).toContainText('boss@gmail.com');
  await expect(box).toContainText('بريد عام');
  await box.getByRole('button', { name: 'أعدها بملاحظة' }).click();
  await expect(box.getByRole('button', { name: 'أعدها بملاحظة' })).toBeDisabled();
  await box.getByRole('button', { name: 'إلغاء' }).click();
  await box.getByRole('button', { name: 'اعتمد القائمة وأرسل الدعوات' }).click();
  await expect(page.getByText('اعتُمدت قائمة سارة الأحمد وأُرسلت 2 دعوات.')).toBeVisible();
  expect(sent.find((x) => x.action === 'xp.f360-decide')).toMatchObject({ cycle_id: 'c1', decision: 'approve' });
});
