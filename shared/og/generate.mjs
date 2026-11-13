// يولّد صور المشاركة (1200×630) لكل صفحة إلى home/assets/og/.
// التشغيل: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node shared/og/generate.mjs
import { chromium } from '@playwright/test';
import fs from 'fs';
const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const out = root + '/home/assets/og';
// الصفحة تُحمَّل من about:blank، لذا تُضمَّن الخطوط والشعار بصيغة data URI.
const data = (p, type) => `data:${type};base64,${fs.readFileSync(root + p).toString('base64')}`;
const fonts = fs.readFileSync(root + '/home/assets/fonts/fonts.css', 'utf8')
  .replace(/url\(\/assets\/fonts\/([^)]+)\)/g, (_, n) => `url(${data('/home/assets/fonts/' + n, 'font/woff2')})`);
const logo = data('/home/assets/brand/svg/milestone-impact-inverted.svg', 'image/svg+xml');
const pages = [
  ['leaders', 'مسار القادة', 'إدارة المشروعات للقادة', 'من التنفيذ إلى الأثر: منهجية عملية لقادة المشروعات'],
  ['projects', 'المسار التنموي', 'إدارة المشروعات التنموية', 'منهجية DBOTC: تصميم، بناء، تشغيل، نقل، استشارة'],
  ['governance', 'الحوكمة', 'الحوكمة والهيكل المؤسسي', 'أربعة مجالس بصلاحيات واضحة وخطوط مساءلة محددة'],
  ['assessment', 'أداة مجانية', 'مقياس جاهزية الأثر', 'قراءة أولية لجاهزية جهتكم للأثر المؤسسي في نحو أربع دقائق'],
];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [slug, kicker, title, sub] of pages) {
  await p.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${fonts}
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:radial-gradient(ellipse at 15% 110%,#12414E 0%,#0B272F 45%,#061318 100%);font-family:"Noto Kufi Arabic",sans-serif;color:#EFE7D8;position:relative;overflow:hidden}
  .frame{position:absolute;inset:36px;border:1px solid rgba(199,154,75,.35)}
  .wrap{position:absolute;inset:0;padding:70px 104px 150px;display:flex;flex-direction:column;justify-content:center}
  .k{display:flex;align-items:center;gap:16px;color:#C79A4B;font-size:26px;font-weight:600;margin-bottom:28px}
  .d{width:16px;height:16px;background:#A97A2E;transform:rotate(45deg);border-radius:2px}
  h1{font-size:68px;font-weight:800;line-height:1.25;max-width:960px}
  .rule{width:120px;height:3px;background:linear-gradient(90deg,#A97A2E,#C79A4B);margin:28px 0 22px}
  p{font-size:30px;font-weight:400;color:rgba(239,231,216,.78);max-width:900px;line-height:1.6}
  .logo{position:absolute;left:104px;bottom:76px;height:64px}
  .url{position:absolute;right:104px;bottom:86px;font-family:"Noto Sans";font-size:22px;color:rgba(239,231,216,.55);letter-spacing:.06em}
  </style></head><body><div class="frame"></div><div class="wrap"><div class="k"><span class="d"></span>${kicker}</div><h1>${title}</h1><div class="rule"></div><p>${sub}</p></div>
  <img class="logo" src="${logo}"><div class="url" dir="ltr">mi.sunkvalue.com/${slug}</div></body></html>`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${out}/${slug}.png` });
}
await b.close();
