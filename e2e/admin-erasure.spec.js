// طلب حذف البيانات في الإدارة (تصور 2026-11-16): الشريط يقول ماذا تفعل، والبطاقة أعلى الملف، والورقة بإجراءاتها الثلاثة،
// والقرار للمدير الأعلى وحده. الخلفية مُحاكاة بالكامل.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const people = [{ id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: null, status: 'enrolled', placements: [], created_at: '2026-10-01' }];
const person = {
  success: true, participant: { ...people[0], phone: '0500', last_login_at: '2026-10-20' }, progress: 20, history: [],
  profile: { approved: true, dimensions: [] }, assessments: [], journey: [], points: { total: 0, rank: { title: 'مستكشف' } }, book: [], models: [],
};
const request = { id: 'r1', status: 'pending', created_at: '2026-11-10T09:00:00Z', due_at: '2026-12-10T09:00:00Z', reason: 'انتهى البرنامج', days_left: 24, urgency: 'ok', status_ar: 'ينتظر قرارك', reminder_stage: 0 };
const erasureGet = (can) => ({
  success: true, ready: true, can_decide: can, last: null, request,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com' },
  counts: { assessments: 2, submissions: 1, capstones: 0, certificates: 1, payments: 1, requirements: 3, sessions: 4 }, blockers: [],
  timeline: [{ at: '2026-11-10T09:00:00Z', text: 'استُلم الطلب من المشارك' }, { at: '2026-11-10T09:01:00Z', text: 'أُبلغت بالطلب' }],
});

async function setup(page, hash, { role = 'super_admin', can = true, erasures = { success: true, ready: true, items: [{ ...request, participant_id: 'p1', name: 'سارة الأحمد', email: 's@x.com' }] }, extra = {} } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    await route.fulfill({ json: { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'passkey' }, 'sessions-list': { success: true, sessions: [] } }[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: people },
      'admin.participant': person, 'admin.programs': { success: true, cohorts: [] },
      'admin.payments': { success: true, entitlements: [] }, 'admin.expert-requests': { success: true, requests: [] },
      'admin.erasures': erasures, 'admin.erasure-get': erasureGet(can),
      'admin.participant-impact': { success: true, participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com' }, counts: {}, blockers: [] },
      ...extra,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x.com', role_id: r }, ts: Date.now() }));
    localStorage.clear();
  }, role);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}

test('الشريط يقول ماذا تفعل، و«افتح الطلب» يفتح الملف والورقة فوقه، والرفض بسبب يرسل السبب والنص', async ({ page }) => {
  const calls = await setup(page, '#/leaders/participants', { extra: { 'admin.erasure-decline': { success: true, mailed: true } } });
  // منطقة معنونة لا alert: لا تقاطع قارئ الشاشة مع كل تحميل للقائمة
  const banner = page.getByRole('region', { name: 'طلبات حذف البيانات' });
  await expect(page.getByRole('alert', { name: 'طلبات حذف البيانات' })).toHaveCount(0);
  await expect(banner).toContainText('طلب حذف بيانات ينتظر قرارك: سارة الأحمد، بقي 24 يومًا. افتح الطلب لتنفّذه أو ترفضه بسبب.');
  await banner.getByRole('button', { name: 'افتح الطلب' }).click();
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات: سارة الأحمد/ });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('بقي 24 يومًا');
  await expect(sheet).toContainText('انتهى البرنامج');

  await sheet.getByRole('button', { name: /ارفض مع السبب/ }).click();
  await expect(sheet).toContainText('الأصل تنفيذ الطلب مع الاحتفاظ بما يوجبه النظام');
  const send = sheet.getByRole('button', { name: 'ارفض وأبلغه' });
  await expect(send).toBeDisabled();
  await sheet.getByRole('radio', { name: /سبب آخر/ }).check();
  await expect(send).toBeDisabled();   // «سبب آخر» يلزمه نص
  await sheet.getByLabel(/توضيح يصل المشارك/).fill('البيانات مطلوبة لتدقيق مالي قائم');
  await send.click();
  await expect(sheet).toBeHidden();
  expect(calls.find((c) => c.action === 'admin.erasure-decline')).toMatchObject({ request_id: 'r1', ground: 'other', note: 'البيانات مطلوبة لتدقيق مالي قائم' });
});

