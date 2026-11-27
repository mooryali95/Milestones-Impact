// فخامة اسم الجهة وشعارها: تصنيف الأبعاد، كشف الشعار الفاتح، العلامة المشتركة، وحواجز الفراغ
import { describe, it, expect } from 'vitest';
import { aspectClass, logoDims, logoClass, isLightLogo, svgIsLight, logoIsLight } from './logo.js';
import { documentHtml } from './doc.js';
import { certificateHtml } from './certificate.js';
import { readFileSync } from 'node:fs';

const b64 = (s) => Buffer.from(s, 'binary').toString('base64');
const png = (w, h) => {
  const be = (n) => String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  return `data:image/png;base64,${b64(`\x89PNG\r\n\x1a\n${be(13)}IHDR${be(w)}${be(h)}\x08\x06\x00\x00\x00`)}`;
};
const svg = (body) => `data:image/svg+xml;base64,${Buffer.from(body).toString('base64')}`;
const css = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (html, sel) => (css(html).match(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';

describe('تصنيف أبعاد الشعار', () => {
  it('عريض فوق 3، طويل دون 0.8، ومربع بينهما', () => {
    expect(aspectClass(4)).toBe('w');
    expect(aspectClass(3)).toBe('s');
    expect(aspectClass(0.8)).toBe('s');
    expect(aspectClass(0.5)).toBe('t');
    expect(aspectClass(null)).toBe('s');
  });
  it('الأبعاد من ترويسة PNG ومن viewBox في SVG', () => {
    expect(logoDims(png(400, 100))).toEqual({ w: 400, h: 100 });
    expect(logoDims(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100"></svg>'))).toEqual({ w: 50, h: 100 });
    expect(logoClass(png(400, 100))).toBe('w');
    expect(logoClass(png(100, 100))).toBe('s');
    expect(logoClass(svg('<svg viewBox="0 0 50 100"></svg>'))).toBe('t');
    expect(logoClass('/x.png')).toBe('s');
  });
});

describe('كشف الشعار الفاتح', () => {
  it('متوسط إضاءة البكسلات المعتمة فوق 0.85 فاتح، والشفاف لا يُحسب', () => {
    const d = new Uint8ClampedArray(4 * 4);
    d.set([250, 250, 250, 255, 245, 245, 245, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isLightLogo(d)).toBe(true);
    d.set([20, 20, 20, 255], 0);
    expect(isLightLogo(d)).toBe(false);
  });
  it('SVG بألوان التعبئة', () => {
    expect(svgIsLight('<svg><path fill="#ffffff"/><path fill="#fafafa"/></svg>')).toBe(true);
    expect(svgIsLight('<svg><path fill="#0B272F"/></svg>')).toBe(false);
    expect(svgIsLight('<svg><path/></svg>')).toBe(false);
    expect(logoIsLight(svg('<svg><path fill="#fff"/></svg>'))).toBe(true);
  });
});

const meta = (brand) => ({ kind: 'ORG', title: 'عنوان', rows: [['الحالة', 'مسودة']], brand });
describe('العلامة المشتركة على الغلاف', () => {
  const h = documentHtml(meta({ name: 'هيئة التطوير', logo: png(400, 100) }), '<p>x</p>');
  it('شعار الجهة أولًا ثم فاصل ذهبي ثم علامة المنصة', () => {
    const top = h.match(/<div class="top">([\s\S]*?)<\/div><\/div>/)[1];
    const i = [top.indexOf('class="org'), top.indexOf('class="dv"'), top.indexOf('class="by"')];
    expect(i.every((n) => n >= 0)).toBe(true);
    expect(i).toEqual([...i].sort((a, b) => a - b));
    expect(h).toContain('class="org plate w"');
  });
  it('مقاسات الفئات بلا حد أدنى للعرض', () => {
    expect(rule(h, '.mast.co .org.w img')).toMatch(/height: 14mm/);
    expect(rule(h, '.mast.co .org.w img')).toMatch(/max-width: 64mm/);
    expect(rule(h, '.mast.co .org.s img')).toMatch(/height: 20mm/);
    expect(rule(h, '.mast.co .org.t img')).toMatch(/height: 24mm/);
    expect(rule(h, '.mast.co .org.t img')).toMatch(/max-width: 20mm/);
    expect(css(h)).not.toMatch(/min-width: 30mm/);
  });
  it('الاصطفاف وسطًا بلا space-between، وفاصل 0.3 مم بهامش 6 مم، والعلامة 9 مم و«بإعداد» بحجم الحاشية من السلم', () => {
    expect(rule(h, '.mast.co .top')).toMatch(/align-items: center/);
    expect(rule(h, '.mast.co .top')).toMatch(/justify-content: flex-start/);
    expect(rule(h, '.mast.co .dv')).toMatch(/width: 0\.3mm/);
    expect(rule(h, '.mast.co .dv')).toMatch(/margin: 0 6mm/);
    expect(css(h)).toMatch(/\.mast\.co \.org\.w \+ \.dv \{ align-self: center; height: 14mm; \}/);
    expect(css(h)).toMatch(/\.mast\.co \.org\.t \+ \.dv \{ align-self: center; height: 24mm; \}/);
    expect(rule(h, '.mast.co .by svg')).toMatch(/height: 9mm/);
    expect(rule(h, '.mast.co .by span')).toMatch(/font-size: 7\.5pt/);
  });
  it('اللوحة: حشو 4×5 مم وحد 0.25 مم بلا ظل ولا انحناء، وجرافيتية للشعار الفاتح', () => {
    const p = rule(h, '.mast.co .org.plate');
    expect(p).toMatch(/padding: 4mm 5mm/); expect(p).toMatch(/border: 0\.25mm solid/);
    expect(p).toMatch(/border-radius: 0/); expect(p).toMatch(/box-shadow: none/);
    const lt = documentHtml(meta({ name: 'ج', logo: svg('<svg viewBox="0 0 100 100"><path fill="#fff"/></svg>') }), '');
    expect(lt).toContain('class="org plate s light"');
    expect(rule(lt, '.mast.co .org.plate.light')).toMatch(/background-color: #0B272F/i);
  });
  it('بلا شعار: الاسم 12pt بوزن 500 داخل العلامة نفسها', () => {
    const n = documentHtml(meta({ name: 'هيئة التطوير' }), '');
    expect(n).toMatch(/<div class="top"><div class="org"><span class="nm">هيئة التطوير<\/span><\/div><i class="dv"><\/i><div class="by">/);
    expect(rule(n, '.mast.co .org .nm')).toMatch(/font-size: 12pt/);
    expect(rule(n, '.mast.co .org .nm')).toMatch(/font-weight: 500/);
  });
  it('ترويسة الصفحات: شعار 6 مم وعرض 40 مم، وعلامة المنصة 4 مم باقية مع الجهة', () => {
    const p = documentHtml(meta({ name: 'ج', logo: png(400, 100) }), '', { pdf: true });
    const head = p.slice(p.indexOf('id="pdf-head"'));
    expect(head).toMatch(/#pdf-head \.ph-org img\{height:6mm;max-width:40mm;object-fit:contain/);
    expect(head).toContain('class="ph-mi"');
    expect(head).toMatch(/#pdf-head \.ph-mi svg\{height:4mm/);
  });
});

describe('الشهادة', () => {
  const base = { name_ar: 'سارة', serial: 'S1', kind: 'completion', issued_at: '2026-01-01', verify_url: 'https://x/v/S1' };
  it('الشعار 15 مم مساوٍ للعلامة، فاصل 15 مم وفجوة 8 مم، والطويل 18 مم عرضًا، والاسم 9pt', () => {
    const h = certificateHtml({ ...base, org: { name: 'هيئة', logo: png(50, 100) } }, '');
    expect(rule(h, '.brands .org img')).toMatch(/height: 15mm/);
    expect(rule(h, '.brands .mi svg')).toMatch(/height: 15mm/);
    expect(rule(h, '.brands .sep')).toMatch(/height: 15mm/);
    expect(rule(h, '.brands')).toMatch(/gap: 8mm/);
    expect(rule(h, '.brands .org.t img')).toMatch(/max-width: 18mm/);
    expect(rule(h, '.brands .org small')).toMatch(/9pt/);
    expect(h).toContain('class="org t"');
  });
});

describe('حواجز الفراغ', () => {
  it('عتبة قبول الكسر 0.45 وحاجز الفاتحة 40 مم، وعلامة مشتركة 12 مم في الاعتماد', () => {
    const pdf = readFileSync('src/lib/brand/pdf.js', 'utf8');
    expect(pdf).toMatch(/room \* 0\.45/); expect(pdf).not.toMatch(/room \* 0\.3\b/);
    const inst = readFileSync('src/lib/brand/institutional.js', 'utf8');
    expect(inst).toMatch(/\.in-keep \{[^}]*height: 40mm; margin-bottom: -40mm/);
    expect(inst).toMatch(/\.in-lock[^{]*\{[^}]*height: 12mm/);
    expect(inst).toMatch(/class="in-lock"/);
  });
});
