// فريق الجهة والدفعة (تصور ربط الخبراء والمجموعات بالجهة v1، المرحلة 1): صفحة الجهة تلخّص فرق دفعاتها، ومنها يُفتح
// «الفريق والمجموعات» للدفعة: المستشار والفريق والحمل، و«أضف إلى الفريق» ببحث أو بدعوة شخص جديد في خطوة واحدة بدوره ونطاقه.
// الحمل الزائد تنبيه لا منع. سطح المكتب و390px ولوحة المفاتيح. الخلفية مُحاكاة، ولا بريد يُرسل.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const org = { id: 'o1', name: 'هيئة المثال', short_name: 'هم', color: '#12414E', invite_code: 'mithal', status: 'active', domains: [], stats: { total: 0, registered: 0, pending_approval: 0, active_week: 0 } };
const cohort = { id: 'c1', name: 'دفعة هيئة المثال 2026', status: 'running', starts_on: '2026-03-01', ends_on: '2026-06-30', organization_id: 'o1', advisor_expert_id: 'adv', org_name: 'هيئة المثال', is_default: false };
const ex = (id, full_name, roles, load, status = 'active', extra = {}) => ({ id, full_name, title: null, status, roles, dimensions: [], levels: [], load, ...extra });
const adv = ex('adv', 'د. سارة العلي', ['advisor'], { hours: 40, used: 30, full: false, cohorts: 2 }, 'active', { title: 'مستشارة قيادة' });
const khalid = ex('g1', 'أ. خالد ن.', ['coach', 'mentor'], { hours: 10, used: 7, full: false, cohorts: 1 });
const nora = ex('t1', 'أ. نورة ع.', ['assessor'], null, 'invited');
const reem = ex('e2', 'م. ريم س.', ['coach'], { hours: 6, used: 6, full: true, cohorts: 3 });
const fahd = ex('e3', 'د. فهد م.', ['specialist'], { hours: 8, used: 1, full: false, cohorts: 0 });
const team = {
  success: true, team_max: 30, cohort,
  rows: [
    { expert_id: 'adv', advisor: true, member: true, groups: [], expert: adv, serves_here: 30 },
    { expert_id: 'g1', advisor: false, member: true, groups: [{ id: 'G1', name: 'المجموعة 1' }], expert: khalid, serves_here: 7 },
    { expert_id: 't1', advisor: false, member: true, groups: [], expert: nora, serves_here: 0 },
  ],
  groups: [{ id: 'G1', name: 'المجموعة 1', advisor_expert_id: 'g1', count: 7 }, { id: 'G2', name: 'المجموعة 2', advisor_expert_id: null, count: 6 }],
  coverage: { members: 40, without_advisor: 0, groups: 2, groups_without_expert: 1, ungrouped: 3 },
  experts: [{ ...adv, in_team: true }, { ...khalid, in_team: true }, { ...reem, in_team: false }, { ...fahd, in_team: false }],
};
const orgTeam = { success: true, cohorts: [
  { id: 'c1', name: cohort.name, status: 'running', starts_on: cohort.starts_on, ends_on: cohort.ends_on, advisor: { id: 'adv', full_name: adv.full_name, status: 'active' },
    team: 3, roles: { advisor: 1, coach: 1, mentor: 1, assessor: 1 }, not_approved: 1, coverage: team.coverage },
  { id: 'c0', name: 'دفعة هيئة المثال 2025', status: 'closed', starts_on: '2025-03-01', ends_on: '2025-06-30', advisor: null, team: 0, roles: {}, not_approved: 0,
    coverage: { members: 38, without_advisor: 38, groups: 0, groups_without_expert: 0, ungrouped: 38 } },
] };

