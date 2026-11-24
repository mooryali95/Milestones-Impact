// تدقيق لوحة الإدارة 2026-11-23، المرحلة 3: تبويبات صفحة الجهة برابطها، وفهرس الإعدادات العامة وبحثها، والكتاب الأم داخل
// اللوحة بشريط رجوع وEsc وملء الشاشة، وتبويبا مركز البريد برابطيهما ومجموعات التوجيه المطوية، وJ/K واستعادة موضع القائمة
// في ملفات المشاركين، ولوحة معاينة طلبات التواصل. وكلها بلا تمرير أفقي على 390. الخلفية مُحاكاة. SHOTS_DIR: لقطات.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
const SHOT_TAG = process.env.SHOT_TAG || 'after';
const id = (n) => `00000000-0000-4000-8000-0000000000${n}`;

const org = { id: 'o1', name: 'هيئة المثال', short_name: 'هم', sector: 'حكومي', color: '#12414E', invite_code: 'mithal', status: 'active', domains: [], seats: 20, seats_used: 2,
  stats: { total: 2, registered: 2, pending_approval: 1, active_week: 1 }, access: { state: 'active' } };
const members = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', status: 'pending_approval', track: 'M2I2L2', created_at: '2026-10-01', last_login_at: '2026-11-01' },
  { id: 'p2', full_name: 'خالد العمر', email: 'k@x.com', job_title: 'رئيس قسم', status: 'enrolled', track: 'M1I2L2', approved: true, created_at: '2026-10-02' },
];
const people = Array.from({ length: 40 }, (_, i) => ({ id: `p${i + 1}`, full_name: `مشارك رقم ${i + 1}`, email: `p${i + 1}@x.com`, status: 'pending_approval', placements: [], created_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }));
const person = (p) => ({ success: true, participant: p, progress: 0, history: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [], profile: { approved: false, dimensions: [] }, assessments: [] });

const PARA = 'المعلم في هذه المنهجية **نقطة قرار** يقف عندها الفريق ليسأل: هل ما زالت القيمة التي بدأنا من أجلها قائمة؟';
const chapter = (n, dimension, title) => ({ id: id(n), dimension, chapter_key: `k${n}`, sort: 1, title, min_level: 'beginner', md: ['المدخل', 'الخلاصة'].map((t) => `## ${t}\n\n${Array(4).fill(PARA).join('\n\n')}`).join('\n\n'), quiz_md: '', reflection: '', updated_at: '2026-11-10T00:00:00Z' });
const book = {
  success: true, version: 'v3.1', generated_at: '2026-11-16T10:00:00Z', share: null, comments_ready: true,
  viewer: { kind: 'admin', name: 'مدير', role: 'مدير', email: 'a@x.com', write: true, resolve: false, watermark: 'مدير · a@x.com', seat: null },
  chapters: [chapter('a1', 'milestone', 'تمهيد المعالم'), chapter('b1', 'impact', 'تمهيد الأثر')], comments: [], counts: { total: 0, byModule: {}, bySection: {} },
};
const series = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, sent: i, blocked: 0, failed: 0 }));
const center = {
  success: true, counter_ok: true, budget: { cap: 80, sent: 46, remaining: 34, pct: 58, codes: 6, nonCode: 40, nonCodeLimit: 60, nonCodeLeft: 20, state: 'ok' },
  budget_ar: 'الحصة تكفي', next_free_at: null, by_kind: { code: 6, notify: 40 }, by_source: { 'leaders-api': 46 }, blocked_24h: 0, failed_24h: 0, series, queue: [], lost: [],
  provider: { readable: true, reason: null, domains: [{ name: 'sunkvalue.com', status: 'verified', sender: true }], quota: {}, usage: null }, retention_days: 180, traceable: true, alert_channel: true,
};
const routing = { success: true, owner: true, ready: true, saved: true, settings: { preset: 'balanced', rows: {}, digest_hour: 9 }, legacy_payment_owner: false, counts: {}, days: 7, updated: null };
const contacts = [
  { id: 'c1', name: 'ريم السالم', organization: 'شركة الأفق', email: 'reem@x.com', phone: '0500000001', interest: 'leaders', product: 'site', status: 'new', created_at: '2026-11-20T10:00:00Z', message: 'نرغب في تسجيل عشرين من قادتنا في الدفعة القادمة، فما الخطوات؟' },
  { id: 'c2', name: 'فهد العتيبي', organization: 'جمعية النماء', email: 'fahd@x.com', phone: '0500000002', interest: 'matrix', product: 'matrix', status: 'read', created_at: '2026-11-19T10:00:00Z', message: 'سؤال عن مقياس الجاهزية لفريقنا.' },
];

