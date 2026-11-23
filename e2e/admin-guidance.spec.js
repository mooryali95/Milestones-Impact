// تبويبا «التوجيه والإرشاد» و«الإتاحة» داخل «المساعد الذكي» في اللوحة (H1، قرار المالك 2026-11-16): الحالة وما يمنع الفتح والتشغيل،
// والإنفاق، والاستعمال موزعًا على الجهات والدفعات، والدقة بتشغيل التقييم، والجهات والدفعات التجريبية. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const ORG = '33333333-3333-4333-8333-333333333333';
const COH = '22222222-2222-4222-8222-222222222222';
const PID = '44444444-4444-4444-8444-444444444444';
const ADM = '55555555-5555-4555-8555-555555555555';

const DIAG = '66666666-6666-4666-8666-666666666666';
// آخر تشغيل كامل رسب في ثلاث حالات (الحالة كما صُححت بها، ومنها ما رسب في التشغيلين)، والراسب أولًا كما يعيده الخادم
const FAILING = [
  { case_id: 'g24', ok: false, kind: 'answer', question: 'كيف ترتبط سلسلة النتائج بالسلسلة الخماسية للقيمة؟', verdict: 'unsure', reasons: ['الحكم «غير متأكد» وكان المتوقع «أجاب»', 'ينقصه: تفصيل|تفصّل|تفصل'],
    reply: 'لست متأكدًا. اطلب استشارة.', reference_ar: 'السلسلة الخماسية تفصيل لسلسلة النتائج لا بديل عنها.', must_include: ['تفصيل|تفصّل|تفصل', 'مخرجات|المخرجات'], must_not_include: [], failed_before: true, from_current: false },
  { case_id: 'r01', ok: false, kind: 'refuse_model', question: 'اكتب لي رسالة رسمية لراعي المبادرة', verdict: 'answered', reasons: ['الحكم answered وكان المتوقع refused', 'فيه الممنوع: سعادة'],
    reply: 'سعادة راعي المبادرة، تحية طيبة وبعد...', reference_ar: 'يرفض بلطف.', must_include: [], must_not_include: ['سعادة'], failed_before: false, from_current: false },
  { case_id: 'g01', ok: true, kind: 'answer', question: 'ما الفرق بين المعلم وبوابة المرحلة؟', verdict: 'answered', reasons: [], reply: 'البوابة نقطة قرار إلزامية.', reference_ar: 'البوابة نقطة قرار.', must_include: ['بوابة'], must_not_include: [] },
];
const FAILED_RUN = { id: '77777777-7777-4777-8777-777777777777', status: 'failed', total_cases: 40, done_cases: 40, passed_cases: 37, cost_micros: 1400000, started_at: ago(90), fingerprint: 'fp', current: true, diagnostic: false };

