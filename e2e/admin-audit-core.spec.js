// تدقيق الجاهزية، مجموعة لوحة الإدارة الأساسية (admin-core-5 إلى 12): الخلفية مُحاكاة بالكامل.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SENT = 'إن كان البريد مسجّلًا فسيصله رمز الدخول خلال دقيقة';
const pl = (m, i, l) => [['milestone', m], ['impact', i], ['leadership', l]].map(([dimension, level]) => ({ dimension, level, approved_at: null }));
const people = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'enrolled', placements: pl('beginner', 'beginner', 'intermediate'), created_at: '2026-10-01' },
  { id: 'p2', full_name: 'Omar Ali', email: 'o@x.com', organization_id: null, organization_name: 'شركة البناء', status: 'enrolled', placements: [], created_at: '2026-10-02' },
];
const orgs = [
  { id: 'o1', name: 'وزارة التجربة', short_name: 'وت', status: 'active', seats: 10, stats: { total: 1, registered: 1, profiled: 1, assessed: 1, approved: 1, completed: 0, pending_approval: 0, active_week: 1 } },
  { id: 'o2', name: 'هيئة المثال', short_name: 'هم', status: 'active', seats: 5, stats: { total: 0, registered: 0, profiled: 0, assessed: 0, approved: 0, completed: 0, pending_approval: 0, active_week: 0 } },
];
const person = {
  success: true, participant: { ...people[0], phone: '0500', last_login_at: '2026-10-20' }, progress: 20, history: [],
  profile: { approved: false, dimensions: [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'intermediate' }] },
  assessments: [{ status: 'submitted', assessment_results: [{ dimension: 'milestone', knowledge_pct: 50, skill_pct: 40, behavior_pct: 60, evaluation: { level: 'beginner', composite: 48, reason: 'المعرفة دون الحد في سؤالين من أسئلة البعد' } }] }],
  journey: [], points: { total: 30, rank: { title: 'مستكشف' } }, book: [], models: [],
};
const zero = { beginner: 0, intermediate: 0, advanced: 0 };
const overview = { success: true, total: 1, by_status: {}, pending_reviews: 0, matrix: { milestone: zero, impact: zero, leadership: zero } };

async function setup(page, hash, { leaders = {}, admin = {}, user = {} } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' },
      'sessions-list': { success: true, sessions: [] },
      'login-send': { success: true, message: SENT },
      'login-verify': { success: true, token: 't2', user: { name: 'مدير', email: 'a@x.com', role_id: 'admin' } },
      ...admin,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs, unassigned: { total: 1, typed: [{ name: 'شركة البناء', n: 1 }] } },
      'admin.participants': { success: true, participants: people },
      'admin.participant': person, 'admin.programs': { success: true, cohorts: [] },
      'admin.payments': { success: true, entitlements: [{ participant_id: 'p1', item: 'program', source: 'sponsor', revoked_at: null }] },
      'admin.expert-requests': { success: true, requests: [] }, 'admin.erasures': { success: true, items: [] },
      'admin.overview': overview,
      'admin.reviews': { success: true, pending_approval: [], submitted: [] },
      'admin.impact': { success: true, counts: { baseline: 0, post: 0, paired: 0 } },
      'admin.status': { success: true }, 'admin.assign-org': { success: true, moved: 1 },
      ...(typeof leaders === 'function' ? leaders(b) : leaders),
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((u) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: 'admin', ...u }, ts: Date.now() }));
    localStorage.clear();
  }, user);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}

