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
    ...(admin ? { attendance: { rounds: 3, need: 2, eligible: 31, total: 50, workshop: { id: 'w1', title: 'اليوم التدريبي الأول' } } } : {}),
  };
}

test('المشارك: يرى رقم طاولته وفريقه وزملاء طاولته، وخمسون مشاركًا في قائمة الفرق بطاولاتهم', async ({ page }) => {
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
  // على الجوال: الفرق قائمةً مقروءة بأسمائها وطاولاتها (HallTeams)
  await page.locator('details.hall-mini summary').click();
  await expect(page.locator('.ht-p')).toHaveCount(50);
  await expect(page.locator('.ht')).toContainText('طاولة 9');
});

test('الخبير: شاشة العرض آمنة قبل الكشف، وإعادة التقسيم والرجوع مرحلة بتأكيد، والمشاركون بالبحث والتصفية', async ({ page }) => {
  const calls = [];
  let isClosed = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b.action);
    const replies = {
      'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 50, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر 2026' }] },
      'xp.participants': { success: true, items: [], cohorts: [] }, 'xp.reviews': { success: true, advisor: true, items: [] }, 'xp.peer-list': { success: true, advisor: true, cohorts: [], items: [], pending: 0 },
    };
    const closed = { success: true, session: null, topics: [], workshops: [], attendance: { written: 31, eligible: 31, rounds: 3, workshop: 'اليوم التدريبي الأول', reason: null } };
    // بعد الإغلاق يرد السؤال الدوري بقاعة مغلقة كما يفعل الخادم، لا بالقاعة المفتوحة
    if (b.action === 'xp.hall-close') isClosed = true;
    const state = isClosed ? { success: true, session: null, topics: [], workshops: [] } : hall({ admin: true });
    await route.fulfill({ json: replies[b.action] || (b.action === 'xp.hall-close' ? closed : b.action.startsWith('xp.hall') ? state : { success: true, items: [] }) });
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

  // الحضور: معاينة قبل الإغلاق، ثم نتيجة الكتابة تُقال للخبير عند الإغلاق
  await expect(region).toContainText('لو أُغلقت الآن: حضور 31 من 50 في «اليوم التدريبي الأول»');
  page.once('dialog', (d) => d.accept('إغلاق'));
  await region.getByRole('button', { name: 'إغلاق القاعة' }).click();
  await expect(page.getByText('كُتب حضور 31 مشاركًا في «اليوم التدريبي الأول»')).toBeVisible();
  await expect(region).toContainText('لا قاعة مفتوحة لهذه الدفعة');
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

