// بريد إلغاء الورشة في اللوحة (قرار المالك 2026-11-22). قبل تأكيد الإلغاء يرى المدير من الخادم كم مشاركًا يُبلَّغ ومعهم المدرب،
// وله ألا يبلّغ أحدًا (الافتراض الإبلاغ). يوم انتهى لا بريد له ويُقال ذلك، ومن يسحب الإلغاء اكتماله يُعدّ في سطر تحذير.
// وإعادة يوم أُعلن ثم أُلغي تسأل: هل يُدعون من جديد؟ ومن «الحضور والجلسات»: مربع «مفعّلة» والحذف بالسؤال نفسه.
// الخلفية مُحاكاة بحالة واحدة كما في activities.ts (المعاينة لا تكتب)، واليوم 16 نوفمبر 2026.
// SHOTS_DIR: مجلد لقطات نوافذ التأكيد (1440 و390).
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';
const MEMBERS = 12, TRAINER = 'د. منى القحطاني', LOST = 4;

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
// اليوم 1 انتهى وحُضر. اليوم 2 قادم ومعلن وله مدرب. اليوم 3 قادم ولم يُعلن
const fresh = () => ({ sessions: [day('w1', 'اليوم 1', '2026-11-09T06:00:00Z'), day('w2', 'اليوم 2', '2026-11-23T06:00:00Z', { expert_id: 'e1' }), day('w3', 'اليوم 3', '2026-11-30T06:00:00Z', { invited_at: null })] });

