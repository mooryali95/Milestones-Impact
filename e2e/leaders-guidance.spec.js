// «التوجيه والإرشاد» (المرحلة G1، تصور 2026-11-16 v2): الاستشارة وأسئلة الفريق في مكان واحد في الرحلة،
// وبطاقة «ابدأ بالقراءة» لمن لم يبدأ ما يوجَّه إليه، وزر في الكتاب يفتح اللوحة الجانبية. الخلفية مُحاكاة.
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:4304/';

function server(guidance) {
  // guidance.ai: المساعد الذكي مفتوح (G2)، وبدونه لا تُطلب المحادثة
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

// ── G2: «اسأل المساعد» ──
function chatServer({ ai = true, gateOk = true } = {}) {
  const s = server({ ready: true, signals: ['quiz'], ai });
  const calls = s.calls;
  const state = { messages: [] };
  const base = s.route;
  const route = async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.action === 'guide.state') { calls.push(b); return r.fulfill({ json: { success: true, gate: { ok: gateOk, reason: gateOk ? null : 'policy' }, left: { day: 8, month: 30 }, retention_days: 90, messages: state.messages } }); }
    if (b.action === 'guide.ask') { calls.push(b); return r.fulfill({ json: { success: true, reply: { id: 42, text: 'المعلم نقطة قرار. ابدأ بتسمية معلمك الأول.', verdict: 'answered', sources: [] }, left: { day: 7, month: 29 } } }); }
    if (b.action === 'guide.confirm') { calls.push(b); return r.fulfill({ json: { success: true } }); }
    if (b.action === 'guide.clear') { calls.push(b); state.messages = []; return r.fulfill({ json: { success: true, deleted: 2 } }); }
    return base(r);
  };
  return { calls, route };
}

test('«اسأل المساعد»: سؤال وإجابة، و«أريد التأكد» يملأ طلب الاستشارة ولا يرسله، والحذف بيد المشارك', async ({ page }) => {
  const s = chatServer();
  await open(page, s);
  const chat = page.getByRole('region', { name: /اسأل المساعد/ });
  await expect(chat).toContainText('بقي لك 8 اليوم و30 هذا الشهر');
  await chat.getByLabel('سؤالك').fill('ما المعلم؟');
  await chat.getByRole('button', { name: 'اسأل' }).click();
  await expect(chat.getByRole('list', { name: 'محادثتك مع المساعد' })).toContainText('المعلم نقطة قرار');
  await expect(chat).toContainText('بقي لك 7 اليوم و29 هذا الشهر');
  expect(s.calls.find((c) => c.action === 'guide.ask')).toMatchObject({ text: 'ما المعلم؟', context: 'program' });
  expect(s.calls.find((c) => c.action === 'guide.ask').participant_id).toBeUndefined();

  await chat.getByRole('button', { name: 'لم تقنعني، أريد التأكد' }).click();
  await expect(page.getByLabel(/ما الذي تحتاجه؟/)).toHaveValue(/سألت المساعد الذكي: «ما المعلم؟»/);
  expect(s.calls.some((c) => c.action === 'experts.choose')).toBe(false);
  // G3: الضغط يُسجَّل عددًا بمعرّف الرد وحده، بلا نص
  await expect.poll(() => { const { token: _t, idem: _i, ...rest } = s.calls.find((c) => c.action === 'guide.confirm') || {}; return rest; }).toEqual({ action: 'guide.confirm', message_id: 42 });

  page.once('dialog', (d) => d.accept());
  await chat.getByRole('button', { name: 'احذف محادثتي' }).click();
  await expect.poll(() => s.calls.some((c) => c.action === 'guide.clear')).toBe(true);
});

test('المساعد مغلق (ai=false): لا يُطلب guide.state أصلًا، والاستشارة كما هي', async ({ page }) => {
  const s = chatServer({ ai: false });
  await open(page, s);
  await expect(page.getByRole('region', { name: 'التوجيه والإرشاد' }).getByRole('heading', { name: 'اطلب استشارة' })).toBeVisible();
  await expect(page.getByRole('region', { name: /اسأل المساعد/ })).toHaveCount(0);
  expect(s.calls.some((c) => c.action === 'guide.state')).toBe(false);
});

test('البوابة مغلقة لهذا المشارك من الخادم: لا يظهر المساعد', async ({ page }) => {
  const s = chatServer({ gateOk: false });
  await open(page, s);
  await expect.poll(() => s.calls.some((c) => c.action === 'guide.state')).toBe(true);
  await expect(page.getByRole('region', { name: /اسأل المساعد/ })).toHaveCount(0);
});