test('البطاقة أعلى الملف في كل تبويب، والتنفيذ يعرض ما يُحذف وما يبقى ولا يُفعَّل إلا بكتابة الاسم', async ({ page }) => {
  const calls = await setup(page, '#/leaders/participants/p1', { extra: { 'admin.erasure-execute': { success: true, mailed: true, files: 2, request: 'r1' } } });
  const card = page.getByRole('region', { name: 'طلب حذف بيانات' });
  await expect(card).toContainText('بقي 24 يومًا');
  await expect(card).toContainText('انتهى البرنامج');
  await page.getByRole('tab', { name: /^السجل/ }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'افتح الطلب واتخذ القرار' }).click();
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await sheet.getByRole('button', { name: /نفّذ الحذف/ }).click();
  await expect(sheet).toContainText('الشهادة ورقم تحققها');
  await expect(sheet).toContainText('10 سنوات');
  await expect(sheet).toContainText('الشهرية سنة');
  const go = sheet.getByRole('button', { name: 'نفّذ الحذف نهائيًا' });
  await expect(go).toBeDisabled();
  await sheet.getByLabel('اكتب اسم المشارك للتأكيد').fill('سارة');
  await expect(go).toBeDisabled();
  await sheet.getByLabel('اكتب اسم المشارك للتأكيد').fill('ساره  الاحمد');
  await go.click();
  await expect(page.getByText('نُفّذ الطلب وأُبلغ المشارك')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.erasure-execute')).toMatchObject({ request_id: 'r1', confirm_name: 'ساره  الاحمد' });
});

test('رابط بريد المالك يفتح الورقة، والسحب بطلب المشارك يلزمه كيف أبلغ وما قاله', async ({ page }) => {
  const calls = await setup(page, '#/leaders/participants/p1?erasure=open', { extra: { 'admin.erasure-withdrawn': { success: true, mailed: true } } });
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /تواصلت معه وسحب الطلب/ }).click();
  const send = sheet.getByRole('button', { name: 'أغلق الطلب وأبلغه' });
  await expect(send).toBeDisabled();
  await sheet.getByRole('radio', { name: 'باتصال' }).check();
  await sheet.getByLabel(/ما قاله باختصار/).fill('اتصل وقال إنه سيكمل البرنامج');
  await send.click();
  await expect(sheet).toBeHidden();
  expect(calls.find((c) => c.action === 'admin.erasure-withdrawn')).toMatchObject({ request_id: 'r1', via: 'phone' });
});