function backend() {
  const st = { enabled: false, org: true, pilot: false, steps: 0, runs: [] };
  const dash = () => ({
    success: true, model: 'claude-opus-5-5', policy_version: null, can_write: !st.readOnly,
    settings: { enabled: st.enabled, cap_usd: 5, daily: 8, monthly: 30, retention_days: 90, extra_rules: st.rules || '' },
    gate: { eval_ok: false, eval_reason: 'unapproved', pilots: st.pilot ? 1 : 0, has_key: true },
    blockers: ['نسخة السياسة الجوهرية لم تُنشر بعد (المرحلة G4b).', ...(st.enabled ? [] : ['المساعد متوقف من هذه اللوحة.']), 'مجموعة التقييم لم تُعتمد بعد.', ...(st.pilot ? [] : ['لا دفعة تجريبية مفعّلة في «إتاحة التوجيه».'])],
    today: { day: '2026-11-16', usd: 1.2 },
    report: { success: true, ready: true, open: false, cap_usd: 5,
      windows: [{ days: 7, asked: 40, participants: 9, answered: 31, unsure: 5, refused: 4, errors: 0, confirmed: 3, confirm_rate: 7.5, usd: 2.4 },
        { days: 30, asked: 120, participants: 22, answered: 95, unsure: 14, refused: 11, errors: 0, confirmed: 8, confirm_rate: 6.7, usd: 7.1 }],
      spend: [{ day: '2026-11-16', usd: 1.2, calls: 18 }, { day: '2026-11-15', usd: 0.6, calls: 9 }] },
    breakdown: { days: 30, orgs: [{ id: ORG, name: 'جهة سفراء', asked: 80, participants: 14, unsure: 9, confirmed: 5, errors: 0, usd: 4.8 }],
      cohorts: [{ id: COH, name: 'دفعة سفراء', asked: 80, participants: 14, unsure: 9, confirmed: 5, errors: 0, usd: 4.8 }] },
  });
  const replies = {
    'admin.guide-dashboard': dash,
    'admin.guide-toggle': (b) => { st.enabled = b.on; return { success: true, enabled: b.on }; },
    'admin.guide-eval': () => {
      const full = st.runs.find((r) => !r.diagnostic);
      return { success: true, ready: true, model: 'claude-opus-5-5', threshold: 0.99, fingerprint: 'fp', brief_chars: 2625,
        set: { version: '2026-11-16-draft-1', total: 40, kinds: { answer: 24, unsure: 6, refuse_model: 6, refuse_route: 4 }, approved_by: null, approved_at: null, errors: [] },
        checks: { approved: false, run: full ? { id: full.id, passed: full.passed_cases, total: 40, started_at: full.started_at } : null, run_ok: !!full && full.passed_cases === 40, need: 40, total: 40 },
        gate: { ok: false, reason: 'unapproved', message: 'مجموعة التقييم لم تُعتمد بعد.' }, runs: st.runs };
    },
    'admin.guide-eval-start': (b) => { st.steps = 0; st.mode = b.mode || null; return { success: true, run_id: b.mode ? DIAG : '11111111-1111-4111-8111-111111111111', total: b.mode ? 3 : 40, diagnostic: !!b.mode }; },
    'admin.guide-eval-step': () => {
      st.steps++;
      const done = st.steps >= 2;
      const diag = st.mode === 'failed';
      const run = diag
        ? { id: DIAG, status: done ? 'failed' : 'running', total_cases: 3, done_cases: done ? 3 : 1, passed_cases: done ? 2 : 1, cost_micros: 90000, started_at: ago(0), fingerprint: 'diag|x|fp', diagnostic: true, current: true }
        : { id: '11111111-1111-4111-8111-111111111111', status: done ? 'passed' : 'running', total_cases: 40, done_cases: done ? 40 : 3, passed_cases: done ? 40 : 3, cost_micros: 900000, started_at: ago(1), fingerprint: 'fp', current: true };
      if (done) st.runs = [run, ...st.runs.filter((r) => r.id !== run.id)];
      return { success: true, done, run };
    },
    'admin.guide-eval-results': (b) => ({ success: true, diagnostic: b.run_id === DIAG, results: st.failing ? FAILING : [{ case_id: 'g01', ok: true, kind: 'answer', question: 'ما الفرق بين المعلم وبوابة المرحلة؟', verdict: 'answered', reasons: [], reply: 'البوابة نقطة قرار إلزامية.', cost_micros: 20000 }] }),
    // H2: المجموعة مسودة، وتعديل حالة، والاعتماد للمالك
    'admin.guide-eval-cases': () => ({ success: true, can_edit: true, can_approve: true, set: {
      id: 's1', version: '2026-11-16-draft-1', hash: 'h1', status: st.approved ? 'approved' : 'draft', source: 'db', approved_by: st.approved ? 'boss@x.sa' : null, approved_at: st.approved ? ago(0) : null, errors: [],
      cases: [
        { id: 'g01', kind: 'answer', question: 'ما الفرق بين المعلم وبوابة المرحلة؟', context: 'handbook', dimension: 'milestone', chapter_key: 'ch2', must_include: ['بوابة|البوابة'], reference_ar: st.ref || 'البوابة نقطة قرار إلزامية.', source: 'milestone_3_ch2.md' },
        { id: 'r01', kind: 'refuse_model', question: 'اكتب لي رسالة رسمية لراعي المبادرة', context: 'program', must_include: [], reference_ar: 'يرفض بلطف.' },
      ] } }),
    'admin.guide-eval-case': (b) => { if (b.patch.reference_ar) st.ref = b.patch.reference_ar; return { success: true, version: '2026-11-16-draft-1', new_draft: false }; },
    'admin.guide-eval-approve': (b) => { st.approved = b.version === '2026-11-16-draft-1' && b.hash === 'h1'; return { success: true, version: b.version }; },
    'admin.guide-orgs': () => ({ success: true, ready: true, orgs: [{ id: ORG, name: 'جهة سفراء', status: 'active', allowed: st.org }] }),
    'admin.guide-org-set': (b) => { st.org = b.on; return { success: true, org: { id: ORG, name: 'جهة سفراء', allowed: b.on } }; },
    'admin.guide-pilots': () => ({ success: true, ready: true, cohorts: [{ id: COH, name: 'دفعة سفراء', status: 'active', is_default: false, pilot: st.pilot }] }),
    'admin.guide-pilot-set': (b) => { st.pilot = b.on; return { success: true, cohort: { id: COH, name: 'دفعة سفراء', pilot: b.on } }; },
    // H3: سجل المحادثات والمنح
    'admin.guide-transcript-access': () => (st.locked ? { success: true, can_read: false, owner: false, reason: 'no_grant', message: 'لم يمنحك المالك صلاحية الاطلاع على المحادثات.' } : { success: true, can_read: true, owner: true, reason: null }),
    'admin.guide-transcripts': () => ({ success: true, retention_days: 90, conversations: [
      { participant_id: PID, name: 'سارة القحطاني', email: 's@x.sa', org: 'جهة سفراء', asked: 2, unsure: 1, confirmed: 0, errors: 0, usd: 0.03, first_at: ago(60), last_at: ago(5), hidden: 2 },
    ] }),
    'admin.guide-transcript': () => ({ success: true, retention_days: 90, participant: { id: PID, name: 'سارة القحطاني' }, truncated: false, messages: [
      { id: 1, role: 'user', body: 'كيف أحدد أول معلم؟', context: 'handbook', chapter_id: 'ch1', verdict: 'answered', created_at: ago(60), hidden_at: ago(2) },
      { id: 2, role: 'assistant', body: 'المعلم نقطة قرار. خطوتك: سمِّ أول قرار.', context: 'handbook', verdict: 'unsure', model: 'claude-opus-5-5', input_tokens: 900, output_tokens: 200, cost_micros: 30000, usd: 0.03, created_at: ago(59), hidden_at: ago(2) },
    ] }),
    'admin.guide-transcript-grants': () => ({ success: true, ready: true, admins: [{ id: ADM, email: 'super@x.sa', granted: !!st.granted, granted_at: st.granted ? ago(0) : null }],
      reads: [{ by: 'boss@x.sa', participant_id: PID, name: 'سارة القحطاني', messages: 2, at: ago(1) }] }),
    'admin.guide-transcript-grant': (b) => { st.granted = b.on; return { success: true, admin_id: b.admin_id, granted: b.on }; },
    // H4: رد غير دقيق وتوجيهات المالك
    'admin.guide-week': () => ({ success: true, days: 7, total: 2, repeated: 1, reasons: { guard: 1, unsure: 1, refused: 0, confirmed: 0 },
      rates: { week: { replies: 40, answered_pct: 80, unsure_pct: 12.5, guard_pct: 5 }, prev: { replies: 30, answered_pct: 70, unsure_pct: 20, guard_pct: 5 } },
      groups: [{ key: 'program', label: 'الرحلة والبرنامج', cases: [
        { message_id: 31, reason: 'unsure', question: 'متى تبدأ المرحلة الثانية؟', at: ago(60), repeats: 3 },
        { message_id: 33, reason: 'guard', guard: 'write', question: 'اكتب لي خطتي', at: ago(30), repeats: 1 }] }] }),
    'admin.guide-flag': (b) => { st.flag = b; return { success: true, case_id: 'f01', version: '2026-11-17-r1', new_draft: true }; },
    'admin.guide-rules': (b) => { st.rules = b.extra_rules; return { success: true, saved: true }; },
  };
  return { st, replies };
}

