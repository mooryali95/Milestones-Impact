// أ9: الشاشات الرئيسية للتطبيقين تعمل تحت سياسة CSP كما تُرسل في الإنتاج، بلا أي securitypolicyviolation
// السياسة تُقرأ من _headers وتُضاف لترويسة الصفحة (خادم الاختبار لا يرسلها)؛ قيمها مثبتة في leaders-app/src/csp-policy.test.js
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const policy = (f) => readFileSync(f, 'utf8').match(/Content-Security-Policy: (.+)/)[1].replace(/;\s*upgrade-insecure-requests/, '');
const SHOTS = process.env.R9_SHOTS;

async function underCsp(page, csp) {
  const seen = [];
  await page.exposeFunction('__cspViolation', (v) => seen.push(v));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI}`)));
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) seen.push(m.text()); });
  await page.route((u) => !/\.\w{2,5}$/.test(u.pathname) || u.pathname.endsWith('.html'), async (r) => {
    if (r.request().resourceType() !== 'document') return r.continue();
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } });
  });
  return seen;
}

test('القادة: شاشة البداية بلا جلسة بلا مخالفة CSP', async ({ page }) => {
  const seen = await underCsp(page, policy('leaders-app/public/_headers'));
  await page.route(/functions\/v1\/leaders-api/, (r) => r.fulfill({ json: { success: false, error: 'no session' }, status: 401 }));
  // خارج تغطية هذا الاختبار: زر Google ومساراته (style-src وframe-src وconnect-src لـ accounts.google.com) والشاشات بعد الدخول؛
  // قيم Google مثبتة في csp-policy.test.js. زر Google الحقيقي يرفض التأطير على localhost بسياسته هو (frame-ancestors لدى accounts.google.com)، لا سياستنا
  await page.route(/accounts\.google\.com/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('http://localhost:4304/');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r9-leaders.png`, fullPage: true });
  expect(seen).toEqual([]);
});

test('الإدارة: شاشة الدخول بلا مخالفة CSP', async ({ page }) => {
  const seen = await underCsp(page, policy('admin-app/public/_headers'));
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: {}, status: 401 }));
  await page.goto('http://localhost:4303/');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r9-admin.png`, fullPage: true });
  expect(seen).toEqual([]);
});
