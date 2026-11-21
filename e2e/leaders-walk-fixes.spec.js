// جولة المشارك 2026-11-19: إصلاحات مؤكدة في تطبيق المشارك على عرض 390. كل اختبار يعيد إنتاج الخلل كما وُصف في الجولة
// ويثبت علاجه: أبواب القراءة، والشريطان الثابتان ورسالة الرفض بزر «حدّث»، والنتيجة الختامية بحسب القرار، وتلميح القياس
// البعدي، وبطاقات الخبراء، وعد المراحل، والمعدود العربي، والاستبانة، و«اذهب إليها»، وصغائر الجدول. الخلفية خادم المحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
// عامل الخدمة يجلب الملفات بنفسه فلا يراها page.route (version.json)
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const later = (h) => new Date(Date.now() + h * 36e5).toISOString();
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const stage = (key, title_ar, phase, status, items = [], extra = {}) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length, ...extra });
const req = (id, title_ar, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'task', title_ar, required: true, status, ...extra });
const ADMISSION = [stage('profile', 'الملف الشخصي', 'admission', 'done'), stage('assessment', 'تحديد المستوى', 'admission', 'done'), stage('approval', 'اعتماد المستوى', 'admission', 'done')];
const training = () => [
  req('r1', 'قراءة كتابك الشخصي', 'pending', { code: 'T-HB', kind: 'reading', activity: { type: 'reading', done: false, count: 1, total: 3, quiz: true, chapters: [
    { id: 'c1', title: 'المعالم نقاط قرار', state: 'read', pct: 100, quiz: false, dimension: 'milestone' },
    { id: 'c2', title: 'سلسلة القيمة', state: 'skimmed', pct: 40, quiz: false, dimension: 'impact' },
    { id: 'c3', title: 'قيادة التنفيذ', state: 'unread', pct: 0, quiz: false, dimension: 'leadership' }] } }),
  req('r3', 'حضور الأيام التدريبية', 'pending', { code: 'T-ATTEND', kind: 'workshop', activity: { type: 'workshop', done: false, count: 0, total: 1, verify: 'qr', sessions: [
    { id: 'w2', title: 'اليوم الثاني: Impact', mode: 'in_person', location: 'الرياض', starts_at: later(-1), ends_at: later(5), attended: false, open: true }] } }),
  req('r5', 'خطة التطبيق في العمل', 'pending', { kind: 'upload', needs_review: true }),
  req('r6', 'تحليل أصحاب المصلحة', 'returned', { kind: 'upload', needs_review: true, note: 'أضف مالك كل إجراء وموعده.' }),
  req('r7', 'عرّف فريقك بالبرنامج'),
  req('r8', 'استبانة رضاك عن الأيام التدريبية', 'pending', { kind: 'survey', config: { questions: 'ما تقييمك العام للأيام التدريبية؟\n(نص اختياري) ما الذي نحسّنه؟' } }),
];
// رحلة الجولة: 3 قبول منجزة، والتأهيل فيه مرحلتان «عند الحاجة»، ثم 3 للأثر
const HOME = () => [...ADMISSION,
  stage('training', 'التدريب', 'qualification', 'active', training(), { duration_label: '4 أيام تدريبية' }),
  stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'locked', [], { lock_reason: 'تُفتح بعد اكتمال: التدريب' }),
  stage('consulting', 'الاستشارة', 'qualification', 'locked', [], { stage_mode: 'on_demand' }),
  stage('leadership_coaching', 'التوجيه القيادي', 'qualification', 'locked', [], { stage_mode: 'on_demand' }),
  stage('support', 'الدعم والتمكين', 'impact', 'locked'),
  stage('evaluation', 'التقييم والقياس', 'impact', 'locked', [req('e1', 'القياس البعدي', 'pending', { code: 'E-POST', auto: true })], { lock_reason: 'تُفتح بعد اكتمال: الدعم والتمكين' }),
  stage('report', 'التقرير النهائي', 'impact', 'locked', [req('rr', 'استلام التقرير', 'pending', { code: 'R-ISSUE', auto: true })])];
const ENDED = (ev, rep) => [...ADMISSION, stage('training', 'التدريب', 'qualification', 'done'), stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'done'), stage('support', 'الدعم والتمكين', 'impact', 'done'),
  stage('evaluation', 'التقييم والقياس', 'impact', ev, [req('e1', 'القياس البعدي', ev === 'done' ? 'done' : 'pending', { code: 'E-POST', auto: true })]),
  stage('report', 'التقرير النهائي', 'impact', rep, [req('rr', 'استلام التقرير', rep === 'done' ? 'done' : 'pending', { code: 'R-ISSUE', auto: true })], rep === 'locked' ? { lock_reason: 'تُفتح بعد اكتمال: التقييم والقياس' } : {})];
