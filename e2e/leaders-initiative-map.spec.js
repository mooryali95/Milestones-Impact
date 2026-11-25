// خريطة المبادرة: «ما المبادرة؟»، وفهرس الوثيقة بمراحله وشريطه والناقص منه، والتنقل بين الفصول،
// وتلميح المصطلح، والإحالة إلى الكتاب والعودة إلى الفصل نفسه.
// التصور: docs/content/2026-11-15-تصور-فهم-المبادرة-وإخراج-وثيقتها-v1.md
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const S = (id, key, title, dimension, extra = {}) => ({ id, key, title, icon: '◆', dimension, complete: false, missing: 2, status: null, ...extra });
const SECTIONS = [
  S('m1', 'initiative-charter', 'بطاقة المبادرة', 'milestone', { complete: true, missing: 0, status: 'draft' }),
  S('m2', 'options-analysis', 'المبرر والبدائل', 'impact', { status: 'draft' }),
  S('m3', 'benefits-register', 'سجل المنافع', 'impact'),
  S('m4', 'raid', 'سجل المخاطر والافتراضات والاعتماديات', 'milestone'),
];

function server({ initiative = 'موعد أول أقرب', chapters = [{ id: 'hb-ch4', dimension: 'milestone', chapter_key: 'ch4', title: 'إعادة تعريف المعلم', done: null }] } = {}) {
  const calls = [];
  const model = (id) => {
    const s = SECTIONS.find((x) => x.id === id);
    return { id, key: s.key, dimension: s.dimension, title_ar: s.title, points: 20, min_level: 'beginner', level: 'beginner',
      fields: [{ key: 'items', type: 'table', label: 'البنود', required: true, columns: ['الوصف', 'الاحتمال (1 إلى 5)', 'خط الأساس'] }] };
  };
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return {
        success: true, initiative, scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
        sections: SECTIONS, checks: [{ key: 'benefit-owner', ok: false, title: 'كل منفعة لها مالك' }], readiness: 20, ready_min: 80,
        card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [], examples: { doc: false },
      };
      case 'models.get': return { success: true, model: model(b.id), submission: { status: 'draft', answers: {} }, initiative, imports: {}, capstone: { status: 'draft', locked: false } };
      case 'handbook.toc': return { success: true, name: 'سارة الأحمد', code: 'M1I1L1', chapters, points: { total: 0, rank: { title: 'مستكشف', next: null } }, models: { total: 4, submitted: 0 } };
      case 'handbook.chapter': return { success: true, reading: null, chapter: { id: b.id, dimension: 'milestone', title: 'إعادة تعريف المعلم', md: '## أساسيات الضبط حول المعلم\nنص.' }, quiz: [], reflection: '', done: null, watermark: 'x' };
      case 'handbook.ping': return { success: true, reading: null };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { calls, reply };
}

async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-imap-000000000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('«ما المبادرة؟» مفتوحة لمن لم يسمّ مبادرته، بالفرق بين المبادرة والمشروع والبرنامج والمحفظة ونطاقه معلَّم', async ({ page }) => {
  await open(page, server({ initiative: null }));
  const m = page.locator('[data-meaning]');
  await expect(m).toHaveAttribute('open', '');
  for (const t of ['المبادرة', 'المشروع', 'البرنامج', 'المحفظة']) await expect(m.getByRole('listitem').filter({ hasText: t }).first()).toBeVisible();
  await expect(m.locator('.im-level.mine')).toContainText('نطاقك');
  await expect(m).toContainText('اختبار سريع');
});

