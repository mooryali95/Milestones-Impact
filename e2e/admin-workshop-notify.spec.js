// متابعات بريد الورشة في اللوحة (قرار المالك 2026-11-22):
//   سحب موعد جلسة أُعلنت من نموذجها: قبل الحفظ يرى المدير من الخادم كم مشاركًا يُبلَّغ ومعهم المدرب، وله ألا يبلّغ.
//   إلغاء جلسة غُيّر موعدها بلا إبلاغ: السؤال يقول إن المدعوين يعرفون موعدًا سابقًا وإن البريد يذكره.
//   استبدال المدرب في جلسة معلنة: الرسالة بعد الحفظ تقول إن السابق أُبلغ والجديد دُعي.
//   وفي «الحضور والجلسات» الأسئلة بكلمة الشاشة «الموعد»، وبعد الحذف «حُذف الموعد».
// الخلفية مُحاكاة بحالة واحدة كما في activities.ts (المعاينة لا تكتب)، واليوم 16 نوفمبر 2026.
// SHOTS_DIR: مجلد لقطات نوافذ التأكيد (1440 و390).
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';
const MEMBERS = 12, TRAINER = 'د. منى القحطاني', SECOND = 'أ. خالد العتيبي';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 2, duration_days: 21, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 3, duration_days: 7, active: true },
];
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const C1 = '11111111-1111-4111-8111-111111111111';
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: R, code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 2, verify: 'qr' } },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 2, versions: [] }];
const cohorts = [{ id: C1, name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2027-01-31', delivery: {}, members: MEMBERS, schedule: {} }];
const day = (id, title, starts, extra = {}) => ({ id, requirement_id: R, cohort_id: C1, title_ar: title, mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', join_url: null,
  starts_at: starts, ends_at: new Date(Date.parse(starts) + 6 * 36e5).toISOString(), active: true, invited_at: '2026-11-05T08:00:00Z', expert_id: null, ...extra });
// اليوم 2 قادم ومعلن وله مدرب. اليوم 3 أُعلن بموعد 30 نوفمبر ثم غُيّر إلى 7 ديسمبر بلا إبلاغ (told_at). اليوم 4 قادم لم يُعلن
const TOLD = '2026-11-30T06:00:00Z';
const fresh = () => ({ sessions: [day('w2', 'اليوم 2', '2026-11-23T06:00:00Z', { expert_id: 'e1' }), day('w3', 'اليوم 3', '2026-12-07T06:00:00Z', { invited_at: null, told_at: TOLD }), day('w4', 'اليوم 4', '2026-12-14T06:00:00Z', { invited_at: null })] });

// «الخادم» كما في activities.ts: leaveOf وtoldOf (هنا told_at على الصف) والمعاينة التي لا تكتب، والحفظ يعيد ما جرى للبريد
function server(state) {
  const told = (s) => (s.invited_at && s.starts_at ? { at: s.starts_at, stale: false } : s.told_at ? { at: s.told_at, stale: true } : null);
  const who = (s) => ({ members: MEMBERS, trainer: s.expert_id ? TRAINER : null });
  const leaveOf = (s, row) => (s.active === false ? (row.active !== false ? 'restore' : null) : row.active === false ? 'cancel'
    : 'cohort_id' in row && s.cohort_id && (row.cohort_id || null) !== s.cohort_id ? 'move' : s.starts_at && !row.starts_at ? 'undate' : null);
  const preview = (s, kind) => {
    const t = told(s);
    return { kind, notify: t ? who(s) : null, skipped: t ? null : 'unannounced', uncomplete: 0, ...(t?.stale ? { told_at: t.at } : {}) };
  };
  const sent = (s) => ({ sent: MEMBERS, failed: 0, total: MEMBERS, ...(s.expert_id ? { trainer: 'sent' } : {}), ...(told(s)?.stale ? { stale: true } : {}) });
  const notice = (s, b) => (!told(s) ? { skipped: 'unannounced' } : b.notify_cancel === false ? { skipped: 'opted_out' } : sent(s));
  return (b) => {
    if (b.action === 'admin.workshop-save') {
      const s = state.sessions.find((x) => x.id === b.row.id);
      const kind = leaveOf(s, b.row);
      if (b.preview) return { success: true, preview: true, counting: 'mandatory', changed: false, impact: null, leave: kind ? preview(s, kind) : null };
      const before = { ...s };
      Object.assign(s, b.row, { expert_id: b.row.expert_id || null });
      if (kind === 'cancel') return { success: true, id: s.id, cancel: notice(before, b) };
      if (kind === 'undate') {
        const undate = notice(before, b);
        Object.assign(s, { starts_at: null, ends_at: null, invited_at: null, ...(undate.sent ? { told_at: null } : { told_at: told(before)?.at || null }) });
        return { success: true, id: s.id, undate };
      }
      // استبدال المدرب في جلسة معلنة: للسابق بريد وللجديد الدعوة
      const swap = (before.expert_id || null) !== (s.expert_id || null) && !!before.invited_at;
      return { success: true, id: s.id, ...(swap && before.expert_id ? { released: 'sent' } : {}), ...(swap && s.expert_id ? { trainer: 'sent' } : {}) };
    }
    if (b.action === 'admin.workshop-delete') {
      const s = state.sessions.find((x) => x.id === b.id);
      if (b.preview) return { success: true, preview: true, leave: preview(s, 'delete') };
      state.sessions = state.sessions.filter((x) => x.id !== b.id);
      return { success: true, cancel: notice(s, b) };
    }
    const names = { e1: TRAINER, e2: SECOND };
    const rows = state.sessions.map(({ told_at: _t, ...s }) => ({ ...s, verify: 'qr', expected: MEMBERS, attended: 0, trainer: names[s.expert_id] || null }));
    const trainers = [{ id: 'e1', full_name: TRAINER }, { id: 'e2', full_name: SECOND }];
    if (b.action === 'admin.cohort-workshops') return { success: true, capacity_ready: false, optional_ready: true, trainers, sessions: rows };
    if (b.action === 'admin.activities') {
      return { success: true, capacity_ready: false, optional_ready: true, cohort_trainers: { [C1]: trainers }, requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })),
        workshops: rows, coaching: [], programs, cohorts };
    }
    return null;
  };
}

