// شاشة المساعد الآلي في اللوحة: التبويب في «البرامج» للمدير الأعلى والمالك، والأقسام بخلاصاتها، والتقييم بدفعات ثم التفعيل،
// والمحادثات (زائر بمعرّف قصير، والاسم لمن طلب التواصل)، والمفتاح بتأكيد برمز تطبيق المصادقة ولا يخرج إلا في طلب حفظه،
// والعرض فقط للمالك بدور مدير، ومفتاح المرافق في نموذج الجهة، وما قبل الترحيل، والضيق 375. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
// لقطات المراجعة بكثافة 2 حين يُضبط AGENT_SHOTS بمجلد (لا تُلتقط في CI)
const SHOTS = process.env.AGENT_SHOTS || '';
if (SHOTS) test.use({ deviceScaleFactor: 2 });
const KEY = 'sk-ant-api03-e2eTESTkeyVALUE0123456789-abcd';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const FP = 'claude-haiku-5-5|v1-379397bea072f3eb|p|c';
const passed = { id: 'run-0002-aaaa', status: 'passed', stop_reason: null, model: 'claude-haiku-5-5', knowledge_version: 'v1-379397bea072f3eb', fingerprint: FP, total_cases: 15, done_cases: 15, eval_pass: 9, eval_total: 10, redteam_pass: 5, redteam_total: 5, cost_micros: 41000, max_micros: 500000, started_by: 'boss@x.sa', started_at: ago(3), finished_at: ago(1) };

