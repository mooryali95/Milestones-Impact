// النوافذ الحوارية في لوحة الإدارة: التركيز يدخلها ويبقى فيها ويعود إلى ما فتحها، وEsc يغلق العليا وحدها،
// والإغلاق بتعديلات لم تُحفظ يسأل أولًا، والحفظ لا يتكرر بنقرتين. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const programs = [{ id: 'pa', name: 'برنامج القادة', is_default: true, requirements: 3, versions: [{ id: 'v1', program_id: 'pa', number: 1, label: 'الإطلاق', created_at: '2026-09-01' }] }];
const cohorts = [{ id: 'c1', name: 'دفعة نوفمبر', program_id: 'pa', program_version_id: 'v1', status: 'running', delivery: {}, enrolled: 2, stage_modes: {} }];
const model = { id: 'm1', dimension: 'impact', sort: 1, title_ar: 'سجل المنافع', icon: '◆', points: 30, active: true, min_level: 'beginner', fields: [{ key: 'project', label: 'اسم المشروع', type: 'text', required: true }] };
const submission = { id: 's1', status: 'reviewed', rating: 4, bonus: 5, submitted_at: '2026-10-20', answers: { project: 'منصة التعلم' }, participants: { full_name: 'سارة الأحمد', job_title: 'مديرة' }, learning_models: model };
const catalog = {
  success: true, journey_stages: [], stage_requirements: [], instruments: [], locked_instruments: [], questions: [], grid_cells: [], level_rules: [], tracks: [], track_stats: {},
  handbook_modules: [], learning_models: [model], book_stats: { chapters: {}, models: {}, points: {}, to_review: 0 },
};
const cert = { id: 'k1', serial: 'MI-LDR-2026-ABCDEF', status: 'valid', name_ar: 'سارة الأحمد', org_name: 'هيئة التطوير', issued_at: '2026-10-01', participant_id: 'p1' };

async function setup(page, { delay = {} } = {}) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'security-status': { success: true, passkeys: [], passkey_only: false, method: 'email' },
      'sessions-list': { success: true, sessions: [{ current: true, method: 'email', ip: '1.1.1.1', ua: 'test' }] },
      'list-users': { success: true, users: [] },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.programs': { success: true, programs, cohorts, organizations: [] },
      'admin.program': { success: true, program: programs[0], stages: [], requirements: [] },
      'admin.experts': { success: true, experts: [] },
      'admin.program-compare': { success: true, version: { number: 1, label: 'الإطلاق' }, diff: { added: [{ code: 'T-VID', title: 'فيديو التمهيد' }], removed: [], changed: [] } },
      'admin.cert-settings': { success: true, settings: { enabled: true, program_ar: 'برنامج القادة', hours: 48, signatory: null } },
      'admin.cohort-groups': { success: true, cohort: cohorts[0], members: [], groups: [], stages: [{ key: 'training', title_ar: 'التدريب' }] },
      'admin.cohort-team': { success: true, team_max: 30, cohort: cohorts[0], rows: [], groups: [], coverage: null, experts: [] },
      'admin.certificates': { success: true, checks: 0, certificates: [cert] },
      'admin.catalog': catalog,
      'admin.submissions': { success: true, submissions: [submission] }, 'admin.submission': { success: true, submission: { ...submission, status: 'submitted', rating: null, bonus: 0 } },
      'admin.save': { success: true },
    };
    if (delay[b.action]) await new Promise((r) => setTimeout(r, delay[b.action]));
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  return calls;
}
const leaders = async (page, tab) => {
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: tab }).click();
};
// اسم النافذة التي فيها التركيز الآن، أو null إن كان خارج كل نافذة
const focusedDialog = (page) => page.evaluate(() => document.activeElement?.closest('[aria-modal="true"]')?.getAttribute('aria-label') ?? null);
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
// كم ضغطة Tab (أو Shift+Tab) من n أخرجت التركيز من النافذة
async function tabsOutside(page, n, key = 'Tab') {
  let out = 0;
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press(key);
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[aria-modal="true"]')))) out += 1;
  }
  return out;
}

test('النموذج العام: التركيز يدخل أول حقل ويبقى فيه، ويعود إلى زر فتحه عند الإغلاق', async ({ page }) => {
  await setup(page);
  await leaders(page, 'البرامج والدفعات');
  const row = page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' });
  await row.getByRole('button', { name: 'تحرير' }).click();
  const form = page.getByRole('dialog', { name: 'دفعة: دفعة نوفمبر' });
  await expect(form).toBeVisible();
  await expect.poll(() => focusedDialog(page)).toBe('دفعة: دفعة نوفمبر');
  await expect(form.getByLabel('اسم الدفعة')).toBeFocused();
  // لا يخرج بـTab ولا Shift+Tab إلى ما خلف الغشاء
  expect(await tabsOutside(page, 30)).toBe(0);
  expect(await tabsOutside(page, 30, 'Shift+Tab')).toBe(0);
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(row.getByRole('button', { name: 'تحرير' })).toBeFocused();
});

