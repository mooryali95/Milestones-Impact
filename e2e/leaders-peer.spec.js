// طلبات التوجيه للمشارك (المرحلة 8): يرفع طلبًا لفريقه، ويجيب عن طلب زميل، ويرى تأكيد الخبير.
// الخلفية مُحاكاة بحالة تتقدم مع كل خطوة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';

test('المشارك يرفع طلب توجيه ويجيب عن طلب زميله', async ({ page }) => {
  const s = { mine: [], answered: false };
  const calls = [];
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled' },
    profile: { full_name: 'سارة الأحمد', phone: '0500000000', job_title: 'مديرة', organization_name: 'جهة', years_experience: 8, approved: true, level: 'intermediate', track: { title: 'مسار' } },
    journey: ['profile', 'assessment'].map((key) => ({ key, title_ar: key, phase: 'admission', status: 'done', items: [], done: 0, total: 0 })), progress: 30, passkeys: 1, prompt_passkey: false,
  };
  const peer = () => ({
    success: true, supervision: 'peers_expert', supervision_ar: 'الأقران يجيبون ويؤكّد الخبير', team: 'guide', team_ar: 'فريق التوجيه',
    teams: { support: 'فريق الدعم', lead: 'فريق القيادة', guide: 'فريق التوجيه', eval: 'فريق التقييم' }, advisor: 'سارة', mine_open: s.mine.length,
    items: [
      ...s.mine.map((t, i) => ({ id: `m${i}`, text: t, source: 'free', source_ar: 'سؤال حر', target_team: 'eval', target_team_ar: 'فريق التقييم', status: 'open', status_ar: 'بانتظار إجابة', at: '2026-11-04T10:00:00Z', participant_id: 'p1', author: 'سارة الأحمد', mine: true, can_answer: false, answer_block: 'لا تجيب عن طلبك', answers: [] })),
      { id: 'q9', text: 'ما الفرق بين المخرج والمنفعة في سجل المنافع؟', source: 'sentence', source_ar: 'جملة في «كاتون»', target_team: 'guide', target_team_ar: 'فريق التوجيه', status: s.answered ? 'answered' : 'open', status_ar: s.answered ? 'أُجيب، بانتظار تأكيد الخبير' : 'بانتظار إجابة', at: '2026-11-03T10:00:00Z', participant_id: 'p2', author: 'خالد العتيبي', mine: false, can_answer: !s.answered, answer_block: null,
        answers: s.answered ? [{ id: 'a1', text: 'المخرج ما يسلّمه المشروع، والمنفعة ما يتغير بعده عند المستفيد.', status: 'pending', status_ar: 'بانتظار تأكيد الخبير', expert_note: null, at: '2026-11-04T11:00:00Z', author: 'سارة الأحمد', by_expert: false, mine: true }] : [] },
      { id: 'q8', text: 'كيف أقنع الراعي بتمويل المرحلة الثانية؟', source: 'free', source_ar: 'سؤال حر', target_team: null, target_team_ar: 'الجميع', status: 'confirmed', status_ar: 'أكّده الخبير', at: '2026-11-01T10:00:00Z', participant_id: 'p3', author: 'نورة السالم', mine: false, can_answer: false, answer_block: null,
        answers: [{ id: 'a0', text: 'اعرض عليه منفعة مقيسة من المرحلة الأولى قبل أي طلب.', status: 'confirmed', status_ar: 'أكّده الخبير', expert_note: null, at: '2026-11-02T10:00:00Z', author: 'عمر الزهراني', by_expert: false, mine: false }] },
    ],
  });
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    calls.push(b);
    const r = {
      me,
      'peer.list': peer,
      'peer.ask': () => { s.mine.push(b.text); return peer(); },
      'peer.answer': () => { s.answered = true; return peer(); },
      'experts.suggest': () => ({ success: true, role: 'coach', roles: [], contexts: {}, dimensions: {}, requests: [], candidates: [] }),
    }[b.action];
    await route.fulfill({ json: typeof r === 'function' ? r() : r || { success: true, items: [] } });
  });
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-peer-0000000000000000000000'); });
  await page.goto(APP);
  const card = page.getByRole('region', { name: 'طلبات التوجيه' });
  await expect(card).toContainText('الأقران يجيبون ويؤكّد الخبير');
  await expect(card).toContainText('أنت في فريق التوجيه');
  // سجل النشاط: ما أكّده الخبير يظهر للجميع باسم صاحبه
  await expect(card).toContainText('عمر الزهراني');
  await expect(card).toContainText('أكّده الخبير');

  // رفع طلب لفريق التقييم
  await card.getByRole('button', { name: 'اطلب توجيهًا' }).click();
  await expect(card.getByRole('button', { name: 'أرسل الطلب' })).toBeDisabled();
  await card.getByLabel(/سؤالك أو الجزء/).fill('أريد مراجعة معايير بوابة المرحلة الثانية قبل عرضها.');
  await card.getByLabel('لمن').selectOption('eval');
  await card.getByRole('button', { name: 'أرسل الطلب' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'peer.ask')).toMatchObject({ target_team: 'eval', source: 'free' });
  await expect(card.getByRole('list', { name: 'طلباتي' })).toContainText('معايير بوابة المرحلة الثانية');
  await expect(card).toContainText('وصل طلبك إلى فريقك');

  // الإجابة عن طلب زميل من الفريق المستهدف
  const q = card.getByRole('list', { name: 'طلبات زملائي' }).locator('li', { hasText: 'خالد العتيبي' });
  await q.getByLabel(/إجابتك عن طلب/).fill('المخرج ما يسلّمه المشروع، والمنفعة ما يتغير بعده عند المستفيد.');
  await q.getByRole('button', { name: 'أجب' }).click();
  await expect.poll(() => calls.find((c) => c.action === 'peer.answer')).toMatchObject({ request_id: 'q9' });
  await expect(q).toContainText('بانتظار تأكيد الخبير');
  await expect(q.getByRole('button', { name: 'أجب' })).toHaveCount(0);
});
