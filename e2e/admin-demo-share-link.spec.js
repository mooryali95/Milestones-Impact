// رابط تجربة حساب العرض (تصور 2026-11-19): المدير ينشئ رابطًا باسم مستلمه من بطاقة حساب العرض ويراه في القائمة ويلغيه،
// والمستلم يفتحه في منصة القادة فيدخل حساب العرض بلا رمز دخول ويرى سطر «حساب تجريبي مشترك»، والرابط الملغى أو المنتهي
// يعرض رسالته الواضحة. اللوحة (4303) والمنصة (4304) معًا، والخلفية مُحاكاة بحال واحدة يقرؤها الطرفان.
import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:4303/';
const APP = 'http://localhost:4304/';
const ago = (m) => new Date(Date.now() - m * 60e3).toISOString();
const SESSION = 'demo-session-0123456789abcdefghij';
const TRY_TOKEN = 'TRY-token-0123456789abcdefghijklmnopqrstuv';
const EXPIRED_TOKEN = 'OLD-token-0123456789abcdefghijklmnopqrstuv';

// حال الخادم المحاكى: الروابط برموزها، وما طُلب منه
function backend() {
  const s = { links: [], calls: [], opened: 0 };
  const view = (l) => ({ id: l.id, label: l.label, created_by: l.created_by, created_at: l.created_at, expires_at: l.expires_at, last_used_at: l.last_used_at, uses: l.uses, state: 'active' });
  const stage = (key, title_ar, phase, status) => ({ key, title_ar, phase, status, items: [{ id: `${key}-1`, code: key, kind: 'system', title_ar, required: true, status: status === 'done' ? 'done' : 'pending' }], done: status === 'done' ? 1 : 0, total: 1 });
  const me = (shared) => ({
    success: true, features: { hall: false, katon: false, f360: false }, ...(shared ? { demo_shared: true } : {}),
    participant: { id: 'demo', full_name: 'مشارك العرض', email: 'demo@demo.milestone-impact.org', status: 'placed', is_demo: true, consented_at: '2026-11-01T00:00:00Z' },
    profile: { full_name: 'مشارك العرض', phone: '0500000000', job_title: 'مدير إدارة المشاريع', organization_name: 'جهة العرض التوضيحي', years_experience: 8, approved: true, level: 'intermediate',
      track: { title: 'القيادة من خلال الآخرين', summary: 'ملخص', strengths: 'قوة', journey: 'رحلة' } },
    journey: [stage('profile', 'الملف الشخصي', 'admission', 'done'), stage('assessment', 'تحديد المستوى', 'admission', 'done'), stage('training', 'التدريب', 'qualification', 'active')],
    milestones: [], milestone_summary: { done: 0, total: 0 }, continuous: null, progress: 30, passkeys: 1, prompt_passkey: false,
  });
  const admin = (b) => {
    s.calls.push(b);
    switch (b.action) {
      case 'admin.demo-links': return { success: true, max: 20, links: s.links.filter((l) => !l.revoked).map(view) };
      case 'admin.demo-link-create': {
        const l = { id: `00000000-0000-4000-8000-00000000000${s.links.length + 1}`, token: TRY_TOKEN, label: String(b.label).trim(), created_by: 'a@x.com', created_at: ago(0), expires_at: new Date(Date.now() + b.days * 864e5).toISOString(), last_used_at: null, uses: 0, revoked: false };
        s.links.push(l);
        return { success: true, link: view(l), url: `${APP}#try=${l.token}` };
      }
      case 'admin.demo-link-revoke': { const l = s.links.find((x) => x.id === b.id); if (l) l.revoked = true; return { success: true, ended: 1 }; }
      case 'admin.ops-health': return { success: true, at: ago(0), mail: { key: true, cap: 80, sent: 1, codes: { sent: 1, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 } }, slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null }, alerts: { email: true, webhook: true } };
      case 'admin.health': return { success: true, readiness: [{ key: 'baseline', ok: true, where: 'assessment', label: 'القياس القبلي' }], pending_migrations: [], migrations_ledger: true, missing_secrets: [], mail: { today: 3, cap: 80 } };
      case 'admin.inbox': return { success: true, total: 0, late: 0, skipped: [], counts: {}, items: [] };
      case 'admin.overview': return { success: true, total: 10, by_status: { enrolled: 3 }, pending_reviews: 0, matrix: {}, overall: {}, top_tracks: [], tracks_used: 0 };
      case 'admin.reviews': return { success: true, pending_approval: [], submitted: [] };
      case 'admin.orgs': return { success: true, orgs: [], unassigned: {} };
      case 'admin.programs': return { success: true, programs: [], cohorts: [], organizations: [] };
      case 'admin.insight': return { success: false, message: 'لا رؤية في هذا الاختبار' };
      default: return { success: true };
    }
  };
  const leaders = (b) => {
    s.calls.push(b);
    switch (b.action) {
      case 'demo.link-open': {
        if (b.t === EXPIRED_TOKEN) return [410, { success: false, code: 'link_expired', message: 'انتهت مدة رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك' }];
        const l = s.links.find((x) => x.token === b.t);
        if (!l) return [404, { success: false, code: 'link_invalid', message: 'رابط التجربة غير صالح. تأكد من نسخه كاملًا، أو اطلب رابطًا جديدًا ممن أرسله لك' }];
        if (l.revoked) return [410, { success: false, code: 'link_revoked', message: 'أُلغي رابط التجربة هذا. اطلب رابطًا جديدًا ممن أرسله لك' }];
        l.uses += 1; l.last_used_at = ago(0); s.opened += 1;
        return [200, { ...me(true), token: SESSION }];
      }
      case 'me': return b.token === SESSION ? [200, me(true)] : [401, { success: false, code: 'session', message: 'الجلسة منتهية، سجّل الدخول من جديد' }];
      case 'lab.list': return [200, { success: true, items: [], points: 0 }];
      case 'certificate': return [200, { success: true, certificate: null }];
      default: return [200, { success: true }];
    }
  };
  return { s, admin, leaders };
}

