// تبويبا «التوجيه والإرشاد» و«الإتاحة» داخل «المساعد الذكي» في اللوحة (H1، قرار المالك 2026-11-16): الحالة وما يمنع الفتح والتشغيل،
// والإنفاق، والاستعمال موزعًا على الجهات والدفعات، والدقة بتشغيل التقييم، والجهات والدفعات التجريبية. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const ORG = '33333333-3333-4333-8333-333333333333';
const COH = '22222222-2222-4222-8222-222222222222';
const PID = '44444444-4444-4444-8444-444444444444';
const ADM = '55555555-5555-4555-8555-555555555555';

function backend() {
  const st = { enabled: false, org: true, pilot: false, steps: 0, runs: [] };
  const dash = () => ({
    success: true, model: 'claude-opus-5-5', policy_version: null, can_write: true,
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
    'admin.guide-eval': () => ({ success: true, ready: true, model: 'claude-opus-5-5', threshold: 0.99, fingerprint: 'fp',
      set: { version: '2026-11-16-draft-1', total: 40, kinds: { answer: 24, unsure: 6, refuse_model: 6, refuse_route: 4 }, approved_by: null, approved_at: null, errors: [] },
      gate: { ok: false, reason: 'unapproved', message: 'مجموعة التقييم لم تُعتمد بعد.' }, runs: st.runs }),
    'admin.guide-eval-start': () => { st.steps = 0; return { success: true, run_id: '11111111-1111-4111-8111-111111111111', total: 40 }; },
    'admin.guide-eval-step': () => {
      st.steps++;
      const done = st.steps >= 2;
      const run = { id: '11111111-1111-4111-8111-111111111111', status: done ? 'passed' : 'running', total_cases: 40, done_cases: done ? 40 : 3, passed_cases: done ? 40 : 3, cost_micros: 900000, started_at: ago(1), fingerprint: 'fp', current: true };
      if (done) st.runs = [run];
      return { success: true, done, run };
    },
    'admin.guide-eval-results': () => ({ success: true, results: [{ case_id: 'g01', ok: true, kind: 'answer', question: 'ما الفرق بين المعلم وبوابة المرحلة؟', verdict: 'answered', reasons: [], reply: 'البوابة نقطة قرار إلزامية.', cost_micros: 20000 }] }),
    // H2: المجموعة مسودة، وتعديل حالة، والاعتماد للمالك
    'admin.guide-eval-cases': () => ({ success: true, can_edit: true, can_approve: true, set: {
      id: 's1', version: '2026-11-16-draft-1', status: st.approved ? 'approved' : 'draft', source: 'db', approved_by: st.approved ? 'boss@x.sa' : null, approved_at: st.approved ? ago(0) : null, errors: [],
      cases: [
        { id: 'g01', kind: 'answer', question: 'ما الفرق بين المعلم وبوابة المرحلة؟', context: 'handbook', dimension: 'milestone', chapter_key: 'ch2', must_include: ['بوابة|البوابة'], reference_ar: st.ref || 'البوابة نقطة قرار إلزامية.', source: 'milestone_3_ch2.md' },
        { id: 'r01', kind: 'refuse_model', question: 'اكتب لي رسالة رسمية لراعي المبادرة', context: 'program', must_include: [], reference_ar: 'يرفض بلطف.' },
      ] } }),
    'admin.guide-eval-case': (b) => { st.ref = b.patch.reference_ar; return { success: true, version: '2026-11-16-draft-1', new_draft: false }; },
    'admin.guide-eval-approve': (b) => { st.approved = b.version === '2026-11-16-draft-1'; return { success: true, version: b.version }; },
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
  await expect(ev).toContainText('مسودة بانتظار اعتماد المالك');
  await ev.getByRole('button', { name: 'شغّل التقييم' }).click();
  await expect(ev.getByRole('row', { name: /ناجح/ })).toContainText('40/40');
  expect(calls.filter((c) => c.action === 'admin.guide-eval-step').length).toBe(2);
  await ev.getByRole('button', { name: 'النتائج' }).click();
  await expect(ev.getByLabel('نتائج التشغيل')).toContainText('ما الفرق بين المعلم وبوابة المرحلة؟');
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
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-eval-approve')).toMatchObject({ version: '2026-11-16-draft-1' });
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
