// مرحلة الإصلاحات العاجلة كما يراها المستخدم: الموقع العام فاتح وبتباين كافٍ ولو كان الجهاز داكنًا،
// ورابط البريد /?tab=profile يفتح الملف مباشرة، ورأس خطوات البداية يعرض مدة القياس من الرحلة.
import { test, expect } from '@playwright/test';

const SITE = 'http://localhost:4301';
const APP = 'http://localhost:4304/';
const PAGES = ['/', '/leaders/', '/projects/', '/governance/', '/assessment/', '/pricing.html', '/privacy.html', '/terms.html', '/refund.html', '/404.html'];

test('الموقع العام يبقى فاتحًا في جهاز بنمط داكن، وتباين قسم الدخول في صفحة البرنامج 4.5 فأكثر', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await page.goto(SITE + path);
    const surface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mi-surface').trim().toUpperCase());
    expect(surface, path).toBe('#FFFFFF');
  }

  await page.goto(`${SITE}/leaders/`);
  await page.locator('#enter-title').scrollIntoViewIfNeeded();
  // اللون الفعلي لكل نص (بعد شفافيته وشفافية أسلافه) على خلفية أقرب سلف معتم، بمعادلة WCAG
  const ratios = await page.evaluate(() => {
    const ctx2d = document.createElement('canvas').getContext('2d');
    const rgba = (css) => { ctx2d.clearRect(0, 0, 1, 1); ctx2d.fillStyle = '#000'; ctx2d.fillStyle = css; ctx2d.fillRect(0, 0, 1, 1); return [...ctx2d.getImageData(0, 0, 1, 1).data]; };
    const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const measure = (el) => {
      let alpha = rgba(getComputedStyle(el).color)[3] / 255, bg = null;
      for (let n = el; n && !bg; n = n.parentElement) {
        alpha *= Number(getComputedStyle(n).opacity);
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] === 255) bg = c;
      }
      const fg = rgba(getComputedStyle(el).color);
      const mixed = fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
      return Math.round(ratio(mixed, bg) * 100) / 100;
    };
    const out = {};
    const pick = (name, sel) => document.querySelectorAll(sel).forEach((el, i) => { out[`${name} ${i + 1}`] = measure(el); });
    pick('عنوان صغير', '.enter__eyebrow');
    pick('عنوان بطاقة', '.enter__card h3');
    pick('رابط البطاقة', '.enter__go');
    pick('تلميح البطاقة', '.enter__sub');
    return out;
  });
  expect(Object.keys(ratios).length).toBeGreaterThanOrEqual(8);
  for (const [name, r] of Object.entries(ratios)) expect(r, name).toBeGreaterThanOrEqual(4.5);
  await ctx.close();
});

function participant({ approved = true, profileDone = true, assessed = true, assessmentLabel = '18 دقيقة' } = {}) {
  const stage = (key, status, items, extra = {}) => ({ key, title_ar: key, phase: 'admission', status, items, done: 0, total: items.length, ...extra });
  return {
    success: true,
    participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد', email: 'sara@x.sa', status: approved ? 'enrolled' : 'registered' },
    profile: { full_name: 'سارة عبدالله الأحمد', phone: '0500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة الاختبار', years_experience: 8, approved, level: assessed ? 'intermediate' : null, track: null },
    journey: [
      stage('profile', profileDone ? 'done' : 'active', [{ id: 'r1', code: 'P-INFO', status: profileDone ? 'done' : 'pending' }]),
      stage('assessment', assessed ? 'done' : 'active', [{ id: 'r2', code: 'A-DONE', status: assessed ? 'done' : 'pending' }], { duration_label: assessmentLabel }),
      stage('approval', approved ? 'done' : 'locked', [], { duration_label: 'يوما عمل' }),
    ],
    progress: 20, passkeys: 1, prompt_passkey: false,
  };
}

async function mount(page, me) {
  await page.route(/functions\/v1\/leaders-api/, async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: b.action === 'me' ? me : { success: false, message: 'غير متوقع' } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('mi_leaders_session', 'tok-live-fixes-00000000000000000');
    localStorage.setItem('mi_leaders_welcome_seen', 'true');
  });
}

test('رابط بريد الأمان /?tab=profile يفتح الملف مباشرة ثم يُنظَّف العنوان', async ({ page }) => {
  await mount(page, participant());
  await page.goto(`${APP}?tab=profile`);
  await expect(page.getByRole('heading', { name: 'ملفي الشخصي' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الدخول بالبصمة', level: 2 })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('رأس خطوات البداية: مدة القياس من مرحلته في الرحلة، والعدّاد واحد', async ({ page }) => {
  await mount(page, participant({ approved: false, assessed: false }));
  await page.goto(APP);
  const rail = page.getByRole('navigation', { name: 'خطوات البداية' });
  await expect(rail.getByText('الخطوة 3 من 4')).toBeVisible();
  await expect(rail.locator('li').nth(2)).toContainText('18 دقيقة');
  await expect(page.getByText(/من 3 في القبول/)).toHaveCount(0);
});
