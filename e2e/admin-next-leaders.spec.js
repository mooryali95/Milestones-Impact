// لوحة الإدارة الجديدة: تطبيق القادة (المشاركون والجهات). الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const pl = (m, i, l, ok = true) => [['milestone', m], ['impact', i], ['leadership', l]].map(([dimension, level]) => ({ dimension, level, approved_at: ok ? '2026-10-01' : null }));
const people = [
  { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', job_title: 'مديرة', organization_id: 'o1', status: 'pending_approval', placements: pl('beginner', 'beginner', 'intermediate', false), created_at: '2026-10-01' },
  { id: 'p2', full_name: 'Omar Ali', email: 'o@x.com', job_title: 'مهندس', organization_id: null, organization_name: 'شركة', status: 'enrolled', placements: pl('advanced', 'advanced', 'advanced'), created_at: '2026-10-02' },
];
const orgs = [{ id: 'o1', name: 'وزارة التجربة', short_name: 'وت', color: '#12414E', invite_code: 'wt01', seats: 10, status: 'active', domains: ['wt.gov.sa'], stats: { total: 1, registered: 1, profiled: 1, assessed: 1, approved: 0, completed: 0, pending_approval: 1, active_week: 1 } }];
const person = {
  success: true, participant: { ...people[0], phone: '0500', last_login_at: '2026-10-20' }, progress: 20, history: [],
  profile: { approved: false, dimensions: [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'beginner' }, { dimension: 'leadership', level: 'intermediate' }] },
  assessments: [{ status: 'submitted', assessment_results: [{ dimension: 'milestone', knowledge_pct: 50, evaluation: { level: 'beginner', composite: 48 } }] }],
  journey: [{ key: 's1', title_ar: 'التهيئة', status: 'active', items: [{ id: 'r1', title_ar: 'خطة التطوير', status: 'submitted', evidence_path: 'e/1.pdf' }] }],
  points: { total: 30, rank: { title: 'مستكشف' } }, book: [], models: [],
};

async function setup(page, overrides = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs, unassigned: { total: 1, typed: [{ name: 'شركة', n: 1 }] } },
      'admin.participants': { success: true, participants: b.status ? people.filter((p) => p.status === b.status) : people },
      'admin.participant': person,
      'admin.org': { success: true, org: orgs[0], participants: [{ ...people[0], track: 'M1I1L2', track_title: 'مسار البداية' }], funnel: { ...orgs[0].stats, withdrawn: 0 }, by_track: { M1I1L2: 1 }, by_via: { link: 1 }, by_campaign: {}, by_site: {} },
      'admin.approve': { success: true }, 'admin.review': { success: true }, 'admin.assign-org': { success: true, moved: 1 },
      'admin.save': { success: true, row: { id: 'o1' } }, 'admin.create-participant': { success: true },
      'admin.coordinator': { success: true, coordinator: null },
      ...overrides,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() }));
    localStorage.removeItem('mi_admin_list_filters');
  });
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.goto(`${BASE}#/leaders/participants`);   // الدخول يفتح النظرة العامة، وهذا الاختبار لقائمة المشاركين
  return calls;
}

test('قائمة المشاركين: شريط الفلترة الموحّد، والعروض السريعة، والفلاتر في عنوان الصفحة', async ({ page }) => {
  await setup(page);
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('وت', { exact: true })).toBeVisible();
  await page.getByLabel('بحث', { exact: true }).fill('omar');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('بحث', { exact: true }).fill('');
  await page.getByRole('combobox', { name: 'المسارات' }).selectOption('M1I1L2');
  await expect(rows).toHaveCount(1);
  await page.getByRole('combobox', { name: 'المسارات' }).selectOption('');
  // عرض سريع بعدّاده: واحدة بانتظار الاعتماد
  const approval = page.getByRole('button', { name: /بانتظار الاعتماد/ });
  await expect(approval).toContainText('1');
  await approval.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('سارة الأحمد');
  await approval.click();
  await page.getByRole('combobox', { name: 'الحالات' }).selectOption('enrolled');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('الحالات: في البرنامج')).toBeVisible();
  expect(page.url()).toContain('status=enrolled');
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click().catch(() => {});
  await expect(page.getByRole('combobox', { name: 'الحالات' })).toHaveValue('enrolled');
  await page.getByRole('button', { name: 'مسح الكل' }).click();
  await expect(page.getByRole('combobox', { name: 'الحالات' })).toHaveValue('');
  await expect(rows).toHaveCount(2);
});

