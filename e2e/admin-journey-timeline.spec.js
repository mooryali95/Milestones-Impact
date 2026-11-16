// الرحلة في لمحة (J1b): خط زمني للقراءة فقط أعلى «الرحلة والمتطلبات» (البرنامج بالأسابيع) وأعلى قسم «التنفيذ»
// في محرر الدفعة (التواريخ وخط اليوم وعداد «يُحدد لاحقًا»). الخلفية مُحاكاة، واليوم مثبت على 16 نوفمبر 2026.
// TIMELINE_SHOTS: مجلد تُحفظ فيه اللقطات بعرضي 1440 و390.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const SHOTS = process.env.TIMELINE_SHOTS || '';
const stages = [
  { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', sort: 1, duration_days: 0, duration_label: 'دقائق', active: true },
  { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', sort: 2, duration_days: 0, duration_label: '12 دقيقة', active: true },
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', sort: 3, duration_days: 3, active: true },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 4, duration_days: 14, active: true },
  { key: 'ojt', title_ar: 'التوجيه على رأس العمل', phase: 'qualification', sort: 5, duration_days: 28, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'consult', title_ar: 'الاستشارة', phase: 'qualification', sort: 6, duration_days: 14, active: true, rules: { unlock: 'with', with: 'training' } },
  { key: 'support', title_ar: 'الدعم والتمكين', phase: 'impact', sort: 7, duration_days: 90, active: true },
  { key: 'final', title_ar: 'التقرير النهائي', phase: 'impact', sort: 8, duration_days: 7, active: true },
];
const requirements = [
  { id: 'r1', code: 'P-PROF', stage_key: 'profile', kind: 'form', required: true, title_ar: 'أكمل ملفك', sort: 1, active: true },
  { id: 'r2', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'يوم ورشة عن بعد', sort: 1, active: true, config: { sessions_required: 1, verify: 'join' } },
  { id: 'r3', code: 'T-READ', stage_key: 'training', kind: 'reading', required: true, title_ar: 'قراءة الباب الأول من كل إطار', sort: 2, active: true },
  { id: 'r4', code: 'O-SESS', stage_key: 'ojt', kind: 'coaching', required: true, title_ar: 'جلسات التوجيه', sort: 1, active: true, config: { mode: 'online' } },
  { id: 'r5', code: 'C-UP', stage_key: 'consult', kind: 'upload', required: false, title_ar: 'ارفع خطتك', sort: 1, active: true },
  { id: 'r6', code: 'S-MEET', stage_key: 'support', kind: 'workshop', required: true, title_ar: 'لقاء منتصف الدعم', sort: 1, active: true },
];
const catalog = {
  success: true, program_id: 'pa', journey_stages: stages, stage_requirements: requirements,
  instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], placement_model: [{ id: 1 }], tracks: [], track_stats: {},
};
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 6, versions: [] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', status: 'running', starts_on: '2026-11-02', ends_on: '2027-03-31', delivery: {}, members: 12, schedule: {} }];
const sessions = [
  { id: 's1', requirement_id: 'r2', cohort_id: 'c1', title_ar: 'يوم الورشة', starts_at: null, ends_at: null, mode: 'online', active: true },
  { id: 's2', requirement_id: 'r6', cohort_id: 'c1', title_ar: 'لقاء', starts_at: '2027-01-17T06:00:00Z', ends_at: '2027-01-17T08:00:00Z', mode: 'in_person', active: true },
];
const definition = {
  success: true, program_id: 'pa', version: null, stages, hidden: [], sessions,
  requirements: requirements.map((r) => ({ ...r, stage_title_ar: stages.find((s) => s.key === r.stage_key).title_ar, stage_rules: {}, stage_active: true, hidden: false })),
};

async function setup(page, width) {
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00Z'));
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': catalog,
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.cohort-definition': definition,
      'admin.milestones': { success: true, milestones: [] },
      'admin.program-milestones': { success: true, milestones: [] },
      'admin.activities': { success: true, requirements: requirements.filter((r) => r.kind === 'workshop').map((r) => ({ ...r, program_id: 'pa' })),
        workshops: sessions.map((s) => ({ ...s, attended: 0 })), coaching: [], programs, cohorts },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
}
const tab = (page, name) => page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name }).click();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name, target) => {
  if (!SHOTS) return;
  await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
};

