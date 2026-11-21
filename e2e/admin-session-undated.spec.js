// الرحلة J1: المالك يحفظ «تدريب يومان عن بعد، الموعد والرابط لاحقًا» من لوحة الإدارة، ويراه المشارك صحيحًا:
// «يُحدد لاحقًا» و«يصلك الرابط قبل الجلسة»، بلا تاريخ 1970 ولا «قادمة» ولا زر تقويم. الخلفية مُحاكاة، وحالة المشارك
// تُحسب من الصف الذي أرسلته اللوحة نفسه بدالة الخادم (workshopStatus)، فالطرفان مصدر واحد.
import { test, expect } from '@playwright/test';
import { workshopSchedule, workshopStatus } from '../supabase/functions/leaders-api/logic.js';

const ADMIN = 'http://localhost:4303/';
const APP = 'http://localhost:4304/';
const SHOTS = process.env.SHOTS_DIR;
const COHORT = '11111111-1111-1111-1111-111111111111';
test.use({ deviceScaleFactor: 2 });

const activities = (workshops) => ({
  success: true, coaching: [], programs: [{ id: 'pa', name: 'برنامج القادة' }],
  cohorts: [{ id: COHORT, name: 'دفعة نوفمبر', program_id: 'pa', status: 'running' }],
  requirements: [{ id: 'r1', program_id: 'pa', kind: 'workshop', code: 'T-ATTEND', title_ar: 'حضور اليومين التدريبيين', config: { verify: 'join', sessions_required: 2 } }],
  workshops,
});

async function adminCreates(page, width) {
  await page.setViewportSize({ width, height: 900 });
  const calls = [];
  let saved = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.workshop-save') {
      // كما في الخادم: workshopSchedule يقبل الفراغ، فيُحفظ الصف «يُحدد لاحقًا»
      const when = workshopSchedule(b.row);
      if (when.error) return route.fulfill({ json: { success: false, message: when.error } });
      saved = [{ id: 'w9', requirement_id: b.row.requirement_id, cohort_id: b.row.cohort_id, title_ar: b.row.title_ar, mode: b.row.mode, location_ar: null, ...when, active: true, attended: 0, invited_at: null }];
      return route.fulfill({ json: { success: true, id: 'w9' } });
    }
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
      'admin.activities': activities(saved),
    };
    return route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(`${ADMIN}#/leaders/activities`);
  await page.reload();
  await page.getByRole('button', { name: '+ موعد' }).click();
  const form = page.getByRole('dialog', { name: 'موعد جديد' });
  // وسم الورشة اختيار صريح بلا قيمة مسبقة (قرار المالك 2026-11-21): النموذج لا يُحفظ قبله
  await form.getByRole('radio', { name: /^إلزامية/ }).check();
  await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('تدريب يومان عن بعد');
  await form.getByLabel('الطريقة').selectOption('online');
  await expect(form.getByText('اختياري: اتركه فارغًا ليُضاف لاحقًا', { exact: false })).toBeVisible();
  await expect(form.getByText('اختياري: اترك البدء والانتهاء فارغين', { exact: false })).toBeVisible();
  if (SHOTS) await form.screenshot({ path: `${SHOTS}/admin-form-${width}.png` });
  // الجزئي يُرفض برسالة صحيحة، لا «وقت الانتهاء بعد وقت البدء» والحقل فارغ
  await form.getByLabel('تبدأ').fill('2026-12-01T09:00');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form.getByRole('alert')).toHaveText('حدد وقتي البدء والانتهاء معًا، أو اتركهما فارغين ليُحدد الموعد لاحقًا');
  await form.getByLabel('تبدأ').fill('');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form).toHaveCount(0);
  const row = calls.find((c) => c.action === 'admin.workshop-save' && !c.row.starts_at)?.row;
  expect(row).toMatchObject({ requirement_id: 'r1', cohort_id: COHORT, mode: 'online', join_url: null, starts_at: null, ends_at: null });
  // في الجدول: «يُحدد لاحقًا» و«الرابط لاحقًا»، ولا دعوة قبل الموعد، ولا رمز QR لنشاط تحققه بالانضمام
  const table = page.locator('.la-table');
  await expect(table.getByText('يُحدد لاحقًا')).toBeVisible();
  await expect(table.getByText('عن بعد · الرابط لاحقًا')).toBeVisible();
  await expect(table.getByText('الدعوة بعد تحديد الموعد')).toBeVisible();
  await expect(page.getByRole('button', { name: 'أرسل الدعوة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اعرض رمز الحضور' })).toHaveCount(0);
  await expect(page.locator('.la-body')).not.toContainText('1970');
  if (SHOTS) await page.locator('.la-body').screenshot({ path: `${SHOTS}/admin-list-${width}.png` });
  return saved;
}

async function participantSees(page, sessions, width) {
  await page.setViewportSize({ width, height: 1100 });
  const activity = workshopStatus({ verify: 'join', sessions_required: 2 }, sessions, new Set());
  const items = [{ id: 'r1', code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور اليومين التدريبيين', required: true, status: 'pending', activity }];
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled' },
    profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
    journey: [
      { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
      { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
      { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', mode: 'online', duration_label: 'يومان تدريبيان', items, done: 0, total: 1 },
    ],
    progress: 20, passkeys: 1, prompt_passkey: false,
  };
  await page.route(/functions\/v1\/leaders-api/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = { me, certificate: { success: true, certificate: null } };
    return route.fulfill({ json: r[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto(APP);
  const card = page.locator('[data-tour="next-session"]');
  await expect(card).toContainText('لك جلسة سيُعلن موعدها');
  // العنوان يقول إن الموعد يُعلن لاحقًا، فلا يُكرر في السطر
  await expect(card).not.toContainText('الموعد يُحدد لاحقًا');
  await expect(card).toContainText('عن بعد · يصلك الرابط قبل الجلسة');
  await expect(card.getByRole('button', { name: 'أضفها إلى تقويمك' })).toHaveCount(0);
  const stage = page.locator('.stage.active');
  await expect(stage.locator('.act-session')).toContainText('يُحدد لاحقًا');
  await expect(stage.locator('.act-session')).toContainText('يصلك الرابط قبل الجلسة');
  await expect(stage.locator('.act-session')).not.toContainText('قادمة');
  await expect(page.getByRole('button', { name: 'أضف إلى تقويمي' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'انضم الآن' })).toHaveCount(0);
  // لا «انضم إلى الجلسة من هنا» بلا زر ولا رابط
  await expect(stage).not.toContainText('انضم إلى الجلسة من هنا');
  await expect(stage).toContainText('يظهر زر الانضمام هنا حين يُضاف رابط الجلسة');
  await expect(page.locator('body')).not.toContainText('1970');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  if (SHOTS) {
    await card.screenshot({ path: `${SHOTS}/participant-next-${width}.png` });
    await stage.screenshot({ path: `${SHOTS}/participant-stage-${width}.png` });
  }
}

for (const width of [1440, 390]) {
  test(`J1 بعرض ${width}: الأدمن يحفظ جلسة عن بعد بلا رابط ولا موعد، والمشارك يرى «يُحدد لاحقًا»`, async ({ browser }) => {
    const admin = await browser.newPage({ deviceScaleFactor: 2 });
    const saved = await adminCreates(admin, width);
    await admin.close();
    expect(saved).toHaveLength(1);
    const user = await browser.newPage({ deviceScaleFactor: 2 });
    await participantSees(user, saved, width);
    await user.close();
  });
}
