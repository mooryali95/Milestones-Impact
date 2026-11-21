// الجلسة الجماعية مع المستشار في منصة القادة (تصور تشغيل الدفعة 2026-11-19، المرحلة 5): المستشار يرى جلسته صفًّا واحدًا بعدد مدعويها
// ويسجّل من حضر ومن لم يحضر من ورقتها بالأسماء وحدها، ولا يغيّر ما أكّده غيره. والمشارك يراها في رحلته تحت الاستشارة بعلامتها
// ومستشارها ومكانها، محسوبة من رصيده، بلا أسماء بقية المدعوين. الخلفية مُحاكاة بقواعد الخادم (coaching-groups.ts).
// GROUP_SHOTS: مجلد اللقطات (1440 و390).
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { resolveStages } from '../supabase/functions/leaders-api/journey.js';
import { coachingStatus, journeyProgress } from '../supabase/functions/leaders-api/logic.js';

const APP = 'http://localhost:4304/';
const SHOTS = process.env.GROUP_SHOTS || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });
const later = (h) => new Date(Date.now() + h * 36e5).toISOString();
const shot = async (page, name) => { if (SHOTS) { await page.mouse.move(2, 2); await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); } };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ── المستشار ──
const NAMES = ['سارة العتيبي', 'أسامة الحربي', 'ريم الدوسري', 'هدى المطيري', 'خالد الشمري'];
const REFUSAL = { not_yours: 'أكّده غيرك، وتغييره للإدارة' };
async function expert(page, width) {
  const calls = [];
  // انتهت أمس: خالد أكّدت الإدارة غيابه، والباقون بلا تأكيد. وأخرى قادمة بعد يومين
  const state = { g1: Object.fromEntries(NAMES.map((n, i) => [`a${i}`, { state: i === 4 ? 'no_show' : 'booked', by: i === 4 ? 'admin' : null }])) };
  const groups = () => {
    const n = (s) => Object.values(state.g1).filter((m) => m.state === s).length;
    return [
      { id: 'g2', title: 'جلسة جماعية: التخطيط', starts_at: later(48), ends_at: later(49.5), mode: 'online', location: null, join_url: 'https://meet.example.sa/plan', cohort: 'دفعة نوفمبر 2026', ended: false, count: 3, attended: 0, no_show: 0, excused: 0, pending: 3, awaiting: false, sheet: false },
      { id: 'g1', title: 'جلسة جماعية: التفاوض', starts_at: later(-26), ends_at: later(-24.5), mode: 'in_person', location: 'قاعة الاجتماعات، الدور الثالث', join_url: null, cohort: 'دفعة نوفمبر 2026', ended: true, count: 5, attended: n('attended'), no_show: n('no_show'), excused: n('excused'), pending: n('booked'), awaiting: n('booked') > 0, sheet: true },
    ];
  };
  const dash = () => ({ success: true, features: { hall: false, katon: false, f360: false }, expert: { full_name: 'د. منى القحطاني', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1.5, participants: 4, attended: 1, upcoming: 1, no_show: 1 }, rating: { count: 0, min: 5 },
    requests: [], sessions: [], groups: groups(), criteria: {}, advisor_cohorts: [] });
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'xp.coaching-group') {
      if (b.id === 'g2') return route.fulfill({ json: { success: true, sheet: false, session: { id: 'g2', title: 'جلسة جماعية: التخطيط' }, people: NAMES.slice(0, 3).map((full_name, i) => ({ id: `b${i}`, full_name, state: 'booked' })) } });
      return route.fulfill({ json: { success: true, sheet: true, session: { id: 'g1', title: 'جلسة جماعية: التفاوض' }, people: NAMES.map((full_name, i) => { const m = state.g1[`a${i}`]; return { id: `a${i}`, full_name, state: m.state, ...(m.by === 'admin' && m.state !== 'booked' ? { locked: true } : {}) }; }) } });
    }
    if (b.action === 'xp.coaching-group-mark') {
      const out = { success: true, marked: 0, already: 0, pending: 0, refused: [] };
      for (const m of b.marks) {
        const row = state.g1[m.id];
        if (row.state === m.state) out.already += 1;
        else if (row.by === 'admin' && row.state !== 'booked') out.refused.push({ id: m.id, code: 'not_yours', message: REFUSAL.not_yours });
        else { row.state = m.state; row.by = m.state === 'booked' ? null : 'me'; out.marked += 1; }
      }
      out.pending = Object.values(state.g1).filter((m) => m.state === 'booked').length;
      return route.fulfill({ json: out });
    }
    await route.fulfill({ json: b.action === 'xp.dashboard' ? dash() : b.action === 'xp.workshops' ? { success: true, sessions: [] } : { success: true, items: [] } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  await page.goto(`${APP}x`);
  return calls;
}

for (const width of [1440, 390]) {
  test(`المستشار يرى جلسته الجماعية صفًّا واحدًا ويسجّل حضورها من ورقتها بالأسماء وحدها (${width})`, async ({ page }) => {
    const calls = await expert(page, width);
    const card = page.getByTestId('xp-groups');
    await expect(card.getByRole('heading', { name: 'جلساتك الجماعية' })).toBeVisible();
    await expect(card.locator('.xpp-attend')).toHaveCount(2);
    const g = (t) => card.locator('.xpp-attend', { hasText: t });
    // صف واحد لكل جلسة بعدد مدعويها، لا صف لكل مدعو، ولا اسم مشارك في القائمة
    await expect(g('التفاوض')).toContainText('5 مشاركين');
    await expect(g('التفاوض')).toContainText('تنتظر تأكيد الحضور');
    await expect(g('التفاوض')).toContainText('قاعة الاجتماعات، الدور الثالث');
    await expect(g('التخطيط')).toContainText('عن بعد');
    await expect(g('التخطيط').getByRole('link', { name: 'رابط الجلسة' })).toHaveAttribute('href', 'https://meet.example.sa/plan');
    await expect(card).not.toContainText('سارة العتيبي');
    expect(await noOverflow(page)).toBe(true);
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'expert-groups');

    await g('التفاوض').getByRole('button', { name: 'ورقة الحضور' }).click();
    const sheet = page.getByRole('dialog', { name: 'ورقة حضور الجلسة الجماعية' });
    await expect(sheet.getByRole('heading', { name: 'جلسة جماعية: التفاوض' })).toBeVisible();
    await expect(sheet.locator('.gss-row')).toHaveCount(5);
    // الأسماء وحدها: لا بريد ولا جوال
    await expect(sheet).not.toContainText('@');
    await expect(sheet).not.toContainText('+966');
    // ما أكّدته الإدارة مقفل بسببه
    const khalid = sheet.locator('.gss-row', { hasText: 'خالد الشمري' });
    await expect(khalid.getByRole('radio')).toHaveCount(0);
    await expect(khalid).toContainText('أكّده غيرك، وتغييره للإدارة');
    await expect(khalid.locator('.ats-chip')).toHaveText('لم يحضر');
    await sheet.getByRole('button', { name: 'الكل حضر' }).click();
    await sheet.getByRole('radiogroup', { name: 'حضور هدى المطيري' }).getByRole('radio', { name: 'لم يحضر' }).check();
    await expect(sheet.locator('.ats-count')).toContainText('حضر 3 من 5 · لم يحضر 2');
    expect(await noOverflow(page)).toBe(true);
    await expect(sheet.locator('.ats-foot')).toBeInViewport();
    await shot(page, 'expert-sheet');
    await sheet.getByRole('button', { name: /^احفظ: / }).click();
    await expect(sheet.getByTestId('gss-result')).toContainText('حُفظ: سُجّل 4');
    const marks = calls.filter((c) => c.action === 'xp.coaching-group-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].id).toBe('g1');
    expect(Object.fromEntries(marks[0].marks.map((m) => [m.id, m.state]))).toEqual({ a0: 'attended', a1: 'attended', a2: 'attended', a3: 'no_show' });
    await expect(sheet.getByRole('button', { name: 'لا تغيير للحفظ' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'إغلاق' }).click();
    await expect(sheet).toHaveCount(0);
    // بعد الحفظ: البطاقة من الخادم، ولم تعد تنتظر
    await expect(g('التفاوض')).toContainText('حضر 3');
    await expect(g('التفاوض')).not.toContainText('تنتظر تأكيد الحضور');
    // القادمة: المدعوون للقراءة حتى تُفتح ورقتها
    await g('التخطيط').getByRole('button', { name: 'المدعوون' }).click();
    const read = page.getByRole('dialog', { name: 'ورقة حضور الجلسة الجماعية' });
    await expect(read).toContainText('الورقة للقراءة الآن');
    await expect(read.getByRole('radio')).toHaveCount(0);
  });
}

// ── المشارك ──
const SERVICE = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const S = (key, title_ar, phase, sort, duration_days, duration_label, rules = null) => ({ key, title_ar, phase, sort, duration_days, duration_label, active: true, ...(rules ? { rules } : {}) });
const STAGES = [
  S('profile', 'الملف الشخصي', 'admission', 1, 0, 'دقائق'), S('assessment', 'تحديد المستوى', 'admission', 2, 0, '12 دقيقة'), S('approval', 'اعتماد المستوى', 'admission', 3, 2, 'يوما عمل'),
  S('training', 'التدريب', 'qualification', 4, 14, 'أسبوعان'), S('consulting', 'الاستشارة', 'qualification', 5, 14, 'عند الحاجة', SERVICE),
  S('support', 'الدعم والتمكين', 'impact', 6, 60, 'شهران'),
];
const CFG = { sessions_required: 1, minutes: 90, max_sessions: 2 };
const it = (id, title_ar, status = 'pending', extra = {}) => ({ id, code: id.toUpperCase(), kind: 'reading', title_ar, required: true, status, ...extra });
// صف الجلسة الجماعية كما يحمّله الخادم (decorateGroupRows): عنوانها ومستشارها ومكانها، ولا شيء عن بقية المدعوين
const GROUP_ROW = { id: 'row-1', status: 'booked', kind: 'manual', group_id: 'g1', starts_at: '2026-12-06T07:00:00Z', ends_at: '2026-12-06T08:30:00Z', join_url: null,
  group: { title: 'جلسة جماعية: التفاوض', with: 'د. منى القحطاني', mode: 'in_person', location: 'قاعة الاجتماعات، الدور الثالث' } };
const journeyOf = (sessions) => {
  const act = { ...coachingStatus(CFG, sessions, Date.parse('2026-11-25T10:00:00Z')), book_url: 'https://cal.com/coach/consult', provider: 'calcom', instant: false, mode: 'online', location: null };
  const I = {
    profile: [it('p1', 'بيانات الملف', 'done')], assessment: [it('a1', 'إرسال القياس', 'done')], approval: [it('ap', 'اعتماد مسارك', 'done')],
    training: [it('t1', 'قراءة كتابك الشخصي', 'done'), it('t2', 'تسمية مبادرتك')],
    consulting: [it('c-meet', 'لقاء استشاري مع خبير', 'pending', { kind: 'coaching', required: false, activity: act })], support: [it('s1', 'تقرير الأثر')],
  };
  return resolveStages(STAGES.map((s) => ({ ...s, items: I[s.key], done: I[s.key].filter((x) => x.status === 'done').length, total: I[s.key].length })), { cohortStart: '2026-11-04', today: '2026-11-25' });
};
async function participant(page, journey) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.clock.setFixedTime(new Date('2026-11-25T10:00:00Z'));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    await route.fulfill({ json: b.action === 'me' ? { ...r, journey, progress: journeyProgress(journey), milestones: [], milestone_summary: { done: 0, total: 0, late: 0 }, cohort: { name: 'دفعة نوفمبر 2026', starts_on: '2026-11-04', ends_on: '2027-03-31', schedule: {} } } : r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 'tok-grp-00000000000000000000000'); localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true'); });
  await page.goto(APP);
}

for (const width of [1440, 390]) {
  test(`المشارك يرى جلسته الجماعية تحت الاستشارة بعلامتها ومستشارها ومكانها، ومن رصيده (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await participant(page, journeyOf([GROUP_ROW]));
    const shelf = page.getByTestId('services');
    await expect(shelf).toContainText('متاحة لك حتى نهاية رحلتك، حجزت 1 من جلستين');
    await shelf.locator('#stage-consulting .stage-top').click();
    const row = shelf.locator('.act-session');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('group-session')).toHaveText('جلسة جماعية مع د. منى القحطاني');
    await expect(row).toContainText('المكان: قاعة الاجتماعات، الدور الثالث');
    await expect(row).toContainText('محجوزة');
    await expect(row.getByRole('button', { name: 'أضف إلى تقويمي' })).toBeVisible();
    // تأخذ جلسة من رصيده، ويبقى له حجز واحد
    await expect(shelf.getByTestId('sessions-max')).toHaveText('حجزت 1 من جلستين متاحتين لك.');
    await expect(shelf.getByRole('button', { name: 'احجز موعدًا' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await row.scrollIntoViewIfNeeded();
    await shelf.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
    await shot(page, 'participant-journey');
  });
}

test('جلسة جماعية خارج الرصيد: تظهر للمشارك ولا تأخذ من رصيده', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await participant(page, journeyOf([{ ...GROUP_ROW, off_allowance: true, join_url: 'https://meet.example.sa/g', group: { title: 'جلسة جماعية', with: null, mode: 'online', location: null } }]));
  const shelf = page.getByTestId('services');
  await expect(shelf).toContainText('لم تحجز بعد من جلستين');
  await shelf.locator('#stage-consulting .stage-top').click();
  await expect(shelf.locator('.act-session').getByTestId('group-session')).toHaveText('جلسة جماعية');
  await expect(shelf.locator('.act-session')).toContainText('لا تُحسب من رصيدك');
  await expect(shelf.getByTestId('sessions-max')).toHaveText('لم تحجز بعد من جلستين متاحتين لك.');
});