test('البرنامج على الحاسوب: المحاور والمراحل المتوازية في خانة واحدة، والتفاصيل بالتركيز، والموعد يُحدد في الدفعة', async ({ page }) => {
  await setup(page, 1440);
  await tab(page, 'الرحلة والمتطلبات');
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  await expect(tl).toBeVisible();
  // البطاقات: المدة، والتأهيل بأطول مراحله، والمراحل والأنشطة
  await expect(tl.locator('.jt-cards')).toContainText('المراحل8 في 3 محاور');
  await expect(tl.locator('.jt-cards')).toContainText('4 أسابيع بدل 8 أسابيع لو كانت متتابعة');
  await expect(tl.locator('.jt-cards')).toContainText('6، منها 1 اختيارية');
  // «تسير معًا»: خانة واحدة بثلاثة مسارات
  const together = tl.locator('.jt-slot.together');
  await expect(together).toHaveCount(1);
  await expect(together.locator('.jt-stage')).toHaveCount(3);
  await expect(together).toContainText('التدريب ومرحلتان تبدآن معها في الأسابيع نفسها');
  await expect(tl.locator('.jt-phase.ph-qualification')).toContainText('4 أسابيع، مراحل تسير معًا');
  // لا مواعيد ولا خط يوم في البرنامج
  await expect(tl.locator('.jt-dates')).toHaveCount(0);
  await expect(tl.locator('.jt-today')).toHaveCount(0);
  // كل نشاط زر بوصف كامل، والتركيز يملأ اللوحة
  const act = tl.getByRole('button', { name: /^يوم ورشة عن بعد، مرحلة التدريب، تدريب، إلزامي/ });
  await expect(act).toHaveAttribute('aria-label', 'يوم ورشة عن بعد، مرحلة التدريب، تدريب، إلزامي، الموعد والرابط يُحددان في الدفعة، يكمله الأدمن بتسجيل الحضور');
  await act.focus();
  const panel = tl.locator('.jt-panel');
  await expect(panel.getByRole('heading', { name: 'يوم ورشة عن بعد' })).toBeVisible();
  await expect(panel).toContainText('الموعد والرابط يُحددان في الدفعة');
  await expect(panel.locator('.jt-when.tbd')).toHaveCount(0);
  // المسار يتمرر وحده، والصفحة لا
  await expect(tl.getByRole('group', { name: 'الخط الزمني، يتحرك بالأسهم' })).toHaveAttribute('tabindex', '0');
  expect(await noOverflow(page)).toBe(true);
  // «افتحه في القائمة» ينقل إلى النشاط في الباني
  await panel.getByRole('button', { name: 'افتحه في القائمة' }).click();
  await expect(page.locator('#jreq-r2 button.la-link')).toBeFocused();
  // الجدول البديل
  await tl.getByText('عرض الرحلة جدولًا').click();
  await expect(tl.locator('.jt-table tbody tr')).toHaveCount(6);
  await shot(page, 'program', tl);
});

test('البرنامج على الهاتف 390: خط رأسي بلا تمرير أفقي، وأول مرحلة تأهيل مفتوحة ببطاقاتها', async ({ page }) => {
  await setup(page, 390);
  await tab(page, 'الرحلة والمتطلبات');
  const tl = page.getByRole('region', { name: 'رحلة البرنامج' });
  await expect(tl.locator('.jt-desk')).toBeHidden();
  const phone = tl.getByRole('list', { name: 'مراحل الرحلة' });
  await expect(phone).toBeVisible();
  const training = phone.locator('.jt-m-stage', { hasText: 'التدريب' }).first();
  await expect(training.locator('details')).toHaveAttribute('open', '');
  await expect(training.locator('.jt-m-cards li')).toHaveCount(2);
  await expect(training).toContainText('الموعد والرابط يُحددان في الدفعة');
  // مرحلة أخرى مطوية تُفتح بنقرة
  const support = phone.locator('.jt-m-stage', { hasText: 'الدعم والتمكين' });
  await expect(support.locator('.jt-m-cards')).toBeHidden();
  await support.locator('summary').click();
  await expect(support.locator('.jt-m-cards li')).toHaveCount(1);
  expect(await noOverflow(page)).toBe(true);
  await shot(page, 'program', tl);
});

