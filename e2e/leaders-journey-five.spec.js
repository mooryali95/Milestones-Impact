// رحلة المشارك، البنود الخمسة (جولة المشارك 2026-11-19) على عرضي 390 و1440: رئيسية أقصر على الهاتف بطيّ يُتذكر، وتواريخ
// المراحل من خطة الدفعة، وتفصيل النتيجة الختامية، واسم الملف المرفوع واستبداله بتأكيد، وسبب توقف المرحلة من حالتها.
// الخلفية خادم المحاكاة، وما يرسله الخادم هنا بشكل ما يحسبه participant.ts (journey_five_test.ts يحرس الشكل نفسه).
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.J5_SHOTS || '';
test.use({ serviceWorkers: 'block' });

const WIDTHS = [390, 1440];
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const ar = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', ...(iso.slice(0, 4) !== String(new Date().getUTCFullYear()) ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const range = (a, b) => `من ${a.slice(0, 7) === b.slice(0, 7) ? Number(a.slice(8, 10)) : ar(a)} إلى ${ar(b)}`;
const stage = (key, title_ar, phase, status, items = [], extra = {}) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length, ...extra });
const req = (id, title_ar, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'task', title_ar, required: true, status, ...extra });
const W = { profile: [-30, -29], assessment: [-28, -27], approval: [-26, -25], training: [-10, 4], ojt_coaching: [5, 32], support: [33, 60], evaluation: [61, 74], report: [75, 81] };
const win = (k) => ({ window: { from: day(W[k][0]), to: day(W[k][1]) } });
const FILE_AT = '2026-11-18T09:30:00Z';

