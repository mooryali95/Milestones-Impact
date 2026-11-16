// التذكير الموحد (P4، اعتمدها المالك 2026-11-16): لافتة التذكير في رحلة المشارك، وتذكير المرشد من بوابة الخبير،
// و«ذكّرهم» للمنسق في «يحتاج تدخلك» بمعاينة أعداد بلا أسماء ولا نص. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const text = 'أنت في مرحلة «التدريب»، وقطعت 40% من رحلتك. خطوتك التالية: خطة المبادرة.';

test('لافتة التذكير أعلى الرحلة بنصه ومرسله، و«إلى خطوتي» يفتح المرحلة ويكتب الاطلاع', async ({ page }) => {
  const stage = (key, title_ar, status) => ({ key, title_ar, phase: 'program', status, items: [], done: 0, total: 0 });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
    profile: { approved: true, dimensions: [] }, journey: [stage('profile', 'الملف الشخصي', 'done'), stage('assessment', 'تحديد المستوى', 'done'), stage('training', 'التدريب', 'active')],
    progress: 40, passkeys: 1, prompt_passkey: false, milestones: [], notices: [],
    nudge: { id: 'n1', stage: 'التدريب', body: text, by: 'المرشد خالد', at: '2026-11-15T10:00:00Z' },
  };
  const sent = [];
  await page.route(/functions\/v1\/leaders-api/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    route.fulfill({ json: b.action === 'me.nudge-seen' ? { success: true, nudge: null } : me });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-nudge-0000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  const banner = page.getByRole('status', { name: 'تذكير برحلتك' });
  await expect(banner).toContainText(text);
  await expect(banner).toContainText('المرشد خالد');
  await banner.getByRole('button', { name: 'إلى خطوتي' }).click();
  await expect(page.getByRole('status', { name: 'تذكير برحلتك' })).toHaveCount(0);
  await expect.poll(() => sent.find((b) => b.action === 'me.nudge-seen')?.id).toBe('n1');
});

test('بلا تذكير لم يره: لا لافتة', async ({ page }) => {
  const me = { success: true, participant: { id: 'p1', full_name: 'سارة', email: 's@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
    profile: { approved: true, dimensions: [] }, journey: [{ key: 'profile', title_ar: 'الملف', status: 'done', items: [] }, { key: 'assessment', title_ar: 'القياس', status: 'done', items: [] }], progress: 0, passkeys: 1, prompt_passkey: false, milestones: [], notices: [], nudge: null };
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: me }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-nudge-1111111111111111111'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.goto(APP);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'تذكير برحلتك' })).toHaveCount(0);
});

// ── المرشد (مشرف الرحلة) من بوابة الخبير ──
function expertServer({ mentor = true, allowed = true, guidance = null } = {}) {
  const calls = [];
  const file = {
    success: true, scope: 'assigned', mentor, guidance,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: null, phone: null, job_title: 'مديرة مشاريع', organization_name: 'جهة', status: 'enrolled' },
    profile: null, journey: [{ key: 'training', title_ar: 'التدريب', status: 'active', done: 1, total: 2 }], progress: 40, milestones: [], milestone_summary: { done: 0, total: 0, late: 0 },
    group: null, continuous: null, program: { id: 'pr1' }, assessments: [], models: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [],
    sessions: [], expert_requests: [], peer: { requests: [], pending_answers: [], given: [] }, final: null, needs: [], cohort: null, observations: [], flags: [],
  };
  const ledger = { success: true, ledger: true, total: 1, progressed: 1, gap_days: 3,
    now: { ok: true, allowed, stage: 'التدريب', days: 9, text }, last: { by: 'الإدارة', days: allowed ? 6 : 1 },
    rows: [{ id: 'n1', by: 'الإدارة', stage_title: 'التهيئة', created_at: '2026-11-08T10:00:00Z', outcome: 'progressed', seen_at: '2026-11-09T10:00:00Z' }] };
  const reply = (b) => ({
    'xp.dashboard': { success: true, expert: { full_name: 'خالد العمر', title: 'مرشد', roles: ['mentor'] }, stats: { hours: 0, participants: 1, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] },
    'xp.participants': { success: true, items: [{ id: 'p1', name: 'سارة الأحمد', first: 'سارة', title: 'مديرة مشاريع', org: 'جهة', status: 'enrolled', cohort: null, advisor: false, role_ar: 'مرشد', level: null, level_ar: null, approved: true, stage: 'التدريب', progress: 40, late: 0, continuous: null, needs: 0 }], cohorts: [] },
    'xp.participant': file, 'xp.nudge-ledger': ledger, 'xp.nudge': { success: true, sent: 1, skipped: {}, gap_days: 3 },
    'xp.sus-state': { success: true, ready: false }, 'xp.reviews': { success: true, items: [] }, 'xp.peer-list': { success: true, cohorts: [], requests: [] },
  }[b.action] ?? { success: true });
  return { calls, route: async (route) => { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b); await route.fulfill({ json: reply(b) }); } };
}
async function openFile(page, s) {
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), 'x'.repeat(40));
  await page.goto('http://localhost:4304/x');
  await page.getByRole('button', { name: 'افتح الملف' }).first().click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
}