test('المشارك: بطاقة «جلستك» في رحلته بموعدها ومكانها، وفي نافذتها تفتح القاعة، وملف التقويم يُنزَّل', async ({ page }) => {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  let open = false;
  const start = () => new Date(Date.now() + (open ? -10 : 26 * 60) * 60_000).toISOString();
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const r = srv.reply(b);
    if (b.action === 'me') {
      r.journey.find((st) => st.key === 'training').items.push({ id: 'w1', code: 'T-DAYS', kind: 'workshop', title_ar: 'الأيام التدريبية', required: true, status: 'pending',
        activity: { type: 'workshop', done: false, count: 0, total: 1, verify: 'qr', sessions: [{ id: 's1', title: 'اليوم التدريبي الأول', mode: 'in_person', location: 'قاعة التدريب', starts_at: start(), ends_at: new Date(Date.parse(start()) + 4 * 3600_000).toISOString(), attended: false, open, can_join: false }] } });
    }
    await route.fulfill({ json: r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  const card = page.locator('.j-session');
  await expect(card).toContainText('جلستك القادمة');
  await expect(card).toContainText('اليوم التدريبي الأول');
  await expect(card).toContainText('قاعة التدريب');
  await expect(card.getByRole('button', { name: 'ادخل القاعة' })).toHaveCount(0);
  const dl = page.waitForEvent('download');
  await card.getByRole('button', { name: 'أضفها إلى تقويمك' }).click();
  expect((await dl).suggestedFilename()).toBe('session.ics');
  // في نافذة الجلسة: البطاقة أول ما يُرى، وزرها يفتح القاعة
  open = true;
  await page.reload();
  await expect(card).toContainText('جلستك الآن');
  await card.getByRole('button', { name: 'ادخل القاعة' }).click();
  await expect(page.getByRole('heading', { name: 'القاعة', exact: true })).toBeVisible();
});

test('الخبير: خمسون مشاركًا في قائمته بمن ينتظره أولًا، وبحث وتصفية وعرض مختصر، ونص الجملة في قائمة الاختيار', async ({ page }) => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: `${NAMES[i % NAMES.length]} ${i}`, first: NAMES[i % NAMES.length], title: 'مدير مشروع', org: i % 2 ? 'وزارة التجربة' : 'هيئة المثال', status: 'enrolled', cohort: 'نوفمبر', advisor: true, role_ar: null, level: 'intermediate', level_ar: 'متوسط', approved: true, stage: 'التدريب', progress: 20, late: 0, continuous: 60, needs: i === 37 ? 5 : i === 41 ? 2 : 0 }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const h = hall({ admin: true });
    h.sentences = [{ id: 'k1', sort: 1, question: 'why', text_ar: 'المشروع الذي سلّم مخرجاته في موعدها مشروع ناجح بالضرورة.' }];
    const replies = {
      'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 50, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر 2026' }] },
      'xp.participants': { success: true, items, cohorts: [] }, 'xp.reviews': { success: true, advisor: true, items: [] }, 'xp.peer-list': { success: true, advisor: true, cohorts: [], items: [], pending: 0 },
    };
    await route.fulfill({ json: replies[b.action] || (b.action.startsWith('xp.hall') ? h : { success: true, items: [] }) });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}x`);
  const mine = page.getByRole('region', { name: /مشاركوك/ });
  const people = mine.locator('.xpp-person');
  // عرض مختصر، ومن ينتظر الخبير في أوله بالأكثر انتظارًا
  await expect(people).toHaveCount(12);
  await expect(people.nth(0)).toContainText('5 بانتظارك');
  await expect(people.nth(1)).toContainText('2 بانتظارك');
  await mine.getByRole('button', { name: 'بانتظارك 2' }).click();
  await expect(people).toHaveCount(2);
  await mine.getByRole('button', { name: 'بانتظارك 2' }).click();
  await mine.getByLabel('ابحث في مشاركيك').fill('هند');
  await expect(people).toHaveCount(5);
  await mine.getByLabel('ابحث في مشاركيك').fill('');
  await mine.getByRole('button', { name: 'اعرض الكل (50)' }).click();
  await expect(people).toHaveCount(50);
  // قائمة الجملة تحمل نصها
  await expect(page.getByRole('region', { name: 'القاعة الحية' }).getByLabel('الجملة المعروضة').locator('option').nth(1)).toContainText('المشروع الذي سلّم مخرجاته');
});

test('المشارك: دخول القاعة يُعاد وحده عند خطأ عابر من البوابة، ولا تظهر رسالة البوابة الإنجليزية', async ({ page }) => {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  let joins = 0, inside = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'hall.join') {
      joins += 1;
      if (joins === 1) return route.fulfill({ status: 500, json: { message: 'Request failed due to an internal server error' } });
      inside = true;
    }
    if (b.action === 'hall.join' || b.action === 'hall.state') return route.fulfill({ json: { ...hall({ stage: 'enter' }), me: 'p7', inside } });
    return route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-hall"]').locator('visible=true').first().click();
  await page.getByRole('button', { name: 'ادخل القاعة' }).click();
  await expect(page.locator('.hall-me')).toContainText('أنت في القاعة');
  expect(joins).toBe(2);
  await expect(page.getByText('internal server error')).toHaveCount(0);
});

// سؤال دوري أُرسل قبل اكتمال الإغلاق ويرد بعده يحمل القاعة مفتوحة: يُهمل ولا يعيدها مفتوحة (التُقط في CI، 2026-11-11)
test('الخبير: سؤال دوري متزامن مع الإغلاق لا يعيد القاعة مفتوحة', async ({ page }) => {
  let closed = false;
  let inflight = 0;
  let staleServed = 0;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'xp.dashboard': { success: true, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 1, participants: 50, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [{ id: 'c1', name: 'دفعة نوفمبر 2026' }] },
      'xp.participants': { success: true, items: [], cohorts: [] }, 'xp.reviews': { success: true, advisor: true, items: [] }, 'xp.peer-list': { success: true, advisor: true, cohorts: [], items: [], pending: 0 },
    };
    if (b.action === 'xp.hall-close') {
      closed = true;
      return route.fulfill({ json: { success: true, session: null, topics: [], workshops: [], attendance: { written: 31, eligible: 31, rounds: 3, workshop: 'اليوم التدريبي الأول', reason: null } } });
    }
    if (b.action === 'xp.hall') {
      // ما سُئل قبل الإغلاق يُجاب متأخرًا بحالته القديمة (مفتوحة)، وما بعده مغلقًا
      if (closed) return route.fulfill({ json: { success: true, session: null, topics: [], workshops: [] } });
      inflight += 1;
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ json: hall({ admin: true }) });
      inflight -= 1;
      if (closed) staleServed += 1;
      return undefined;
    }
    return route.fulfill({ json: replies[b.action] || { success: true, items: [] } });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_expert_session', 'x'.repeat(40)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${APP}x`);
  const region = page.getByRole('region', { name: 'القاعة الحية' });
  await expect(region).toContainText('رمز الدخول', { timeout: 10_000 });
  // أغلق والسؤال الدوري التالي في الطريق
  await expect.poll(() => inflight, { timeout: 5000 }).toBeGreaterThan(0);
  page.once('dialog', (d) => d.accept('إغلاق'));
  await region.getByRole('button', { name: 'إغلاق القاعة' }).click();
  await expect(region).toContainText('لا قاعة مفتوحة لهذه الدفعة');
  // من لحظة الإغلاق: هل عادت القاعة مفتوحة ولو لحظة؟ (السؤال التالي يصلحها بعد ثانيتين، فالفحص بالمراقبة لا بالانتظار)
  await page.evaluate(() => {
    window.__reopened = false;
    const el = document.getElementById('xp-hall').closest('section');
    new MutationObserver(() => { if (el.textContent.includes('رمز الدخول')) window.__reopened = true; }).observe(el, { childList: true, subtree: true, characterData: true });
  });
  // الرد القديم وصل بعد الإغلاق
  await expect.poll(() => staleServed, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__reopened)).toBe(false);
  await expect(region).toContainText('لا قاعة مفتوحة لهذه الدفعة');
});