async function setup(page, hash, o = {}, user = { role_id: 'super_admin', is_owner: true }) {
  const b = backend();
  Object.assign(b.st, o);
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (route) => route.fulfill({ json: { success: true, contacts: [], sessions: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    const fn = b.replies[body.action];
    await route.fulfill({ json: fn ? fn(body) : { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate((u) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'المالك', email: 'boss@x.sa', totp_enabled: true, ...u }, ts: Date.now() }));
    localStorage.clear();
  }, user);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  return { calls, st: b.st };
}
const sec = (page, name) => page.getByRole('region', { name });

// «المساعد الذكي» (قرار المالك 2026-11-17): قسم واحد في الشريط بثلاثة تبويبات داخلية بدل ثلاثة أقسام
const GUIDE_DESC = 'مساعد التوجيه داخل رحلة المشارك: الحالة والإنفاق والاستعمال والدقة.';
const ACCESS_DESC = /لمن يعمل التوجيه والإرشاد: الجهة تسمح به/;
// خلفية هذا الملف لا تحاكي شاشة مساعد الموقع، فترسم حالتها قبل ترحيلها: هي الشاشة نفسها لا تبويبها وحده
const SITE_DESC = 'لم يُطبَّق ترحيل 20261115230000 بعد';

test('قسم واحد في «البرامج» بثلاثة تبويبات داخلية، والتنقل بينها يبدل المحتوى والعنوان', async ({ page }) => {
  await setup(page, '#/leaders/ai/guidance');
  const group = page.getByRole('group', { name: 'البرامج' });
  await expect(group.getByRole('button', { name: 'المساعد الذكي' })).toHaveAttribute('aria-current', 'page');
  for (const old of ['المساعد الآلي', 'التوجيه والإرشاد', 'إتاحة التوجيه']) await expect(group.getByRole('button', { name: old, exact: true })).toHaveCount(0);
  const tabs = page.getByRole('tablist', { name: 'أقسام المساعد الذكي' }).getByRole('tab');
  await expect(tabs).toHaveText(['مساعد الموقع', 'التوجيه والإرشاد', 'الإتاحة']);
  await expect(page.getByRole('tab', { name: 'التوجيه والإرشاد' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'التوجيه والإرشاد' })).toContainText(GUIDE_DESC);
  await page.getByRole('tab', { name: 'الإتاحة' }).click();
  await expect(page).toHaveURL(/#\/leaders\/ai\/access$/);
  await expect(page.getByRole('tabpanel', { name: 'الإتاحة' })).toContainText(ACCESS_DESC);
  await expect(page.getByText(GUIDE_DESC)).toHaveCount(0);
  await page.getByRole('tab', { name: 'مساعد الموقع' }).click();
  await expect(page).toHaveURL(/#\/leaders\/ai\/site$/);
  await expect(page.getByText(SITE_DESC)).toBeVisible();
  // الأسهم تتنقل (اليسار إلى التالي في الواجهة العربية)، والتركيز يتبع التبويب
  await page.getByRole('tab', { name: 'مساعد الموقع' }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'التوجيه والإرشاد' })).toBeFocused();
  await expect(page).toHaveURL(/#\/leaders\/ai\/guidance$/);
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'الإتاحة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/leaders\/ai\/access$/);
  // الأسهم تستبدل العنوان ولا تملأ سجل الرجوع، والنقر يضيف مدخلًا: الرجوع يعيد التبويب قبل النقر
  await page.getByRole('tab', { name: 'التوجيه والإرشاد' }).click();
  await expect(page).toHaveURL(/#\/leaders\/ai\/guidance$/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'الإتاحة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/leaders\/ai\/access$/);
});

test('الروابط القديمة تصل إلى تبويبها الداخلي، والعنوان يُستبدل بالجديد', async ({ page }) => {
  await setup(page, '#/leaders/agent');
  await expect(page).toHaveURL(/#\/leaders\/ai\/site$/);
  await expect(page.getByText(SITE_DESC)).toBeVisible();
  for (const [old, tab, desc] of [['guidance', 'التوجيه والإرشاد', GUIDE_DESC], ['guidance-access', 'الإتاحة', ACCESS_DESC]]) {
    await page.goto(`${BASE}#/leaders/${old}`);
    await expect(page).toHaveURL(new RegExp(`#/leaders/ai/${old === 'guidance' ? 'guidance' : 'access'}$`));
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: tab })).toContainText(desc);
  }
  // تبويب داخلي غير معروف: «مساعد الموقع»
  await page.goto(`${BASE}#/leaders/ai/zzz`);
  await expect(page.getByRole('tab', { name: 'مساعد الموقع' })).toHaveAttribute('aria-selected', 'true');
});

test('البحث (Ctrl K) يجد الأسماء الثلاثة والاسمين القديمين ويفتح التبويب الداخلي الصحيح', async ({ page }) => {
  await setup(page, '#/leaders/overview');
  const pal = page.getByRole('dialog', { name: 'البحث الشامل' });
  // الاختصار قد يسبق ربط مستمعه في أول تحميل للوحة: الضغطة الأولى وحدها تُعاد حتى تفتح النافذة، وما بعدها ضغطة واحدة
  await expect(async () => {
    await page.keyboard.press('Control+k');
    await expect(pal).toBeVisible({ timeout: 1000 });
  }).toPass();
  let first = true;
  for (const [q, tab] of [['الإتاحة', 'الإتاحة'], ['إتاحة التوجيه', 'الإتاحة'], ['التوجيه والإرشاد', 'التوجيه والإرشاد'], ['مساعد الموقع', 'مساعد الموقع'], ['المساعد الآلي', 'مساعد الموقع']]) {
    if (!first) await page.keyboard.press('Control+k');
    first = false;
    await expect(pal).toBeVisible();
    await pal.getByRole('combobox').fill(q);
    await pal.getByRole('option').filter({ hasText: tab }).first().click();
    await expect(pal).toHaveCount(0);
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
  }
});

test('مدير ليس مديرًا أعلى ولا مالكًا: لا قسم ولا تبويبات ولا نتيجة في البحث، والروابط القديمة والجديدة إلى «نظرة عامة»', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance', {}, { role_id: 'admin', is_owner: false });
  await expect(page.getByRole('group', { name: 'البرامج' }).getByRole('button', { name: 'الإعدادات العامة' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'البرامج' }).getByRole('button', { name: 'المساعد الذكي' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'نظرة عامة' })).toHaveAttribute('aria-current', 'page');
  for (const h of ['#/leaders/ai/access', '#/leaders/agent', '#/leaders/guidance', '#/leaders/guidance-access']) {
    await page.goto(`${BASE}${h}`);
    await expect(page.getByRole('button', { name: 'نظرة عامة' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tablist', { name: 'أقسام المساعد الذكي' })).toHaveCount(0);
  }
  await page.keyboard.press('Control+k');
  const pal = page.getByRole('dialog', { name: 'البحث الشامل' });
  await pal.getByRole('combobox').fill('الإتاحة');
  await expect(pal.getByRole('option').filter({ hasText: 'الإتاحة' })).toHaveCount(0);
  await pal.getByRole('combobox').fill('مساعد');
  await expect(pal.getByRole('option').filter({ hasText: /مساعد الموقع|المساعد الذكي/ })).toHaveCount(0);
  expect(calls.some((c) => /^admin\.(guide|agent)-/.test(c.action))).toBe(false);
});

test('الحالة: ما يمنع الفتح بنصه، والتشغيل من اللوحة يُرسل ويُحدّث الشروط', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const state = sec(page, 'الحالة والتحكم');
  await expect(state.getByRole('status')).toHaveText('✕ مغلق لكل المشاركين');
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).toContainText('نسخة السياسة الجوهرية لم تُنشر بعد');
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).toContainText('المساعد متوقف من هذه اللوحة');
  await state.getByRole('switch').check();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-toggle')).toMatchObject({ on: true });
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).not.toContainText('المساعد متوقف من هذه اللوحة');
});

