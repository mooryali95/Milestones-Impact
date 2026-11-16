// «التوجيه والإرشاد» (المرحلة G1، تصور 2026-11-16 v2): الاستشارة وأسئلة الفريق في مكان واحد في الرحلة،
// وبطاقة «ابدأ بالقراءة» لمن لم يبدأ ما يوجَّه إليه، وزر في الكتاب يفتح اللوحة الجانبية. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';

function server(guidance) {
  const calls = [];
  const me = {
    success: true,
    participant: { id: 'p1', full_name: 'سارة الأحمد', email: 'sara@x.sa', status: 'enrolled', consented_at: '2026-11-01T00:00:00Z' },
    profile: { approved: true, level: 'intermediate', track: { title: 'مسار' } },
    journey: ['profile', 'assessment'].map((key) => ({ key, title_ar: key, phase: 'admission', status: 'done', items: [], done: 0, total: 0 })),
    progress: 30, passkeys: 1, prompt_passkey: false, milestones: [], notices: [], nudge: null, guidance,
  };
  const reply = (b) => ({
    me,
    'experts.suggest': { success: true, role: 'coach', roles: [{ key: 'coach', title: 'موجّه', hint: 'لمهارة محددة' }], contexts: {}, dimensions: {}, requests: [], candidates: [] },
    'peer.list': { success: true, supervision: 'peers_expert', supervision_ar: 'الأقران يجيبون ويؤكّد الخبير', team: 'guide', team_ar: 'فريق التوجيه', teams: { guide: 'فريق التوجيه' }, advisor: 'سارة', mine_open: 0, items: [] },
    'handbook.toc': { success: true, name: 'سارة الأحمد', code: 'M1', chapters: [{ id: 'hb-1', dimension: 'milestone', chapter_key: 'ch1', title: 'إعادة تعريف المعلم', done: null }], points: { total: 0, rank: { title: 'مستكشف', next: null } }, models: { total: 0, submitted: 0 } },
    'handbook.chapter': { success: true, reading: null, chapter: { id: b.id, dimension: 'milestone', title: 'إعادة تعريف المعلم', md: '## أساسيات\nنص.' }, quiz: [], reflection: '', done: null, watermark: 'x' },
    'handbook.ping': { success: true, reading: null },
  }[b.action] ?? { success: true });
  return { calls, route: async (route) => { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b); await route.fulfill({ json: reply(b) }); } };
}

async function open(page, s) {
  await page.route(/functions\/v1\/leaders-api/, s.route);
  await page.addInitScript(() => { localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_session', 'tok-guid-000000000000000000000'); });
  await page.goto(APP);
}

test('من لم يبدأ: بطاقة «ابدأ بقراءة الباب الأول» والاستشارة متاحة، و«افتح كتابي» يفتح الكتاب', async ({ page }) => {
  const s = server({ ready: false, signals: [] });
  await open(page, s);
  const panel = page.getByRole('region', { name: 'التوجيه والإرشاد' });
  await expect(panel.getByRole('status')).toContainText('ابدأ بقراءة الباب الأول من كتابك');
  await expect(panel.getByRole('heading', { name: 'اطلب استشارة' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'طلبات التوجيه' })).toBeVisible();
  await panel.getByRole('button', { name: 'افتح كتابي' }).click();
  await expect.poll(() => s.calls.some((c) => c.action === 'handbook.toc')).toBe(true);
});

test('من بدأ: لا بطاقة «ابدأ»، والاستشارة وأسئلة الفريق في اللوحة نفسها', async ({ page }) => {
  await open(page, server({ ready: true, signals: ['quiz'] }));
  const panel = page.getByRole('region', { name: 'التوجيه والإرشاد' });
  await expect(panel.getByRole('heading', { name: 'اطلب استشارة' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'طلبات التوجيه' })).toBeVisible();
  await expect(panel.getByText('ابدأ بقراءة الباب الأول')).toHaveCount(0);
});

test('زر «التوجيه والإرشاد» في الكتاب يفتح اللوحة الجانبية بسياق الباب، وEsc يغلقها', async ({ page }) => {
  await open(page, server({ ready: true, signals: ['reading'] }));
  await page.getByRole('region', { name: 'التوجيه والإرشاد' }).waitFor();
  await page.getByRole('button', { name: 'افتح كتابي' }).first().click();
  await page.getByRole('button', { name: 'التوجيه والإرشاد' }).click();
  const drawer = page.getByRole('dialog', { name: 'التوجيه والإرشاد' });
  await expect(drawer.getByRole('heading', { name: 'اطلب استشارة' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});
