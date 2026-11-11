// إعداد البرنامج في لوحة الإدارة (التدقيق 2026-11-11، المجموعة b5): استثناء الدفعة الجارية بتعليل،
// وربط الجلسة بدفعة البرنامج الوحيدة، وتمديد المعلم بحقل تاريخ، والقاعة الحية على الجوال. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4303/';
const ADMIN = { name: 'مدير', email: 'a@x', role_id: 'admin' };

async function open(page, hash, replies, user = ADMIN) {
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const base = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
    };
    const r = replies[b.action] ?? base[b.action];
    return route.fulfill({ json: (typeof r === 'function' ? r(b) : r) ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto(BASE);
  await page.evaluate((u) => { sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: u, ts: Date.now() })); localStorage.clear(); }, user);
  await page.goto(BASE + hash);
  await page.reload();
  return calls;
}

test.describe('القاعة الحية على الجوال (admin-program-11)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('نموذج فتح القاعة لا يفيض أفقيًا بعرض 390', async ({ page }) => {
    const hall = {
      success: true, session: null, version: 0,
      topics: [{ id: 't1', title_ar: 'موضوع كاتون الأول عن قرار البوابة الحمراء في المشروع', status: 'published' }],
      workshops: [{ id: 'w1', title: 'اليوم الأول من التدريب الحضوري', starts_at: '2026-11-20T06:00:00Z', open: false }],
    };
    await open(page, '#/leaders/hall', {
      'admin.programs': { success: true, programs: [], cohorts: [{ id: 'c1', name: 'دفعة نوفمبر', status: 'running' }] },
      'admin.hall': hall, 'admin.peer': { success: true, items: [] },
    });
    await expect(page.getByLabel('نمط القاعة')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
