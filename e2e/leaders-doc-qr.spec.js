// المرحلة 33: قرار رمز التحقق. مفتاح القائد في وثيقته المعتمدة ومعطل بقرار فريق البرنامج، وخيارات الأدمن الثلاث،
// وصفحة التحقق المحجوبة بلا اسم المبادرة ولا الجهة. الخلفية مُحاكاة
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ADMIN = 'http://localhost:4303/';
const SHOTS = process.env.P33_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/p33-${name}.png`, fullPage: true }) : null);

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 100, passkeys: 1, prompt_passkey: false,
};
function leaderServer(qr_state) {
  const calls = [];
  const capstone = () => ({
    success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع',
    track: { title: 'مسار التنفيذ المؤثر', priority: 'milestone' },
    capstone: { status: 'approved', status_title: 'معتمدة', summary: 'ملخص', approved_at: '2026-11-20T10:00:00Z', review: null, sponsor: null },
    sections: [
      { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' },
      { id: 'm-benefits', key: 'benefits-register', title: 'سجل المنافع', icon: '◆', dimension: 'impact', complete: true, missing: 0, status: 'reviewed' },
    ], checks: [], readiness: 100, ready_min: 80, card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, rubric: [], qr_state,
  });
  const reply = (b) => {
    calls.push(b);
    if (b.action === 'me') return me;
    if (b.action === 'capstone.get') return capstone();
    if (b.action === 'capstone.options') { qr_state = { ...qr_state, qr: b.qr, owner: b.qr, source: 'owner' }; return { success: true, qr_state }; }
    if (b.action === 'certificate') return { success: true, certificate: null };
    if (b.action === 'tracking.get') return { success: false, message: '' };
    return { success: true };
  };
  return { calls, reply };
}
async function openLeader(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-capstone-0000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('القائد: يمنع الرمز من وثيقته المعتمدة بمفتاح وسطر يشرح ما يُرى', async ({ page }) => {
  const srv = leaderServer({ qr: true, source: 'default', forced: false, owner: null, available: true });
  await openLeader(page, srv);
  const sw = page.getByRole('checkbox', { name: /إظهار رمز التحقق في وثيقتي المعتمدة/ });
  await expect(sw).toBeChecked();
  await expect(page.getByText(/من يمسح الرمز يرى أن الوثيقة أصلية/)).toBeVisible();
  await shot(page, 'leader-on');
  await page.locator('.cp-qr .sh-toggle').click();
  await expect.poll(() => srv.calls.find((c) => c.action === 'capstone.options')).toMatchObject({ qr: false });
  await expect(sw).not.toBeChecked();
  await expect(page.getByText(/لا يُطبع الرمز ولا الرابط/)).toBeVisible();
});

test('القائد: المفتاح معطل بسطر «قرار فريق البرنامج» حين يفرض الأدمن', async ({ page }) => {
  const srv = leaderServer({ qr: true, source: 'admin', forced: true, owner: false, available: true });
  await openLeader(page, srv);
  await expect(page.getByRole('checkbox', { name: /إظهار رمز التحقق/ })).toBeDisabled();
  await expect(page.locator('.cp-qr').getByText('قرار فريق البرنامج')).toBeVisible();
  await page.locator('.cp-qr').scrollIntoViewIfNeeded();
  await shot(page, 'leader-forced');
});

test('الأدمن: ثلاثة خيارات، والمنع بسبب يُرسل admin.capstone-options', async ({ page }) => {
  const calls = [];
  let q = { qr: true, source: 'owner', forced: false, owner: true, available: true, choice: 'follow', admin: null };
  const doc = { meta: { initiative: 'رقمنة خدمات المستفيدين', status: 'approved', participant: { name: 'سارة الأحمد' }, org: { name: 'جهة التجربة' }, scope_title: 'مشروع', track: { title: 'مسار التنفيذ المؤثر' } }, sections: [], tracking: null };
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    if (b.action === 'admin.capstone-options') {
      q = { ...q, qr: b.qr === 'follow' ? q.owner !== false : b.qr === 'show', source: b.qr === 'follow' ? 'owner' : 'admin', forced: b.qr !== 'follow', choice: b.qr, admin: b.qr === 'follow' ? null : { qr: b.qr === 'show', by: 'a@x', at: '2026-11-26T10:00:00Z', reason: b.reason || null } };
      return route.fulfill({ json: { success: true } });
    }
    const replies = {
      'admin.orgs': { success: true, orgs: [], unassigned: {} },
      'admin.capstones': { success: true, items: [] },
      'admin.capstone': { success: true, doc, capstone: { status: 'approved', revisions: 0, score: 90 }, readiness: 100, sections: [], checks: [], leader: null, max_revisions: 1, priority: 'milestone', rubric: [], qr_state: q },
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.goto(ADMIN);
  await page.evaluate(() => sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'مستشار', email: 'a@x', role_id: 'admin' }, ts: Date.now() })));
  await page.reload();
  await page.getByRole('button', { name: 'تطبيق القادة' }).click();
  await page.evaluate(() => { location.hash = '#/leaders/capstones/p1'; });
  const group = page.getByRole('radiogroup', { name: 'رمز التحقق في الوثيقة' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio', { name: 'يتبع صاحبها' })).toBeChecked();
  await group.getByRole('radio', { name: 'منع' }).check();
  await page.getByRole('textbox', { name: 'السبب (اختياري)' }).fill('طلب الجهة');
  await page.locator('.cps-qr').getByRole('button', { name: 'حفظ' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'admin.capstone-options')).toMatchObject({ participant_id: 'p1', qr: 'withhold', reason: 'طلب الجهة' });
  await expect(page.getByText('الرمز محجوب الآن', { exact: false })).toBeVisible();
  await page.locator('.cps-qr').scrollIntoViewIfNeeded();
  await shot(page, 'admin-withhold');
});

test('التحقق المحجوب: وثيقة صحيحة بلا اسم المبادرة ولا الجهة', async ({ page }) => {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: true, found: true, authentic: true, withheld: true, document: { fingerprint: '1A2B-3C4D-5E6F-7A8B', issuer: 'Milestone Impact' } } }));
  await page.goto(`${APP}v/doc/1A2B-3C4D-5E6F-7A8B`);
  await expect(page.getByText('وثيقة صحيحة صادرة عن Milestone Impact، وتفاصيلها محجوبة بقرار صاحبها')).toBeVisible();
  await expect(page.getByText('1A2B-3C4D-5E6F-7A8B')).toBeVisible();
  await expect(page.getByText('الجهة', { exact: true })).toHaveCount(0);
  await shot(page, 'verify-withheld');
});
