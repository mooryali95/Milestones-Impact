// وسم الورشة: إلزامية أو اختيارية (قرار المالك 2026-11-21، القاعدة في optional.js). في لوحة الإدارة:
// الاختيار صريح بلا قيمة مسبقة ولا يُحفظ النموذج قبله، وشارة الوسم على صف كل يوم، والورشة الاختيارية خارج عدّاد المرحلة.
// وتغيير الوسم لاحقًا يعرض أثره بالأرقام من الخادم ثم يحفظ بالتأكيد. والمسار الموجّه: ورشة في مرحلة بلا نشاط حضور، بمعاينة
// أثرها، فيصير للمرحلة نشاط «ورش إضافية». وقبل ترحيل العمود «اختيارية» معطلة بجملتها. بعرضي 1440 و390.
// الخلفية مُحاكاة بحالة واحدة كما في activities.ts، واليوم 16 نوفمبر 2026. SHOTS_DIR: مجلد اللقطات.
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR || '';
test.use({ deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'UTC' });
const NOW = '2026-11-16T09:00:00Z';

const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 2, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 3, duration_days: 14, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 4, duration_days: 7, active: true },
];
const R = 'aaaaaaaa-0000-4000-8000-000000000001';
const EXTRA = 'aaaaaaaa-0000-4000-8000-000000000009';
const baseReqs = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'A-OK', stage_key: 'approval', kind: 'auto', required: true, title_ar: 'اعتماد مسارك', sort: 1, active: true },
  { id: R, code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', sort: 1, active: true, config: { sessions_required: 4, verify: 'qr' } },
  { id: 'r4', code: 'F-UP', stage_key: 'final', kind: 'upload', required: true, title_ar: 'ارفع تقريرك', sort: 1, active: true },
];
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 4, versions: [] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2026-11-30', delivery: {}, members: 22, schedule: {} }];
const firstDay = { id: 'w1', requirement_id: R, cohort_id: 'c1', title_ar: 'اليوم 1', mode: 'in_person', location_ar: 'الرياض، قاعة الأثر', join_url: null,
  starts_at: '2026-11-09T06:00:00Z', ends_at: '2026-11-09T12:00:00Z', active: true, invited_at: '2026-11-05T08:00:00Z', expert_id: null, optional: false };
const IMPACT = {
  flip: { members: 22, preserved: 3, required_of: 0, completes: 0, progress_up: 0, progress_down: 2 },
  guided: { members: 22, preserved: 3, required_of: 19, completes: 0, progress_up: 0, progress_down: 4 },
};

// «الخادم»: admin.workshop-save كما في activities.ts: المعاينة لا تكتب، وتغيير الوسم بلا تأكيد مرفوض، والمسار الموجّه ينشئ
// نشاط «ورش إضافية» في تعريف الدفعة، وقبل الترحيل «اختيارية» مرفوضة برسالتها
function server(state) {
  return (b) => {
    if (b.action === 'admin.workshop-save') {
      const { counting, stage_key, ...row } = b.row;
      const prev = row.id ? state.sessions.find((s) => s.id === row.id) : null;
      if (counting === 'optional' && !state.ready) return { success: false, code: 'optional_not_ready', message: 'الورشة الاختيارية غير مفعّلة بعد: تحتاج تحديث قاعدة البيانات. احفظها إلزامية، أو أعد المحاولة بعد التحديث' };
      const guided = !row.id && !row.requirement_id && !!stage_key;
      const flipped = !!prev && !!counting && (counting === 'optional') !== !!prev.optional;
      const each = state.requirements.find((r) => r.id === row.requirement_id)?.config?.each;
      const impact = flipped ? IMPACT.flip : (guided || each) && counting === 'mandatory' ? IMPACT.guided : null;
      if (b.preview) return { success: true, preview: true, counting, changed: flipped, impact, ...(guided ? { guided: true } : {}) };
      if (flipped && b.counting_confirm !== true) return { success: false, code: 'counting_confirm', message: 'تغيير وسم الورشة يحتاج تأكيدًا بعد معاينة أثره', impact };
      let created = null;
      if (guided) {
        state.requirements.push({ id: EXTRA, code: 'W-EXTRA-1', stage_key, kind: 'workshop', required: true, title_ar: 'ورش إضافية', sort: 9, active: true, config: { sessions_required: 1, verify: 'qr', each: true } });
        row.requirement_id = EXTRA;
        created = { id: 'v2', number: 2, label: 'ورش إضافية في «التقرير النهائي»' };
      }
      const optional = counting ? counting === 'optional' : prev ? !!prev.optional : false;
      let saved;
      if (row.id) { saved = prev; Object.assign(saved, row, { optional }); } else { saved = { invited_at: null, ...row, optional, id: `w${state.sessions.length + 1}` }; state.sessions.push(saved); }
      const out = { success: true, id: saved.id, ...(impact ? { impact } : {}), ...(created ? { version_created: created } : {}) };
      if (b.invite === true && !saved.invited_at) { saved.invited_at = NOW; out.invite = { sent: 22, failed: 0, total: 22 }; }
      return out;
    }
    const rows = state.sessions.map((s) => ({ ...s, verify: 'qr', expected: 22, attended: s.starts_at && Date.parse(s.ends_at) < Date.parse(NOW) ? 19 : 0, trainer: null }));
    if (b.action === 'admin.cohort-workshops') return { success: true, capacity_ready: true, trainers: [], optional_ready: state.ready, sessions: rows.filter((s) => (b.requirement_ids || []).includes(s.requirement_id)) };
    if (b.action === 'admin.activities') {
      return { success: true, capacity_ready: true, optional_ready: state.ready, cohort_trainers: { c1: [] },
        requirements: state.requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })), workshops: rows, coaching: [], coaching_groups: [], programs, cohorts };
    }
    if (b.action === 'admin.cohort-definition') {
      return { success: true, program_id: 'pa', version: null, stages, hidden: [], sessions: state.sessions.map(({ expert_id, ...s }) => s),
        requirements: state.requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
        cohort_plan: { schedule: {}, starts_on: '2026-11-02', ends_on: '2026-11-30', is_default: false, status: 'running', program_version_id: null, updated_at: 'u0' } };
    }
    return null;
  };
}
const world = (o = {}) => ({ ready: true, requirements: baseReqs.map((r) => ({ ...r })), sessions: [{ ...firstDay }], ...o });