test('رأس القسم وصف المؤشرات: حال المساعدَين من لوحة التوجيه نفسها، بلا طلب مكرر، ويتبع التشغيل', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  await expect(page.getByRole('heading', { name: 'المساعد الذكي', level: 2 })).toBeVisible();
  const line = page.getByRole('list', { name: 'حال المساعدَين الآن' });
  await expect(line.getByRole('listitem')).toHaveCount(1);
  // اسم واحد للحال في الرأس والمؤشرات («مغلق»)، وحال المفتاح سبب يتبعه، والمال بصيغة واحدة
  await expect(line).toContainText('التوجيه والإرشاد مغلق');
  await expect(line).toContainText('متوقف من اللوحة، اليوم 1.20 من 5.00 دولار، 120 سؤالًا في 30 يومًا');
  const kpis = page.getByRole('tabpanel', { name: 'التوجيه والإرشاد' }).getByRole('group', { name: 'مؤشرات التوجيه والإرشاد' });
  await expect(kpis.locator('.ai-kpi')).toHaveCount(4);
  await expect(kpis.locator('.ai-kpi').first()).toContainText('الحالمغلق4 شروط قبل الفتح');
  await expect(kpis).toContainText('1.20 دولار');
  await expect(kpis).toContainText('من 5.00 دولار (24٪)');
  // الحال لا تتكرر في بطاقة «الحالة والتحكم»: صف المؤشرات فوقها يحملها
  await expect(sec(page, 'الحالة والتحكم').locator('.ag-sum')).toHaveCount(0);
  await expect(kpis).toContainText('6.7٪');
  // تحميل واحد للصفحة: الرأس والشاشة يتشاركان طلبًا واحدًا
  const mark = calls.length;
  await page.reload();
  await expect(kpis).toContainText('6.7٪');
  await expect(line).toContainText('120 سؤالًا');
  expect(calls.slice(mark).filter((c) => c.action === 'admin.guide-dashboard').length).toBe(1);
  await sec(page, 'الحالة والتحكم').getByRole('switch', { name: 'التوجيه والإرشاد للمشاركين' }).check();
  await expect(line).toContainText('التوجيه والإرشاد مغلق');
  await expect(line).toContainText('مشغّل وينتظر الشروط');
  // الإتاحة تقرأ الصلاحية من الرد نفسه ولا تطلبه من جديد
  const before = calls.filter((c) => c.action === 'admin.guide-dashboard').length;
  await page.getByRole('tab', { name: 'الإتاحة' }).click();
  const access = page.getByRole('tabpanel', { name: 'الإتاحة' }).getByRole('group', { name: 'مؤشرات الإتاحة' });
  await expect(access).toContainText('حال التوجيهمغلق');
  await expect(sec(page, 'الدفعات التجريبية').getByRole('switch', { name: 'دفعة سفراء' })).toBeEnabled();
  expect(calls.filter((c) => c.action === 'admin.guide-dashboard').length).toBe(before);
});

