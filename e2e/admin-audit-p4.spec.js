// تدقيق لوحة الإدارة 2026-11-23، المرحلة 4: بطاقات جوال مختصرة للجداول العريضة بلا تمرير أفقي للصفحة على 390،
// وفحص axe (التباين والتسميات) للشاشات الرئيسة، وحماية العرض من «undefined» و«NaN» و«null»، و«قياس الأثر» و«التوجيه»
// تُرسم ببيانات واقعية وناقصة بلا انهيار. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
const AXE = require.resolve('axe-core/axe.min.js');
const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();

const org = { id: 'o1', name: 'هيئة المثال', short_name: 'هم', color: '#12414E', status: 'active', seats: 20, seats_used: 2 };
const people = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i + 1}`, full_name: `مشارك رقم ${i + 1}`, email: `participant.number${i + 1}@example-organization.com`, organization_id: 'o1', organization_name: 'هيئة المثال',
  job_title: i % 2 ? 'مدير إدارة التخطيط الاستراتيجي' : null, status: i % 3 ? 'enrolled' : 'pending_approval', track: i % 2 ? 'M2I2L2' : null,
  placements: [], created_at: `2026-10-0${i + 1}`,
}));

const dim = (n, pre, post) => ({ n, pre, post, diff: post - pre, dz: 0.8, effect: 'كبير', reliable_up: 1, reliable_down: 0, level_up: 1, rater: { n: 1, pre: 2.5, post: 3.1 }, verdicts: { confirmed: 1, emerging: 1 }, response_shift: 0.2 });
// شكل الخادم الكامل (impact.ts) لدفعة صغيرة
const IMPACT_FULL = {
  success: true, counts: { participants: 5, baseline: 3, post: 2, paired: 2 },
  cohort: { milestone: dim(2, 55, 70), impact: dim(2, 50, 61), leadership: dim(2, 60, 66) },
  overall: { n: 2, pre: 55, post: 66, diff: 11, dz: 0.9, effect: 'كبير', reliable_up: 1, reliable_down: 0, verdicts: { confirmed: 1 } },
  config: { rci_reliability: 0.8, source: { milestone: { from_data: false, n: 2 }, overall: { from_data: false } } },
  transfer: [{ code: 't1', text: 'أطبق ما تعلمته في عملي', n: 2, agree_pct: 100, mean: 3.5 }],
  reaction: { n: 2, questions: [{ key: 'q1', type: 'rating', label: 'وضوح المحتوى', n: 2, mean: 4.5, top2_pct: 100, dist: { 4: 1, 5: 1 } }] },
  participants: [
    { id: 'p1', full_name: 'سارة الأحمد', organization: 'هيئة المثال', baseline_at: ago(9000), post_at: ago(60), forms: ['A', 'B'], raters_done: 1, raters_invited: 2,
      overall: { composite_pre: 55, composite_post: 66, change: 11, rci: 2.1, verdict: { key: 'confirmed', sources: ['test', 'rater'] } },
      dimensions: [{ dimension: 'milestone', composite_pre: 55, composite_post: 70, change: 15, rci: 2.2, pre: { level: 'beginner' }, post: { level: 'advanced' }, verdict: { key: 'emerging', sources: ['self'] } }] },
    { id: 'p2', full_name: 'خالد العمر', baseline_at: ago(9000), post_at: null },
  ],
};
// شكل ناقص كما في محاكاة سابقة (admin-next-methodology): إطار واحد، ولا config ولا transfer ولا مقيّمين
const IMPACT_SPARSE = { success: true, counts: { participants: 5, baseline: 3, post: 2, paired: 2 }, cohort: { milestone: { n: 2, pre: 55, post: 70, diff: 15, reliable_up: 1 } },
  participants: [{ id: 'p3', full_name: 'منى', baseline_at: ago(10), overall: { composite_pre: 50, verdict: { key: 'mystery' } }, dimensions: [{ dimension: 'impact', pre: {}, post: {}, verdict: {} }] }] };

const GUIDE_FULL = {
  success: true, model: 'claude-opus-5-5', policy_version: null, can_write: true,
  settings: { enabled: true, cap_usd: 5, daily: 8, monthly: 30, retention_days: 90, extra_rules: '' },
  gate: { eval_ok: false, eval_reason: 'unapproved', pilots: 1, has_key: true }, blockers: ['مجموعة التقييم لم تُعتمد بعد.'], today: { day: '2026-11-16', usd: 1.2 },
  report: { success: true, ready: true, open: true, cap_usd: 5, windows: [{ days: 7, asked: 40, participants: 9, answered: 31, unsure: 5, refused: 4, errors: 0, confirmed: 3, confirm_rate: 7.5, usd: 2.4 }], spend: [{ day: '2026-11-16', usd: 1.2, calls: 18 }] },
  breakdown: { days: 30, orgs: [{ id: 'o1', name: 'هيئة المثال', asked: 80, participants: 14, unsure: 9, confirmed: 5, errors: 0, usd: 4.8 }], cohorts: [] },
};
// لوحة أول يوم: لا تقرير ولا توزيع ولا إنفاق اليوم
const GUIDE_SPARSE = { success: true, model: null, settings: { enabled: false }, gate: {}, blockers: [], today: null, report: null, breakdown: null };

async function setup(page, hash, { size = { width: 1280, height: 900 }, impact = IMPACT_FULL, guide = GUIDE_FULL } = {}) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/functions\/v1\/admin-api/, (route) => route.fulfill({ json: { success: true, contacts: [], sessions: [], passkeys: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [org], unassigned: { total: 0, typed: [] } },
      'admin.participants': { success: true, participants: people },
      'admin.impact': impact,
      'admin.outcomes': { success: true, totals: null, rows: [] },
      'admin.guide-dashboard': guide,
      'admin.guide-eval': { success: true, ready: true, set: { total: 0, kinds: {}, errors: [] }, checks: {}, gate: {}, runs: [] },
      'admin.guide-week': { success: true, days: 7, total: 0, groups: [], reasons: {}, rates: {} },
      'admin.guide-orgs': { success: true, ready: true, orgs: [] },
      'admin.guide-pilots': { success: true, ready: true, cohorts: [] },
      'admin.guide-transcript-access': { success: true, can_read: false, owner: false },
      'admin.inbox': { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'المالك', email: 'boss@x.sa', role_id: 'super_admin', is_owner: true, totp_enabled: true }, ts: Date.now() })); localStorage.clear(); });
  await page.goto(BASE + hash);
  await page.reload();
  return errors;
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// نص الصفحة المرئي لا يحمل قيمة برمجية فارغة
const leaks = (page) => page.evaluate(() => (document.querySelector('main, .la-shell, #root')?.innerText || '').match(/\bundefined\b|\bNaN\b|\bnull\b/g) || []);

// تكملة axe: ما تركه «غير محسوم» لخلفية بعنصر زائف أو تدرج يُحسب هنا من لون النص على أقرب خلفية مصمتة في منطقة المحتوى
const lowContrast = (page) => page.evaluate(() => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e); if (st.backgroundImage !== 'none') return null; const c = rgb(st.backgroundColor); if (c.length && (c[3] ?? 1) > 0) { stack.push(c); if ((c[3] ?? 1) === 1) break; } }
    return stack.reverse().reduce((acc, c) => blend(c, acc), [255, 255, 255]); };
  const out = [];
  const root = document.querySelector('.dash-body') || document.body;
  for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!r.width || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('[aria-hidden="true"], :disabled, [disabled], .la-dim, tr.off')) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    const bg = bgOf(el); if (!bg) continue; const fg = blend(rgb(cs.color), bg); const fgo = fg.map((v, i) => v * op + bg[i] * (1 - op));
    const [hi, lo] = [lum(fgo), lum(bg)].sort((a, b) => b - a); const ratio = (hi + 0.05) / (lo + 0.05);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} «${el.textContent.trim().slice(0, 24)}» ${ratio.toFixed(2)}`);
  }
  return [...new Set(out)];
});

