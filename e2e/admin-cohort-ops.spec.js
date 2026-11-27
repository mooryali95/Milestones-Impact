// تشغيل الدفعة، المرحلة 0 (تصور 2026-11-19): البحث بالجوال بأي صيغة في قائمة المشاركين والبحث الشامل بلا أثر في عنوان الصفحة
// ولا في تخزين المتصفح، و«آخر نشاط» بدل «آخر دخول»، والتسجيل اليدوي للحضور بسبب (في ورقة الحضور منذ المرحلة 2)، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب،
// وفلتر الدفعة في «ماذا تغيّر». الخلفية مُحاكاة. SHOTS_DIR: مجلد اللقطات (1440 و390).
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-19T09:00:00Z';

const person = (n, full_name, phone, extra = {}) => ({
  id: `p${n}`, full_name, email: `p${n}@example.sa`, phone, job_title: 'مدير مشاريع', organization_id: 'o1', organization_name: 'وزارة التجربة', years_experience: 8,
  status: 'enrolled', created_at: '2026-10-01T08:00:00Z', last_login_at: '2026-11-01T08:00:00Z', last_active_at: '2026-11-18T19:30:00Z', is_test: false,
  placements: ['milestone', 'impact', 'leadership'].map((dimension) => ({ dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z' })),
  cohort_id: 'c1', onboarding: { step: 'done', label: 'في البرنامج', remaining: '' }, effort: null, retake: null, can_retake: false, ...extra,
});
const PEOPLE = [
  person(1, 'أسامة الأحمد', '+966551234567'),
  person(2, 'منى العلي', '+966509876543', { last_login_at: '2026-10-20T08:00:00Z', last_active_at: '2026-10-20T08:00:00Z' }),
  person(3, 'هدى القحطاني', '+966561112233'),
  person(4, 'خالد العتيبي', null, { last_login_at: null, last_active_at: null }),
];
const fileOf = (p) => ({
  success: true, participant: { ...p }, progress: 40, history: [], points: { total: 120, rank: { title: 'مستكشف' } }, book: [{}, {}], models: [],
  placement_model: { min_intermediate: 55, min_advanced: 80, borderline: 8, floor_intermediate: 50 },
  profile: { approved: true, track: { key: 'M2I2L2', title: 'مسار' }, dimensions: [] }, assessments: [],
  journey: [{ key: 's1', title_ar: 'التهيئة', status: 'done', items: [] }, { key: 's2', title_ar: 'التدريب', status: 'active', items: [] }],
  flags: [], observations: [], sessions: [], timeline: [], feedback360: [], attendance: [],
});
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const SESSION = { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T12:00:00Z', active: true };
const stages = (o) => ({ profile: 0, assessment_todo: 0, assessment_doing: 0, approval: 0, placed: 0, enrolled: 0, completed: 0, out: 0, ...o });
const group = (key, name, total) => ({ key, name, total, stages: stages({ enrolled: total }), stuck: 0, waiting: 0, active_week: 1, approved_pct: 100, completed_pct: 0, active_pct: 50 });
const CHANGES = [
  { id: 1, at: '2026-11-18T07:10:00Z', area: 'workshop', area_ar: 'الحضور والجلسات', text: 'سُجّل حضوره في ورشة', known: true, actor_type: 'admin', by: 'a@x', participant_id: 'p1', who: 'أسامة الأحمد', detail: 'تعطل الرمز' },
  { id: 2, at: '2026-11-18T06:05:00Z', area: 'workshop', area_ar: 'الحضور والجلسات', text: 'سجّل حضوره في ورشة', known: true, actor_type: 'participant', by: 'مشارك', participant_id: null, who: '', detail: '' },
  { id: 3, at: '2026-11-17T10:00:00Z', area: 'cohort', area_ar: 'الدفعات', text: 'حُفظت الدفعة', known: true, actor_type: 'admin', by: 'a@x', participant_id: null, who: '', detail: '' },
];

// «الخادم»: الحضور حالة واحدة يكتبها admin.workshop-mark-bulk بقواعد الخادم (الرفض بلا سبب لمن سجّل نفسه) وتقرؤها الورقة
async function admin(page, width, { attendance = {} } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push({ ...b, url: route.request().url() });
    // ورقة الحضور (المرحلة 2): حفظ واحد بقواعد الخادم، والرفض لكل مشارك بسببه
    if (b.action === 'admin.workshop-mark-bulk') {
      const out = { success: true, marked: 0, unmarked: 0, already: 0, refused: [] };
      for (const id of b.present || []) { if (attendance[id]) out.already += 1; else { attendance[id] = { method: 'manual', checked_in_at: NOW, recorded_by: 'a@x', ...(b.reason ? { note: b.reason } : {}) }; out.marked += 1; } }
      for (const id of b.absent || []) {
        const was = attendance[id];
        if (!was) out.already += 1;
        else if (was.method !== 'manual' && !String(b.unmark_reason || '').trim()) out.refused.push({ id, code: 'reason_required', message: 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه' });
        else { delete attendance[id]; out.unmarked += 1; }
      }
      return route.fulfill({ json: out });
    }
    const replies = {
      'admin.orgs': { success: true, orgs: [{ id: 'o1', name: 'وزارة التجربة', short_name: 'التجربة' }], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: PEOPLE, cohorts: [{ id: 'c1', name: 'دفعة نوفمبر' }] },
      'admin.participant': fileOf(PEOPLE.find((p) => p.id === b.id) || PEOPLE[0]),
      'admin.activities': { success: true, capacity_ready: false, requirements: [{ id: R, code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', program_id: 'pa', config: { sessions_required: 4, verify: 'qr' } }],
        workshops: [{ ...SESSION, attended: Object.keys(attendance).length }], coaching: [], programs: [{ id: 'pa', name: 'برنامج القادة' }], cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa' }] },
      'admin.workshop-attendance': { success: true, session: SESSION, requirement: { id: R, title_ar: 'حضور الأيام التدريبية' },
        people: PEOPLE.slice(0, 3).map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, organization_name: p.organization_name, attendance: attendance[p.id] || null })) },
      'admin.insight': { success: true, by_org: { groups: [group('o1', 'وزارة التجربة', 4)], total: group('all', 'الإجمالي', 4) },
        by_cohort: { groups: [group('c1', 'دفعة نوفمبر', 3), group('c2', 'دفعة الربيع', 1), group('none', 'بلا دفعة', 0)], total: group('all', 'الإجمالي', 4) }, experts: [] },
      'admin.changes': { success: true, more: false, next: null, changes: b.cohort_id === 'c1' ? CHANGES.slice(0, 2) : CHANGES },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  return calls;
}
const open = async (page, hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await page.reload(); };
const shot = async (page, name, part = page) => { if (SHOTS) await part.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// ثلاثة أرقام متتالية فأكثر، بأي من الأرقام: لا تظهر في العنوان ولا في تخزين المتصفح
const DIGITS = /[0-9٠-٩]{3}/;
const leaks = (page) => page.evaluate(() => {
  const dump = (s) => Object.keys(s).filter((k) => k.startsWith('mi_admin_flt_') || k.startsWith('mi_admin_views_')).map((k) => s.getItem(k)).join('|');
  return { url: decodeURIComponent(window.location.href.split('#')[1] || ''), kept: dump(sessionStorage) + dump(localStorage) };
});

for (const width of [1440, 390]) {
  test(`البحث بالجوال في قائمة المشاركين: 05 وأخواتها تجد صاحب الرقم، ولا رقم في العنوان ولا في التخزين (${width})`, async ({ page }) => {
    const calls = await admin(page, width);
    await open(page, '#/leaders/participants');
    const rows = page.locator('.data-table tbody tr');
    await expect(rows).toHaveCount(4);
    const search = page.getByRole('searchbox', { name: 'بحث' });
    for (const q of ['0551234567', '551234567', '966551234567', '+966551234567', '055 123 4567', '055-123-4567', '٠٥٥١٢٣٤٥٦٧']) {
      await search.fill(q);
      await expect(rows, q).toHaveCount(1);
      await expect(rows.first()).toContainText('أسامة الأحمد');
      // الرقم ظاهر في الصف الذي وُجد به
      await expect(rows.first().locator('.pt-phone')).toHaveText('+966551234567');
      const l = await leaks(page);
      expect(l.url, q).not.toMatch(DIGITS);
      expect(l.kept, q).not.toMatch(DIGITS);
    }
    // الكتابة حرفًا حرفًا: لا لحظة يظهر فيها الرقم في العنوان
    await search.fill('');
    for (const ch of '0551234567') {
      await search.pressSequentially(ch);
      expect((await leaks(page)).url).not.toMatch(DIGITS);
    }
    await expect(rows).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
    // رقم بمسافات يُعرض من اليسار كما كُتب
    await search.fill('055 123 4567');
    await expect(search).toHaveAttribute('dir', 'ltr');
    await expect(rows).toHaveCount(1);
    await shot(page, 'phone-search-list');
    // لا طلب للخادم يحمل الرقم في رابطه، والبحث هنا في المتصفح وحده
    expect(calls.every((c) => !DIGITS.test(decodeURIComponent(c.url).replace(/^https?:\/\/[^/]+/, '')))).toBe(true);
    expect(calls.filter((c) => c.action === 'admin.participants').every((c) => !c.search)).toBe(true);

    // توحيد الحروف: «اسامه» تجد «أسامة»، و«مني» تجد «منى»، والاسم يُكتب في العنوان كما كان
    await search.fill('اسامه');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('أسامة الأحمد');
    await expect(rows.first().locator('.pt-phone')).toHaveCount(0);
    expect((await leaks(page)).url).toContain('q=اسامه');
    await search.fill('مني');
    await expect(rows.first()).toContainText('منى العلي');
    // بعد العودة إلى القائمة لا رقم محفوظ من الزيارة السابقة
    await search.fill('0509876543');
    await expect(rows.first()).toContainText('منى العلي');
    await open(page, '#/leaders/overview');
    await open(page, '#/leaders/participants');
    await expect(page.getByRole('searchbox', { name: 'بحث' })).toHaveValue('');
    await expect(rows).toHaveCount(4);
  });

  test(`البحث الشامل بالجوال يفتح ملف صاحبه، و«آخر نشاط» في لمحته وملفه (${width})`, async ({ page }) => {
    await admin(page, width);
    await open(page, '#/leaders/overview');
    // اللوحة جاهزة قبل الاختصار: المستمع يُسجَّل بعد رسمها
    await expect(page.getByRole('navigation', { name: 'أقسام تطبيق القادة' })).toBeVisible();
    await page.keyboard.press('Control+k');
    const pal = page.getByRole('dialog', { name: 'البحث الشامل' });
    await pal.getByRole('combobox').fill('055 123 4567');
    const hits = pal.getByRole('option');
    await expect(hits).toHaveCount(1);
    await expect(hits.first()).toContainText('أسامة الأحمد');
    await expect(hits.first()).toContainText('+966551234567');
    expect((await leaks(page)).url).not.toMatch(DIGITS);
    await shot(page, 'phone-search-palette');
    for (const q of ['٠٥٥١٢٣٤٥٦٧', '+966551234567', '551234567']) { await pal.getByRole('combobox').fill(q); await expect(hits, q).toHaveCount(1); }
    await page.keyboard.press('Enter');
    await expect(page.locator('.pf-head h3')).toHaveText('أسامة الأحمد');
    expect((await leaks(page)).url).toBe('/leaders/participants/p1');
    // آخر نشاط أحدث من آخر دخول: يظهران معًا بتسميتهما
    const glance = page.getByRole('complementary', { name: 'لمحة' });
    await expect(glance).toContainText('آخر نشاط');
    await expect(glance).toContainText('18 نوفمبر 2026');
    await expect(glance).toContainText('آخر دخول 1 نوفمبر 2026');
    expect(await noOverflow(page)).toBe(true);
    await glance.scrollIntoViewIfNeeded();
    await shot(page, 'last-activity-glance');
    await page.getByRole('tab', { name: /^الملف/ }).click();
    const dl = page.getByRole('tabpanel').locator('.la-dl').first();
    await expect(dl.locator('dt', { hasText: 'آخر نشاط' }).locator('+ dd')).toHaveText('18 نوفمبر 2026');
    await expect(dl.locator('dt', { hasText: 'آخر دخول' }).locator('+ dd')).toHaveText('1 نوفمبر 2026');
    await dl.locator('dt', { hasText: 'آخر نشاط' }).scrollIntoViewIfNeeded();
    await shot(page, 'last-activity-file');
  });

  // كان هذا على قائمة «تسجيل حضور» لكل صف (المرحلة 0). المرحلة 2 جعلتها ورقة حضور بحفظ واحد، فالاختبار على الورقة والقواعد نفسها:
  // السبب مع التسجيل اليدوي، وإلغاء اليدوي بلا سبب، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب (التفصيل في admin-attendance-sheet.spec.js)
  test(`التسجيل اليدوي بسبب، وإلغاء حضور سجّله المشارك بنفسه يطلب سببًا مكتوبًا (${width})`, async ({ page }) => {
    const attendance = { p2: { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null } };
    const calls = await admin(page, width, { attendance });
    await open(page, '#/leaders/activities');
    // زر الحضور في «الحضور والجلسات» يحمل العدد
    await page.getByRole('button', { name: /^سجّل الحضور \(1/ }).click();
    const sheet = page.getByRole('dialog', { name: 'ورقة الحضور' });
    await expect(sheet.getByRole('heading', { name: 'اليوم 1' })).toBeVisible();
    await expect(sheet.locator('.ats-count')).toContainText('1 من 3 حضروا');
    const marks = () => calls.filter((c) => c.action === 'admin.workshop-mark-bulk').map(({ session_id, present, absent, reason, unmark_reason }) => ({ session_id, present, absent, reason, unmark_reason }));
    const row = (name) => sheet.locator('.ats-row', { hasText: name });
    const saveNow = async () => { await sheet.getByRole('button', { name: 'راجع واحفظ' }).click(); await sheet.getByTestId('ats-confirm').getByRole('button', { name: 'احفظ' }).click(); };

    // تسجيل يدوي بسبب من القائمة القصيرة
    await row('أسامة الأحمد').getByRole('checkbox').check();
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('تعطل الرمز');
    await shot(page, 'manual-mark-reason');
    await saveNow();
    await expect(row('أسامة الأحمد')).toContainText('يدوي');
    await expect(row('أسامة الأحمد')).toContainText('سجّله a@x');
    await expect(row('أسامة الأحمد')).toContainText('السبب: تعطل الرمز');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', present: ['p1'], absent: undefined, reason: 'تعطل الرمز', unmark_reason: undefined });
    // سبب آخر مكتوب
    await row('هدى القحطاني').getByRole('checkbox').check();
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('other');
    await sheet.getByLabel('اكتب السبب').fill('حضر متأخرًا بعد إغلاق الرمز');
    await saveNow();
    await expect(sheet.locator('.ats-count')).toContainText('3 من 3 حضروا');
    expect(marks().at(-1)).toMatchObject({ present: ['p3'], reason: 'حضر متأخرًا بعد إغلاق الرمز' });
    expect(await noOverflow(page)).toBe(true);

    // إلغاء اليدوي بلا سؤال عن سبب
    await row('هدى القحطاني').getByRole('checkbox').uncheck();
    await saveNow();
    await expect(sheet.locator('.ats-count')).toContainText('2 من 3 حضروا');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', present: undefined, absent: ['p3'], reason: undefined, unmark_reason: undefined });

    // إلغاء حضور بالرمز: يُسأل عن السبب في التأكيد، والفارغ لا يُرسل
    const n = marks().length;
    await row('منى العلي').getByRole('checkbox').uncheck();
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    const ask = sheet.getByTestId('ats-confirm');
    await expect(ask).toContainText('يُلغى حضور واحد سجّله صاحبه بنفسه');
    await expect(ask).toContainText('منى العلي');
    await shot(page, 'unmark-self-reason');
    await ask.getByRole('button', { name: 'احفظ' }).click();
    await expect(ask.getByRole('alert')).toHaveText('اكتب سبب إلغاء حضور من سجّل نفسه');
    expect(marks().length).toBe(n);
    // الرجوع عن التأكيد لا يلغي شيئًا، والتراجع عن التغييرات يعيد الورقة كما في الخادم
    await ask.getByRole('button', { name: 'رجوع' }).click();
    await sheet.getByRole('button', { name: 'تراجع عن التغييرات' }).click();
    await expect(row('منى العلي')).toContainText('رمز QR');
    await expect(row('منى العلي').getByRole('checkbox')).toBeChecked();
    expect(marks().length).toBe(n);
    // بسبب مكتوب يُلغى
    await row('منى العلي').getByRole('checkbox').uncheck();
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    await ask.getByLabel(/سبب إلغاء حضور من سجّل نفسه/).fill('مسح الرمز من خارج القاعة');
    await ask.getByRole('button', { name: 'احفظ' }).click();
    await expect(row('منى العلي')).toContainText('غائب');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', present: undefined, absent: ['p2'], reason: undefined, unmark_reason: 'مسح الرمز من خارج القاعة' });
  });

  test(`«ماذا تغيّر»: فلتر الدفعة ومجال «الحضور والجلسات»، والسبب ظاهر في السطر (${width})`, async ({ page }) => {
    const calls = await admin(page, width);
    await open(page, '#/leaders/insight');
    await page.getByRole('tab', { name: 'ماذا تغيّر' }).click();
    const log = page.locator('.ins-log li');
    await expect(log).toHaveCount(3);
    const changes = () => calls.filter((c) => c.action === 'admin.changes');
    expect(changes().at(-1).cohort_id).toBeUndefined();
    // الدفعات بأسمائها، بلا «بلا دفعة»
    const cohort = page.getByLabel('الدفعة', { exact: true });
    await expect(cohort.locator('option')).toHaveText(['كل الدفعات', 'دفعة نوفمبر', 'دفعة الربيع']);
    await cohort.selectOption('c1');
    await expect.poll(() => changes().at(-1)).toMatchObject({ cohort_id: 'c1', days: 7 });
    await expect(log).toHaveCount(2);
    await expect(log.first()).toContainText('سُجّل حضوره في ورشة');
    await expect(log.first()).toContainText('تعطل الرمز');
    await expect(page.locator('.flt-chip')).toContainText(['الدفعات: دفعة نوفمبر']);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'changes-cohort-filter', page.locator('.ins > section.la-card'));
    // مجال «الحضور والجلسات» مع الدفعة
    await page.getByLabel('المجال', { exact: true }).selectOption('workshop');
    await expect.poll(() => changes().at(-1)).toMatchObject({ cohort_id: 'c1', area: 'workshop' });
    // إزالة الفلتر تعيد السجل كله
    await page.getByRole('button', { name: 'إزالة الدفعات: دفعة نوفمبر' }).click();
    await expect.poll(() => changes().at(-1).cohort_id).toBeUndefined();
  });
}
