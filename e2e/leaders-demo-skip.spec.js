// الحساب التجريبي، المرحلة 1 من تصوره (2026-11-19): شارة «حساب تجريبي» الثابتة في كل شاشة، و«تخطَّ هذه المرحلة»
// و«افتح كل المراحل»، ووسم «تم تخطيها للعرض»، ومعاينة الشهادة بعلامة «نموذج للعرض»، على 390 و1440، من لوحة الإدارة
// وبرابط تجربة. الخادم محاكاة تحفظ ما تُخطي وما فُتح. DEMO_SHOTS: مجلد تُحفظ فيه لقطات الشاشات (للتسليم لا للاختبار).
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const TOKEN = 'demo-token-0123456789abcdefghij';
const TRY_TOKEN = 'try-token-0123456789abcdefghijklmnopqrstuv';
const SHOTS = process.env.DEMO_SHOTS || '';
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, ...opts }); };

const STAGES = [
  ['profile', 'الملف الشخصي', 'admission'], ['assessment', 'تحديد المستوى', 'admission'], ['training', 'التدريب', 'qualification'],
  ['ojt', 'التوجيه على رأس العمل', 'qualification'], ['consulting', 'الاستشارة', 'qualification'], ['evaluation', 'التقييم والقياس', 'impact'], ['report', 'التقرير النهائي', 'impact'],
];

// متابعة الأثر كما يحسبها الخادم للحساب التجريبي: خطة من وثيقته، وبداية اليوم
function tracking(updates) {
  const current = new Date().toISOString().slice(0, 7);
  return {
    summary: { day: 0, active: true, current, health: updates ? 'green' : 'pending', health_title: updates ? 'على المسار' : 'لم تبدأ المتابعة',
      milestones: { total: 1, done: 0, due: 0, late: 0, at_risk: 0, on_time: null }, benefits: { total: 0, measured: 0, realization: null },
      updates, last_at: null, due: { update: true, checkpoint: null, resubmit: false }, can_update: true,
      checkpoints: [{ key: 'd90', day: 90, title: 'مراجعة الأثر بعد 90 يومًا', status: 'upcoming', resubmit: false, verify: null, verify_title: null, period: null }] },
    plan: { start: null, end: null },
    state: { milestones: [{ key: 'm0', title: 'تجربة أولى للعرض', due: '2027-02-01', status: updates ? 'on_track' : null }], benefits: [] },
    updates: [], statuses: { on_track: 'في موعده', at_risk: 'معرّض للتأخر', late: 'متأخر', done: 'تحقق', dropped: 'أُلغي بقرار' },
    health: { green: 'على المسار', pending: 'لم تبدأ المتابعة' }, checkpoints: [{ key: 'd90', day: 90, title: 'مراجعة الأثر بعد 90 يومًا' }],
  };
}

