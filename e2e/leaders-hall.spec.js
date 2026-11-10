// القاعة بخمسين مشاركًا: المشارك يرى طاولته وزملاءها، والخبير يدير الجلسة من بوابته:
// شاشة العرض لا تكشف الأحكام قبل الكشف، وإعادة التقسيم والرجوع مرحلة يُؤكَّدان، وقائمة المشاركين تُبحث وتُصفّى. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const NAMES = ['سارة', 'خالد', 'نورة', 'فهد', 'ريم', 'عبدالله', 'هند', 'ماجد', 'لمى', 'سلطان'];
const TEAMS = ['support', 'guide', 'eval'];
const BASE_TABLE = { support: 2, guide: 5, eval: 8 };

function hall({ stage = 'round', admin = false } = {}) {
  const split = ['split', 'round', 'reveal'].includes(stage);
  const people = Array.from({ length: 50 }, (_, i) => {
    const team = !split ? null : i < 6 ? 'lead' : TEAMS[i % 3];
    const table = !team ? null : team === 'lead' ? 1 : BASE_TABLE[team] + (Math.floor(i / 3) % (team === 'eval' ? 2 : 3));
    const answered = i % 3 !== 0;
    return { id: `p${i}`, name: `${NAMES[i % NAMES.length]}${admin ? ` ${i}` : ''}`, team, table, persona: false, leader: i === 0, joined: true, present: i % 9 !== 0, hand: i % 11 === 0,
      answered, choice: admin && answered ? (i % 2 ? 'true' : 'false') : null, confidence: admin && answered ? 2 : null, stances: [], points: null };
  });
  const nos = [...new Set(people.map((p) => p.table).filter(Boolean))].sort((a, b) => a - b);
  return {
    success: true, cohort: { id: 'c1', name: 'دفعة نوفمبر 2026' }, topic: { id: 't1', title_ar: 'الأثر قبل المخرجات' }, revealed: false, answered: people.filter((p) => p.answered).length, total: 50,
    session: { id: 's1', mode: 'live', stage, round: 2, version: 3, split_method: 'mixed', ...(admin ? { code: '4821' } : {}) },
    sentence: stage === 'round' ? { id: 'k1', sort: 1, question: 'why', text_ar: 'المشروع الذي سلّم مخرجاته في موعدها مشروع ناجح بالضرورة.', tasks: {} } : null,
    sentences: [{ id: 'k1', sort: 1, question: 'why' }], topics: [{ id: 't1', title_ar: 'الأثر قبل المخرجات', status: 'published' }],
    people, tables: nos.map((no) => ({ no, team: people.find((p) => p.table === no).team, count: people.filter((p) => p.table === no).length })),
    teams: Object.fromEntries(['support', 'lead', 'guide', 'eval'].map((t) => [t, { count: people.filter((p) => p.team === t).length, present: people.filter((p) => p.team === t && p.present).length, score: null }])),
    distribution: admin ? { true1: 0, true2: 17, true3: 0, false1: 0, false2: 16, false3: 0, none: 0 } : null,
  };
}

test('المشارك: يرى رقم طاولته وفريقه وزملاء طاولته، وخمسون مشاركًا مرسومون في المنظور', async ({ page }) => {
  // مشارك معتمد المسار من خادم المحاكاة المشترك مع تسجيل الفيديو، والقاعة وحدها من هنا
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: b.action === 'hall.state' ? { ...hall(), me: 'p7', inside: true } : srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-hall"]').locator('visible=true').first().click();
  const mine = page.locator('.hall-me');
  await expect(mine).toContainText('فريق التوجيه');
  await expect(mine).toContainText('طاولة 7');
  await expect(mine).toContainText('معك:');
  await page.locator('details.hall-mini summary').click();
  await expect(page.locator('.hv g[role="img"]')).toHaveCount(50);
  await expect(page.locator('.hv')).toContainText('طاولة 9');
});

