// الطبقة القانونية في منصة القادة: شاشة الموافقة لمن سبق تسجيله، وصفحات الخصوصية والشروط
// والاسترداد، ومفتاح مشاركة المستويات مع الجهة من «ملفي». الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';
import { consentState, POLICY_VERSION } from '../supabase/functions/leaders-api/labels.js';

const APP = 'http://localhost:4304/';
const base = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', organization_linked: true, years_experience: 8 },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};
const signedIn = (page) => page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-consent-0000000000000000'); });

test('من سبق تسجيله يرى شاشة الموافقة مرة، وقبولها يسجَّل ثم تفتح الرحلة', async ({ page }) => {
  const sent = [];
  let consented = null;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b.action);
    if (b.action === 'consent.accept') consented = '2026-11-05T09:00:00Z';
    // حالة الموافقة كما يحسبها الخادم (participant.ts mePayload)، فالتطبيق لم يعد يشتقها من consented_at وحده
    const me = { ...base, participant: { ...base.participant, consented_at: consented, consent: consentState(consented && POLICY_VERSION, consented) } };
    const r = { me, 'consent.accept': me, certificate: { success: true, certificate: null } }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await signedIn(page);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'خصوصيتك وشروط البرنامج' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('href', '/legal/privacy');
  await page.getByRole('button', { name: 'أوافق وأتابع' }).click();
  await expect(page.getByRole('heading', { name: 'خصوصيتك وشروط البرنامج' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  expect(sent).toContain('consent.accept');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'الخصوصية والشروط' })).toHaveAttribute('href', '/legal');
});

test('صفحات الخصوصية والشروط والاسترداد بلا دخول، بتبويباتها', async ({ page }) => {
  await page.goto(APP + 'legal/privacy');
  await expect(page.getByRole('heading', { name: 'سياسة خصوصية برنامج القادة' })).toBeVisible();
  await expect(page.getByText('مسارك ومستوياتك في الأبعاد الثلاثة لا تصل جهتك إلا بموافقتك')).toBeVisible();
  await page.getByRole('link', { name: 'الاسترداد' }).first().click();
  await expect(page.getByRole('heading', { name: 'سياسة الاسترداد لبرنامج القادة' })).toBeVisible();
  await page.goto(APP + 'legal/terms');
  await expect(page.getByRole('heading', { name: 'شروط برنامج القادة' })).toBeVisible();
  await expect(page.getByText('ضريبة القيمة المضافة')).toBeVisible();
});

test('مشاركة المستويات مع الجهة: مفتاح في «ملفي» يرسل الموافقة وسحبها', async ({ page }) => {
  const sent = [];
  let share = false;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action === 'org.share-consent') share = b.share;
    const r = {
      me: { ...base, participant: { ...base.participant, consented_at: '2026-11-05T09:00:00Z' } },
      'org.visibility': { success: true, org: 'شركة المعالم', visibility: { viewers: 2, list: true, scores: true }, share_consented: share },
      'org.share-consent': { success: true, share },
      'sessions.list': { success: true, sessions: [] }, certificate: { success: true, certificate: null },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await signedIn(page);
  await page.goto(APP);
  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  await expect(page.getByRole('heading', { name: 'ماذا ترى جهتك' })).toBeVisible();
  await expect(page.getByText('لا تصلها إلا بموافقتك أدناه')).toBeVisible();
  const box = page.getByRole('checkbox', { name: /أوافق على اطلاع شركة المعالم على مساري ومستوياتي/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await expect(page.getByText('بموافقتك', { exact: false }).first()).toBeVisible();
  await box.uncheck();
  await expect(box).not.toBeChecked();
  expect(sent.filter((b) => b.action === 'org.share-consent').map((b) => b.share)).toEqual([true, false]);
});

test('D18: من وافق على نسخة أقدم يرى ما تغيّر، ويؤجل فتبقى رحلته بشريط، ثم يجدد', async ({ page }) => {
  const sent = [];
  let version = '2026-11-06';
  const consentOf = (v) => (v < '2026-11-07'
    ? { needed: 'renew', notice: false, version: v, changes: [{ version: '2026-11-07', material: true, items: ['مكان البيانات: قاعدة البيانات والملفات لدى Supabase على خوادم AWS في مومباي بالهند.'] }] }
    : { needed: null, notice: false, version: v, changes: [] });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b.action);
    if (b.action === 'consent.accept') version = '2026-11-07';
    const me = { ...base, participant: { ...base.participant, consented_at: '2026-11-06T09:00:00Z', consent: consentOf(version) } };
    const r = { me, 'consent.accept': me, certificate: { success: true, certificate: null } }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await signedIn(page);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'حدّثنا سياسة الخصوصية وشروط البرنامج' })).toBeVisible();
  await expect(page.getByText('وافقت على النسخة 2026-11-06')).toBeVisible();
  await expect(page.getByText('مومباي بالهند', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'سجل التغييرات' })).toHaveAttribute('href', '/legal/changes');
  await page.getByRole('button', { name: 'لاحقًا' }).click();
  await expect(page.getByRole('button', { name: 'سارة الأحمد' })).toBeVisible();
  const bar = page.getByRole('status').filter({ hasText: 'تحديثًا جوهريًا' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'راجع ووافق' }).click();
  await page.getByRole('button', { name: 'أوافق وأتابع' }).click();
  await expect(page.getByRole('heading', { name: 'حدّثنا سياسة الخصوصية وشروط البرنامج' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'تحديثًا جوهريًا' })).toHaveCount(0);
  expect(sent).toContain('consent.accept');
});

test('D18: سجل التغييرات صفحة عامة بنسخها', async ({ page }) => {
  await page.goto(APP + 'legal/changes');
  await expect(page.getByRole('heading', { name: 'سجل تغييرات الوثائق' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'النسخة 2026-11-07 · جوهرية' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'سجل التغييرات' }).first()).toHaveAttribute('aria-current', 'page');
});
