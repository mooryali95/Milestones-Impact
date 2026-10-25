// منهج المسار في رحلة المشارك، وبنك المحتوى ومعاينة المسار في الإدارة. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.SHOTS_DIR;

const curriculum = {
  id: 'r9', code: 'T-CUR', kind: 'curriculum', title_ar: 'منهج مسارك', required: true, status: 'pending',
  activity: { type: 'curriculum', done: false, count: 1, total: 2, items: [
    { id: 'i1', kind: 'video', title: 'ترحيب بالبرنامج', minutes: 6, required: true, done: true, started: true, pct: 100, min_pct: 90, source: { type: 'file', url: 'https://example.com/v.mp4' } },
    { id: 'i2', kind: 'file', title: 'نموذج سجل المنافع', description: 'للمستوى المتوسط فأعلى', required: true, done: false, started: false, pct: 0, url: 'https://example.com/f.pdf' },
    { id: 'i3', kind: 'link', title: 'قراءة إضافية', required: false, done: false, started: false, pct: 0, url: 'https://example.com/l' },
  ] },
};
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 's@x.com', status: 'enrolled' },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  cohort: { name: 'سفراء 2026' },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'training', title_ar: 'التدريب', phase: 'qualification', status: 'active', items: [curriculum], done: 0, total: 1 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

test('منهج المسار: مواد مساري، وفتح الملف يُحتسب', async ({ page, context }) => {
  await page.setViewportSize({ width: 1100, height: 1400 });
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'content.open') Object.assign(curriculum.activity, { count: 2, items: curriculum.activity.items.map((i) => (i.id === b.item_id ? { ...i, done: true } : i)) });
    const r = { me, certificate: { success: true, certificate: null }, 'content.open': { success: true, url: 'https://example.com/f.pdf' } };
    await route.fulfill({ json: r[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'ok' }));
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-123456789012345678901234');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
  await page.goto(APP);
  await expect(page.getByText('أنجزت 1 من 2 من مواد مسارك')).toBeVisible();
  await expect(page.getByText('سفراء 2026')).toBeVisible();
  await expect(page.getByText('نموذج سجل المنافع')).toBeVisible();
  await expect(page.getByText('· اختياري')).toBeVisible();
  await expect(page.getByRole('button', { name: 'أنجزته' })).toHaveCount(0);
  if (SHOTS) await page.locator('.stage.active').screenshot({ path: `${SHOTS}/curriculum.png` });
  const popup = context.waitForEvent('page');
  await page.getByRole('link', { name: 'افتح الملف' }).click();
  await popup;
  await expect.poll(() => calls.find((c) => c.action === 'content.open')?.item_id).toBe('i2');
  await expect(page.getByText('أنجزت 2 من 2 من مواد مسارك')).toBeVisible();
  await page.getByRole('button', { name: 'شاهد مرة أخرى' }).click();
  await expect(page.locator('.act-item-player video')).toBeVisible();
});

const items = [
  { id: 'c1', kind: 'video', title_ar: 'ترحيب بالبرنامج', url: 'https://youtu.be/abcdefghijk', dimension: null, sort: 1, active: true, required: true, track_keys: [], exclude_tracks: [] },
  { id: 'c2', kind: 'file', title_ar: 'نموذج سجل المنافع', url: 'https://example.com/f.pdf', dimension: 'impact', min_level: 'intermediate', sort: 1, active: true, required: true, track_keys: [], exclude_tracks: [] },
];

test('بنك المحتوى: وسم المادة لمن هي ومعاينة مسار', async ({ page }) => {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.participants': { success: true, participants: [] },
      'admin.catalog': { success: true, content_items: items, tracks: [{ key: 'M1I2L1', title_ar: 'مسار الأثر' }], journey_stages: [], stage_requirements: [], instruments: [], questions: [], handbook_modules: [], learning_models: [], locked_instruments: [] },
      'admin.curriculum': { success: true, track: 'M1I2L1', items: [items[0], items[1]], chapters: [{ id: 'h1', dimension: 'impact', title: 'سلسلة القيمة' }] },
      'admin.save': { success: true, row: { id: 'c3' } },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.getByRole('button', { name: 'بنك المحتوى' }).click();
  await expect(page.getByText('تحويل المشروع إلى أثر · متوسط فأعلى')).toBeVisible();

  await page.getByLabel('المسار').selectOption('M1I2L1');
  await expect(page.getByText('مواد البنك (2)')).toBeVisible();
  await expect(page.getByText('سلسلة القيمة')).toBeVisible();
  expect(calls.find((c) => c.action === 'admin.curriculum').track).toBe('M1I2L1');

  await page.getByRole('button', { name: '+ مادة' }).nth(3).click();
  const form = page.getByRole('dialog', { name: 'مادة جديدة' });
  await form.getByLabel('النوع').selectOption('link');
  await form.getByLabel('العنوان').fill('دليل القائد الميداني');
  await form.getByLabel('الرابط (https)').fill('https://example.com/guide');
  await form.getByLabel('أو لمستوى واحد فقط').selectOption('beginner');
  await form.getByLabel('استبعاد مسارات (اختياري)').fill('M1I1L1');
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.save')?.row).toMatchObject({
    kind: 'link', title_ar: 'دليل القائد الميداني', dimension: 'leadership', only_level: 'beginner', exclude_tracks: 'M1I1L1',
  });
});
