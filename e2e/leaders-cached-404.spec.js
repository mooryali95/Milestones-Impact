// حادث الخبير على iPhone (2026-11-25): ملف قسم موجود على الخادم لكن المتصفح خزّن له 404 (ترويسة immutable سنة)، فكل
// «حدّث الصفحة» يعيد 404 المخزن. يُحاكى المخزن هنا بالموجّه: كل طلب عادي لملف القسم يرد 404 بترويسة immutable كما يجيب
// المخزن، ولا يصل «الخادم» (الملف السليم) إلا طلب يتجاوز المخزن (cache: 'reload' يرسل Cache-Control: no-cache)، وبعده
// صار المخزن سليمًا فتمر الطلبات كلها. المطلوب: يعود القسم وحده بإعادة تحميل واحدة (refreshFailedAsset)، وإن فشل التجديد
// الأول أيضًا فزر «تحديث كامل» في رسالة القسم (hardReload، بطريق Safari: الملفات المرشحة بلا رابط في الخطأ) يعيده.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
test.use({ serviceWorkers: 'block' });

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

// ignoreBypass: عدد طلبات التجاوز الأولى التي تبقى 404 (انتشار نشر لم يكتمل بعد)
async function cachedChunk(page, { ignoreBypass = 0 } = {}) {
  const state = { docs: 0, cached404: 0, bypass: 0, healed: false, events: [] };
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.docs += 1; });
  await page.route(/functions\/v1\/leaders-api/, (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.action === 'client.event') state.events.push(...(b.events || []));
    const reply = { me, 'capstone.get': capstone, certificate: { success: true, certificate: null } }[b.action] || { success: true };
    return r.fulfill({ json: reply });
  });
  await page.route(/\/assets\/Capstone-[\w-]+\.js$/, (r) => {
    if (state.healed) return r.continue();
    if (r.request().headers()['x-e2e-cache'] === 'reload') {
      state.bypass += 1;
      if (state.bypass > ignoreBypass) { state.healed = true; return r.continue(); }
    }
    state.cached404 += 1;
    return r.fulfill({ status: 404, contentType: 'text/html', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, body: 'not found' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-cached-0000000000000000');
    // ترويسة Cache-Control التي يضيفها cache: 'reload' تُضاف في طبقة الشبكة فلا يراها الموجّه: علامة اختبار تكشف الطلب المتجاوز للمخزن
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => (init && init.cache === 'reload'
      ? orig(input, { ...init, headers: { ...(init.headers || {}), 'x-e2e-cache': 'reload' } })
      : orig(input, init));
  });
  return state;
}

test('القادة: 404 مخزن لملف قسم موجود يتجدد بطلب يتجاوز المخزن، فيفتح القسم بإعادة تحميل واحدة', async ({ page }) => {
  const state = await cachedChunk(page);
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await nav.getByRole('button', { name: 'مبادرتي' }).click();
  await expect(page.getByText('رقمنة خدمات المستفيدين').first()).toBeVisible();
  expect(state.healed).toBe(true);
  expect(state.cached404).toBeGreaterThanOrEqual(1);
  expect(state.docs).toBe(2);
  await expect(page.getByText('صدر تحديث للمنصة')).toHaveCount(0);
});

test('القادة: إن بقي 404 بعد إعادة التحميل التلقائية، «تحديث كامل» يجدد الملفات المرشحة ويفتح القسم، والحدث يسمّي القسم', async ({ page }) => {
  // التجديد مع إعادة التحميل التلقائية يبقى 404، فتظهر رسالة القسم بعد المحاولة الواحدة (لا حلقة)
  const state = await cachedChunk(page, { ignoreBypass: 1 });
  await page.goto(APP);
  const nav = page.locator('nav.nav-tabs');
  await nav.getByRole('button', { name: 'مبادرتي' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'صدر تحديث للمنصة' });
  await expect(alert).toBeVisible();
  expect(state.docs).toBe(2);
  expect(state.healed).toBe(false);
  await alert.getByRole('button', { name: 'تحديث كامل' }).click();
  await expect(page.getByText('رقمنة خدمات المستفيدين').first()).toBeVisible();
  expect(state.healed).toBe(true);
  expect(new URL(page.url()).searchParams.has('mi_fresh')).toBe(true);
  await expect(nav.getByRole('button', { name: 'مبادرتي' })).toHaveAttribute('aria-current', 'page');
  // حدث القياس من الصفحة السابقة يُرسل بعد الفتح، بفعل يسمّي القسم
  await expect.poll(() => state.events.filter((e) => e.kind === 'chunk').map((e) => e.act), { timeout: 8000 }).toContain('lazy.capstone');
});
