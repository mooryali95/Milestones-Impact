// الجاهزية (أ7): إتاحة تطبيق المشارك. axe (WCAG 2.0/2.1 A وAA) على الشاشات الخمس: الدخول، الرحلة، القياس، المقيّم، 360،
// بعرض الهاتف (390) والمكتب (1280). يفشل على كل مخالفة خطورتها serious أو critical. ووسما theme-color وcolor-scheme
// يطابقان الوضع الفاتح الفعلي. الخلفية خادم المحاكاة نفسه (shared/video/mock-server.js).
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const AXE = require.resolve('axe-core/axe.min.js');
const APP = 'http://localhost:4304/';
const LIKERT = ['نادرًا أو أبدًا', 'في أقل من نصف المرات', 'في نحو نصف المرات', 'في أغلب المرات', 'في كل المرات تقريبًا'].map((label, k) => ({ k, label }));
const SETTINGS = { min_group: 3, min_others: 3, caps: { manager: 1, peer: 6, report: 6, stakeholder: 3 }, window_days: 14, round_gap_days: 90, scale_labels: LIKERT.map((o) => o.label) };
const GROUPS = { manager: 'المدير المباشر', peer: 'الزملاء', report: 'أعضاء الفريق', stakeholder: 'أصحاب المصلحة' };
const f360 = { success: true, enabled: true, ready: true, settings: SETTINGS, groups: GROUPS, next: { ok: false, reason: 't1_running' }, self_answers: {},
  cycles: [{ id: 'c1', wave: 't1', status: 'nominating', self_done: false, nominees: [], counts: {} }],
  self_items: [{ id: 'q1', dimension: 'milestone', text: 'أوضح للفريق ما المطلوب في المرحلة القادمة.', options: [...LIKERT, { k: 5, label: 'لا ينطبق على عملي' }] }] };
const rater = { success: true, done: false, participant: 'سارة الأحمد', relation: 'المدير المباشر', rater: null, questions: [
  { id: 'q1', dimension: 'milestone', text: 'يختم الاجتماع بقرار موثق.', options: [...LIKERT, { k: 5, label: 'لا أستطيع الحكم' }] }] };

async function mount(page, state, session = true) {
  const srv = createMockServer();
  Object.assign(srv.s, state);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const extra = { 'f360.mine': f360, 'rater.get': rater }[b.action];
    await route.fulfill({ json: extra ?? srv.reply(b) });
  });
  await page.addInitScript((s) => {
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
    if (s) localStorage.setItem('mi_leaders_session', 'tok-demo-recording-000000000000');
  }, session);
}

const READY = { named: true, profileDone: true, assessed: true, approved: true };
const SCREENS = [
  ['الدخول', async (page) => { await mount(page, {}, false); await page.goto(APP); await expect(page.locator('input[type="email"]').first()).toBeVisible(); }],
  ['الرحلة', async (page) => { await mount(page, READY); await page.goto(APP); await expect(page.locator('[data-tour^="nav-"]').filter({ visible: true }).first()).toBeVisible(); }],
  ['القياس', async (page) => { await mount(page, { named: true, profileDone: true }); await page.goto(APP);
    await page.getByRole('button', { name: 'ابدأ', exact: true }).click();
    await expect(page.getByText('أراجع المعالم مع فريقي', { exact: false }).first()).toBeVisible();
  }],
  ['المقيّم', async (page) => {
    await mount(page, {}, false); await page.goto(`${APP}rate?t=abcdefghijklmnopqrstuvwxyz`);
    await page.getByRole('button', { name: 'ابدأ' }).click();
    await expect(page.getByRole('heading', { name: /سارة الأحمد/ })).toBeVisible();
  }],
  ['360', async (page) => {
    await mount(page, READY); await page.goto(APP);
    await page.locator('[data-tour="nav-profile"]').filter({ visible: true }).first().click();
    await page.getByRole('region', { name: 'تقييم 360 للتطوير' }).getByRole('button', { name: 'افتح تقييم 360' }).click();
    await expect(page.getByRole('radiogroup', { name: /ما المطلوب في المرحلة القادمة/ })).toBeVisible();
  }],
];

async function axe(page) {
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    if (!r.passes.length) return ['axe: لم يفحص شيئًا'];
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
  });
}

for (const width of [390, 1280]) {
  for (const [name, open] of SCREENS) {
    test(`axe على «${name}» بعرض ${width}: لا مخالفة serious أو critical`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await open(page);
      const found = await axe(page);
      if (process.env.A11Y_SHOTS) await page.screenshot({ path: `${process.env.A11Y_SHOTS}/r7-${info.title.includes('360') ? '360' : name}-${width}.png`, fullPage: true });
      expect(found).toEqual([]);
    });
  }
}

test('color-scheme فاتح وtheme-color لون الهوية كما كان', async ({ page }) => {
  await mount(page, {}, false);
  await page.goto(APP);
  const r = await page.evaluate(() => ({
    theme: document.querySelector('meta[name="theme-color"]')?.content,
    scheme: document.querySelector('meta[name="color-scheme"]')?.content,
  }));
  expect(r.scheme).toBe('light');
  expect(r.theme.toUpperCase()).toBe('#0B272F');
});