async function route(page, be) {
  await page.route(/functions\/v1\/admin-api/, (r) => r.fulfill({ json: { success: true, contacts: [] } }));
  await page.route(/functions\/v1\/leaders-api/, async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (String(b.action).startsWith('admin.')) return r.fulfill({ json: be.admin(b) });
    const [status, json] = be.leaders(b);
    return r.fulfill({ status, json });
  });
}

async function openDemoCard(page) {
  await page.goto(ADMIN);
  await page.evaluate(() => {
    sessionStorage.clear();
    sessionStorage.setItem('mi_admin_v3', JSON.stringify({ token: 't', user: { name: 'هند', email: 'a@x.com', role_id: 'super_admin' }, ts: Date.now() }));
  });
  await page.goto(`${ADMIN}#/leaders/overview`);
  await page.reload();
  const toggle = page.getByRole('region', { name: 'صحة المنظومة', exact: true }).locator('#th-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const panel = page.getByTestId('demo-links');
  await expect(panel).toBeVisible();
  return panel;
}

test('رابط التجربة: المدير ينشئه ويراه ويلغيه، والمستلم يدخل به حساب العرض ويرى أنه تجريبي، والملغى والمنتهي برسالتهما', async ({ page, browser }) => {
  const be = backend();
  await route(page, be);
  const panel = await openDemoCard(page);

  // البطاقة تقول إن الحساب واحد مشترك، والقائمة فارغة، والمدة 7 أيام افتراضًا من خيارات قليلة
  await expect(panel).toContainText('الحساب واحد مشترك الآن');
  await expect(panel).toContainText('لا روابط نشطة.');
  const days = panel.getByLabel('يصلح');
  await expect(days).toHaveValue('7');
  await expect(days.locator('option')).toHaveText(['يوم واحد', '3 أيام', '7 أيام', '14 يومًا', '30 يومًا']);
  const create = panel.getByRole('button', { name: 'أنشئ الرابط' });
  await expect(create).toBeDisabled();

  // الإنشاء: الاسم والمدة يصلان الخادم، والرابط يُعرض مرة واحدة للنسخ، ويظهر في القائمة باسمه ومن أنشأه وانتهائه
  await panel.getByLabel('لمن الرابط؟').fill('مدير الدفعة');
  await create.click();
  const fresh = panel.locator('.demo-links-fresh');
  await expect(fresh).toContainText('رابط «مدير الدفعة» جاهز. انسخه الآن: لا يُعرض مرة أخرى.');
  const url = await fresh.getByLabel('رابط التجربة').inputValue();
  expect(url).toBe(`${APP}#try=${TRY_TOKEN}`);
  expect(be.s.calls.find((c) => c.action === 'admin.demo-link-create')).toMatchObject({ label: 'مدير الدفعة', days: 7 });
  const list = panel.getByRole('list', { name: 'الروابط النشطة' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('مدير الدفعة');
  await expect(list).toContainText('a@x.com');
  await expect(list).toContainText('ينتهي');
  await expect(list).toContainText('لم يُستعمل بعد');
  await expect(panel.getByLabel('لمن الرابط؟')).toHaveValue('');
  // القائمة لا تحمل الرمز: يُعرض في صندوق النسخ وحده
  await expect(list).not.toContainText(TRY_TOKEN);

  // المستلم في متصفح آخر: يفتح الرابط فيدخل حساب العرض بلا رمز دخول، والرمز يزول من العنوان، وسطر «حساب تجريبي مشترك» ثابت
  const guestCtx = await browser.newContext({ locale: 'ar-SA' });
  const guest = await guestCtx.newPage();
  await guest.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
  await route(guest, be);
  await guest.goto(url);
  const bar = guest.getByTestId('demo-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId('demo-badge')).toHaveText('حساب تجريبي');
  await expect(bar).toContainText('ما تفعله هنا لا يُحسب، وقد يراه غيرك ممن يجرّب.');
  await expect(guest.getByRole('button', { name: /ملفي: مشارك العرض/ })).toBeVisible();
  expect(new URL(guest.url()).hash).toBe('');
  expect(be.s.calls.filter((c) => c.action === 'demo.link-open').map((c) => c.t)).toEqual([TRY_TOKEN]);
  // لا رمز دخول ولا شاشة دخول في الطريق
  expect(be.s.calls.some((c) => ['auth.start', 'auth.verify'].includes(c.action))).toBe(false);
  // بعد إعادة التحميل تبقى الجلسة وسطرها (من me)، ولا يُفتح الرابط ثانية
  await guest.reload();
  await expect(bar).toBeVisible();
  expect(be.s.opened).toBe(1);

  // الرابط نفسه على جهاز فيه جلسة قائمة: لا يستبدلها بصمت، يُسأل صاحبها أولًا، و«ابقَ في حسابي» يتركها ولا يفتح الرابط
  await guest.goto(url);
  const ask = guest.getByTestId('try-ask');
  await expect(ask).toContainText('على هذا الجهاز جلسة قائمة. فتح الرابط يخرجك منها ويدخلك حسابًا تجريبيًا مشتركًا.');
  expect(new URL(guest.url()).hash).toBe('');
  await ask.getByRole('button', { name: 'ابقَ في حسابي' }).click();
  await expect(ask).toBeHidden();
  await expect(guest.getByRole('button', { name: /ملفي: مشارك العرض/ })).toBeVisible();
  expect(be.s.opened).toBe(1);
  // و«افتح الحساب التجريبي» يفتحه
  await guest.goto(url);
  await guest.getByTestId('try-ask').getByRole('button', { name: 'افتح الحساب التجريبي' }).click();
  await expect(bar).toBeVisible();
  expect(be.s.opened).toBe(2);

  // اللوحة بعد الاستعمال: آخر استعمال يظهر، وإعادة الضبط تسمّي الرابط النشط قبل التأكيد
  await page.reload();
  const panel2 = page.getByTestId('demo-links');
  if ((await page.locator('#th-toggle').getAttribute('aria-expanded')) !== 'true') await page.locator('#th-toggle').click();
  await expect(panel2.getByRole('list', { name: 'الروابط النشطة' })).toContainText('آخر استعمال');
  await page.getByRole('button', { name: 'أعِده إلى البداية' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('الحساب واحد مشترك، فتنتهي الآن تجربة من يستعمل الرابط النشط: «مدير الدفعة»');
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  expect(be.s.calls.some((c) => c.action === 'admin.demo-reset')).toBe(false);

  // الإلغاء: بتأكيد يسمّي الرابط، ثم يخرج من القائمة
  await panel2.getByRole('button', { name: 'ألغِ رابط مدير الدفعة' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('إلغاء رابط «مدير الدفعة»؟ يتوقف الرابط الآن، وتنتهي تجربة من يستعمله.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(panel2).toContainText('لا روابط نشطة.');
  expect(be.s.calls.find((c) => c.action === 'admin.demo-link-revoke')).toMatchObject({ id: be.s.links[0].id });

  // من يفتح الرابط الملغى: رسالة واضحة لا شاشة خطأ، ومنها إلى صفحة الدخول
  const lateCtx = await browser.newContext({ locale: 'ar-SA' });
  const late = await lateCtx.newPage();
  await route(late, be);
  await late.goto(url);
  const gone = late.getByTestId('try-gone');
  await expect(gone.getByRole('heading', { name: 'أُلغي رابط التجربة' })).toBeVisible();
  await expect(gone).toContainText('اطلب رابطًا جديدًا ممن أرسله لك.');
  await expect(late.getByRole('alert')).toHaveCount(0);
  expect(new URL(late.url()).hash).toBe('');
  await gone.getByRole('button', { name: 'افتح صفحة الدخول' }).click();
  await expect(gone).toBeHidden();
  await expect(late.getByTestId('demo-bar')).toHaveCount(0);

  // والمنتهي والخاطئ كذلك، كل بعنوانه
  // رابط يُلصق في الصفحة المفتوحة نفسها (تغيّر جزء الرابط وحده) يُلتقط بلا إعادة تحميل
  await late.goto(`${APP}#try=${EXPIRED_TOKEN}`);
  await expect(late.getByTestId('try-gone').getByRole('heading', { name: 'انتهت مدة رابط التجربة' })).toBeVisible();
  await late.goto(`${APP}#try=WRONG-token-0123456789abcdefghijklmnop`);
  await expect(late.getByTestId('try-gone').getByRole('heading', { name: 'رابط التجربة غير صالح' })).toBeVisible();
  await guestCtx.close();
  await lateCtx.close();
});
