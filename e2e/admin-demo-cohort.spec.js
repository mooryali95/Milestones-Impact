// حساب تجريبي لكل دفعة (تصور الحساب التجريبي 2026-11-19، المرحلة 2)، على 390 و1440: بطاقته في ملف الدفعة (لم يُنشأ، ثم قائم
// بحالته)، وفتحه من اللوحة فيظهر شريط «حساب تجريبي» باسم الدفعة ورحلتها بخطتها، ورابط تجربة للدفعة يدخل حسابها، وحال ما قبل
// الترحيل «غير مفعّلة بعد»، وأن الحساب ليس في عدد الدفعة ولا في متابعتها، وأن المراقب لا يرى البطاقة. اللوحة (4303)
// والمنصة (4304) معًا، والخلفية مُحاكاة بحال واحدة يقرؤها الطرفان. DEMO2_SHOTS: مجلد تُحفظ فيه اللقطات.
import { test, expect } from '@playwright/test';
import { journeyMap, mapLanes } from '../supabase/functions/leaders-api/journey-map.js';

const ADMIN = 'http://localhost:4303/';
const APP = 'http://localhost:4304/';
const SHOTS = process.env.DEMO2_SHOTS || '';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const C1 = '00000000-0000-4000-8000-000000000902';
const OPEN = '00000000-0000-4000-8000-000000000901';
const CLOSED = '00000000-0000-4000-8000-000000000904';
const SESSION = 'demo-cohort-session-0123456789abcdefgh';
const TRY_TOKEN = 'TRY-cohort-0123456789abcdefghijklmnopqrstuv';
const COHORT_NAME = 'قادة هيئة المثال 1';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 2, active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 10, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 4, duration_days: 30, active: true },
];
const it = (title_ar, status) => ({ title_ar, status, required: true, kind: 'check', completed_at: status === 'done' ? '2026-11-04T09:00:00Z' : null });
const realJourney = (at) => stages.map((s, i) => ({ key: s.key, title_ar: s.title_ar, stage_mode: 'required', status: i < at ? 'done' : i === at ? 'active' : 'locked', items: [it(`بند ${s.title_ar}`, i < at ? 'done' : 'pending')] }));
// عضوان حقيقيان في الدفعة، ولا صف للحساب التجريبي: الخادم لا يعيده في أي قراءة (demo_cohort_test.ts)
const people = [
  { id: 'p-sara', name: 'سارة العتيبي', status: 'enrolled', created_at: '2026-10-25T08:00:00Z', journey: realJourney(2), milestones: [], dates: [], progress: 55, phone: '+966551112233' },
  { id: 'p-osama', name: 'أسامة الحربي', status: 'enrolled', created_at: '2026-10-25T08:00:00Z', journey: realJourney(2), milestones: [], dates: [], progress: 60, phone: '+966559998877' },
];
const built = journeyMap({ stages, people, cohort: { id: C1, name: COHORT_NAME, starts_on: '2026-11-01', is_default: false }, program: { name: 'برنامج القادة' }, today: new Date(), list: true, activity: true, roster: true });
const { members, ...map } = built;
map.lanes = mapLanes(stages);
const roster = members.map((m) => ({ ...m, email: `${m.id.slice(2)}@example.sa`, phone: people.find((p) => p.id === m.id).phone, job_title: 'مدير مشروع', organization_name: 'هيئة المثال', group: null, last_active_at: ago(60), last_login_at: ago(60), onboarding: null }));

