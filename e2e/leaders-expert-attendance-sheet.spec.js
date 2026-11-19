// ورقة الحضور في بوابة الخبير (تصور تشغيل الدفعة 2026-11-19، المرحلة 2، القرار 3): المدرب المكلف بدفعة الجلسة يسجّل الحضور يدويًا
// بسبب مكتوب، بالورقة نفسها التي في لوحة الإدارة، بلا بريد ولا جهة ولا من سجّل. لا يلغي حضورًا سجّله المشارك بنفسه ولا ما
// سجّله غيره، ويلغي ما سجّله هو. الخلفية مُحاكاة بقواعد الخادم. SHOTS_DIR: مجلد اللقطات (1440 و390).
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR;
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const later = (h) => new Date(Date.now() + h * 36e5).toISOString();
const xpDash = { success: true, features: { hall: false, katon: false, f360: false }, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 5, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] };
const NAMES = ['سارة الأحمد', 'خالد العتيبي', 'نورة القحطاني', 'فهد الشمري', 'ريم الدوسري', 'ماجد الحربي'];
const SESSIONS = [
  // جارية تُوثَّق بالرمز: رمز وورقة. وانتهت أمس وتُوثَّق يدويًا: ورقة بلا رمز. وقادمة بعد يومين: رمز بلا ورقة بعد
  { id: 'w3', title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5), cohort: 'دفعة نوفمبر 2026', open: true, qr: true, sheet: true },
  { id: 'w2', title: 'اليوم الثاني', location: 'الرياض، قاعة الأثر', starts_at: later(-30), ends_at: later(-24), cohort: 'دفعة نوفمبر 2026', open: false, qr: false, sheet: true },
  { id: 'w4', title: 'اليوم الرابع', location: 'الرياض، قاعة الأثر', starts_at: later(48), ends_at: later(54), cohort: 'دفعة نوفمبر 2026', open: false, qr: true, sheet: false },
];