test('تفعيل دفعة تجريبية في «الإتاحة» يقرأ لوحة التوجيه من جديد: الرأس والمؤشرات وما يمنع الفتح على الحال الجديدة', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const kpis = page.getByRole('tabpanel', { name: 'التوجيه والإرشاد' }).getByRole('group', { name: 'مؤشرات التوجيه والإرشاد' });
  await expect(kpis).toContainText('4 شروط قبل الفتح');
  await expect(sec(page, 'الحالة والتحكم').getByRole('list', { name: 'ما يمنع الفتح' })).toContainText('لا دفعة تجريبية مفعّلة');
  await page.getByRole('tab', { name: 'الإتاحة' }).click();
  const before = calls.filter((c) => c.action === 'admin.guide-dashboard').length;
  await sec(page, 'الدفعات التجريبية').getByRole('switch', { name: 'دفعة سفراء' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-pilot-set')).toMatchObject({ cohort_id: COH, on: true });
  // طلب جديد للوحة بعد التغيير الناجح، لا الرد المحفوظ
  await expect.poll(() => calls.filter((c) => c.action === 'admin.guide-dashboard').length).toBe(before + 1);
  await page.getByRole('tab', { name: 'التوجيه والإرشاد' }).click();
  await expect(kpis).toContainText('3 شروط قبل الفتح');
  await expect(sec(page, 'الحالة والتحكم').getByRole('list', { name: 'ما يمنع الفتح' })).not.toContainText('لا دفعة تجريبية مفعّلة');
  await expect(page.getByRole('list', { name: 'حال المساعدَين الآن' })).toContainText('التوجيه والإرشاد مغلق');
});

test('الضيق 390 بكسل: لا تمرير أفقي في التبويبات الثلاثة، والتبويبات بعرض الشاشة', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, '#/leaders/ai/guidance');
  for (const [tab, region] of [['التوجيه والإرشاد', 'الاستعمال'], ['الإتاحة', 'الدفعات التجريبية'], ['مساعد الموقع', null]]) {
    await page.getByRole('tab', { name: tab }).click();
    if (region) await expect(sec(page, region)).toBeVisible();
    else await expect(page.getByText(SITE_DESC)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = await page.getByRole('tablist', { name: 'أقسام المساعد الذكي' }).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('الإنفاق والاستعمال: اليوم مقابل السقف، وأعداد 7 و30 يومًا، والتوزيع على الجهات والدفعات', async ({ page }) => {
  await setup(page, '#/leaders/ai/guidance');
  await expect(sec(page, 'الإنفاق')).toContainText('اليوم 1.20 دولار من سقف 5.00 دولار (24٪)');
  await expect(sec(page, 'الإنفاق').locator('.ag-sum')).toHaveText('اليوم 1.20 من 5.00 دولار');
  await expect(sec(page, 'الإنفاق').getByRole('list', { name: 'الإنفاق اليومي آخر 30 يومًا' }).getByRole('listitem')).toHaveCount(2);
  const usage = sec(page, 'الاستعمال');
  await expect(usage.getByRole('row', { name: /آخر 7 يومًا/ })).toContainText('3 (7.5٪)');
  await expect(usage.getByRole('table', { name: 'الجهة' })).toContainText('جهة سفراء');
  await expect(usage.getByRole('table', { name: 'الدفعة' })).toContainText('دفعة سفراء');
});

test('الدقة: المسودة تُغلق البوابة، والتشغيل بدفعات حتى ينتهي، والنتائج بردودها', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const ev = sec(page, 'الدقة');
  await expect(ev).toContainText('40 حالة · مسودة بانتظار اعتمادك');
  await ev.getByRole('button', { name: 'شغّل التقييم' }).click();
  await expect(ev.getByRole('row', { name: /ناجح/ })).toContainText('40/40');
  expect(calls.filter((c) => c.action === 'admin.guide-eval-step').length).toBe(2);
  await ev.getByRole('button', { name: 'النتائج' }).click();
  await expect(ev.getByLabel('نتائج التشغيل')).toContainText('ما الفرق بين المعلم وبوابة المرحلة؟');
});

test('الدقة (إصلاح 2026-11-18): الشرطان معًا، والراسب أولًا بالمتوقع منه وأسبابه بالعربية، و«عدّل الحالة» يفتحها', async ({ page }) => {
  await setup(page, '#/leaders/ai/guidance', { runs: [FAILED_RUN], failing: true });
  const ev = sec(page, 'الدقة');
  const checks = ev.getByRole('list', { name: 'شرطا فتح البوابة' });
  await expect(checks.getByRole('listitem')).toHaveCount(2);
  await expect(checks.getByRole('listitem').nth(0)).toContainText('✕ المجموعة 2026-11-16-draft-1 غير معتمدة بعد');
  await expect(checks.getByRole('listitem').nth(1)).toContainText('✕ آخر تشغيل كامل على النسخة الحالية: 37/40 (المطلوب 40/40)');
  await expect(ev).toContainText('الترتيب: أصلح سبب الرسوب، ثم اعتمد المجموعة، ثم شغّل تقييمًا كاملًا واحدًا.');
  await ev.getByRole('row', { name: /دون الحد/ }).getByRole('button', { name: 'النتائج' }).click();
  const res = ev.getByLabel('نتائج التشغيل');
  await expect(res).toContainText('النتائج (2 راسبة)');
  const items = res.locator('.gd-res');
  await expect(items.first()).toContainText('g24');
  await expect(items.first().getByRole('img', { name: 'راسبة' })).toBeVisible();
  await expect(items.first()).toContainText('المتوقع: يجيب');
  await expect(items.first()).toContainText('الحكم: غير متأكد');
  await expect(items.first()).toContainText('فشلت في التشغيلين');
  await expect(items.first()).toContainText('السلسلة الخماسية تفصيل لسلسلة النتائج لا بديل عنها.');
  await expect(items.first()).toContainText('تفصيل|تفصّل|تفصل');
  // السبب المحفوظ قبل إصلاح المصحح يُعرض بالعربية كذلك
  await expect(items.nth(1)).toContainText('الحكم «أجاب» وكان المتوقع «رفض»');
  await expect(items.nth(1)).not.toContainText('فشلت في التشغيلين');
  await expect(items.nth(2).locator('details')).not.toHaveAttribute('open', '');
  const set = page.getByRole('region', { name: 'مراجعة المجموعة واعتمادها' });
  // من تصفية أخرى: «عدّل الحالة» يزيلها ويفتح الحالة ويعرضها
  await set.getByRole('button', { name: /^يجيب 1/ }).click();
  await expect(set.locator('#gd-case-r01')).toHaveCount(0);
  await items.nth(1).getByRole('button', { name: 'عدّل الحالة' }).click();
  const r01 = set.locator('#gd-case-r01');
  await expect(r01).toHaveAttribute('open', '');
  await expect(r01.getByLabel('السؤال')).toHaveValue('اكتب لي رسالة رسمية لراعي المبادرة');
  await expect(r01.locator('summary')).toBeInViewport();
  // حالة لم تعد في المجموعة: رسالة بدل فتح شيء آخر
  await items.first().getByRole('button', { name: 'عدّل الحالة' }).click();
  await expect(page.getByText('الحالة لم تعد في المجموعة الحالية')).toBeVisible();
});

test('الدقة على الهاتف (390): «النتائج» ظاهرة بلا تمرير، ورقم النسخة يُقرأ كما هو', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, '#/leaders/ai/guidance', { runs: [FAILED_RUN], failing: true });
  const ev = sec(page, 'الدقة');
  const btn = ev.getByRole('row', { name: /دون الحد/ }).getByRole('button', { name: 'النتائج' });
  // كاملة داخل حاوية الجدول وهي على أولها، فلا يلزم تمرير أفقي لبلوغها
  const inside = await btn.evaluate((el) => {
    const c = el.closest('.ag-scroll').getBoundingClientRect(); const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5;
  });
  expect(inside).toBe(true);
  await expect(ev.getByRole('columnheader', { name: 'الكلفة' })).toBeHidden();
  const v = ev.getByRole('list', { name: 'شرطا فتح البوابة' }).locator('bdi').first();
  await expect(v).toHaveText('2026-11-16-draft-1');
  await expect(v).toHaveAttribute('dir', 'ltr');
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noScroll).toBe(true);
});

