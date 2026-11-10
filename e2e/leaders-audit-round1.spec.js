// تدقيق الإنتاج، الجولة 1: «هكذا يظهر اسمك» قبل الشهادة، واستبانة أيام التدريب بعد الحضور. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const base = (over = {}) => ({
  success: true,
  participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', name_en: 'Sarah Alahmad', name_locked: false, name_confirmed: false, email: 'sara@x.sa', status: 'enrolled',
    phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', years_experience: 8, ...over.participant },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: over.journey || [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 90, passkeys: 1, prompt_passkey: false,
  final: over.final === undefined ? { score: 82, decision: 'pass', decision_ar: 'اجتاز', decided_at: '2026-11-09T10:00:00Z', notes: null } : over.final,
});

async function mount(page, me, extra = {}) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = typeof extra[b.action] === 'function' ? extra[b.action](b) : extra[b.action];
    await route.fulfill({ json: r ?? (b.action === 'me' ? me : { success: true }) });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-round1-00000000000000000000'); });
  return calls;
}

test('اعتُمد التقييم بنجاح والاسم غير مؤكد: «هكذا يظهر اسمك»، والتأكيد يصدر الشهادة', async ({ page }) => {
  let issued = false;
  const snap = { serial: 'MI-LDR-2026-ABCDEF', name_ar: 'سارة عبدالله الأحمد' };
  const calls = await mount(page, base(), {
    certificate: () => ({ success: true, certificate: issued ? snap : null }),
    'profile.confirm-name': () => { issued = true; return { ...base({ participant: { name_confirmed: true } }), certificate: { serial: snap.serial } }; },
  });
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'خطوة واحدة قبل شهادتك' })).toBeVisible();
  const box = page.getByRole('group', { name: 'هكذا يظهر اسمك على الشهادة' });
  await expect(box.getByText('سارة عبدالله الأحمد')).toBeVisible();
  await expect(box.getByText('Sarah Alahmad')).toBeVisible();
  await box.getByRole('button', { name: 'الاسم صحيح، أكّده' }).click();
  await expect(page.getByRole('heading', { name: 'مبارك، صدرت شهادتك' })).toBeVisible();
  expect(calls.filter((c) => c.action === 'profile.confirm-name')).toHaveLength(1);
});

test('اسم لا يصلح للشهادة: الخادم يرفض التأكيد برسالته', async ({ page }) => {
  await mount(page, base({ participant: { full_name: 'OmarManzoma' } }), {
    certificate: { success: true, certificate: null },
    'profile.confirm-name': { success: false, code: 'name', message: 'اسمك العربي لا يصلح للشهادة بعد: اسمان على الأقل بالحروف. صحّحه في ملفك ثم أكّده.' },
  });
  await page.goto(APP);
  await page.getByRole('button', { name: 'الاسم صحيح، أكّده' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'لا يصلح للشهادة' })).toBeVisible();
});

test('الاسم مؤكد والشهادة لم تصدر: لا يُطلب التأكيد، و«قيد الإصدار»', async ({ page }) => {
  await mount(page, base({ participant: { name_confirmed: true } }), { certificate: { success: true, certificate: null } });
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'شهادتك قيد الإصدار' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'الاسم صحيح، أكّده' })).toHaveCount(0);
});

test('لم يُعتمد تقييم ختامي ناجح: لا بطاقة شهادة', async ({ page }) => {
  await mount(page, base({ final: null }), { certificate: { success: true, certificate: null } });
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: /سارة|رحلتك/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'خطوة واحدة قبل شهادتك' })).toHaveCount(0);
});
