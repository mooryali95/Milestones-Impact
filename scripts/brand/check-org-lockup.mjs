// فحص بصري للعلامة المشتركة: يرسم الغلاف بشعار عريض ومربع وطويل وفاتح، ويقيس المقاسات الفعلية ويحفظ لقطات.
// التشغيل: npx vite-node scripts/brand/check-org-lockup.mjs [مجلد اللقطات]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { documentHtml } from '../../src/lib/brand/doc.js';

const out = process.argv[2] || 'test-results/org-lockup';
mkdirSync(out, { recursive: true });
const svg = (w, h, fill) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`).toString('base64')}`;
const cases = { wide: [svg(400, 80, '#0B6E4F'), 'w', 14], square: [svg(100, 100, '#0B6E4F'), 's', 20], tall: [svg(40, 100, '#0B6E4F'), 't', 24], light: [svg(100, 100, '#FFFFFF'), 's', 20], none: [null, null, 0] };
const mm = 96 / 25.4;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
let bad = 0;
for (const [k, [logo, cls, hmm]] of Object.entries(cases)) {
  await p.setContent(documentHtml({ kind: 'ORG', title: 'وثيقة', rows: [['الحالة', 'مسودة']], brand: { name: 'هيئة التطوير', logo } }, '<p>x</p>'));
  await p.evaluate(() => document.documentElement.classList.add('pdf'));
  const m = await p.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const [o, d, y, t] = [r('.mast .org'), r('.mast .dv'), r('.mast .by'), r('.mast .top')];
    const img = r('.mast .org img');
    const ref = img || t;
    return { img: img && { h: img.height, w: img.width }, order: o && d && y ? o.right >= d.right && d.right >= y.right : false, dv: d && { w: d.width, h: d.height }, org: ref.height, gap: o && y ? o.left - y.right : 0, top: t.width };
  });
  const errs = [];
  if (!m.order) errs.push('الترتيب');
  if (cls && Math.abs(m.img.h - hmm * mm) > 1.5) errs.push(`ارتفاع ${m.img.h.toFixed(1)}px`);
  if (m.dv && m.org && Math.abs(m.dv.h - m.org) > 1.5) errs.push('الفاصل لا يساوي الشعار');
  if (m.gap > 30 * mm) errs.push('فجوة كبيرة');
  if (errs.length) bad += 1;
  console.log(`${k}: ${errs.length ? `خطأ (${errs.join('، ')})` : 'سليم'}`, JSON.stringify(m));
  await p.screenshot({ path: `${out}/cov-${k}.png`, clip: { x: 0, y: 0, width: 794, height: 300 } });
}
await b.close();
process.exit(bad ? 1 : 0);