async function admin(page, width, state, tab = 'journey') {
  const calls = [];
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  const own = server(state);
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': { success: true, program_id: 'pa', version: null, stages, hidden: [], sessions: state.sessions,
        requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
        cohort_plan: { schedule: {}, starts_on: '2026-11-02', ends_on: '2027-01-31', is_default: false, status: 'running', program_version_id: null, updated_at: 'u0' } },
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: { stages: [], totals: { total: 0 } } },
    };
    await route.fulfill({ json: own(b) ?? replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  const nav = page.getByRole('navigation', { name: 'أقسام تطبيق القادة' });
  if (tab === 'activities') { await nav.getByRole('button', { name: 'الحضور والجلسات' }).click(); return calls; }
  await nav.getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
  return calls;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` }); };
const saves = (calls) => calls.filter((c) => c.action === 'admin.workshop-save');
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const inView = async (page, box) => { const b = await box.boundingBox(); const v = page.viewportSize(); return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1; };
const DASH = /[–—]/;

for (const width of [1440, 390]) {
  test(`سحب موعد جلسة معلنة من «الحضور والجلسات»: العدد والمدرب قبل الحفظ، والإبلاغ افتراضًا، وبعده رسالة بما أُرسل (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state, 'activities');
    const ws = page.locator(`#ws-${R}`);
    await ws.locator('tr', { hasText: 'اليوم 2' }).getByRole('button', { name: 'تحرير' }).click();
    const form = page.getByRole('dialog', { name: 'تحرير موعد' });
    await form.getByLabel('تبدأ').fill('');
    await form.getByLabel('تنتهي').fill('');
    await form.getByRole('button', { name: 'حفظ' }).click();
    const box = page.getByRole('alertdialog');
    await expect(box).toContainText('يُسحب موعد «اليوم 2»: يبقى في رحلة المشاركين بلا موعد، «يُحدد لاحقًا».');
    await expect(box.getByTestId('confirm-lines')).toHaveText(`يصل بريد سحب الموعد إلى ${MEMBERS} مشاركًا، وإلى المدرب ${TRAINER}، ومعه ملف يزيل الموعد من التقويم.`);
    // المعاينة لا تكتب: الموعد قائم حتى التأكيد
    expect(saves(calls).at(-1)).toMatchObject({ preview: true, row: { id: 'w2' } });
    expect(state.sessions.find((s) => s.id === 'w2').starts_at).toBe('2026-11-23T06:00:00Z');
    await expect(box.getByRole('checkbox', { name: /أبلغ المدعوين بسحب الموعد/ })).toBeChecked();
    expect(DASH.test(await box.innerText())).toBe(false);
    expect(await inView(page, box)).toBe(true);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'undate-confirm');
    await box.getByRole('button', { name: 'احفظ بلا موعد', exact: true }).click();
    await expect(form).toBeHidden();
    const done = saves(calls).at(-1);
    expect([done.preview, 'notify_cancel' in done, done.row.starts_at || null]).toEqual([undefined, false, null]);
    await expect(page.locator('.toast')).toHaveText(`تم الحفظ، وأُرسل بريد سحب الموعد إلى ${MEMBERS} مشاركًا، وأُبلغ المدرب`);
    await expect(ws.locator('tr', { hasText: 'اليوم 2' })).toContainText('بلا موعد');

    // جلسة لم تُعلن: سحب موعدها حفظ عادي بلا سؤال ولا بريد
    await ws.locator('tr', { hasText: 'اليوم 4' }).getByRole('button', { name: 'تحرير' }).click();
    const f4 = page.getByRole('dialog', { name: 'تحرير موعد' });
    await f4.getByLabel('تبدأ').fill('');
    await f4.getByLabel('تنتهي').fill('');
    await f4.getByRole('button', { name: 'حفظ' }).click();
    await expect(f4).toBeHidden();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveText('تم الحفظ');
  });

  test(`سحب الموعد بلا إبلاغ من بطاقة المرحلة، وإلغاء جلسة غُيّر موعدها بصمت يقول أي موعد يعرفه المدعوون (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state);
    const days = page.locator('#cj-days-training');
    // اليوم 3: موعده المخزَّن 7 ديسمبر، والمدعوون يعرفون 30 نوفمبر
    const d3 = days.locator('.cj-day', { hasText: 'اليوم 3' });
    await d3.getByRole('button', { name: 'ألغِ اليوم: اليوم 3' }).click();
    const box = page.getByRole('alertdialog');
    const lines = box.getByTestId('confirm-lines').locator('li');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText(`يصل بريد الإلغاء إلى ${MEMBERS} مشاركًا، ومعه ملف يزيل الموعد من التقويم.`);
    await expect(lines.nth(1)).toContainText('المدعوون يعرفون موعدًا سابقًا لم يُبلَّغوا بتغييره:');
    await expect(lines.nth(1)).toContainText('30 نوفمبر');
    await expect(lines.nth(1)).toContainText('البريد يقول إنه هو الملغى.');
    await expect(box.getByRole('checkbox', { name: /أبلغ المدعوين بالإلغاء/ })).toBeChecked();
    expect(DASH.test(await box.innerText())).toBe(false);
    expect(await inView(page, box)).toBe(true);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'cancel-stale-confirm');
    await box.getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
    await expect(d3).toContainText('ملغى لهذه الدفعة');
    await expect(page.locator('.toast')).toHaveText(`أُلغي اليوم، وأُرسل بريد الإلغاء إلى ${MEMBERS} مشاركًا`);

    // اليوم 2 من نموذجه في البطاقة: سحب الموعد مع إزالة العلامة، فلا يُبلَّغ أحد
    await days.locator('.cj-day', { hasText: 'اليوم 2' }).getByRole('button', { name: /^حرّر/ }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('تبدأ').fill('');
    await form.getByLabel('تنتهي').fill('');
    await form.getByRole('button', { name: 'حفظ' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask).toContainText('يُسحب موعد «اليوم 2»');
    await ask.getByRole('checkbox', { name: /أبلغ المدعوين بسحب الموعد/ }).uncheck();
    await ask.getByRole('button', { name: 'احفظ بلا موعد', exact: true }).click();
    await expect(form).toBeHidden();
    expect(saves(calls).at(-1)).toMatchObject({ notify_cancel: false, row: { id: 'w2' } });
    await expect(page.locator('.toast')).toHaveText('حُفظ اليوم، ولم يُبلَّغ أحد كما اخترت');
  });

  test(`استبدال المدرب في جلسة معلنة: الرسالة تقول إن السابق أُبلغ والجديد دُعي (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state, 'activities');
    const ws = page.locator(`#ws-${R}`);
    await ws.locator('tr', { hasText: 'اليوم 2' }).getByRole('button', { name: 'تحرير' }).click();
    const form = page.getByRole('dialog', { name: 'تحرير موعد' });
    await expect(form).toContainText('تغييره في جلسة أُرسلت دعوتها يبلّغ السابق ويدعو الجديد.');
    await form.getByLabel('المدرب (اختياري)').selectOption({ label: SECOND });
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect(form).toBeHidden();
    expect(saves(calls).at(-1).row).toMatchObject({ id: 'w2', expert_id: 'e2' });
    await expect(page.locator('.toast')).toHaveText('تم الحفظ، وأُبلغ المدرب السابق، وأُرسلت الدعوة إلى المدرب الجديد');
    expect(await noOverflow(page)).toBe(true);
  });
}
