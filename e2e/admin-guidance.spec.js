// تبويبا «التوجيه والإرشاد» و«إتاحة التوجيه» في اللوحة (H1، قرار المالك 2026-11-16): الحالة وما يمنع الفتح والتشغيل،
// والإنفاق، والاستعمال موزعًا على الجهات والدفعات، والدقة بتشغيل التقييم، والجهات والدفعات التجريبية. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const ORG = '33333333-3333-4333-8333-333333333333';
const COH = '22222222-2222-4222-8222-222222222222';

function backend() {
  const st = { enabled: false, org: true, pilot: false, steps: 0, runs: [] };
  const dash = () => ({
    success: true, model: 'claude-opus-5-5', policy_version: null, can_write: true,
    settings: { enabled: st.enabled, cap_usd: 5, daily: 8, monthly: 30, retention_days: 90 },
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
  };
  return { st, replies };
}

async function setup(page, hash) {
  const b = backend();
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (route) => route.fulfill({ json: { success: true, contacts: [], sessions: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    const fn = b.replies[body.action];
    await route.fulfill({ json: fn ? fn(body) : { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'المالك', email: 'boss@x.sa', role_id: 'super_admin', is_owner: true, totp_enabled: true }, ts: Date.now() }));
    localStorage.clear();
  });
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  return { calls, st: b.st };
}
const sec = (page, name) => page.getByRole('region', { name });

test('التبويبان في «البرامج» بجانب المساعد الآلي', async ({ page }) => {
  await setup(page, '#/leaders/guidance');
  const group = page.getByRole('group', { name: 'البرامج' });
  await expect(group.getByRole('button', { name: 'التوجيه والإرشاد' })).toHaveAttribute('aria-current', 'page');
  await expect(group.getByRole('button', { name: 'إتاحة التوجيه' })).toBeVisible();
});

test('الحالة: ما يمنع الفتح بنصه، والتشغيل من اللوحة يُرسل ويُحدّث الشروط', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance');
  const state = sec(page, 'الحالة والتحكم');
  await expect(state.getByRole('status')).toHaveText('✕ مغلق لكل المشاركين');
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).toContainText('نسخة السياسة الجوهرية لم تُنشر بعد');
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).toContainText('المساعد متوقف من هذه اللوحة');
  await state.getByRole('switch').check();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-toggle')).toMatchObject({ on: true });
  await expect(state.getByRole('list', { name: 'ما يمنع الفتح' })).not.toContainText('المساعد متوقف من هذه اللوحة');
});

test('الإنفاق والاستعمال: اليوم مقابل السقف، وأعداد 7 و30 يومًا، والتوزيع على الجهات والدفعات', async ({ page }) => {
  await setup(page, '#/leaders/guidance');
  await expect(sec(page, 'الإنفاق')).toContainText('اليوم $1.20 من سقف $5.00 (24٪)');
  await expect(sec(page, 'الإنفاق').getByRole('list', { name: 'الإنفاق اليومي آخر 30 يومًا' }).getByRole('listitem')).toHaveCount(2);
  const usage = sec(page, 'الاستعمال');
  await expect(usage.getByRole('row', { name: /آخر 7 يومًا/ })).toContainText('3 (7.5٪)');
  await expect(usage.getByRole('table', { name: 'الجهة' })).toContainText('جهة سفراء');
  await expect(usage.getByRole('table', { name: 'الدفعة' })).toContainText('دفعة سفراء');
});

test('الدقة: المسودة تُغلق البوابة، والتشغيل بدفعات حتى ينتهي، والنتائج بردودها', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance');
  const ev = sec(page, 'الدقة');
  await expect(ev).toContainText('مسودة بانتظار اعتماد المالك');
  await ev.getByRole('button', { name: 'شغّل التقييم' }).click();
  await expect(ev.getByRole('row', { name: /ناجح/ })).toContainText('40/40');
  expect(calls.filter((c) => c.action === 'admin.guide-eval-step').length).toBe(2);
  await ev.getByRole('button', { name: 'النتائج' }).click();
  await expect(ev.getByLabel('نتائج التشغيل')).toContainText('ما الفرق بين المعلم وبوابة المرحلة؟');
});

test('إتاحة التوجيه: إغلاق جهة وتفعيل دفعة تجريبية، كل منهما بطلبه', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance-access');
  const orgs = sec(page, 'الجهات');
  await orgs.getByRole('checkbox', { name: 'جهة سفراء' }).uncheck();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-org-set')).toMatchObject({ org_id: ORG, on: false });
  await sec(page, 'الدفعات التجريبية').getByRole('checkbox', { name: 'دفعة سفراء' }).check();
  await expect.poll(() => calls.find((c) => c.action === 'admin.guide-pilot-set')).toMatchObject({ cohort_id: COH, on: true });
});

test('مراجعة المجموعة: التصفية بالنوع، وتعديل الإجابة المرجعية، واعتمادها باسم المالك بعد التأكيد', async ({ page }) => {
  const { calls } = await setup(page, '#/leaders/guidance');
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