const POLICY = { version: '1.0', weights: { continuous: 30, capstone: 40, measure: 20, attendance: 10 }, thresholds: { pass: 80, pass_notes: 70, extend: 60 }, measure: { mode: 'mastery', mastery_cut: 70 } };

async function open(page, { journey = HOME(), patch = {}, state = {}, replies = () => undefined, store = {} } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true, ...state });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const own = replies(b);
    if (own) return route.fulfill({ status: own.code === 'update_required' ? 426 : 200, json: own });
    const r = srv.reply(b);
    if (b.action !== 'me') return route.fulfill({ json: r });
    return route.fulfill({ json: { ...r, journey, ...patch, participant: { ...r.participant, ...(patch.participant || {}) } } });
  });
  await page.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); },
    { mi_leaders_session: 'tok-walk-fixes-00000000000000', mi_leaders_welcome_seen: 'true', mi_leaders_next_seen: 'true', ...store });
  await page.goto(APP);
  await expect(page.locator('.hero')).toBeVisible();
}
const rect = (loc) => loc.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; });

test('1: صف باب القراءة على 390: العنوان سطر كامل والشارات تحته بلا تراكب', async ({ page }) => {
  await open(page);
  const row = page.locator('#stage-training .act-read').first();
  await row.scrollIntoViewIfNeeded();
  const [li, title, chip] = await Promise.all([rect(row), rect(row.locator('.grow')), rect(row.locator('.chip.warn'))]);
  // كان العنوان 27 بكسل من 194 فتنزل كل كلمة في سطر
  expect(title.width).toBeGreaterThan(li.width - 2);
  expect(chip.top).toBeGreaterThanOrEqual(title.bottom - 1);
  await expect(row.locator('.chip.warn')).toHaveText('بقي الاختبار');
});

test('2: شريط «تحديث جديد متاح» ثابت تحت الترويسة، ورسالة الرفض update_required تحمل زر «حدّث»', async ({ page }) => {
  let build = 'same';
  await page.route(/\/version\.json(?:\?|$)/, (r) => (build === 'same' ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: '{"build":"NEWbuild1"}' })));
  let docs = 0;
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) docs += 1; });
  await open(page, { replies: (b) => (b.action === 'requirement.update' ? { success: false, code: 'update_required', message: 'حدّث الصفحة للمتابعة' } : undefined) });
  const item = page.locator('.item', { hasText: 'عرّف فريقك بالبرنامج' });
  await item.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(600);
  // الدوال سبقت الواجهة (البناء نفسه على الموقع): لا شريط، والرسالة باقية بزرها، و«حدّث» لا يعيد تحميلًا لا يغيّر شيئًا
  await item.getByRole('button', { name: 'أنجزته' }).click();
  const refusal = page.getByTestId('update-refusal');
  await expect(refusal).toContainText('حدّث الصفحة للمتابعة');
  await page.waitForTimeout(3000);   // الإشعار العابر زال (2.6 ثانية)، والرسالة بزرها باقية
  await expect(refusal.getByRole('button', { name: 'حدّث', exact: true })).toBeVisible();
  await expect(page.getByTestId('update-bar')).toHaveCount(0);
  await refusal.getByRole('button', { name: 'حدّث', exact: true }).click();
  await expect(refusal).toContainText('التحديث لم يصل إلى جهازك بعد');
  expect(docs).toBe(1);
  // الرسالة فوق شريط التنقل السفلي لا تحته
  expect((await rect(refusal)).bottom).toBeLessThanOrEqual((await rect(page.locator('.tabbar'))).top);
  // نُشر الإصدار: الشريط يظهر والمشارك في منتصف الصفحة، تحت الترويسة مباشرة لا خارج الشاشة
  build = 'new';
  await item.getByRole('button', { name: 'أنجزته' }).click();
  const bar = page.getByTestId('update-bar');
  await expect(bar).toBeVisible();
  // (حركة دخول الشريط ربع ثانية، فيُنتظر استقراره)
  const gap = async () => Math.abs((await rect(bar)).top - (await rect(page.locator('.topbar'))).bottom);
  await expect.poll(gap).toBeLessThanOrEqual(1);
  await expect(bar).toBeInViewport();
  // وفي أعلى الصفحة: تحت الترويسة أيضًا، ولا يغطي أول المحتوى
  await page.evaluate(() => window.scrollTo(0, 0));
  const [b0, top0, main0] = await Promise.all([rect(bar), rect(page.locator('.topbar')), rect(page.locator('main'))]);
  expect(Math.abs(b0.top - top0.bottom)).toBeLessThanOrEqual(1);
  expect(main0.top).toBeGreaterThanOrEqual(b0.bottom - 1);
  // «حدّث» من الرسالة: إعادة تحميل واحدة إلى القسم نفسه
  await refusal.getByRole('button', { name: 'حدّث', exact: true }).click();
  await expect.poll(() => docs).toBe(2);
});