function backend(over = {}) {
  const st = { enabled: false, runs: [], key: { source: 'env', last4: null, set_at: null, set_by: null, ok_at: ago(30), error_at: null, error: null, env_present: true, env_last4: 'wxyz' }, steps: 0, ...over };
  const state = () => {
    const gateRun = st.runs.find((r) => r.status === 'passed' && r.fingerprint === FP);
    return {
      success: true, ready: st.ready ?? true, env_mode: 'allow', enabled: st.enabled, effective: st.enabled && !!gateRun, reason: st.enabled ? null : 'db_off',
      enabled_by: st.enabled ? 'boss@x.sa' : null, enabled_at: st.enabled ? ago(0) : null, model: 'claude-haiku-5-5', known_model: true, cap_cents: 200, key: st.key,
      versions: { model: 'claude-haiku-5-5', knowledge_version: 'v1-379397bea072f3eb', prompt_version: 'p', cases_version: 'c', fingerprint: FP }, total_cases: 15,
      latest_run: st.runs[0] || null, gate: { ok: !!gateRun, run_id: gateRun?.id || null, reason: gateRun ? null : 'none', run: gateRun || null },
      companion_off: 1, can_write: st.canWrite ?? true,
    };
  };
  const series = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), micros: i === 29 ? 420000 : (i % 5) * 60000, calls: 3, eval_micros: i === 29 ? 41000 : 0 }));
  const replies = {
    'admin.agent-state': () => state(),
    // «التوجيه والإرشاد» داخل الرحلة: سقفه من الإعدادات العامة، وتقريره أعداد بلا نص (G3)
    'admin.settings': () => ({ success: true, ready: true, values: { guidance: { enabled: false, daily_spend_usd: 5, monthly_questions: 30, daily_questions: 8, retention_days: 90 } } }),
    'admin.guide-report': () => ({ success: true, ready: true, open: false, cap_usd: 5,
      windows: [{ days: 7, asked: 40, participants: 9, answered: 31, unsure: 5, refused: 4, errors: 0, confirmed: 3, confirm_rate: 7.5, usd: 2.4 },
        { days: 30, asked: 120, participants: 22, answered: 95, unsure: 14, refused: 11, errors: 0, confirmed: 8, confirm_rate: 6.7, usd: 7.1 }],
      spend: [{ day: '2026-11-16', usd: 1.2, calls: 18 }] }),
    'admin.agent-usage': () => ({ success: true, today: { day: series[29].day, spent_micros: 420000, cap_micros: 2000000, calls: 12 }, series, conversations: 128, handoffs: 9, avg_cost_micros: 1300, cache: { read_tokens: 500000, saved_micros: 44550, hit_ratio: 0.82 }, canned_share: 0.31, eval_micros: 41000 }),
    'admin.agent-conversations': (b) => {
      const rows = [
        { id: 'a1b2c3d4-0000-4000-8000-000000000001', short_id: 'a1b2c3d4', created_at: ago(40), product: 'MI-HOME', locale: 'ar', status: 'bot', rating: 4, visitor_messages: 3, model_calls: 2, cost_micros: 2400, contact: false, label: 'زائر' },
        { id: 'b2c3d4e5-0000-4000-8000-000000000002', short_id: 'b2c3d4e5', created_at: ago(90), product: 'MI-LEADERS', locale: 'ar', status: 'waiting', rating: null, visitor_messages: 2, model_calls: 1, cost_micros: 1100, contact: true, name: 'سارة الحربي', email: 'sara@example.com' },
      ].filter((r) => b.who === 'all' || (b.who === 'contact') === r.contact);
      return { success: true, page: 1, per_page: 25, total: rows.length, rows };
    },
    'admin.agent-transcript': () => ({ success: true, conversation: { id: 'a1b2', short_id: 'a1b2c3d4', contact: false }, messages: [
      { role: 'visitor', body: 'كم مدة برنامج القادة؟' },
      { role: 'agent', body: 'يمتد البرنامج على مراحل تبدأ بقياس مبدئي.', model: 'claude-haiku-5-5', tokens: { input: 812, cache_read: 6100, cache_write: 0, output: 140 }, cost_micros: 1100 },
      { role: 'canned', body: 'بياناتكم تُحفظ في مومباي.' },
      { role: 'system', body: 'handoff: request' },
    ] }),
    'admin.agent-eval-runs': () => ({ success: true, runs: st.runs }),
    'admin.agent-eval-run': () => ({ success: true, run: st.runs[0], results: [{ case_id: 'r04', set: 'redteam', pass: false, reasons: ['فيه الممنوع: سعر'], reply: 'نص', cost_micros: 900, message: 'كم السعر؟' }] }),
    'admin.agent-eval-start': () => { st.steps = 0; return { success: true, run_id: 'run-0002-aaaa', total: 15 }; },
    'admin.agent-eval-step': () => {
      st.steps++;
      const done = Math.min(st.steps * 6, 15);
      if (done >= 15) { st.runs = [passed]; return { success: true, run_id: passed.id, done: true, status: 'passed', done_cases: 15, total: 15, cost_micros: 41000, rates: { eval: 0.9, redteam: 1 } }; }
      return { success: true, run_id: passed.id, done: false, status: 'running', done_cases: done, total: 15, cost_micros: done * 2700, rates: { eval: 1, redteam: 1 } };
    },
    'admin.agent-enable': (b) => { st.enabled = b.enabled; return { success: true, enabled: b.enabled }; },
    'admin.agent-key-set': () => { st.key = { ...st.key, source: 'db', last4: 'abcd', set_at: ago(0), set_by: 'boss@x.sa' }; return { success: true, key: { source: 'db', last4: 'abcd', set_at: ago(0), set_by: 'boss@x.sa' }, model_ok: true }; },
    'admin.orgs': () => ({ success: true, orgs: [{ id: 'o1', name: 'هيئة المثال', short_name: 'هم', color: '#12414E', invite_code: 'mithal-code1', status: 'active', domains: [], companion_allowed: true, stats: { total: 0, registered: 0, pending_approval: 0, active_week: 0 } }], unassigned: { total: 0, typed: [] } }),
    'admin.save': () => ({ success: true, row: { id: 'o2' } }),
    ...over.replies,
  };
  return { st, replies };
}