const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [{ id: 'v1', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [
  { id: C1, name: COHORT_NAME, program_id: 'pa', program_version_id: 'v1', organization_id: 'o1', status: 'running', starts_on: '2026-11-01', ends_on: '2027-01-15', delivery: {}, members: 2, capacity: 25, schedule: {} },
  { id: CLOSED, name: 'دفعة أُغلقت', program_id: 'pa', program_version_id: 'v1', status: 'closed', starts_on: '2026-06-01', ends_on: '2026-09-01', delivery: {}, members: 3, schedule: {} },
  { id: OPEN, name: 'الدفعة المفتوحة', is_default: true, program_id: 'pa', program_version_id: 'v1', status: 'running', delivery: {}, members: 40, schedule: {} },
];

// حال الخادم المحاكى: هل الترحيل مطبّق، وهل أُنشئ حساب الدفعة، وروابطه، وما طُلب
function backend({ ready = true } = {}) {
  const s = { ready, exists: false, skipped: 0, lastUsed: null, lastOpened: null, links: [], calls: [], opened: 0 };
  const view = (l) => ({ id: l.id, label: l.label, created_by: l.created_by, created_at: l.created_at, expires_at: l.expires_at, last_used_at: l.last_used_at, uses: l.uses, state: 'active' });
  const stage = (key, title_ar, phase, status, window) => ({ key, title_ar, phase, status, window, ...(status === 'done' && key === 'training' ? { skipped: true, override: 'skip' } : {}),
    items: [{ id: `${key}-1`, code: key, kind: 'check', title_ar: `بند ${title_ar}`, required: true, status: status === 'done' ? 'done' : 'pending' }], done: status === 'done' ? 1 : 0, total: 1 });
  // رحلة الحساب بخطة دفعته: نوافذ المراحل من مواعيدها، والمرحلة الموقوفة في الدفعة (التوجيه على رأس العمل) ليست فيها
  const me = (shared) => ({
    success: true, features: { hall: false, katon: false, f360: false }, ...(shared ? { demo_shared: true } : {}),
    participant: { id: 'demo-c1', full_name: 'مشارك تجريبي', email: `demo-${C1}@demo.milestone-impact.org`, status: 'placed', is_demo: true, consented_at: '2026-11-01T00:00:00Z', organization_linked: false },
    profile: { full_name: 'مشارك تجريبي', phone: '0500000000', job_title: 'مدير إدارة المشاريع', organization_name: 'جهة تجريبية', years_experience: 8, approved: true, level: 'intermediate',
      track: { title: 'القيادة من خلال الآخرين', summary: 'ملخص', strengths: 'قوة', journey: 'رحلة' } },
    cohort: { name: COHORT_NAME, starts_on: '2026-11-01', ends_on: '2027-01-15' },
    org: { name: 'هيئة المثال', short_name: 'المثال', color: '#1f5f8b', logo_v: null },
    journey: [stage('profile', 'الملف الشخصي', 'admission', 'done', { from: '2026-11-01', to: '2026-11-02' }), stage('assessment', 'تحديد المستوى', 'admission', 'done', { from: '2026-11-03', to: '2026-11-05' }),
      stage('training', 'التدريب', 'qualification', s.skipped ? 'done' : 'active', { from: '2026-11-06', to: '2026-11-15' }), stage('final', 'التقرير النهائي', 'impact', s.skipped ? 'active' : 'locked', { from: '2026-11-16', to: '2026-12-15' })],
    milestones: [], milestone_summary: { done: 0, total: 0 }, continuous: null, progress: s.skipped ? 60 : 30, passkeys: 1, prompt_passkey: false, group: null, advisor: null,
  });
  const status = (b) => {
    const c = cohorts.find((x) => x.id === b.cohort_id);
    const general = !!c.is_default, closed = c.status === 'closed';
    const base = { success: true, ready: general || s.ready, general, closed, cohort: { id: c.id, name: c.name }, max: 20 };
    if (!base.ready || general || closed) return { ...base, exists: false, links: [] };
    return { ...base, exists: s.exists, links: s.links.filter((l) => !l.revoked).map(view),
      ...(s.exists ? { stage: s.skipped ? 'التقرير النهائي' : 'التدريب', created_at: ago(30), last_used_at: s.lastUsed, last_opened_at: s.lastOpened, last_opened_by: 'a@x.com' } : {}) };
  };
  const admin = (b) => {
    s.calls.push(b);
    switch (b.action) {
      case 'admin.demo-cohort': return status(b);
      case 'admin.demo-open':
        if (b.cohort_id && !s.ready) return { success: false, code: 'not_migrated', message: 'الحساب التجريبي لكل دفعة غير مفعّل بعد' };
        s.exists = true; s.lastOpened = ago(0); s.lastUsed = ago(0);
        return { success: true, url: `${APP}#demo=${SESSION}`, status: 'placed', cohort: b.cohort_id ? { id: C1, name: COHORT_NAME } : null };
      case 'admin.demo-reset': s.exists = false; s.skipped = 0; return { success: true };
      case 'admin.demo-link-create': {
        const l = { id: `00000000-0000-4000-8000-00000000010${s.links.length + 1}`, token: TRY_TOKEN, cohort_id: b.cohort_id || null, label: String(b.label).trim(), created_by: 'a@x.com', created_at: ago(0), expires_at: new Date(Date.now() + b.days * 864e5).toISOString(), last_used_at: null, uses: 0, revoked: false };
        s.links.push(l);
        return { success: true, link: view(l), url: `${APP}#try=${l.token}` };
      }
      case 'admin.demo-link-revoke': { const l = s.links.find((x) => x.id === b.id); if (l) l.revoked = true; return { success: true, ended: 1 }; }
      case 'admin.programs': return { success: true, programs, cohorts, organizations: [{ id: 'o1', name: 'هيئة المثال' }] };
      case 'admin.orgs': return { success: true, orgs: [], unassigned: {} };
      case 'admin.participants': return { success: true, participants: [] };
      case 'admin.milestones': return { success: true, program_id: 'pa', milestones: [] };
      case 'admin.cohort-definition': return { success: true, program_id: 'pa', version: { id: 'v1', number: 1, label: 'الإطلاق' }, stages, hidden: [], sessions: [], requirements: [], cohort_plan: { schedule: {}, starts_on: '2026-11-01', is_default: false, status: 'running', program_version_id: 'v1', updated_at: 'u0' } };
      case 'admin.cohort-journey': return { success: true, journey_map: map, roster };
      default: return { success: true };
    }
  };
  const leaders = (b) => {
    s.calls.push(b);
    switch (b.action) {
      case 'demo.link-open': {
        const l = s.links.find((x) => x.token === b.t && !x.revoked);
        if (!l) return [404, { success: false, code: 'link_invalid', message: 'رابط التجربة غير صالح. تأكد من نسخه كاملًا، أو اطلب رابطًا جديدًا ممن أرسله لك' }];
        l.uses += 1; l.last_used_at = ago(0); s.opened += 1; s.exists = true; s.lastUsed = ago(0);
        return [200, { ...me(true), token: SESSION }];
      }
      case 'me': return b.token === SESSION ? [200, me(false)] : [401, { success: false, code: 'session', message: 'الجلسة منتهية، سجّل الدخول من جديد' }];
      case 'demo.skip-stage': s.skipped += 1; return [200, { ...me(false), skipped: 'training' }];
      case 'lab.list': return [200, { success: true, items: [], points: 0 }];
      case 'certificate': return [200, { success: true, certificate: null }];
      default: return [200, { success: true }];
    }
  };
  return { s, admin, leaders };
}

async function route(page, be) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (String(b.action).startsWith('admin.')) return r.fulfill({ json: be.admin(b) });
    const [status, json] = be.leaders(b);
    return r.fulfill({ status, json });
  });
}
async function openCohortPage(page, id = C1, role = 'super_admin') {
  await page.goto(ADMIN);
  await page.evaluate((r) => { sessionStorage.clear(); sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'هند', email: 'a@x.com', role_id: r, totp_enabled: true }, ts: Date.now() })); }, role);
  await page.goto(`${ADMIN}#/leaders/programs/${id}`);
  await page.reload();
  await expect(page.locator('.cohort-page h2')).toBeVisible();
}
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const shot = async (page, name, target = null) => {
  if (!SHOTS) return;
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  if (target) { await target.scrollIntoViewIfNeeded(); await target.screenshot({ path: `${SHOTS}/${name}.png` }); } else await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

for (const width of [390, 1440]) {
  test.describe(`حساب تجريبي لكل دفعة على ${width}`, () => {
    test.use({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 2, locale: 'ar-SA' });

    test('ملف الدفعة: لم يُنشأ، ثم الفتح ينشئه فيظهر الشريط باسم الدفعة ورحلتها بخطتها، ثم حالته ورابط تجربته', async ({ page, context, browser }) => {
      const be = backend();
      await context.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
      await context.route(/functions\/v1\/leaders-api/, async (r) => {
        const b = JSON.parse(r.request().postData() || '{}');
        if (String(b.action).startsWith('admin.')) return r.fulfill({ json: be.admin(b) });
        const [status, json] = be.leaders(b);
        return r.fulfill({ status, json });
      });
      await context.addInitScript(() => { try { localStorage.setItem('mi_leaders_welcome_seen', 'true'); } catch { /* صفحة بلا تخزين */ } });
      await openCohortPage(page);
      const card = page.getByTestId('cohort-demo');
      await expect(card).toBeVisible();
      const status = page.getByTestId('cohort-demo-status');
      // لم يُنشأ بعد: القراءة لا تنشئه، ولا زر إعادة ضبط لما لم يوجد
      await expect(status).toHaveText('الحالة لم يُنشأ بعد: يُنشأ عند أول فتح');
      await expect(card).toContainText('ليس عضوًا فيها');
      await expect(card.getByRole('button', { name: 'أعِده إلى البداية' })).toHaveCount(0);
      expect(be.s.calls.find((c) => c.action === 'admin.demo-cohort')).toMatchObject({ cohort_id: C1 });
      await noOverflow(page);
      await shot(page, `admin-cohort-not-created-${width}`, card);
      // عدد الدفعة قبل الحساب
      await expect(page.locator('.stat-card', { hasText: 'الأعضاء' }).locator('.stat-value')).toHaveText('2 / 25');

      // الفتح: يرسل معرّف الدفعة، وينشئ الحساب، وتُفتح المنصة في نافذة جديدة بجلسة جاهزة
      const [pop] = await Promise.all([page.waitForEvent('popup'), card.getByRole('button', { name: 'افتح الحساب التجريبي' }).click()]);
      expect(be.s.calls.find((c) => c.action === 'admin.demo-open')).toMatchObject({ cohort_id: C1 });
      await pop.setViewportSize({ width, height: width > 500 ? 900 : 844 });
      // الرابط يبدأ من شاشة الدخول والجولة الحيّة كما للحساب العام، والدخول بزر الجولة ثم تُصغَّر لوحتها
      const tour = pop.getByRole('region', { name: 'الجولة الحيّة' });
      await tour.getByRole('button', { name: 'التالي' }).click();
      await tour.getByRole('button', { name: 'ادخل بالحساب التجريبي' }).click();
      const bar = pop.getByTestId('demo-bar');
      await expect(bar).toBeVisible();
      // الجولة تنتقل بين الشاشات، والمقصود هنا الرئيسية: تُعاد الجولة إلى أولها وتُفتح الصفحة من جديد بالجلسة نفسها، ثم تُصغَّر لوحتها
      await pop.evaluate(() => sessionStorage.removeItem('mi_demo_step'));
      await pop.reload();
      await expect(bar).toBeVisible();
      const hide = tour.getByRole('button', { name: 'إخفاء' });
      if (await hide.count()) await hide.click();
      await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
      await expect(bar.getByTestId('demo-cohort')).toHaveText(`دفعة «${COHORT_NAME}»`);
      await expect(bar).toContainText('ما تفعله هنا لا يُحسب.');
      await expect(bar).not.toContainText('وقد يراه غيرك');
      await expect(bar.getByTestId('demo-current')).toContainText('التدريب');
      expect(new URL(pop.url()).hash).not.toContain('demo=');
      expect(be.s.calls.find((c) => c.action === 'me')?.token).toBe(SESSION);
      await noOverflow(pop);
      await shot(pop, `demo-bar-cohort-${width}`);
      // الرحلة بخطة الدفعة: مراحلها الأربع بتواريخ نوافذها، وشعار الجهة من الدفعة
      await expect(pop.getByText('التقرير النهائي').first()).toBeAttached();
      await expect(pop.getByText('التوجيه على رأس العمل')).toHaveCount(0);
      if (SHOTS) { await pop.waitForTimeout(400); await pop.screenshot({ path: `${SHOTS}/journey-cohort-plan-${width}.png`, fullPage: true }); }
      // التخطي من الشريط يعمل لحساب الدفعة كما للعام
      await bar.getByRole('button', { name: 'تخطَّ هذه المرحلة' }).click();
      await expect(bar.getByTestId('demo-current')).toContainText('التقرير النهائي');
      // ولا طلب إدارة خرج من المنصة
      await pop.close();

      // اللوحة حين يعود إليها المدير: تُقرأ الحالة من جديد. قائم، ومرحلته، وآخر استعماله، ومن فتحه. وزر إعادة الضبط للمدير العام
      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(status).toContainText('قائم · عند: التقرير النهائي · آخر استعمال');
      await expect(status).toContainText('آخر فتح من اللوحة');
      await expect(status).toContainText('a@x.com');
      await expect(card.getByRole('button', { name: 'أعِده إلى البداية' })).toBeVisible();
      await noOverflow(page);
      await shot(page, `admin-cohort-created-${width}`, card);

      // رابط تجربة للدفعة: يحمل معرّفها، ويُعرض مرة واحدة، ويدخل به المستلم حساب الدفعة بسطر «مشترك»
      const links = card.getByTestId('demo-links');
      await expect(links).toContainText('رحلة هذه الدفعة بحسابها التجريبي');
      await expect(links).toContainText('الرابط يتوقف عند إغلاق الدفعة');
      await links.getByLabel('لمن الرابط؟').fill('مدير الدفعة في الجهة');
      await links.getByRole('button', { name: 'أنشئ الرابط' }).click();
      expect(be.s.calls.find((c) => c.action === 'admin.demo-link-create')).toMatchObject({ cohort_id: C1, label: 'مدير الدفعة في الجهة', days: 7 });
      const fresh = links.locator('.demo-links-fresh');
      await expect(fresh).toContainText('رابط «مدير الدفعة في الجهة» جاهز. انسخه الآن: لا يُعرض مرة أخرى.');
      const url = await fresh.getByLabel('رابط التجربة').inputValue();
      await expect(links.getByRole('list', { name: 'الروابط النشطة' }).getByRole('listitem')).toHaveCount(1);
      await noOverflow(page);
      await shot(page, `admin-cohort-share-link-${width}`, card);
      const guestCtx = await browser.newContext({ locale: 'ar-SA', viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 2 });
      const guest = await guestCtx.newPage();
      await guest.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
      await route(guest, be);
      await guest.goto(url);
      const gbar = guest.getByTestId('demo-bar');
      await expect(gbar.getByTestId('demo-cohort')).toHaveText(`دفعة «${COHORT_NAME}»`);
      await expect(gbar).toContainText('ما تفعله هنا لا يُحسب، وقد يراه غيرك ممن يجرّب.');
      expect(be.s.calls.filter((c) => c.action === 'demo.link-open').map((c) => c.t)).toEqual([TRY_TOKEN]);
      await noOverflow(guest);
      await shot(guest, `share-link-visitor-cohort-${width}`);
      await guestCtx.close();

      // الحساب ليس في عدد الدفعة ولا في متابعتها: العدد كما كان، والصفوف للعضوين وحدهما
      await page.reload();
      await expect(page.locator('.stat-card', { hasText: 'الأعضاء' }).locator('.stat-value')).toHaveText('2 / 25');
      await page.getByRole('tablist', { name: 'أقسام ملف الدفعة' }).getByRole('tab', { name: 'المتابعة' }).click();
      const box = page.getByTestId('cohort-roster');
      await expect(box.locator('.cr-table tbody tr, .cr-card')).toHaveCount(2);
      await expect(box).toContainText('سارة العتيبي');
      await expect(box).not.toContainText('مشارك تجريبي');
      await expect(box).not.toContainText('demo.milestone-impact.org');
      await noOverflow(page);
      if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/roster-without-demo-${width}.png`, fullPage: true }); }

      // إعادة الضبط: بتأكيد يسمّي الدفعة ورابطها، وترسل معرّف الدفعة
      await page.getByRole('tablist', { name: 'أقسام ملف الدفعة' }).getByRole('tab').first().click();
      await card.getByRole('button', { name: 'أعِده إلى البداية' }).click();
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      await expect(dialog).toContainText(`إعادة الحساب التجريبي لدفعة «${COHORT_NAME}» إلى البداية؟`);
      await expect(dialog).toContainText('«مدير الدفعة في الجهة»');
      await expect(dialog).toContainText('حسابات الدفعات الأخرى والحساب العام لا تُمس.');
      expect(be.s.calls.some((c) => c.action === 'admin.demo-reset')).toBe(false);
      await dialog.getByRole('button', { name: /تأكيد|نعم|أعِد|متابعة|موافق/ }).first().click();
      await expect.poll(() => be.s.calls.find((c) => c.action === 'admin.demo-reset')?.cohort_id).toBe(C1);
      await expect(status).toHaveText('الحالة لم يُنشأ بعد: يُنشأ عند أول فتح');
    });

    test('قبل الترحيل: «غير مفعّلة بعد» بلا زر فتح ولا روابط، والدفعة المفتوحة حسابها العام، والمغلقة بلا حساب، والمراقب لا يرى البطاقة', async ({ page }) => {
      const be = backend({ ready: false });
      await route(page, be);
      await openCohortPage(page);
      const card = page.getByTestId('cohort-demo');
      await expect(page.getByTestId('cohort-demo-status')).toHaveText('الحالة غير مفعّلة بعد');
      await expect(card).toContainText('يُفعَّل بعد تحديث قاعدة البيانات، بلا نشر جديد');
      await expect(card).toContainText('استعمل الحساب التجريبي العام من النظرة العامة');
      await expect(card.getByRole('button')).toHaveCount(0);
      await expect(card.getByTestId('demo-links')).toHaveCount(0);
      expect(be.s.calls.some((c) => ['admin.demo-open', 'admin.demo-link-create'].includes(c.action))).toBe(false);
      await noOverflow(page);
      await shot(page, `admin-cohort-not-enabled-${width}`, card);

      // الدفعة المفتوحة: حسابها العام، يُفتح بلا معرّف دفعة حتى قبل الترحيل، وروابطه في النظرة العامة
      await openCohortPage(page, OPEN);
      await expect(card).toContainText('الدفعة المفتوحة حسابها هو الحساب التجريبي العام');
      await expect(card.getByRole('button', { name: 'افتح الحساب التجريبي' })).toBeVisible();
      await expect(card.getByTestId('demo-links')).toHaveCount(0);
      const [pop] = await Promise.all([page.waitForEvent('popup'), card.getByRole('button', { name: 'افتح الحساب التجريبي' }).click()]);
      await pop.close();
      expect(be.s.calls.find((c) => c.action === 'admin.demo-open').cohort_id).toBeUndefined();

      // المغلقة: لا حساب ولا زر فتح
      be.s.ready = true;
      await openCohortPage(page, CLOSED);
      await expect(page.getByTestId('cohort-demo-status')).toContainText('الدفعة مغلقة: حُذف حسابها التجريبي عند إغلاقها');
      await expect(card.getByRole('button')).toHaveCount(0);
      await shot(page, `admin-cohort-closed-${width}`, card);

      // المراقب (بلا صلاحية كتابة): لا بطاقة ولا طلب حالة
      const before = be.s.calls.filter((c) => c.action === 'admin.demo-cohort').length;
      await openCohortPage(page, C1, 'viewer');
      await expect(page.getByText('كل ما يخص الدفعة')).toBeVisible();
      await expect(page.getByTestId('cohort-demo')).toHaveCount(0);
      expect(be.s.calls.filter((c) => c.action === 'admin.demo-cohort').length).toBe(before);
    });
  });
}