for (const width of [1024, 1280, 1366]) {
  test(`admin-core-5: ملف المشارك لا يفيض أفقيًا على عرض ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await setup(page, '#/leaders/participants/p1');
    await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
    // بطاقة المستوى تطوي التفاصيل (تصور 2026-11-11): يُفتح بُعد Impact وحقل ملاحظته، فيُقاس الفيض بأعرض حالاتها
    const lc = page.locator('section.lc');
    await lc.getByRole('button', { name: /^Impact/ }).click();
    await lc.locator('#lc-det-impact').getByRole('button', { name: '+ ملاحظة' }).click();
    await expect(page.getByLabel('ملاحظة Impact')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
}

test('admin-core-6: فلتر الجهة يسري على قائمة المراجعة، و«بدون جهة» يُظهر فشل الأثر خطأً', async ({ page }) => {
  const calls = await setup(page, '#/leaders/overview', {
    leaders: (b) => (b.action === 'admin.impact' && b.organization_id === 'none' ? { 'admin.impact': { success: false, message: 'تعذّر تنفيذ العملية' } } : {}),
  });
  await expect(page.getByText('كل الجهات', { exact: true }).first()).toBeVisible();
  await page.getByLabel('الجهة', { exact: true }).selectOption('o1');
  await expect.poll(() => calls.find((c) => c.action === 'admin.reviews' && c.org === 'o1')).toBeTruthy();
  await page.getByLabel('الجهة', { exact: true }).selectOption('none');
  await expect.poll(() => calls.find((c) => c.action === 'admin.reviews' && c.org === 'none')).toBeTruthy();
  await expect(page.getByText(/تعذّر حساب قياس الأثر/)).toBeVisible();
  await expect(page.getByText('لم تُفعَّل أداة القياس البعدي بعد.')).toHaveCount(0);
});

test('admin-core-7: إعادة الإرسال تعرض رد الخادم المحايد وتنتظر مهلته، والإعدادات لا تَعِد برمز البريد لمن فعّل التطبيق', async ({ page }) => {
  await page.route(/functions\/v1\//, (route) => route.fulfill({ json: { success: true, message: SENT } }));
  await page.goto(BASE);
  await page.getByLabel('البريد الإلكتروني').fill('admin@example.com');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await expect(page.getByRole('status').filter({ hasText: SENT })).toBeVisible();
  await expect(page.getByText(/تم إرسال الرمز/)).toHaveCount(0);
  const resend = page.getByRole('button', { name: /إعادة إرسال رمز البريد بعد \d+ ثانية/ });
  await expect(resend).toBeDisabled();
  await expect(page.getByText('أدخل الرمز من تطبيق المصادقة إن فعّلته، وإلا فالرمز الذي وصل بريدك')).toBeVisible();
});

test('admin-core-7: حالة التطبيق المفعّل في الإعدادات', async ({ page }) => {
  await setup(page, '', { user: { totp_enabled: true } });
  await page.getByRole('button', { name: 'الإعدادات' }).click();
  await expect(page.getByText('يقبل رمز التطبيق وحده عند الدخول، ولا يُرسل لك رمز بريد')).toBeVisible();
  await expect(page.getByText(/رمز التطبيق \+ رمز البريد/)).toHaveCount(0);
});

test('admin-core-8: انتهاء الجلسة يعرض سببه فوق الشاشة ويُبقي ما كُتب حتى يُعاد الدخول', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1', { leaders: { 'admin.participant-save': { success: false, code: 'session', message: 'انتهت الجلسة' } } });
  await page.getByRole('button', { name: 'تعديل البيانات' }).click();
  const form = page.getByRole('dialog', { name: /تعديل بيانات/ });
  await form.getByLabel('المسمى').fill('مديرة إدارة التميز المؤسسي');
  await form.getByRole('button', { name: 'حفظ' }).click();
  const re = page.getByRole('dialog', { name: 'انتهت الجلسة' });
  await expect(re.getByRole('alert')).toContainText('انتهت جلستك');
  await expect(re.getByLabel('البريد الإلكتروني')).toHaveValue('a@x.com');
  // ما كُتب باقٍ تحت النافذة
  await expect(page.locator('input[value="مديرة إدارة التميز المؤسسي"]')).toHaveCount(1);
  await re.getByRole('button', { name: 'متابعة' }).click();
  await re.getByLabel('الرمز المكوّن من 6 أرقام').fill('123456');
  await re.getByRole('button', { name: 'تأكيد الدخول' }).click();
  await expect(re).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /تعديل بيانات/ }).getByLabel('المسمى')).toHaveValue('مديرة إدارة التميز المؤسسي');
});

test('admin-core-9: تغيير حالة المشارك إلى منسحب بتأكيد يسمي أثره', async ({ page }) => {
  const calls = await setup(page, '#/leaders/participants/p1');
  await page.getByLabel('الحالة', { exact: true }).selectOption('withdrawn');
  await page.getByRole('button', { name: 'تغيير الحالة' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('سارة الأحمد');
  await expect(dlg).toContainText('مقعده');
  await dlg.getByRole('button', { name: 'إلغاء' }).click();
  expect(calls.find((c) => c.action === 'admin.status')).toBeUndefined();
  await page.getByRole('button', { name: 'تغيير الحالة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تغيير الحالة' }).click();
  // الانسحاب والإيقاف بسبب مكتوب (تصور ملف المشارك 2026-11-13): يُسأل عنه بعد التأكيد، ويصل الخادم مع الحالة
  const why = page.getByRole('dialog').filter({ hasText: 'سبب الإيقاف أو الانسحاب' });
  await expect(why).toBeVisible();
  await why.getByRole('textbox').fill('طلب الجهة الراعية');
  await why.getByRole('button').filter({ hasNotText: 'إلغاء' }).last().click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.status')).toMatchObject({ participant_id: 'p1', status: 'withdrawn', reason: 'طلب الجهة الراعية' });
});

test('admin-core-9: ربط الاسم المكتوب لا يختار جهة من تلقائه، ويؤكد باسم الجهة وعدد المنقولين', async ({ page }) => {
  const calls = await setup(page, '#/leaders/orgs');
  const pick = page.getByLabel('جهة شركة البناء');
  await expect(pick).toHaveValue('');
  await expect(page.getByRole('button', { name: 'ربط', exact: true })).toBeDisabled();
  await pick.selectOption('o2');
  await page.getByRole('button', { name: 'ربط', exact: true }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('ربط 1 مشارك كتبوا «شركة البناء» بجهة «هيئة المثال»');
  await dlg.getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.assign-org')).toMatchObject({ typed_name: 'شركة البناء', organization_id: 'o2' });
});

test('admin-core-10: الدور المرفوض لا يبقى ظاهرًا، والترقية والتعطيل بتأكيد', async ({ page }) => {
  const calls = await setup(page, '', {
    user: { role_id: 'super_admin', is_owner: true },
    admin: {
      'list-users': { success: true, users: [{ id: 'u2', name: 'مدير', email: 'm@example.com', role_id: 'admin', is_active: true }] },
      'update-user': { success: false, message: 'منح دور المدير العام يتطلب مفتاح مرور' },
    },
  });
  await page.getByRole('button', { name: 'الإعدادات' }).click();
  const role = page.getByLabel('دور مدير');
  await role.selectOption('super_admin');
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('مدير عام');
  await dlg.getByRole('button', { name: 'إلغاء' }).click();
  await expect(role).toHaveValue('admin');
  expect(calls.find((c) => c.action === 'update-user')).toBeUndefined();
  await role.selectOption('super_admin');
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByText('❌ منح دور المدير العام يتطلب مفتاح مرور')).toBeVisible();
  await expect(role).toHaveValue('admin');
  // التعطيل
  await page.getByRole('switch', { name: 'تفعيل مدير' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('تعطيل حساب مدير');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  expect(calls.filter((c) => c.action === 'update-user' && c.field === 'is_active')).toHaveLength(0);
});

test('admin-core-12: ملف المشارك يطلب حقوقه وطلبات خبرائه وحده، والقائمة تطلب طلبات الحذف مرة واحدة', async ({ page }) => {
  const calls = await setup(page, '#/leaders/participants');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
  await page.waitForTimeout(300);
  expect(calls.filter((c) => c.action === 'admin.erasures')).toHaveLength(1);
  await page.getByText('سارة الأحمد').first().click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  await expect.poll(() => calls.find((c) => c.action === 'admin.payments')).toMatchObject({ participant_id: 'p1' });
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-requests')).toMatchObject({ participant_id: 'p1' });
});
