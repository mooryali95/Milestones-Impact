// لوحة «خريطة عمليات إدارة المشاريع» في المختبر (التصور المعتمد 2026-11-11): الوضع باللمس ولوحة المفاتيح،
// والسقالة بحسب المستوى، والتصحيح بالخريطة الحرارية. الخلفية مُحاكاة بالمحرك الحقيقي (lab.js) ومحتوى pm-map.mjs.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';
import { gradeStep, nextIndex, publicSpec, validateLab } from '../supabase/functions/leaders-api/lab.js';
import { ITEMS } from '../scripts/lab/pm-map.mjs';

const APP = 'http://localhost:4304/';
const SPEC = validateLab(ITEMS[0].spec);
const MAP = SPEC.steps.findIndex((s) => s.id === 'map');
const ITEM = { id: 'L-pm', kind: 'tool', dimension: 'milestone', title: ITEMS[0].title_ar, summary: ITEMS[0].summary_ar, minutes: 25, points: 60, min_level: 'beginner', chapter_key: 'ch1', progress: { best: null, open: null, attempts: 0, first: null, last_at: null } };

// يبدأ المحاولة عند خطوة اللوحة مباشرة (المسار: الترتيب أُجيب)
async function openBoard(page, level, { width = 1280, onAnswer } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'lab.list') return route.fulfill({ json: { success: true, items: [ITEM], points: { total: 0, rank: { title: 'مستكشف', next: null } } } });
    if (b.action === 'lab.start') {
      return route.fulfill({ json: { success: true, item: { ...ITEM, level }, spec: publicSpec(SPEC, (x) => x, level),
        attempt: { id: 'att1', meters: {}, path: [0], results: { 0: { score: 1 } }, answers: {}, current: MAP, done: false } } });
    }
    if (b.action === 'lab.answer') {
      const result = gradeStep(SPEC.steps[b.step], b.answer, { level });
      onAnswer?.(b, result);
      return route.fulfill({ json: { success: true, step: b.step, result, next: nextIndex(SPEC, b.step, b.answer, level), meters: {}, finish: null } });
    }
    return route.fulfill({ json: srv.reply(b) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_session', 't'.repeat(40)); localStorage.setItem('mi_leaders_welcome_seen', 'true'); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(APP);
  await page.locator('[data-tour="nav-lab"]').locator('visible=true').first().click();
  await page.getByRole('button', { name: /خريطة عمليات إدارة المشاريع/ }).click();
  await expect(page.getByRole('grid', { name: 'الخريطة' })).toBeVisible();
  return calls;
}
const cell = (page, col, row) => page.getByRole('gridcell', { name: new RegExp(`^${col} × ${row}`) });
const tray = (page) => page.getByRole('group', { name: /البطاقات المتبقية/ });

test('التأسيسي على جوال 390px: صف التكامل محلول، والرقم والعدّاد لكل خانة ظاهران، والوضع باللمس', async ({ page }) => {
  await openBoard(page, 'beginner', { width: 390 });
  await expect(page.getByText(/المساعدة على قدر مستواك \(تأسيسي\)/)).toBeVisible();
  await expect(tray(page).getByRole('button')).toHaveCount(42);
  // الرقم «س.ص» ظاهر على البطاقة
  await expect(tray(page).getByRole('button', { name: /تحديد النطاق/ }).first()).toContainText('3.5');
  // الصفوف مطوية: أول صف غير محلول (النطاق) مفتوح بخلاياه الخمس، بعدّاد لكل خانة، والباقي مطوي
  await expect(page.getByRole('button', { name: /إدارة نطاق المشروع/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /إدارة تكلفة المشروع/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('gridcell')).toHaveCount(5);
  const planScope = cell(page, 'التخطيط', 'إدارة نطاق المشروع');
  await expect(planScope).toHaveAccessibleName(/0 من 4/);
  await tray(page).getByRole('button', { name: /تجميع المتطلبات/ }).click();
  await expect(page.locator('.lb-status')).toContainText('تجميع المتطلبات');
  await planScope.click();
  await expect(planScope.getByRole('button', { name: /تجميع المتطلبات/ })).toBeVisible();
  await expect(planScope).toHaveAccessibleName(/1 من 4/);
  await expect(tray(page).getByRole('button')).toHaveCount(41);
  // لا تمرير أفقي للصفحة على الجوال، والصينية الثابتة فوق شريط التنقل السفلي لا تحته
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const trayBox = await page.locator('.lb-trayzone').boundingBox();
  const barBox = await page.locator('.tabbar').boundingBox();
  expect(trayBox.y + trayBox.height).toBeLessThanOrEqual(barBox.y + 1);
  // صف التكامل مثال محلول: بطاقاته في خاناتها ومقفلة
  await page.getByRole('button', { name: /إدارة تكامل المشروع/ }).click();
  await expect(cell(page, 'البدء', 'إدارة تكامل المشروع').getByRole('button', { name: /وضع ميثاق المشروع/ })).toHaveAttribute('aria-disabled', 'true');
});

test('لوحة المفاتيح وحدها: مسافة تلتقط، والأسهم تتنقل (الأيمن نحو البدء)، ومسافة تُفلت، وEsc يلغي، وكل حركة تُعلن', async ({ page }) => {
  await openBoard(page, 'intermediate');
  // المتوسط: لا رقم على البطاقات، وعدّاد لكل عمود
  await expect(tray(page).getByRole('button', { name: /ضبط الجودة/ })).not.toContainText('3.8');
  await expect(page.getByRole('columnheader', { name: /التخطيط/ })).toContainText('0/24');
  const card = tray(page).getByRole('button', { name: /^ضبط الجودة/ });
  await card.focus();
  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  // التركيز على أول خانة (البدء × التكامل)، ثم ثلاث خطوات يسارًا إلى المتابعة وأربع إلى الأسفل إلى الجودة
  await expect(cell(page, 'البدء', 'إدارة تكامل المشروع')).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  const target = cell(page, 'المتابعة والتحكم', 'إدارة جودة المشروع');
  await expect(target).toBeFocused();
  await page.keyboard.press('Space');
  await expect(target.getByRole('button', { name: /ضبط الجودة/ })).toBeVisible();
  await expect(page.locator('.lb [aria-live="polite"]')).toHaveText('«ضبط الجودة»: في المتابعة والتحكم × إدارة جودة المشروع. عدد البطاقات في الخانة 1.');
  await expect(page.getByRole('columnheader', { name: /المتابعة والتحكم/ })).toContainText('1/12');
  // Esc يلغي الالتقاط ويعيد التركيز إلى الصينية
  const other = tray(page).getByRole('button', { name: /^إدارة الجودة/ });
  await other.focus();
  await page.keyboard.press('Enter');
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(other).toHaveAttribute('aria-pressed', 'false');
  await expect(other).toBeFocused();
});

test('الاحترافي: بلا رقم ولا عدّاد، والإرسال يعيد درجة المحورين والخريطة الحرارية واللوحة الصحيحة', async ({ page }) => {
  let sent = null;
  await openBoard(page, 'advanced', { onAnswer: (b) => { sent = b; } });
  await expect(page.getByText(/بلا عدّادات ولا أرقام/)).toBeVisible();
  await expect(page.locator('.lb-count')).toHaveCount(0);
  const send = page.getByRole('button', { name: 'أرسل الإجابة' });
  await expect(send).toBeDisabled();
  // يضع كل بطاقة في خانتها، إلا ثلاثًا في عمود خطأ (إدارة الجودة وإدارة التواصل في المتابعة، والتحقق من النطاق في التخطيط)
  const wrong = { 'p8-2': 'mc', 'p10-2': 'mc', 'p5-5': 'plan' };
  const rowLabel = Object.fromEntries(SPEC.steps[MAP].rows.map((r) => [r.id, r.label]));
  const colLabel = Object.fromEntries(SPEC.steps[MAP].cols.map((c) => [c.id, c.label]));
  for (const c of SPEC.steps[MAP].cards) {
    await tray(page).locator(`[data-card="${c.id}"]`).click();
    await cell(page, colLabel[wrong[c.id] || c.col], rowLabel[c.row]).click();
  }
  await expect(tray(page).getByRole('button')).toHaveCount(0);
  await send.click();
  expect(Object.keys(sent.answer)).toHaveLength(49);
  await expect(page.locator('.lb-score-line')).toHaveText('في خانتها 46 من 49، ومحور واحد صحيح في 3.');
  await expect(page.locator('.lb-mixups li').first()).toHaveText('خلطت بين التنفيذ والمتابعة والتحكم في بطاقتين: إدارة الجودة، إدارة التواصل.');
  await expect(page.getByRole('table')).toBeVisible();
  const placed = cell(page, 'المتابعة والتحكم', 'إدارة جودة المشروع').getByRole('button', { name: /^إدارة الجودة/ });
  await expect(placed).toHaveClass(/is-half/);
  await page.getByRole('button', { name: 'اعرض اللوحة الصحيحة' }).click();
  await expect(cell(page, 'التنفيذ', 'إدارة جودة المشروع').getByRole('button', { name: /^إدارة الجودة/ })).toBeVisible();
  await page.getByText(/لماذا أخطأت في 3 بطاقات/).click();
  await expect(page.getByText(/«إدارة» الجودة تطبيق معاييرها أثناء العمل/)).toBeVisible();
});
