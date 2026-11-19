// التوازي 2 خارج رحلة المشارك (الجولة الخامسة): «أين هو» عند الخبير ومنسق الجهة من currentStages نفسها، فالمرحلتان اللتان
// تسيران معًا تُسميان معًا وتظهران كتلة «تسير معًا»، والمسار المستمر والخدمات بجانبهما. وخريطة الجهة تعرض الموقوفة والتوازي
// والمسار كملف الدفعة (map.lanes). الخلفية مُحاكاة. SHOTS_DIR: لقطات 390 و1440.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const APP = 'http://localhost:4304/';
const XP_TOKEN = 'x'.repeat(40);
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const shot = async (page, name, target) => {
  if (!SHOTS) return;
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// رحلة المشارك كما يعيدها journeyFor: التدريب والتوجيه يسيران معًا وكلاهما جارٍ، ومسار مستمر جارٍ، وخدمة استفاد منها
const JOURNEY = [
  { key: 'approval', title_ar: 'اعتماد المستوى', status: 'done', done: 1, total: 1, items: [] },
  { key: 'training', title_ar: 'التدريب', status: 'active', done: 2, total: 4, items: [] },
  { key: 'ojt_coaching', title_ar: 'التوجيه على رأس العمل', status: 'active', done: 1, total: 3, items: [], rules: { unlock: 'with', with: 'training' } },
  { key: 'mentoring', title_ar: 'الإرشاد المهني', status: 'active', done: 0, total: 2, items: [], lane: 'track', rules: { lane: 'track', unlock: 'with', with: 'training', until: 'journey_end' } },
  { key: 'consulting', title_ar: 'الاستشارة', status: 'available', done: 0, total: 1, lane: 'service', rules: { lane: 'service' }, items: [{ status: 'done' }] },
  { key: 'report', title_ar: 'التقرير النهائي', status: 'locked', done: 0, total: 1, items: [] },
];

// fail: أفعال يرفضها الخادم برسالته (التحقق من التعليل، تعذّر الحفظ) لاختبار عرض الرفض
function server({ finalStatus = 'pending', fail = {} } = {}) {
  const calls = [];
  const state = { final: finalStatus, answers: { a1: 'pending', a2: 'pending' }, rated: false };
  const answer = (id, author, text) => ({ id, text, status: state.answers[id], status_ar: { pending: 'بانتظار تأكيد الخبير', confirmed: 'أكّده الخبير', corrected: 'صحّحه الخبير', hidden: 'أخفاه الخبير' }[state.answers[id]], expert_note: null, at: '2026-11-03T10:00:00Z', author, by_expert: false, mine: false });
  const request = () => ({
    id: 'q1', text: 'كيف أربط سجل المعالم بسجل المنافع في مشروعي؟', source: 'free', source_ar: 'سؤال حر', target_team: 'guide', target_team_ar: 'فريق التوجيه',
    status: Object.values(state.answers).some((s) => s === 'confirmed' || s === 'corrected') ? 'confirmed' : 'answered', status_ar: 'أُجيب، بانتظار تأكيد الخبير', at: '2026-11-03T09:00:00Z',
    participant_id: 'p1', author: 'سارة الأحمد', mine: false, cohort: 'دفعة نوفمبر',
    answers: [answer('a1', 'خالد العتيبي', 'اجعل كل منفعة مرتبطة بمعلم قرار واحد على الأقل.'), answer('a2', 'نورة السالم', 'ضع المنافع في جدول مستقل بلا ربط.')],
    pending: Object.values(state.answers).filter((s) => s === 'pending').length,
  });
  const peerList = () => ({ success: true, advisor: true, cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', supervision: 'peers_expert', supervision_ar: 'الأقران يجيبون ويؤكّد الخبير' }], items: [request()], pending: request().pending });
  const live = { score: 78, auto_score: 78, decision: 'pass', suggested: 'pass', coverage: 100, missing: [], large_adjust: false, config: { approval: 'expert', large_adjust: 15 }, config_version: 3,
    components: [{ key: 'continuous', label: 'التقييم المستمر طوال التأهيل', weight: 30, auto: 72, reason: 'من 4 مصادر', adjusted: false }, { key: 'post', label: 'القياس النهائي', weight: 40, auto: 85, reason: 'مكسب موثوق', adjusted: false }] };
  const final = () => ({ live, record: { status: state.final, adjust: { components: {} }, votes: state.final === 'approved' ? [{ by: 's@x.com', vote: 'approve', at: '2026-11-04T10:00:00Z' }] : [], submitted_by: 'a@x.com', submitted_at: '2026-11-03T10:00:00Z' }, frozen: true,
    approval: { yes: state.final === 'approved' ? 1 : 0, need: 1 }, vote_block: null, program: { id: 'pr1', name: 'برنامج القادة' }, current_version: 3 });
  const file = () => ({
    success: true, scope: 'advisor',
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', phone: '0500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة الاختبار', sector: 'government', years_experience: 8, status: 'enrolled' },
    profile: { approved: true, track: { title: 'القيادة من خلال الآخرين' }, dimensions: [{ dimension: 'milestone', level: 'intermediate', approved: true, path: 'مسار المعالم' }, { dimension: 'impact', level: 'beginner', approved: true }, { dimension: 'leadership', level: 'advanced', approved: true }] },
    journey: JOURNEY,
    progress: 55,
    milestones: [{ id: 'm1', title_ar: 'نهاية التدريب', status: 'done', done: true, scores: {}, due: '2026-10-20' }, { id: 'm2', title_ar: 'تسليم هيكل المشروع', status: 'late', done: false, late_days: 4, due: '2026-10-31', scores: {} }],
    milestone_summary: { done: 1, total: 2, late: 1, max_late: 4 },
    group: null, continuous: { index: 72, trend: { dir: 'up', delta: 6 }, components: [{ key: 'quizzes', label: 'اختبارات الكتاب', value: 80, reason: 'الصواب في 12 سؤالًا' }, { key: 'peer', label: 'الإسهام المؤكَّد في طلبات الأقران', value: null, reason: 'لم يؤكّد الخبير له إسهامًا في طلبات زملائه بعد' }], engagement: { label: 'الانخراط', value: 75 }, flags: [], events: [] },
    program: { id: 'pr1' }, assessments: [], models: [{ id: 's1', status: 'submitted', status_ar: 'بانتظار تقييمك', rating: null, submitted_at: '2026-11-01T10:00:00Z', title: 'اتفاق التعلم الثلاثي' }],
    points: { total: 40, rank: { title: 'مستكشف' } }, book: [],
    team: 'guide', team_ar: 'فريق التوجيه',
    sessions: [{ id: 'cs1', status: 'attended', starts_at: '2026-10-25T10:00:00Z', ends_at: '2026-10-25T11:00:00Z', expert: 'د. سارة الحربي' }],
    expert_requests: [],
    peer: { requests: [request()], pending_answers: request().answers.filter((a) => a.status === 'pending'), given: [] },
    final: final(),
    needs: [
      ...(state.rated ? [] : [{ key: 'submissions', n: 1, text: '1 تسليم بانتظار تقييمك' }, { key: 'milestones', n: 1, text: '1 معلم متأخر بلا اعتماد' }, { key: 'rubric', n: 1, text: '1 معلم منجز بلا تقييم بالمعيار' }]),
      ...(state.final === 'pending' ? [{ key: 'final', n: 1, text: 'تقييم ختامي بانتظار اعتمادك' }] : []),
      ...(request().pending ? [{ key: 'peer', n: request().pending, text: `${request().pending} إجابة من زملائه بانتظار تأكيدك` }] : []),
    ],
    cohort: { id: 'c1', name: 'دفعة نوفمبر', supervision: 'peers_expert' },
  });
  const reply = (b) => {
    if (fail[b.action]) return { success: false, message: fail[b.action] };
    switch (b.action) {
      case 'xp.dashboard': return { success: true, features: { hall: true, katon: false, f360: true }, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة محافظ', roles: ['advisor'] }, stats: { hours: 7.5, participants: 1, attended: 2, upcoming: 0, no_show: 0 }, rating: { count: 1, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', supervision: 'peers_expert' }] };
      case 'xp.participants': return { success: true, items: [{ id: 'p1', name: 'سارة الأحمد', first: 'سارة', title: 'مديرة مشاريع', org: 'جهة الاختبار', status: 'enrolled', cohort: 'دفعة نوفمبر', advisor: true, role_ar: null, level: 'intermediate', level_ar: 'متوسط', approved: true, stage: 'التدريب والتوجيه على رأس العمل معًا', together: true, tracks: ['الإرشاد المهني'], progress: 55, late: 1, continuous: 72, needs: 4 }], cohorts: [] };
      case 'xp.participant': return file();
      case 'xp.reviews': return { success: true, advisor: true, items: [] };
      case 'xp.sus-state': return { success: true, ready: true, due: true, answered: false };
      case 'xp.peer-list': return peerList();
      case 'xp.peer-review': state.answers[b.answer_id] = b.status; return peerList();
      case 'xp.peer-answer': return peerList();
      case 'xp.final-eval-vote': state.final = b.vote === 'approve' ? 'approved' : 'returned'; return { success: true, status: state.final };
      case 'xp.milestone': state.rated = true; return { success: true };
      case 'xp.hall': return { success: true, session: null, topics: [{ id: 't1', title_ar: 'أساسيات المشروع', status: 'published' }] };
      default: return { success: false, message: `غير متوقع: ${b.action}` };
    }
  };
  return { calls, route: async (route) => { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b); await route.fulfill({ json: reply(b) }); } };
}


