// ورقة الحضور الجماعية (تصور تشغيل الدفعة 2026-11-19، المرحلة 2): «علّم الكل حاضرًا» بسبب واحد وحفظ واحد لجلسة من 60 مشاركًا،
// وتأكيد يقول ما سيُكتب، ونتيجة الخادم لكل مشارك (سُجّل، تُخطي، رُفض بسببه)، ومن سجّل كل حضور وسببه بعد الحفظ، وإلغاء حضور
// سجّله المشارك بنفسه بسبب مكتوب، ولوحة المفاتيح، والحالات الفارغة والخطأ والقراءة فقط. الخلفية مُحاكاة بقواعد الخادم.
// SHOTS_DIR: مجلد اللقطات (1440 و390).
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-19T09:00:00Z';
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const SESSION = { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T12:00:00Z', active: true };
const FIRST = ['أسامة', 'منى', 'هدى', 'خالد', 'سارة', 'فهد', 'ريم', 'نورة', 'علي', 'ماجد', 'لينا', 'يوسف'];
const LAST = ['الأحمد', 'العلي', 'القحطاني', 'العتيبي', 'الحربي'];
const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, full_name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`, email: `p${i + 1}@example.sa`, organization_name: 'وزارة التجربة' }));

// «الخادم»: حالة حضور واحدة يكتبها admin.workshop-mark-bulk بقواعد markBatch (المسجل أصلًا يُتخطى، وغير المتوقع يُرفض، وإلغاء
// ما سجّله المشارك بنفسه بلا سبب يُرفض) وتقرؤها القائمة. refuse: معرّفات يرفضها الخادم كأنها ليست من متوقعي الجلسة
async function admin(page, width, { list = people(60), attendance = {}, refuse = [], role = 'admin', failRead = 0 } = {}) {
  const calls = [];
  let fails = failRead;
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.workshop-mark-bulk') {
      const out = { success: true, marked: 0, unmarked: 0, already: 0, refused: [] };
      for (const id of b.present || []) {
        if (attendance[id]) out.already += 1;
        else if (refuse.includes(id)) out.refused.push({ id, code: 'not_expected', message: 'ليس ممن يُتوقع حضورهم في هذه الجلسة' });
        else { attendance[id] = { method: 'manual', checked_in_at: NOW, recorded_by: 'a@x', ...(b.reason ? { note: b.reason } : {}) }; out.marked += 1; }
      }
      for (const id of b.absent || []) {
        const was = attendance[id];
        if (!was) out.already += 1;
        else if (was.method !== 'manual' && !String(b.unmark_reason || '').trim()) out.refused.push({ id, code: 'reason_required', message: 'اكتب سبب إلغاء حضور سجّله المشارك بنفسه' });
        else { delete attendance[id]; out.unmarked += 1; }
      }
      return route.fulfill({ json: out });
    }
    if (b.action === 'admin.workshop-attendance' && fails > 0) { fails -= 1; return route.fulfill({ json: { success: false, message: 'تعذّرت قراءة الحضور' } }); }
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: [] },
      'admin.activities': { success: true, capacity_ready: false, requirements: [{ id: R, code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية', program_id: 'pa', config: { sessions_required: 4, verify: 'qr' } }],
        workshops: [{ ...SESSION, attended: Object.keys(attendance).length }], coaching: [], programs: [{ id: 'pa', name: 'برنامج القادة' }], cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa' }] },
      'admin.workshop-attendance': { success: true, session: SESSION, requirement: { id: R, title_ar: 'حضور الأيام التدريبية' }, people: list.map((p) => ({ ...p, attendance: attendance[p.id] || null })) },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((r) => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: r }, ts: Date.now() })), role);
  await page.evaluate(() => { window.location.hash = '#/leaders/activities'; });
  await page.reload();
  return calls;
}
const shot = async (page, name) => { if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const bulk = (calls) => calls.filter((c) => c.action === 'admin.workshop-mark-bulk').map(({ session_id, present, absent, reason, unmark_reason }) => ({ session_id, present, absent, reason, unmark_reason }));
const openSheet = async (page, count) => {
  await page.getByRole('button', { name: `${count} حاضر` }).click();
  return page.getByRole('dialog', { name: 'ورقة الحضور' });
};
const row = (sheet, name) => sheet.locator('.ats-row', { hasText: name });

for (const width of [1440, 390]) {
  test(`علّم الكل حاضرًا بسبب واحد وحفظ واحد لجلسة من 60 (${width})`, async ({ page }) => {
    // اثنان سجّلا نفسيهما قبل فتح الورقة
    const attendance = { p2: { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null }, p7: { method: 'code', checked_in_at: '2026-11-18T06:09:00Z', recorded_by: null } };
    const calls = await admin(page, width, { attendance });
    const sheet = await openSheet(page, 2);
    await expect(sheet.getByRole('heading', { name: 'اليوم 1' })).toBeVisible();
    await expect(sheet.locator('.ats-count')).toContainText('2 من 60 حضروا');
    await expect(sheet.getByRole('checkbox')).toHaveCount(60);
    await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(2);
    // من سجّل نفسه معلَّم وبجانبه طريقته ووقته
    await expect(row(sheet, 'p2@example.sa')).toContainText('حاضر · رمز QR');
    await expect(row(sheet, 'p7@example.sa')).toContainText('حاضر · الأرقام الستة');
    // لا حفظ بلا تغيير
    await expect(sheet.getByRole('button', { name: 'لا تغيير للحفظ' })).toBeDisabled();
    expect(await noOverflow(page)).toBe(true);
    // زر الحفظ وحقل السبب ظاهران بلا تمرير والقائمة وحدها تُمرَّر (60 صفًا على الجوال)
    await expect(sheet.locator('.ats-foot')).toBeInViewport();
    expect(await sheet.locator('.ats-list').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await shot(page, 'sheet');

    await sheet.getByRole('button', { name: 'علّم الكل حاضرًا' }).click();
    await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(60);
    await expect(sheet.locator('.ats-count')).toContainText('يُسجَّل 58 (لم يُحفظ)');
    await expect(row(sheet, 'p1@example.sa')).toContainText('يُسجَّل عند الحفظ');
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('تعطل الرمز');
    // لا طلب كتابة قبل التأكيد
    expect(bulk(calls)).toEqual([]);
    await shot(page, 'sheet-all-marked');
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    const confirm = sheet.getByTestId('ats-confirm');
    await expect(confirm).toContainText('يُسجَّل يدويًا حضور 58 مشاركًا، والسبب: تعطل الرمز.');
    await expect(confirm).toContainText('من يُسجَّل حضورهم (58)');
    await expect(confirm).toContainText('من سجّل نفسه يبقى بطريقته ووقته');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'sheet-confirm');
    await confirm.getByRole('button', { name: 'احفظ' }).click();

    // حفظ واحد يحمل الغائبين وحدهم والسبب مرة واحدة
    const result = sheet.getByTestId('ats-result');
    await expect(result).toHaveText('حُفظ: سُجّل 58');
    const sent = bulk(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0].present).toHaveLength(58);
    expect(sent[0]).toMatchObject({ session_id: 'w1', reason: 'تعطل الرمز', absent: undefined, unmark_reason: undefined });
    expect(sent[0].present).not.toContain('p2');
    expect(sent[0].present).not.toContain('p7');
    await expect(sheet.locator('.ats-count')).toContainText('60 من 60 حضروا');
    // بعد الحفظ: من سجّل كل حضور وسببه، ومن سجّل نفسه كما هو
    await expect(row(sheet, 'p1@example.sa')).toContainText('حاضر · يدوي');
    await expect(row(sheet, 'p1@example.sa')).toContainText('سجّله a@x');
    await expect(row(sheet, 'p1@example.sa')).toContainText('السبب: تعطل الرمز');
    await expect(row(sheet, 'p2@example.sa')).toContainText('حاضر · رمز QR');
    await expect(row(sheet, 'p2@example.sa')).not.toContainText('سجّله');
    await expect(sheet.getByRole('button', { name: 'لا تغيير للحفظ' })).toBeDisabled();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'sheet-saved');
    // الإغلاق بلا تغيير معلّق لا يسأل، والعدد في «الحضور والجلسات» يتحدث
    await sheet.getByRole('button', { name: 'إغلاق' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: '60 حاضر' })).toBeVisible();
  });

  test(`تسجيل المحددين وإلغاء حضور في حفظ واحد: المرفوض باسمه وسببه، ومن سجّل نفسه بسبب مكتوب (${width})`, async ({ page }) => {
    const attendance = {
      p2: { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null },
      p3: { method: 'manual', checked_in_at: '2026-11-18T07:00:00Z', recorded_by: 'b@x', note: 'بلا هاتف' },
    };
    const calls = await admin(page, width, { list: people(6), attendance, refuse: ['p5'] });
    const sheet = await openSheet(page, 2);
    await expect(row(sheet, 'p3@example.sa')).toContainText('سجّله b@x');
    await expect(row(sheet, 'p3@example.sa')).toContainText('السبب: بلا هاتف');
    // لوحة المفاتيح: المربع يُعلَّم بالمسافة
    await row(sheet, 'p1@example.sa').getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await row(sheet, 'p5@example.sa').getByRole('checkbox').check();
    await row(sheet, 'p3@example.sa').getByRole('checkbox').uncheck();
    await row(sheet, 'p2@example.sa').getByRole('checkbox').uncheck();
    await expect(row(sheet, 'p3@example.sa')).toContainText('يُلغى عند الحفظ');
    await expect(row(sheet, 'p2@example.sa')).toContainText('يُلغى عند الحفظ بسبب');
    await expect(sheet.locator('.ats-count')).toContainText('يُسجَّل 2، يُلغى 2 (لم يُحفظ)');
    // سبب آخر مكتوب
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('other');
    await sheet.getByLabel('اكتب السبب').fill('حضر متأخرًا بعد إغلاق الرمز');
    // Esc والورقة فيها تغيير: تسأل ولا تغلق
    await page.keyboard.press('Escape');
    const leave = sheet.getByRole('alertdialog', { name: 'تغييرات لم تُحفظ' });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'ابقَ في الورقة' }).click();
    await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(2);

    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    const confirm = sheet.getByTestId('ats-confirm');
    await expect(confirm).toContainText('يُلغى حضور واحد سجّله صاحبه بنفسه');
    // بلا سبب مكتوب لا يُرسل شيء
    await confirm.getByRole('button', { name: 'احفظ' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('اكتب سبب إلغاء حضور من سجّل نفسه');
    expect(bulk(calls)).toEqual([]);
    await confirm.getByLabel(/سبب إلغاء حضور من سجّل نفسه/).fill('مسح الرمز من خارج القاعة');
    await shot(page, 'sheet-confirm-unmark');
    // Esc في التأكيد يعيد إلى الورقة والمسودة كما هي
    await page.keyboard.press('Escape');
    await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    await confirm.getByRole('button', { name: 'احفظ' }).click();

    const result = sheet.getByTestId('ats-result');
    await expect(result).toContainText('حُفظ: سُجّل 1 · أُلغي 2 · رُفض 1');
    await expect(result.locator('li')).toHaveText([`${people(6)[4].full_name}: ليس ممن يُتوقع حضورهم في هذه الجلسة`]);
    expect(bulk(calls)).toEqual([{ session_id: 'w1', present: ['p1', 'p5'], absent: ['p3', 'p2'], reason: 'حضر متأخرًا بعد إغلاق الرمز', unmark_reason: 'مسح الرمز من خارج القاعة' }]);
    await expect(sheet.locator('.ats-count')).toContainText('1 من 6 حضروا');
    await expect(row(sheet, 'p1@example.sa')).toContainText('السبب: حضر متأخرًا بعد إغلاق الرمز');
    await expect(row(sheet, 'p2@example.sa')).toContainText('غائب');
    await expect(row(sheet, 'p5@example.sa')).toContainText('غائب');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'sheet-saved-mixed');
    // البحث بالاسم بتوحيد الحروف، و«علّم المعروضين» للمعروضين وحدهم
    await sheet.getByRole('searchbox', { name: 'ابحث بالاسم' }).fill('اسامه');
    await expect(sheet.locator('.ats-row')).toHaveCount(1);
    await sheet.getByRole('searchbox', { name: 'ابحث بالاسم' }).fill('لا أحد بهذا الاسم');
    await expect(sheet.getByText('لا اسم يطابق بحثك')).toBeVisible();
    await sheet.getByRole('button', { name: 'امسح البحث' }).click();
    await expect(sheet.locator('.ats-row')).toHaveCount(6);
  });
}

test('المطّلع يقرأ الورقة بلا مربعات ولا حفظ، والقائمة الفارغة وتعذّر القراءة بحالتيهما', async ({ page }) => {
  const attendance = { p2: { method: 'qr', checked_in_at: '2026-11-18T06:04:00Z', recorded_by: null } };
  const calls = await admin(page, 390, { list: people(3), attendance, role: 'viewer', failRead: 1 });
  let sheet = await openSheet(page, 1);
  // تعذّر القراءة: رسالة الخادم وإعادة المحاولة
  await expect(sheet.getByRole('alert')).toContainText('تعذّرت قراءة الحضور');
  await sheet.getByRole('button', { name: 'أعد المحاولة' }).click();
  await expect(sheet.locator('.ats-count')).toContainText('1 من 3 حضروا');
  await expect(sheet.getByRole('checkbox')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /علّم الكل|راجع واحفظ|لا تغيير للحفظ/ })).toHaveCount(0);
  await expect(sheet.locator('.ats-row')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(bulk(calls)).toEqual([]);
});

test('لا أحد متوقع حضوره: حالة فارغة واضحة بلا أدوات', async ({ page }) => {
  await admin(page, 1440, { list: [] });
  const sheet = await openSheet(page, 0);
  await expect(sheet.getByText('لا أحد متوقع حضوره في هذه الجلسة بعد')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'علّم الكل حاضرًا' })).toHaveCount(0);
  await expect(sheet.locator('.ats-foot')).toHaveCount(0);
});

test('تعذّر الحفظ: الرسالة ظاهرة والمسودة باقية كما هي لإعادة المحاولة', async ({ page }) => {
  const calls = await admin(page, 390, { list: people(4) });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'admin.workshop-mark-bulk' || calls.filter((c) => c.action === b.action).length > 0) return route.fallback();
    calls.push(b);
    return route.fulfill({ json: { success: false, code: 'inactive', message: 'هذه الجلسة ملغاة، فلا يُسجَّل فيها حضور. أعدها أولًا' } });
  });
  const sheet = await openSheet(page, 0);
  await sheet.getByRole('button', { name: 'علّم الكل حاضرًا' }).click();
  await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
  await sheet.getByTestId('ats-confirm').getByRole('button', { name: 'احفظ' }).click();
  await expect(sheet.getByTestId('ats-result')).toHaveText('هذه الجلسة ملغاة، فلا يُسجَّل فيها حضور. أعدها أولًا');
  await expect(sheet.getByRole('checkbox', { checked: true })).toHaveCount(4);
  await expect(sheet.locator('.ats-count')).toContainText('0 من 4 حضروا');
  // الإعادة تنجح والمسودة نفسها
  await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
  await sheet.getByTestId('ats-confirm').getByRole('button', { name: 'احفظ' }).click();
  await expect(sheet.getByTestId('ats-result')).toHaveText('حُفظ: سُجّل 4');
});
