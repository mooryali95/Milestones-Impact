// فحص الجاهزية p-entry-2: حد «لا ينطبق» في عبارات الممارسة (واحدة لكل قسم في القياس المبدئي) كان خفيًا حتى الرفض
// بعد «أرسل»، والمراجعة تقول «أنهيت الأسئلة كلها». الآن يُذكر في المقدمة وأول كل قسم، ويُرد الاختيار الزائد في موضعه
// مع طريق إلى العبارة الأخرى، والمراجعة تسمّي القسم وتنقل إلى العبارة، ورفض الخادم يسمّي العبارات. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const RULE = '«لا ينطبق» لعبارة واحدة على الأكثر في كل قسم';
const NA = 'لا ينطبق على عملي';
const LIKERT = ['نادرًا أو أبدًا', 'في أحيان قليلة', 'أحيانًا', 'غالبًا', 'دائمًا', NA].map((label, k) => ({ k, label, ...(k === 5 ? { na: true } : {}) }));
const QUESTIONS = [
  { id: 'm1', dimension: 'milestone', tier: 'behavior', kind: 'likert', text: 'أختم اجتماعات المتابعة بقرار موثق.', help: 'اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', options: LIKERT },
  { id: 'm2', dimension: 'milestone', tier: 'behavior', kind: 'likert', text: 'أتفق مع الجهة المستلمة على معايير القبول.', help: 'اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', options: LIKERT },
  { id: 'm3', dimension: 'milestone', tier: 'knowledge', kind: 'choice', text: 'أي النقاط تمثل بوابة مرحلة؟', options: [{ k: 0, label: 'الاجتماع الأسبوعي' }, { k: 1, label: 'قرار الاستمرار' }] },
  { id: 'i1', dimension: 'impact', tier: 'behavior', kind: 'likert', text: 'أربط مخرجات المشروع بمؤشر أثر.', options: LIKERT },
];

function server({ answers = {}, fresh = null, submit = [] } = {}) {
  const s = { sent: [], gets: 0, submits: 0 };
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
      return { success: true, assessment: { id: 'a1', kind: 'baseline', status: 'in_progress', est_minutes: 12 }, questions: QUESTIONS, answers: s.gets > 1 && fresh ? fresh : answers, before: {} };
    }
    if (b.action === 'assessment.answer') return { success: true };
    if (b.action === 'assessment.submit') return submit[s.submits++] || { success: false, message: 'انتهى الاختبار' };
    return me;
  };
  s.answers = () => s.sent.filter((b) => b.action === 'assessment.answer').map((b) => [b.question_id, b.k]);
  return s;
}

async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: srv.reply(JSON.parse(route.request().postData() || '{}')) }));
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-assessment-na-0000000000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto(APP);
}

test('القاعدة قبل الإرسال: في المقدمة وأول القسم، والاختيار الزائد يُرد في موضعه بطريق إلى العبارة الأخرى', async ({ page }) => {
  const srv = server({ submit: [{ success: false, message: 'أُرسل' }] });
  await open(page, srv);
  await expect(page.getByText(`في عبارات الممارسة، اختر ${RULE}، وأجب عن البقية بأقرب تكرار لما تفعله.`)).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await expect(page.getByText(`لا إجابة صحيحة هنا: اختر ما تفعله فعلًا، و${RULE}.`)).toBeVisible();

  await page.getByRole('radio', { name: NA }).click();
  await expect(page.getByText(QUESTIONS[1].text)).toBeVisible();
  // الثانية في القسم نفسه لا تُحفظ ولا ينتقل التقدم: تنبيه بالقاعدة تحت السؤال
  await page.getByRole('radio', { name: NA }).click();
  const note = page.getByRole('alert').filter({ hasText: 'وفي هذا القسم عبارة أخرى اخترته فيها' });
  await expect(note).toContainText(RULE);
  await page.waitForTimeout(500);
  await expect(page.getByText(QUESTIONS[1].text)).toBeVisible();
  await expect(page.getByRole('radio', { name: NA })).toHaveAttribute('aria-checked', 'false');
  expect(srv.answers()).toEqual([['m1', 5]]);

  // إلى العبارة الأخرى، ثم العودة إلى السؤال نفسه بعد تغييرها
  await note.getByRole('button', { name: 'اذهب إليها' }).click();
  await expect(page.getByText(QUESTIONS[0].text)).toBeVisible();
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await expect(page.getByText(QUESTIONS[1].text)).toBeVisible();
  await page.getByRole('radio', { name: NA }).click();
  await expect(page.getByText(QUESTIONS[2].text)).toBeVisible();
  expect(srv.answers()).toEqual([['m1', 5], ['m1', 3], ['m2', 5]]);

  // قسم آخر له «لا ينطبق» خاصة به
  await page.getByRole('radio', { name: 'قرار الاستمرار' }).click();
  await page.getByRole('button', { name: /واصل إلى/ }).click();
  await page.getByRole('radio', { name: NA }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' })).toBeVisible();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect.poll(() => srv.submits).toBe(1);
});

test('المراجعة تسمّي القسم الذي تجاوز الحد وتنقل إلى العبارة، ثم تعود بعد التصحيح', async ({ page }) => {
  // إجابات محفوظة قبل الإصلاح: «لا ينطبق» مرتين في القسم الأول
  const srv = server({ answers: { m1: 5, m2: 5, m3: 1, i1: 3 }, submit: [{ success: false, message: 'أُرسل' }] });
  await open(page, srv);
  await page.getByRole('button', { name: /تابع/ }).click();
  await page.getByRole('button', { name: 'التالي' }).click();
  await expect(page.getByRole('heading', { name: 'راجع «لا ينطبق» قبل الإرسال' })).toBeVisible();
  await expect(page.getByText(`اختر ${RULE}، واخترته في أكثر من عبارة في قسم إدارة المشروعات.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'أرسل واعرض نتيجتي' })).toHaveCount(0);

  await page.getByRole('button', { name: 'اذهب إلى العبارة' }).click();
  await expect(page.getByText(QUESTIONS[0].text)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: RULE })).toBeVisible();
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' })).toBeVisible();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect.poll(() => srv.submits).toBe(1);
  expect(srv.answers()).toEqual([['m1', 3]]);
});

test('رفض الخادم too_many_na يسمّي العبارات: تُحدَّث الإجابات وتنتقل الشاشة إلى أولها', async ({ page }) => {
  // جلسة أخرى غيّرت m1 إلى «لا ينطبق» ولم تصل هذه الشاشة
  const srv = server({
    answers: { m1: 3, m2: 5, m3: 1, i1: 3 },
    fresh: { m1: 5, m2: 5, m3: 1, i1: 3 },
    submit: [{ success: false, code: 'too_many_na', message: `اختر ${RULE}`, question_ids: ['m1', 'm2'] }, { success: false, message: 'أُرسل' }],
  });
  await open(page, srv);
  await page.getByRole('button', { name: /تابع/ }).click();
  await page.getByRole('button', { name: 'التالي' }).click();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect(page.getByText(QUESTIONS[0].text)).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: RULE })).toBeVisible();
  await expect(page.getByRole('radio', { name: NA })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' })).toBeVisible();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();
  await expect.poll(() => srv.submits).toBe(2);
});
