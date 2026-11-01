// رحلة المشارك كاملة في منصة القادة: التسجيل بالبريد والرمز، ثم الملف، ثم
// القياس القبلي والنتيجة المبدئية، ثم الاعتماد والرحلة، ثم الكتيب والنماذج.
// الخلفية مُحاكاة بحالة واحدة تتقدم مع كل خطوة كما يفعل الخادم.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const LIKERT = ['نادرًا جدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا'].map((label, k) => ({ k, label }));

function server() {
  const s = { profileDone: false, assessed: false, approved: false, chapterDone: false, points: 0 };
  const stage = (key, title_ar, phase, status, items = []) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length });
  const me = () => ({
    success: true,
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: s.approved ? 'enrolled' : s.assessed ? 'pending_approval' : 'registered' },
    profile: {
      full_name: 'سارة عبدالله الأحمد', phone: s.profileDone ? '0500000000' : '', job_title: s.profileDone ? 'مديرة مشاريع' : '',
      organization_name: s.profileDone ? 'جهة الاختبار' : '', years_experience: s.profileDone ? 8 : null,
      approved: s.approved, level: s.assessed ? 'intermediate' : null, track: s.approved ? { title: 'مسار التنفيذ المؤثر' } : null,
    },
    journey: [
      stage('profile', 'الملف الشخصي', 'admission', s.profileDone ? 'done' : 'active'),
      stage('assessment', 'تحديد المستوى', 'admission', s.assessed ? 'done' : s.profileDone ? 'active' : 'locked'),
      stage('training', 'التدريب', 'qualification', s.approved ? 'active' : 'locked', [
        { id: 'r1', code: 'T-HB', kind: 'reading', title_ar: 'قراءة كتيبك الشخصي', required: true, status: s.chapterDone ? 'done' : 'pending' },
      ]),
    ],
    progress: s.approved ? 30 : s.assessed ? 20 : 5, passkeys: 1, prompt_passkey: false,
  });
  const calls = [];
  const reply = (b) => {
    switch (b.action) {
      case 'auth.start': return b.full_name ? { success: true, sent: true } : { success: true, needs_name: true };
      case 'auth.verify': return b.code === '246810' ? { token: 'tok-journey-000000000000000000', ...me() } : { success: false, message: 'الرمز غير صحيح' };
      case 'me': return me();
      case 'profile.save': s.profileDone = true; return me();
      case 'assessment.get': return {
        success: true, assessment: { id: 'a1', kind: 'baseline', status: 'in_progress', est_minutes: 12 },
        questions: [
          { id: 'q1', dimension: 'milestone', tier: 'behavior', kind: 'likert', text: 'أراجع المعالم مع فريقي كل أسبوع.', options: LIKERT },
          { id: 'q2', dimension: 'impact', tier: 'skill', kind: 'mcq', text: 'أي مؤشر يقيس الأثر لا الإنجاز؟', options: [{ k: 0, label: 'عدد الورش المنفذة' }, { k: 1, label: 'تغير سلوك المستفيدين' }] },
        ],
        answers: {}, before: {},
      };
      case 'assessment.answer': return { success: true };
      case 'assessment.submit': s.assessed = true; return me();
      case 'certificate': return { success: true, certificate: null };
      case 'handbook.toc': return {
        success: true, name: 'سارة عبدالله الأحمد', code: 'M2I2L2',
        chapters: [
          { id: 'c1', dimension: 'milestone', title: 'المعالم نقاط قرار', done: s.chapterDone },
          { id: 'c2', dimension: 'impact', title: 'سلسلة القيمة', done: false },
        ],
        points: { total: s.points, rank: { title: 'مستكشف', next: { title: 'ممارس', at: 75, left: 75 - s.points } } },
        models: { total: 1, submitted: 0 },
      };
      case 'handbook.chapter': return {
        success: true, reading: null,
        chapter: { id: 'c1', dimension: 'milestone', title: 'المعالم نقاط قرار', md: '## المعلم قرار\nكل معلم **قرار** يُتخذ لا تاريخ يمر.' },
        quiz: [{ q: 'ما المعلم؟', options: ['تاريخ في الخطة', 'نقطة قرار'] }],
        reflection: 'ما آخر معلم مر دون قرار في مشروعك؟',
        done: null, watermark: 'سارة عبدالله الأحمد · sara@x.sa',
      };
      case 'handbook.ping': return { success: true, reading: null };
      case 'handbook.complete':
        s.chapterDone = true; s.points = 20;
        return { success: true, score: 1, total: 1, results: [{ correct: true, answer: 1, why: 'المعلم نقطة قرار.' }], first: true, gained: 20, points: { total: 20, rank: { title: 'مستكشف' } } };
      case 'models.list': return {
        success: true, models: [{ id: 'm1', key: 'raci', dimension: 'milestone', title_ar: 'مصفوفة المسؤوليات', summary_ar: 'من يقرر ومن ينفذ', points: 30, fields_n: 4, progress: 0, submission: null, min_level: 'beginner' }],
      };
      case 'achievements': return { success: true, total: s.points, rank: { title: 'مستكشف' }, ledger: [] };
      default: return { success: false, message: 'غير متوقع' };
    }
  };
  return { s, calls, reply };
}