async function setup(page, hash, { size = { width: 1280, height: 900 }, role = 'super_admin', extra = {} } = {}) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = { 'list-contacts': { success: true, contacts }, 'update-contact': { success: true }, 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.org': { success: true, org, participants: members, funnel: { registered: 2, withdrawn: 0, pending_approval: 1, approved: 1, completed: 0 }, by_track: { M2I2L2: 1, M1I2L2: 1 }, by_via: { link: 2 }, by_campaign: {}, by_site: {} },
      'admin.org-journey': { success: true, cohort: { id: 'c1', name: 'دفعة المثال', status: 'open' }, setup_missing: 0, setup: [], journey_map: null },
      'admin.org-team': { success: true, cohorts: [] },
      'admin.org-finance': { success: false, message: 'لا بيانات مالية في هذا الاختبار' },
      'admin.coordinator': { success: true, coordinator: null },
      'admin.sponsor-codes': { success: true, codes: [] },
      'admin.participants': { success: true, participants: people },
      'admin.participant': person(people.find((x) => x.id === b.id) || people[0]),
      'admin.settings': { success: true, ready: true, values: undefined, updated: {} },
      'admin.book': book,
      'admin.mail-center': center,
      'admin.notify-routing': routing,
      'admin.ops-health': { success: true, slack: { configured: true }, alerts: { email: true, webhook: false } },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
      ...extra,
    };
    if (b.action === 'admin.settings' || b.action === 'admin.settings-save') return route.fulfill({ json: await settingsReply() });
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() })); localStorage.clear(); }, role);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}
// القيم الافتراضية من تعريف الخادم نفسه (settings.js)
let DEFAULTS = null;
async function settingsReply() {
  if (!DEFAULTS) ({ DEFAULTS } = await import('../supabase/functions/leaders-api/settings.js'));
  return { success: true, ready: true, values: DEFAULTS, updated: {} };
}
const noOverflow = async (page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/p3-${SHOT_TAG}-${name}-${page.viewportSize().width}.png`, fullPage: false }); } };

// لقطات قبل/بعد: تعمل على أي ناتج (القديم أو الجديد) فلا تتحقق من سلوك المرحلة
test.describe('لقطات', () => {
  test.skip(!SHOTS, 'SHOTS_DIR غير مضبوط');
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`لقطات الشاشات (${size.width})`, async ({ page }) => {
      for (const [name, hash, ready] of [
        ['org', '#/leaders/orgs/o1', 'هيئة المثال'], ['settings', '#/leaders/settings', 'تقييم 360 للتطوير'], ['book', '#/leaders/book', 'الكتاب الأم'],
        ['mail', '#/leaders/mailcenter', 'لماذا لم يصل البريد؟'], ['contacts', '#/contacts', 'ريم السالم'],
      ]) {
        await setup(page, hash, { size });
        await expect(page.getByText(ready).first()).toBeVisible();
        if (name === 'contacts') await page.getByText('ريم السالم').first().click();
        await shot(page, name);
      }
    });
  }
});

test.describe('المرحلة 3', () => {
  test.skip(!!SHOTS && SHOT_TAG === 'before', 'لقطات الناتج القديم وحدها');

  test('صفحة الجهة: ستة تبويبات تبدأ بالجاهزية، والأسهم تتنقل، والتبويب في الرابط والجلسة، وكل قسم قائم يُبلغ', async ({ page }) => {
    await setup(page, '#/leaders/orgs/o1');
    const tabs = page.getByRole('tablist', { name: 'أقسام صفحة الجهة' });
    await expect(tabs.getByRole('tab')).toHaveText(['الجاهزية', 'الرحلة', 'الفريق', 'رموز الرعاية', 'المالية', 'المشاركون']);
    await expect(tabs.getByRole('tab', { name: 'الجاهزية' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'جاهزية الجهة' })).toBeVisible();
    await expect(page.locator('#org-coordinator')).toBeVisible();
    // الأسهم: الأيسر للتالي (من اليمين لليسار)
    await tabs.getByRole('tab', { name: 'الجاهزية' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tab', { name: 'الرحلة' })).toBeFocused();
    await expect(page.locator('#org-journey')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'جاهزية الجهة' })).toBeHidden();
    await page.keyboard.press('End');
    await expect(tabs.getByRole('tab', { name: 'المشاركون' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => location.hash)).toBe('#/leaders/orgs/o1?tab=members');
    await expect(page.locator('#org-members')).toContainText('سارة الأحمد');
    await expect(page.locator('#org-tracks')).toBeVisible();
    await expect(page.locator('#org-sources')).toContainText('مصادر الانضمام');
    for (const [t, sel] of [['الفريق', '#org-team'], ['رموز الرعاية', '#org-sponsor-codes'], ['المالية', '#org-finance']]) {
      await tabs.getByRole('tab', { name: t }).click();
      await expect(page.locator(sel)).toBeVisible();
    }
    // الرابط المباشر بتبويب يفتح عليه
    await page.goto(`${BASE}#/leaders/orgs/o1?tab=team`);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'الفريق' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#org-team')).toBeVisible();
    // بلا تبويب في الرابط: آخر تبويب في الجلسة
    await page.goto(`${BASE}#/leaders/orgs`);
    await page.getByRole('button', { name: 'لوحة الجهة' }).click();
    await expect(page.getByRole('tab', { name: 'الفريق' })).toHaveAttribute('aria-selected', 'true');
    await shot(page, 'org-tabs');
  });

  test('صفحة الجهة على 390: التبويبات بلا تمرير أفقي للصفحة', async ({ page }) => {
    await setup(page, '#/leaders/orgs/o1?tab=members', { size: { width: 390, height: 844 } });
    await expect(page.getByRole('tab', { name: 'المشاركون' })).toHaveAttribute('aria-selected', 'true');
    await noOverflow(page);
  });

  test('الإعدادات العامة: فهرس ملتصق، والبحث يجد الإعداد باسمه أو شرحه، والرؤية مطوية، والحفظ لكل مجموعة', async ({ page }) => {
    const calls = await setup(page, '#/leaders/settings');
    const idx = page.getByRole('navigation', { name: 'فهرس الإعدادات' });
    await expect(idx.getByRole('button', { name: 'تقييم 360 للتطوير' })).toBeVisible();
    await expect(idx).toHaveCSS('position', 'sticky');
    // الرؤية مطوية حتى تُفتح
    const vis = page.locator('form[data-group="visibility"]');
    await expect(vis.locator('details.st-fold')).not.toHaveAttribute('open', '');
    const box = page.getByRole('searchbox', { name: 'ابحث في الإعدادات' });
    await box.fill('مهلة رد الخبير');
    await expect(page.getByLabel('مهلة رد الخبير بالساعات')).toBeVisible();
    await expect(page.locator('form[data-group="feedback360"]')).toBeHidden();
    await expect(idx.getByRole('button', { name: 'طلبات الخبراء' })).toBeVisible();
    await expect(idx.getByRole('button', { name: 'تقييم 360 للتطوير' })).toBeHidden();
    // الحفظ لمجموعته وحدها
    await page.getByLabel('مهلة رد الخبير بالساعات').fill('72');
    await page.locator('form[data-group="experts"]').getByRole('button', { name: 'حفظ' }).click();
    await expect.poll(() => calls.filter((c) => c.action === 'admin.settings-save').at(-1)).toMatchObject({ group: 'experts' });
    // البحث يفتح مجموعة مطوية تطابقها
    await box.fill('الرؤية');
    await expect(vis).toBeVisible();
    await expect(vis.locator('details.st-fold')).toHaveAttribute('open', '');
    await box.fill('كلمة لا توجد أبدًا');
    await expect(page.getByText('لا إعداد يطابق «كلمة لا توجد أبدًا».')).toBeVisible();
    await box.fill('');
    await idx.getByRole('button', { name: 'طلبات الخبراء' }).click();
    await expect(page.getByRole('heading', { name: 'طلبات الخبراء' })).toBeFocused();
    await shot(page, 'settings-index');
  });

  test('الإعدادات على 390: الفهرس فوق المجموعات بلا تمرير أفقي', async ({ page }) => {
    await setup(page, '#/leaders/settings', { size: { width: 390, height: 844 } });
    await expect(page.getByRole('searchbox', { name: 'ابحث في الإعدادات' })).toBeVisible();
    await noOverflow(page);
  });

  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`الكتاب الأم داخل اللوحة (${size.width}): شريط رجوع ومسار، والعلامة المائية باقية، وملء الشاشة، وEsc`, async ({ page }) => {
      await setup(page, '#/leaders/book', { size });
      const bar = page.getByRole('navigation', { name: 'شريط الكتاب الأم' });
      await expect(bar.getByRole('button', { name: '→ رجوع إلى لوحة الإدارة' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'الكتاب الأم', exact: true })).toBeVisible();
      await expect(page.locator('.mb-wm')).toHaveCount(1);
      if (size.width > 500) {
        await expect(bar.getByRole('list', { name: 'المسار' })).toContainText('الكتاب الأم');
        // رأس اللوحة وشريطها ظاهران: القارئ لا يغطيهما
        await expect(page.getByRole('navigation', { name: 'أقسام تطبيق القادة' })).toBeVisible();
        const nav = await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).boundingBox();
        const frame = await page.locator('.mbs-frame').boundingBox();
        expect(nav.x + nav.width <= frame.x + 1 || frame.x + frame.width <= nav.x + 1).toBe(true);
      }
      await noOverflow(page);
      await shot(page, 'book-inline');
      // ملء الشاشة ثم Esc يخرج منه، وEsc ثانية تعود إلى اللوحة
      await bar.getByRole('button', { name: 'ملء الشاشة' }).click();
      await expect(bar.getByRole('button', { name: 'الخروج من ملء الشاشة' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.mbs-frame')).toHaveCSS('position', 'fixed');
      await expect(bar.getByRole('button', { name: '→ رجوع إلى لوحة الإدارة' })).toBeInViewport();
      await shot(page, 'book-full');
      await page.keyboard.press('Escape');
      await expect(bar.getByRole('button', { name: 'ملء الشاشة' })).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/leaders/handbook');
    });
  }

  test('الكتاب الأم: زر الرجوع يعود إلى اللوحة، وEsc داخل نافذة القارئ تغلقها وحدها', async ({ page }) => {
    await setup(page, '#/leaders/book');
    await page.getByRole('button', { name: 'نسخة PDF' }).click();
    await expect(page.getByRole('dialog', { name: 'نسخة PDF' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'نسخة PDF' })).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('#/leaders/book');
    await page.getByRole('button', { name: '→ رجوع إلى لوحة الإدارة' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/leaders/handbook');
  });

  test('مركز البريد: تبويبان برابطيهما، والقواعد بمجموعات تُطوى وإعداداتها الجاهزة', async ({ page }) => {
    await setup(page, '#/leaders/mailcenter');
    const tabs = page.getByRole('tablist', { name: 'أقسام مركز البريد' });
    await expect(tabs.getByRole('tab')).toHaveText(['الحالة والتشخيص', 'قواعد التوجيه']);
    await expect(tabs.getByRole('tab', { name: 'الحالة والتشخيص' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'لماذا لم يصل البريد؟' })).toBeVisible();
    await expect(page.locator('[data-section="routing"]')).toHaveCount(0);
    await tabs.getByRole('tab', { name: 'قواعد التوجيه' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/leaders/mailcenter/routing');
    await expect(page.locator('[data-section="routing"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'لماذا لم يصل البريد؟' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'الإعداد الجاهز' }).getByRole('radio')).toHaveCount(3);
    // الطي بالفئة: يخفي صفوفها ويبقي غيرها
    const sec = page.getByRole('button', { name: /الأمان والخصوصية/ });
    await expect(sec).toHaveAttribute('aria-expanded', 'true');
    const before = await page.locator('tr[data-event]').count();
    await sec.click();
    await expect(sec).toHaveAttribute('aria-expanded', 'false');
    expect(await page.locator('tr[data-event]').count()).toBeLessThan(before);
    await sec.click();
    await expect(page.locator('tr[data-event]')).toHaveCount(before);
    // الرابط المباشر، والأسهم بين التبويبين
    await page.goto(`${BASE}#/leaders/mailcenter/routing`);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'قواعد التوجيه' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'قواعد التوجيه' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'الحالة والتشخيص' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/leaders/mailcenter');
    await shot(page, 'mail-tabs');
  });

  test('مركز البريد على 390: التبويبان بلا تمرير أفقي', async ({ page }) => {
    await setup(page, '#/leaders/mailcenter/routing', { size: { width: 390, height: 844 } });
    await expect(page.locator('[data-section="routing"]')).toBeVisible();
    await noOverflow(page);
  });

  test('ملفات المشاركين: J وK بين الملفات لا داخل الحقول، والرجوع يعيد موضع القائمة وتركيز الصف', async ({ page }) => {
    await setup(page, '#/leaders/participants?view=approval', { size: { width: 1280, height: 700 } });
    const row = page.locator('tr[data-pid="p30"]');
    await row.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(200);
    await row.click();
    await expect(page.locator('.pf-head h3').first()).toHaveText('مشارك رقم 30');
    await page.keyboard.press('KeyJ');
    await expect(page.locator('.pf-head h3').first()).toHaveText('مشارك رقم 31');
    await page.keyboard.press('KeyK');
    await expect(page.locator('.pf-head h3').first()).toHaveText('مشارك رقم 30');
    // داخل حقل نص: J حرف لا تنقل
    const field = page.locator('.pf-main textarea, .pf-main input[type="text"], .pf-main input:not([type])').first();
    if (await field.count()) {
      await field.focus();
      await page.keyboard.press('KeyJ');
      await expect(page.locator('.pf-head h3').first()).toHaveText('مشارك رقم 30');
      await field.blur();
    }
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await expect(page.locator('tr[data-pid="p30"]')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 40);
  });

  test('طلبات التواصل على الشاشة العريضة: النقر يعرض الرسالة في لوحة جانبية غير حاجبة', async ({ page }) => {
    await setup(page, '#/contacts');
    const pane = page.locator('aside.ct-pane');
    await expect(pane).toContainText('اختر طلبًا من القائمة');
    await page.getByText('ريم السالم').first().click();
    await expect(page.getByRole('complementary', { name: 'معاينة طلب ريم السالم' })).toContainText('نرغب في تسجيل عشرين من قادتنا');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByText('فهد العتيبي').first().click();
    await expect(page.getByRole('complementary', { name: 'معاينة طلب فهد العتيبي' })).toContainText('سؤال عن مقياس الجاهزية');
    await page.getByRole('button', { name: 'إغلاق المعاينة' }).click();
    await expect(pane).toContainText('اختر طلبًا من القائمة');
    await shot(page, 'contacts-pane');
  });

  test('طلبات التواصل على 390: النقر يفتح العرض الكامل بالرسالة، وبلا تمرير أفقي', async ({ page }) => {
    await setup(page, '#/contacts', { size: { width: 390, height: 844 } });
    await expect(page.locator('aside.ct-pane')).toHaveCount(0);
    await page.getByText('ريم السالم').first().click();
    const dlg = page.getByRole('dialog', { name: 'تفاصيل طلب ريم السالم' });
    await expect(dlg).toContainText('نرغب في تسجيل عشرين من قادتنا');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await noOverflow(page);
  });
});
