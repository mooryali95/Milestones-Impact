// تدقيق الجاهزية 2026-11-11، مجموعة «مبادرة المشارك والاستشارات وتقييم الخبير»: ما يراه المشارك في
// وثيقة مبادرته ومتابعتها وطلبات الاستشارة والقياس البعدي. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const RUBRIC = ['الاتساق الاستراتيجي', 'واقعية التخطيط', 'القيمة والدليل', 'الحوكمة والملكية', 'المخاطر والتغيير', 'النضج القيادي'];
const sections = [
  { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' },
  { id: 'm-wbs', key: 'wbs', title: 'هيكل تجزئة العمل', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'draft' },
];
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};
const capstone = (over = {}) => ({
  success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate',
  track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' },
  sections, checks: [], readiness: 100, ready_min: 80, card: { state: 'approved', sla: 'يومي عمل' }, can_submit: true, blocker: null,
  rubric: RUBRIC.map((title, i) => ({ key: `k${i}`, title, anchors: ['1', '2', '3', '4'] })),
  ...over,
  capstone: { status: 'draft', status_title: 'قيد البناء', summary: '', ...over.capstone },
});

// خادم مُحاكى: replies يحدد رد كل فعل (قيمة أو دالة على الطلب)، وcalls يسجل كل طلب بترتيبه
async function open(page, replies) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    calls.push(b);
    const base = { me, 'capstone.get': capstone(), 'capstone.summary': { success: true }, certificate: { success: true, certificate: null } };
    const x = { ...base, ...replies }[b.action];
    const json = typeof x === 'function' ? await x(b) : x;
    await r.fulfill({ json: json ?? { success: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-initiative-000000000000000'); });
  await page.goto(APP);
  return calls;
}
const toCapstone = (page) => page.getByRole('button', { name: 'مبادرتي' }).first().click();

// p-capstone-2: قبول ← رفض الراعي ← إعادة تسليم ← إعادة من المستشار. كانت الواجهة تختار فرع الراعي متى بقي
// «طلب تعديلًا» في السجل، فتخفي ملاحظة المستشار الجديدة وملاحظاته على كل بُعد
test('الوثيقة المعادة تعرض ملاحظات من أعادها آخر مرة، لا رفض راعٍ قديمًا', async ({ page }) => {
  const returned = (review, sponsorAt) => capstone({ capstone: { status: 'returned', status_title: 'أُعيد للتحسين',
    review: { note: 'ملاحظة المستشار الجديدة: اربط المنافع بمؤشرات', notes: { k2: 'المؤشر الثاني بلا خط أساس' }, reviewed_at: review },
    sponsor: { status: 'declined', at: sponsorAt, note: 'ملاحظة الراعي القديمة: قلّص النطاق' } } });
  let reply = returned('2026-11-06T09:00:00Z', '2026-11-03T09:00:00Z');
  await open(page, { 'capstone.get': () => reply });
  await toCapstone(page);
  await expect(page.getByRole('heading', { name: 'ملاحظات المستشار' })).toBeVisible();
  await expect(page.getByText('ملاحظة المستشار الجديدة: اربط المنافع بمؤشرات')).toBeVisible();
  await expect(page.getByText('المؤشر الثاني بلا خط أساس')).toBeVisible();
  await expect(page.getByText('ملاحظة الراعي القديمة: قلّص النطاق')).toHaveCount(0);

  // والعكس: رفض الراعي بعد قبول المستشار يعرض ملاحظة الراعي
  reply = returned('2026-11-01T09:00:00Z', '2026-11-03T09:00:00Z');
  await page.reload();
  await toCapstone(page);
  await expect(page.getByRole('heading', { name: 'ملاحظات راعي المبادرة' })).toBeVisible();
  await expect(page.getByText('ملاحظة الراعي القديمة: قلّص النطاق')).toBeVisible();
});

// p-capstone-3: الصفحة تبقى قائمة خلف الفصل المفتوح فلا يدفع حارس المغادرة الحفظ، ثم تُحمَّل عند الرجوع فتستبدل الملخص
const MODEL = { success: true, initiative: 'رقمنة خدمات المستفيدين', capstone: { locked: false }, submission: null,
  model: { id: 'm-wbs', key: 'wbs', title_ar: 'هيكل تجزئة العمل', dimension: 'milestone', min_level: 'beginner', points: 10, summary_ar: '', fields: [] } };
test('الملخص التنفيذي يُحفظ قبل فتح فصل، ويبقى بعد الرجوع', async ({ page }) => {
  let saved = '';
  const calls = await open(page, {
    'capstone.get': () => capstone({ capstone: { summary: saved } }),
    'capstone.summary': (b) => { saved = b.summary; return { success: true }; },
    'models.get': MODEL,
  });
  await toCapstone(page);
  const box = page.getByRole('textbox', { name: 'الملخص التنفيذي' });
  await box.fill('المشكلة: انتظار المستفيد عشرة أيام. الحل: خدمة رقمية.');
  await page.getByRole('button', { name: /هيكل تجزئة العمل/ }).click();
  await page.getByRole('button', { name: '→ وثيقة مبادرتك' }).click();
  await expect(box).toHaveValue('المشكلة: انتظار المستفيد عشرة أيام. الحل: خدمة رقمية.');
  const order = calls.map((c) => c.action);
  expect(order.indexOf('capstone.summary')).toBeGreaterThan(-1);
  expect(order.indexOf('capstone.summary')).toBeLessThan(order.indexOf('models.get'));
});

test('تعذّر حفظ الملخص: لا يُفتح الفصل ويبقى النص برسالة', async ({ page }) => {
  await open(page, { 'capstone.summary': { success: false, message: 'تعذّر الاتصال' }, 'models.get': MODEL });
  await toCapstone(page);
  const box = page.getByRole('textbox', { name: 'الملخص التنفيذي' });
  await box.fill('نص لم يُحفظ بعد');
  await page.getByRole('button', { name: /هيكل تجزئة العمل/ }).click();
  await expect(page.getByText('لم يُحفظ الملخص التنفيذي، فبقيت في الصفحة حتى لا يضيع: تعذّر الاتصال')).toBeVisible();
  await expect(box).toHaveValue('نص لم يُحفظ بعد');
});

// متابعة الشهر: حفظها بزر (ومراجعة الأثر ترسل إلى الراعي) فلا تُحفظ آليًا، وكانت مغادرة الشاشة تُسقط النموذج كله
function tracking() {
  const current = new Date().toISOString().slice(0, 7);
  return {
    summary: {
      day: 40, active: true, current, health: 'green', health_title: 'على المسار',
      milestones: { total: 1, done: 0, due: 0, late: 0, at_risk: 0, on_time: null }, benefits: { total: 1, measured: 0, realization: null },
      updates: 0, last_at: null, due: { update: true, checkpoint: null, resubmit: false }, can_update: true, checkpoints: [],
    },
    plan: { start: null, end: null },
    state: {
      milestones: [{ key: 'm0', title: 'الإطلاق', due: '2027-01-01', status: 'on_track' }],
      benefits: [{ key: 'b0', title: 'رضا المستفيد', indicator: 'نسبة الرضا', baseline: '60', target: '80', numeric: true, value: '', realization: null }],
    },
    updates: [], statuses: { on_track: 'في موعده', at_risk: 'معرّض للتأخر', late: 'متأخر', done: 'تحقق', dropped: 'أُلغي بقرار' },
    health: { green: 'على المسار' }, checkpoints: [],
  };
}
test('متابعة الشهر: ما كُتب ولم يُحفظ يعود بعد التنقل بين الشاشات، ولا يُرسل آليًا', async ({ page }) => {
  const calls = await open(page, {
    'capstone.get': capstone({ capstone: { status: 'approved', status_title: 'معتمد' } }),
    'tracking.get': { success: true, tracking: tracking(), current: null },
  });
  await toCapstone(page);
  await page.getByRole('button', { name: /حدّث متابعة/ }).click();
  await page.getByRole('textbox', { name: 'ما جرى هذا الشهر' }).fill('أطلقنا النسخة التجريبية في فرعين');
  await page.getByRole('textbox', { name: 'القيمة الحالية لـرضا المستفيد' }).fill('71');
  await page.getByRole('button', { name: 'رحلتي' }).first().click();
  await toCapstone(page);
  await expect(page.getByText('أعدنا ما كتبته قبل أن تغادر الصفحة، ولم يُحفظ بعد.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'ما جرى هذا الشهر' })).toHaveValue('أطلقنا النسخة التجريبية في فرعين');
  await expect(page.getByRole('textbox', { name: 'القيمة الحالية لـرضا المستفيد' })).toHaveValue('71');
  expect(calls.map((c) => c.action)).not.toContain('tracking.save');
  // والمسودة تعود مرة واحدة: بعد الإلغاء والتنقل لا ترجع
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: 'رحلتي' }).first().click();
  await toCapstone(page);
  await expect(page.getByRole('button', { name: /حدّث متابعة/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'ما جرى هذا الشهر' })).toHaveCount(0);
});

// p-capstone-5: كانت النافذة تُفتح بعد انتظار capstone.doc، أي بعد انقضاء أثر النقرة، فيحجبها Safari
// (Chromium لا يحجبها، فالاختبار يثبت الترتيب: النافذة قبل رد الخادم)
const DOC = { meta: { initiative: 'رقمنة خدمات المستفيدين', participant: { name: 'سارة الأحمد' }, org: { name: 'جهة التجربة' }, scope_title: 'مشروع', track: { title: 'مسار التنفيذ المؤثر' } }, sections: [], checks: [], summary: '' };
test('الوثيقة الاحترافية: النافذة تُفتح مع النقرة قبل رد الخادم، ثم تُملأ', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  let answered = false;
  await open(page, { 'capstone.doc': async () => { await held; answered = true; return { success: true, doc: DOC }; } });
  await toCapstone(page);
  const popup = page.waitForEvent('popup', { timeout: 3000 });
  await page.getByRole('button', { name: 'اعرض الوثيقة الاحترافية' }).click();
  const win = await popup;
  expect(answered).toBe(false);
  release();
  await expect(win.locator('body')).toContainText('رقمنة خدمات المستفيدين');
});

test('الوثيقة الاحترافية: إن رفض الخادم تُغلق النافذة الفارغة وتظهر رسالته', async ({ page }) => {
  await open(page, { 'capstone.doc': { success: false, message: 'تعذّر تجهيز الوثيقة الآن' } });
  await toCapstone(page);
  const popup = page.waitForEvent('popup', { timeout: 3000 });
  await page.getByRole('button', { name: 'اعرض الوثيقة الاحترافية' }).click();
  const win = await popup;
  await expect(page.getByText('تعذّر تجهيز الوثيقة الآن')).toBeVisible();
  await expect.poll(() => win.isClosed()).toBe(true);
});

// p-capstone-4: «لا خبير مطابق» كان يختفي من «طلباتك» بلا كلمة بعد وعد «يصلك بريد حين يقبله»
test('طلب الاستشارة المنتهي بلا خبير يبقى ظاهرًا بسببه، ولا يمنع طلب الدور من جديد', async ({ page }) => {
  const UNMATCHED = 'لم يقبله أحد من الخبراء المطابقين، أو لا خبير متاح الآن. يراه فريق البرنامج ليسنده إلى خبير حين يتوفر، ولك أن تطلبه من جديد أو تختار نوع دعم آخر.';
  const OFFERED = 'عُرض على الخبير ليقبل أو يعتذر، وإن اعتذر أو انقضت مهلته عرضناه على التالي الأنسب. يصلك بريد حين يقبله خبير.';
  let chosen = null;
  await open(page, {
    'experts.suggest': (b) => ({
      success: true, role: b.role, role_ar: 'موجّه', roles: [{ key: 'coach', title: 'موجّه', hint: 'جلسات التوجيه الفردية' }],
      contexts: { program: 'خلال البرنامج' }, dimensions: { milestone: 'إدارة المشروعات' },
      requests: chosen ? [{ id: 'r2', role: 'coach', role_ar: 'موجّه', status: 'offered', status_ar: 'معروض على خبير', hint: OFFERED, expert: chosen }] : [],
      recent: chosen ? [] : [{ id: 'r1', role: 'coach', role_ar: 'موجّه', status: 'unmatched', status_ar: 'لا خبير مطابق', hint: UNMATCHED }],
      candidates: chosen ? [] : [{ id: 'e1', full_name: 'خالد المطيري', title: 'مدرب تنفيذي', sectors: [], languages: [], rating: null }],
    }),
    'experts.choose': () => { chosen = 'خالد المطيري'; return { success: true, status: 'offered', expert: chosen }; },
  });
  const card = page.locator('section', { has: page.locator('#cx-h') });
  await expect(card.locator('[data-request="unmatched"]')).toContainText('لا خبير مطابق');
  await expect(card.locator('[data-request="unmatched"]')).toContainText(UNMATCHED);
  await card.getByRole('button', { name: 'اطلب الآن' }).click();
  await card.getByLabel(/ما الذي تحتاجه/).fill('مراجعة خطة المخاطر');
  await card.getByRole('button', { name: 'اختره' }).click();
  await expect(card.getByText('أرسلنا طلبك إلى خالد المطيري مع ما كتبته. يصلك بريد حين يقبله خبير، وإن اعتذر عرضناه على التالي الأنسب.')).toBeVisible();
  await expect(card.locator('[data-request="offered"]')).toContainText(OFFERED);
  await expect(card.locator('[data-request="unmatched"]')).toHaveCount(0);
});

// p-capstone-6: «إلغاء» المقيّم بنقرة واحدة أوقف رابطه بلا تأكيد، والدعوة المنتهية ظهرت «بانتظار تقديره»
// بلا إعادة إرسال، وعند الحد اختفى النموذج بلا تفسير
test('القياس البعدي: إلغاء المقيّم بتأكيد، والدعوة المنتهية تُعاد، والحد مشروح', async ({ page }) => {
  const rater = (id, name, email, status, expired = false) => ({ id, email, full_name: name, relation: 'peer', status, phase: 'post', expired });
  const raters = [rater('x1', 'نورة', 'noura@x.sa', 'invited', true), rater('x2', 'خالد', 'khaled@x.sa', 'invited'), rater('x3', 'عمر', 'omar@x.sa', 'submitted')];
  const mine = (list) => ({ success: true, summary: null, raters: list, limit: 3, pre_available: false });
  const post = { ...me, journey: [...me.journey, { key: 'evaluation', title_ar: 'قياس التطور', phase: 'impact', status: 'active', done: 1, total: 1,
    items: [{ id: 'r1', code: 'E-POST', title_ar: 'إكمال القياس البعدي', kind: 'auto', auto: true, required: true, status: 'done' }] }] };
  const calls = await open(page, {
    me: post, 'impact.mine': mine(raters),
    'rater.invite': () => mine([{ ...raters[0], expired: false }, raters[1], raters[2]]),
    'rater.revoke': () => mine([raters[0], raters[2]]),
  });
  await page.getByRole('button', { name: 'أثري' }).first().click();
  const list = page.locator('.rater-list');
  const noura = list.locator('li', { hasText: 'نورة' });
  await expect(noura).toContainText('انتهت الدعوة');
  await expect(noura).not.toContainText('بانتظار تقديره');
  await expect(page.getByText(/دعوت 3 مقيّمين، وهو الحد/)).toBeVisible();

  // رفض التأكيد لا يلغي شيئًا، وقبوله يلغي بعد ذكر صاحب الدعوة وأن رابطه يتوقف
  const dialogs = [];
  page.once('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await list.locator('li', { hasText: 'خالد' }).getByRole('button', { name: 'إلغاء' }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('خالد');
  expect(dialogs[0]).toContain('يتوقف الرابط');
  expect(calls.filter((c) => c.action === 'rater.revoke')).toHaveLength(0);
  page.once('dialog', (d) => d.accept());
  await list.locator('li', { hasText: 'خالد' }).getByRole('button', { name: 'إلغاء' }).click();
  await expect(list.locator('li', { hasText: 'خالد' })).toHaveCount(0);
  expect(calls.find((c) => c.action === 'rater.revoke')).toMatchObject({ id: 'x2' });

  // إعادة إرسال المنتهية بالبريد نفسه
  await noura.getByRole('button', { name: 'أعد الإرسال' }).click();
  await expect(noura).toContainText('بانتظار تقديره');
  expect(calls.find((c) => c.action === 'rater.invite')).toMatchObject({ email: 'noura@x.sa', full_name: 'نورة', relation: 'peer', phase: 'post' });
});

// p-capstone-6: «أغلق الطلب» في طلبات التوجيه أغلقه بنقرة عابرة، ولا إعادة فتح
test('طلب التوجيه لا يُغلق بلا تأكيد', async ({ page }) => {
  const item = (status) => ({ id: 'm1', text: 'كيف أقيس منفعة غير مالية؟', source: 'free', source_ar: 'سؤال حر', target_team: null, target_team_ar: 'الجميع',
    status, status_ar: status === 'closed' ? 'مغلق' : 'بانتظار إجابة', at: '2026-11-04T10:00:00Z', participant_id: 'p1', author: 'سارة الأحمد', mine: true, can_answer: false, answers: [] });
  const peer = (status) => ({ success: true, supervision: 'peers_expert', supervision_ar: 'الأقران يجيبون ويؤكّد الخبير', team: 'guide', team_ar: 'فريق التوجيه',
    teams: { guide: 'فريق التوجيه' }, advisor: null, mine_open: status === 'closed' ? 0 : 1, items: [item(status)] });
  const calls = await open(page, { 'peer.list': peer('open'), 'peer.close': () => peer('closed') });
  const card = page.getByRole('region', { name: 'طلبات التوجيه' });
  const close = card.getByRole('button', { name: 'أغلق الطلب' });
  const dialogs = [];
  page.once('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await close.click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('لا يُعاد فتحه');
  expect(calls.filter((c) => c.action === 'peer.close')).toHaveLength(0);
  page.once('dialog', (d) => d.accept());
  await close.click();
  await expect.poll(() => calls.filter((c) => c.action === 'peer.close').length).toBe(1);
});

// p-capstone-8: مع تقييمين منتظرين، ظهر الشكر بعد إرسال الأول في صندوق خطأ أحمر فوق التقييم التالي
test('تقييم الخبير: الشكر لافتة نجاح لا صندوق خطأ، والخطأ يبقى خطأ', async ({ page }) => {
  const item = (id, expert, what) => ({ kind: 'request', id, when: '2026-11-05T10:00:00Z', expert, title: null, what });
  let items = [item('q1', 'خالد المطيري', 'خدمة «موجّه»'), item('q2', 'منى السالم', 'جلسة توجيه')];
  let fail = false;
  const criteria = { useful: 'أفادتني الجلسة فعلًا', clear: 'كان واضحًا ومحددًا', committed: 'التزم بالموعد والمتابعة' };
  await open(page, {
    'ratings.pending': () => ({ success: true, items, criteria }),
    'ratings.submit': () => {
      if (fail) return { success: false, message: 'تعذّر حفظ التقييم الآن' };
      items = items.slice(1);
      return { success: true };
    },
  });
  const card = page.locator('section.rx');
  await expect(card.getByRole('heading', { name: 'كيف كانت خدمة «موجّه» مع خالد المطيري؟' })).toBeVisible();
  const rate = async () => { for (const k of Object.values(criteria)) await card.getByRole('radiogroup', { name: k }).getByRole('radio', { name: '5 من 5' }).click(); };
  await rate();
  await card.getByRole('button', { name: 'أرسل التقييم' }).click();
  await expect(card.getByRole('heading', { name: /منى السالم/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'شكرًا، وصل تقييمك' })).toBeVisible();
  await expect(card.locator('.alert.err')).toHaveCount(0);

  fail = true;
  await rate();
  await card.getByRole('button', { name: 'أرسل التقييم' }).click();
  await expect(card.locator('.alert.err')).toHaveText('تعذّر حفظ التقييم الآن');
  await expect(page.getByText('شكرًا، وصل تقييمك')).toHaveCount(0);
});