async function mount(page) {
  const srv = server();
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    srv.calls.push(b);
    await route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  return srv;
}

test('رحلة المشارك: التسجيل والملف والقياس حتى النتيجة المبدئية', async ({ page }) => {
  const srv = await mount(page);
  await page.goto(APP);

  // التسجيل: بريد جديد يطلب الاسم، ثم الرمز
  await page.getByLabel('البريد الإلكتروني').fill('sara@x.sa');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('الاسم الكامل').fill('سارة عبدالله الأحمد');
  await page.getByRole('button', { name: 'أرسل الرمز' }).click();
  await page.getByLabel('رمز التحقق').fill('000000');
  await expect(page.getByText('الرمز غير صحيح')).toBeVisible();
  await page.getByLabel('رمز التحقق').fill('246810');

  // الملف: الحفظ معطل حتى تكتمل الحقول الأساسية
  const save = page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' });
  await expect(save).toBeDisabled();
  await page.getByLabel('رقم الجوال').fill('0500000000');
  await page.getByLabel('المسمى الوظيفي').fill('مديرة مشاريع');
  await page.getByLabel('جهة العمل').fill('جهة الاختبار');
  await page.getByLabel('سنوات الخبرة').fill('8');
  await save.click();

  // القياس: سؤال في كل إطار، وفاصل بين الإطارين، ثم الإرسال
  await expect(page.getByRole('heading', { name: 'لنحدد نقطة انطلاقك' })).toBeVisible();
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await page.getByRole('radio', { name: /غالبًا/ }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت ثلث الطريق' })).toBeVisible();
  await page.getByRole('button', { name: /واصل إلى/ }).click();
  await page.getByRole('radio', { name: /تغير سلوك المستفيدين/ }).click();
  await expect(page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' })).toBeVisible();
  await page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }).click();

  // قبل الاعتماد: النتيجة مبدئية والكتيب مقفل
  await expect(page.getByRole('heading', { name: /نتيجتك قيد المراجعة/ })).toBeVisible();
  await expect(page.getByText('نتيجتك المبدئية جاهزة، ويراجعها المستشار الآن')).toBeVisible();
  await expect(page.getByRole('button', { name: 'افتح كتيبي' })).toHaveCount(0);

  const sent = (a) => srv.calls.filter((c) => c.action === a);
  expect(sent('auth.start').at(-1)).toMatchObject({ email: 'sara@x.sa', full_name: 'سارة عبدالله الأحمد' });
  expect(sent('auth.verify')).toHaveLength(2);
  expect(sent('profile.save')[0].fields).toMatchObject({ phone: '0500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة الاختبار' });
  expect(sent('assessment.answer').map((c) => [c.question_id, c.k])).toEqual([['q1', 3], ['q2', 1]]);
  expect(sent('assessment.submit')).toHaveLength(1);
  // الجلسة محفوظة: التحديث يعيد المشارك إلى رحلته لا إلى الدخول
  await page.reload();
  await expect(page.getByRole('heading', { name: /نتيجتك قيد المراجعة/ })).toBeVisible();
});

test('رحلة المشارك: بعد الاعتماد يفتح الكتيب، ويتم الباب بالاختبار والتأمل، ثم النماذج', async ({ page }) => {
  const srv = await mount(page);
  Object.assign(srv.s, { profileDone: true, assessed: true, approved: true });
  await page.addInitScript(() => localStorage.setItem('mi_leaders_session', 'tok-journey-000000000000000000'));
  await page.goto(APP);

  await expect(page.getByRole('heading', { name: /رحلتك مفتوحة/ })).toBeVisible();
  await page.getByRole('button', { name: 'افتح كتيبي' }).click();
  await expect(page.getByRole('heading', { name: 'كتيب القائد' }).first()).toBeVisible();
  await expect(page.getByText('نسخة شخصية مرخصة باسم')).toBeVisible();

  await page.getByRole('button', { name: 'ابدأ القراءة' }).click();
  await expect(page.getByRole('img', { name: 'المعالم نقاط قرار' })).toBeVisible();
  const done = page.getByRole('button', { name: 'أتممت الباب' });
  await expect(done).toBeDisabled();
  await page.getByRole('button', { name: 'نقطة قرار' }).click();
  await page.getByPlaceholder('اكتب تأملك على عملك الحقيقي. سطران يكفيان.').fill('معلم التسليم الأول مر دون قرار بالإيقاف أو الاستمرار.');
  await done.click();
  await expect(page.getByText('+20 نقطة أضيفت إلى رصيدك')).toBeVisible();
  await expect(page.getByText('المعلم نقطة قرار.')).toBeVisible();

  const complete = srv.calls.find((c) => c.action === 'handbook.complete');
  expect(complete).toMatchObject({ id: 'c1', answers: [1] });
  expect(complete.reflection).toContain('معلم التسليم');

  await page.getByRole('tab', { name: /النماذج التعليمية/ }).click();
  await expect(page.getByText('مصفوفة المسؤوليات')).toBeVisible();
});
