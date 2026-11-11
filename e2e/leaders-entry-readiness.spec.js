// فحص الجاهزية، دخول المشارك وقياسه المبدئي وورقة النموذج. الخلفية مُحاكاة.
// p-entry-4 حفظ الإجابة الفاشل كان يُمحى بالإجابة التالية فتقول المراجعة «أنهيت» ويرفض الخادم.
// p-entry-5 فشل تحميل القياس (والنموذج) بلا زر محاولة.
// p-entry-7 الأخطاء لا يعلنها قارئ الشاشة، والتركيز يضيع بعد الرمز الخاطئ وبعد كل سؤال.
// p-entry-8 حقول ورقة النموذج بلا اسم وصول، وخيارات الاختيار بلا حالة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const NET = 'تعذّر الاتصال، تحقّق من الشبكة وحاول مرة أخرى';
const OPTS = [{ k: 0, label: 'الخيار الأول' }, { k: 1, label: 'الخيار الثاني' }];
const QUESTIONS = [
  { id: 'q1', dimension: 'milestone', tier: 'knowledge', kind: 'choice', text: 'السؤال الأول عن بوابة المرحلة؟', options: OPTS },
  { id: 'q2', dimension: 'milestone', tier: 'knowledge', kind: 'choice', text: 'السؤال الثاني عن معايير القبول؟', options: OPTS },
  { id: 'q3', dimension: 'milestone', tier: 'knowledge', kind: 'choice', text: 'السؤال الثالث عن سجل المخاطر؟', options: OPTS },
];

function assessmentServer({ getFails = 0, fresh = null, submit = [] } = {}) {
  const s = { down: new Set(), gets: 0, submits: 0, sent: [] };
  const stage = (key, title_ar, status) => ({ key, title_ar, phase: 'admission', status, items: [], done: 0, total: 0 });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: 'profiled', consented_at: '2026-11-01T00:00:00Z' },
    profile: { full_name: 'سارة عبدالله الأحمد', phone: '+966500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة', years_experience: 8, approved: false, level: null, track: null },
    journey: [stage('profile', 'الملف الشخصي', 'done'), stage('assessment', 'تحديد المستوى', 'active')],
    progress: 10, passkeys: 1, prompt_passkey: false,
  };
  s.reply = (b) => {
    s.sent.push(b);
    if (b.action === 'assessment.get') {
      s.gets += 1;
      if (s.gets <= getFails) return { success: false, message: NET, code: 'network' };
      return { success: true, assessment: { id: 'a1', kind: 'baseline', status: 'in_progress', est_minutes: 5 }, questions: QUESTIONS, answers: s.gets > 1 && fresh ? fresh : {}, before: {} };
    }
    if (b.action === 'assessment.answer') return s.down.has(b.question_id) ? { success: false, message: NET, code: 'network' } : { success: true };
    if (b.action === 'assessment.submit') { s.submits += 1; return submit[s.submits - 1] || { success: false, message: 'أُرسل' }; }
    return me;
  };
  s.answers = (id) => s.sent.filter((b) => b.action === 'assessment.answer' && b.question_id === id).length;
  return s;
}

async function openAssessment(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: srv.reply(JSON.parse(route.request().postData() || '{}')) }));
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-entry-readiness-000000000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto(APP);
}

test('p-entry-4: إجابة لم تُحفظ تبقى حتى تُحفظ، ولا تُعد، والمراجعة تسمّيها ولا تُرسل قبلها', async ({ page }) => {
  const srv = assessmentServer();
  srv.down.add('q2');
  await openAssessment(page, srv);
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByRole('radio', { name: /الخيار الأول/ }).click();
  await expect(page.getByText(QUESTIONS[1].text)).toBeVisible();
  await page.getByRole('radio', { name: /الخيار الأول/ }).click();
  await expect(page.getByText(QUESTIONS[2].text)).toBeVisible();
  const unsaved = page.getByRole('alert').filter({ hasText: 'لم تُحفظ إجابة واحدة بعد' });
  await expect(unsaved).toContainText(NET);
  // إجابة سؤال آخر لا تمحو ما لم يُحفظ، والعدّاد لا يعدّه
  await page.getByRole('radio', { name: /الخيار الثاني/ }).click();
  await expect(page.getByRole('heading', { name: 'لم تُحفظ إجابة واحدة بعد' })).toBeVisible();
  await expect(page.locator('.quiz-count')).toHaveText('أجبت 2 من 3');
  await expect(page.getByRole('button', { name: 'أرسل واعرض نتيجتي' })).toHaveCount(0);
  // أُعيدت المحاولة وحدها بعد حفظ ناجح وعند بلوغ المراجعة
  expect(srv.answers('q2')).toBeGreaterThanOrEqual(2);

  srv.down.clear();
  await page.getByRole('button', { name: 'أعد حفظها' }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' })).toBeVisible();
  await expect(page.locator('.quiz-count')).toHaveText('أجبت 3 من 3');
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect.poll(() => srv.submits).toBe(1);
});

test('p-entry-4: رد «incomplete» من الخادم يزامن الإجابات وينقل إلى أول سؤال ناقص برسالته', async ({ page }) => {
  // الخادم لم يحفظ q2 (من جلسة سابقة مثلًا) والشاشة تراه مجابًا
  const srv = assessmentServer({ fresh: { q1: 0, q3: 1 }, submit: [{ success: false, code: 'incomplete', message: 'بقي 1 من الأسئلة دون إجابة' }] });
  await openAssessment(page, srv);
  await page.getByRole('button', { name: 'ابدأ' }).click();
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByText(QUESTIONS[i].text)).toBeVisible();
    await page.getByRole('radio', { name: /الخيار الأول/ }).click();
  }
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect(page.getByText(QUESTIONS[1].text)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'بقي 1 من الأسئلة دون إجابة' })).toBeVisible();
  await expect(page.locator('.quiz-count')).toHaveText('أجبت 2 من 3');
  await expect(page.getByRole('radio', { name: /الخيار الأول/ })).toHaveAttribute('aria-checked', 'false');
});