test('2: شريط «أنت دون اتصال» ثابت تحت الترويسة عند التمرير', async ({ page, context }) => {
  await open(page);
  await context.setOffline(true);
  const bar = page.locator('.offline-bar');
  await expect(bar).toBeVisible();
  await page.locator('.item', { hasText: 'عرّف فريقك بالبرنامج' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(600);
  const [b, top] = await Promise.all([rect(bar), rect(page.locator('.topbar'))]);
  expect(Math.abs(b.top - top.bottom)).toBeLessThanOrEqual(1);
  await expect(bar).toBeInViewport();
  await context.setOffline(false);
});

const final = (decision, decision_ar, score, notes = null) => ({ decision, decision_ar, score, decided_at: '2027-02-20T10:00:00Z', notes });
const cert = (b) => (b.action === 'certificate' ? { success: true, certificate: null } : undefined);

test('3: «لم يجتز»: الرأس لا يهنئ، والنتيجة في الشاشة الأولى ومعها «التالي»', async ({ page }) => {
  await open(page, { journey: ENDED('done', 'done'), patch: { progress: 100, final: final('fail', 'لم يجتز', 41), final_policy: POLICY }, replies: cert });
  const hero = page.locator('.hero');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('سارة، صدرت نتيجة تقييمك الختامي');
  await expect(hero).toContainText('أنهيت مراحل الرحلة، وقرار تقييمك الختامي: لم يجتز.');
  await expect(hero).not.toContainText('رحلتك مفتوحة');
  await expect(page.locator('main')).not.toContainText('أثرك الآن موثّق');
  await expect(page.locator('main')).not.toContainText('مبارك');
  const res = page.getByTestId('final-result');
  await expect(res).toContainText('نتيجة تقييمك الختامي: لم يجتز (41٪).');
  await expect(res).toBeInViewport();
  expect((await rect(res)).top).toBeLessThan(844);
  await expect(res.getByTestId('final-next')).toContainText('التالي: للاستفسار عن نتيجتك وما بعدها راسل mi@sunkvalue.com.');
  await expect(res.getByRole('link', { name: 'mi@sunkvalue.com' })).toHaveAttribute('href', 'mailto:mi@sunkvalue.com');
  // طريقة المراجعة ومهلتها في «كيف يُقيَّم عملك» المعروضة في الصفحة نفسها، لا وعد جديد هنا
  await expect(res).toContainText('ولطلب مراجعة القرار: الطريقة والمهلة في «كيف يُقيَّم عملك في نهاية البرنامج» أدناه.');
  await expect(page.locator('.how-eval')).toContainText('فاطلب مراجعته بالرد على بريد القرار خلال عشرة أيام عمل');
  // النتيجة مرة واحدة في الصفحة
  await expect(page.getByText('نتيجة تقييمك الختامي:')).toHaveCount(1);
});

test('3: «تمديد» و«اجتاز» و«لم تصدر بعد»: الرأس وسطر «التالي» بحسب القرار', async ({ page }) => {
  await open(page, { journey: ENDED('done', 'active'), patch: { progress: 92, final: final('extend', 'تمديد', 64, 'ينقصك دليل الأثر لمبادرتك.'), final_policy: POLICY }, replies: cert });
  await expect(page.locator('.hero h1')).toHaveText('سارة، مُدّدت مرحلتك لتستكمل ما ينقص');
  await expect(page.locator('.hero')).toContainText('المرحلة الحالية: التقرير النهائي');
  let res = page.getByTestId('final-result');
  await expect(res).toContainText('نتيجة تقييمك الختامي: تمديد (64٪).');
  await expect(res).toContainText('ملاحظات خبيرك: «ينقصك دليل الأثر لمبادرتك.»');
  await expect(res.getByTestId('final-next')).toContainText('التالي: استكمل ما ينقص في مرحلتك الممددة، وابدأ بملاحظات خبيرك. لخطة الاستكمال راسل mi@sunkvalue.com.');

  const p2 = await page.context().newPage();
  await open(p2, { journey: ENDED('done', 'done'), patch: { progress: 100, final: final('pass', 'اجتاز', 86), final_policy: POLICY, participant: { status: 'completed', name_confirmed: true } }, replies: cert });
  await expect(p2.locator('.hero h1')).toHaveText('مبارك سارة، اجتزت التقييم الختامي');
  await expect(p2.locator('.hero')).toContainText('أكملت الرحلة كاملة. أثرك الآن موثّق.');
  res = p2.getByTestId('final-result');
  await expect(res.getByTestId('final-next')).toHaveText('التالي: شهادتك في بطاقة «شهادة الإتمام بنجاح» أدناه.');
  await expect(p2.locator('.cert-card')).toBeVisible();
  expect((await rect(res)).top).toBeLessThan((await rect(p2.locator('.cert-card'))).top);
  await p2.close();

  const p3 = await page.context().newPage();
  await open(p3, { journey: ENDED('done', 'done'), patch: { progress: 100, final: null, final_policy: POLICY }, replies: cert });
  await expect(p3.locator('.hero h1')).toHaveText('سارة، أنهيت مراحل رحلتك');
  await expect(p3.locator('.hero')).toContainText('تقييمك الختامي لم يُعتمد بعد، وتظهر نتيجته هنا حين يُعتمد.');
  await expect(p3.locator('.hero')).not.toContainText('أثرك الآن موثّق');
  await expect(p3.getByTestId('final-result')).toHaveCount(0);
  await p3.close();
});

test('4: «يُفتح القياس البعدي حين تصل…» للمرحلة المقفلة وحدها، لا فوق زر «ابدأ القياس البعدي»', async ({ page }) => {
  await open(page, { journey: ENDED('active', 'locked'), patch: { progress: 82 } });
  const open4 = page.locator('#stage-evaluation .item', { hasText: 'القياس البعدي' });
  await expect(open4.getByRole('button', { name: 'ابدأ القياس البعدي' })).toBeVisible();
  await expect(open4).not.toContainText('يُفتح القياس البعدي حين تصل إلى مرحلة التقييم');
  // والمقفلة: التلميح باقٍ ولا زر
  const p2 = await page.context().newPage();
  const j = ENDED('locked', 'locked'); j[5] = stage('support', 'الدعم والتمكين', 'impact', 'active', [req('s1', 'تقرير الأثر')]);
  await open(p2, { journey: j, patch: { progress: 70 } });
  await p2.locator('.j-later > summary').click();
  await p2.locator('#stage-evaluation .stage-top').click();
  const locked = p2.locator('#stage-evaluation .item', { hasText: 'القياس البعدي' });
  await expect(locked).toContainText('يُفتح القياس البعدي حين تصل إلى مرحلة التقييم.');
  await expect(locked.getByRole('button', { name: 'ابدأ القياس البعدي' })).toHaveCount(0);
  await p2.close();
});

test('5: بطاقة الخبير المرشح: الاسم ثم المسمى ثم الزر، كل في سطره', async ({ page }) => {
  await open(page, { patch: { guidance: { ready: true, signals: ['quiz'] } }, replies: (b) => (b.action === 'experts.suggest' ? { success: true, requests: [], recent: [],
    roles: [{ key: 'coach', title: 'موجّه', hint: 'جلسات التوجيه' }], dimensions: { milestone: 'Milestone' }, contexts: { program: 'خلال البرنامج' },
    candidates: [{ id: 'e1', full_name: 'د. ريم الشهري', title: 'خبيرة إدارة مشاريع صحية', years: 12 }, { id: 'e2', full_name: 'م. فهد القحطاني', title: 'مستشار تحول', years: 15 }] } : undefined) });
  // «التوجيه والإرشاد» مطوي على الهاتف كبقية الأقسام الثانوية (رحلة المشارك، البند 1): يُفتح بسطره ثم يُطلب
  await page.locator('[data-fold="guidance"] > summary').click();
  await page.getByRole('button', { name: 'اطلب الآن' }).first().click();
  const card = page.locator('.cx-card').first();
  await card.scrollIntoViewIfNeeded();
  const [name, title, btn, box] = await Promise.all([rect(card.locator('b')), rect(card.locator('small')), rect(card.getByRole('button', { name: 'اختره' })), rect(card)]);
  expect(title.top).toBeGreaterThanOrEqual(name.bottom - 1);
  expect(btn.top).toBeGreaterThanOrEqual(title.bottom - 1);
  // الزر بعرض البطاقة لا في وسط السطر
  expect(btn.width).toBeGreaterThan(box.width - 40);
  // ولا يلتصق الاسم بالمسمى في نص البطاقة
  expect(await card.innerText()).toMatch(/د\. ريم الشهري\s*\n+\s*خبيرة إدارة مشاريع صحية/);
});

test('6: عدد المراحل واحد: مجموع عناوين الأطوار يساوي «أنجزت 3 من 8 مراحل» في الرأس', async ({ page }) => {
  await open(page);
  await expect(page.locator('.hero')).toContainText('أنجزت 3 من 8 مراحل');
  const tallies = await page.locator('.j-fold > summary', { hasText: /^\d\. / }).locator('.small').allInnerTexts();
  const here = await page.locator('.phase-head:not(.fold-h) > .small').allInnerTexts();
  const all = [...tallies, ...here].map((t) => t.match(/(\d+) من (\d+)/)).filter(Boolean);
  expect(all).toHaveLength(3);
  expect(all.reduce((n, m) => n + Number(m[2]), 0)).toBe(8);
  expect(all.reduce((n, m) => n + Number(m[1]), 0)).toBe(3);
  // طور التأهيل: مرحلتان مطلوبتان، و«عند الحاجة» لا تُعد عليه
  await expect(page.locator('.phase-head', { hasText: 'التأهيل' })).toContainText('0 من 2');
});

test('7: المعالم المتأخرة بالمعدود العربي', async ({ page }) => {
  await open(page, { patch: { milestones: [
    { id: 'm1', title_ar: 'تسمية المبادرة', due: day(-12), status: 'late', late_days: 12 },
    { id: 'm2', title_ar: 'بطاقة المبادرة', due: day(-2), status: 'late', late_days: 2 },
    { id: 'm3', title_ar: 'هيكل تجزئة العمل', due: day(3), status: 'due_soon', late_days: 0 }],
  milestone_summary: { done: 0, total: 3, late: 2, max_late: 12, pct: 0 } } });
  const fold = page.locator('.j-fold', { hasText: 'معالمك' });
  await expect(fold.locator('summary')).toContainText('اثنان متأخران');
  await fold.locator('summary').click();
  await expect(fold).toContainText('لديك معلمان متأخران، وأقصى التأخر 12 يومًا.');
  await expect(fold.locator('.ms-list li').nth(0).locator('.chip')).toHaveText('متأخر 12 يومًا');
  await expect(fold.locator('.ms-list li').nth(1).locator('.chip')).toHaveText('متأخر يومين');
  await expect(fold).not.toContainText('2 معالم');
  await expect(fold).not.toContainText(/(?<!\d)2 يومًا/);
});

test('8: الاستبانة: سؤال النص مربوط بحقله، والنجوم 44 بلا تمرير أفقي', async ({ page }) => {
  await open(page);
  const li = page.locator('.item', { hasText: 'استبانة رضاك' });
  await li.scrollIntoViewIfNeeded();
  await expect(li.getByLabel('ما الذي نحسّنه؟')).toBeVisible();
  await li.getByLabel('ما الذي نحسّنه؟').fill('القاعة');
  for (const s of await li.locator('.rx-stars button').all()) {
    const b = await rect(s);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  const [stars, box] = await Promise.all([rect(li.locator('.rx-stars')), rect(li.locator('.survey'))]);
  expect(stars.width).toBeLessThanOrEqual(box.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await li.getByRole('radio', { name: '4 من 5' }).click();
  await expect(li.getByRole('radio', { name: '4 من 5' })).toHaveAttribute('aria-checked', 'true');
});

test('9: «اذهب إليها» تمرر إلى البند نفسه وتعطيه التركيز', async ({ page }) => {
  await open(page);
  const card = page.locator('.j-next .next-card', { hasText: 'مطلوب تعديله' });
  await expect(card).toContainText('تحليل أصحاب المصلحة');
  await card.getByRole('button', { name: 'اذهب إليها' }).click();
  const item = page.locator('#item-r6');
  await expect(item).toBeFocused();
  await expect(item).toBeInViewport({ ratio: 0.9 });
  await expect(item).toContainText('تحليل أصحاب المصلحة');
  // تحت الترويسة الثابتة لا خلفها
  expect((await rect(item)).top).toBeGreaterThanOrEqual((await rect(page.locator('.topbar'))).bottom);
});

test('10: مربع الموافقة في «ملفي» بجانب نصه وبحجم يُلمس', async ({ page }) => {
  await open(page);
  await page.locator('.tabbar').getByRole('button', { name: 'ملفي' }).click();
  const label = page.locator('.org-see .consent-check');
  await label.scrollIntoViewIfNeeded();
  const [box, text] = await Promise.all([rect(label.locator('input')), rect(label.locator('span'))]);
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  // في السطر الأول من نصه لا فوقه (كان 13 بكسل وحده في سطر)
  expect(Math.abs(box.top - text.top)).toBeLessThan(12);
  await label.locator('span').click();
  await expect(label.locator('input')).toBeChecked();
});

test('10: صيغة الوقت واحدة في بطاقة «جلستك الآن» وفي قائمة الجلسات', async ({ page }) => {
  await open(page);
  const card = await page.locator('.j-session .small.muted').first().innerText();
  const row = await page.locator('.act-session', { hasText: 'اليوم الثاني' }).locator('.grow .small').innerText();
  const time = card.match(/\d{1,2}:\d{2}\s*\S+/)?.[0];
  expect(time).toBeTruthy();
  expect(time).not.toMatch(/^0\d:/);
  expect(row).toContain(time);
  // واليوم والتاريخ بالصيغة نفسها
  expect(row).toContain(card.split(' · ')[0]);
});

test('10: بطاقة «أرسلت قياسك»: «تكمل ما بقي» فقط إن بقي شيء', async ({ page }) => {
  const waiting = [stage('profile', 'الملف الشخصي', 'admission', 'done', [req('p1', 'بيانات الملف', 'done', { auto: true, code: 'P-INFO' })]), stage('assessment', 'تحديد المستوى', 'admission', 'done'),
    stage('approval', 'اعتماد المستوى', 'admission', 'active', [req('ap', 'اعتماد مسارك', 'pending', { auto: true, code: 'AP-OK' })]), stage('training', 'التدريب', 'qualification', 'locked')];
  const opts = { state: { approved: false }, patch: { progress: 30 }, store: { mi_leaders_next_seen: 'false' } };
  await open(page, { ...opts, journey: waiting });
  await expect(page.locator('.onb-next')).toContainText('حتى ذلك الحين لا شيء مطلوب منك.');
  await expect(page.locator('.onb-next')).not.toContainText('تكمل ما بقي من قائمة التحقق');
  const p2 = await page.context().newPage();
  const left = waiting.map((s) => (s.key === 'profile' ? stage('profile', 'الملف الشخصي', 'admission', 'active', [...s.items, req('cv', 'ارفع سيرتك الذاتية', 'pending', { auto: true, code: 'P-CV', required: false })]) : s));
  await open(p2, { ...opts, journey: left });
  await expect(p2.locator('.onb-next')).toContainText('تكمل ما بقي من قائمة التحقق أدناه');
  await p2.close();
});

test('10: بند من المسار المستمر في «خطوتك التالية» يُسمى مساره، فلا يناقض «المرحلة الحالية» في الرأس', async ({ page }) => {
  const journey = [...ADMISSION, stage('training', 'التدريب', 'qualification', 'done'),
    stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'active', [req('o2', 'سجل المنافع')], { lane: 'track', track: { with: 'training', until: 'journey_end', due_before: 'report' } }),
    stage('support', 'الدعم والتمكين', 'impact', 'active', [req('s1', 'تقرير الأثر', 'pending', { auto: true })]),
    stage('report', 'التقرير النهائي', 'impact', 'locked')];
  await open(page, { journey, patch: { progress: 50 } });
  await expect(page.locator('.hero')).toContainText('المرحلة الحالية: الدعم والتمكين');
  const card = page.locator('.j-next .next-card', { hasText: 'خطوتك التالية' });
  // البند التالي نفسه كما كان، ومعه أنه من المسار
  await expect(card.locator('b')).toHaveText('سجل المنافع');
  await expect(card).toContainText('من مسارك المستمر: التوجيه على رأس العمل');
});
