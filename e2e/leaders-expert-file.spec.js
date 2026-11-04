// بوابة الخبير (المرحلتان 8 و9): مشاركوه وملف المشارك في صفحة، واعتماد الختامي وتقييم المعلم من البوابة،
// وطلبات الأقران: تأكيد إجابة زميل وتصحيحها وإجابة الخبير. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const PORTAL = 'http://localhost:4304/x';
const XP_TOKEN = 'x'.repeat(40);

function server() {
  const calls = [];
  const state = { final: 'pending', answers: { a1: 'pending', a2: 'pending' }, rated: false };
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
    journey: [{ key: 'training', title_ar: 'التدريب', status: 'done', done: 3, total: 3 }, { key: 'ojt_coaching', title_ar: 'التوجيه على رأس العمل', status: 'active', done: 1, total: 4 }],
    progress: 55,
    milestones: [{ id: 'm1', title_ar: 'نهاية التدريب', status: 'done', done: true, scores: {}, due: '2026-10-20' }, { id: 'm2', title_ar: 'تسليم هيكل المشروع', status: 'late', done: false, late_days: 4, due: '2026-10-31', scores: {} }],
    milestone_summary: { done: 1, total: 2, late: 1, max_late: 4 },
    group: null, continuous: { index: 72, trend: { dir: 'up', delta: 6 }, components: [{ key: 'quizzes', label: 'اختبارات الكتيب', value: 80, reason: 'الصواب في 12 سؤالًا' }, { key: 'peer', label: 'الإسهام المؤكَّد في طلبات الأقران', value: null, reason: 'لم يؤكّد الخبير له إسهامًا في طلبات زملائه بعد' }], engagement: { label: 'الانخراط', value: 75 }, flags: [], events: [] },
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
    switch (b.action) {
      case 'xp.dashboard': return { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة محافظ', roles: ['advisor'] }, stats: { hours: 7.5, participants: 1, attended: 2, upcoming: 0, no_show: 0 }, rating: { count: 1, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', supervision: 'peers_expert' }] };
      case 'xp.participants': return { success: true, items: [{ id: 'p1', name: 'سارة الأحمد', first: 'سارة', title: 'مديرة مشاريع', org: 'جهة الاختبار', status: 'enrolled', cohort: 'دفعة نوفمبر', advisor: true, role_ar: null, level: 'intermediate', level_ar: 'متوسط', approved: true, stage: 'التوجيه على رأس العمل', progress: 55, late: 1, continuous: 72, needs: 4 }], cohorts: [] };
      case 'xp.participant': return file();
      case 'xp.reviews': return { success: true, advisor: true, items: [] };
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

test('مشاركو الخبير وملف المشارك: المطلوب الآن، اعتماد الختامي، تقييم المعلم بالمعيار، وتأكيد إجابات الأقران', async ({ page }) => {
  const s = server();
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto(PORTAL);
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  const mine = page.getByRole('region', { name: /مشاركوك/ });
  await expect(mine).toContainText('سارة الأحمد');
  await expect(mine).toContainText('4 بانتظارك');
  await expect(mine).toContainText('1 معلم متأخر');
  // القاعة من البوابة لدفعات المستشار
  await expect(page.getByRole('region', { name: 'القاعة الحية' })).toContainText('لا قاعة مفتوحة لهذه الدفعة');
  await mine.getByRole('button', { name: 'افتح الملف' }).click();

  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  const needs = page.locator('.xf-needs');
  await expect(needs).toContainText('1 تسليم بانتظار تقييمك');
  await expect(needs).toContainText('تقييم ختامي بانتظار اعتمادك');
  await expect(needs).toContainText('2 إجابة من زملائه بانتظار تأكيدك');
  await expect(page.getByRole('region', { name: 'من هو' })).toContainText('إدارة المشروعات');
  await expect(page.getByRole('region', { name: 'أين هو' })).toContainText('التوجيه على رأس العمل');
  await expect(page.getByRole('region', { name: 'ما حدث' })).toContainText('اتفاق التعلم الثلاثي');

  // تقييم المعلم المنجز بالمعيار من البوابة
  await page.getByRole('button', { name: 'قيّم بالمعيار' }).click();
  await page.locator('.xf-rubric').getByLabel('الفهم').selectOption('3');
  await page.locator('.xf-rubric').getByLabel('التنفيذ').selectOption('4');
  await page.getByRole('button', { name: 'احفظ التقييم' }).click();
  await expect.poll(() => s.calls.find((c) => c.action === 'xp.milestone')).toMatchObject({ participant_id: 'p1', milestone_id: 'm1', scores: { understanding: '3', execution: '4' } });

  // تأكيد إجابة زميل وتصحيح أخرى بملاحظة
  const peer = page.getByRole('region', { name: 'طلبات التوجيه' });
  await peer.locator('.xf-answer').first().getByRole('button', { name: 'أكّد' }).click();
  await expect.poll(() => s.calls.find((c) => c.action === 'xp.peer-review')).toMatchObject({ answer_id: 'a1', status: 'confirmed' });
  const second = peer.locator('.xf-answer').nth(1);
  await expect(second.getByRole('button', { name: 'صحّح' })).toBeDisabled();
  await second.getByLabel('ملاحظة التصحيح').fill('الربط ضروري: كل منفعة تحتاج معلم قرار يثبت تحققها.');
  await second.getByRole('button', { name: 'صحّح' }).click();
  await expect.poll(() => s.calls.filter((c) => c.action === 'xp.peer-review').length).toBe(2);
  expect(s.calls.filter((c) => c.action === 'xp.peer-review')[1]).toMatchObject({ answer_id: 'a2', status: 'corrected' });

  // اعتماد الختامي من البوابة
  const fin = page.getByRole('region', { name: 'التقييم الختامي' });
  await expect(fin).toContainText('بانتظار الاعتماد');
  await expect(fin).toContainText('78٪');
  await fin.getByRole('button', { name: 'اعتمد' }).click();
  await expect.poll(() => s.calls.find((c) => c.action === 'xp.final-eval-vote')).toMatchObject({ participant_id: 'p1', vote: 'approve' });
  await expect(fin).toContainText('معتمد');
});

test('طابور الأقران في لوحة الخبير: إجابة الخبير نفسه تُرسل مؤكَّدة', async ({ page }) => {
  const s = server();
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), XP_TOKEN);
  await page.goto(PORTAL);
  const q = page.getByRole('region', { name: /طلبات الأقران/ });
  await expect(q).toContainText('كيف أربط سجل المعالم');
  await expect(q).toContainText('الأقران يجيبون ويؤكّد الخبير');
  await expect(q.getByRole('button', { name: 'أجب' })).toBeDisabled();
  await q.getByLabel('إجابتك').fill('اربط كل منفعة بمعلم القرار الذي يثبتها، وراجعهما معًا في كل بوابة.');
  await q.getByRole('button', { name: 'أجب' }).click();
  await expect.poll(() => s.calls.find((c) => c.action === 'xp.peer-answer')).toMatchObject({ request_id: 'q1' });
});