async function setup(page, { role = 'super_admin', owner = true, hash = '#/leaders/agent', viewport, ...over } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  const b = backend(over);
  const calls = [];
  const adminCalls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    adminCalls.push(route.request().postData() || '');
    const r = { 'security-status': { success: true, passkeys: [], passkey_only: false, method: 'totp' }, 'step-up-totp': body.code === '123456' ? { success: true, expires_at: ago(-5), method: 'totp' } : { success: false, code: 'bad_code', message: 'x' } };
    await route.fulfill({ json: r[body.action] ?? { success: true, contacts: [], sessions: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const raw = route.request().postData() || '{}';
    const body = JSON.parse(raw);
    calls.push({ action: body.action, raw, body });
    const fn = b.replies[body.action];
    await route.fulfill({ json: fn ? fn(body) : { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(([r, o]) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'المالك', email: 'boss@x.sa', role_id: r, is_owner: o, totp_enabled: true }, ts: Date.now() }));
    localStorage.clear();
  }, [role, owner]);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  return { calls, adminCalls, st: b.st };
}
const sec = (page, name) => page.getByRole('region', { name });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

test('التبويب في مجموعة «البرامج»، والأقسام بخلاصاتها، والحلقة بنصها', async ({ page }) => {
  await setup(page);
  const group = page.getByRole('group', { name: 'البرامج' });
  await expect(group.getByRole('button', { name: 'المساعد الآلي' })).toHaveAttribute('aria-current', 'page');
  await expect(sec(page, 'الحالة والتحكم').locator('.ag-sum')).toHaveText(/مطفأ من اللوحة/);
  await expect(sec(page, 'الإنفاق').locator('.ag-sum')).toHaveText(/اليوم 0.42 من 2.00 دولار \(21%\)/);
  await expect(sec(page, 'الإنفاق').getByRole('img', { name: /اليوم 0.42 من 2.00 دولار، 21%، ضمن السقف/ })).toBeVisible();
  await expect(sec(page, 'المفتاح').locator('.ag-sum')).toHaveText(/سر الخادم ANTHROPIC_API_KEY \(••••wxyz\)/);
  await expect(sec(page, 'مرافق الجهات')).toContainText('جهة واحدة أوقفت المرافق');
  await expect(sec(page, 'التقييم').locator('.ag-sum')).toContainText('لم يُشغَّل التقييم بعد');
  await shot(page, 'agent-desktop');
});

test('التفعيل معطل حتى ينجح التقييم: ثلاث دفعات ثم «ناجح»، ثم التفعيل يعمل', async ({ page }) => {
  const { calls } = await setup(page);
  const status = sec(page, 'الحالة والتحكم');
  await expect(status.getByRole('checkbox')).toBeDisabled();
  await expect(status).toContainText('شغّل التقييم أولًا');
  await sec(page, 'التقييم').getByRole('button', { name: 'شغّل التقييم الآن' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'شغّل' }).click();
  await expect(sec(page, 'التقييم').getByRole('button', { name: /ناجح/ })).toBeVisible();
  expect(calls.filter((c) => c.action === 'admin.agent-eval-step').length).toBe(3);
  await expect(status.getByRole('checkbox')).toBeEnabled();
  await expect(status).toContainText('آخر تقييم ناجح لهذا الإعداد: أسئلة الجودة 90% واختبار الحماية 100%');
  await status.getByRole('checkbox').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'فعّل' }).click();
  await expect(status.locator('.ag-sum')).toHaveText(/مفعّل ويرد الآن/);
  expect(calls.find((c) => c.action === 'admin.agent-enable').body.enabled).toBe(true);
});

