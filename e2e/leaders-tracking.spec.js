// متابعة المبادرة بعد اعتمادها: مراجعة الأثر التي اعترض عليها الراعي أو لم يعد رابطه صالحًا
// تعود إلى القائد في أي شهر ليصححها ويرسلها من جديد. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const D90 = 'مراجعة الأثر بعد 90 يومًا';
const NOTE = 'رضا المستفيد في تقرير الجهة 68 لا 75';

const me = {
  success: true,
  participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
  profile: { full_name: 'سارة الأحمد', approved: true, level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' }, work_scope: 'project' },
  journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
    .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
};
const capstone = {
  success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'project', scope_title: 'مشروع', level: 'intermediate', track: { title: 'مسار التنفيذ المؤثر' },
  capstone: { status: 'approved', status_title: 'معتمدة', summary: '' }, sections: [], checks: [], readiness: 100, ready_min: 80, card: { state: 'approved' }, rubric: [],
};

// مراجعة 90 يومًا أُرسلت في الشهر الماضي، وحالتها عند الراعي verify
function tracking(verify) {
  const now = new Date();
  const current = now.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
  const titles = { disputed: 'اعترض الراعي', expired: 'تحتاج إعادة إرسال إلى الراعي' };
  return {
    summary: {
      day: 120, active: true, current, health: 'green', health_title: 'على المسار',
      milestones: { total: 1, done: 0, due: 0, late: 0, at_risk: 0, on_time: null }, benefits: { total: 1, measured: 1, realization: 75 },
      updates: 1, last_at: null, due: { update: true, checkpoint: 'd90', resubmit: true }, can_update: true,
      checkpoints: [
        { key: 'd90', day: 90, title: D90, status: verify === 'disputed' ? 'disputed' : 'submitted', resubmit: true, verify, verify_title: titles[verify], period: last },
        { key: 'd180', day: 180, title: 'مراجعة الختام بعد 180 يومًا', status: 'upcoming', resubmit: false, verify: null, verify_title: null, period: null },
      ],
    },
    plan: { start: null, end: null },
    state: {
      milestones: [{ key: 'm0', title: 'الإطلاق', due: '2027-01-01', status: 'on_track' }],
      benefits: [{ key: 'b0', title: 'رضا المستفيد', indicator: 'نسبة الرضا', baseline: '60', target: '80', numeric: true, value: '75', realization: 0.75 }],
    },
    updates: [{
      id: 'u-d90', period: last, checkpoint: 'd90', checkpoint_title: D90, milestones: { m0: { status: 'on_track' } }, benefits: { b0: { value: '75' } },
      narrative: 'ارتفع رضا المستفيدين بعد إطلاق الخدمة الرقمية، والدليل استبيان الجهة الشهري', blockers: null, support: null,
      verify: { status: verify, title: titles[verify], name: 'خالد', note: verify === 'disputed' ? NOTE : null, at: null },
    }],
    statuses: { on_track: 'في موعده', at_risk: 'معرّض للتأخر', late: 'متأخر', done: 'تحقق', dropped: 'أُلغي بقرار' },
    health: { green: 'على المسار' },
    checkpoints: [{ key: 'd90', day: 90, title: D90 }, { key: 'd180', day: 180, title: 'مراجعة الختام بعد 180 يومًا' }],
  };
}

async function open(page, verify, saveReply) {
  const calls = [];
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const replies = {
      me, certificate: { success: true, certificate: null }, 'capstone.get': capstone,
      'tracking.get': { success: true, tracking: tracking(verify), current: null },
      'tracking.save': saveReply,
    };
    await route.fulfill({ json: replies[b.action] ?? { success: true } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-tracking-000000000000000'); });
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
  await expect(page.getByRole('heading', { name: 'متابعة التنفيذ والأثر' })).toBeVisible();
  return calls;
}

test('اعتراض الراعي في شهر سابق: يظهر سببه، وتُصحَّح المراجعة نفسها وتُرسل من جديد بتأكيد', async ({ page }) => {
  const calls = await open(page, 'disputed', { success: true, tracking: tracking('disputed'), current: null, invited: true, mail_failed: false });
  await expect(page.locator('.alert.err')).toContainText(`اعترض الراعي على أرقام «${D90}»: «${NOTE}»`);
  // تحديث الشهر الجاري يبقى متاحًا دون أن يحجبه الاعتراض
  await expect(page.getByRole('button', { name: /^حدّث متابعة / })).toBeVisible();
  await page.getByRole('button', { name: `أعد إرسال ${D90}` }).click();
  await expect(page.locator('.tr-form .alert.info')).toContainText(`${D90}: اكتب القيمة الحالية لكل منفعة`);
  // النموذج من صف المراجعة نفسها لا من الشهر الجاري
  await expect(page.getByRole('textbox', { name: 'القيمة الحالية لـرضا المستفيد' })).toHaveValue('75');
  await page.getByRole('textbox', { name: 'القيمة الحالية لـرضا المستفيد' }).fill('68');
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.accept(); });
  await page.getByRole('button', { name: 'أرسل المراجعة للراعي' }).click();
  await expect(page.getByText('أُرسلت المراجعة، ووصل الراعي رابط تأكيد الأرقام.')).toBeVisible();
  expect(asked).toContain(`تُرسل «${D90}» إلى راعي المبادرة`);
  const sent = calls.find((c) => c.action === 'tracking.save');
  expect(sent).toMatchObject({ checkpoint: true, benefits: { b0: { value: '68' } } });
  expect(sent.narrative).toContain('استبيان الجهة');
});

test('رابط الراعي لم يعد صالحًا: يُعاد الإرسال، وتعذّر البريد لا يُعلن وصول الرابط', async ({ page }) => {
  const calls = await open(page, 'expired', { success: true, tracking: tracking('expired'), current: null, invited: false, mail_failed: true });
  await expect(page.locator('.alert.info').first()).toContainText(`لم يؤكد الراعي أرقام «${D90}»، ورابطه لم يعد صالحًا`);
  await page.getByRole('button', { name: `أعد إرسال ${D90}` }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'أرسل المراجعة للراعي' }).click();
  await expect(page.locator('.alert.err')).toContainText('تعذّر إرسال الرابط إلى الراعي');
  await expect(page.getByText('ووصل الراعي رابط')).toHaveCount(0);
  expect(calls.find((c) => c.action === 'tracking.save')).toMatchObject({ checkpoint: true });
});

test('تحديث الشهر الجاري والمراجعة معادة من شهر سابق: تحديث عادي بلا تأكيد ولا تلميح المراجعة', async ({ page }) => {
  const calls = await open(page, 'disputed', { success: true, tracking: tracking('disputed'), current: null, invited: false, mail_failed: false });
  await page.getByRole('button', { name: /^حدّث متابعة / }).click();
  await expect(page.locator('.tr-form .alert.info')).toHaveCount(0);
  await expect(page.getByText('ما جرى هذا الشهر')).toBeVisible();
  await page.getByRole('textbox', { name: 'ما جرى هذا الشهر' }).fill('بدأ تدريب الفرق على الخدمة');
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs += 1; d.accept(); });
  await page.getByRole('button', { name: 'احفظ التحديث' }).click();
  await expect(page.getByText('حُفظ تحديث هذا الشهر.')).toBeVisible();
  expect(dialogs).toBe(0);
  expect(calls.find((c) => c.action === 'tracking.save')).toMatchObject({ checkpoint: false, narrative: 'بدأ تدريب الفرق على الخدمة' });
});
