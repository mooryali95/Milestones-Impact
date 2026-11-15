// مرافق بناء المبادرة (4ج): اكتشاف المبادرة قبل البطاقة، وحجب المالك للمبادرات المحلولة كاملة
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const CHARTER = { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: false, missing: 6, status: null };

function server({ level = 'beginner', initiative = null, card = 'none', examples } = {}) {
  const calls = [];
  const charterModel = { id: 'm-charter', key: 'initiative-charter', dimension: 'milestone', title_ar: 'بطاقة المبادرة', points: 20, min_level: 'beginner', capstone_sort: 10, level,
    fields: [{ key: 'title', type: 'text', label: 'اسم المبادرة', required: true }, { key: 'problem', type: 'textarea', label: 'المشكلة أو الفرصة بالأرقام', required: true },
      { key: 'objective', type: 'textarea', label: 'الهدف الأعلى الذي تخدمه مبادرتك', required: true }, { key: 'first_step', type: 'textarea', label: 'خطوتك الأولى خلال 30 يومًا: ما هي، ومع من', required: false }] };
  let saved = { objective: 'هدف كتبه المشارك من قبل' };
  const capstone = () => ({
    success: true, initiative, scope: 'project', scope_title: 'مشروع', level, track: null,
    capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
    sections: [CHARTER], checks: [], readiness: 0, ready_min: 80, card: { state: card, sla: 'يومي عمل' },
    can_submit: false, blocker: 'فصول لم تكتمل', rubric: [], examples,
  });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level, track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return capstone();
      case 'models.get': return { success: true, model: charterModel, submission: { status: 'draft', answers: saved }, initiative: null, imports: {}, capstone: { status: 'draft', locked: false } };
      case 'models.save': saved = b.answers; return { success: true, submission: { status: 'draft', answers: saved } };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { calls, reply };
}

async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-discovery-00000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('التأسيسي: ثلاث أفكار، فمفاضلة بمعايير البطاقة، فصياغة بأمثلة، وتُملأ مسودة البطاقة دون الكتابة فوق ما فيها', async ({ page }) => {
  const srv = server();
  await open(page, srv);
  const disc = page.getByRole('region', { name: 'ابدأ من فكرة' });
  await expect(disc).toBeVisible();
  await disc.getByLabel('فكرة 1').fill('تجديد الترخيص يأخذ أسبوعين ويحتاج زيارة');
  await disc.getByLabel('فكرة 2 (اختيارية)').fill('تقارير الأداء الشهرية تُجمع يدويًا');
  await disc.getByRole('button', { name: 'التالي' }).click();

  const first = disc.locator('fieldset').first();
  for (const c of ['قائمة اليوم في سياق تعرفه', 'يمكن البدء بها', 'لها صاحب قرار', 'يمكن قياسها']) await first.getByLabel(new RegExp(c)).check();
  await expect(first).toContainText('4 من 4');
  await expect(first).toContainText('الأنسب');
  await first.getByRole('radio').check();
  await disc.getByRole('button', { name: 'التالي' }).click();

  await expect(disc.getByLabel('اسم مقترح للمبادرة')).toHaveValue('تجديد الترخيص يأخذ أسبوعين ويحتاج زيارة');
  await disc.getByLabel('اسم مقترح للمبادرة').fill('تجديد الترخيص في يوم واحد');
  await expect(disc.getByText('مثال: متوسط الإنجاز 9 أيام')).toBeVisible();
  await disc.getByLabel(/من يتضرر منها/).fill('1,200 مستفيد شهريًا');
  await disc.getByLabel(/كيف تعرف حجمها/).fill('9 أيام (نظام الطلبات)');
  await disc.getByLabel(/ما خطوتك الأولى/).fill('اجتماع مع مالك البيانات');
  await disc.getByRole('button', { name: 'أنشئ مسودة البطاقة' }).click();

  await expect.poll(() => srv.calls.find((c) => c.action === 'models.save')).toBeTruthy();
  const save = srv.calls.find((c) => c.action === 'models.save');
  expect(save).toMatchObject({ id: 'm-charter', submit: false });
  expect(save.answers).toMatchObject({
    title: 'تجديد الترخيص في يوم واحد', objective: 'هدف كتبه المشارك من قبل', first_step: 'اجتماع مع مالك البيانات',
    problem: 'تجديد الترخيص يأخذ أسبوعين ويحتاج زيارة. يتضرر منها 1,200 مستفيد شهريًا. حجمها: 9 أيام (نظام الطلبات).',
  });
  // تُفتح البطاقة نفسها ليكمل فيها
  await expect(page.getByRole('heading', { name: 'بطاقة المبادرة' })).toBeVisible();
});

test('المتقدم: أسئلة استراتيجية بلا أمثلة، ومن لديه مبادرة يتخطى الاكتشاف', async ({ page }) => {
  await open(page, server({ level: 'advanced' }));
  const disc = page.getByRole('region', { name: 'ابدأ من فكرة' });
  await disc.getByLabel('فكرة 1').fill('انتظار العيادات طويل');
  await disc.getByRole('button', { name: 'التالي' }).click();
  await disc.locator('fieldset').first().getByRole('radio').check();
  await expect(disc.getByText('أقل من ثلاثة معايير')).toBeVisible();
  await disc.getByRole('button', { name: 'التالي' }).click();
  await expect(disc.getByLabel(/ما القرار الذي تريد أن يتخذه صاحب القرار/)).toBeVisible();
  await expect(disc.getByText(/^مثال:/)).toHaveCount(0);
  await disc.getByRole('button', { name: 'لدي مبادرة، اكتب البطاقة مباشرة' }).click();
  await expect(page.getByRole('region', { name: 'ابدأ من فكرة' })).toHaveCount(0);
});

test('لا اكتشاف بعد تسمية المبادرة أو تسليم البطاقة', async ({ page }) => {
  await open(page, server({ initiative: 'مبادرة مسماة', card: 'waiting' }));
  await expect(page.getByRole('heading', { name: 'مبادرة مسماة' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'ابدأ من فكرة' })).toHaveCount(0);
});

test('المالك حجب المبادرات المحلولة كاملة: لا بطاقة «مبادرة محلولة كاملة»، وحجب قطاع يبقي الآخر', async ({ page }) => {
  await open(page, server({ initiative: 'مبادرة مسماة', card: 'waiting', examples: { field: true, doc: false, sectors: ['gov', 'health'] } }));
  await expect(page.getByRole('heading', { name: 'مبادرة مسماة' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'مبادرة محلولة كاملة' })).toHaveCount(0);
});

test('حجب مثال الصحة: يبقى مثال الخدمات الحكومية وحده', async ({ page }) => {
  await open(page, server({ initiative: 'مبادرة مسماة', card: 'waiting', examples: { field: true, doc: true, sectors: ['gov'] } }));
  const ex = page.getByRole('region', { name: 'مبادرة محلولة كاملة' });
  await expect(ex.getByRole('button', { name: 'مثال الخدمات الحكومية' })).toBeVisible();
  await expect(ex.getByRole('button', { name: 'مثال الصحة' })).toHaveCount(0);
});