test('p-entry-5: فشل تحميل القياس المبدئي يعرض «حاول مرة أخرى» يعيد الطلب', async ({ page }) => {
  const srv = assessmentServer({ getFails: 1 });
  await openAssessment(page, srv);
  const box = page.getByRole('alert').filter({ hasText: NET });
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: 'حاول مرة أخرى' }).click();
  await expect(page.getByRole('button', { name: 'ابدأ' })).toBeVisible();
  expect(srv.gets).toBe(2);
});

test('p-entry-7: التركيز ينتقل إلى نص كل سؤال جديد لا إلى أول الصفحة', async ({ page }) => {
  const srv = assessmentServer();
  await openAssessment(page, srv);
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await expect(page.getByText(QUESTIONS[0].text)).toBeFocused();
  await page.keyboard.press('1');
  await expect(page.getByText(QUESTIONS[1].text)).toBeFocused();
});

test('p-entry-7: الرمز الخاطئ يُعلن تنبيهًا، ويبقى التركيز في حقل الرمز فارغًا', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (b.action === 'auth.start') return route.fulfill({ json: { success: true, sent: true } });
    if (b.action === 'auth.verify') { await new Promise((r) => setTimeout(r, 300)); return route.fulfill({ json: { success: false, message: 'الرمز غير صحيح أو منتهٍ' } }); }
    return route.fulfill({ json: { success: false, message: 'غير متاح' } });
  });
  await page.goto(APP);
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  const code = page.getByLabel('رمز التحقق');
  await code.pressSequentially('123456');
  await expect(page.getByRole('alert').filter({ hasText: 'الرمز غير صحيح أو منتهٍ' })).toBeVisible();
  await expect(code).toBeFocused();
  await expect(code).toHaveValue('');
  await page.keyboard.type('6');
  await expect(code).toHaveValue('6');
});

function capstoneServer({ modelFails = 0 } = {}) {
  const s = { gets: 0, calls: [] };
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const capstone = {
    success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate',
    track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' }, capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
    sections: [{ id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: false, missing: 2, status: 'draft' }],
    checks: [], readiness: 40, ready_min: 80, card: { state: 'waiting', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [],
  };
  const model = {
    success: true, initiative: 'رقمنة خدمات المستفيدين', submission: null, imports: {}, capstone: { locked: false },
    model: { id: 'm-charter', dimension: 'milestone', sort: 1, min_level: 'beginner', title_ar: 'بطاقة المبادرة', summary_ar: 'ملخص', points: 30, fields: [
      { key: 'name', bind: 'initiative', label: 'اسم المبادرة' },
      { key: 'goal', type: 'textarea', label: 'هدف المبادرة', hint: 'جملة واحدة' },
      { key: 'kind', type: 'select', label: 'نوع المبادرة', options: ['تحسين', 'تحول'] },
    ] },
  };
  s.reply = (b) => {
    s.calls.push(b.action);
    if (b.action === 'me') return me;
    if (b.action === 'capstone.get') return capstone;
    if (b.action === 'models.get') { s.gets += 1; return s.gets <= modelFails ? { success: false, message: NET, code: 'network' } : model; }
    if (b.action === 'certificate') return { success: true, certificate: null };
    return { success: true };
  };
  return s;
}
async function openModel(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-entry-readiness-000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
  await page.locator('.cp-sec').filter({ hasText: 'بطاقة المبادرة' }).click();
}

test('p-entry-8: حقول ورقة النموذج مسمّاة، وخيارات الاختيار بحالتها', async ({ page }) => {
  await openModel(page, capstoneServer());
  await expect(page.getByRole('textbox', { name: /اسم المبادرة/ })).toHaveValue('رقمنة خدمات المستفيدين');
  await expect(page.getByRole('textbox', { name: /هدف المبادرة/ })).toBeEditable();
  const group = page.getByRole('radiogroup', { name: /نوع المبادرة/ });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await group.getByRole('radio', { name: 'تحول' }).click();
  await expect(group.getByRole('radio', { name: 'تحول' })).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'تحسين' })).toHaveAttribute('aria-checked', 'false');
});

test('p-entry-5: فشل تحميل النموذج يعرض «حاول مرة أخرى» والرجوع', async ({ page }) => {
  const srv = capstoneServer({ modelFails: 1 });
  await openModel(page, srv);
  const box = page.getByRole('alert').filter({ hasText: NET });
  await expect(box).toBeVisible();
  await expect(page.getByRole('button', { name: '→ وثيقة مبادرتك' })).toBeVisible();
  await box.getByRole('button', { name: 'حاول مرة أخرى' }).click();
  await expect(page.getByRole('textbox', { name: /هدف المبادرة/ })).toBeVisible();
});
