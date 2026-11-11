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