async function admin(page, width, state) {
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
      'admin.milestones': { success: true, program_id: 'pa', milestones: [] },
      'admin.cohort-journey': { success: true, journey_map: { stages: [], totals: { total: 0 } } },
    };
    await route.fulfill({ json: own(b) ?? replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
  await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'دفعة نوفمبر', exact: true }).click();
  await page.getByRole('tab', { name: 'الرحلة' }).click();
  await expect(page.getByRole('tab', { name: 'الرحلة' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('cj-axis')).toBeVisible();
  return calls;
}
const shot = async (page, name, target = null, block = 'center') => {
  if (!SHOTS) return;
  if (target) await target.evaluate((el, b) => el.scrollIntoView({ block: b }), block);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const saves = (calls) => calls.filter((c) => c.action === 'admin.workshop-save');
const inside = (el) => el.evaluate((x) => { const r = x.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; });

for (const width of [1440, 390]) {
  test(`الوسم اختيار صريح بلا قيمة مسبقة: لا يُحفظ قبله، والاختيارية بشارتها خارج عدّاد المرحلة (${width})`, async ({ page }) => {
    const state = world();
    const calls = await admin(page, width, state);
    const days = page.locator('#cj-days-training');
    await expect(days.locator('.cj-days-count')).toHaveText('1 من 4 محددة');
    await expect(days.locator('.cj-day', { hasText: 'اليوم 1' }).getByTestId('day-counting')).toHaveText('إلزامية');

    await days.getByRole('button', { name: 'يوم أو ورشة في التدريب' }).click();
    const form = page.getByRole('dialog', { name: 'يوم أو ورشة في «التدريب»' });
    const choice = form.getByTestId('choice-counting');
    await expect(choice.getByText('هل تُحسب هذه الورشة؟')).toBeVisible();
    await expect(choice.getByRole('radio')).toHaveCount(2);
    await expect(choice.getByRole('radio', { checked: true })).toHaveCount(0);
    // سطر واحد يشرح كل اختيار
    await expect(choice).toContainText('تُحسب في كل شيء: التقدم واكتمال المرحلة ونسب الحضور والتقارير والتنبيهات.');
    await expect(choice).toContainText('لا تُحسب في شيء: يُسجَّل حضورها ويُعرض، ولا يدخل في تقدم ولا اكتمال ولا نسبة ولا تنبيه.');
    expect(await inside(choice)).toBe(true);
    await shot(page, 'choice-control', choice);

    // بلا اختيار: الحفظ يقف برسالته ولا يصل الخادم
    await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('لقاء مع خبير زائر');
    await form.getByLabel('تبدأ').fill('2026-11-17T06:00');
    await form.getByLabel('تنتهي').fill('2026-11-17T09:00');
    await form.getByLabel('أرسل الدعوة عند الحفظ').uncheck();
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect(form.getByRole('alert')).toHaveText('اختر أولًا: هل هذه الورشة إلزامية أم اختيارية؟');
    expect(saves(calls)).toEqual([]);

    // إلزامية: سطر ما تعنيه في هذا النشاط (القرار 6). اختيارية: سطرها
    await choice.getByRole('radio', { name: /^إلزامية/ }).check();
    await expect(form.getByTestId('form-notes')).toContainText('المطلوب حضور 4 أيام. هذه الورشة تُحسب لمن ينقصه يوم، ولا تزيد المطلوب.');
    await choice.getByRole('radio', { name: /^اختيارية/ }).check();
    await expect(form.getByTestId('form-notes')).toContainText('ورشة اختيارية: تظهر للمشاركين بوسمها ويُسجَّل حضورها، ولا تدخل في تقدم ولا اكتمال ولا نسبة حضور.');
    await expect(form.getByTestId('form-notes')).not.toContainText('تُحسب لمن ينقصه يوم');
    await shot(page, 'choice-optional-selected', choice);
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expect(form).toBeHidden();
    // بلا معاينة: ورشة اختيارية لا تغيّر عدًّا
    expect(saves(calls).map((c) => [c.row.counting, c.preview, c.row.requirement_id])).toEqual([['optional', undefined, R]]);

    // الشارة على الصف، والعدّاد بلا الاختيارية
    const row = days.locator('.cj-day', { hasText: 'لقاء مع خبير زائر' });
    await expect(row.getByTestId('day-counting')).toHaveText('اختيارية');
    await expect(days.locator('.cj-days-count')).toHaveText('1 من 4 محددة، وورشة اختيارية خارج العد');
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'admin-chip', days, 'start');
  });

  test(`تغيير الوسم لاحقًا: معاينة الأثر بالأرقام قبل الحفظ، والإلغاء لا يحفظ، والتأكيد يحفظ بوسمه (${width})`, async ({ page }) => {
    const state = world();
    const calls = await admin(page, width, state);
    const day = page.locator('#cj-days-training .cj-day', { hasText: 'اليوم 1' });
    await day.getByRole('button', { name: 'حرّر: اليوم 1' }).click();
    const edit = page.getByRole('dialog', { name: 'تحرير «اليوم 1»' });
    // الوسم القائم معلَّم، وحفظ بلا تغييره لا يسأل
    await expect(edit.getByRole('radio', { name: /^إلزامية/ })).toBeChecked();
    await edit.getByRole('radio', { name: /^اختيارية/ }).check();
    await edit.getByRole('button', { name: 'حفظ' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask).toContainText('يتغير وسم «اليوم 1» إلى «اختيارية». هذا أثره على أعضاء الدفعة:');
    await expect(ask.getByTestId('confirm-lines').locator('li')).toHaveText([
      'تنخفض نسبة تقدم مشاركَين.',
      'من أتم ما يخصه قبل هذا التغيير (3 مشاركين) يبقى اكتماله محفوظًا: لا يُسحب منه شيء، ولا شهادة تُمس.',
    ]);
    expect(await inside(ask)).toBe(true);
    await shot(page, 'change-impact-preview');
    // المعاينة وحدها وصلت الخادم، ولم يُحفظ شيء
    expect(saves(calls).map((c) => [c.preview, c.row.counting, c.counting_confirm])).toEqual([[true, 'optional', undefined]]);
    expect(state.sessions[0].optional).toBe(false);
    await ask.getByRole('button', { name: 'إلغاء' }).click();
    await expect(edit).toBeVisible();
    expect(saves(calls)).toHaveLength(1);

    await edit.getByRole('button', { name: 'حفظ' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'غيّر الوسم' }).click();
    await expect(edit).toBeHidden();
    const last = saves(calls).at(-1);
    expect([last.preview, last.counting_confirm, last.row.counting, last.row.id, 'counting_confirm' in last.row]).toEqual([undefined, true, 'optional', 'w1', false]);
    await expect(day.getByTestId('day-counting')).toHaveText('اختيارية');
    await expect(page.locator('#cj-days-training .cj-days-count')).toHaveText('0 من 4 محددة، وورشة اختيارية خارج العد');
    await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'حُفظ اليوم بوسمه الجديد' }).first()).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  test(`المسار الموجّه: ورشة إلزامية في مرحلة بلا نشاط حضور، بمعاينة أثرها، فيصير للمرحلة نشاط «ورش إضافية» (${width})`, async ({ page }) => {
    const state = world();
    const calls = await admin(page, width, state);
    const none = page.getByTestId('cj-noattend-final');
    await expect(none).toContainText('هذه المرحلة ليس في برنامجها نشاط حضور.');
    await none.getByRole('button', { name: 'ورشة في التقرير النهائي' }).click();
    const form = page.getByRole('dialog', { name: 'ورشة في «التقرير النهائي»' });
    await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(form.getByTestId('form-notes')).toContainText('بالحفظ يُضاف إلى برنامج الدفعة نشاط «ورش إضافية» في هذه المرحلة');
    await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('ورشة عرض التقارير');
    await form.getByLabel('تبدأ').fill('2026-11-22T06:00');
    await form.getByLabel('تنتهي').fill('2026-11-22T09:00');
    await form.getByLabel('أرسل الدعوة عند الحفظ').uncheck();
    await form.getByRole('radio', { name: /^إلزامية/ }).check();
    await expect(form.getByTestId('form-notes')).toContainText('كل ورشة إلزامية في هذه المرحلة مطلوبة بعينها لإكمالها. من أتم المرحلة قبل إضافتها يبقى مكتملًا.');
    await shot(page, 'guided-form', form.getByTestId('form-notes'), 'end');
    await form.getByRole('button', { name: 'حفظ' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask).toContainText('تُضاف «ورشة عرض التقارير» إلى «التقرير النهائي»');
    await expect(ask.getByTestId('confirm-lines').locator('li')).toHaveText([
      'تصير مطلوبة من 19 مشاركًا لإكمال المرحلة.',
      'تنخفض نسبة تقدم 4 مشاركين.',
      'من أتم ما يخصه قبل هذا التغيير (3 مشاركين) يبقى اكتماله محفوظًا: لا يُسحب منه شيء، ولا شهادة تُمس.',
    ]);
    await shot(page, 'guided-impact-preview');
    // المعاينة لم تنشئ نشاطًا ولا جلسة
    expect([state.requirements.length, state.sessions.length]).toEqual([4, 1]);
    const pv = saves(calls).at(-1);
    expect([pv.preview, pv.row.stage_key, pv.row.cohort_id, 'requirement_id' in pv.row, pv.row.counting]).toEqual([true, 'final', 'c1', false, 'mandatory']);
    await ask.getByRole('button', { name: 'أضف الورشة' }).click();
    await expect(form).toBeHidden();
    const sv = saves(calls).at(-1);
    expect([sv.preview, sv.row.stage_key, sv.row.counting, sv.counting_confirm]).toEqual([undefined, 'final', 'mandatory', true]);

    // المرحلة صار فيها نشاطها: قسم الورش بعدّاده وصف الورشة بشارتها، ولا جملة «ليس في برنامجها»
    const days = page.locator('#cj-days-final');
    await expect(days.getByRole('heading', { name: 'ورش التقرير النهائي' })).toBeVisible();
    await expect(days.locator('.cj-days-count')).toHaveText('ورشة إلزامية');
    await expect(days.locator('.cj-day', { hasText: 'ورشة عرض التقارير' }).getByTestId('day-counting')).toHaveText('إلزامية');
    await expect(page.getByTestId('cj-noattend-final')).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'guided-after-save', days, 'start');

    // ورشة ثانية من زر المرحلة نفسه: إلزامية تمر بالمعاينة (ترفع المطلوب)، واختيارية بلا معاينة
    await days.getByRole('button', { name: 'يوم أو ورشة في التقرير النهائي' }).click();
    const more = page.getByRole('dialog', { name: 'يوم أو ورشة في «التقرير النهائي»' });
    await more.getByRole('radio', { name: /^اختيارية/ }).check();
    const before = saves(calls).length;
    await more.getByRole('button', { name: 'حفظ' }).click();
    await expect(more).toBeHidden();
    expect(saves(calls).slice(before).map((c) => [c.preview, c.row.counting, c.row.requirement_id])).toEqual([[undefined, 'optional', EXTRA]]);
    await expect(days.locator('.cj-days-count')).toHaveText('ورشة إلزامية، وورشة اختيارية خارج العد');
  });
}

test('المسار الموجّه بورشة اختيارية: بلا معاينة ولا سؤال أثر، وتُحفظ بوسمها', async ({ page }) => {
  const state = world();
  const calls = await admin(page, 1440, state);
  await page.getByTestId('cj-noattend-final').getByRole('button', { name: 'ما الذي يمكن فعله؟' }).click();
  const dlg = page.getByTestId('cj-noattend-dialog');
  await expect(dlg).toContainText('أضفها في هذه المرحلة');
  await dlg.getByTestId('cj-na-here').click();
  const form = page.getByRole('dialog', { name: 'ورشة في «التقرير النهائي»' });
  await form.getByRole('radio', { name: /^اختيارية/ }).check();
  await form.getByRole('button', { name: 'حفظ' }).click();
  // سؤال الإضافة وحده (الورشة تظهر للمشاركين)، بلا سطور أثر
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('تُضاف «ورشة» إلى «التقرير النهائي»');
  await expect(ask.getByTestId('confirm-lines')).toHaveCount(0);
  await ask.getByRole('button', { name: 'أضف الورشة' }).click();
  await expect(form).toBeHidden();
  expect(saves(calls).map((c) => [c.preview, c.row.counting, c.row.stage_key])).toEqual([[undefined, 'optional', 'final']]);
  await expect(page.locator('#cj-days-final .cj-days-count')).toHaveText('لا ورشة إلزامية، وورشة اختيارية خارج العد');
});

test('قبل ترحيل العمود: «اختيارية» معطلة بجملة «غير مفعّلة بعد»، و«إلزامية» تُحفظ', async ({ page }) => {
  const state = world({ ready: false });
  const calls = await admin(page, 1440, state);
  await page.locator('#cj-days-training').getByRole('button', { name: 'يوم أو ورشة في التدريب' }).click();
  const form = page.getByRole('dialog', { name: 'يوم أو ورشة في «التدريب»' });
  const optional = form.getByRole('radio', { name: /^اختيارية/ });
  await expect(optional).toBeDisabled();
  await expect(form.getByTestId('choice-counting')).toContainText('غير مفعّلة بعد');
  await shot(page, 'choice-not-ready', form.getByTestId('choice-counting'));
  await form.getByRole('radio', { name: /^إلزامية/ }).check();
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form).toBeHidden();
  expect(saves(calls).map((c) => c.row.counting)).toEqual(['mandatory']);
});