function server({ profileDone = true, assessed = true } = {}) {
  const s = { profileDone, assessed, skipped: new Set(), opened: false, calls: [] };
  const journey = () => {
    let prevDone = true;
    return STAGES.map(([key, title_ar, phase], i) => {
      const gate = key === 'profile' ? s.profileDone : key === 'assessment' ? s.assessed : false;
      const skipped = s.skipped.has(key);
      const status = gate || skipped ? 'done' : (prevDone || s.opened) && s.assessed ? 'active' : i === 0 || (i === 1 && s.profileDone) ? 'active' : 'locked';
      prevDone = prevDone && status === 'done';
      const items = key === 'profile' ? [{ id: 'i1', code: 'P-INFO', kind: 'auto', title_ar: 'بيانات الملف', required: true, status: s.profileDone ? 'done' : 'pending' }]
        : key === 'assessment' ? [{ id: 'i2', code: 'A-DONE', kind: 'auto', title_ar: 'إرسال القياس', required: true, status: s.assessed ? 'done' : 'pending' }]
          : [{ id: `r-${key}`, code: `X-${key}`, kind: 'check', title_ar: `متطلب ${title_ar}`, required: true, status: 'pending' }];
      return { key, title_ar, phase, status, skipped, override: skipped ? 'skip' : null, stage_mode: 'required', items, done: items.filter((x) => x.status === 'done').length, total: items.length, duration_label: 'أسبوع' };
    });
  };
  const me = (extra = {}) => ({
    success: true, features: { hall: false, katon: false, f360: false }, ...extra,
    participant: { id: 'demo', full_name: 'مشارك تجريبي', email: 'demo@demo.milestone-impact.org', status: s.assessed ? 'placed' : 'registered', is_demo: true, consented_at: '2026-11-01T00:00:00Z', name_confirmed: true },
    profile: { full_name: 'مشارك تجريبي', phone: s.profileDone ? '0500000000' : '', job_title: s.profileDone ? 'مدير إدارة المشاريع' : '', organization_name: s.profileDone ? 'جهة تجريبية' : '', years_experience: s.profileDone ? 8 : null,
      approved: s.assessed, level: s.assessed ? 'intermediate' : null, track: s.assessed ? { title: 'القيادة من خلال الآخرين', summary: 'ملخص', strengths: 'قوة', journey: 'رحلة' } : null },
    journey: journey(), milestones: [], milestone_summary: { done: 0, total: 0 }, continuous: null, progress: 20 + s.skipped.size * 10, passkeys: 1, prompt_passkey: false, final: null,
  });
  const reply = (b) => {
    s.calls.push(b);
    switch (b.action) {
      case 'me': return [200, me()];
      case 'demo.link-open': return b.t === TRY_TOKEN ? [200, me({ token: 'link-session-0123456789abcdefghij', demo_shared: true })] : [404, { success: false, code: 'link_invalid', message: 'رابط التجربة غير صالح' }];
      case 'demo.skip-stage': {
        if (!s.profileDone) { s.profileDone = true; return [200, me()]; }
        if (!s.assessed) { s.assessed = true; return [200, me()]; }
        const cur = journey().find((x) => x.status !== 'done');
        if (!cur) return [409, { success: false, code: 'demo_done', message: 'لا مرحلة باقية للتخطي. أعد ضبط الحساب التجريبي من لوحة الإدارة لتبدأ من جديد' }];
        s.skipped.add(cur.key);
        return [200, me({ skipped: cur.key })];
      }
      case 'demo.open-all': s.opened = true; return [200, me({ opened: ['x'] })];
      // «أعد من البداية»: الحساب يعود إلى أوله بجلسته نفسها
      case 'demo.restart': Object.assign(s, { profileDone: false, assessed: false, opened: false, updates: 0 }); s.skipped.clear(); return [200, me({ restarted: true })];
      // وثيقة المبادرة مسودة لم تُعتمد، والمتابعة مفتوحة للعرض (simulated) بما كتبه الحساب في سجل المعالم
      case 'capstone.get': return [200, { success: true, initiative: 'تجربة أولى للعرض', scope: 'project', scope_title: 'مشروع', level: 'intermediate', track: { title: 'القيادة من خلال الآخرين' },
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' }, sections: [{ id: 'm-reg', key: 'milestone-register', title: 'سجل المعالم', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'draft' }],
        checks: [], readiness: 40, ready_min: 80, card: { state: 'waiting', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [] }];
      case 'tracking.get': return [200, { success: true, simulated: true, tracking: tracking(s.updates || 0), current: null }];
      case 'tracking.save': s.updates = (s.updates || 0) + 1; return [200, { success: true, simulated: true, tracking: tracking(s.updates), current: null, invited: false, mail_failed: false }];
      case 'demo.certificate-preview': return [200, { success: true, certificate: { serial: null, verify_url: null, sample: true, kind: 'completion_success', decision: 'pass', name_ar: 'مشارك تجريبي', name_en: null,
        program_ar: 'برنامج القادة', program_en: 'Leaders Program', track_ar: 'القيادة من خلال الآخرين', track_en: 'Leading Through Others', hours: 40, start: '2026-11-01', end: '2027-02-01', issued_at: '2026-11-21T08:00:00Z', org: null, signatories: [] } }];
      case 'pay.checkout': return [403, { success: false, code: 'demo', message: 'في الحساب التجريبي لا يُنفذ هذا فعليًا' }];
      // شاشة القياس نفسها خارج هذا الاختبار: تعرض رسالتها، والشريط يتخطاها
      case 'assessment.get': return [200, { success: false, message: 'لا قياس في هذا الاختبار' }];
      case 'handbook.toc': return [200, { success: true, name: 'مشارك تجريبي', code: 'M2I2L2', chapters: [{ id: 'c1', dimension: 'milestone', title: 'المعالم نقاط قرار', done: false }, { id: 'c2', dimension: 'impact', title: 'سلسلة القيمة', done: false }],
        points: { total: 0, rank: { title: 'مستكشف', next: { title: 'ممارس', at: 75, left: 75 } } } }];
      case 'lab.list': return [200, { success: true, items: [], points: 0 }];
      case 'certificate': return [200, { success: true, certificate: null }];
      case 'passkey.list': return [200, { success: true, items: [] }];
      case 'sessions.list': return [200, { success: true, sessions: [] }];
      case 'peer.list': return [200, { success: true, items: [], teams: {}, supervision: 'expert_only', advisor: null, my_team: null }];
      case 'ratings.pending': return [200, { success: true, items: [] }];
      case 'sus.state': return [200, { success: true, due: false }];
      default: return [200, { success: true }];
    }
  };
  return { s, reply };
}

async function open(page, srv, { link = false } = {}) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const [status, json] = srv.reply(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status, json });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  if (link) { await page.goto(`${APP}#try=${TRY_TOKEN}`); return; }
  // من لوحة الإدارة: الرابط يبدأ من شاشة الدخول، والدخول بزر الجولة
  await page.goto(`${APP}#demo=${TOKEN}`);
  const tour = page.getByRole('region', { name: 'الجولة الحيّة' });
  await tour.getByRole('button', { name: 'التالي' }).click();
  await tour.getByRole('button', { name: 'ادخل بالحساب التجريبي' }).click();
}
// لوحة الجولة تُصغَّر لتظهر الشاشة كاملة، والشارة باقية بعدها (لا تعتمد على اللوحة)
const hideTour = async (page) => { const b = page.getByRole('region', { name: 'الجولة الحيّة' }).getByRole('button', { name: 'إخفاء' }); if (await b.count()) await b.click(); };
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const width of [390, 1440]) {
  test.describe(`الحساب التجريبي على ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 2 });

    test('الشارة ثابتة في كل شاشة ولا تُغلق، والتخطي يسم المرحلة «تم تخطيها للعرض»، و«افتح كل المراحل» يفتح الباقي', async ({ page }) => {
      const srv = server();
      await open(page, srv);
      const bar = page.getByTestId('demo-bar');
      await expect(bar).toBeVisible();
      await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
      await expect(bar).toContainText('ما تفعله هنا لا يُحسب.');
      await expect(bar).not.toContainText('وقد يراه غيرك');
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: التدريب');
      // لا زر يغلق الشارة، وهي باقية بعد إخفاء لوحة الجولة
      await expect(bar.getByRole('button')).toHaveText(['أعد من البداية', 'تخطَّ هذه المرحلة', 'افتح كل المراحل']);
      await hideTour(page);
      await expect(bar).toBeVisible();
      await noOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `badge-journey-${width}`);
      // ثابتة تحت الترويسة عند التمرير
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect(bar).toBeInViewport();
      const top = await page.evaluate(() => [document.querySelector('.topbar').getBoundingClientRect().bottom, document.querySelector('[data-testid="demo-bar"]').getBoundingClientRect().top]);
      expect(Math.abs(top[0] - top[1])).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0));

      // التخطي: المرحلة الحالية تنتهي بوسمها، والتالية تصير الحالية
      await shot(page, `skip-control-${width}`, { clip: await bar.boundingBox() });
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: التوجيه على رأس العمل');
      const training = page.locator('#stage-training');
      await expect(training.getByTestId('stage-skipped-demo')).toHaveText('تم تخطيها للعرض');
      await expect(training).not.toContainText('مكتملة');
      await expect(training).not.toContainText('أُعفيت');
      expect(srv.s.calls.filter((c) => c.action === 'demo.skip-stage').length).toBe(1);
      // الطلب لا يحمل معرّف مشارك ولا مفتاح مرحلة: الخادم يقرر من الجلسة
      expect(Object.keys(srv.s.calls.find((c) => c.action === 'demo.skip-stage')).filter((k) => !['action', 'token', 'idem', 'idempotency_key'].includes(k) && !k.startsWith('_'))).toEqual([]);
      await training.scrollIntoViewIfNeeded();
      await shot(page, `skipped-stage-${width}`);

      // افتح كل المراحل: لا مقفلة بعدها، ولا مرحلة تنتهي بالفتح
      await expect(page.locator('#stage-evaluation .chip')).toHaveText('مقفلة');
      await page.evaluate(() => window.scrollTo(0, 0));
      await bar.getByRole('button', { name: 'افتح كل المراحل' }).click();
      await expect(bar.getByTestId('demo-all-open')).toHaveText('كل المراحل مفتوحة');
      await expect(bar.getByRole('button', { name: 'افتح كل المراحل' })).toHaveCount(0);
      for (const k of ['ojt', 'consulting', 'evaluation', 'report']) await expect(page.locator(`#stage-${k} .chip`).first()).not.toHaveText('مقفلة');
      await expect(page.getByTestId('stage-skipped-demo')).toHaveCount(1);
      await noOverflow(page);
      await page.locator('#stage-ojt').scrollIntoViewIfNeeded();
      await shot(page, `open-all-${width}`);
      await page.evaluate(() => window.scrollTo(0, 0));

      // الشارة في شاشتين أخريين: الملف، والمبادرة (أو أي قسم آخر من التنقل)
      await page.getByRole('button', { name: /ملفي: مشارك تجريبي/ }).click();
      await expect(page.getByRole('heading', { name: /ملف|بيانات/ }).first()).toBeVisible();
      await expect(bar).toBeVisible();
      await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
      await shot(page, `badge-profile-${width}`);
      const nav = page.locator(width === 390 ? '.tabbar' : '.nav-tabs');
      await nav.getByRole('button', { name: /كتابي/ }).click();
      await expect(bar).toBeVisible();
      await expect(bar.getByTestId('demo-badge')).toBeInViewport();
      await expect(page.getByText('المعالم نقاط قرار').first()).toBeVisible();
      await shot(page, `badge-handbook-${width}`);
      await noOverflow(page);
    });

    test('معاينة الشهادة: نافذة بالقالب وعليها «نموذج للعرض»، بلا رقم تسلسلي ولا رابط تحقق ولا رمز', async ({ page, context }) => {
      const srv = server();
      await open(page, srv);
      await hideTour(page);
      const card = page.getByTestId('demo-cert');
      await expect(card).toContainText('نموذج للعرض');
      await expect(card).toContainText('الحساب التجريبي لا تصدر له شهادة');
      await card.scrollIntoViewIfNeeded();
      await shot(page, `certificate-card-${width}`);
      const [pop] = await Promise.all([context.waitForEvent('page'), card.getByRole('button', { name: 'اعرض نموذج الشهادة' }).click()]);
      await expect(pop.locator('.status span')).toHaveText('نموذج للعرض');
      await expect(pop.locator('.verify')).toContainText('نموذج للعرض، بلا رقم');
      await expect(pop.locator('.verify')).toContainText('لا رابط تحقق لهذا النموذج');
      await expect(pop.locator('.qr')).toHaveCount(0);
      await expect(pop.locator('[data-act="linkedin"]')).toHaveCount(0);
      expect(await pop.content()).not.toMatch(/MI-LDR-/);
      await expect(pop.locator('.name')).toHaveText('مشارك تجريبي');
      if (SHOTS) { await pop.setViewportSize({ width: 1440, height: 1000 }); await pop.waitForTimeout(600); await pop.screenshot({ path: `${SHOTS}/certificate-preview-${width}.png`, fullPage: true }); }
    });

    test('«أعد من البداية»: رابط صغير في الشريط بتأكيد، يعيد الحساب إلى أول الرحلة والجلسة باقية، والتراجع لا يفعل شيئًا', async ({ page }) => {
      const srv = server();
      await open(page, srv);
      await hideTour(page);
      const bar = page.getByTestId('demo-bar');
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await bar.getByRole('button', { name: 'افتح كل المراحل' }).click();
      await expect(page.getByTestId('stage-skipped-demo')).toHaveCount(1);
      // الشريط لا يزيد ارتفاعًا عن ثلاثة أسطر على الهاتف وسطر على الحاسب
      const h = (await bar.boundingBox()).height;
      expect(h).toBeLessThanOrEqual(width === 390 ? 122 : 56);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `restart-link-${width}`);
      // التراجع: لا طلب، والأدوات تعود
      await bar.getByRole('button', { name: 'أعد من البداية', exact: true }).click();
      const ask = bar.getByTestId('demo-restart-ask');
      await expect(ask).toContainText('يُمسح كل ما فُعل في هذا الحساب التجريبي ويعود إلى أول الرحلة. تبقى جلستك وروابط التجربة.');
      await expect(bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' })).toHaveCount(0);
      await noOverflow(page);
      await shot(page, `restart-confirm-${width}`);
      await ask.getByRole('button', { name: 'تراجع' }).click();
      await expect(ask).toHaveCount(0);
      expect(srv.s.calls.filter((c) => c.action === 'demo.restart')).toEqual([]);
      await expect(page.getByTestId('stage-skipped-demo')).toHaveCount(1);
      // التأكيد: يعود إلى الملف الشخصي، والشارة باقية، ولا خروج من الجلسة
      await bar.getByRole('button', { name: 'أعد من البداية', exact: true }).click();
      await bar.getByTestId('demo-restart-ask').getByRole('button', { name: 'نعم، أعد من البداية' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: الملف الشخصي');
      await expect(bar.getByTestId('demo-restart-ask')).toHaveCount(0);
      await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
      await expect(page.getByRole('button', { name: /ملفي: مشارك تجريبي/ })).toBeVisible();
      expect(srv.s.calls.filter((c) => c.action === 'demo.restart').length).toBe(1);
      expect(srv.s.calls.filter((c) => c.action === 'logout')).toEqual([]);
      await shot(page, `restart-done-${width}`);
      // ثم يبدأ من جديد بالأزرار نفسها
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: التدريب');
      await expect(page.getByTestId('stage-skipped-demo')).toHaveCount(0);
    });

    test('متابعة الأثر: تُفتح للحساب التجريبي بوسم «للعرض» والوثيقة لم تُعتمد، بلا اسم مستشار ولا درجة', async ({ page }) => {
      const srv = server();
      await open(page, srv);
      await hideTour(page);
      const nav = page.locator(width === 390 ? '.tabbar' : '.nav-tabs');
      await nav.getByRole('button', { name: /مبادرتي/ }).click();
      const tr = page.locator('.card.tr');
      await expect(tr.getByRole('heading', { name: 'متابعة التنفيذ والأثر' })).toBeVisible();
      await expect(tr.getByTestId('tracking-demo')).toHaveText('للعرض');
      await expect(tr.getByTestId('tracking-demo-note')).toHaveText('في الحساب التجريبي تُفتح متابعة الأثر بلا اعتماد المستشار، ليُرى شكلها. لم تُعتمد هذه الوثيقة، وما تكتبه هنا لا يُحسب ولا يصل راعيًا.');
      await expect(tr).not.toContainText('بعد الاعتماد');
      // لا بطاقة «اعتُمدت وثيقة مبادرتك» ولا درجة مستشار: الوثيقة مسودة كما هي
      await expect(page.getByText('اعتُمدت وثيقة مبادرتك')).toHaveCount(0);
      await expect(page.getByText('في معيار المستشار')).toHaveCount(0);
      await expect(tr).toContainText('الخطة من وثيقتك كما هي الآن.');
      await expect(tr).not.toContainText('وثيقتك المعتمدة');
      await expect(tr).toContainText('يومًا منذ فتحها للعرض');
      await expect(tr).not.toContainText('منذ الاعتماد');
      await expect(page.getByTestId('demo-bar')).toBeVisible();
      await noOverflow(page);
      await page.evaluate(() => { const el = document.querySelector('.card.tr'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150 - (window.innerWidth < 700 ? 60 : 0)); });
      await shot(page, `impact-followup-${width}`);
    });

    test('برابط تجربة: الشارة نفسها بسطر «وقد يراه غيرك»، والزائر يتخطى من الملف إلى الرحلة داخل الحساب', async ({ page }) => {
      const srv = server({ profileDone: false, assessed: false });
      await open(page, srv, { link: true });
      const bar = page.getByTestId('demo-bar');
      await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
      await expect(bar).toContainText('ما تفعله هنا لا يُحسب، وقد يراه غيرك ممن يجرّب.');
      // قبل الرحلة: التخطي يملأ الملف ثم القياس، ولا «افتح كل المراحل» قبل الاعتماد
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: الملف الشخصي');
      await expect(bar.getByRole('button')).toHaveText(['أعد من البداية', 'تخطَّ هذه المرحلة']);
      await hideTour(page);
      await shot(page, `link-visitor-profile-${width}`);
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: القياس واعتماد المسار');
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('المرحلة الحالية: التدريب');
      await expect(bar.getByRole('button', { name: 'افتح كل المراحل' })).toBeVisible();
      // يتخطى كل ما بقي: لا زر تخطٍّ بعده، والشارة باقية
      for (let i = 0; i < 5; i++) await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toHaveText('تخطيت كل المراحل');
      // لا يُقال للحساب التجريبي «أكملت الرحلة»: التخطي للعرض وليس إنجازًا
      await expect(page.getByText('وصلت إلى نهاية الرحلة بتخطي مراحلها للعرض.')).toBeVisible();
      await expect(page.getByText('أكملت الرحلة كاملة')).toHaveCount(0);
      await expect(bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' })).toHaveCount(0);
      await expect(page.getByTestId('stage-skipped-demo')).toHaveCount(5);
      await expect(bar).toContainText('وقد يراه غيرك ممن يجرّب');
      await noOverflow(page);
      await shot(page, `link-visitor-all-skipped-${width}`);
      // لا طلب إدارة خرج من جلسة الزائر
      expect(srv.s.calls.filter((c) => String(c.action).startsWith('admin.'))).toEqual([]);
    });
  });
}