// «الخادم» كما في activities.ts: leaveOf وcancelSkip والمعاينة التي لا تكتب، والحفظ يعيد ما جرى للبريد
function server(state) {
  const ended = (s) => Date.parse(s.ends_at) < Date.parse(NOW);
  const skipOf = (s) => (!s.cohort_id ? 'general' : s.active === false ? 'inactive' : ended(s) ? 'ended' : !s.invited_at ? 'unannounced' : null);
  const who = (s) => ({ members: MEMBERS, trainer: s.expert_id ? TRAINER : null });
  const leaveOf = (s, row) => (s.active === false ? (row.active !== false ? 'restore' : null) : row.active === false ? 'cancel' : 'cohort_id' in row && s.cohort_id && (row.cohort_id || null) !== s.cohort_id ? 'move' : null);
  const preview = (s, kind) => {
    if (kind === 'restore') return s.invited_at && !ended(s) ? { kind, notify: who(s), skipped: null } : { kind, notify: null, skipped: 'unannounced' };
    const skipped = skipOf(s);
    return { kind, notify: skipped ? null : who(s), skipped, uncomplete: kind !== 'delete' && ended(s) && s.active !== false ? LOST : 0 };
  };
  const sent = (s) => ({ sent: MEMBERS, failed: 0, total: MEMBERS, ...(s.expert_id ? { trainer: 'sent' } : {}) });
  return (b) => {
    if (b.action === 'admin.workshop-save') {
      const s = state.sessions.find((x) => x.id === b.row.id);
      if (!s) { state.sessions.push({ ...b.row, id: `w${state.sessions.length + 1}` }); return { success: true, id: state.sessions.at(-1).id }; }
      const kind = leaveOf(s, b.row);
      if (b.preview) return { success: true, preview: true, counting: 'mandatory', changed: false, impact: null, leave: kind ? preview(s, kind) : null };
      const before = { ...s };
      Object.assign(s, b.row);
      if (kind === 'cancel' || kind === 'move') return { success: true, id: s.id, cancel: skipOf(before) ? { skipped: skipOf(before) } : b.notify_cancel === false ? { skipped: 'opted_out' } : sent(before) };
      if (kind === 'restore') {
        if (b.reinvite === true && before.invited_at) return { success: true, id: s.id, invite: { ...sent(s), restored: true } };
        s.invited_at = null;
      }
      return { success: true, id: s.id };
    }
    if (b.action === 'admin.workshop-delete') {
      const s = state.sessions.find((x) => x.id === b.id);
      if (b.preview) return { success: true, preview: true, leave: preview(s, 'delete') };
      state.sessions = state.sessions.filter((x) => x.id !== b.id);
      return { success: true, cancel: skipOf(s) ? { skipped: skipOf(s) } : b.notify_cancel === false ? { skipped: 'opted_out' } : sent(s) };
    }
    const rows = state.sessions.map((s) => ({ ...s, verify: 'qr', expected: MEMBERS, attended: ended(s) ? 9 : 0, trainer: s.expert_id ? TRAINER : null }));
    if (b.action === 'admin.cohort-workshops') return { success: true, capacity_ready: false, optional_ready: true, trainers: [{ id: 'e1', full_name: TRAINER }], sessions: rows };
    if (b.action === 'admin.activities') {
      return { success: true, capacity_ready: false, optional_ready: true, cohort_trainers: { [C1]: [{ id: 'e1', full_name: TRAINER }] }, requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })),
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
// النافذة داخل الشاشة كلها: لا زر تحت الطي على الهاتف
const inView = async (page, box) => { const b = await box.boundingBox(); const v = page.viewportSize(); return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1; };

for (const width of [1440, 390]) {
  test(`إلغاء يوم معلن: العدد والمدرب قبل التأكيد، والإبلاغ افتراضًا، ثم الإعادة تسأل عن الدعوة من جديد (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state);
    const days = page.locator('#cj-days-training');
    const d2 = days.locator('.cj-day', { hasText: 'اليوم 2' });
    await d2.getByRole('button', { name: 'ألغِ اليوم: اليوم 2' }).click();
    const box = page.getByRole('alertdialog');
    await expect(box).toContainText('يُلغى «اليوم 2»');
    // العدد من الخادم (المعاينة لا تكتب)، والمدرب باسمه
    await expect(box.getByTestId('confirm-lines')).toHaveText(`يصل بريد الإلغاء إلى ${MEMBERS} مشاركًا، وإلى المدرب ${TRAINER}، ومعه ملف يزيل الموعد من التقويم.`);
    expect(saves(calls).at(-1)).toMatchObject({ preview: true, row: { id: 'w2', active: false } });
    expect(state.sessions.find((s) => s.id === 'w2').active).toBe(true);
    const tell = box.getByRole('checkbox', { name: /أبلغ المدعوين بالإلغاء/ });
    await expect(tell).toBeChecked();
    expect(await inView(page, box)).toBe(true);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'cancel-confirm');
    await box.getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
    await expect(d2).toContainText('ملغى لهذه الدفعة');
    const done = saves(calls).at(-1);
    expect(done.preview).toBeUndefined();
    expect('notify_cancel' in done).toBe(false);
    expect(done.row).toMatchObject({ id: 'w2', active: false, title_ar: 'اليوم 2' });
    await expect(page.locator('.toast')).toHaveText(`أُلغي اليوم، وأُرسل بريد الإلغاء إلى ${MEMBERS} مشاركًا، وأُبلغ المدرب`);

    // الإعادة: يوم أُعلن ثم أُلغي يسأل قبلها، بالعدد، والدعوة من جديد معلَّمة
    await d2.getByRole('button', { name: 'أعده: اليوم 2' }).click();
    const back = page.getByRole('alertdialog');
    await expect(back).toContainText('يُعاد «اليوم 2» ويظهر للمشاركين في رحلتهم.');
    await expect(back.getByTestId('confirm-lines')).toHaveText(`أُعلن هذا اليوم ثم أُلغي. تُرسل دعوته من جديد إلى ${MEMBERS} مشاركًا، وإلى المدرب ${TRAINER}، ومعها ملف يعيد الموعد إلى التقويم.`);
    await expect(back.getByRole('checkbox', { name: /ادعُهم من جديد/ })).toBeChecked();
    expect(await inView(page, back)).toBe(true);
    await shot(page, 'restore-confirm');
    await back.getByRole('button', { name: 'أعده', exact: true }).click();
    await expect(d2).not.toContainText('ملغى لهذه الدفعة');
    expect(saves(calls).at(-1)).toMatchObject({ reinvite: true, row: { id: 'w2', active: true } });
    await expect(page.locator('.toast')).toHaveText(`أُعيد اليوم ويظهر للمشاركين، وأُرسلت الدعوة إلى ${MEMBERS} مشاركًا، وأُبلغ المدرب`);
  });

  test(`يوم انتهى وحُضر: لا بريد، وسطر تحذير بعدد من يُسحب اكتماله. ويوم لم يُعلن: لا بريد ولا مربع (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state);
    const days = page.locator('#cj-days-training');
    await days.locator('.cj-day', { hasText: 'اليوم 1' }).getByRole('button', { name: 'ألغِ اليوم: اليوم 1' }).click();
    const box = page.getByRole('alertdialog');
    const lines = box.getByTestId('confirm-lines').locator('li');
    await expect(lines).toHaveText(['لا يُرسل بريد: الجلسة انتهت.', `! ${LOST} مشاركين أتموا نشاط الحضور أو مرحلته بهذه الجلسة، وبإلغائه يعود غير مكتمل لهم.`]);
    await expect(lines.nth(1)).toHaveClass(/warn/);
    await expect(box.getByRole('checkbox')).toHaveCount(0);
    expect(await inView(page, box)).toBe(true);
    await shot(page, 'cancel-warning');
    // «إلغاء» يترك اليوم كما هو
    await box.getByRole('button', { name: 'إلغاء', exact: true }).click();
    expect(saves(calls).every((c) => c.preview)).toBe(true);
    await expect(days.locator('.cj-day', { hasText: 'اليوم 1' })).not.toContainText('ملغى لهذه الدفعة');

    const d3 = days.locator('.cj-day', { hasText: 'اليوم 3' });
    await d3.getByRole('button', { name: 'ألغِ اليوم: اليوم 3' }).click();
    await expect(page.getByRole('alertdialog').getByTestId('confirm-lines')).toHaveText('لا يُرسل بريد: لم تُرسل دعوة هذه الجلسة لأحد.');
    await expect(page.getByRole('alertdialog').getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('alertdialog').getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
    await expect(d3).toContainText('ملغى لهذه الدفعة');
    await expect(page.locator('.toast')).toHaveText('أُلغي اليوم');
    // وإعادته بنقرة بلا سؤال كما كانت: لم يُعلن قبل إلغائه
    await d3.getByRole('button', { name: 'أعده: اليوم 3' }).click();
    await expect(d3).not.toContainText('ملغى لهذه الدفعة');
    expect('reinvite' in saves(calls).at(-1)).toBe(false);
  });

  test(`«لا تبلّغ أحدًا» لجلسة أُنشئت بالخطأ، ومن «الحضور والجلسات»: مربع «مفعّلة» والحذف بالسؤال نفسه (${width})`, async ({ page }) => {
    const state = fresh();
    const calls = await admin(page, width, state, 'activities');
    const ws = page.locator(`#ws-${R}`);
    // الملغاة لا يُعرض زر دعوتها، والقائمة يُعرض
    await expect(ws.locator('tr', { hasText: 'اليوم 2' }).getByRole('button', { name: 'أُرسلت الدعوة' })).toBeVisible();
    await ws.locator('tr', { hasText: 'اليوم 2' }).getByRole('button', { name: 'تحرير' }).click();
    const form = page.getByRole('dialog', { name: 'تحرير موعد' });
    await form.getByLabel('مفعّلة').uncheck();
    await form.getByRole('button', { name: 'حفظ' }).click();
    const box = page.getByRole('alertdialog');
    await expect(box.getByTestId('confirm-lines')).toContainText(`يصل بريد الإلغاء إلى ${MEMBERS} مشاركًا، وإلى المدرب ${TRAINER}`);
    await box.getByRole('checkbox', { name: /أبلغ المدعوين بالإلغاء/ }).uncheck();
    expect(await inView(page, box)).toBe(true);
    await shot(page, 'cancel-no-notify');
    await box.getByRole('button', { name: 'ألغِ اليوم', exact: true }).click();
    await expect(form).toBeHidden();
    expect(saves(calls).at(-1)).toMatchObject({ notify_cancel: false, row: { id: 'w2', active: false } });
    expect(saves(calls).at(-1).preview).toBeUndefined();
    await expect(page.locator('.toast')).toHaveText('تم الحفظ، ولم يُبلَّغ أحد كما اخترت');
    await expect(ws.locator('tr', { hasText: 'اليوم 2' })).toContainText('موقوفة');
    await expect(ws.locator('tr', { hasText: 'اليوم 2' }).getByRole('button', { name: /الدعوة/ })).toHaveCount(0);

    // الحذف (لجلسة بلا حضور): العدد قبل التأكيد، والبريد بعده
    state.sessions.find((s) => s.id === 'w3').invited_at = '2026-11-10T08:00:00Z';
    await page.reload();
    await page.getByRole('button', { name: 'تطبيق القادة' }).click();
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
    await ws.locator('tr', { hasText: 'اليوم 3' }).getByRole('button', { name: 'تحرير' }).click();
    await page.getByRole('dialog', { name: 'تحرير موعد' }).getByRole('button', { name: 'حذف' }).click();
    const del = page.getByRole('alertdialog');
    await expect(del).toContainText('يُحذف «اليوم 3» نهائيًا ولا يُستعاد.');
    await expect(del.getByTestId('confirm-lines')).toHaveText(`يصل بريد الإلغاء إلى ${MEMBERS} مشاركًا، ومعه ملف يزيل الموعد من التقويم.`);
    await expect(del.getByRole('checkbox', { name: /أبلغ المدعوين بالإلغاء/ })).toBeChecked();
    await del.getByRole('button', { name: 'احذف', exact: true }).click();
    await expect(ws.locator('tr', { hasText: 'اليوم 3' })).toHaveCount(0);
    const gone = calls.filter((c) => c.action === 'admin.workshop-delete');
    expect(gone.map((c) => [c.id, !!c.preview, 'notify_cancel' in c])).toEqual([['w3', true, false], ['w3', false, false]]);
    await expect(page.locator('.toast')).toHaveText(`تم الحفظ، وأُرسل بريد الإلغاء إلى ${MEMBERS} مشاركًا`);
    expect(await noOverflow(page)).toBe(true);
  });
}