test('الخبير: شاشة العرض آمنة قبل الكشف، وإعادة التقسيم والرجوع مرحلة بتأكيد، والمشاركون بالبحث والتصفية', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    const replies = {
      'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 50, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر 2026' }] },
      'xp.participants': { success: true, items: [], cohorts: [] }, 'xp.reviews': { success: true, advisor: true, items: [] }, 'xp.peer-list': { success: true, advisor: true, cohorts: [], items: [], pending: 0 },
    };
    await route.fulfill({ json: replies[b.action] || (b.action.startsWith('xp.hall') ? hall({ admin: true }) : { success: true, items: [] }) });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}x`);
  const region = page.getByRole('region', { name: 'القاعة الحية' });
  await expect(region).toContainText('رمز الدخول');
  // شاشة العرض: خمسون مرسومون، ولا حكم لأحد في تسميته ولا شريط توزيع، والخبير يقرأ العدّ في سطر له وحده
  await expect(region.locator('.hall-screen g[role="button"]')).toHaveCount(50);
  await expect(region.locator('.hall-screen [aria-label*="حكمه"]')).toHaveCount(0);
  await expect(region.locator('.hall-screen')).not.toContainText('✓ 17');
  await expect(region).toContainText('لك وحدك قبل الكشف: أجاب 33 من 50 · صحيحة 17 · خاطئة 16');
  // القاعة قبل قائمة المشاركين في الصفحة
  expect(await page.evaluate(() => document.querySelector('#xp-hall').getBoundingClientRect().top < document.querySelector('.xpp-cols').getBoundingClientRect().top)).toBe(true);

  // إعادة التقسيم: رفض التأكيد لا يرسل شيئًا، وقبوله يرسل
  page.once('dialog', (d) => { expect(d.message()).toContain('يعيد توزيعهم'); d.dismiss(); });
  await region.getByRole('button', { name: 'آلي متنوع المستويات' }).click();
  expect(calls).not.toContain('xp.hall-split');
  page.once('dialog', (d) => d.accept());
  await region.getByRole('button', { name: 'آلي متنوع المستويات' }).click();
  await expect.poll(() => calls.includes('xp.hall-split')).toBe(true);
  // الرجوع من الجولة إلى الدخول بتأكيد
  page.once('dialog', (d) => { expect(d.message()).toContain('ترجع القاعة'); d.dismiss(); });
  await region.getByRole('button', { name: /الدخول/ }).click();
  expect(calls).not.toContain('xp.hall-step');

  // قائمة المشاركين: بحث بالاسم، وتصفية من رفعوا أيديهم، وفتح مشارك منها
  const list = region.getByRole('region', { name: 'المشاركون في القاعة' });
  await expect(list.locator('.hall-row')).toHaveCount(50);
  await list.getByLabel('ابحث باسم المشارك').fill('هند');
  await expect(list.locator('.hall-row')).toHaveCount(5);
  await list.getByLabel('ابحث باسم المشارك').fill('');
  await list.getByRole('button', { name: /رفعوا أيديهم/ }).click();
  await expect(list.locator('.hall-row')).toHaveCount(5);
  await list.locator('.hall-row').first().click();
  await expect(region.locator('.hall-person')).toContainText('طاولة');
});

test('المشارك: مؤقت الجولة يعدّ من وقت الخادم، والإجابة تُؤكَّد، وما لم يصل يُعاد إرساله وحده', async ({ page }) => {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const sent = [];
  let fail = true, answered = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'katon.answer') {
      sent.push(b);
      if (fail) return route.fulfill({ status: 503, body: '' });
      answered = true;
      return route.fulfill({ json: { success: true } });
    }
    if (b.action !== 'hall.state') return route.fulfill({ json: srv.reply(b) });
    const h = hall();
    // ساعة الخادم متأخرة ساعة عن ساعة الجهاز: العدّ يتبع الخادم لا الجهاز
    const now = Date.now() - 3600_000;
    h.now = new Date(now).toISOString();
    h.session.ends_at = new Date(now + 75_000).toISOString();
    h.session.version = answered ? 4 : 3;
    h.people.find((p) => p.id === 'p7').answered = answered;
    if (answered) Object.assign(h.people.find((p) => p.id === 'p7'), { choice: 'false', confidence: 2 });
    return route.fulfill({ json: { ...h, me: 'p7', inside: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-hall"]').locator('visible=true').first().click();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/^1:1\d$/);
  // الخادم مشغول: الإجابة تُحفظ ويُقال ذلك، ولا رسالة خطأ
  await page.getByRole('radio', { name: 'خاطئة' }).click();
  await page.getByRole('radio', { name: /واثق/ }).click();
  const receipt = page.locator('.hall-receipt');
  await expect(receipt).toContainText('محفوظة على جهازك');
  // يعود الخادم: التحديث التالي يعيد الإرسال بلا ضغطة من المشارك
  fail = false;
  await expect(receipt).toContainText('استُلمت إجابتك', { timeout: 15_000 });
  expect(sent.at(-1)).toMatchObject({ sentence_id: 'k1', verdict: 'false', confidence: 2 });
  expect(await page.evaluate(() => localStorage.getItem('mi_leaders_hall_pending'))).toBeNull();
});
