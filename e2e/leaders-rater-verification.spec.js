// D19 وسطور D18: سطر الموافقة عند أول دخول لبوابتي الخبير والمنسق، وتأكيد مقيّم منتظر من كل منهما،
// والمشارك يرى انتظار دعوته وسببه. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';
const awaiting = [{ id: 'r1', participant_id: 'p1', participant: 'سارة الأحمد', email: 'boss@gmail.com', full_name: 'خالد', relation_ar: 'المدير المباشر', phase: 'pre', invited_at: '2026-11-07T08:00:00Z', flags_ar: ['بريد عام'] }];

test('الخبير: سطر الموافقة أولًا، ثم يؤكد مقيّمًا منتظرًا فتُرسل دعوته', async ({ page }) => {
  const sent = [];
  const state = { consent: true, pending: [...awaiting] };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    const dash = () => ({ success: true, consent_needed: state.consent, expert: { full_name: 'د. سارة الحربي', title: 'مستشارة', roles: ['advisor'] }, stats: { hours: 0, participants: 1, attended: 0, upcoming: 0, no_show: 0 }, rating: { count: 0, min: 5 }, requests: [], sessions: [], criteria: {}, advisor_cohorts: [] });
    if (b.action === 'xp.consent') state.consent = false;
    if (b.action === 'xp.rater-confirm') state.pending = [];
    const r = {
      'xp.dashboard': dash(), 'xp.consent': dash(),
      'xp.participants': { success: true, items: [], cohorts: [], raters_pending: state.pending },
      'xp.reviews': { success: true, advisor: true, items: [] },
      'xp.peer-list': { success: true, advisor: false, cohorts: [], items: [], pending: 0 },
      'xp.rater-confirm': { success: true, decision: 'confirm' },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_expert_session', t), 'x'.repeat(40));
  await page.goto(APP + 'x');
  await expect(page.getByRole('heading', { name: 'بيانات المشاركين أمانة' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toHaveCount(0);
  await page.getByRole('button', { name: 'أوافق وأتابع' }).click();
  await expect(page.getByRole('heading', { name: 'أهلًا د. سارة الحربي' })).toBeVisible();
  const box = page.getByRole('region', { name: /مقيّمون بانتظار تأكيدك/ });
  await expect(box).toContainText('boss@gmail.com');
  await expect(box).toContainText('بريد عام');
  await box.getByRole('button', { name: 'أكّد وأرسل الدعوة' }).click();
  await expect(page.getByRole('region', { name: /مقيّمون بانتظار تأكيدك/ })).toHaveCount(0);
  expect(sent.find((x) => x.action === 'xp.rater-confirm')).toMatchObject({ id: 'r1', decision: 'confirm' });
  expect(sent.some((x) => x.action === 'xp.consent')).toBe(true);
});

test('المنسق: سطر الموافقة أولًا، ثم لا يعتمد مقيّمًا بسبب مكتوب', async ({ page }) => {
  const sent = [];
  const state = { consent: true, pending: [...awaiting] };
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    sent.push(b);
    if (b.action === 'coord.consent') state.consent = false;
    if (b.action === 'coord.rater-confirm') state.pending = [];
    const me = { success: true, consent_needed: state.consent, coordinator: { full_name: 'منسقة' }, org: { name: 'وزارة التجربة' } };
    const r = {
      'coord.me': me, 'coord.consent': me,
      'coord.dashboard': { success: true, org: { name: 'وزارة التجربة', seats: null }, permissions: { list: true, scores: false, contact: false, export: false },
        kpis: { total: 1, joined_week: 0, active_week: 0, approved: 1, completed: 0, avg_progress: 20 }, funnel: { registered: 1, approved: 1 }, by_track: {}, by_via: {},
        participants: [{ id: 'p1', full_name: 'سارة الأحمد', status: 'enrolled', progress: 20 }], impact: null, initiatives: [], outcomes: null, raters_pending: state.pending },
      'coord.rater-confirm': { success: true, decision: 'reject' },
    }[b.action];
    await route.fulfill({ json: r ?? { success: true } });
  });
  await page.addInitScript((t) => localStorage.setItem('mi_leaders_coord_session', t), 'c'.repeat(40));
  await page.goto(APP + 'org');
  await expect(page.getByRole('heading', { name: 'بيانات المشاركين أمانة' })).toBeVisible();
  await page.getByRole('button', { name: 'أوافق وأتابع' }).click();
  await expect(page.getByRole('heading', { name: 'وزارة التجربة' })).toBeVisible();
  const box = page.getByRole('region', { name: /مقيّمون بانتظار تأكيدك/ });
  await box.getByRole('button', { name: 'لا أعتمده' }).click();
  await expect(box.getByRole('button', { name: 'لا أعتمده' })).toBeDisabled();
  await box.getByLabel('سبب عدم الاعتماد (يصل المشارك)').fill('ليس مديره المباشر في الجهة');
  await box.getByRole('button', { name: 'لا أعتمده' }).click();
  await expect.poll(() => sent.find((x) => x.action === 'coord.rater-confirm')).toMatchObject({ id: 'r1', decision: 'reject', reason: 'ليس مديره المباشر في الجهة' });
});