// رحلة مؤرخة: القبول منجز، والتدريب جارٍ وينتهي بعد 4 أيام، وما بعده مقفل بتفصيل قفله
const HOME = () => [
  stage('profile', 'الملف الشخصي', 'admission', 'done', [req('p1', 'بيانات الملف', 'done', { auto: true, code: 'P-INFO' })], { duration_label: 'دقائق', ...win('profile') }),
  stage('assessment', 'تحديد المستوى', 'admission', 'done', [req('a1', 'إرسال القياس', 'done', { auto: true, code: 'A-DONE' })], { duration_label: '12 دقيقة', ...win('assessment') }),
  stage('approval', 'اعتماد المستوى', 'admission', 'done', [req('ap', 'اعتماد مسارك', 'done', { auto: true, code: 'AP-OK' })], { duration_label: 'يوما عمل', ...win('approval') }),
  stage('training', 'التدريب', 'qualification', 'active', [
    req('r5', 'خطة التطبيق في العمل', 'pending', { kind: 'upload', needs_review: true, help_ar: 'ارفع خطتك في صفحة واحدة.' }),
    req('r6', 'تحليل أصحاب المصلحة', 'returned', { kind: 'upload', needs_review: true, note: 'أضف مالك كل إجراء وموعده.', file: { name: 'تحليل أصحاب المصلحة v1.pdf', at: FILE_AT, kind: 'ملف PDF' } }),
    req('r9', 'تقرير الملاحظة الأولى', 'submitted', { kind: 'upload', needs_review: true, file: { name: 'تقرير الملاحظة.docx', at: FILE_AT, kind: 'ملف Word' } }),
    req('r4', 'نموذج الالتزام الموقّع', 'done', { kind: 'upload', needs_review: true, file: { name: 'الالتزام.pdf', at: FILE_AT, kind: 'ملف PDF' } }),
    req('r7', 'عرّف فريقك بالبرنامج'),
    req('r10', 'قراءة إثرائية', 'pending', { required: false }),
  ], { mode: 'hybrid', duration_label: '4 أيام تدريبية', work_mode: 'shared', ...win('training'),
    description_ar: 'أربعة أيام تدريبية تبني فيها لغة مشتركة للأطر الثلاثة وتسمّي مبادرتك.', activities_ar: 'تحضر الأيام الأربعة\nتقرأ أبواب كتابك', outcome_ar: 'خطة تطبيق معتمدة ومبادرة مسماة.' }),
  stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'locked', [req('o1', 'جلسات التوجيه')], { duration_label: '4 أسابيع', ...win('ojt_coaching'), lock_reason: 'تُفتح بعد اكتمال: التدريب', lock: { unlock: 'previous', waits: ['training'], due: [] } }),
  stage('support', 'الدعم والتمكين', 'impact', 'locked', [], { duration_label: '4 أسابيع', ...win('support'), lock_reason: 'تُفتح حين يفتحها لك فريق البرنامج', lock: { unlock: 'approval', waits: [], due: [] } }),
  stage('evaluation', 'التقييم والقياس', 'impact', 'locked', [req('e1', 'القياس البعدي', 'pending', { code: 'E-POST', auto: true })], { duration_label: 'أسبوعان', ...win('evaluation'), lock_reason: `تُفتح في ${day(61)}`, lock: { unlock: 'day', waits: [], due: [], date: day(61) } }),
  stage('report', 'التقرير النهائي', 'impact', 'locked', [req('rr', 'استلام التقرير', 'pending', { code: 'R-ISSUE', auto: true })], { duration_label: 'أسبوع', ...win('report'), lock_reason: 'تُفتح بعد اكتمال: التقييم والقياس', lock: { unlock: 'previous', waits: ['support', 'evaluation'], due: [] } }),
];
const ENDED = () => HOME().map((s) => ({ ...s, status: 'done', lock: undefined, lock_reason: undefined, items: s.items.map((i) => ({ ...i, status: 'done' })) }));
const MS = { milestones: [{ id: 'm1', title_ar: 'تسمية المبادرة', due: day(-2), status: 'late', late_days: 2 }, { id: 'm2', title_ar: 'بطاقة المبادرة', due: day(9), status: 'on_time', late_days: 0 }], milestone_summary: { done: 0, total: 2, late: 1, max_late: 2, pct: 0 } };
const POLICY = { version: 1, weights: { continuous: 30, milestones: 20, project: 30, post: 20 }, thresholds: { pass: 70, pass_notes: 60, extend: 45 }, measure: { mode: 'mastery', mastery_cut: 70 } };
const EXTRA = { ...MS, final_policy: POLICY, advisor: { full_name: 'م. عمر الزهراني' }, group: { name: 'فريق التوجيه', members: 5 }, guidance: { ready: false, signals: [] } };
const C = { continuous: 'التقييم المستمر طوال التأهيل', milestones: 'إنجاز المعالم في مواعيدها', project: 'المشروع (وثيقة المبادرة بمعيارها)', post: 'القياس النهائي' };
const detail = (vals, extra = {}) => ({ components: Object.entries(vals).map(([key, [value, state = 'scored']]) => ({ key, label: C[key], weight: POLICY.weights[key], value, state })), coverage: 100, score_adjusted: false, thresholds: POLICY.thresholds, ...extra });
const FINALS = {
  pass: { score: 84, decision: 'pass', decision_ar: 'اجتاز', notes: null, detail: detail({ continuous: [88], milestones: [80], project: [85], post: [81] }) },
  extend: { score: 52, decision: 'extend', decision_ar: 'يُمدَّد', notes: 'استكمل سجل المنافع وخطة الأدلة.', detail: detail({ continuous: [70], milestones: [50], project: [null, 'missing'], post: [36] }, { coverage: 70 }) },
  fail: { score: 41, decision: 'fail', decision_ar: 'لم يجتز', notes: 'لم تُسلَّم وثيقة المبادرة.', detail: detail({ continuous: [62], milestones: [45], project: [0, 'zeroed'], post: [58] }, { score_adjusted: true }) },
};