async function axe(page) {
  // الشاشة تكمل طلباتها قبل الفحص: عقدة تُستبدل أثناءه تظهر مخالفةً على :root
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    if (!r.passes.length) return ['axe: لم يفحص شيئًا'];
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
  });
}

test('المشاركون على 390: بطاقة لكل مشارك بعناوين قيمها، ولا تمرير أفقي للصفحة', async ({ page }) => {
  await setup(page, '#/leaders/participants', { size: { width: 390, height: 844 } });
  const table = page.locator('table.la-cards').first();
  await expect(table.getByText('مشارك رقم 1', { exact: true })).toBeVisible();
  await expect(table.locator('thead')).toBeHidden();
  const row = table.locator('tbody tr').first();
  expect(await row.evaluate((r) => getComputedStyle(r).display)).toBe('block');
  expect(await row.locator('td[data-label="الحالة"]').evaluate((td) => getComputedStyle(td, '::before').content)).toContain('الحالة');
  expect(await noHScroll(page)).toBeLessThanOrEqual(1);
  // على 640 فما دون البطاقات نفسها، وفوقها الجدول
  await page.setViewportSize({ width: 630, height: 844 });
  await expect(table.locator('thead')).toBeHidden();
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(table.locator('thead')).toBeVisible();
});

test('قياس الأثر على 390: جدول الدفعة بطاقات، وجداول الأرقام الأخرى تمرر داخلها لا الصفحة', async ({ page }) => {
  await setup(page, '#/leaders/impact', { size: { width: 390, height: 844 } });
  await expect(page.getByText('الدفعة: قبل وبعد لكل إطار')).toBeVisible();
  await expect(page.getByRole('table', { name: 'قبل وبعد لكل إطار' }).locator('thead')).toBeHidden();
  expect(await noHScroll(page)).toBeLessThanOrEqual(1);
});