for (const width of [1440, 390]) {
  test(`الخبير: «أين هو» بالمرحلتين معًا وكتلة «تسير معًا» والمسار والخدمات، وقائمة مشاركيه بالاسمين (${width})`, async ({ page }) => {
    const s = server();
    await page.route(/functions\/v1\/leaders-api/, s.route);
    await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
    await page.goto(PORTAL);
    const mine = page.getByRole('region', { name: /مشاركوك/ });
    await expect(mine).toContainText('المرحلة: التدريب والتوجيه على رأس العمل معًا');
    await mine.getByRole('button', { name: 'افتح الملف' }).click();
    const where = page.getByRole('region', { name: 'أين هو' });
    await expect(where).toContainText('المرحلتان الحاليتان تسيران معًا: التدريب والتوجيه على رأس العمل');
    const block = where.getByRole('listitem', { name: 'تسير معًا: التدريب والتوجيه على رأس العمل' });
    await expect(block).toContainText('التدريب');
    await expect(block).toContainText('التوجيه على رأس العمل');
    await expect(where).toContainText('مسار مستمر يسير بجانب الرحلة');
    await expect(where.locator('.xf-side', { hasText: 'مسار مستمر' })).toContainText('الإرشاد المهني');
    await expect(where.locator('.xf-side', { hasText: 'خدمات لمن يريد' })).toContainText('الاستشارة');
    await expect(where.locator('.xf-side', { hasText: 'خدمات لمن يريد' })).toContainText('استفاد منها');
    // المسار والخدمة ليسا في السلسلة، والسلسلة بترتيبها
    await expect(where.locator('> .xf-journey > li')).toHaveCount(3);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'expert-parallel', where);
  });
}