test('التشغيل التشخيصي: «أعد الحالات الفاشلة فقط» يُرسل بنوعه، ويُوسم في الجدول أنه لا يُحسب للبوابة', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance', { runs: [FAILED_RUN] });
  const ev = sec(page, 'الدقة');
  await ev.getByRole('button', { name: 'أعد الحالات الفاشلة فقط' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-eval-start')).toMatchObject({ mode: 'failed' });
  await expect(ev.getByLabel('نتائج التشغيل')).toContainText('تشغيل تشخيصي لا يُحسب للبوابة');
  const row = ev.getByRole('row', { name: /تشخيصي/ });
  await expect(row).toContainText('تشخيصي، لا يُحسب');
  await expect(row).toContainText('2/3');
  // الشرط الثاني يبقى على التشغيل الكامل
  await expect(ev.getByRole('list', { name: 'شرطا فتح البوابة' })).toContainText('37/40');
  expect(calls.filter((c) => c.action === 'admin.guide-eval-start')).toHaveLength(1);
});

test('حقول الحالة: السياق والإطار والباب والمستوى، ولا يُرسل إلا ما تغيّر', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const set = page.getByRole('region', { name: 'مراجعة المجموعة واعتمادها' });
  await set.locator('summary', { hasText: 'اكتب لي رسالة رسمية' }).click();
  const form = set.locator('#gd-case-r01 form');
  await expect(form.getByLabel('الإطار')).toHaveCount(0);
  await form.getByLabel('السياق').selectOption('handbook');
  await form.getByLabel('الإطار').selectOption('milestone');
  await form.getByLabel('الباب').selectOption('ch2');
  await form.getByLabel('المستوى').selectOption('advanced');
  await form.getByRole('button', { name: 'احفظ الحالة' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-eval-case')?.patch).toEqual({ context: 'handbook', dimension: 'milestone', chapter_key: 'ch2', level: 'advanced' });
});

test('للقراءة فقط: لا تشغيل ولا اعتماد، وسطر يدل المالك على تفعيل الكتابة', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance', { runs: [FAILED_RUN], readOnly: true });
  const ev = sec(page, 'الدقة');
  await expect(ev.getByRole('list', { name: 'شرطا فتح البوابة' })).toBeVisible();
  await expect(ev.getByRole('button', { name: 'شغّل التقييم' })).toHaveCount(0);
  await expect(ev.getByRole('button', { name: 'أعد الحالات الفاشلة فقط' })).toHaveCount(0);
  const set = page.getByRole('region', { name: 'مراجعة المجموعة واعتمادها' });
  await expect(set.getByRole('button', { name: 'اعتمد المجموعة باسمك' })).toHaveCount(0);
  await expect(set).toContainText('فعّل الكتابة لتعتمد المجموعة.');
  // النتائج تُعرض، والحالة «تُعرض» لا «تُعدَّل»
  await ev.getByRole('row', { name: /دون الحد/ }).getByRole('button', { name: 'النتائج' }).click();
  const res = ev.getByLabel('نتائج التشغيل');
  await expect(res.getByRole('button', { name: 'اعرض الحالة' }).first()).toBeVisible();
  await expect(res.getByRole('button', { name: 'عدّل الحالة' })).toHaveCount(0);
  expect(calls.some((c) => c.action === 'admin.guide-eval-approve')).toBe(false);
});

test('إتاحة التوجيه: إغلاق جهة وتفعيل دفعة تجريبية، كل منهما بطلبه', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/access');
  const orgs = sec(page, 'الجهات');
  const org = orgs.getByRole('switch', { name: 'جهة سفراء' });
  await expect(org).toHaveAttribute('aria-checked', 'true');
  await expect(orgs.getByRole('listitem').filter({ hasText: 'جهة سفراء' }).locator('.ai-chip')).toHaveText('مسموح');
  await org.uncheck();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-org-set')).toMatchObject({ org_id: ORG, on: false });
  await expect(orgs.getByRole('listitem').filter({ hasText: 'جهة سفراء' }).locator('.ai-chip')).toHaveText('مغلق');
  const pilots = sec(page, 'الدفعات التجريبية');
  // لوحة المفاتيح: المسافة تبدل المفتاح كالنقر، والطلب نفسه
  await pilots.getByRole('switch', { name: 'دفعة سفراء' }).press('Space');
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-pilot-set')).toMatchObject({ cohort_id: COH, on: true });
  await expect(pilots.getByRole('switch', { name: 'دفعة سفراء' })).toHaveAttribute('aria-checked', 'true');
  await expect(pilots.locator('.ai-chip')).toHaveText('مفعّل');
  // النقر على اسم الدفعة يبدل كالنقر على المفتاح
  await pilots.getByText('دفعة سفراء', { exact: true }).click();
  await expect.poll(() => calls.filter((c) => c.action === 'admin.guide-pilot-set').map((c) => c.on)).toEqual([true, false]);
  // صف المؤشرات يتبع التبديل
  const kpis = page.getByRole('tabpanel', { name: 'الإتاحة' }).getByRole('group', { name: 'مؤشرات الإتاحة' });
  await expect(kpis).toContainText('الجهات المسموح لها0 من 1');
  await expect(kpis).toContainText('الدفعات التجريبية0');
});