test('قياس الأثر ببيانات كاملة وناقصة: لا انهيار، ولا undefined ولا NaN ولا null في النص', async ({ page }) => {
  let errors = await setup(page, '#/leaders/impact');
  await expect(page.getByText('الدفعة: قبل وبعد لكل إطار')).toBeVisible();
  await expect(page.getByText('سارة الأحمد')).toBeVisible();
  expect(await leaks(page)).toEqual([]);
  expect(errors).toEqual([]);
  errors = await setup(page, '#/leaders/impact', { impact: IMPACT_SPARSE });
  await expect(page.getByText('الدفعة: قبل وبعد لكل إطار')).toBeVisible();
  await expect(page.getByText('منى')).toBeVisible();
  expect(await leaks(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('التوجيه ببيانات كاملة ولوحة أول يوم: لا انهيار، ولا قيم فارغة في النص', async ({ page }) => {
  let errors = await setup(page, '#/leaders/ai/guidance');
  await expect(page.getByText('هيئة المثال').first()).toBeVisible();
  expect(await leaks(page)).toEqual([]);
  expect(errors).toEqual([]);
  errors = await setup(page, '#/leaders/ai/guidance', { guide: GUIDE_SPARSE });
  await expect(page.locator('.la-err[role=alert], .app-crash')).toHaveCount(0);
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(await leaks(page)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [name, hash, ready] of [
  ['المشاركون', '#/leaders/participants', 'مشارك رقم 1'],
  ['قياس الأثر', '#/leaders/impact', 'الدفعة: قبل وبعد لكل إطار'],
  ['التوجيه', '#/leaders/ai/guidance', 'هيئة المثال'],
  ['الجهات', '#/leaders/orgs', 'هيئة المثال'],
]) {
  test(`axe على «${name}»: لا مخالفات WCAG 2 A/AA، ولا نص دون نسبة التباين، ولا تمرير أفقي على 390`, async ({ page }) => {
    await setup(page, hash);
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
    expect(await axe(page)).toEqual([]);
    expect(await lowContrast(page)).toEqual([]);
    // والشاشة نفسها على الهاتف: لا تمرير أفقي للصفحة، ولا نص باهت
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
    expect(await noHScroll(page)).toBeLessThanOrEqual(1);
    expect(await lowContrast(page)).toEqual([]);
  });
}


// بلاغ المالك 2026-11-24: جدول المشاركين أعرض من مساحته على شاشة متوسطة فقُصّت أعمدته الأخيرة («أين توقف») بلا تمرير
test('المشاركون على 1100: الجدول الأعرض من إطاره يُمرَّر أفقيًا داخله ولا تُقصّ أعمدته', async ({ page }) => {
  await setup(page, '#/leaders/participants', { size: { width: 1100, height: 900 } });
  const wrap = page.locator('.table-wrap').first();
  await expect(wrap).toBeVisible();
  const s = await wrap.evaluate((el) => ({ ox: getComputedStyle(el).overflowX, sw: el.scrollWidth, cw: el.clientWidth }));
  expect(s.ox).toBe('auto');
  if (s.sw > s.cw + 1) {
    await wrap.evaluate((el) => { el.scrollLeft = -el.scrollWidth; });
    expect(await wrap.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
  }
});
