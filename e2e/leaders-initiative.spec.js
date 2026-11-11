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