test('المحادثات: «زائر #a1b2c3d4» لصف بلا تواصل، والاسم والبريد لصف بتواصل، والنص بتكلفة كل رد', async ({ page }) => {
  await setup(page);
  const s = sec(page, 'المحادثات');
  await expect(s.getByRole('button', { name: /زائر #a1b2c3d4/ })).toBeVisible();
  await expect(s.getByRole('button', { name: /سارة الحربي sara@example.com/ })).toBeVisible();
  await expect(s.locator('.ag-sum')).toHaveText(/محادثتان في المدة، وعدد من طلب التواصل منها: 1/);
  await s.getByRole('button', { name: /زائر #a1b2c3d4/ }).click();
  const dlg = page.getByRole('dialog', { name: /محادثة #a1b2c3d4/ });
  await expect(dlg).toContainText('فتح المحادثة يُسجَّل في سجل التدقيق');
  await expect(dlg).toContainText('دخل 812 · من الذاكرة 6100 · خرج 140 · 0.0011 دولار');
  await expect(dlg).toContainText('بلا تكلفة');
  await expect(dlg).toContainText('حُوّلت المحادثة إلى الفريق (طلب الزائر)');
  await shot(page, 'agent-transcript');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

test('المفتاح: لصق ثم تأكيد برمز تطبيق المصادقة ثم الحفظ، والحقل يُمسح، ولا يخرج المفتاح إلا في طلب حفظه', async ({ page }) => {
  const { calls, adminCalls } = await setup(page);
  const s = sec(page, 'المفتاح');
  const input = s.getByLabel('مفتاح جديد');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await input.fill(KEY);
  await s.getByRole('button', { name: 'احفظ المفتاح' }).click();
  const dlg = page.getByRole('dialog', { name: 'تأكيد حفظ مفتاح المساعد' });
  await expect(dlg.getByRole('button', { name: /البصمة/ })).toHaveCount(0);
  await dlg.getByLabel('رمز تطبيق المصادقة').fill('123456');
  await shot(page, 'agent-stepup');
  await dlg.getByRole('button', { name: 'أكّد بالرمز' }).click();
  await expect(s.getByRole('status').last()).toContainText('حُفظ المفتاح ••••abcd');
  await expect(input).toHaveValue('');
  await expect(s).toContainText('••••abcd');
  const withKey = calls.filter((c) => c.raw.includes(KEY)).map((c) => c.action);
  expect(withKey).toEqual(['admin.agent-key-set']);
  expect(adminCalls.some((x) => x.includes(KEY))).toBe(false);
  // الرمز وصل admin-api قبل الحفظ
  expect(adminCalls.some((x) => x.includes('step-up-totp'))).toBe(true);
});

test('المراقب لا يرى التبويب، والمالك بدور مدير يرى بلا أزرار كتابة', async ({ page }) => {
  await setup(page, { role: 'viewer', owner: false, hash: '#/leaders/overview' });
  await expect(page.getByRole('group', { name: 'البرامج' }).getByRole('button', { name: 'المساعد الآلي' })).toHaveCount(0);
  await page.goto(`${BASE}#/leaders/agent`);
  await expect(page.getByRole('heading', { name: 'المساعد الآلي' })).toHaveCount(0);
  const p2 = await page.context().newPage();
  await setup(p2, { role: 'admin', owner: true, canWrite: false });
  await expect(p2.getByRole('heading', { name: 'المساعد الآلي' })).toBeVisible();
  await expect(p2.locator('.ag-head .la-chip')).toHaveText('عرض فقط');
  await expect(p2.getByRole('button', { name: 'شغّل التقييم الآن' })).toHaveCount(0);
  await expect(p2.getByLabel('مفتاح جديد')).toHaveCount(0);
  await expect(sec(p2, 'الحالة والتحكم').getByRole('checkbox')).toBeDisabled();
});

test('نموذج الجهة: مفتاح المرافق بنصه المساعد، والحفظ يرسل companion_allowed: false', async ({ page }) => {
  const { calls } = await setup(page, { hash: '#/leaders/orgs' });
  await page.getByRole('button', { name: '+ جهة جديدة' }).first().click();
  const form = page.getByRole('dialog', { name: 'جهة جديدة' });
  await form.getByLabel('اسم الجهة *').fill('جهة الاختبار');
  const sw = form.getByRole('checkbox', { name: /مسموح/ });
  await expect(form).toContainText('مساعد الموقع العام متاح لكل زائر ولا يتأثر بهذا الإعداد');
  await sw.uncheck();
  await expect(form).toContainText('لا يظهر المرافق لأي مشارك من الجهة');
  await form.getByRole('button', { name: 'إنشاء الجهة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.body.row.companion_allowed).toBe(false);
});

// تذكير المنسق لمشاركي الجهة (التذكير الموحد P4، 2026-11-16): مفعّل افتراضيًا، وللإدارة إيقافه لكل جهة
test('نموذج الجهة: مفتاح «تذكير المنسق» لجهة قائمة، والحفظ يرسل coord_nudges: false', async ({ page }) => {
  const { calls } = await setup(page, { hash: '#/leaders/orgs', replies: {
    'admin.orgs': () => ({ success: true, orgs: [{ id: 'o1', name: 'هيئة المثال', short_name: 'هم', color: '#12414E', invite_code: 'mithal-code1', status: 'active', domains: [], companion_allowed: true, coord_nudges: true, stats: { total: 0, registered: 0, pending_approval: 0, active_week: 0 } }], unassigned: { total: 0, typed: [] } }),
    'admin.coordinator': () => ({ success: true, coordinator: null }),
  } });
  await page.getByRole('button', { name: 'تحرير' }).first().click();
  const form = page.getByRole('dialog').filter({ hasText: 'تذكير المنسق لمشاركي الجهة' });
  await expect(form).toContainText('يظهر «ذكّرهم» في «يحتاج تدخلك» ببوابة الجهة');
  const sec = form.locator('.of-sec').filter({ hasText: 'تذكير المنسق لمشاركي الجهة' });
  await sec.getByRole('checkbox').uncheck();
  await expect(sec).toContainText('لا يذكّر منسق هذه الجهة أحدًا');
  await form.getByRole('button', { name: /حفظ/ }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.body.row.coord_nudges).toBe(false);
});

test('قبل الترحيل: رسالة الترحيل وحدها', async ({ page }) => {
  await setup(page, { ready: false });
  await expect(page.getByText('لم يُطبَّق ترحيل 20261115230000 بعد')).toBeVisible();
  await expect(sec(page, 'الحالة والتحكم')).toHaveCount(0);
});

test('الضيق 375 بكسل: لا تمرير أفقي للصفحة', async ({ page }) => {
  await setup(page, { viewport: { width: 375, height: 800 } });
  await expect(sec(page, 'المحادثات').getByRole('button', { name: /زائر #a1b2c3d4/ })).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  await shot(page, 'agent-phone');
});

// أشكال من الإنتاج لا تتوقعها الشاشة: تشغيل جارٍ بلا نهاية، وتشغيل قديم بلا تكرار، ومتوقف بلا بداية، ونسخ ومفتاح وبوابة
// غائبة، ونموذج كائن، وسلسلة إنفاق غائبة، وصفوف تواصل بلا اسم ولا بريد، ونتائج بأسباب null وحالة محذوفة. تُرسم كلها
const BOUNDARY = 'تعذّر عرض هذه الشاشة';
const prodShapes = {
  'admin.agent-state': () => ({
    success: true, ready: true, env_mode: 'allow', enabled: false, effective: false, reason: null, enabled_by: null, enabled_at: null, model: { id: 'claude-haiku-5-5' },
    known_model: true, cap_cents: null, key: null, versions: null, total_cases: 60, gate: null, companion_off: null, can_write: true,
    latest_run: { id: '9d668ea8-0000-4000-8000-000000000009', status: 'running', finished_at: null, started_at: ago(2), eval_total: 0, redteam_total: 0, done_cases: 0, total_cases: 60, cost_micros: null },
  }),
  'admin.agent-usage': () => ({ success: true, today: { spent_micros: null, cap_micros: 2000000 }, conversations: null, handoffs: null }),
  'admin.agent-conversations': () => ({ success: true, total: null, rows: [
    { id: 'c0ffee00-0000-4000-8000-00000000000a', contact: true, name: null, email: null, locale: null, product: null, rating: null, created_at: null, status: null },
    { id: 'c0ffee00-0000-4000-8000-00000000000b', contact: false, label: null, visitor_messages: null },
  ] }),
  'admin.agent-transcript': () => ({ success: true, conversation: null, messages: [{ role: 'visitor', body: null }, { role: 'agent', body: 'رد', tokens: null, cost_micros: null }, { role: 'system', body: null }] }),
  'admin.agent-eval-runs': () => ({ success: true, runs: [
    { id: '9d668ea8-0000-4000-8000-000000000009', status: 'running', finished_at: null, eval_total: 0, done_cases: 0, total_cases: 60 },
    { id: 'old00000-0000-4000-8000-000000000001', status: 'failed', eval_pass: 40, eval_total: 45, redteam_pass: 14, redteam_total: 15, started_at: ago(900), finished_at: ago(890) },
    { id: 'stop0000-0000-4000-8000-000000000002', status: 'stopped', stop_reason: 'cancelled', started_at: null, finished_at: null, repeats: 3 },
    null,
  ] }),
  'admin.agent-eval-run': () => ({ success: true, run: null, results: [
    { case_id: 'gone', set: 'eval', pass: false, reasons: null, message: null, reply: null },
    { case_id: 'e01', set: 'eval', pass: false, reasons: ['ينقصه: مستشار|يومي عمل', null], message: 'وش الفرق بين القياس والبرنامج؟ وكم المدة؟', reply: 'نص' },
    { case_id: 'e01', set: 'eval', pass: true },
  ] }),
};

test('أشكال الإنتاج غير المتوقعة: الشاشة تُرسم ونافذتا التشغيل والمحادثة تفتحان', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, { replies: prodShapes });
  await expect(page.getByRole('heading', { name: 'المساعد الآلي' })).toBeVisible();
  await expect(page.getByText(BOUNDARY)).toHaveCount(0);
  await expect(sec(page, 'التقييم').locator('.ag-sum')).toContainText('جارٍ');
  await expect(sec(page, 'الإنفاق').locator('.ag-sum')).toHaveText(/اليوم 0.00 من 2.00 دولار/);
  await expect(sec(page, 'المحادثات').getByRole('button', { name: /بلا اسم/ })).toBeVisible();
  await expect(sec(page, 'التقييم').getByText('كل حالة 3 مرات')).toBeVisible();
  await sec(page, 'التقييم').getByRole('button', { name: 'راسب' }).click();
  const run = page.getByRole('dialog', { name: /تشغيل #old00000/ });
  await expect(run).toContainText('ينقصه: مستشار|يومي عمل');
  await expect(run).toContainText('gone');
  await page.keyboard.press('Escape');
  await sec(page, 'المحادثات').getByRole('button', { name: /زائر #c0ffee00/ }).click();
  await expect(page.getByRole('dialog', { name: /محادثة #c0ffee00/ })).toContainText('رد');
  await page.keyboard.press('Escape');
  await expect(page.getByText(BOUNDARY)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ردود ليست JSON أو فاشلة: رسالة تعذر القراءة في كل قسم، لا شاشة معطلة', async ({ page }) => {
  await setup(page, { replies: { 'admin.agent-usage': () => 'not json', 'admin.agent-eval-runs': () => ({ success: false }), 'admin.agent-conversations': () => null } });
  await expect(page.getByRole('heading', { name: 'المساعد الآلي' })).toBeVisible();
  await expect(page.getByText(BOUNDARY)).toHaveCount(0);
  await expect(sec(page, 'الإنفاق')).toContainText('تعذّرت القراءة');
  await expect(sec(page, 'التقييم')).toContainText('تعذّرت القراءة');
});

test('ملف القسم حذفه نشر أحدث: إعادة تحميل واحدة ثم رسالة «صدر تحديث للوحة» بزرها، والزر يفتح الشاشة', async ({ page }) => {
  let block = true;
  let hits = 0;
  // كما يرد Cloudflare Pages على ملف محذوف بقاعدة /* /index.html 200
  await page.route(/\/assets\/Agent-[^/]+\.js$/, async (route) => {
    if (!block) return route.continue();
    hits++;
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' });
  });
  await setup(page);
  await expect(page.getByText('صدر تحديث للوحة، فأعد تحميل الصفحة')).toBeVisible();
  await expect(page.getByText(BOUNDARY)).toHaveCount(0);
  expect(hits).toBeGreaterThan(0);
  block = false;
  await page.getByRole('button', { name: 'أعد تحميل الصفحة' }).click();
  await expect(page.getByRole('heading', { name: 'المساعد الآلي' })).toBeVisible();
});

test('«التوجيه والإرشاد» داخل الرحلة: سقفه منفصل ورابطه، وتقرير أعداد بلا نص بنسبة «أريد التأكد»', async ({ page }) => {
  await setup(page);
  const state = sec(page, 'الحالة والتحكم');
  await expect(state).toContainText('سقف «التوجيه والإرشاد» داخل الرحلة منفصل: 5.00 دولار يوميًا');
  const report = page.getByRole('region', { name: /«التوجيه والإرشاد» داخل الرحلة/ });
  await expect(report).toContainText('مغلق للمشاركين');
  await expect(report.getByRole('row', { name: /آخر 7 يومًا/ })).toContainText('3 (7.5٪)');
  await expect(report).toContainText('أعلى يوم: $1.20 من سقف $5.00');
  await expect(report).toContainText('نصوص المحادثات خاصة بأصحابها');
});
