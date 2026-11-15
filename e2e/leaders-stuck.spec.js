// مرافق بناء المبادرة (4د): «تحتاج توجيهًا؟» عند التعثر، و«عندي سؤال هنا» إلى مختص يعرف السياق
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

function server() {
  const calls = [];
  const sections = [
    { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed', updated_at: ago(30) },
    { id: 'm-cost', key: 'cost-plan', title: 'الموارد والتكلفة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'draft', updated_at: ago(9) },
    { id: 'm-raid', key: 'raid', title: 'سجل المخاطر', icon: '◆', dimension: 'milestone', complete: false, missing: 2, status: 'draft', updated_at: ago(20) },
  ];
  const capstone = () => ({
    success: true, initiative: 'موعد أول أقرب', scope: 'project', scope_title: 'مشروع', level: 'beginner', track: null,
    capstone: { status: 'draft', status_title: 'قيد البناء', summary: '' }, sections,
    checks: [{ key: 'cost-envelope', title: 'التكلفة مع الاحتياطي ضمن الميزانية المتاحة', ok: false, blocking: true, detail: 'التكلفة مع الاحتياطي 410,000 تتجاوز الميزانية 300,000.' }],
    readiness: 60, ready_min: 80, card: { state: 'approved', sla: 'يومي عمل' }, can_submit: false, blocker: 'فحوص لازمة', rubric: [],
  });
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', approved: true, level: 'beginner', track: { title: 'مسار' }, work_scope: 'project' },
    journey: [['profile', 'الملف الشخصي', 'admission', 'done'], ['assessment', 'تحديد المستوى', 'admission', 'done'], ['training', 'التدريب', 'qualification', 'active']]
      .map(([key, title_ar, phase, status]) => ({ key, title_ar, phase, status, items: [], done: 0, total: 0 })), progress: 80, passkeys: 1, prompt_passkey: false,
  };
  const suggest = () => ({
    success: true, requests: [], recent: [],
    roles: [{ key: 'coach', title: 'موجّه', hint: 'جلسات التوجيه' }, { key: 'specialist', title: 'خبير موضوعي', hint: 'تخصص في بُعد' }, { key: 'advisor', title: 'مستشار', hint: 'تقييم النماذج' }],
    dimensions: { milestone: 'Milestone', impact: 'Impact', leadership: 'Leadership' }, contexts: { program: 'خلال البرنامج', capstone: 'أثناء بناء المبادرة' },
    candidates: [{ id: 'e1', full_name: 'د. ريم الشهري', title: 'خبيرة إدارة مشاريع صحية', years: 12 }],
  });
  const reply = (b) => {
    calls.push(b);
    switch (b.action) {
      case 'me': return me;
      case 'capstone.get': return capstone();
      case 'experts.suggest': return suggest();
      case 'experts.choose': return { success: true, expert: 'د. ريم الشهري' };
      case 'certificate': return { success: true, certificate: null };
      default: return { success: true };
    }
  };
  return { calls, reply };
}

async function open(page, srv) {
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: srv.reply(JSON.parse(r.request().postData() || '{}')) }));
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-stuck-0000000000000000000000'); });
  await page.goto(APP);
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
}

test('فحص لازم فاشل وفصله لم يُلمس أسبوعًا: «تحتاج توجيهًا؟» بأولويته، و«ليس الآن» لا يعيده', async ({ page }) => {
  const srv = server();
  await open(page, srv);
  const card = page.getByRole('region', { name: 'تحتاج توجيهًا؟' });
  await expect(card).toHaveAttribute('data-stuck', 'check');
  await expect(card).toContainText('التكلفة مع الاحتياطي ضمن الميزانية المتاحة');
  await expect(card.getByRole('button', { name: 'افتح «الموارد والتكلفة»' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'أرني المثال' })).toBeVisible();
  await card.getByRole('button', { name: 'ليس الآن' }).click();
  // الإشارة التالية: سجل المخاطر متوقف منذ 20 يومًا
  await expect(page.getByRole('region', { name: 'تحتاج توجيهًا؟' })).toHaveAttribute('data-stuck', 'draft');
  await page.reload();
  await page.getByRole('button', { name: 'مبادرتي' }).first().click();
  await expect(page.getByRole('region', { name: 'تحتاج توجيهًا؟' })).toContainText('«سجل المخاطر» متوقف منذ 20 يومًا');
});

test('«أريد التحدث مع مختص»: نوع الحاجة يختار الدور، والوصف يحمل الفصل والفحص، ويُرسل مع السؤال', async ({ page }) => {
  const srv = server();
  await open(page, srv);
  await page.getByRole('region', { name: 'تحتاج توجيهًا؟' }).getByRole('button', { name: 'أريد التحدث مع مختص' }).click();
  const ask = page.getByRole('region', { name: 'اسأل مختصًا عن «الموارد والتكلفة»' });
  await expect(ask).toBeVisible();
  await expect.poll(() => srv.calls.filter((c) => c.action === 'experts.suggest').at(-1)).toMatchObject({ role: 'specialist', dimension: 'milestone' });
  const note = ask.getByRole('textbox');
  await expect(note).toHaveValue('فصل «الموارد والتكلفة» في وثيقة مبادرتي (التكلفة مع الاحتياطي ضمن الميزانية المتاحة). سؤالي: ');
  await ask.getByRole('radio', { name: 'علقت ولا أعرف كيف أكمل' }).click();
  await expect.poll(() => srv.calls.filter((c) => c.action === 'experts.suggest').at(-1)?.role).toBe('coach');
  await note.fill(`${await note.inputValue()}هل أقلص النطاق أم أطلب موازنة أكبر؟`);
  await ask.getByRole('button', { name: 'اختره' }).click();
  await expect.poll(() => srv.calls.find((c) => c.action === 'experts.choose')).toMatchObject({
    role: 'coach', context: 'capstone', expert_id: 'e1', note: expect.stringContaining('هل أقلص النطاق أم أطلب موازنة أكبر؟'),
  });
});

test('«اسأل مختصًا» بجانب الفحص الفاشل يفتح السؤال عن فصله', async ({ page }) => {
  await open(page, server());
  await page.locator('.cp-checks').getByRole('button', { name: 'اسأل مختصًا' }).click();
  await expect(page.getByRole('region', { name: 'اسأل مختصًا عن «الموارد والتكلفة»' })).toBeVisible();
});