// «الخادم»: يحكم كما markBatch للمدرب، ويرد للمدرب الاسم والطريقة و«سجّلته أنت» وحدها
async function expert(page, width, { attendance = {}, sessions = SESSIONS } = {}) {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'xp.workshop-mark-bulk') {
      if ((b.present || []).length && !String(b.reason || '').trim()) return route.fulfill({ json: { success: false, code: 'reason_required', message: 'اكتب سبب التسجيل اليدوي' } });
      const out = { success: true, marked: 0, unmarked: 0, already: 0, refused: [] };
      for (const id of b.present || []) { if (attendance[id]) out.already += 1; else { attendance[id] = { method: 'manual', by: 'me' }; out.marked += 1; } }
      for (const id of b.absent || []) {
        const was = attendance[id];
        if (!was) out.already += 1;
        else if (was.method !== 'manual') out.refused.push({ id, code: 'admin_only', message: 'سجّل حضوره بنفسه، وإلغاؤه للإدارة وحدها' });
        else if (was.by !== 'me') out.refused.push({ id, code: 'not_yours', message: 'سجّله غيرك، وإلغاؤه لمن سجّله أو للإدارة' });
        else { delete attendance[id]; out.unmarked += 1; }
      }
      return route.fulfill({ json: out });
    }
    const replies = {
      'xp.dashboard': xpDash,
      'xp.workshops': { success: true, sessions },
      'xp.workshop-qr': { success: true, url: 'https://leaders.sunkvalue.com/?checkin=x', code: '482913', refresh_in: 20, open: true, attended: Object.keys(attendance).length, session: { id: 'w3', title: 'اليوم الثالث', location: 'الرياض، قاعة الأثر', starts_at: later(-1), ends_at: later(5) } },
      'xp.workshop-attendance': { success: true, sheet: sessions.find((s) => s.id === b.id)?.sheet !== false,
        people: NAMES.map((full_name, i) => { const a = attendance[`a${i}`]; return { id: `a${i}`, full_name, attendance: a ? { method: a.method, ...(a.by === 'me' ? { mine: true } : {}) } : null }; }) },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true, items: [] } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  await page.goto(`${APP}x`);
  return calls;
}
const shot = async (page, name) => { if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const bulk = (calls) => calls.filter((c) => c.action === 'xp.workshop-mark-bulk').map(({ session_id, present, absent, reason, unmark_reason }) => ({ session_id, present, absent, reason, unmark_reason }));

for (const width of [1440, 390]) {
  test(`المدرب يسجّل حضور جلسة دفعته من ورقة الحضور بسبب مكتوب وحفظ واحد (${width})`, async ({ page }) => {
    // سارة سجّلت نفسها بالرمز، وخالد سجّلته الإدارة يدويًا
    const attendance = { a0: { method: 'qr' }, a1: { method: 'manual', by: 'admin' } };
    const calls = await expert(page, width, { attendance });
    const card = page.getByRole('region', { name: 'الحضور', exact: true });
    await expect(card.locator('.xpp-attend')).toHaveCount(3);
    // لكل جلسة ما لها: رمز وورقة، ورقة وحدها، رمز وحده
    const day = (t) => card.locator('.xpp-attend', { hasText: t });
    await expect(day('اليوم الثالث').getByRole('button')).toHaveText(['اعرض رمز الحضور', 'ورقة الحضور']);
    await expect(day('اليوم الثاني').getByRole('button')).toHaveText(['ورقة الحضور']);
    await expect(day('اليوم الرابع').getByRole('button')).toHaveText(['اعرض رمز الحضور']);
    expect(await noOverflow(page)).toBe(true);
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'trainer-sessions');

    await day('اليوم الثالث').getByRole('button', { name: 'ورقة الحضور' }).click();
    const sheet = page.getByRole('dialog', { name: 'ورقة الحضور' });
    await expect(sheet.getByRole('heading', { name: 'اليوم الثالث' })).toBeVisible();
    await expect(sheet.locator('.ats-count')).toContainText('2 من 6 حضروا');
    // بلا بريد ولا جهة ولا من سجّل
    await expect(sheet.locator('.ats-list')).not.toContainText('@');
    await expect(sheet.locator('.ats-list')).not.toContainText('سجّله');
    // حضور سجّله صاحبه أو سجّله غيره: مربع مقفل
    const row = (name) => sheet.locator('.ats-row', { hasText: name });
    await expect(row('سارة الأحمد').getByRole('checkbox')).toBeDisabled();
    await expect(row('سارة الأحمد').getByRole('checkbox')).toHaveAttribute('title', 'سجّل حضوره بنفسه، وإلغاؤه للإدارة');
    await expect(row('خالد العتيبي').getByRole('checkbox')).toBeDisabled();
    await expect(row('خالد العتيبي')).toContainText('حاضر · يدوي');
    await shot(page, 'trainer-sheet');

    await sheet.getByRole('button', { name: 'علّم الكل حاضرًا' }).click();
    await expect(sheet.locator('.ats-count')).toContainText('يُسجَّل 4 (لم يُحفظ)');
    // السبب مطلوب للمدرب: بلا سبب لا تأكيد ولا طلب
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    await expect(sheet.getByRole('alert')).toHaveText('اختر سبب التسجيل اليدوي أو اكتبه');
    await expect(sheet.getByTestId('ats-confirm')).toHaveCount(0);
    expect(bulk(calls)).toEqual([]);
    await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('تعطل الرمز');
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    const confirm = sheet.getByTestId('ats-confirm');
    await expect(confirm).toContainText('يُسجَّل يدويًا حضور 4 مشاركين، والسبب: تعطل الرمز.');
    await shot(page, 'trainer-sheet-confirm');
    await confirm.getByRole('button', { name: 'احفظ' }).click();
    await expect(sheet.getByTestId('ats-result')).toHaveText('حُفظ: سُجّل 4');
    expect(bulk(calls)).toEqual([{ session_id: 'w3', present: ['a2', 'a3', 'a4', 'a5'], absent: undefined, reason: 'تعطل الرمز', unmark_reason: undefined }]);
    await expect(sheet.locator('.ats-count')).toContainText('6 من 6 حضروا');
    // ما سجّله هو يقول ذلك ويبقى قابلًا للإلغاء، وغيره مقفل
    await expect(row('نورة القحطاني')).toContainText('سجّلته أنت');
    await expect(row('نورة القحطاني').getByRole('checkbox')).toBeEnabled();
    await expect(row('خالد العتيبي')).not.toContainText('سجّلته أنت');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'trainer-sheet-saved');

    // يلغي ما سجّله هو بلا سبب
    await row('نورة القحطاني').getByRole('checkbox').uncheck();
    await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
    await confirm.getByRole('button', { name: 'احفظ' }).click();
    await expect(sheet.getByTestId('ats-result')).toHaveText('حُفظ: أُلغي 1');
    expect(bulk(calls).at(-1)).toEqual({ session_id: 'w3', present: undefined, absent: ['a2'], reason: undefined, unmark_reason: undefined });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });
}