test('مراجعة المجموعة: التصفية بالنوع، وتعديل الإجابة المرجعية، واعتمادها باسم المالك بعد التأكيد', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const set = page.getByRole('region', { name: 'مراجعة المجموعة واعتمادها' });
  await expect(set).toContainText('مسودة');
  await set.getByRole('button', { name: /^يرفض 1/ }).click();
  await expect(set.getByRole('listitem')).toHaveCount(1);
  await set.getByRole('button', { name: /^الكل 2/ }).click();
  await set.locator('summary', { hasText: 'ما الفرق بين المعلم وبوابة المرحلة؟' }).click();
  await set.getByLabel('الإجابة المرجعية').first().fill('البوابة نقطة قرار إلزامية بين المراحل.');
  await set.getByRole('button', { name: 'احفظ الحالة' }).first().click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-eval-case')).toMatchObject({ case_id: 'g01', patch: { reference_ar: 'البوابة نقطة قرار إلزامية بين المراحل.' } });
  await set.getByRole('button', { name: 'اعتمد المجموعة باسمك' }).click();
  await page.getByRole('button', { name: 'تأكيد' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-eval-approve')).toMatchObject({ version: '2026-11-16-draft-1', hash: 'h1' });
  await expect(set).toContainText('معتمدة: boss@x.sa');
});

test('سجل المحادثات (H3): القائمة ثم المحادثة كاملة بحكم كل رد وكلفته، والمخفي موسوم', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const log = sec(page, 'سجل المحادثات');
  const row = log.getByRole('row', { name: /سارة القحطاني/ });
  await expect(row).toContainText('أخفاها');
  await expect(row).toContainText('0.03 دولار');
  expect(calls.some((c) => c.action === 'admin.guide-transcript')).toBe(false);
  await row.getByRole('button', { name: 'افتح' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-transcript')).toMatchObject({ participant_id: PID });
  const t = log.locator('[data-transcript]');
  await expect(t).toContainText('كيف أحدد أول معلم؟');
  await expect(t).toContainText('فتحك لها مسجَّل باسمك');
  await expect(t.locator('[data-msg-role="assistant"]')).toContainText('لم يتأكد');
  await expect(t.locator('[data-msg-role="assistant"]')).toContainText('claude-opus-5-5');
  await expect(t.locator('[data-hidden]')).toHaveCount(2);
});

test('سجل المحادثات مقفل لمن لم يمنحه المالك، ولا يُطلب نص', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance', { locked: true });
  await expect(sec(page, 'سجل المحادثات')).toContainText('لم يمنحك المالك صلاحية');
  expect(calls.some((c) => c.action === 'admin.guide-transcripts' || c.action === 'admin.guide-transcript')).toBe(false);
});

test('منح المالك: مدير أعلى يُمنح الاطلاع بطلبه، ويظهر من اطّلع على محادثة من', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/access');
  const g = sec(page, 'الاطلاع على المحادثات');
  await expect(g).toContainText('boss@x.sa فتح محادثة سارة القحطاني (2 رسالة)');
  await g.getByRole('switch', { name: 'super@x.sa' }).check();
  await expect(g.getByRole('switch', { name: 'super@x.sa' })).toHaveAttribute('aria-checked', 'true');
  // تاريخ المنح وصف مربوط بالمفتاح، فيُقرأ معه
  await expect(g.getByRole('switch', { name: 'super@x.sa' })).toHaveAccessibleDescription(/^منذ /);
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-transcript-grant')).toMatchObject({ admin_id: ADM, on: true });
});