test('«الحضور والجلسات»: شارة الوسم على كل موعد، و«+ موعد» بالاختيار الصريح نفسه، وتحرير الوسم بمعاينته', async ({ page }) => {
  const state = world({ sessions: [{ ...firstDay }, { ...firstDay, id: 'w2', title_ar: 'لقاء مفتوح', starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T09:00:00Z', optional: true, invited_at: null }] });
  const calls = await admin(page, 1440, state);
  await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'الحضور والجلسات' }).click();
  const card = page.locator(`#ws-${R}`);
  await expect(card.locator('tr', { hasText: 'اليوم 1' }).getByTestId('ws-counting')).toHaveText('إلزامية');
  await expect(card.locator('tr', { hasText: 'لقاء مفتوح' }).getByTestId('ws-counting')).toHaveText('اختيارية');
  await shot(page, 'activities-chip', card, 'start');
  await card.getByRole('button', { name: '+ موعد' }).click();
  const form = page.getByRole('dialog', { name: 'موعد جديد' });
  await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
  await form.getByLabel('عنوان الجلسة (مثل: اليوم الأول، Milestone)').fill('اليوم 2');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect(form.getByRole('alert')).toHaveText('اختر أولًا: هل هذه الورشة إلزامية أم اختيارية؟');
  expect(saves(calls)).toEqual([]);
  await form.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  // تحرير: الاختيارية إلى إلزامية بمعاينة ثم تأكيد
  await card.locator('tr', { hasText: 'لقاء مفتوح' }).getByRole('button', { name: 'تحرير' }).click();
  const edit = page.getByRole('dialog', { name: 'تحرير موعد' });
  await expect(edit.getByRole('radio', { name: /^اختيارية/ })).toBeChecked();
  await edit.getByRole('radio', { name: /^إلزامية/ }).check();
  await edit.getByRole('button', { name: 'حفظ' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('يتغير وسم «لقاء مفتوح» إلى «إلزامية»');
  await ask.getByRole('button', { name: 'غيّر الوسم' }).click();
  await expect(edit).toBeHidden();
  expect(saves(calls).map((c) => [c.preview, c.counting_confirm, c.row.counting])).toEqual([[true, undefined, 'mandatory'], [undefined, true, 'mandatory']]);
  await expect(card.locator('tr', { hasText: 'لقاء مفتوح' }).getByTestId('ws-counting')).toHaveText('إلزامية');
});