test('غير المدير الأعلى يقرأ الورقة كاملة والأزرار معطلة بسطر «القرار للمدير الأعلى» وزر مراسلة، ومنطقة الخطر تحيل إلى البطاقة', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1', { role: 'admin', can: false });
  const card = page.getByRole('region', { name: 'طلب حذف بيانات' });
  await expect(card).toContainText('ينتظر قرار المدير الأعلى');
  await expect(card).not.toContainText('ينتظر قرارك');
  await page.getByRole('tab', { name: /^الملف/ }).click();
  await expect(page.getByText('لهذا المشارك طلب حذف قائم. نفّذه من بطاقة الطلب أعلى الملف')).toBeVisible();
  await expect(page.getByRole('button', { name: 'حذف المشارك…' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'افتح الطلب واتخذ القرار' })).toHaveCount(0);
  await card.getByRole('button', { name: 'افتح الطلب', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await expect(sheet).toContainText('القرار للمدير الأعلى');
  await expect(sheet.getByRole('link', { name: 'راسل المشارك' })).toHaveAttribute('href', 'mailto:s@x.com');
  for (const n of [/نفّذ الحذف/, /ارفض مع السبب/, /تواصلت معه وسحب الطلب/]) await expect(sheet.getByRole('button', { name: n })).toBeDisabled();
});

test('سجل الطلبات غير مفعّل: سطر للمدير الأعلى وحده', async ({ page }) => {
  await setup(page, '#/leaders/participants', { erasures: { success: true, ready: false, items: [] } });
  await expect(page.getByText('سجل طلبات الحذف غير مفعّل')).toBeVisible();
});

test('غير المدير الأعلى: الشريط يقول لمن القرار، لا «افتح الطلب لتنفّذه»', async ({ page }) => {
  await setup(page, '#/leaders/participants', { role: 'admin', can: false });
  const banner = page.getByRole('region', { name: 'طلبات حذف البيانات' });
  await expect(banner).toContainText('طلب حذف بيانات ينتظر قرار المدير الأعلى: سارة الأحمد، بقي 24 يومًا. لك أن تقرأه وتراسل صاحبه.');
  await expect(banner).not.toContainText('لتنفّذه');
});

test('طلب تجاوز المهلة: الشريط والبطاقة بلون التأخر و«متأخر»، وطلبان مرتبان بالأقرب', async ({ page }) => {
  const late = { ...request, days_left: -2, urgency: 'late' };
  const items = [
    { ...request, id: 'r2', participant_id: 'p2', name: 'خالد', email: 'k@x.com', days_left: 12 },
    { ...late, participant_id: 'p1', name: 'سارة الأحمد', email: 's@x.com' },
  ];
  await setup(page, '#/leaders/participants', { erasures: { success: true, ready: true, items } });
  const banner = page.getByRole('region', { name: 'طلبات حذف البيانات' });
  await expect(banner).toHaveClass(/late/);
  await expect(banner).toContainText('طلبا حذف بيانات ينتظران قرارك، منها 1 تجاوز المهلة.');
  await expect(banner.getByRole('listitem').first()).toContainText('سارة الأحمد');
  await expect(banner.getByRole('listitem').first()).toContainText('تجاوز المهلة بيومين');
  await expect(banner.getByRole('listitem').nth(1)).toContainText('خالد');
});

test('البطاقة لطلب متأخر تقول «متأخر»', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1', { extra: { 'admin.erasure-get': { ...erasureGet(true), request: { ...request, days_left: -3, urgency: 'late' } } } });
  const card = page.getByRole('region', { name: 'طلب حذف بيانات' });
  await expect(card).toHaveClass(/late/);
  await expect(card).toContainText('متأخر');
  await expect(card).toContainText('تجاوز المهلة بـ3 أيام');
});

test('تعذّر بريد القرار: يقول للمدير إن القرار حُفظ ويعطيه العنوان ليرسل بنفسه', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1?erasure=open', { extra: { 'admin.erasure-decline': { success: true, mailed: false, email: 's@x.com' } } });
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await sheet.getByRole('button', { name: /ارفض مع السبب/ }).click();
  await sheet.getByRole('radio', { name: /طلب مكرر/ }).check();
  await sheet.getByRole('button', { name: 'ارفض وأبلغه' }).click();
  await expect(page.getByText('حُفظ القرار، ولم تصله الرسالة. أرسلها بنفسك إلى s@x.com.')).toBeVisible();
});

test('حساب العرض أو دفعة معلّقة: «نفّذ الحذف» معطل والمانع ظاهر، والرفض متاح', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1?erasure=open', { extra: { 'admin.erasure-get': { ...erasureGet(true), blockers: ['له صفحة دفع لم تكتمل بعد. تنتهي من تلقاء نفسها خلال 3 أيام، فنفّذ بعدها'] } } });
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await expect(sheet.getByRole('alert')).toContainText('صفحة دفع لم تكتمل');
  await expect(sheet.getByRole('button', { name: /نفّذ الحذف/ })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: /ارفض مع السبب/ })).toBeEnabled();
});

test('الحد الأدنى للنص ظاهر بعدّاد، وما كُتب لا يضيع بنقرة خارج الورقة أو Esc دون سؤال', async ({ page }) => {
  await setup(page, '#/leaders/participants/p1?erasure=open');
  const sheet = page.getByRole('dialog', { name: /طلب حذف بيانات/ });
  await sheet.getByRole('button', { name: /تواصلت معه وسحب الطلب/ }).click();
  await sheet.getByRole('radio', { name: 'باتصال' }).check();
  await expect(sheet.getByText(/5 أحرف على الأقل/).first()).toBeVisible();
  await sheet.getByLabel(/ما قاله باختصار/).fill('وافق');
  await expect(sheet).toContainText('كتبت 4 من 5 أحرف على الأقل.');
  await expect(sheet.getByRole('button', { name: 'أغلق الطلب وأبلغه' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByText('لديك تعديلات لم تُحفظ. إغلاق دون حفظ؟')).toBeVisible();
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel(/ما قاله باختصار/)).toHaveValue('وافق');
});