// ── منسق الجهة ──
const SESSION = 'mi_leaders_coord_session';
const ME = { success: true, consent_needed: false, coordinator: { full_name: 'منسقة' }, org: { name: 'وزارة التجربة' } };
const row = (key, title, phase, here, extra = {}) => ({ key, title, phase, duration_days: 14, here, done: 0, late: 0, window: null, reasons: [], ...extra });
const MAP = {
  program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة الجهة', starts_on: '2026-11-02', is_default: false, today_stage: 'training', today_stages: ['training', 'ojt_coaching'] },
  totals: { total: 2, finished: 0, late: 0, not_started: 0 }, here_by_phase: { qualification: 2 }, bottleneck: { stage: 'training' },
  stages: [row('approval', 'اعتماد المستوى', 'admission', 0, { done: 2 }), row('training', 'التدريب', 'qualification', 2), row('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 1),
    row('mentoring', 'الإرشاد المهني', 'qualification', 1),
    { key: 'leadership', title: 'التوجيه القيادي', phase: 'qualification', duration_days: 0, here: 0, done: 0, late: 0, window: null, off: true, reasons: [] },
    row('report', 'التقرير النهائي', 'impact', 0)],
  milestones: [],
  lanes: { together: { training: 'training', ojt_coaching: 'training' }, tracks: ['mentoring'] },
};
const dashboard = {
  success: true, org: { name: 'وزارة التجربة', seats: null }, permissions: { list: true, scores: false, contact: false, export: false, activity: true },
  kpis: { total: 2, joined_week: 0, active_week: 2, approved: 2, completed: 0, avg_progress: 30 }, funnel: { registered: 2, approved: 2 }, by_track: {}, by_via: {},
  participants: [
    { id: 'p1', full_name: 'سارة الأحمد', status: 'enrolled', stage: 'التدريب والتوجيه على رأس العمل معًا', stages: ['التدريب', 'التوجيه على رأس العمل'], tracks: ['الإرشاد المهني'], progress: 40, last_login_at: new Date().toISOString() },
    { id: 'p2', full_name: 'عمر الزهراني', status: 'enrolled', stage: 'التدريب', progress: 30, last_login_at: new Date().toISOString() },
  ],
  impact: null, outcomes: null, raters_pending: [], initiatives: [], journey_map: MAP,
};
for (const width of [1440, 390]) {
  test(`المنسق: خريطة الجهة بالموقوفة والتوازي والمسار، وصف المشارك بالمرحلتين ومرشّح كل منهما (${width})`, async ({ page }) => {
    await page.route(/functions\/v1\/leaders-api/, async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      const r = { 'coord.me': ME, 'coord.dashboard': dashboard }[b.action];
      await route.fulfill({ json: r ?? { success: true } });
    });
    await page.addInitScript(([k, t]) => localStorage.setItem(k, t), [SESSION, 'c'.repeat(40)]);
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
    await page.goto(APP + 'org');
    await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
    const jm = page.locator('.jm');
    const node = (t) => jm.locator('.jm-stage').filter({ has: page.locator('.jm-title', { hasText: new RegExp(`^${t}$`) }) });
    await expect(node('التوجيه على رأس العمل').locator('.jm-lane')).toHaveText('تسير مع «التدريب»');
    await expect(node('التدريب').locator('.jm-lane')).toHaveText('«التوجيه على رأس العمل» تسير معها');
    await expect(node('التدريب')).toHaveClass(/\bjm-with\b/);
    await expect(node('الإرشاد المهني').locator('.jm-lane')).toHaveText('مسار مستمر يسير بجانب الرحلة');
    await expect(node('التوجيه القيادي')).toHaveClass(/\boff\b/);
    await expect(node('التوجيه القيادي')).toContainText('موقوفة لهذه الدفعة');
    await expect(node('التقرير النهائي').locator('.jm-lane')).toHaveCount(0);
    await expect(jm).toContainText('الجدول اليوم عند التدريب والتوجيه على رأس العمل معًا');
    await shot(page, 'org-map-lanes', jm);
    // صف المشارك: المرحلتان معًا، والمسار بجانبهما، والمرشّح بكل منهما
    const sara = page.locator('tr', { hasText: 'سارة الأحمد' });
    await expect(sara).toContainText('التدريب والتوجيه على رأس العمل معًا');
    await expect(sara).toContainText('ومسار مستمر: الإرشاد المهني');
    const filter = page.getByRole('combobox', { name: 'المرحلة' });
    await filter.selectOption('التوجيه على رأس العمل');
    await expect(page.locator('tr', { hasText: 'سارة الأحمد' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'عمر الزهراني' })).toHaveCount(0);
    await filter.selectOption('التدريب');
    await expect(page.locator('tr', { hasText: 'عمر الزهراني' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'سارة الأحمد' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'org-people-lanes', sara);
  });
}