// لوحة الإدارة: بطاقة الحساب التجريبي بالاسم الموحد، وإعادة الضبط بتأكيد يسمّي ما يُمسح
for (const width of [390, 1440]) {
  test(`الإدارة على ${width}: بطاقة «الحساب التجريبي» وتأكيد إعادة الضبط`, async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'ar-SA', viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const calls = [];
    await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
    await page.route(/functions\/v1\/leaders-api/, async (r) => {
      const b = JSON.parse(r.request().postData() || '{}');
      calls.push(b.action);
      const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
      const json = {
        'admin.demo-links': { success: true, max: 20, links: [{ id: 'l1', label: 'مدير الدفعة', created_by: 'a@x.com', created_at: ago(600), expires_at: new Date(Date.now() + 6 * 864e5).toISOString(), last_used_at: null, uses: 0, state: 'active' }] },
        'admin.ops-health': { success: true, at: ago(0), mail: { key: true, cap: 80, sent: 1, codes: { sent: 1, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 } }, slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null }, alerts: { email: true, webhook: true } },
        'admin.health': { success: true, readiness: [{ key: 'baseline', ok: true, where: 'assessment', label: 'القياس القبلي' }], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 } },
        'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
        'admin.overview': { success: true, total: 10, by_status: { enrolled: 3 }, pending_reviews: 0, matrix: {}, overall: {}, top_tracks: [], tracks_used: 0 },
        'admin.reviews': { success: true, pending_approval: [], submitted: [] },
        'admin.orgs': { success: true, orgs: [], unassigned: {} },
        'admin.programs': { success: true, programs: [], cohorts: [], organizations: [] },
        'admin.insight': { success: false, message: 'لا رؤية في هذا الاختبار' },
      }[b.action] || { success: true };
      return r.fulfill({ json });
    });
    await page.goto(ADMIN);
    await page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'هند', email: 'a@x.com', role_id: 'super_admin' }, ts: Date.now() })); });
    await page.goto(`${ADMIN}#/leaders/overview`);
    await page.reload();
    // الحساب التجريبي في «أدوات التجربة» المطوية آخر النظرة العامة (تدقيق 2026-11-23)
    await page.locator('#today-tools > summary').click();
    const card = page.locator('.la-demo');
    await expect(card).toContainText('الحساب التجريبي');
    await expect(card).toContainText('«تخطَّ هذه المرحلة» و«افتح كل المراحل»');
    await expect(card).not.toContainText('حساب العرض');
    await expect(card.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await shot(page, `admin-control-${width}`);
    await card.getByRole('button', { name: 'أعِده إلى البداية' }).click();
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog).toContainText('إعادة الحساب التجريبي إلى البداية؟ تُمسح إجاباته وتقدمه وما تُخطي أو فُتح من مراحله.');
    await expect(dialog).toContainText('«مدير الدفعة»');
    await shot(page, `reset-confirm-${width}`);
    expect(calls).not.toContain('admin.demo-reset');
    await dialog.getByRole('button', { name: /تأكيد|نعم|أعِد|متابعة|موافق/ }).first().click();
    await expect.poll(() => calls.includes('admin.demo-reset')).toBe(true);
    await expect(page.getByText('أُعيد الحساب التجريبي إلى البداية')).toBeVisible();
    await shot(page, `reset-done-${width}`);
    await ctx.close();
  });
}