test('من سمّى مبادرته: البطاقة مطوية، وخط الوثيقة بمراحله وحالاته وسطر رأسه والتالي، وبوابة البطاقة على الخط', async ({ page }) => {
  await open(page, server());
  await expect(page.locator('[data-meaning]')).not.toHaveAttribute('open', '');
  const sp = page.getByRole('complementary', { name: 'خط الوثيقة' });
  await expect(sp.locator('.sp-phase')).toHaveCount(3);
  await expect(sp.locator('.sp-phase').first()).toContainText('لماذا هذه المبادرة؟');
  await expect(sp.locator('[data-spine-line]')).toContainText('أنجزت 0 من 4');
  await expect(sp.locator('[data-spine-line]')).toContainText('التالي: بطاقة المبادرة');
  await expect(sp.locator('.sp-node')).toHaveCount(4);
  await expect(sp.locator('[data-chapter="options-analysis"]')).toHaveAttribute('data-state', 'writing');
  await expect(sp.locator('[data-chapter="benefits-register"]')).toHaveAttribute('data-state', 'empty');
  await expect(sp.locator('[data-chapter="benefits-register"] .sp-check')).toBeVisible();
  await expect(sp.locator('[data-gate="card"]')).toContainText('تم');
  await expect(sp.locator('[data-gate="submit"]')).toBeVisible();
});

test('داخل الفصل: الخط نفسه بالفصل الحالي، و«الفصل N من M · المرحلة»، والتنقل من الخط، وتلميح المصطلح', async ({ page }) => {
  await open(page, server());
  await page.getByRole('complementary', { name: 'خط الوثيقة' }).getByRole('button', { name: /المبرر والبدائل/ }).click();
  const sp = page.getByRole('complementary', { name: 'خط الوثيقة' });
  await expect(page.locator('[data-chapter-where]')).toContainText('الفصل 2 من 4 · لماذا هذه المبادرة؟');
  await expect(sp.locator('[aria-current="step"]')).toContainText('المبرر والبدائل');
  await sp.getByRole('button', { name: /سجل المنافع/ }).click();
  await expect(page.getByRole('heading', { name: 'سجل المنافع' })).toBeVisible();
  await expect(page.locator('[data-chapter-where]')).toContainText('الفصل 3 من 4 · ما القيمة وكيف تُقاس؟');
  const term = page.locator('thead .term[data-term="خط الأساس"]');
  await term.focus();
  await expect(term.locator('.term-tip')).toBeVisible();
  await expect(term.locator('.term-tip')).toContainText('قيمة المؤشر اليوم قبل أن تبدأ');
  await expect(term).toHaveAccessibleDescription(/قيمة المؤشر اليوم/);
  await expect(page.locator('[data-finish]')).toContainText('أنهيت الفصل ← التالي');
  await expect(page.getByText('يقرؤه')).toHaveCount(0);
});

test('«اقرأ في الكتاب» يفتح الباب نفسه وفوقه القسم المطلوب، و«عد» يعيد إلى الفصل الذي خرج منه', async ({ page }) => {
  const srv = server();
  await open(page, srv);
  await page.getByRole('complementary', { name: 'خط الوثيقة' }).getByRole('button', { name: /سجل المخاطر/ }).first().click();
  await page.getByRole('complementary', { name: 'خط الوثيقة' }).getByRole('button', { name: /اقرأ في الكتاب: أساسيات الضبط حول المعلم/ }).click();
  const seek = page.locator('[data-seek="found"]');
  await expect(seek).toContainText('اقرأ في هذا الباب قسم «أساسيات الضبط حول المعلم»');
  await expect.poll(() => srv.calls.some((c) => c.action === 'handbook.chapter' && c.id === 'hb-ch4')).toBe(true);
  await seek.getByRole('button', { name: /عد إلى «سجل المخاطر/ }).click();
  await expect(page.getByRole('heading', { name: 'سجل المخاطر والافتراضات والاعتماديات' })).toBeVisible();
});

test('باب ليس في كتاب المشارك: تقول الإحالة ذلك صراحة، ولا تفتح بابًا آخر بصمت', async ({ page }) => {
  await open(page, server({ chapters: [{ id: 'other', dimension: 'impact', chapter_key: 'ch1', title: 'باب آخر', done: null }] }));
  await page.getByRole('complementary', { name: 'خط الوثيقة' }).getByRole('button', { name: /سجل المخاطر/ }).first().click();
  await page.getByRole('complementary', { name: 'خط الوثيقة' }).getByRole('button', { name: /اقرأ في الكتاب/ }).click();
  await expect(page.locator('[data-seek="missing"]')).toContainText('ليس في كتابك في مستواك الحالي');
});