test('النقل الجماعي إلى جهة بتأكيد', async ({ page }) => {
  const calls = await setup(page);
  await page.getByLabel('تحديد Omar Ali').check();
  await page.getByLabel('نقل إلى جهة').selectOption('o1');
  await page.getByRole('button', { name: 'نقل', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.assign-org')).toMatchObject({ participant_ids: ['p2'], organization_id: 'o1' });
});

// ملف المشارك بتبويبات (P2، 2026-11-16): كل قسم في تبويبه، والإجراءات الأقل تكرارًا في «⋯»
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const more = async (page, item) => { await page.getByRole('button', { name: 'إجراءات أخرى' }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('ملف المشارك: اعتماد المستويات، وإعادة بند بملاحظة', async ({ page }) => {
  const calls = await setup(page);
  await page.getByText('سارة الأحمد').click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
  // بطاقة المستوى: صف ملخص لكل بُعد، والقرار في تفاصيله المطوية
  await page.getByRole('button', { name: /^تمكين القائد/ }).click();
  await expect(page.getByLabel('مستوى تمكين القائد')).toHaveValue('intermediate');
  await page.getByRole('button', { name: /^تحويل المشروع إلى أثر/ }).click();
  await page.getByLabel('مستوى تحويل المشروع إلى أثر').selectOption('advanced');
  // مخالفة المستوى القائم تلزمها علة مكتوبة: رقاقة تنبيه، وسبب ظاهر تحت الزر، ولا إرسال بدونها
  await expect(page.getByText(/يلزم تعليل/)).toBeVisible();
  await expect(page.locator('#lc-block')).toHaveText('اكتب سبب مخالفة المستوى المحسوب في تحويل المشروع إلى أثر (10 أحرف على الأقل)');
  // الزر معطّل بـaria-disabled فيبقى قابلًا للتركيز والنقر، والنقر يفتح الحقل الناقص ولا يرسل
  await page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' }).click({ force: true });
  await expect(page.getByLabel('ملاحظة تحويل المشروع إلى أثر')).toBeFocused();
  expect(calls.find((c) => c.action === 'admin.approve')).toBeUndefined();
  await page.getByLabel('ملاحظة تحويل المشروع إلى أثر').fill('تقاريره الميدانية ومختبره يفوقان المحسوب بوضوح');
  await expect(page.locator('#lc-block')).toHaveCount(0);
  await page.getByRole('button', { name: 'اعتماد المسار وفتح البرنامج' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.approve')?.levels).toEqual({ milestone: 'beginner', impact: 'advanced', leadership: 'intermediate' });
  expect(calls.find((c) => c.action === 'admin.approve').notes).toMatchObject({ impact: 'تقاريره الميدانية ومختبره يفوقان المحسوب بوضوح' });

  await tab(page, 'الرحلة').click();
  // البند اليدوي: «اعتماد» و«إرجاع» ظاهران في سطره (تبويب «الرحلة» بخط واحد، 2026-11-23)
  await page.getByRole('button', { name: 'إرجاع' }).click();
  await page.getByRole('dialog').locator('input').fill('أضف المؤشرات');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.review')).toMatchObject({ status: 'returned', note: 'أضف المؤشرات', requirement_id: 'r1' });
  await page.getByRole('button', { name: /^→ (كل المشاركين|القائمة)$/ }).click();
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2);
});

// admin-core-1: كان فعل المرحلة يُرسل في حقل action فيحل محل اسم الإجراء، فيرد الخادم «إجراء غير معروف» ولا يصل التدخل
test('ملف المشارك: التدخل في مرحلة يصل إلى الخادم بفعله وسببه، وإلغاؤه بفعل فارغ', async ({ page }) => {
  const journey = [
    { key: 's1', title_ar: 'التهيئة', status: 'active', items: [] },
    { key: 's2', title_ar: 'التدريب', status: 'locked', override: 'skip', items: [] },
  ];
  const calls = await setup(page, { 'admin.participant': { ...person, journey }, 'admin.stage-override': { success: true } });
  await page.getByText('سارة الأحمد').click();
  await tab(page, 'الرحلة').click();
  // «أكمل هذه المرحلة» زر واحد في سطر المرحلة الحالية (لا تكرار في الرأس، تدقيق 2026-11-23): السؤال يسمي ما ينقصها، والسبب مطلوب
  await expect(page.getByRole('button', { name: 'أكمل هذه المرحلة' })).toHaveCount(1);
  await expect(page.locator('.pj-stage[data-stage="s1"]').getByRole('button', { name: 'أكمل هذه المرحلة' })).toBeVisible();
  await page.getByRole('button', { name: 'أكمل هذه المرحلة' }).click();
  await page.getByRole('dialog').locator('input').fill('أنجزها في ورشة حضورية موثقة');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByRole('status')).toHaveText('تم');
  const sent = calls.filter((c) => c.action === 'admin.stage-override');
  // idem: مفتاح منع التكرار لكتابات leaders-api (ش9)، لا يمس الإجراء ولا حقوله
  const { idem, ...first } = sent[0];
  expect(first).toEqual({ action: 'admin.stage-override', token: 't', participant_id: 'p1', stage_key: 's1', stage_action: 'complete', note: 'أنجزها في ورشة حضورية موثقة' });
  expect(idem).toMatch(/^[A-Za-z0-9_-]{16,64}$/);

  // إلغاء التدخل من قائمة المرحلة «⋯»
  await page.getByRole('button', { name: 'إجراءات مرحلة «التدريب»' }).click();
  await page.getByRole('menuitem', { name: 'إلغاء التدخل' }).click();
  await page.getByRole('dialog').locator('input').fill('أُعفي خطأً');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.stage-override').length).toBe(2);
  expect(calls.filter((c) => c.action === 'admin.stage-override')[1]).toMatchObject({ stage_key: 's2', stage_action: '' });
  expect(calls.some((c) => ['complete', 'open', 'skip', ''].includes(c.action))).toBe(false);
});

test('الجهات: البطاقات ولوحة الجهة ورابط الحملة والتحرير', async ({ page }) => {
  const calls = await setup(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.la-tabs').getByRole('button', { name: 'الجهات' }).click();
  await expect(page.locator('.la-org b', { hasText: 'وزارة التجربة' })).toBeVisible();
  await expect(page.getByText('1 بانتظار اعتمادك')).toBeVisible();
  await page.getByRole('button', { name: 'لوحة الجهة' }).click();
  await expect(page.getByText('https://leaders.sunkvalue.com/j/wt01')).toBeVisible();
  await page.getByLabel('اسم الحملة').fill('واتساب');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toContainText('اسم الحملة');
  await page.getByLabel('اسم الحملة').fill('whatsapp');
  await page.getByRole('button', { name: 'نسخ رابط الحملة' }).click();
  await expect(page.getByRole('status')).toHaveText('نُسخ رابط الحملة');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://leaders.sunkvalue.com/j/wt01/whatsapp');

  await page.getByRole('button', { name: 'تحرير', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: /وزارة التجربة/ });
  await expect(form.getByText('wt.gov.sa')).toBeVisible();
  await expect(form.getByRole('button', { name: 'حفظ التعديلات' })).toBeDisabled();
  await form.getByRole('button', { name: 'زيادة' }).click();
  await form.getByLabel('أضف موقعًا').fill('portal.wt.gov.sa');
  await form.getByLabel('أضف موقعًا').press('Enter');
  await form.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({ id: 'o1', seats: 11, domains: 'wt.gov.sa,portal.wt.gov.sa' });
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  await expect(page.getByRole('heading', { name: 'سارة الأحمد' })).toBeVisible();
});

test('المراقب يرى دون أدوات التعديل', async ({ page }) => {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: true, participants: people, orgs, unassigned: {} } }));
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مراقب', email: 'v@x', role_id: 'viewer' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.goto(`${BASE}#/leaders/participants`);   // الدخول يفتح النظرة العامة، وهذا الاختبار لقائمة المشاركين
  await expect(page.getByText('عرض فقط')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ مشارك' })).toHaveCount(0);
  await expect(page.getByLabel('تحديد الكل')).toHaveCount(0);
});

test('قائمة المشاركين: «أين توقف» للمتعثر قبل الاعتماد، وعرضه السريع بعدّاده', async ({ page }) => {
  const doing = { step: 'assessment_doing', label: 'القياس جارٍ', answered: 42, total: 63, missing: [], remaining: 'أجاب 42 من 63، وبقي 21' };
  const stuck = { id: 'p3', full_name: 'هند السالم', email: 'h@x.com', organization_id: 'o1', organization_name: 'وزارة التجربة', status: 'profiled', placements: [], created_at: '2026-11-11', onboarding: doing };
  await setup(page, {
    'admin.participants': { success: true, participants: [...people.map((p) => ({ ...p, onboarding: { step: 'done', label: 'معتمد', remaining: '' } })), stuck] },
    'admin.participant': { ...person, participant: { ...stuck, last_login_at: '2026-11-12' }, assessments: [], onboarding: { ...doing, started_at: '2026-11-11', last_answer_at: '2026-11-12' } },
  });
  const rows = page.locator('.data-table tbody tr');
  await expect(rows).toHaveCount(3);
  const row = rows.filter({ hasText: 'هند السالم' });
  await expect(row).toContainText('القياس جارٍ');
  await expect(row).toContainText('أجاب 42 من 63، وبقي 21');
  await expect(row.getByRole('progressbar', { name: 'أجاب 42 من 63' })).toBeVisible();
  // من اعتُمد لا يحمل شارة توقف
  await expect(rows.filter({ hasText: 'Omar Ali' })).not.toContainText('معتمد');
  const chip = page.getByRole('button', { name: /لم يكمل التسجيل/ });
  await expect(chip).toContainText('1');
  await chip.click();
  await expect(rows).toHaveCount(1);
  await row.click();
  await expect(page.locator('.la-where')).toContainText('أين توقف: القياس جارٍ. أجاب 42 من 63، وبقي 21.');
});

// التذكير الموحد (P3، 2026-11-16): للمحددين في أي مرحلة، بمعاينة مجمّعة بالمرحلة من الخادم قبل الإرسال
test('قائمة المشاركين: تذكير المحددين بمعاينة مجمّعة بالمرحلة، ومن يُتخطى ولماذا، والرد يقول كم أُرسل', async ({ page }) => {
  const sample = 'أنت في مرحلة «التدريب»، وقطعت 40% من رحلتك. خطوتك التالية: خطة المبادرة.';
  const calls = await setup(page, {
    'admin.nudge-preview': { success: true, count: 1, groups: [{ key: 'stage:training', stage: 'التدريب', step: '', sample, people: [{ id: 'p1', name: 'سارة الأحمد', step: 'خطة المبادرة', days: 9, last: null }] }],
      skipped: [{ id: 'p2', name: 'Omar Ali', why: 'recent', reason: 'ذُكِّر قريبًا', last: { by: 'المرشد', days: 2 } }] },
    'admin.nudge': { success: true, sent: 1, skipped: { recent: 1 }, gap_days: 3 },
  });
  await page.getByRole('checkbox', { name: 'تحديد الكل' }).check();
  await page.getByRole('button', { name: 'ذكّر المحددين (2)' }).click();
  const dlg = page.getByRole('dialog', { name: 'تذكير المحددين' });
  await expect(dlg.getByRole('region', { name: 'مرحلة التدريب' })).toContainText(sample);
  await expect(dlg.getByRole('region', { name: 'مرحلة التدريب' })).toContainText('متوقف منذ 9 أيام');
  await expect(dlg.getByText('ذكّره المرشد قبل يومين')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.nudge')).toBeUndefined();
  await dlg.getByRole('button', { name: 'أرسل 1 تذكير' }).click();
  await expect(dlg.getByRole('status')).toContainText('أُرسل 1');
  await expect(dlg.getByRole('status')).toContainText('تُخطّي: 1 ذُكِّر قريبًا');
  expect(calls.find((c) => c.action === 'admin.nudge').participant_ids.sort()).toEqual(calls.find((c) => c.action === 'admin.nudge-preview').participant_ids.sort());
});

test('قائمة المشاركين: وسم «مستعجل» وعرضه السريع، وطلب إعادة القياس للمحددين ممن يصح منهم', async ({ page }) => {
  const done = { step: 'approval', label: 'بانتظار الاعتماد', remaining: 'اعتماد المستوى من الإدارة' };
  const rushed = { id: 'p3', full_name: 'هند السالم', email: 'h@x.com', organization_id: 'o1', organization_name: 'وزارة التجربة', status: 'pending_approval', placements: [], created_at: '2026-11-11',
    onboarding: done, effort: { level: 'low', note: '46 من 60 إجابة أسرع من زمن القراءة.' }, retake: null, can_retake: true };
  const asked = { id: 'p4', full_name: 'ماجد الحربي', email: 'm@x.com', organization_id: 'o1', organization_name: 'وزارة التجربة', status: 'profiled', placements: [], created_at: '2026-11-11',
    onboarding: { step: 'assessment_todo', label: 'لم يبدأ القياس', remaining: 'لم يفتح القياس' }, effort: null, retake: { requested_at: '2026-11-13T10:00:00Z', reason: 'effort' }, can_retake: false };
  const calls = await setup(page, {
    'admin.participants': { success: true, participants: [...people.map((p) => ({ ...p, onboarding: { step: 'done' }, effort: { level: 'ok' }, retake: null, can_retake: false })), rushed, asked] },
    'admin.reset-assessment': { success: true, done: 1, skipped: 0 },
  });
  const rows = page.locator('.data-table tbody tr');
  await expect(rows.filter({ hasText: 'هند السالم' }).locator('.la-chip.bad')).toHaveText('مستعجل');
  await expect(rows.filter({ hasText: 'ماجد الحربي' })).toContainText('طُلبت الإعادة');
  // من جهده طبيعي بلا وسم
  await expect(rows.filter({ hasText: 'Omar Ali' })).not.toContainText('مستعجل');
  await expect(page.getByRole('button', { name: /طُلبت منهم الإعادة/ })).toContainText('1');
  const chip = page.getByRole('button', { name: /أجابوا باستعجال/ });
  await expect(chip).toContainText('1');
  await chip.click();
  await expect(rows).toHaveCount(1);
  await chip.click();
  // الكل محدد، والزر يعدّ من يصح الطلب منهم وحدهم ويرسلهم وحدهم
  await page.getByRole('checkbox', { name: 'تحديد الكل' }).check();
  await page.getByRole('button', { name: 'اطلب إعادة القياس (1)' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('طلب إعادة القياس من 1 مشارك؟');
  await page.getByRole('alertdialog').getByRole('button', { name: /^(تأكيد|نعم|متابعة|موافق)/ }).click();
  await expect(page.getByText('طُلبت الإعادة من 1')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.reset-assessment').participant_ids).toEqual(['p3']);
});

test('ملف المشارك الكامل: ملخص الأعلام، وإضافة ملاحظة مرئية بتأكيد، والخط الزمني بالعربية', async ({ page }) => {
  const obs = { id: 'ob1', kind: 'warning', source: 'system', title: 'غياب عن جلسة توجيه', body: 'سُجّل غيابك عن جلسة الأحد.', visible: true, created_at: '2026-11-12T10:00:00Z', acknowledged_at: null };
  const calls = await setup(page, {
    'admin.participant': { ...person,
      flags: [{ key: 'effort', tone: 'bad', label: 'أجاب القياس باستعجال', detail: '46 من 60' }, { key: 'no_show', tone: 'warn', label: 'غاب عن جلسة توجيه', detail: '' }],
      observations: [obs],
      sessions: [{ id: 's1', status: 'no_show', starts_at: '2026-11-10T09:00:00Z', expert: 'د. سلمان' }],
      capstone: { status: 'returned', readiness: 40, revisions: 2, review_note: 'أكمل سجل المخاطر' }, feedback360: [], attendance: [],
      timeline: [] },
    'admin.observation-add': { success: true, observation: { id: 'ob2' } },
    // المبادرة حية من admin.capstone، والسجل الكامل صفحة من admin.participant-timeline
    'admin.capstone': { success: true, doc: { meta: { initiative: 'رقمنة الطلبات' } }, capstone: { id: 'c1', status: 'returned', revisions: 2, review_note: 'أكمل سجل المخاطر' }, readiness: 40,
      sections: [{ id: 'm1', key: 'initiative-charter', title: 'بطاقة المبادرة', complete: true, missing: 0, status: 'reviewed', updated_at: '2026-11-05T10:00:00Z' }] },
    'admin.participant-timeline': { success: true, next: null, rows: [{ at: '2026-11-12T10:00:00Z', type: 'note', tone: 'warn', text: 'تنبيه: غياب عن جلسة توجيه', by: 'النظام', detail: 'سُجّل غيابك عن جلسة الأحد.' },
      { at: '2026-11-10T08:00:00Z', type: 'assessment', tone: 'ok', text: 'سلّم القياس', by: '', detail: '' }] },
  });
  await page.locator('.data-table tbody tr').filter({ hasText: 'سارة الأحمد' }).click();
  const flags = page.getByRole('list', { name: 'ملخص الأعلام' });
  await expect(flags.locator('.la-chip.bad')).toHaveText('أجاب القياس باستعجال');
  await expect(flags).toContainText('غاب عن جلسة توجيه');
  await tab(page, 'المبادرة').click();
  // ما كان غائبًا: الجلسات بحالتها من المصدر الواحد، والمبادرة بعدد إعاداتها
  await expect(page.getByText('لم يحضر')).toBeVisible();
  await expect(page.getByText('أُعيدت 2 مرة')).toBeVisible();
  // ملاحظة النظام بلا حذف، وحالتها عند المشارك ظاهرة. التبويب يحمل عدد الملاحظات
  await expect(tab(page, 'السجل')).toContainText('1');
  await tab(page, 'السجل').click();
  const list = page.locator('.pf-obs-list');
  await expect(list).toContainText('مرئية للمشارك، ولم يطّلع عليها بعد');
  await expect(list.getByRole('button', { name: 'حذف' })).toHaveCount(0);
  // إضافة ملاحظة مرئية: تأكيد يذكر البطاقة والبريد
  await page.getByLabel('النوع').selectOption('commendation');
  await page.getByLabel('نص الملاحظة').fill('قدّم عرضًا واضحًا في جلسة القاعة.');
  await page.getByLabel(/يراها المشارك/).check();
  await page.getByRole('button', { name: 'أضف إلى الملف' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('مرئية للمشارك');
  await page.getByRole('alertdialog').getByRole('button', { name: /^(تأكيد|نعم|متابعة|موافق)/ }).click();
  await expect(page.getByText('حُفظت وأُبلغ المشارك')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.observation-add')).toMatchObject({ participant_id: 'p1', kind: 'commendation', visible: true });
  // الخط الزمني بالعربية لا برموز السجل
  const time = page.locator('.pf-time');
  await expect(time.locator('li').first()).toContainText('تنبيه: غياب عن جلسة توجيه');
  await expect(time).not.toContainText('assessment.submit');
});

test('عاين بعين الخبير: ما يُرى وما حُجب عن المستشار ثم عن الخبير المسند، من حمولة الخادم', async ({ page }) => {
  const sees = (contact) => [{ label: 'وسائل التواصل', visible: contact, value: contact ? 's@x.com' : null }, { label: 'المستويات ونتيجة القياس', visible: true, value: null }, { label: 'ملاحظات الملف', visible: false, value: null }];
  const calls = await setup(page, {});
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.preview-as') return route.fallback();
    calls.push(b);
    await route.fulfill({ json: { success: true, as: b.as, name: 'سارة الأحمد', sees: sees(b.as === 'advisor'), can: { answers: b.as === 'advisor', observe: false, final_edit: false, hall: false } } });
  });
  await page.locator('.data-table tbody tr').filter({ hasText: 'سارة الأحمد' }).click();
  await more(page, 'عاين بعين الخبير');
  const dlg = page.getByRole('dialog', { name: 'معاينة بعين الخبير' });
  await expect(dlg.locator('.cv-sees li.ok')).toHaveCount(2);
  await expect(dlg).toContainText('ما يحق له فعله: فتح الإجابات.');
  await dlg.getByRole('button', { name: 'خبير مسند بطلب' }).click();
  await expect(dlg.locator('.cv-sees li.off').first()).toContainText('وسائل التواصل');
  await expect(dlg).toContainText('ما يحق له فعله: القراءة فقط.');
  expect(calls.filter((c) => c.action === 'admin.preview-as').map((c) => c.as)).toEqual(['advisor', 'assigned']);
});

test('الإجراءات الجماعية: تغيير الحالة بسبب مكتوب والإلحاق بدفعة بطلب واحد، وتصدير المحدد وحده', async ({ page }) => {
  const calls = await setup(page, {
    'admin.status': { success: true, done: 2, skipped: 0 },
    'admin.programs': { success: true, programs: [], cohorts: [{ id: 'c1', name: 'دفعة الخريف', status: 'open', is_default: false }] },
    'admin.cohort-enroll': { success: true, enrolled: 2 },
  });
  await page.getByLabel('تحديد الكل').check();
  // الإيقاف بلا سبب لا يُرسل
  await page.getByLabel('تغيير حالة المحددين').selectOption('suspended');
  await page.getByRole('button', { name: 'غيّر الحالة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تغيير الحالة' }).click();
  const ask = page.getByRole('dialog');
  await ask.getByRole('textbox').fill('مخالفة ميثاق البرنامج بعد تنبيهين مكتوبين');
  await ask.getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.status')).toMatchObject({ participant_ids: ['p1', 'p2'], status: 'suspended', reason: 'مخالفة ميثاق البرنامج بعد تنبيهين مكتوبين' });
  expect(calls.filter((c) => c.action === 'admin.status')).toHaveLength(1);
  // القائمة تُعاد بعد التغيير ويُلغى التحديد: ننتظر ذلك قبل تحديد جديد
  await expect(page.getByText('غُيّرت حالة 2')).toBeVisible();
  await expect(page.getByLabel('تحديد Omar Ali')).not.toBeChecked();
  // الإلحاق بدفعة
  await page.getByLabel('تحديد Omar Ali').check();
  await page.getByLabel('نقل المحددين إلى دفعة أخرى (استثناء)').selectOption('c1');
  await page.getByRole('button', { name: 'انقلهم' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.cohort-enroll')).toMatchObject({ cohort_id: 'c1', participant_ids: ['p2'] });
  // التصدير يعرض «المحدد» أولًا حين يُحدَّد شيء
  await page.getByLabel('تحديد سارة الأحمد').check();
  await page.getByRole('button', { name: /تصدير Excel \(1 محدد\)/ }).click();
  const box = page.getByRole('dialog', { name: 'تصدير Excel' });
  await expect(box.getByRole('radio', { name: /المحدد/ })).toBeChecked();
  await expect(box.getByRole('button', { name: 'صدّر 1 مشارك' })).toBeEnabled();
  await box.getByRole('button', { name: 'لا شيء' }).click();
  await expect(box.getByRole('button', { name: /^صدّر/ })).toBeDisabled();
});

test('الاعتماد الجماعي بالمستوى المحسوب: معاينة بمن يُعتمد ومن يُستبقى ولماذا، ثم التنفيذ ونتيجة كل شخص', async ({ page }) => {
  const ready = [{ id: 'p1', full_name: 'سارة الأحمد', levels: { milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' } }];
  const held = [{ id: 'p3', full_name: 'خالد ب.', holds: [{ key: 'borderline', dim: 'milestone', text: 'حالة حدّية في إدارة المشروعات: المستوى التالي في متناول هامش صغير' }, { key: 'effort', text: 'أجاب باستعجال' }] }];
  const calls = await setup(page, {
    'admin.participants': { success: true, participants: [people[0], { ...people[0], id: 'p3', full_name: 'خالد ب.', email: 'k@x.com' }, people[1]] },
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.approve-bulk') return route.fallback();
    calls.push(b);
    return route.fulfill({ json: b.dry_run
      ? { success: true, ready, held, mail: { now: 0, queued: 1, clear_at: '2026-12-20T05:17:00Z' }, mail_read: true }
      : { success: true, results: [{ id: 'p1', full_name: 'سارة الأحمد', ok: true }], held, mail: { now: 1, queued: 0 }, sample: [{ id: 'p1', full_name: 'سارة الأحمد', ok: true }] } });
  });
  // في عرض «بانتظار الاعتماد»: اختصار لاعتماد المتسقين من الظاهرين
  await page.getByRole('button', { name: /بانتظار الاعتماد/ }).first().click();
  await page.getByRole('button', { name: /اعتمد المتسقين/ }).click();
  const dlg = page.getByRole('dialog', { name: 'اعتماد جماعي' });
  await expect(dlg.locator('.ba-sum')).toContainText('سيُعتمد 1');
  await expect(dlg.locator('.ba-sum')).toContainText('يُستبقى 1');
  await expect(dlg.locator('li.held', { hasText: 'خالد ب.' })).toContainText('حالة حدّية في إدارة المشروعات');
  await expect(dlg.locator('li.held', { hasText: 'خالد ب.' })).toContainText('أجاب باستعجال');
  // الدلالة على المحتوى الموحّد بدل تزوير القياس
  await expect(dlg.locator('.ba-hint')).toContainText('مستويات المشاركين: متجانس');
  expect(calls.find((c) => c.action === 'admin.approve-bulk')).toMatchObject({ dry_run: true, participant_ids: ['p1', 'p3'] });
  // أثر البريد قبل التأكيد دائمًا: حصة الإشعارات ممتلئة، فينتظر في الصندوق بموعد آخره، والاعتماد ظاهر في الرحلة
  await expect(dlg.locator('[data-mail-forecast]')).toContainText('سيصل 1 بريدًا: 0 الآن، والباقي 1 ينتظر في صندوق «لم يُرسل»');
  await expect(dlg.locator('[data-mail-forecast]')).toContainText('2026-12-20 نحو 08:17');
  await expect(dlg.locator('[data-mail-forecast]')).toContainText('ويرى كل واحد اعتماده في رحلته فورًا');
  await dlg.getByRole('button', { name: 'اعتمد 1' }).click();
  await expect(dlg.locator('.ba-sum')).toContainText('اعتُمد 1');
  // المرحلة 3: عيّنة للتحقق مما اعتُمد آليًا، كل اسم يفتح ملفه
  await expect(dlg.locator('.ba-sample')).toContainText('عيّنة للتحقق (1)');
  await expect(dlg.locator('.ba-sample').getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  const run = calls.filter((c) => c.action === 'admin.approve-bulk').pop();
  expect(run).toMatchObject({ participant_ids: ['p1', 'p3'] });
  expect(run).not.toHaveProperty('dry_run');
  // المستبقى يُفتح ملفه للمراجعة الفردية
  await dlg.locator('li.held').getByRole('button', { name: 'خالد ب.' }).click();
  await expect(page).toHaveURL(/#\/leaders\/participants\/p3/);
});

test('الاعتماد بمستوى محدد للمدير العام: المخالفة تُسمّى، والتعليل إلزامي، ويُرسل مع المستوى المفروض', async ({ page }) => {
  const calls = await setup(page, {});
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير عام', email: 's@x', role_id: 'super_admin' }, ts: Date.now() })));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.approve-bulk') return route.fallback();
    calls.push(b);
    if (b.mode !== 'set') return route.fulfill({ json: { success: true, ready: [], held: [], mail: { now: 0, queued: 0 } } });
    const ready = [{ id: 'p1', full_name: 'سارة الأحمد', levels: { milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' }, changes: [{ dim: 'leadership', from: 'intermediate', to: 'beginner' }] }];
    return route.fulfill({ json: b.dry_run ? { success: true, mode: 'set', ready, held: [], needs_reason: true, mail: { now: 1, queued: 0 } }
      : { success: true, mode: 'set', results: [{ id: 'p1', full_name: 'سارة الأحمد', ok: true }], held: [], mail: { now: 1, queued: 0 } } });
  });
  await page.reload();
  await page.getByLabel('تحديد سارة الأحمد').check();
  await page.getByRole('button', { name: /اعتماد جماعي/ }).click();
  const dlg = page.getByRole('dialog', { name: 'اعتماد جماعي' });
  await dlg.getByRole('radio', { name: /بمستوى محدد/ }).check();
  await expect(dlg).toContainText('اختر مستوى لبُعد واحد على الأقل');
  await dlg.getByLabel('مستوى تمكين القائد').selectOption('beginner');
  await expect(dlg.locator('li', { hasText: 'سارة الأحمد' })).toContainText('يخالف المحسوب');
  // التعليل إلزامي قبل التنفيذ
  const go = dlg.getByRole('button', { name: 'اعتمد 1' });
  await expect(go).toBeDisabled();
  await dlg.getByRole('textbox').fill('قرار لجنة البرنامج: بداية موحّدة في القيادة');
  await go.click();
  await expect(dlg.locator('.ba-sum')).toContainText('اعتُمد 1');
  const run = calls.filter((c) => c.action === 'admin.approve-bulk' && !c.dry_run).pop();
  expect(run).toMatchObject({ mode: 'set', levels: { leadership: 'beginner' }, reason: 'قرار لجنة البرنامج: بداية موحّدة في القيادة', participant_ids: ['p1'] });
});

test('المدير غير العام لا يرى «بمستوى محدد»', async ({ page }) => {
  await setup(page, { 'admin.approve-bulk': { success: true, ready: [], held: [], mail: { now: 0, queued: 0 } } });
  await page.getByLabel('تحديد سارة الأحمد').check();
  await page.getByRole('button', { name: /اعتماد جماعي/ }).click();
  await expect(page.getByRole('dialog', { name: 'اعتماد جماعي' }).getByRole('radio')).toHaveCount(0);
});

// تقرير فاعلية التذكير (P5، 2026-11-16): من المرسل والمرحلة، ومن لم يعد يكفيه التذكير، والمدة
test('فاعلية التذكير: النسب بحسب المرسل والمرحلة، ومن يحتاج تدخلًا شخصيًا يفتح ملفه، والمدة تُعيد الطلب', async ({ page }) => {
  const t = (key, extra) => ({ key, sent: 4, seen: 2, progressed: 2, waiting: 0, none: 2, seen_pct: 50, progressed_pct: 50, ...extra });
  const calls = await setup(page, {
    'admin.nudge-report': { success: true, ledger: true, days: 30, people: 2, capped: false, total: t('all', { sent: 5, progressed_pct: 25, seen_pct: 20 }),
      by_sender: [t('auto', { label: 'التذكير الآلي', progressed_pct: 0 }), t('mentor', { label: 'المرشد', sent: 1, progressed_pct: 100 })],
      by_stage: [t('التدريب')], stuck: [{ id: 'p2', name: 'Omar Ali', nudges: 3, misses: 3, stage: 'التدريب', last: '2026-11-20T10:00:00Z' }] },
  });
  await page.getByRole('button', { name: 'المزيد من إجراءات المشاركين' }).click();
  await page.getByRole('menuitem', { name: 'فاعلية التذكير' }).click();
  const dlg = page.getByRole('dialog', { name: 'فاعلية التذكير' });
  await expect(dlg.locator('.nr-kpis')).toContainText('25%تقدّم بعده');
  await expect(dlg.getByRole('region', { name: 'بحسب المرسل' })).toContainText('المرشد');
  await expect(dlg.getByRole('region', { name: 'بحسب المرحلة' })).toContainText('التدريب');
  await expect(dlg.getByRole('region', { name: /يحتاجون تدخلًا شخصيًا/ })).toContainText('3 تذكير، 3 بلا أثر');
  await dlg.getByRole('button', { name: 'آخر 90 يومًا' }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.nudge-report').map((c) => c.days)).toEqual([30, 90]);
  await dlg.getByRole('button', { name: 'Omar Ali' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page).toHaveURL(/participants\/p2/);
});

// خارطة إصلاح 2026-11-16 (البند 5): التذكير 50 في كل مرة، والزر يقول ذلك صراحةً حين يُحدَّد أكثر
test('تحديد أكثر من 50 للتذكير: الزر يقول «أول 50» والمعاينة تُطلب لخمسين وحدهم', async ({ page }) => {
  const many = Array.from({ length: 55 }, (_, i) => ({ id: `q${i}`, full_name: `مشارك ${i}`, email: `q${i}@x.com`, status: 'enrolled', placements: [], created_at: '2026-10-01' }));
  const calls = await setup(page, {
    'admin.participants': { success: true, participants: many },
    'admin.nudge-preview': { success: true, count: 0, groups: [], skipped: [] },
  });
  await page.getByRole('checkbox', { name: 'تحديد الكل' }).check();
  const btn = page.getByRole('button', { name: 'ذكّر أول 50 من المحددين' });
  await expect(btn).toHaveAttribute('title', /يُذكَّر أول 50 من المحددين، ثم حدّد الباقين/);
  await btn.click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.nudge-preview')?.participant_ids.length).toBe(50);
});
