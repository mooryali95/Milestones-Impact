// مشروع التخرج («وثيقة المبادرة») من أوله إلى اعتماده: المشارك يبني ويسلّم،
// والمستشار يقيّم بالمعيار السداسي ويقبل، والراعي يؤيد من رابطه. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';

const sections = (complete) => [
  { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' },
  { id: 'm-wbs', key: 'wbs', title: 'هيكل تجزئة العمل', icon: '◆', dimension: 'milestone', complete, missing: complete ? 0 : 2, status: complete ? 'submitted' : 'draft' },
  { id: 'm-benefits', key: 'benefits-register', title: 'سجل المنافع', icon: '◆', dimension: 'impact', complete: true, missing: 0, status: 'reviewed' },
];
const RUBRIC = ['الاتساق الاستراتيجي', 'واقعية التخطيط', 'القيمة والدليل', 'الحوكمة والملكية', 'المخاطر والتغيير', 'النضج القيادي'];

function participantServer() {
  const s = { ready: false, status: 'draft' };
  const calls = [];
  const capstone = () => ({
    success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate',
    track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' },
    capstone: { status: s.status, status_title: s.status === 'submitted' ? 'بانتظار مراجعة المستشار' : 'قيد البناء', summary: '' },
    sections: sections(s.ready),
    checks: [
      { key: 'sponsor', title: 'للمبادرة راعٍ من الجهة ببريد صحيح', ok: true, detail: null },
      { key: 'wbs-owner', title: 'لكل حزمة عمل مالك واحد', ok: s.ready, detail: s.ready ? null : 'حزم بلا مالك: WP-2' },
    ],
    readiness: s.ready ? 100 : 58, ready_min: 80,
    // بوابة البطاقة: قبل اكتمال الفصول البطاقة عند المستشار، وبعده معتمدة
    card: { state: s.ready ? 'approved' : 'waiting', sla: 'يومي عمل' },
    can_submit: s.ready && s.status === 'draft', blocker: s.ready ? null : 'فصول لم تكتمل: هيكل تجزئة العمل',
    rubric: RUBRIC.map((title, i) => ({ key: `k${i}`, title, anchors: ['1', '2', '3', 'وصف المستوى الأعلى'] })),
  });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return capstone();
      case 'capstone.summary': return { success: true };
      case 'capstone.submit': s.status = 'submitted'; return capstone();
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { s, calls, reply };
}

test('المشارك: الجاهزية تمنع التسليم بسبب واضح، ثم يسلّم حين تكتمل', async ({ page }) => {
  const srv = participantServer();
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-capstone-0000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();

  await expect(page.getByRole('heading', { name: 'رقمنة خدمات المستفيدين' })).toBeVisible();
  await expect(page.locator('.cp-meter b')).toHaveText('58%');
  await expect(page.getByText('حزم بلا مالك: WP-2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'سلّم الوثيقة للمستشار' })).toBeDisabled();
  await expect(page.getByText('فصول لم تكتمل: هيكل تجزئة العمل')).toBeVisible();
  // بوابة البطاقة: ما ينتظره من المستشار ومدته، وأنه يكمل الفصول في الأثناء
  await expect(page.locator('[data-card-gate="waiting"]')).toContainText('بطاقة مبادرتك عند المستشار');
  await expect(page.locator('[data-card-gate="waiting"]')).toContainText('خلال يومي عمل');

  srv.s.ready = true;
  await page.reload();
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
  await expect(page.locator('.cp-meter b')).toHaveText('100%');
  await page.getByRole('textbox').fill('المشكلة والحل والقيمة وما نطلبه.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'سلّم الوثيقة للمستشار' }).click();
  await expect(page.getByText('سُلّمت الوثيقة للمستشار')).toBeVisible();
  expect(srv.calls.map((c) => c.action)).toEqual(expect.arrayContaining(['capstone.summary', 'capstone.submit']));
  expect(srv.calls.find((c) => c.action === 'capstone.summary').summary).toBe('المشكلة والحل والقيمة وما نطلبه.');
});

test('المستشار: يقيّم الأبعاد الستة ثم يقبل ويطلب تأييد الراعي', async ({ page }) => {
  const calls = [];
  const doc = { meta: { initiative: 'رقمنة خدمات المستفيدين', participant: { name: 'سارة الأحمد' }, org: { name: 'جهة التجربة' }, scope_title: 'مشروع', track: { title: 'مسار التنفيذ المؤثر' } }, sections: [] };
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.capstones': { success: true, items: [] },
      'admin.capstone': { success: true, doc, capstone: { status: 'submitted', revisions: 0 }, readiness: 100, sections: sections(true), checks: [], leader: { score: 82, weights: { quizzes: 20, lab: 20, capstone: 40, participation: 20 }, parts: { quizzes: 80 } }, max_revisions: 1, priority: 'milestone', rubric: RUBRIC.map((title, i) => ({ key: `k${i}`, title, anchors: ['1', '2', '3', '4'] })) },
      'admin.capstone-review': { success: true, doc, capstone: { status: 'accepted', revisions: 0, score: 100 }, readiness: 100, sections: sections(true), checks: [], leader: null, max_revisions: 1 },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مستشار', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.evaluate(() => { location.hash = '#/leaders/capstones/p1'; });

  await expect(page.getByRole('heading', { name: 'رقمنة خدمات المستفيدين' })).toBeVisible();
  for (const title of RUBRIC) await page.getByRole('radiogroup', { name: title }).getByRole('radio').last().click();
  await page.getByRole('button', { name: 'قبول وطلب تأييد الراعي' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.capstone-review')).toMatchObject({ participant_id: 'p1', decision: 'accept' });
  const scores = calls.find((c) => c.action === 'admin.capstone-review').scores;
  expect(Object.values(scores)).toEqual([4, 4, 4, 4, 4, 4]);
});

test('الراعي: يقرأ ملخص المبادرة من رابطه ويؤيدها، والطلب بتعديل يلزمه ملاحظة', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const doc = { meta: { initiative: 'رقمنة خدمات المستفيدين', participant: { name: 'سارة الأحمد' }, org: { name: 'جهة التجربة' }, scope_title: 'مشروع', start: '2026-01-01', end: '2026-06-30' }, cost: { withContingency: 440000 }, sections: [{}, {}, {}] };
    const replies = { 'sponsor.get': { success: true, sponsor: 'د. خالد', doc }, 'sponsor.submit': { success: true, decision: 'endorsed' } };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(`${APP}sponsor?t=tok-sponsor-00000000000000000000`);
  await expect(page.getByRole('heading', { name: /هل تؤيد مبادرة «رقمنة خدمات المستفيدين»/ })).toBeVisible();
  await expect(page.getByText('440,000 ريال')).toBeVisible();
  await page.getByRole('button', { name: 'أطلب تعديلًا' }).click();
  await expect(page.getByText('اكتب ما الذي يعدّله صاحب المبادرة')).toBeVisible();
  expect(calls.some((c) => c.action === 'sponsor.submit')).toBe(false);
  await page.getByRole('button', { name: 'أؤيد المبادرة' }).click();
  await expect(page.getByText('سُجّل تأييدك، واعتُمدت الوثيقة.')).toBeVisible();
  expect(calls.find((c) => c.action === 'sponsor.submit')).toMatchObject({ t: 'tok-sponsor-00000000000000000000', decision: 'endorse' });
});
