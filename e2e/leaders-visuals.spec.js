// اللوحات المرئية للمبادرة (Visuals.jsx وvisuals.js): جانت بعلاقاته ومساره الحرج، والشبكة، وأداة العلاقات ومعاينتها في فصل الجدول
// التصور: docs/content/2026-11-15-تصور-اللوحات-المرئية-للمبادرة-v1.md
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const COLS = ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية', 'يعتمد على'];
const ACTS = [
  ['A1', 'تحليل البيانات', '2026-02-01', '2026-02-19', ''],
  ['A2', 'تصميم الحل', '2026-02-20', '2026-03-20', 'A1'],
  ['A3', 'تدريب الفريق', '2026-03-01', '2026-03-10', 'A1 SS+5'],
  ['A4', 'الإطلاق', '2026-03-21', '2026-04-10', 'A2، A3'],
];
const DOC = {
  meta: { ref: 'MI-CP-0042', version: 1, status: 'draft', status_title: 'قيد البناء', initiative: 'موعد أول أقرب', scope_title: 'مشروع', readiness: 60, participant: { name: 'سارة' } },
  summary: '', cost: null, checks: [], review: null, sponsor: null, rubric: [],
  sections: [
    { key: 'schedule', title: 'الجدول الزمني والمسار الحرج', dimension: 'milestone', fields: [{ key: 'activities', label: 'الأنشطة', type: 'table', columns: COLS, value: ACTS }] },
    { key: 'milestone-register', title: 'سجل المعالم', dimension: 'milestone', fields: [{ key: 'milestones', label: 'المعالم', type: 'table', columns: ['المعلم', 'النوع', 'التاريخ المستهدف', 'القرار عنده', 'صاحب القرار'], value: [['اعتماد التصميم', 'حوكمي', '2026-03-20', 'المضي في الإطلاق', 'المدير الطبي']] }] },
  ],
};
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};
function server(level = 'intermediate') {
  const calls = [];
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return { success: true, initiative: 'موعد أول أقرب', scope: 'project', scope_title: 'مشروع', level, track: null,
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
        sections: [{ id: 'm-s', key: 'schedule', title: 'الجدول الزمني والمسار الحرج', icon: '◆', dimension: 'milestone', complete: true, missing: 0 }, { id: 'm-m', key: 'milestone-register', title: 'سجل المعالم', icon: '◆', dimension: 'milestone', complete: true, missing: 0 }],
        checks: [], readiness: 60, ready_min: 80, card: { state: 'approved', sla: 'x' }, can_submit: false, blocker: 'x', rubric: [], examples: { doc: false } };
      case 'capstone.doc': return { success: true, doc: DOC };
      case 'models.get': return { success: true, model: { id: 'm-s', key: 'schedule', dimension: 'milestone', title_ar: 'الجدول الزمني والمسار الحرج', points: 20, min_level: 'beginner', level,
        fields: [{ key: 'activities', type: 'table', label: 'الأنشطة', required: true, columns: COLS }] }, submission: { status: 'draft', answers: { activities: ACTS } }, initiative: 'موعد أول أقرب', imports: {}, capstone: { status: 'draft', locked: false } };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { calls, reply };
}
async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-viz-0000000000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('لوحة المبادرة: جانت بعلاقاته ومساره الحرج ومعلمه، والشبكة، والنقر يفتح الفصل', async ({ page }) => {
  await open(page, server());
  await page.getByRole('button', { name: 'افتح اللوحة' }).click();
  await expect(page.getByRole('heading', { name: 'موعد أول أقرب مرئية' })).toBeVisible();
  const stats = page.locator('.viz-stats');
  await expect(stats).toContainText('4');
  await expect(stats).toContainText('69');
  const svg = page.locator('.viz-scroll svg');
  await expect(svg).toHaveAttribute('aria-label', 'مخطط جانت: 4 نشاطًا و1 معلمًا');
  await expect(svg.locator('[data-code]')).toHaveCount(4);
  await expect(svg.locator('path[marker-end]')).toHaveCount(4);
  await expect(svg.getByText('SS+5')).toBeVisible();
  // اللوحات بحسب فصول الوثيقة: الجدول والمعالم هنا، فثلاث لوحات
  await expect(page.getByRole('tablist', { name: 'اللوحات' }).getByRole('tab')).toHaveText(['المخطط الزمني والعلاقات', 'الشبكة والمسار الحرج', 'خارطة المعالم']);
  await page.getByRole('tab', { name: 'خارطة المعالم' }).click();
  await expect(page.locator('.viz-scroll svg')).toHaveAttribute('aria-label', 'خارطة المعالم: 1 معلمًا');
  await page.getByRole('tab', { name: 'الشبكة والمسار الحرج' }).click();
  await expect(page.getByText('المسار الحرج: A1 ← A2 ← A4.')).toBeVisible();
  // العقدة تحت نصها: النقر على مجموعتها كما يفعل المستخدم على أي جزء منها
  await page.locator('.viz-scroll svg [data-code="A2"] rect').click({ force: true });
  await expect(page.getByRole('heading', { name: 'الجدول الزمني والمسار الحرج' })).toBeVisible();
});

test('فصل الجدول: أداة العلاقة تكتب الصيغة ووصفها، والمعاينة الحية تتحدث', async ({ page }) => {
  await open(page, server());
  await page.getByRole('button', { name: /الجدول الزمني والمسار الحرج/ }).first().click();
  await expect(page.locator('.sched-preview svg')).toBeVisible();
  await expect(page.locator('.dep-list').getByText('يبدأ مع بدء A1 بعد 5 أيام')).toBeVisible();
  const row4 = page.locator('.mtable tbody tr').nth(3);
  await row4.getByRole('button', { name: '+ علاقة' }).click();
  const pop = row4.getByRole('group', { name: /علاقة جديدة/ });
  await pop.getByLabel('النشاط السابق').selectOption('A1');
  await pop.getByLabel('العلاقة').selectOption('FF');
  await pop.getByRole('button', { name: 'أضف' }).click();
  await expect(row4.getByRole('textbox', { name: 'يعتمد على 4' })).toHaveValue('A2، A3، A1 FF');
  await expect(row4.locator('.dep-list').getByText('ينتهي مع انتهاء A1')).toBeVisible();
  await expect(page.locator('.sched-preview svg path[marker-end]')).toHaveCount(5);
});

test('التأسيسي يرى «بعد انتهاء» وحدها: لا اختيار لنوع العلاقة', async ({ page }) => {
  await open(page, server('beginner'));
  await page.getByRole('button', { name: /الجدول الزمني والمسار الحرج/ }).first().click();
  await page.locator('.mtable tbody tr').nth(1).getByRole('button', { name: '+ علاقة' }).click();
  await expect(page.getByLabel('العلاقة')).toHaveCount(0);
  await expect(page.getByText('يبدأ بعد أن ينتهي النشاط السابق')).toBeVisible();
});
