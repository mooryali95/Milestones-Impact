// بياناتي: المشارك ينزّل نسخة من بياناته، ويطلب حذفها ويسحب الطلب. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', organization_linked: true, years_experience: 8,
    consented_at: '2026-11-05T09:00:00Z', consent: { needed: null } },
  profile: { approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ' } },
  journey: [
    { key: 'profile', title_ar: 'الملف الشخصي', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
    { key: 'assessment', title_ar: 'تحديد المستوى', phase: 'admission', status: 'done', items: [], done: 0, total: 0 },
  ],
  progress: 30, passkeys: 1, prompt_passkey: false,
};

test('المشارك ينزّل نسخة بياناته، ويطلب الحذف بتأكيد بريده، ثم يسحب الطلب', async ({ page }) => {
  const sent = [];
  let erase = null;
  let left = 3;
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    const state = () => ({ success: true, erase, erase_ready: true, exports_left: left, reply_days: 30, contact: 'hello@x.sa' });
    let r = { success: true };
    if (b.action === 'me') r = me;
    else if (b.action === 'certificate') r = { success: true, certificate: null };
    else if (b.action === 'me.privacy') r = state();
    else if (b.action === 'me.export') { left -= 1; r = { success: true, export: { format: 'milestone-impact.participant-export.v1', participant: { email: 'sara@x.sa' }, data: { placements: [{ level: 'intermediate' }] } } }; }
    else if (b.action === 'me.erase-request') {
      if (b.cancel) erase = null;
      else if (b.confirm_email !== 'sara@x.sa') r = { success: false, message: 'اكتب بريدك كما هو للتأكيد' };
      else erase = { id: 'r1', status: 'pending', created_at: '2026-11-10T09:00:00Z', due_at: '2026-12-10T09:00:00Z', reason: b.reason || null };
      if (r.success) r = { success: true, erase };
    }
    await route.fulfill({ json: r });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-mydata-00000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'سارة الأحمد' }).click();
  const card = page.getByRole('region', { name: 'بياناتي' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('بقي لك اليوم 3');

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'نزّل النسخة' }).click();
  expect((await download).suggestedFilename()).toMatch(/^milestone-impact-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(card).toContainText('بقي لك اليوم 2');

  await card.getByRole('button', { name: 'اطلب الحذف' }).click();
  const send = card.getByRole('button', { name: 'أرسل طلب الحذف' });
  await expect(send).toBeDisabled();
  await card.getByLabel(/للتأكيد اكتب بريدك/).fill('sara@x.sa');
  await card.getByLabel(/سبب الطلب/).fill('انتهى البرنامج');
  await send.click();
  await expect(card).toContainText('طلب حذف قائم');
  expect(sent.find((b) => b.action === 'me.erase-request')).toMatchObject({ confirm_email: 'sara@x.sa', reason: 'انتهى البرنامج' });

  await card.getByRole('button', { name: 'اسحب الطلب وأبقِ حسابي' }).click();
  await expect(card).toContainText('سحبنا طلب الحذف');
  await expect(card.getByRole('button', { name: 'اطلب الحذف' })).toBeVisible();
});
