// فصل خدمة الرحلة عن لجان الكتاب (المرحلة 1، اعتمده المالك 2026-11-15): عضو لجنة المحتوى بلا دور يُعتمد من ملفه،
// ولا تُعرض في ملفه حقول المطابقة ولا خدمات الرحلة. الخلفية مُحاكاة، والاعتماد يرد بقاعدة الخادم نفسها (approvalBlock).
import { test, expect } from '@playwright/test';
import { approvalBlock } from '../supabase/functions/leaders-api/committees.js';

const SHOTS = process.env.EXPERTS_SHOTS;
const reviewer = { id: 'rv', full_name: 'د. هند الشمري', email: 'h@x.com', title: 'محكّمة مناهج', roles: [], committees: ['content'], dimensions: [], levels: [], sectors: [], languages: ['ar'],
  weekly_hours: null, status: 'invited', source: 'admin', created_at: '2026-11-14', updated_at: '2026-11-14' };
const coach = { id: 'co', full_name: 'سالم الدوسري', email: 's@x.com', title: 'موجّه', roles: ['coach'], committees: ['content'], dimensions: ['impact'], levels: ['beginner'], sectors: [], languages: ['ar'],
  weekly_hours: 4, status: 'active', source: 'admin', created_at: '2026-10-01', updated_at: '2026-10-01' };

async function admin(page) {
  const db = { rv: { ...reviewer }, co: { ...coach } };
  const calls = [];
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    let r;
    if (b.action === 'admin.experts') r = { success: true, experts: Object.values(db) };
    else if (b.action === 'admin.expert') r = { success: true, expert: db[b.id], activity: [], service: { sessions: 0, attended: 0, no_show: 0, upcoming: 0, participants: 0, hours: 0, cost: null, reviews: {}, recent: [] }, ratings: { summary: { count: 0 }, criteria: {}, comments: [] } };
    else if (b.action === 'admin.expert-save') { Object.assign(db[b.id], { ...b, sectors: [], weekly_hours: null }); delete db[b.id].action; r = { success: true, expert: db[b.id] }; }
    else if (b.action === 'admin.expert-set-status') {
      const why = b.status === 'active' ? approvalBlock(db[b.id]) : null;
      if (!why) db[b.id] = { ...db[b.id], status: b.status, updated_at: '2026-11-15' };
      r = why ? { success: false, message: why } : { success: true, expert: db[b.id] };
    } else r = { 'admin.orgs': { success: true, orgs: [], unassigned: { total: 0, typed: [] } }, 'admin.participants': { success: true, participants: [] }, 'admin.expert-requests': { success: true, requests: [] } }[b.action];
    await route.fulfill({ json: r ?? { success: false, message: 'غير متوقع' } });
  });
  await page.goto('http://localhost:4303/');
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مدير', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.locator('.la-tabs').getByRole('button', { name: 'الخبراء' }).click();
  return { calls, db };
}

test('عضو لجنة المحتوى بلا دور: شارة في الشبكة، وملف بلا حقول المطابقة، واعتماد بعد الإطار', async ({ browser }) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1360, height: 1100 }, locale: 'ar-SA' });
  const page = await ctx.newPage();
  const { calls, db } = await admin(page);
  const rows = page.locator('.ex-table tbody tr');
  await expect(rows.filter({ hasText: 'د. هند الشمري' })).toContainText('عضو لجنة، لا يخدم في الرحلة');
  // من جمع الخدمتين يحمل شارته
  await expect(rows.filter({ hasText: 'سالم الدوسري' })).toContainText('يخدم أيضًا في لجنة المحتوى');

  await rows.filter({ hasText: 'د. هند الشمري' }).click();
  const profile = page.locator('.ex-profile');
  await expect(profile.getByRole('heading', { name: 'د. هند الشمري' })).toBeVisible();
  await expect(profile).toContainText('عضو لجنة المحتوى، يقرأ الكتاب الأم ولا يخدم في الرحلة');
  // تقليل البيانات: لا أدوار ولا مستويات ولا قطاع ولا ساعات ولا سعر، ولا سجل خدمات ولا تقييم ولا تكليفات
  await expect(profile.getByLabel('يخدم في رحلة المشاركين')).not.toBeChecked();
  await expect(profile.getByText('المستويات التي يخدمها')).toHaveCount(0);
  await expect(profile.getByLabel('سعر الساعة (ريال)')).toHaveCount(0);
  await expect(profile.getByLabel('الساعات المتاحة أسبوعيًا')).toHaveCount(0);
  await expect(profile.getByLabel('القطاعات')).toHaveCount(0);
  await expect(profile.locator('.ex-service, .ex-ratings, .ex-assign')).toHaveCount(0);
  await expect(profile.getByText('الإطار الذي يراجعه')).toBeVisible();

  // بلا إطار: يرد الخادم بشرط لجنة المحتوى
  await profile.getByRole('button', { name: 'اعتماد' }).click();
  await expect(page.getByText('عضو لجنة المحتوى يحتاج إطارًا واحدًا على الأقل')).toBeVisible();
  expect(db.rv.status).toBe('invited');
  // الإطار ثم الحفظ ثم الاعتماد، بلا أي دور
  await profile.locator('.ex-tg', { hasText: 'تحويل المشروع إلى أثر' }).click();
  await profile.getByRole('button', { name: 'حفظ الملف' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.expert-save')).toMatchObject({ id: 'rv', roles: [], levels: [], committees: ['content'], dimensions: ['impact'], hourly_rate: '', weekly_hours: '' });
  await profile.getByRole('button', { name: 'اعتماد' }).click();
  await expect(profile.locator('.ex-side')).toContainText('نشط');
  expect(db.rv.status).toBe('active');
  expect(db.rv.roles).toEqual([]);
  if (SHOTS) await profile.screenshot({ path: `${SHOTS}/admin-expert-committee-only.png` });
  await ctx.close();
});

test('خبير بلا دور ولا لجنة لا يُعتمد، ويُقال السبب', async ({ page }) => {
  const { db } = await admin(page);
  db.rv.committees = [];
  await page.locator('.ex-table tbody tr').filter({ hasText: 'د. هند الشمري' }).click();
  await page.getByRole('button', { name: 'اعتماد' }).click();
  await expect(page.getByText('حدّد دورًا في الرحلة أو عضوية في لجنة قبل الاعتماد')).toBeVisible();
});
