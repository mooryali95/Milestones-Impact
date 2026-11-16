// المرحلة 2 من تصور لوحة الإدارة (الصدق في الجلسة): صلاحية الكتابة من حكم الخادم («me» في admin-api).
// الحالتان معًا كي لا تُحجب الكتابة عن المدير الأعلى خطأً: جلسة رمز البريد للقراءة بشريط «للقراءة فقط» وزر «فعّل الكتابة»
// يرفعها في مكانها، والمدير الأعلى بجلسة تطبيق المصادقة يكتب بلا شريط. ومن لا يعرف خادمه «me» يبقى على الحكم القديم بالدور.
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const COHORT = '11111111-1111-1111-1111-111111111111';
const activities = {
  success: true, coaching: [], programs: [{ id: 'pa', name: 'برنامج القادة' }],
  cohorts: [{ id: COHORT, name: 'دفعة نوفمبر', program_id: 'pa', status: 'running' }],
  requirements: [{ id: 'r1', program_id: 'pa', kind: 'workshop', code: 'T-ATTEND', title_ar: 'حضور اليومين التدريبيين', config: { verify: 'join', sessions_required: 2 } }],
  workshops: [],
};

async function open(page, { role, method, me }) {
  const adminCalls = [];
  const state = { method };
  await page.route(/functions\/v1\/admin-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    adminCalls.push(b);
    if (b.action === 'me') {
      if (me === 'unknown') return route.fulfill({ json: { success: false, message: 'action غير معروف' }, status: 400 });
      const writer = role === 'admin' || role === 'super_admin';
      const second = state.method === 'passkey' || state.method === 'totp';
      return route.fulfill({ json: { success: true, role, method: state.method, can_write: writer && second, can_elevate: writer && !second, read_only_reason: !writer ? 'role' : second ? null : 'second_factor' } });
    }
    if (b.action === 'security-status') return route.fulfill({ json: { success: true, passkeys: [], passkey_only: false, method: state.method, totp_enabled: true } });
    if (b.action === 'step-up-totp') {
      if (b.purpose !== 'write' || b.code !== '123456') return route.fulfill({ json: { success: false, code: 'bad_code', message: 'x' }, status: 403 });
      state.method = 'totp';
      return route.fulfill({ json: { success: true, elevated: true, method: 'totp' } });
    }
    return route.fulfill({ json: { success: true, contacts: [] } });
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} }, 'admin.participants': { success: true, participants: [] },
      'admin.reviews': { success: true, pending_approval: [], submitted: [] }, 'admin.submissions': { success: true, submissions: [] },
      'admin.activities': activities,
    };
    return route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(([r, m]) => {
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't'.repeat(40), user: { name: 'مدير', email: 'a@x.sa', role_id: r, totp_enabled: true, ...(m ? { method: m } : {}) }, ts: Date.now() }));
    localStorage.clear();
  }, [role, me === 'unknown' ? null : method]);
  await page.goto(`${ADMIN}#/leaders/activities`);
  await page.reload();
  return { adminCalls };
}

const banner = (page) => page.getByRole('status').filter({ hasText: 'للقراءة فقط' });
const addSession = (page) => page.getByRole('button', { name: '+ موعد' });

test('جلسة رمز البريد: للقراءة فقط بزر «فعّل الكتابة»، والتأكيد بالرمز يفتح الكتابة في مكانها بلا خروج', async ({ page }) => {
  const { adminCalls } = await open(page, { role: 'admin', method: 'email' });
  await expect(banner(page)).toBeVisible();
  await expect(page.getByText('حضور اليومين التدريبيين')).toBeVisible();
  await expect(addSession(page)).toHaveCount(0);
  await banner(page).getByRole('button', { name: 'فعّل الكتابة' }).click();
  const dlg = page.getByRole('dialog', { name: 'فعّل الكتابة في هذه الجلسة' });
  await expect(dlg).toContainText('لا تحتاج إلى الخروج');
  await dlg.getByLabel('رمز تطبيق المصادقة').fill('123456');
  await dlg.getByRole('button', { name: 'أكّد بالرمز' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
  await expect(addSession(page)).toBeVisible();
  expect(adminCalls.find((c) => c.action === 'step-up-totp')).toMatchObject({ purpose: 'write', code: '123456' });
  // الطريقة الجديدة محفوظة مع الجلسة: التحديث لا يعيد الشريط
  await page.reload();
  await expect(addSession(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test('المدير الأعلى بجلسة تطبيق المصادقة: يكتب بلا شريط', async ({ page }) => {
  await open(page, { role: 'super_admin', method: 'totp' });
  await expect(addSession(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test('خادم لا يعرف «me» وجلسة بلا طريقة محفوظة: الحكم القديم بالدور، فلا تُحجب الكتابة عن المدير الأعلى', async ({ page }) => {
  await open(page, { role: 'super_admin', method: 'totp', me: 'unknown' });
  await expect(addSession(page)).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test('المراقب: لا كتابة ولا زر «فعّل الكتابة»', async ({ page }) => {
  await open(page, { role: 'viewer', method: 'email' });
  await expect(page.getByText('حضور اليومين التدريبيين')).toBeVisible();
  await expect(addSession(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'فعّل الكتابة' })).toHaveCount(0);
});
