// فحص الجاهزية، رئيسية المشارك. الخلفية مُحاكاة.
// p-entry-6 «خطوتك التالية» كانت تنزل تحت دعوة المدير والترحيب ومفتاح المرور على الهاتف.
// p-capstone-7 بطاقة دعوة المدير المخفية كانت تطلب impact.mine (حساب ثبات الدفعة كلها) في كل فتح للرئيسية.// p-entry-7 بعد «أنجزته» يُستبدل الزر بـ«تراجع» فكان التركيز يضيع إلى أول الصفحة.
import { test, expect } from '@playwright/test';
import { createMockServer } from '../shared/video/mock-server.js';

const APP = 'http://localhost:4304/';
const INVITE = 'ادعُ مديرك المباشر ليقدّر ممارستك الآن، قبل البرنامج';

function homeServer({ prompt = false } = {}) {
  const srv = createMockServer();
  Object.assign(srv.s, { named: true, profileDone: true, assessed: true, approved: true });
  const calls = [];
  let hbDone = false;
  const me = () => {
    const m = srv.reply({ action: 'me' });
    m.prompt_passkey = prompt;
    for (const st of m.journey) for (const it of st.items) if (it.id === 'r1' && hbDone) it.status = 'done';
    return m;
  };
  const reply = (b) => {
    calls.push(b.action);
    if (b.action === 'me') return me();
    if (b.action === 'impact.mine') return { success: true, pre_available: true, raters: [] };
    if (b.action === 'requirement.update') { hbDone = !b.undo; return me(); }
    if (b.action === 'sus.state') return { success: false, code: 'unknown_action' };
    return srv.reply(b);
  };
  return { calls, reply };
}
async function openHome(page, srv, init = () => {}) {
  await page.route(/functions\/v1\/leaders-api/, (route) => route.fulfill({ json: srv.reply(JSON.parse(route.request().postData() || '{}')) }));
  await page.route(/cloudflareinsights|challenges\.cloudflare/, (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-home-readiness-0000000000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true'); localStorage.setItem('mi_leaders_next_seen', 'true');
  });
  await page.addInitScript(init);
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'مراحل الرحلة' })).toBeVisible();
}

test.describe('على الهاتف', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('p-entry-6: «خطوتك التالية» في الشاشة الأولى فوق دعوة المدير ومفتاح المرور', async ({ page }) => {
    await openHome(page, homeServer({ prompt: true }));
    const invite = page.getByText(INVITE);
    await expect(invite).toBeVisible();
    await expect(page.getByText('ادخل المرة القادمة ببصمتك أو وجهك')).toBeVisible();
    const top = (await page.locator('.j-next').boundingBox()).y;
    expect(top).toBeLessThan(844 - 100);
    expect(top).toBeLessThan((await invite.boundingBox()).y);
  });
});

test('p-capstone-7: بطاقة دعوة المدير المخفية لا تطلب impact.mine', async ({ page }) => {
  const srv = homeServer();
  await openHome(page, srv, () => localStorage.setItem('mi_pre_manager_hidden', '1'));
  await page.waitForTimeout(500);
  expect(srv.calls).not.toContain('impact.mine');
  await expect(page.getByText(INVITE)).toHaveCount(0);
});

test('p-capstone-7: البطاقة الظاهرة تطلب حالتها كما كانت', async ({ page }) => {
  const srv = homeServer();
  await openHome(page, srv);
  await expect(page.getByText(INVITE)).toBeVisible();
  expect(srv.calls).toContain('impact.mine');
});

test('p-entry-7: بعد «أنجزته» يكون التركيز على «تراجع» لا على أول الصفحة', async ({ page }) => {
  await openHome(page, homeServer());
  await page.getByRole('button', { name: 'أنجزته', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'تراجع' })).toBeFocused();
});
