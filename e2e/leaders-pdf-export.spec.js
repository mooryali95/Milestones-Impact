// ملف PDF جاهز للمبادرة (src/lib/brand/pdf.js): من نافذة الوثيقة ومن صفحة المبادرة مباشرة، باسم ثابت وصفحات A4 مقسّمة بقواعد الطباعة
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// سياسة CSP كما تُرسل في الإنتاج: الملف يُبنى تحتها (إطار srcdoc، وخطوط المنصة، وصور data:)
const CSP = readFileSync('leaders-app/public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1];

const APP = 'http://localhost:4304/';
// اسم الملف عربي: المتصفح يحفظه بترميز النظام، فيُشغَّل بـ UTF-8 كأي جهاز مستخدم (بيئة بلا LANG تسقطه إلى «download»)
test.use({ launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } } });
const S = (id, key, title, dimension) => ({ id, key, title, icon: '◆', dimension, complete: true, missing: 0, status: 'draft' });
const SECTIONS = [S('m1', 'initiative-charter', 'بطاقة المبادرة', 'milestone'), S('m2', 'raid', 'سجل المخاطر والافتراضات والاعتماديات', 'milestone')];
const DOC = {
  meta: { ref: 'MI-CP-0042', version: 3, status: 'draft', status_title: 'قيد البناء', initiative: 'موعد أول أقرب', scope: 'project', scope_title: 'مشروع', readiness: 60, participant: { name: 'سارة الأحمد' }, org: { name: 'التجمع الصحي' } },
  summary: 'رسالة القائد لصاحب القرار.',
  sections: [
    { key: 'initiative-charter', title: 'بطاقة المبادرة', dimension: 'milestone', fields: [{ key: 'title', label: 'اسم المبادرة', type: 'text', value: 'موعد أول أقرب' }, { key: 'objective', label: 'الهدف', type: 'textarea', value: 'خفض الانتظار' }, { key: 'start', label: 'البداية', type: 'text', value: '2026-02-01' }] },
    { key: 'raid', title: 'سجل المخاطر والافتراضات والاعتماديات', dimension: 'milestone', fields: [{ key: 'items', label: 'البنود', type: 'table', columns: ['الرمز', 'الوصف', 'الاحتمال (1 إلى 5)', 'شدة الأثر (1 إلى 5)'],
      value: Array.from({ length: 40 }, (_, i) => [`R${i + 1}`, `خطر رقم ${i + 1} يصف ما قد يعيق المبادرة بتفصيل كافٍ للمراجعة`, '3', '4']) }] },
  ],
  cost: null, checks: [], review: null, sponsor: null, rubric: [],
};

function server() {
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  return (b) => {
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return { success: true, initiative: 'موعد أول أقرب', scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' }, sections: SECTIONS, checks: [], readiness: 60, ready_min: 80,
        card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'x', rubric: [], examples: { doc: false } };
      case 'capstone.doc': return { success: true, doc: DOC };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
}

async function open(page) {
  const reply = server();
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.route((u) => u.pathname === '/', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } }); });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-pdf-0000000000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

const pagesOf = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test('«تحميل PDF» في صفحة المبادرة: ملف A4 جاهز باسم الوثيقة وإصدارها، والجدول الطويل يمتد صفحات، تحت سياسة الإنتاج', async ({ page }) => {
  test.setTimeout(120000);
  const csp = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await open(page);
  const dl = page.waitForEvent('download', { timeout: 100000 });
  await page.getByRole('button', { name: 'تحميل PDF' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^ملف-عمل-المبادرة-موعد-أول-أقرب-\d{4}-\d{2}-\d{2}\.pdf$/);
  const buf = readFileSync(await d.path());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pagesOf(buf)).toBeGreaterThanOrEqual(5);
  expect(buf.length).toBeLessThan(6 * 1024 * 1024);
  await expect(page.getByRole('button', { name: 'تحميل PDF' })).toBeEnabled();
  expect(csp).toEqual([]);
});

test('نافذة الوثيقة: «تحميل PDF» بجانب «طباعة»، والملف يُحفظ من المنصة', async ({ page }) => {
  test.setTimeout(120000);
  await open(page);
  const pop = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'ملف العمل الكامل' }).click();
  const w = await pop;
  await expect(w.getByRole('button', { name: 'طباعة' })).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 100000 });
  await w.getByRole('button', { name: 'تحميل PDF' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^ملف-عمل-المبادرة-موعد-أول-أقرب-\d{4}-\d{2}-\d{2}\.pdf$/);
});