// رفع الملف: رابط موقّع وهمي يقبل PUT، وتحديث البند يغيّر الرحلة كما يفعل الخادم (بانتظار المراجعة بملفه الجديد)
async function open(page, { journey = HOME(), patch = {}, store = {}, blockFolds = false } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const state = { journey, calls: [], puts: 0 };
  const me = () => { const r = srv.reply({ action: 'me' }); return { ...r, journey: state.journey, ...EXTRA, ...patch, participant: { ...r.participant, ...(patch.participant || {}) } }; };
  await page.route(/__upload\/evidence/, (route) => { state.puts += 1; return route.fulfill({ status: 200, body: '{}' }); });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    state.calls.push(b);
    if (b.action === 'me') return route.fulfill({ json: me() });
    if (b.action === 'upload.url') return route.fulfill({ json: { success: true, path: `p1/evidence/${state.puts + 1}.${b.ext}`, url: `${APP}__upload/evidence`, token: 't' } });
    if (b.action === 'requirement.update') {
      state.journey = state.journey.map((s) => ({ ...s, items: s.items.map((i) => (i.id !== b.requirement_id ? i : {
        ...i, status: i.needs_review ? 'submitted' : 'done', note: null,
        ...(b.evidence_path ? { evidence_path: b.evidence_path, file: { name: b.evidence_name, at: new Date().toISOString(), kind: 'ملف' } } : {}),
      })) }));
      return route.fulfill({ json: me() });
    }
    return route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(({ kv, block }) => {
    // مرة لكل متصفح لا لكل تحميل: إعادة التحميل تُبقي ما حفظه التطبيق (اختيارات الطي)
    if (!localStorage.getItem('mi_leaders_session')) for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    if (block) {
      // تخزين محجوب لمفاتيح الطي وحدها (الجلسة تبقى): القراءة والكتابة ترميان
      const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k) { if (String(k).startsWith('mi_leaders_folds_')) throw new Error('blocked'); return g.call(this, k); };
      Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('mi_leaders_folds_')) throw new Error('blocked'); return s.call(this, k, v); };
    }
  }, { kv: { mi_leaders_session: 'tok-journey-five-000000000000', mi_leaders_welcome_seen: 'true', mi_leaders_next_seen: 'true', ...store }, block: blockFolds });
  await page.goto(APP);
  await expect(page.locator('.hero')).toBeVisible();
  return state;
}
const ctxFor = (browser, width) => browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, locale: 'ar-SA', ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
const rect = (loc) => loc.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top + scrollY, height: b.height, width: b.width }; });
// اللقطة الكاملة بلا شريط التنقل السفلي الثابت: يقع وسط الصورة الطويلة فيغطي ما تحته
const shot = async (page, name, opts = {}) => {
  if (!SHOTS) return;
  if (opts.fullPage) await page.addStyleTag({ content: '.tabbar{display:none!important}' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts });
};
const noDash = async (loc) => expect(await loc.innerText()).not.toMatch(/[\u2013\u2014]/);

