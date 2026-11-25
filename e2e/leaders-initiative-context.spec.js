// المبادرة ملك قائدها، والجهة سياق مساعد: سياق التنفيذ يكيّف تلميح الحقل والمثال الأقرب، ويُقدّم المثال الريادي
// التصور: docs/content/2026-11-15-تصور-المبادرة-ملك-قائدها-v1.md
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const CONTEXTS = ['في جهة أعمل فيها', 'في جهة أخرى', 'مبادرة ريادية أو مستقلة', 'مبادرة مجتمعية أو تطوعية', 'افتراضية في سياق واقعي'];
const ALL = { field: true, doc: true, sectors: ['gov', 'health', 'startup'] };

function server({ context = null, sectors = ALL.sectors } = {}) {
  const examples = { ...ALL, sectors, context };
  const charterModel = { id: 'm-charter', key: 'initiative-charter', dimension: 'milestone', title_ar: 'بطاقة المبادرة', points: 20, min_level: 'beginner', capstone_sort: 10, level: 'beginner',
    fields: [{ key: 'title', type: 'text', label: 'اسم المبادرة', required: true },
      { key: 'context', type: 'select', label: 'أين تُنفَّذ مبادرتك؟', options: CONTEXTS, required: false },
      { key: 'host', type: 'text', label: 'الجهة المستضيفة (إن وُجدت)', required: false },
      { key: 'objective', type: 'textarea', label: 'الهدف الأعلى الذي تخدمه مبادرتك', required: true },
      { key: 'sponsor', type: 'text', label: 'الراعي: منصبه ودوره', required: false }] };
  let saved = { title: 'مبادرتي' };
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', sector: 'القطاع الصحي' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const reply = (b) => {
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return {
        success: true, initiative: 'مبادرتي', scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
        sections: [{ id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: false, missing: 2, status: 'draft' }],
        checks: [], readiness: 0, ready_min: 80, card: { state: 'draft', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [], examples,
      };
      case 'models.get': return { success: true, model: charterModel, submission: { status: 'draft', answers: saved }, initiative: 'مبادرتي', sector: 'القطاع الصحي', examples, imports: {}, capstone: { status: 'draft', locked: false } };
      case 'models.save': saved = b.answers; return { success: true, submission: { status: 'draft', answers: saved } };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { reply };
}

async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-context-000000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('اختيار «مبادرة ريادية» في البطاقة يُظهر تلميح السياق تحت الحقل، ويقدّم المثال الريادي على مثال القطاع', async ({ page }) => {
  await open(page, server());
  await page.getByRole('button', { name: /بطاقة المبادرة/ }).first().click();
  await expect(page.getByRole('heading', { name: 'بطاقة المبادرة' })).toBeVisible();

  // قبل اختيار السياق: مثال قطاعها (الصحة)، ولا تلميح سياق
  await expect(page.getByText('مثال من الصحة:').first()).toBeVisible();
  await expect(page.getByText(/في سياقك/)).toHaveCount(0);

  await page.getByRole('radio', { name: 'مبادرة ريادية أو مستقلة' }).click();
  await expect(page.getByText('في سياقك (مبادرة ريادية أو مستقلة):').first()).toBeVisible();
  await expect(page.getByText(/حاجة سوق مثبتة برقم ومصدر/)).toBeVisible();
  await expect(page.getByText(/المستثمر أو الشريك المموّل/)).toBeVisible();
  await expect(page.getByText('مثال من ريادة الأعمال:').first()).toBeVisible();
  await expect(page.getByText('مثال من الصحة:')).toHaveCount(0);

  // سياق آخر: يتغير التلميح، والمثال يعود لقطاعها
  await page.getByRole('radio', { name: 'في جهة أخرى' }).click();
  await expect(page.getByText('في سياقك (في جهة أخرى):').first()).toBeVisible();
  await expect(page.getByText('مثال من الصحة:').first()).toBeVisible();
});

test('صفحة المبادرة: السياق المحفوظ ريادي فالمثال الكامل الأول ريادي، وإن حجبه المالك فمثال القطاع', async ({ page }) => {
  await open(page, server({ context: 'مبادرة ريادية أو مستقلة' }));
  // المثال المحلول بين ملحقات الوثيقة المطوية تحت الخط («الوثيقة الحية»)
  await page.locator('.cp-fold > summary').click();
  const ex = page.getByRole('region', { name: 'مبادرة محلولة كاملة' });
  await expect(ex.getByRole('button').first()).toHaveText('مثال ريادة الأعمال');
});

test('بلا سياق: مثال قطاع المشارك من ملفه أولًا (me.participant.sector)', async ({ page }) => {
  await open(page, server());
  // المثال المحلول بين ملحقات الوثيقة المطوية تحت الخط («الوثيقة الحية»)
  await page.locator('.cp-fold > summary').click();
  const ex = page.getByRole('region', { name: 'مبادرة محلولة كاملة' });
  await expect(ex.getByRole('button').first()).toHaveText('مثال الصحة');
});

test('المثال الريادي محجوب: يبقى مثال القطاع أولًا ولو كان السياق رياديًا', async ({ page }) => {
  await open(page, server({ context: 'مبادرة ريادية أو مستقلة', sectors: ['gov', 'health'] }));
  // المثال المحلول بين ملحقات الوثيقة المطوية تحت الخط («الوثيقة الحية»)
  await page.locator('.cp-fold > summary').click();
  const ex = page.getByRole('region', { name: 'مبادرة محلولة كاملة' });
  await expect(ex.getByRole('button').first()).toHaveText('مثال الصحة');
  await expect(ex.getByRole('button', { name: 'مثال ريادة الأعمال' })).toHaveCount(0);
});