test('النموذج العام: الإغلاق بتعديلات لم تُحفظ يسأل أولًا، بـEsc أو بالنقر خارجه أو بـ«إلغاء»', async ({ page }) => {
  const calls = await setup(page);
  await leaders(page, 'البرامج والدفعات');
  const row = page.locator('.data-table tbody tr', { hasText: 'دفعة نوفمبر' });
  const form = page.getByRole('dialog', { name: 'دفعة: دفعة نوفمبر' });
  const ask = page.getByRole('alertdialog');
  // بلا تعديل: Esc يغلق مباشرة
  await row.getByRole('button', { name: 'تحرير' }).click();
  await expect(form).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(ask).toHaveCount(0);
  // بتعديل: Esc يسأل، وEsc على السؤال يلغيه وحده ويبقى ما كُتب
  await row.getByRole('button', { name: 'تحرير' }).click();
  await form.getByLabel('اسم الدفعة').fill('دفعة نوفمبر المعدلة');
  await page.keyboard.press('Escape');
  await expect(ask).toContainText('لديك تعديلات لم تُحفظ');
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  await expect(form.getByLabel('اسم الدفعة')).toHaveValue('دفعة نوفمبر المعدلة');
  // النقر خارجه يسأل كذلك، و«إغلاق دون حفظ» يغلق بلا حفظ
  await page.mouse.click(5, 400);
  await ask.getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(form).toBeHidden();
  // «إلغاء» بتعديل يسأل أيضًا
  await row.getByRole('button', { name: 'تحرير' }).click();
  await form.getByLabel('اسم الدفعة').fill('تعديل آخر');
  await form.getByRole('button', { name: 'إلغاء' }).click();
  await expect(ask).toContainText('لديك تعديلات لم تُحفظ');
  await ask.getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(form).toBeHidden();
  expect(calls.some((c) => c.action === 'admin.cohort-save')).toBe(false);
});

