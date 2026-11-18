// تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 1: صفحة فُتحت قبل النشر ثم طلبت قسمًا لم تزره، وملفه حذفه النشر.
// يُحاكى النشر بحجب ملف القسم (404، أو صفحة التطبيق بنوع HTML كما يرد Pages اليوم) حتى تُعاد الصفحة، فالصفحة الجديدة
// «من النشر الجديد» تجده. المطلوب: إعادة تحميل واحدة على الأكثر، والعودة إلى القسم المطلوب لا «رحلتي»، ولا شاشة خطأ.
// (اللوحة في admin-update-recovery.spec.js.) وإن بقي الملف غائبًا بعد إعادة التحميل (وكيل يحجبه مثلًا): لا حلقة، بل رسالة القسم بزر التحديث. الخلفية مُحاكاة.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
// عامل الخدمة يجلب الملفات بنفسه فلا يراها page.route: يُحجب هنا، وقرارات تخزينه في update-safety.test.js
test.use({ serviceWorkers: 'block' });
const SHOTS = process.env.REL1_SHOTS || '';

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })),
  progress: 80, passkeys: 1, prompt_passkey: false,
};
const capstone = {
  success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate',
  track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' },
  capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' },
  sections: [{ id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' }],
  checks: [], readiness: 58, ready_min: 80, card: { state: 'waiting', sla: 'يومي عمل' }, can_submit: false, blocker: 'فصول لم تكتمل', rubric: [],
};

// يحجب ملف القسم: mode 'until-reload' حتى أول إعادة تحميل، و'always' دائمًا. وbody 'html' يرد صفحة التطبيق برمز 200
async function participant(page, { mode = 'until-reload', body = '404' } = {}) {
  const state = { docs: 0, blocked: 0 };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    const reply = { me, 'capstone.get': capstone, certificate: { success: true, certificate: null } }[b.action] || { success: true };
    return r.fulfill({ json: reply });
  });
  await page.route(/\/assets\/Capstone-[\w-]+\.js$/, (r) => {
    if (mode === 'always' || state.docs <= 1) {
      state.blocked += 1;
      return body === 'html'
        ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' })
        : r.fulfill({ status: 404, contentType: 'text/html', body: 'not found' });
    }
    return r.continue();
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-update-0000000000000000'); });
  return state;
}

for (const body of ['404', 'html']) {
  test(`القادة: ملف قسم حذفه النشر (${body === '404' ? 'يرد 404' : 'يرد صفحة التطبيق'}) يعود إلى «مبادرتي» بإعادة تحميل واحدة بلا شاشة خطأ`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = await participant(page, { body });
    await page.goto(APP);
    const nav = page.locator('nav.nav-tabs');
    await expect(nav.getByRole('button', { name: 'رحلتي' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'مبادرتي' }).click();
    // بعد إعادة التحميل: القسم المطلوب نفسه، ومحتواه من الملف الجديد
    await expect(page.getByText('رقمنة خدمات المستفيدين').first()).toBeVisible();
    await expect(nav.getByRole('button', { name: 'مبادرتي' })).toHaveAttribute('aria-current', 'page');
    expect(state.docs).toBe(2);
    expect(state.blocked).toBeGreaterThanOrEqual(1);
    // tab قُرئ وحُذف من العنوان، ولا شاشة خطأ للتطبيق ولا للقسم
    expect(new URL(page.url()).searchParams.has('tab')).toBe(false);
    await expect(page.getByRole('heading', { name: 'تعذّر عرض الصفحة' })).toHaveCount(0);
    await expect(page.getByText('صدر تحديث للمنصة')).toHaveCount(0);
    expect(errors).toEqual([]);
    if (SHOTS && body === '404') {
      // لقطة المراجعة بعرض الهاتف وبدقة مضاعفة (REL1_SHOTS وحده، لا في CI)
      await page.setViewportSize({ width: 390, height: 844 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await page.waitForTimeout(300);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${SHOTS}/leaders-recovered-390.png`, Buffer.from(data, 'base64'));
    }
  });
}

test('القادة: الملف غائب بعد إعادة التحميل أيضًا: لا حلقة، بل رسالة القسم بزر «حدّث الصفحة» والإطار باقٍ', async ({ page }) => {
  const state = await participant(page, { mode: 'always' });
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await nav.getByRole('button', { name: 'مبادرتي' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'صدر تحديث للمنصة' });
  await expect(alert).toBeVisible();
  // القسم المطلوب بعد إعادة التحميل الواحدة، لا «رحلتي»
  await expect(nav.getByRole('button', { name: 'مبادرتي' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(1500);
  expect(state.docs).toBe(2);
  await expect(alert.getByRole('button', { name: 'حدّث الصفحة' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'خروج' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر عرض الصفحة' })).toHaveCount(0);
});
