// خريطة عمليات إدارة المشاريع في الرحلة واللوحة (المرحلة الثالثة، قرار المالك 2026-11-11): متطلب «أداة من المختبر»
// في التدريب يعرض أفضل نتيجة وعتبة الإتقان ويفتح الأداة، ومعاينة الإدارة بأي مستوى، وتحليل البطاقات. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { boardCardStats, publicSpec, validateLab } from '../supabase/functions/leaders-api/lab.js';
import { ITEMS } from '../scripts/lab/pm-map.mjs';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SPEC = validateLab(ITEMS[0].spec);
const MAP_I = SPEC.steps.findIndex((s) => s.id === 'map');
const ITEM = { id: 'L-pm', kind: 'tool', dimension: 'milestone', title: ITEMS[0].title_ar, summary: ITEMS[0].summary_ar, minutes: 25, points: 60, min_level: 'beginner', chapter_key: 'ch1', progress: { best: 62, open: null, attempts: 1, first: 62, last_at: null } };
const REQ = { id: 'r9', code: 'T-PMMAP', kind: 'lab', title_ar: 'خريطة عمليات إدارة المشاريع في المختبر', required: true, status: 'pending',
  help_ar: 'بعد الباب الأول من كتيب المعلم: ابنِ الخريطة الكلاسيكية للعمليات في المختبر.',
  activity: { type: 'lab', done: false, lab_key: 'pm-process-map', item_id: 'L-pm', title: ITEM.title, attempts: 1, best: 62, accept: 'mastery', mastery: 70 } };

test('الرحلة: متطلب الخريطة في التدريب يعرض أفضل نتيجة والإتقان، ولا يُؤشَّر يدويًا، ويفتح الأداة نفسها', async ({ page }) => {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'lab.list') return route.fulfill({ json: { success: true, items: [ITEM], points: { total: 0, rank: { title: 'مستكشف', next: null } } } });
    if (b.action === 'lab.start') return route.fulfill({ json: { success: true, item: { ...ITEM, level: 'beginner' }, spec: publicSpec(SPEC, (x) => x, 'beginner'), attempt: { id: 'a1', meters: {}, path: [], results: {}, answers: {}, current: 0, done: false, draft: null, hints: {}, checks_used: 0 } } });
    const r = srv.reply(b);
    if (b.action === 'me' && r?.journey) {
      const t = r.journey.find((s) => s.key === 'training');
      t.items = [...t.items, REQ]; t.total += 1;
    }
    return route.fulfill({ json: r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(APP);
  const li = page.locator('li.item', { hasText: 'خريطة عمليات إدارة المشاريع في المختبر' });
  await expect(li).toContainText('أفضل نتيجة 62%، والإتقان 70%. يكتمل حين تبلغ 70% في أفضل محاولة.');
  // يوثَّق من محاولاته لا بنقرة
  await expect(li.getByRole('button', { name: /أنجزته/ })).toHaveCount(0);
  await li.getByRole('button', { name: 'افتح في المختبر' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'lab.start')?.id).toBe('L-pm');
  await expect(page.getByRole('heading', { name: ITEM.title })).toBeVisible();
});

async function admin(page) {
  const calls = [];
  const attempts = [
    { answers: { [MAP_I]: { 'p8-2': ['quality', 'mc'] } }, hints: { [MAP_I]: { 'p8-2': 2 } } },
    { answers: { [MAP_I]: { 'p8-2': ['quality', 'mc'], 'p8-3': ['quality', 'mc'] } }, hints: {} },
  ];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.lab': { success: true, audiences: { granted: 'لمن تُفتح لهم فقط', all: 'لكل المعتمدين بحسب المستوى' }, mastery: 70, grants: [], orgs: [],
        items: [{ id: 'L-pm', key: 'pm-process-map', kind: 'tool', dimension: 'milestone', chapter_key: 'ch1', min_level: 'beginner', sort: 6, title_ar: ITEM.title, minutes: 25, points: 60, active: true, audience: 'granted', stats: { people: 2, attempts: 2, avg_best: 66, mastered: 1 } }] },
      'admin.lab-preview': { success: true, item: { ...ITEM, level: b.level }, spec: publicSpec(SPEC, (x) => x, b.level) },
      'admin.lab-cards': { success: true, boards: [{ step: MAP_I, title: SPEC.steps[MAP_I].title_ar, rows: SPEC.steps[MAP_I].rows, cols: SPEC.steps[MAP_I].cols, attempts: 2, cards: boardCardStats(SPEC.steps[MAP_I], MAP_I, attempts) }] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'مختبر القائد' }).click();
  return calls;
}

test('الإدارة: معاينة الأداة كمشارك بكل مستوى، فتظهر السقالة وتتلاشى، ورؤوس الصفوف للاحترافي وحده', async ({ page }) => {
  const calls = await admin(page);
  await page.getByRole('button', { name: `عاين ${ITEM.title} كمشارك` }).click();
  const pv = page.getByRole('region', { name: `معاينة ${ITEM.title}` });
  await expect(pv.getByRole('radio', { name: 'تأسيسي' })).toHaveAttribute('aria-checked', 'true');
  await expect(pv.getByText(/صف محلول مثالًا، ورقم كل بطاقة ظاهر/)).toBeVisible();
  await expect(pv.locator('[data-card="p5-3"]')).toContainText('3.5');
  await expect(pv.getByText('لا تظهر لهذا المستوى')).toBeVisible();
  // اللوحة تُجرَّب محليًا في المعاينة
  await pv.locator('[data-card="p5-3"]').click();
  await pv.getByRole('gridcell', { name: /^التخطيط × إدارة نطاق المشروع/ }).click();
  await expect(pv.getByRole('gridcell', { name: /^التخطيط × إدارة نطاق المشروع/ }).locator('[data-card="p5-3"]')).toBeVisible();
  await pv.getByRole('radio', { name: 'احترافي' }).click();
  // لوحتان للاحترافي: رؤوس الصفوف ثم الخريطة، كلتاهما بلا سقالة
  await expect(pv.getByText(/بلا عدّادات ولا أرقام ولا فحص قبل الإرسال/)).toHaveCount(2);
  await expect(pv.locator('[data-card="p5-3"]').first()).not.toContainText('3.5');
  await expect(pv.getByText('لا تظهر لهذا المستوى')).toHaveCount(0);
  expect(calls.filter((c) => c.action === 'admin.lab-preview').map((c) => c.level)).toEqual(['beginner', 'advanced']);
  expect(calls.some((c) => c.action === 'lab.start')).toBe(false);
});

test('الإدارة: تحليل البطاقات يرتّب الأضعف أولًا بأكثر خانة خاطئة ومتوسط التلميح', async ({ page }) => {
  await admin(page);
  await page.getByRole('button', { name: `تحليل بطاقات ${ITEM.title}` }).click();
  const sec = page.getByRole('region', { name: `تحليل بطاقات ${ITEM.title}` });
  await expect(sec.getByText(/2 إجابة \(بلا حساب العرض وحسابات الاختبار\)/)).toBeVisible();
  const first = sec.locator('tbody tr').first();
  await expect(first).toContainText('إدارة الجودة');
  await expect(first).toContainText('0%');
  await expect(first).toContainText('المتابعة والتحكم × إدارة جودة المشروع (2)');
  await expect(first).toContainText('1');
});