test('تقييم عمل المشارك: ملاحظات لم تُعتمد لا تضيع بـEsc', async ({ page }) => {
  await setup(page);
  await leaders(page, 'كتيب القائد');
  await page.getByRole('navigation', { name: 'أقسام الكتاب' }).getByRole('button', { name: /التقييم/ }).click();
  await page.getByLabel('حالة العمل').selectOption('');   // القائمة تبدأ بما ينتظر التقييم، والعمل هنا مقيَّم
  await page.getByRole('button', { name: 'عرض' }).click();
  const rev = page.getByRole('dialog', { name: 'تقييم عمل سارة الأحمد' });
  await rev.getByLabel('ملاحظاتك للمشارك').fill('عمل جيد');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toContainText('لديك تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  await expect(rev.getByLabel('ملاحظاتك للمشارك')).toHaveValue('عمل جيد');
});

test('نوافذ البرامج: «قارن» والتقييم الختامي والمجموعات والشهادة تُغلق بـEsc ويعود التركيز', async ({ page }) => {
  await setup(page);
  await leaders(page, 'البرامج والدفعات');
  // قارن بالحالي
  await page.getByRole('button', { name: 'النسخ (1)' }).click();
  await page.getByRole('button', { name: 'قارن بالحالي' }).click();
  await expect(page.getByRole('dialog', { name: 'الفرق' })).toContainText('فيديو التمهيد');
  await expect.poll(() => focusedDialog(page)).toBe('الفرق');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'الفرق' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'قارن بالحالي' })).toBeFocused();

  // التقييم الختامي: التركيز في أول حقل، وEsc يغلقها
  await page.getByRole('button', { name: 'التقييم الختامي' }).click();
  const fin = page.getByRole('dialog', { name: 'إعداد التقييم الختامي' });
  await expect(fin).toBeVisible();
  await expect.poll(() => focusedDialog(page)).toBe('إعداد التقييم الختامي');
  expect(await tabsOutside(page, 15)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(fin).toBeHidden();
  await expect(page.getByRole('button', { name: 'التقييم الختامي' })).toBeFocused();

  // الفريق والمجموعات (تبويب المجموعات ونمط العمل): Esc يغلقها، ونمط عمل لم يُحفظ يسأل قبل الإغلاق
  await page.getByRole('button', { name: 'الفريق والمجموعات' }).click();
  const grp = page.getByRole('dialog', { name: /^الفريق والمجموعات:/ });
  await grp.getByRole('tab', { name: 'المجموعات ونمط العمل' }).click();
  await grp.getByLabel('نمط العمل في التدريب').selectOption({ index: 1 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toContainText('لديك تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إغلاق دون حفظ' }).click();
  await expect(grp).toBeHidden();
  await page.getByRole('button', { name: 'الفريق والمجموعات' }).click();
  await grp.getByRole('tab', { name: 'المجموعات ونمط العمل' }).click();
  await expect(grp.getByLabel('نمط العمل في التدريب')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(grp).toBeHidden();

  // شهادة البرنامج
  await page.getByRole('button', { name: /^الشهادة/ }).click();
  const crt = page.getByRole('dialog', { name: 'شهادة برنامج القادة' });
  await expect(crt).toBeVisible();
  await expect.poll(() => focusedDialog(page)).toBe('شهادة برنامج القادة');
  await page.keyboard.press('Escape');
  await expect(crt).toBeHidden();
});

test('إعادة إصدار الشهادة: Esc يغلقها (صندوقها .mid-box)، والتركيز يدخلها ويعود', async ({ page }) => {
  await setup(page);
  await leaders(page, 'الشهادات');
  const open = page.getByRole('button', { name: 'إعادة إصدار' });
  await open.click();
  const dlg = page.getByRole('dialog', { name: 'إعادة إصدار الشهادة' });
  await expect(dlg).toBeVisible();
  await expect.poll(() => focusedDialog(page)).toBe('إعادة إصدار الشهادة');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(open).toBeFocused();
  // سبب مكتوب: Esc يسأل قبل أن يضيع
  await open.click();
  await dlg.getByLabel('السبب *').fill('تصحيح الاسم');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toContainText('لديك تعديلات لم تُحفظ');
  await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء' }).click();
  await expect(dlg.getByLabel('السبب *')).toHaveValue('تصحيح الاسم');
});

test('البحث الشامل والإعدادات: Tab لا يخرج منهما، وEsc يغلقهما بعده، ويعود التركيز إلى زر الفتح', async ({ page }) => {
  await setup(page);
  const search = page.getByRole('button', { name: /^بحث/ });
  await search.click();
  const pal = page.getByRole('dialog', { name: 'البحث الشامل' });
  await expect(pal).toBeVisible();
  expect(await tabsOutside(page, 5)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(pal).toBeHidden();
  await expect(search).toBeFocused();

  const gear = page.getByRole('button', { name: 'الإعدادات', exact: true });   // وفي تبويبات القادة «الإعدادات العامة»
  await gear.click();
  const set = page.getByRole('dialog', { name: 'الإعدادات' });
  await expect(set).toBeVisible();
  await expect.poll(() => focusedDialog(page)).toBe('الإعدادات');
  expect(await tabsOutside(page, 20)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(set).toBeHidden();
  await expect(gear).toBeFocused();
});

test('النموذج التعليمي الجديد: نقرتان على «حفظ النموذج» ترسلان طلب إنشاء واحدًا', async ({ page }) => {
  const calls = await setup(page, { delay: { 'admin.save': 1200 } });
  await leaders(page, 'كتيب القائد');
  await page.getByRole('navigation', { name: 'أقسام الكتاب' }).getByRole('button', { name: 'النماذج التعليمية' }).click();
  await page.getByRole('button', { name: '+ نموذج جديد' }).first().click();
  const ed = page.getByRole('dialog', { name: 'نموذج جديد' });
  await ed.getByLabel('اسم النموذج').fill('خريطة أصحاب المصلحة');
  await ed.getByRole('button', { name: 'حفظ النموذج' }).dblclick();
  await expect(ed).toBeHidden();
  expect(calls.filter((c) => c.action === 'admin.save')).toHaveLength(1);
});

test('التقييم بالسلّم الرباعي: الجدول يعرض اسم الدرجة لا نجومًا خمسًا، والتنبيه لا يذكر خامسة', async ({ page }) => {
  await setup(page);
  await leaders(page, 'كتيب القائد');
  await page.getByRole('navigation', { name: 'أقسام الكتاب' }).getByRole('button', { name: /التقييم/ }).click();
  await page.getByLabel('حالة العمل').selectOption('');   // القائمة تبدأ بما ينتظر التقييم، والعمل هنا مقيَّم
  const cell = page.locator('td.stars-c');
  await expect(cell).toContainText('متميز (4 من 4)');
  await expect(cell).not.toContainText('★');
  await page.getByRole('button', { name: 'عرض' }).click();
  const rev = page.getByRole('dialog', { name: 'تقييم عمل سارة الأحمد' });
  await rev.getByRole('button', { name: 'اعتماد التقييم' }).click();
  await expect(rev.getByRole('alert')).toHaveText('اختر مستوى من السلّم');
});