async function setup(page, extra = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.org': { success: true, org, participants: [], funnel: { registered: 0, withdrawn: 0, pending_approval: 0, approved: 0, completed: 0 }, by_track: {}, by_via: {}, by_campaign: {}, by_site: {} },
      'admin.coordinator': { success: true, coordinator: null },
      'admin.org-finance': { success: false, message: 'غير مطلوب هنا' },
      'admin.org-team': orgTeam,
      'admin.cohort-team': team,
      'admin.cohort-groups': { success: true, cohort: { ...cohort, stage_modes: {} }, group_advisor_ready: true, experts: [], stages: [{ key: 'training', title_ar: 'التدريب' }], groups: [], members: [] },
      'admin.team-add': { success: true, expert_id: 'e2', invited: false, notified: true, over: true },
      'admin.team-remove': { success: true, cleared: { advisor: true, groups: 0 } },
      ...extra,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  return calls;
}
const sent = (calls, action) => calls.filter((c) => c.action === action).at(-1);

test('صفحة الجهة تلخّص فرق دفعاتها، ومنها يُضاف خبير معتمد بدوره ونطاق مجموعة، والحمل الزائد تنبيه لا منع', async ({ page }) => {
  const calls = await setup(page);
  const sec = page.getByRole('region', { name: 'الفريق والمجموعات' });
  await expect(sec).toContainText('د. سارة العلي');
  await expect(sec).toContainText('3 خبراء');
  await expect(sec).toContainText('1 لم يُعتمد بعد');
  await expect(sec).toContainText('مجموعة واحدة بلا خبير');
  // المغلقة مطوية
  await expect(sec.getByText('الدفعات المغلقة (1)')).toBeVisible();
  await expect(sec.getByText('دفعة هيئة المثال 2025')).toBeHidden();
  await sec.getByRole('button', { name: 'افتح فريق الدفعة' }).click();

  const dlg = page.getByRole('dialog', { name: `الفريق والمجموعات: ${cohort.name}` });
  await expect(dlg.getByRole('tab', { name: 'الفريق' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg).toContainText('يخدم هنا 30 مشاركًا');
  await expect(dlg).toContainText('خبير المجموعة 1');
  await expect(dlg).toContainText('مدعو، لم يُعتمد بعد');
  await expect(dlg).toContainText('1 مارس 2026 إلى 30 يونيو 2026');

  await dlg.getByRole('button', { name: '+ أضف إلى الفريق' }).click();
  const add = page.getByRole('dialog', { name: `أضف إلى فريق «${cohort.name}»` });
  await add.getByRole('button', { name: 'أضف' }).click();
  await expect(add.getByRole('alert')).toHaveText('اختر الخبير من القائمة، أو ادعُ شخصًا جديدًا');
  await add.getByLabel('ابحث في الخبراء المعتمدين').fill('ريم');
  await expect(add.getByRole('radio', { name: /د\. فهد/ })).toHaveCount(0);
  await add.getByRole('radio', { name: /م\. ريم س\./ }).check();
  // الممتلئ معروض بتنبيه ولا يُحجب
  await expect(add.getByRole('status')).toContainText('بلغ سعته المعلنة أو تجاوزها');
  // الدور من أدوار ملفه وحدها
  await expect(add.getByRole('radio', { name: /^مقيّم/ })).toHaveCount(0);
  await add.getByRole('radio', { name: /^موجّه/ }).check();
  await add.getByRole('radio', { name: /خبير مجموعة/ }).check();
  await add.getByLabel('المجموعة').selectOption('G2');
  await add.getByRole('button', { name: 'أضف' }).click();
  await expect(page.getByText('أُضيف م. ريم س. إلى الفريق وأُبلغ بالبريد. تنبيه: بلغ سعته المعلنة', { exact: false })).toBeVisible();
  expect(sent(calls, 'admin.team-add')).toMatchObject({ cohort_id: 'c1', expert_id: 'e2', role: 'coach', scope: 'group', group_id: 'G2' });
  await expect(add).toBeHidden();
});

test('ادعُ شخصًا جديدًا وأضفه في خطوة واحدة: دوره أول أدوار ملفه، ويدخل الفريق وحده قبل اعتماده', async ({ page }) => {
  const calls = await setup(page, { 'admin.team-add': { success: true, expert_id: 'new', invited: true, over: false } });
  await page.getByRole('region', { name: 'الفريق والمجموعات' }).getByRole('button', { name: 'افتح فريق الدفعة' }).click();
  await page.getByRole('button', { name: '+ أضف إلى الفريق' }).click();
  const add = page.getByRole('dialog', { name: /أضف إلى فريق/ });
  await add.getByRole('button', { name: 'ادعُ شخصًا جديدًا' }).click();
  await expect(add.getByRole('button', { name: 'ادعُ شخصًا جديدًا' })).toHaveAttribute('aria-pressed', 'true');
  await add.getByLabel('الاسم الكامل *').fill('م. هند ر.');
  await add.getByLabel('البريد *').fill('hind@example.com');
  await add.getByRole('radio', { name: /^مقيّم/ }).check();
  await expect(add.getByRole('radio', { name: /خبير مجموعة/ })).toBeDisabled();
  await expect(add.getByRole('radio', { name: /المستشار الأساسي/ })).toBeDisabled();
  await add.getByRole('button', { name: 'ادعُ وأضف' }).click();
  await expect(page.getByText('أُرسلت الدعوة إلى hind@example.com، وأُضيف م. هند ر. إلى الفريق')).toBeVisible();
  const b = sent(calls, 'admin.team-add');
  expect(b).toMatchObject({ cohort_id: 'c1', role: 'assessor', scope: 'cohort', invite: { full_name: 'م. هند ر.', email: 'hind@example.com' } });
  expect(b.expert_id).toBeUndefined();
});

test('الإزالة تقول ما يُزال معها، وتغيير المستشار يُنبّه بانتقال المعلّق', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('region', { name: 'الفريق والمجموعات' }).getByRole('button', { name: 'افتح فريق الدفعة' }).click();
  const dlg = page.getByRole('dialog', { name: /الفريق والمجموعات:/ });
  await dlg.getByRole('button', { name: 'إزالة د. سارة العلي من الفريق' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('يُزال معه بصفته مستشارًا أساسيًا');
  await ask.getByRole('button', { name: 'إزالة' }).click();
  await expect.poll(() => sent(calls, 'admin.team-remove')).toMatchObject({ cohort_id: 'c1', expert_id: 'adv' });

  await dlg.getByRole('button', { name: 'تغيير' }).click();
  const add = page.getByRole('dialog', { name: /أضف إلى فريق/ });
  await expect(add.getByRole('radio', { name: /المستشار الأساسي/ })).toBeChecked();
  await add.getByRole('radio', { name: /أ\. خالد ن\./ }).check();
  await expect(add.getByRole('radio', { name: /^مستشار/ })).toHaveCount(0);
  await add.getByRole('radio', { name: /^مرشد/ }).check();
  await add.getByRole('button', { name: 'أضف' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('يحل أ. خالد ن. محل د. سارة العلي مستشارًا أساسيًا، وتنتقل إليه المراجعات المعلّقة');
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => sent(calls, 'admin.team-add')).toMatchObject({ expert_id: 'g1', role: 'mentor', scope: 'advisor' });
});

test('390px ولوحة المفاتيح: لا تمرير أفقي، والأسهم بين التبويبين، وEsc يغلق العليا وحدها', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('region', { name: 'الفريق والمجموعات' }).getByRole('button', { name: 'افتح فريق الدفعة' }).click();
  const dlg = page.getByRole('dialog', { name: /الفريق والمجموعات:/ });
  await expect(dlg).toContainText('أ. خالد ن.');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(1);
  const box = await dlg.locator('.ct-row').first().boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);

  const tab = dlg.getByRole('tab', { name: 'الفريق' });
  await tab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dlg.getByRole('tab', { name: 'المجموعات ونمط العمل' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg.getByRole('tab', { name: 'المجموعات ونمط العمل' })).toBeFocused();
  await expect(dlg.getByRole('tabpanel')).toContainText('نمط العمل في كل مرحلة');
  await page.keyboard.press('ArrowRight');
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  await dlg.getByRole('button', { name: '+ أضف إلى الفريق' }).click();
  const add = page.getByRole('dialog', { name: /أضف إلى فريق/ });
  await expect(add).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(add).toBeHidden();
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test('صفحة الجهة عند الإدارة: جاهزية الدفعة بما ينقصها وأين يُضبط، وخريطة الرحلة نفسها التي يراها مسؤول الجهة', async ({ page }) => {
  const st = (key, phase, title, here, done) => ({ key, phase, title, duration_days: 0, here, done, late: 0 });
  await setup(page, {
    'admin.org-journey': {
      success: true, cohort: { id: 'c1', name: 'دفعة سفراء', status: 'open' }, setup_missing: 2,
      setup: [
        { key: 'members', title: 'الأعضاء', ok: true, detail: '27 في الدفعة (من سُجّل فيها ومن انضم بجهتها)', where: null },
        { key: 'advisor', title: 'المستشار الأساسي', ok: false, detail: 'غير معيَّن: لا خبير يرى ملفات المشاركين ولا إجاباتهم', where: 'team' },
        { key: 'schedule', title: 'جدول المراحل', ok: false, detail: 'فارغ: يرى المشارك «بلا موعد بعد» عند كل مرحلة', where: 'schedule' },
      ],
      journey_map: {
        program: { name: 'برنامج القادة' }, cohort: { name: 'دفعة سفراء', starts_on: '2026-11-10' }, totals: { total: 27, finished: 0, late: 0, not_started: 0 }, bottleneck: { stage: 'assessment' },
        stages: [st('profile', 'admission', 'الملف الشخصي', 4, 23), st('assessment', 'admission', 'تحديد المستوى', 15, 8), st('approval', 'admission', 'اعتماد المستوى', 8, 0), st('training', 'qualification', 'التدريب', 0, 0)],
        milestones: [],
      },
    },
  });
  const card = page.locator('.oj');
  await expect(card).toContainText('بقي بندان لتكتمل جاهزية الدفعة.');
  await expect(card.locator('.oj-setup li.todo')).toHaveCount(2);
  // كل إعدادات الدفعة في ملفها: رابط واحد بدل وصف الطريق إلى كل بند
  await expect(card.getByRole('link', { name: 'افتح ملف الدفعة' })).toHaveAttribute('href', '#/leaders/programs/c1');
  // الخريطة المشتركة بهويتها داخل اللوحة: العنوان والأعداد وأكبر تجمع
  const map = card.locator('.jm');
  await expect(map.getByRole('heading', { name: 'دفعة سفراء' })).toBeVisible();
  await expect(map).toContainText('أكبر تجمع الآن 15 شخصًا عند «تحديد المستوى»');
  expect(await map.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});

test('جاهزية الجهة في رأس صفحتها: ما ينقص بجملة، ولكل ناقص زر ضبطه، والدفعة بند يقود إلى ملفها', async ({ page }) => {
  const calls = await setup(page, {
    'admin.orgs': { success: true, orgs: [{ ...org, access: { state: 'invited', n: 1, email: 'k@x.sa' } }], unassigned: { total: 0, typed: [] } },
    'admin.org-journey': { success: true, cohort: { id: 'c1', name: 'دفعة سفراء', status: 'open' }, setup_missing: 2, setup: [], journey_map: null },
  });
  const card = page.locator('.org-ready');
  await expect(card.getByRole('heading', { name: 'جاهزية الجهة' })).toBeVisible();
  // بلا مقاعد ولا عقد ولا شعار في بيانات الجهة، والمنسق مدعو لم يدخل، والدفعة بقي فيها بندان
  await expect(card.locator('li.no', { hasText: 'منسق الجهة' })).toContainText('دُعي (k@x.sa) ولم يدخل بعد');
  await expect(card.locator('li.no', { hasText: 'العقد والمقاعد' })).toContainText('عدد المقاعد');
  await expect(card.locator('li.ok', { hasText: 'رابط التسجيل' })).toHaveCount(1);
  // الرحلة تُقرأ مرة واحدة لقسمها وللجاهزية معًا
  expect(calls.filter((c) => c.action === 'admin.org-journey')).toHaveLength(1);
  await card.locator('li', { hasText: 'الدفعة' }).getByRole('button', { name: 'افتح ملف الدفعة' }).click();
  await expect(page).toHaveURL(/#\/leaders\/programs\/c1$/);
});