for (const width of [1440, 390]) {
  test(`الدفعة (${width}): التواريخ وخط اليوم وعداد «يُحدد لاحقًا»، والنقر يقفز إلى «+ موعد»`, async ({ page }) => {
    await setup(page, width);
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
    await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'تحرير', exact: true }).click();
    const ed = page.getByRole('dialog', { name: 'دفعة: دفعة نوفمبر' });
    // قسم التنفيذ مطوي بشارة العداد، ويفتح على الخط الزمني أعلاه
    const toggle = ed.getByRole('button', { name: 'التنفيذ' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(ed.locator('section[aria-labelledby="ce-delivery-h"]')).toContainText('موعد واحد يُحدد لاحقًا');
    await toggle.click();
    const tl = ed.getByRole('region', { name: 'دفعة نوفمبر' });
    await expect(tl.locator('.jt-cards')).toContainText('الأسبوع 3، 3 مراحل تسير معًا');
    await expect(tl.locator('.jt-cards .tone-warn')).toContainText('موعد واحد يُحدد لاحقًا');
    await expect(tl).not.toContainText('1970');
    if (width > 500) {
      await expect(tl.locator('.jt-today')).toContainText('اليوم 16 نوفمبر');
      await expect(tl.locator('.jt-dates .jt-dot')).toHaveCount(1);
      await expect(tl.locator('.jt-dates .jt-tbd')).toHaveCount(1);
      await expect(tl.locator('.jt-stage.st-active')).toHaveCount(3);
      await expect(tl.locator('.jt-stage.st-done')).toHaveCount(3);
      // اللوحة تبدأ بأول نشاط ينقصه موعد
      const panel = tl.locator('.jt-panel');
      await expect(panel.getByRole('heading', { name: 'يوم ورشة عن بعد' })).toBeVisible();
      await expect(panel.locator('.jt-when.tbd')).toContainText('يُحدد لاحقًا');
      await shot(page, 'cohort', tl);
      await panel.getByRole('button', { name: 'أضف موعده' }).click();
    } else {
      await expect(tl.locator('.jt-desk')).toBeHidden();
      const training = tl.locator('.jt-m-stage', { hasText: 'التدريب' }).first();
      await expect(training.locator('details')).toHaveAttribute('open', '');
      await expect(training).toContainText('اليوم 16 نوفمبر، بقي على نهاية المرحلة ثلاثة أيام');
      await expect(training.locator('.jt-chip.tbd')).toContainText('يُحدد لاحقًا');
      expect(await noOverflow(page)).toBe(true);
      await shot(page, 'cohort', tl);
      await training.getByRole('button', { name: 'أضف موعده: يوم ورشة عن بعد' }).click();
    }
    // يُغلق المحرر وينتقل إلى «الحضور والجلسات» عند زر «+ موعد» للنشاط نفسه
    await expect(ed).toBeHidden();
    await expect(page).toHaveURL(/activities\?req=r2/);
    await expect(page.locator('#ws-r2 .ws-add')).toBeFocused();
  });
}

test('دفعة بلا تاريخ بداية: أسابيع نسبية وتنبيه، لا تاريخ مخترع', async ({ page }) => {
  cohorts[0] = { ...cohorts[0], starts_on: null };
  try {
    await setup(page, 1440);
    await page.getByRole('navigation', { name: 'أقسام تطبيق القادة' }).getByRole('button', { name: 'البرامج والدفعات' }).click();
    await page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' }).getByRole('button', { name: 'تحرير', exact: true }).click();
    const ed = page.getByRole('dialog', { name: 'دفعة: دفعة نوفمبر' });
    await ed.getByRole('button', { name: 'التنفيذ' }).click();
    const tl = ed.getByRole('region', { name: 'دفعة نوفمبر' });
    await expect(tl.getByRole('note')).toHaveText('حدد تاريخ البداية لترى التواريخ');
    await expect(tl.locator('.jt-today')).toHaveCount(0);
    await expect(tl.locator('.jt-ruler')).toContainText('البداية');
    // تاريخ البداية من النموذج نفسه يرسم التواريخ فورًا
    await ed.locator('#f-starts_on').fill('2026-11-02');
    await expect(tl.getByRole('note')).toHaveCount(0);
    await expect(tl.locator('.jt-today')).toContainText('اليوم 16 نوفمبر');
  } finally {
    cohorts[0] = { ...cohorts[0], starts_on: '2026-11-02' };
  }
});
