// تشغيل الدفعة، المرحلة 0 (تصور 2026-11-19): البحث بالجوال بأي صيغة في قائمة المشاركين والبحث الشامل بلا أثر في عنوان الصفحة
// ولا في تخزين المتصفح، و«آخر نشاط» بدل «آخر دخول»، والتسجيل اليدوي للحضور بسبب، وإلغاء حضور سجّله المشارك بنفسه بسبب مكتوب،
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

// «الخادم»: الحضور حالة واحدة يكتبها admin.workshop-mark بقواعد الخادم (الرفض بلا سبب لمن سجّل نفسه) وتقرؤها القائمة
async function admin(page, width, { attendance = {} } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push({ ...b, url: route.request().url() });
    if (b.action === 'admin.workshop-mark') {
      const was = attendance[b.participant_id];
      if (b.present) { if (!was) attendance[b.participant_id] = { method: 'manual', checked_in_at: NOW, recorded_by: 'a@x' }; return route.fulfill({ json: { success: true } }); }
      if (was && was.method !== 'manual' && !String(b.reason || '').trim()) return route.fulfill({ json: { success: false, code: 'reason_required', message: 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه' } });
      delete attendance[b.participant_id];
      return route.fulfill({ json: { success: true } });
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

  test(`التسجيل اليدوي بسبب، وإلغاء حضور سجّله المشارك بنفسه يطلب سببًا مكتوبًا (${width})`, async ({ page }) => {
    const attendance = { p2: { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null } };
    const calls = await admin(page, width, { attendance });
    await open(page, '#/leaders/activities');
    // زر الحضور في «الحضور والجلسات» يحمل العدد
    await page.getByRole('button', { name: '1 حاضر' }).click();
    const sheet = page.getByRole('dialog', { name: 'الحضور' });
    await expect(sheet.getByRole('heading')).toContainText('اليوم 1 · 1 من 3');
    const marks = () => calls.filter((c) => c.action === 'admin.workshop-mark').map(({ session_id, participant_id, present, reason }) => ({ session_id, participant_id, present, reason }));

    // تسجيل يدوي بسبب من القائمة القصيرة
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('تعطل الرمز');
    await shot(page, 'manual-mark-reason');
    await sheet.locator('tr', { hasText: 'أسامة الأحمد' }).getByRole('button', { name: 'تسجيل حضور' }).click();
    await expect(sheet.locator('tr', { hasText: 'أسامة الأحمد' })).toContainText('يدوي');
    await expect(sheet.locator('tr', { hasText: 'أسامة الأحمد' })).toContainText('سجّله a@x');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', participant_id: 'p1', present: true, reason: 'تعطل الرمز' });
    // سبب آخر مكتوب
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('other');
    await sheet.getByLabel('اكتب السبب').fill('حضر متأخرًا بعد إغلاق الرمز');
    await sheet.locator('tr', { hasText: 'هدى القحطاني' }).getByRole('button', { name: 'تسجيل حضور' }).click();
    await expect(sheet.getByRole('heading')).toContainText('3 من 3');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', participant_id: 'p3', present: true, reason: 'حضر متأخرًا بعد إغلاق الرمز' });
    expect(await noOverflow(page)).toBe(true);

    // إلغاء اليدوي بنقرة، بلا سؤال ولا سبب
    await sheet.locator('tr', { hasText: 'هدى القحطاني' }).getByRole('button', { name: 'إلغاء' }).click();
    await expect(sheet.getByRole('heading')).toContainText('2 من 3');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', participant_id: 'p3', present: false, reason: undefined });

    // إلغاء حضور بالرمز: يُسأل عن السبب، والفارغ لا يُرسل
    const n = marks().length;
    await sheet.locator('tr', { hasText: 'منى العلي' }).getByRole('button', { name: 'إلغاء' }).click();
    const ask = page.locator('.mid-box');
    await expect(ask).toContainText('سجّل منى العلي حضوره بنفسه (رمز QR)');
    await shot(page, 'unmark-self-reason');
    await ask.getByRole('button', { name: 'إلغاء الحضور' }).click();
    await expect(page.locator('.toast.show')).toHaveText('السبب مطلوب لإلغاء حضور سجّله المشارك بنفسه');
    expect(marks().length).toBe(n);
    await expect(sheet.locator('tr', { hasText: 'منى العلي' })).toContainText('رمز QR');
    // التراجع عن السؤال لا يلغي شيئًا
    await sheet.locator('tr', { hasText: 'منى العلي' }).getByRole('button', { name: 'إلغاء' }).click();
    await ask.getByRole('button', { name: 'إلغاء', exact: true }).click();
    expect(marks().length).toBe(n);
    // بسبب مكتوب يُلغى
    await sheet.locator('tr', { hasText: 'منى العلي' }).getByRole('button', { name: 'إلغاء' }).click();
    await ask.locator('input').fill('مسح الرمز من خارج القاعة');
    await ask.getByRole('button', { name: 'إلغاء الحضور' }).click();
    await expect(sheet.locator('tr', { hasText: 'منى العلي' })).toContainText('غائب');
    expect(marks().at(-1)).toEqual({ session_id: 'w1', participant_id: 'p2', present: false, reason: 'مسح الرمز من خارج القاعة' });
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