for (const width of WIDTHS) {
  const phone = width < 600;
  test.describe(`عرض ${width}`, () => {
    let ctx, page;
    test.beforeEach(async ({ browser }) => { ctx = await ctxFor(browser, width); page = await ctx.newPage(); });
    test.afterEach(async () => { await ctx.close(); });

    test('الرئيسية: المرحلة الحالية مفتوحة، والمنجزة والقادمة مطوية، ولا شيء محذوف', async () => {
      await open(page);
      const training = page.locator('#stage-training');
      await expect(training).toHaveClass(/open/);
      await expect(training.getByRole('button', { name: /التدريب/ }).first()).toHaveAttribute('aria-expanded', 'true');
      const order = async (sel) => (await rect(page.locator(sel).first())).top;
      if (phone) {
        // المراحل أولًا ثم الأقسام الثانوية مطوية: ترتيب العرض هو ترتيب المستند
        expect(await order('#stage-training')).toBeLessThan(await order('[data-fold="milestones"]'));
        expect(await order('#stage-training')).toBeLessThan(await order('[data-fold="guidance"]'));
        expect(await page.evaluate(() => [...document.querySelectorAll('.j-main > *')].findIndex((e) => e.matches('.section-title')))).toBe(0);
        // طور القبول المنجز سطر واحد يُفتح، وفيه مراحله المنجزة سطرًا لكل منها
        const admission = page.locator('[data-fold="phase-admission"]');
        await expect(admission).not.toHaveAttribute('open', '');
        expect((await rect(admission)).height).toBeLessThan(64);
        await admission.locator('summary').click();
        const done = page.locator('#stage-profile');
        await expect(done).toBeVisible();
        expect((await rect(done.locator('.stage-top'))).height).toBeLessThan(64);
        expect((await rect(done.locator('.stage-top'))).height).toBeGreaterThanOrEqual(44);
        await expect(done.locator('.meta')).toBeHidden();
        // المنجزة تُفتح فيظهر تاريخها وبنودها: مطوية لا محذوفة
        await done.locator('.stage-top').click();
        await expect(done.locator('.meta')).toBeVisible();
        await expect(done.getByText('بيانات الملف')).toBeVisible();
        // القادمة: مرحلة التأهيل المقفلة مدمجة باسمها وتاريخها وسبب قفلها، وطور الأثر مطوي بعنوانه
        const ojt = page.locator('#stage-ojt_coaching');
        await expect(ojt.getByTestId('stage-dates')).toBeVisible();
        await expect(ojt.locator('.meta .tag:not(.date)').first()).toBeHidden();
        expect((await rect(ojt.locator('.stage-top'))).height).toBeLessThan(150);
        await expect(page.locator('[data-fold="phase-impact"]')).not.toHaveAttribute('open', '');
        await page.locator('[data-fold="phase-impact"] > summary').click();
        await expect(page.locator('#stage-report')).toBeVisible();
        // وصف المرحلة الحالية مطوي في سطر، وقائمة التحقق ظاهرة
        const about = training.locator('.stage-about');
        await expect(about).not.toHaveAttribute('open', '');
        await expect(training.getByText('قائمة التحقق')).toBeVisible();
        await expect(training.getByText('ما تخرج به', { exact: true })).toBeHidden();
        expect((await rect(about.locator('summary'))).height).toBeGreaterThanOrEqual(44);
        // «مجموعتك» و«مستشارك» بطاقة واحدة، والأيقونة بجانب النص
        expect((await rect(page.locator('.j-people'))).height).toBeLessThan(140);
        // لا تمرير أفقي
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      } else {
        // على الحاسب الترتيب كما كان، والأقسام مفتوحة بلا سطر طي، ووصف المرحلة ظاهر
        expect(await order('[data-fold="milestones"]')).toBeLessThan(await order('#stage-training'));
        await expect(page.locator('[data-fold="milestones"] > summary')).toBeHidden();
        await expect(page.getByRole('heading', { name: 'معالمك' })).toBeVisible();
        await expect(training.locator('.stage-about')).toHaveCount(0);
        await expect(training.getByText('ما تخرج به', { exact: true })).toBeVisible();
        await expect(page.locator('#stage-profile .meta')).toBeVisible();
      }
      await expect(page.getByTestId('my-advisor')).toHaveText('مستشارك: م. عمر الزهراني. تصله النماذج التي تسلّمها ويقيّمها.');
    });

    test('تواريخ المراحل: المدى لكل مرحلة ونهاية الجارية، وبلا تواريخ لا يُعرض شيء', async () => {
      await open(page);
      const training = page.locator('#stage-training');
      await expect(training.getByTestId('stage-dates')).toHaveText(range(day(-10), day(4)));
      await expect(training.getByTestId('stage-end')).toHaveText(`تنتهي في ${ar(day(4))}، بقي 4 أيام`);
      // المقفلة بمداها المخطط ولا سطر نهاية لها
      const ojt = page.locator('#stage-ojt_coaching');
      await expect(ojt.getByTestId('stage-dates')).toHaveText(range(day(5), day(32)));
      await expect(ojt.getByTestId('stage-end')).toHaveCount(0);
      await noDash(training.locator('.stage-top'));
      await training.locator('.stage-top').evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await shot(page, `dates-${width}`);
      await ctx.close();
      // دفعة بلا تواريخ: لا وسم تاريخ ولا سطر نهاية ولا بديل عنهما
      ctx = await ctxFor(page.context().browser(), width); page = await ctx.newPage();
      await open(page, { journey: HOME().map(({ window: _w, ...s }) => s) });
      await expect(page.locator('#stage-training')).toBeVisible();
      await expect(page.getByTestId('stage-dates')).toHaveCount(0);
      await expect(page.getByTestId('stage-end')).toHaveCount(0);
      await expect(page.locator('#stage-training .stage-top')).not.toContainText('بلا موعد');
    });

    test('المرحلة المتوقفة: سبب من حالتها وما يفتحها، والموقوفة للدفعة تُسمّى', async () => {
      await open(page, { patch: { stages_off: [{ key: 'consulting', title_ar: 'الاستشارة', phase: 'qualification' }] } });
      await expect(page.locator('#stage-ojt_coaching').getByTestId('stage-hold')).toHaveText('تُفتح بعد أن تكمل «التدريب».');
      if (phone) await page.locator('[data-fold="phase-impact"] > summary').click();
      await expect(page.locator('#stage-support').getByTestId('stage-hold')).toHaveText('يفتحها لك فريق البرنامج حين يحين دورك فيها، ولا شيء مطلوب منك لفتحها.');
      await expect(page.locator('#stage-evaluation').getByTestId('stage-hold')).toHaveText(`لم يحن موعدها: تُفتح في ${ar(day(61))}.`);
      await expect(page.locator('#stage-report').getByTestId('stage-hold')).toHaveText('تُفتح بعد أن تكمل «الدعم والتمكين» و«التقييم والقياس».');
      // السبب جزء من اسم زر المرحلة، فيقرؤه قارئ الشاشة مع اسمها
      await expect(page.getByRole('button', { name: /التوجيه على رأس العمل.*تُفتح بعد أن تكمل «التدريب»/ })).toBeVisible();
      await expect(page.getByTestId('stages-off')).toHaveText('أُوقفت «الاستشارة» لدفعتك، فلا شيء مطلوب منك فيها. ما أنجزته فيها محفوظ.');
      await expect(page.locator('#stage-consulting')).toHaveCount(0);
      await page.locator('#stage-ojt_coaching').scrollIntoViewIfNeeded();
      await shot(page, `hold-${width}`);
      await ctx.close();
      // مرحلة جارية لا ينقصها إلا مراجعة المستشار: يُقال، وما بعدها ينتظر اعتماده
      ctx = await ctxFor(page.context().browser(), width); page = await ctx.newPage();
      const j = HOME().map((s) => (s.key !== 'training' ? s : { ...s, items: [req('r9', 'تقرير الملاحظة الأولى', 'submitted', { kind: 'upload', needs_review: true }), req('r10', 'قراءة إثرائية', 'pending', { required: false })] }));
      await open(page, { journey: j });
      await expect(page.locator('#stage-training').getByTestId('stage-hold')).toHaveText('لا شيء مطلوب منك الآن: «تقرير الملاحظة الأولى» عند مستشارك للمراجعة، وتكتمل المرحلة باعتماده.');
      await expect(page.locator('#stage-ojt_coaching').getByTestId('stage-hold')).toHaveText('تُفتح حين يعتمد مستشارك ما سلّمته في «التدريب».');
      await page.locator('#stage-training').scrollIntoViewIfNeeded();
      await shot(page, `hold-review-${width}`);
    });

    for (const [kind, f] of Object.entries(FINALS)) {
      test(`النتيجة الختامية مفصّلة (${f.decision_ar}): كل مكوّن بوزنه ودرجتك فيه`, async () => {
        await open(page, { journey: ENDED(), patch: { final: f, progress: 100 } });
        const box = page.getByTestId('final-result');
        await expect(box).toContainText(`نتيجة تقييمك الختامي: ${f.decision_ar} (${f.score}٪).`);
        const d = box.getByTestId('final-detail');
        await expect(d.getByRole('heading', { name: 'تفصيل درجتك: المكوّنات بأوزانها' })).toBeVisible();
        await expect(d.getByRole('listitem')).toHaveCount(4);
        for (const c of f.detail.components) {
          const li = d.locator(`[data-component="${c.key}"]`);
          await expect(li).toContainText(C[c.key]);
          await expect(li).toContainText(`وزنه ${c.weight}٪`);
          await expect(li.locator('.fd-score')).toHaveText(c.value == null ? 'لم يُحتسب' : `${c.value}٪`);
        }
        if (kind === 'extend') await expect(d.locator('[data-component="project"]')).toContainText('لم يدخل الحساب، ووُزّع وزنه على بقية المكوّنات');
        if (kind === 'fail') {
          await expect(d.locator('[data-component="project"]')).toContainText('لم يُسلَّم قبل نهاية الدفعة، فحُسب صفرًا');
          // قرار المالك: التعديل عند الاعتماد لا يُعلن للمشارك، ولا يُدّعى معه أن الدرجة حاصل المكوّنات
          await expect(d).not.toContainText('عُدّلت');
          await expect(d).not.toContainText('حاصل درجات المكوّنات');
        } else await expect(d).toContainText('درجتك النهائية حاصل درجات المكوّنات بأوزانها.');
        await expect(d).toContainText('حدود القرار: الاجتياز من 70٪، والاجتياز بملاحظات من 60٪، والتمديد من 45٪.');
        // صياغة القرار القائمة كما هي: سطر «التالي» وبريد الإدارة
        await expect(box.getByTestId('final-next')).toBeVisible();
        if (kind !== 'pass') await expect(box.getByRole('link', { name: 'mi@sunkvalue.com' })).toBeVisible();
        await expect(box.getByTestId('final-no-detail')).toHaveCount(0);
        await noDash(box);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        await shot(page, `final-${kind}-${width}`, { fullPage: true });
      });
    }

    test('نتيجة بلا تفصيل: البديل الصادق، ووعد بند «استلام التقرير» يطابق ما يُعرض', async () => {
      await open(page, { journey: ENDED(), patch: { final: { ...FINALS.pass, detail: null } } });
      const box = page.getByTestId('final-result');
      await expect(box.getByTestId('final-detail')).toHaveCount(0);
      await expect(box.getByTestId('final-no-detail')).toHaveText('تفصيل درجات المكوّنات غير متاح لهذه النتيجة. لطلبه راسل mi@sunkvalue.com.');
      await ctx.close();
      // وحين يحمل سطر «التالي» بريد الإدارة (تمديد أو لم يجتز) لا يتكرر البريد في سطر البديل
      ctx = await ctxFor(page.context().browser(), width); page = await ctx.newPage();
      await open(page, { journey: ENDED(), patch: { final: { ...FINALS.fail, detail: null } } });
      await expect(page.getByTestId('final-no-detail')).toHaveText('تفصيل درجات المكوّنات غير متاح لهذه النتيجة.');
      await expect(page.getByTestId('final-result').getByRole('link', { name: 'mi@sunkvalue.com' })).toHaveCount(1);
      await ctx.close();
      ctx = await ctxFor(page.context().browser(), width); page = await ctx.newPage();
      const j = HOME().map((s) => (s.key === 'report' ? { ...s, status: 'active', lock: undefined, lock_reason: undefined } : s.key === 'training' ? s : { ...s, status: 'done', lock: undefined, lock_reason: undefined, items: s.items.map((i) => ({ ...i, status: 'done' })) }));
      await open(page, { journey: j });
      await page.locator('#stage-report .stage-top').click();
      const hint = page.locator('#stage-report .item', { hasText: 'استلام التقرير' });
      await expect(hint).toContainText('درجة كل مكوّن بوزنه حين تتاح');
      await expect(hint).not.toContainText('مفصّلة في رحلتك');
    });

    test('الملف المرفوع: اسمه ووقت رفعه، واستبداله بتأكيد ما دام لم يُعتمد', async () => {
      const state = await open(page);
      const item = (t) => page.locator('#stage-training .item', { hasText: t });
      // بانتظار المراجعة والمُعاد: اسم الملف ووقته وزر الاستبدال. والمعتمد: اسمه بلا زر
      const waiting = item('تقرير الملاحظة الأولى');
      await expect(waiting.getByTestId('up-file')).toContainText('تقرير الملاحظة.docx');
      await expect(waiting.getByTestId('up-file')).toContainText('رُفع');
      await expect(waiting.getByTestId('up-file')).toContainText('18 نوفمبر');
      await expect(item('تحليل أصحاب المصلحة').getByRole('button', { name: 'استبدل الملف' })).toBeVisible();
      await expect(item('نموذج الالتزام الموقّع').getByTestId('up-file')).toContainText('الالتزام.pdf');
      await expect(item('نموذج الالتزام الموقّع').getByRole('button', { name: 'استبدل الملف' })).toHaveCount(0);
      // بند بلا ملف بعد: زر الرفع كما كان، وبعد الرفع اسمه
      const fresh = item('خطة التطبيق في العمل');
      await expect(fresh.getByTestId('up-file')).toHaveCount(0);
      await fresh.locator('input[type=file]').setInputFiles({ name: 'خطة التطبيق.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') });
      await expect(fresh.getByTestId('up-file')).toContainText('خطة التطبيق.pdf');
      await expect(fresh.locator('.chip')).toHaveText('بانتظار المراجعة');
      expect(state.calls.find((c) => c.action === 'requirement.update')).toMatchObject({ requirement_id: 'r5', evidence_name: 'خطة التطبيق.pdf' });
      // الاستبدال بلوحة المفاتيح: الزر بهدف لمس 44، والنافذة تسمّي الملف وما يحدث، وEscape يتراجع ويعيد التركيز إلى الزر
      const replace = waiting.getByRole('button', { name: 'استبدل الملف' });
      expect((await rect(replace)).height).toBeGreaterThanOrEqual(44);
      await replace.scrollIntoViewIfNeeded();
      await expect(page.locator('.toast')).toHaveCount(0);   // إشعار الرفع العابر زال
      await waiting.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await shot(page, `upload-row-${width}`);
      await replace.focus();
      await page.keyboard.press('Enter');
      const dlg = page.getByRole('dialog', { name: 'استبدال الملف المرفوع' });
      await expect(dlg).toBeVisible();
      await expect(dlg).toContainText('يُحذف ملفك الحالي «تقرير الملاحظة.docx» من «تقرير الملاحظة الأولى» ولا يُسترجع، ويُرسل الملف الجديد لمستشارك للمراجعة.');
      await expect(dlg.getByRole('button', { name: 'اختر الملف البديل' })).toBeFocused();
      for (const b of await dlg.getByRole('button').all()) expect((await rect(b)).height).toBeGreaterThanOrEqual(44);
      // Tab يدور داخل النافذة
      await page.keyboard.press('Tab');
      await expect(dlg.getByRole('button', { name: 'تراجع، أبقِ ملفي الحالي' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dlg.getByRole('button', { name: 'اختر الملف البديل' })).toBeFocused();
      await shot(page, `replace-confirm-${width}`, { fullPage: false });
      const before = state.calls.filter((c) => c.action === 'requirement.update').length;
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await expect(replace).toBeFocused();
      expect(state.calls.filter((c) => c.action === 'requirement.update').length).toBe(before);
      await expect(waiting.getByTestId('up-file')).toContainText('تقرير الملاحظة.docx');
      // التأكيد ثم اختيار الملف: يحل الجديد مكان القديم ويبقى البند بانتظار المراجعة
      await replace.click();
      const chooser = page.waitForEvent('filechooser');
      await dlg.getByRole('button', { name: 'اختر الملف البديل' }).click();
      await (await chooser).setFiles({ name: 'تقرير الملاحظة المصحح.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('docx') });
      await expect(dlg).toHaveCount(0);
      await expect(waiting.getByTestId('up-file')).toContainText('تقرير الملاحظة المصحح.docx');
      await expect(waiting.getByTestId('up-file')).not.toContainText('تقرير الملاحظة.docx');
      await expect(waiting.locator('.chip')).toHaveText('بانتظار المراجعة');
      expect(state.calls.filter((c) => c.action === 'requirement.update').at(-1)).toMatchObject({ requirement_id: 'r9', evidence_name: 'تقرير الملاحظة المصحح.docx' });
    });
  });
}

test.describe('تذكّر الطي على الهاتف', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('ما يفتحه المشارك أو يطويه يبقى بعد إعادة التحميل، بلوحة المفاتيح', async ({ page }) => {
    await open(page);
    const ms = page.locator('[data-fold="milestones"]');
    await expect(ms).not.toHaveAttribute('open', '');
    // سطر الطي عنصر summary: يأخذ التركيز ويُفتح بـEnter، وهدف لمسه 44 فأكثر
    await ms.locator('summary').focus();
    expect((await rect(ms.locator('summary'))).height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(ms).toHaveAttribute('open', '');
    await expect(page.getByText('تسمية المبادرة')).toBeVisible();
    // يطوي المرحلة الحالية، ويفتح المقفلة
    const top = page.locator('#stage-training .stage-top');
    await top.focus();
    await page.keyboard.press('Enter');
    await expect(top).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#stage-ojt_coaching .stage-top').click();
    await expect(page.locator('#stage-ojt_coaching .stage-top')).toHaveAttribute('aria-expanded', 'true');
    await page.reload();
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('[data-fold="milestones"]')).toHaveAttribute('open', '');
    await expect(page.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#stage-ojt_coaching .stage-top')).toHaveAttribute('aria-expanded', 'true');
    // «اذهب إليها» تفتح المرحلة المطوية وتصل إلى البند
    await page.getByRole('button', { name: 'اذهب إليها' }).click();
    await expect(page.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#item-r6')).toBeFocused();
  });

  test('بتخزين محجوب: الرحلة تعمل بالافتراضي، والطي والفتح يعملان في الزيارة نفسها', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, { blockFolds: true });
    await expect(page.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'true');
    const ms = page.locator('[data-fold="milestones"]');
    await ms.locator('summary').click();
    await expect(ms).toHaveAttribute('open', '');
    await page.locator('#stage-training .stage-top').click();
    await expect(page.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(page.locator('.hero')).toBeVisible();
    // لم يُحفظ شيء: الحالية مفتوحة والمعالم مطوية كأول مرة
    await expect(page.locator('#stage-training .stage-top')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-fold="milestones"]')).not.toHaveAttribute('open', '');
    expect(errors).toEqual([]);
  });

  test('طول الرئيسية على 390 أقصر، والمرحلة الحالية في أول شاشتين', async ({ page }) => {
    await open(page);
    const top = (await rect(page.locator('#stage-training'))).top;
    expect(top).toBeLessThan(844 * 2);
    await shot(page, 'home-390-spec', { fullPage: true });
  });
});