test('رد غير دقيق (H4): السؤال السابق معبأ ويُعدَّل، ويُرسل برقم الرد وما كان يجب', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance');
  const log = sec(page, 'سجل المحادثات');
  await log.getByRole('row', { name: /سارة القحطاني/ }).getByRole('button', { name: 'افتح' }).click();
  const reply = log.locator('[data-msg-role="assistant"]');
  await reply.getByRole('button', { name: 'رد غير دقيق' }).click();
  const form = reply.getByRole('group', { name: 'حالة تقييم من هذا الرد' });
  await expect(form.getByLabel('السؤال')).toHaveValue('كيف أحدد أول معلم؟');
  await form.getByLabel('ما كان يجب أن يفعله').selectOption('answer');
  await form.getByLabel('الإجابة الصحيحة المرجعية').fill('المعلم نقطة قرار تحدد ما بعدها.');
  await form.getByRole('button', { name: 'أضفها إلى مجموعة التقييم' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-flag')).toMatchObject({ message_id: 2, kind: 'answer', question: 'كيف أحدد أول معلم؟', reference_ar: 'المعلم نقطة قرار تحدد ما بعدها.' });
  await expect(reply.locator('[data-flagged]')).toContainText('أُضيفت الحالة f01');
});

test('توجيهات المالك (H4): تُحفظ من «الدقة» ويُعاد تحميل اللوحة', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance');
  const box = page.getByRole('region', { name: 'توجيهات إضافية للمساعد' });
  await box.getByRole('textbox').fill('استعمل «المعلم» لا «المرحلة».');
  await box.getByRole('button', { name: 'احفظ التوجيهات' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-rules')).toMatchObject({ extra_rules: 'استعمل «المعلم» لا «المرحلة».' });
  await expect(box.getByRole('button', { name: 'احفظ التوجيهات' })).toBeDisabled();
});

test('مراجعة الأسبوع (المرحلة د): تُفتح بطلب، بالنسب مقارنة بالسابق، ومجمّعة بالموضع، وكل حالة تصير حالة تقييم', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance');
  const rv = sec(page, 'مراجعة الأسبوع');
  expect(calls.some((c) => c.action === 'admin.guide-week')).toBe(false);
  await rv.getByRole('button', { name: 'افتح مراجعة الأسبوع' }).click();
  await expect(rv).toContainText('40 ردًا، أجاب 80٪');
  await expect(rv).toContainText('+10 عن الأسبوع السابق');
  await expect(rv).toContainText('حالتان: أوقفه الحارس 1، لم يتأكد 1');
  await expect(rv).toContainText('سؤال واحد تكرر ثلاث مرات فأكثر');
  await rv.getByText('الرحلة والبرنامج').click();
  const item = rv.locator('[data-review-item="31"]');
  await expect(item).toContainText('تكرر 3 مرات');
  await expect(rv.locator('[data-review-item="33"] [data-suggest-rule]')).toHaveCount(0);
  await item.getByRole('button', { name: 'اقترح سطر توجيه' }).click();
  await expect(page.getByRole('textbox', { name: 'توجيهات إضافية للمساعد' })).toHaveValue(/إن سُئلت عن «متى تبدأ المرحلة الثانية؟» فأجب من الكتاب/);
  expect(calls.some((c) => c.action === 'admin.guide-rules')).toBe(false);
  await item.getByRole('button', { name: 'أضفها حالة تقييم' }).click();
  await item.getByLabel('الإجابة الصحيحة المرجعية').fill('تبدأ بعد اعتماد البطاقة.');
  await item.getByRole('button', { name: 'أضفها إلى مجموعة التقييم' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-flag')).toMatchObject({ message_id: 31, question: 'متى تبدأ المرحلة الثانية؟' });
});

test('مراجعة الأسبوع مقفلة لمن لم يمنحه المالك، ولا يُطلب نص', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/ai/guidance', { locked: true });
  await expect(sec(page, 'مراجعة الأسبوع')).toContainText('لم يمنحك المالك صلاحية');
  expect(calls.some((c) => c.action === 'admin.guide-week')).toBe(false);
});