test('المرشد يرى ما سيصل مُرشَده باسمه ومن ذكّره، ويذكّره بخطوتين', async ({ page }) => {
  const s = expertServer();
  await openFile(page, s);
  const card = page.getByRole('region', { name: 'تذكيره' });
  await expect(card).toContainText(text);
  await expect(card).toContainText('ذكّره الإدارة قبل 6 أيام');
  await expect(card).toContainText('تقدّم بعده');
  await card.getByRole('button', { name: 'ذكّره' }).click();
  expect(s.calls.find((c) => c.action === 'xp.nudge')).toBeUndefined();
  await card.getByRole('button', { name: 'أرسل التذكير' }).click();
  await expect(card).toContainText('أُرسل التذكير باسمك');
  expect(s.calls.find((c) => c.action === 'xp.nudge').participant_ids).toEqual(['p1']);
});

test('الحد المشترك عند المرشد: ذُكِّر أمس فالزر معطل، ومن ليس مرشده لا يرى البطاقة', async ({ page }) => {
  await openFile(page, expertServer({ allowed: false }));
  const card = page.getByRole('region', { name: 'تذكيره' });
  await expect(card.getByRole('button', { name: 'ذكّره' })).toBeDisabled();
  await expect(card).toContainText('ذكّره الإدارة أمس، والتذكير التالي بعد 3 أيام');
});

test('خبير مسند بدور غير المرشد: لا بطاقة تذكير', async ({ page }) => {
  const s = expertServer({ mentor: false });
  await openFile(page, s);
  await expect(page.getByRole('region', { name: 'تذكيره' })).toHaveCount(0);
  expect(s.calls.find((c) => c.action === 'xp.nudge-ledger')).toBeUndefined();
});

// ── منسق الجهة ──
const dashboard = () => ({ success: true, org: { name: 'هيئة التطوير', seats: 50 }, permissions: { list: true, scores: false, activity: true },
  funnel: { registered: 2, approved: 0, completed: 0, withdrawn: 0 }, by_track: {}, track_titles: {}, by_via: {},
  kpis: { total: 2, joined_week: 0, active_week: 0, approved: 0, completed: 0, avg_progress: 5, seats: 50, seats_used: 2, seats_waiting: 0 },
  participants: [{ id: 'p1', full_name: 'سارة', status: 'profiled', progress: 5 }, { id: 'p2', full_name: 'خالد', status: 'assessing', progress: 10 }],
  impact: { counts: { paired: 0, baseline: 0, post: 0 }, cohort: null, suppressed: 5, participants: [] }, initiatives: [], outcomes: null, raters_pending: [] });
async function coord(page, { nudges = true } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      'coord.me': { success: true, coordinator: { full_name: 'منسق', email: 'c@x.sa', permissions: dashboard().permissions }, org: { name: 'هيئة التطوير', nudges }, switch_to: [], consent_needed: false,
        preload: { dashboard: dashboard(), sus: { success: true, due: false } } },
      'coord.nudge-preview': { success: true, group: 'baseline', count: 1, stages: [{ stage: 'التسجيل', n: 1 }], skipped: { recent: 1 }, left: 60, signed: 'هيئة التطوير', gap_days: 3 },
      'coord.nudge': { success: true, sent: 1, skipped: { recent: 1 }, left: 59 },
    }[b.action];
    return route.fulfill({ json: r || { success: true } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_coord_session', 'c'.repeat(40)));
  await page.goto('http://localhost:4304/org');
  return calls;
}

test('المنسق: «ذكّرهم» يعرض أعدادًا بالمرحلة بلا أسماء ولا نص، ثم يرسل باسم الجهة', async ({ page }) => {
  const calls = await coord(page);
  const todo = page.getByRole('region', { name: 'يحتاج تدخلك' });
  await todo.locator('li').filter({ hasText: 'سجّلوا ولم يكملوا القياس المبدئي' }).getByRole('button', { name: 'ذكّرهم' }).click();
  const box = page.getByRole('region', { name: 'تذكيرهم' });
  await expect(box).toContainText('موقّعًا «هيئة التطوير»');
  await expect(box).toContainText('1 في «التسجيل»');
  await expect(box).toContainText('لا يُذكَّر: 1 ذُكِّروا قريبًا');
  await expect(box).not.toContainText('سارة');
  await expect(box).not.toContainText('خطوتك التالية');
  await box.getByRole('button', { name: 'أرسل 1 تذكير' }).click();
  await expect(box.getByRole('status')).toContainText('أُرسل 1 تذكيرًا باسم جهتك');
  expect(calls.find((c) => c.action === 'coord.nudge')).toMatchObject({ group: 'baseline' });
  expect(calls.find((c) => c.action === 'coord.nudge').participant_ids).toBeUndefined();
});

test('المنسق: أوقفت الإدارة التذكير لجهته فلا زر', async ({ page }) => {
  await coord(page, { nudges: false });
  await expect(page.getByRole('region', { name: 'يحتاج تدخلك' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ذكّرهم' })).toHaveCount(0);
});

test('مستشار الدفعة يرى أعداد «التوجيه والإرشاد» وحدها، والمحادثة لا تظهر له', async ({ page }) => {
  await openFile(page, expertServer({ mentor: false, guidance: { asked: 6, unsure: 2, confirmed: 1, last_at: '2026-11-15T10:00:00Z', days: 30 } }));
  const card = page.getByRole('region', { name: 'التوجيه والإرشاد' });
  await expect(card).toContainText('سأل المساعد الذكي 6 مرات، ولم يتأكد المساعد في 2، وطلب التأكد من خبير 1 مرة');
  await expect(card).toContainText('المحادثة نفسها خاصة به ولا تظهر لك');
});

test('بلا أسئلة للمساعد أو لغير المستشار (guidance: null): لا بطاقة', async ({ page }) => {
  await openFile(page, expertServer({ mentor: false }));
  await expect(page.getByRole('region', { name: 'التوجيه والإرشاد' })).toHaveCount(0);
});