test('من شاشة الرمز: «تعذّر الرمز؟ سجّل الحضور يدويًا» يفتح ورقة الجلسة نفسها', async ({ page }) => {
  const calls = await expert(page, 390);
  const card = page.getByRole('region', { name: 'الحضور', exact: true });
  await card.locator('.xpp-attend', { hasText: 'اليوم الثالث' }).getByRole('button', { name: 'اعرض رمز الحضور' }).click();
  const screen = page.getByRole('dialog', { name: 'رمز الحضور' });
  await screen.getByRole('button', { name: 'تعذّر الرمز؟ سجّل الحضور يدويًا' }).click();
  await expect(screen).toHaveCount(0);
  const sheet = page.getByRole('dialog', { name: 'ورقة الحضور' });
  await expect(sheet.getByRole('heading', { name: 'اليوم الثالث' })).toBeVisible();
  expect(calls.filter((c) => c.action === 'xp.workshop-attendance').at(-1).id).toBe('w3');
  // جلسة لم تُفتح ورقتها بعد: لا زر يدوي في شاشة رمزها
  await page.keyboard.press('Escape');
  await card.locator('.xpp-attend', { hasText: 'اليوم الرابع' }).getByRole('button', { name: 'اعرض رمز الحضور' }).click();
  await expect(page.getByRole('dialog', { name: 'رمز الحضور' }).getByRole('button', { name: /سجّل الحضور يدويًا/ })).toHaveCount(0);
});

test('خادم أقدم بلا علامتي الرمز والورقة: البوابة كما كانت، رمز بلا ورقة', async ({ page }) => {
  await expert(page, 390, { sessions: SESSIONS.slice(0, 1).map(({ qr: _q, sheet: _s, ...s }) => s) });
  const card = page.getByRole('region', { name: 'رمز الحضور' });
  await expect(card.getByRole('button')).toHaveText(['اعرض رمز الحضور']);
});

test('رفض الخادم (ليست من دفعاتك، أو أُغلقت نافذة الورقة) يظهر برسالته ولا يتغير شيء', async ({ page }) => {
  const calls = await expert(page, 390);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action !== 'xp.workshop-mark-bulk') return route.fallback();
    calls.push(b);
    return route.fulfill({ json: { success: false, code: 'not_assigned', message: 'هذه الجلسة ليست من دفعاتك' } });
  });
  await page.getByRole('region', { name: 'الحضور', exact: true }).locator('.xpp-attend', { hasText: 'اليوم الثاني' }).getByRole('button', { name: 'ورقة الحضور' }).click();
  const sheet = page.getByRole('dialog', { name: 'ورقة الحضور' });
  await sheet.locator('.ats-row', { hasText: 'فهد الشمري' }).getByRole('checkbox').check();
  await sheet.getByLabel('سبب التسجيل اليدوي').selectOption('بلا هاتف');
  await sheet.getByRole('button', { name: 'راجع واحفظ' }).click();
  await sheet.getByTestId('ats-confirm').getByRole('button', { name: 'احفظ' }).click();
  await expect(sheet.getByTestId('ats-result')).toHaveText('هذه الجلسة ليست من دفعاتك');
  await expect(sheet.locator('.ats-count')).toContainText('0 من 6 حضروا');
});
