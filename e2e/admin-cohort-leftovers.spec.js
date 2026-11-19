// بقايا محرر رحلة الدفعة (الجولة الخامسة): تنبيه «يوم ورشة خارج نافذة مرحلته» في رأس تبويب «الرحلة» وفي «الحضور والجلسات»
// من علامة الخط نفسه، وزر «اجعل نهاية الدفعة …» يضع نهاية السلسلة في المسودة ويحفظها بنافذة الأثر (admin.cohort-plan) وحده،
// ولا زر للقراءة فقط. الخلفية مُحاكاة، واليوم 16 نوفمبر 2026. SHOTS_DIR: لقطات 1440 و390.
import { test, expect } from '@playwright/test';
import { planImpact } from '../supabase/functions/leaders-api/cohort-plan.js';

const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';

// السلسلة من 2 نوفمبر: الاعتماد 2 إلى 4، والتدريب 5 إلى 18، والتقرير 19 إلى 25. ونهاية الدفعة المسجلة 20 نوفمبر: تتجاوزها بخمسة أيام
const stages = [
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 1, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 14, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 3, duration_days: 7, active: true },
];
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const requirements = [
  { id: R, code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 2, verify: 'qr' } },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 1, versions: [] }];
const ENDS = '2026-11-20';
const cohortRow = { id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: ENDS, delivery: {}, members: 0, schedule: {} };
const sessions = [
  { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض', starts_at: '2026-11-09T06:00:00Z', ends_at: '2026-11-09T12:00:00Z', active: true },
  { id: 'w2', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 2', mode: 'in_person', location_ar: 'الرياض', starts_at: '2026-12-01T06:00:00Z', ends_at: '2026-12-01T12:00:00Z', active: true },
];
const milestones = [{ id: 'm-end', title_ar: 'قبل نهاية الدفعة', stage_key: null, anchor: 'cohort_end', offset_days: -2, complete: 'manual', active: true, sort: 1 }];

async function admin(page, width, { readOnly = false } = {}) {
  const calls = [];
  const state = { ends_on: ENDS, updated_at: 'u0' };
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.action === 'me' && readOnly) return r.fulfill({ json: { success: true, role: 'admin', method: 'email_code', can_write: false, can_elevate: true, read_only_reason: 'second_factor' } });
    return r.fulfill({ json: { success: true, contacts: [] } });
  });
  const cohort = () => ({ ...cohortRow, ends_on: state.ends_on });
  const impactOf = (b) => planImpact({ stages, before: {}, after: {}, cohort: cohort(), milestones, endsOn: b.ends_on });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts: [cohort()], organizations: [] },
      'admin.cohort-definition': { success: true, program_id: 'pa', version: null, stages, hidden: [], sessions,
        requirements: requirements.map((r) => ({ ...r, stage_title_ar: 'التدريب', stage_rules: {}, stage_active: true, hidden: false })),
        cohort_plan: { schedule: {}, starts_on: '2026-11-02', ends_on: state.ends_on, is_default: false, status: 'running', program_version_id: null, updated_at: state.updated_at } },
      'admin.milestones': { success: true, program_id: 'pa', milestones },
      'admin.cohort-journey': { success: true, journey_map: { stages: [], totals: { total: 0 } } },
      'admin.cohort-workshops': { success: true, capacity_ready: true, sessions: sessions.map((s) => ({ ...s, verify: 'qr', expected: 0, attended: 0 })) },
      'admin.activities': { success: true, capacity_ready: true, requirements: requirements.map((r) => ({ ...r, program_id: 'pa' })), coaching: [], programs, cohorts: [cohort()],
        workshops: sessions.map((s) => ({ ...s, verify: 'qr', attended: 0, outside: s.id === 'w2' ? [{ cohort_id: 'c1', cohort: 'دفعة نوفمبر', stage: 'التدريب', window_ar: '5 نوفمبر إلى 18 نوفمبر' }] : [] })) },
    };
    if (b.action === 'admin.cohort-plan' && b.op === 'preview') return route.fulfill({ json: { success: true, preview: true, locked: null, changed: b.ends_on !== undefined, plan: {}, impact: impactOf(b) } });
    if (b.action === 'admin.cohort-plan' && b.op === 'save') {
      const impact = impactOf(b);
      state.ends_on = b.ends_on;
      state.updated_at = 'u1';
      return route.fulfill({ json: { success: true, saved: true, cohort: { id: 'c1', schedule: {}, updated_at: 'u1', ends_on: b.ends_on }, plan: {}, impact, exempted: 0, notified: null } });
    }
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
  return calls;
}
const shot = async (page, name, target) => {
  if (!SHOTS) return;
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const width of [1440, 390]) {
  test(`يوم خارج نافذة مرحلته في الرأس وفي «الحضور والجلسات»، و«اجعل نهاية الدفعة …» بالمسودة ونافذة الأثر (${width})`, async ({ page }) => {
    const calls = await admin(page, width);
    // التنبيه من علامة الخط نفسه: اليوم 2 (1 ديسمبر) خارج نافذة التدريب، واليوم 1 لا
    const out = page.getByTestId('cj-outside');
    await expect(out).toContainText('يوم ورشة خارج نافذة مرحلته');
    await expect(out.getByRole('button')).toHaveCount(1);
    await expect(out.getByRole('button')).toContainText('خارج نافذة «التدريب»');
    await expect(page.locator('#cj-days-training .cj-day', { hasText: 'اليوم 2' }).locator('.cj-day-warn')).toContainText('خارج نافذة المرحلة');
    await shot(page, 'outside-head', page.locator('.cj-hero'));
    await out.getByRole('button').click();
    await expect(page.locator('#cj-stage-training')).toBeFocused();

    // النهاية: تتجاوز الرحلة نهاية الدفعة، والزر يقترح نهاية السلسلة ولا يطبق شيئًا
    await expect(page.getByText('نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة')).toBeVisible();
    const offer = page.getByTestId('cj-ends');
    const btn = offer.getByRole('button', { name: /^اجعل نهاية الدفعة / });
    await expect(btn).toBeVisible();
    await shot(page, 'ends-offer', offer);
    expect(calls.filter((c) => c.action === 'admin.cohort-plan')).toEqual([]);
    await btn.click();
    await expect(page.getByTestId('cj-ends-draft')).toContainText('في المسودة: نهاية الدفعة');
    await expect(offer).toHaveCount(0);
    await expect(page.getByText('نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة')).toHaveCount(0);
    const bar = page.getByRole('region', { name: 'حفظ الخطة' });
    await expect(bar).toContainText('تعديل واحد غير محفوظ');
    await expect(bar).toContainText('ونهاية الدفعة');
    expect(calls.filter((c) => c.action === 'admin.cohort-plan')).toEqual([]);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'ends-draft', page.getByTestId('cj-ends-draft'));

    await bar.getByRole('button', { name: 'راجع واحفظ' }).click();
    const dlg = page.getByRole('dialog', { name: 'راجع أثر التعديل قبل الحفظ' });
    await expect(dlg.locator('li', { hasText: 'نهاية الدفعة المسجلة تصير' })).toContainText('فتتبعها معالم «نهاية الدفعة» وما يمتد إلى نهايتها');
    await expect(dlg).toContainText('معلم واحد يتغير موعده');
    await expect(dlg).toContainText('البريد: لن يُرسل شيء الآن');
    const preview = calls.find((c) => c.action === 'admin.cohort-plan' && c.op === 'preview');
    expect(preview).toMatchObject({ cohort_id: 'c1', ends_on: '2026-11-25', base_updated_at: 'u0' });
    await shot(page, 'ends-impact', dlg);
    await dlg.getByRole('button', { name: 'احفظ الخطة' }).click();
    await expect(dlg).toBeHidden();
    expect(calls.find((c) => c.action === 'admin.cohort-plan' && c.op === 'save')).toMatchObject({ ends_on: '2026-11-25', base_updated_at: 'u0' });
    // لا مسار حفظ ثانٍ لنهاية الدفعة من التبويب
    expect(calls.filter((c) => c.action === 'admin.cohort-save')).toEqual([]);
    await expect(page.getByText('نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة')).toHaveCount(0);
    await expect(page.getByTestId('cj-ends')).toHaveCount(0);

    // «الحضور والجلسات»: السطر تحت موعد اليوم الخارج وحده
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
    const ws = page.locator(`#ws-${R}`);
    await expect(ws.locator('tr', { hasText: 'اليوم 2' }).locator('.ws-out')).toHaveText('خارج نافذة «التدريب» (5 نوفمبر إلى 18 نوفمبر). الحضور يُحسب، وراجع الموعد أو مدة المرحلة');
    await expect(ws.locator('tr', { hasText: 'اليوم 1' }).locator('.ws-out')).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'activities-outside', ws);
  });
}

test('القراءة فقط: التنبيهان ظاهران، ولا زر «اجعل نهاية الدفعة …»', async ({ page }) => {
  await admin(page, 1440, { readOnly: true });
  await expect(page.getByTestId('cj-outside')).toBeVisible();
  await expect(page.getByText('نهاية الرحلة المحسوبة تتجاوز نهاية الدفعة المسجلة')).toBeVisible();
  await expect(page.getByTestId('cj-ends')).toHaveCount(0);
});
