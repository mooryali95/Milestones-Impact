// المرحلة 5 من تصور فخامة ملف المبادرة: لمسات الوثيقة
// أرقام الجداول، والتاريخ الموحد، وسطر الحقوق، والغلاف بلا تذييل، والعناوين الإنجليزية الخافتة، ومربع التحقق،
// وشعار الختام، وtext-wrap، والفهرس الجانبي، ولا صفحة شبه فارغة
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentHtml, table, humanDate, mmPx, PAGE_MM } from './doc.js';
import { planPages, outlineItems, collectBreaks, PAGE } from './pdf.js';
import { VERIFY_STYLE } from './verify-mark.js';
import { IN_STYLE } from './institutional.js';

const css = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const rule = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...src.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(';');
};
const brand = { name: 'جهة', color: '#0B272F' };

describe('أرقام الجداول', () => {
  it('الخلية الرقمية تُعلَّم num، والنص لا', () => {
    const h = table([{ label: 'البند' }, { label: 'المبلغ' }, { label: 'النسبة' }], [['تشغيل', 480000, '12%'], ['أدوات', '1,200 ريال', 'نص']]);
    expect(h).toMatch(/<td class="num">480,000<\/td>/);
    expect(h).toMatch(/<td class="num">12%<\/td>/);
    expect(h).toMatch(/<td class="num">1,200 ريال<\/td>/);
    expect(h).toMatch(/<td class="w1">تشغيل<\/td>/);
    expect(h).toMatch(/<td class="w1">نص<\/td>/);
  });
  it('بلا التفاف وبأرقام جدولية وعرض أدنى 22mm', () => {
    const r = rule(css(documentHtml({ title: 'ت' }, '')), '.tbl td.num');
    expect(r).toMatch(/white-space: nowrap/);
    expect(r).toMatch(/font-variant-numeric: tabular-nums/);
    expect(r).toMatch(/min-width: 22mm/);
  });
});

describe('التاريخ الموحد وسطر الحقوق', () => {
  it('صيغة بشرية واحدة: 27 نوفمبر 2026', () => {
    expect(humanDate('2026-11-27T10:00:00Z')).toBe('27 نوفمبر 2026');
    expect(humanDate('x')).toBe('');
  });
  it('سطر الحقوق: التاريخ في bdi خارج الخط الأحادي، والمرجع والتاريخ في سطر مستقل لا يلتف', () => {
    const h = documentHtml({ title: 'ت', id: 'MI-X-1' }, '');
    const rights = h.slice(h.indexOf('<footer class="rights">'), h.indexOf('</footer>'));
    expect(rights).toMatch(/<span class="rt-meta"><bdi dir="ltr">MI-X-1<\/bdi> · <bdi>\d{1,2} [؀-ۿ]+ \d{4}<\/bdi><\/span>/);
    expect(rights).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const r = rule(css(h), '.rights .rt-meta');
    expect(r).toMatch(/display: block/);
    expect(r).toMatch(/white-space: nowrap/);
    expect(rule(css(h), '.rights')).toMatch(/word-break: keep-all/);
  });
  it('شريط الضبط في النسخة المؤسسية بلا تاريخ ISO', () => {
    const src = readFileSync(resolve('src/lib/brand/institutional.js'), 'utf8');
    expect(src).not.toMatch(/controlStrip\(\[[^\]]*isoDay/);
    expect(src).not.toMatch(/controlLabel:[^\n]*isoDay/);
  });
});

describe('الغلاف', () => {
  it('لا تذييل على الصفحة الأولى في الطباعة، بجهة وبلا جهة', () => {
    for (const meta of [{ title: 'ت' }, { title: 'ت', brand }]) {
      const c = css(documentHtml(meta, ''));
      const first = c.slice(c.indexOf('@page :first'), c.indexOf('} }', c.indexOf('@page :first')) + 3);
      expect(first).toContain('@bottom-right { content: none; }');
      expect(first).toContain('@bottom-left { content: none; }');
    }
  });
  it('غلاف الملف يمتد إلى حافة الورقة', () => {
    const c = css(documentHtml({ title: 'ت', brand }, ''));
    expect(c).toContain(`html.pdf .mast.co { min-height: ${mmPx(PAGE_MM.h)}px;`);
  });
  it('الملف المرسوم: لا تذييل على الغلاف، والصفحة الأولى بارتفاع الورقة', () => {
    const src = readFileSync(resolve('src/lib/brand/pdf.js'), 'utf8');
    expect(src).toMatch(/if \(k > 0\) footer\(ctx, k \+ 1/);
    expect(src).toMatch(/const FIRST_H = PAGE\.h;/);
  });
});

describe('العناوين الإنجليزية ومربع التحقق والختام والانسياب', () => {
  it('العناوين الإنجليزية خافتة بأصغر درجة في السلم وتباعد 0.12em', () => {
    const c = css(documentHtml({ title: 'ت' }, ''));
    const r = rule(c, '.eyebrow');
    expect(r).toMatch(/7\.5pt/);
    expect(r).toMatch(/letter-spacing: \.12em/);
    expect(r).toMatch(/opacity: \.7/);
    expect(rule(IN_STYLE, '.in-open .eyebrow')).toMatch(/letter-spacing: \.12em/);
  });
  it('مربع التحقق بخط متصل 0.3mm وفراغ فوقه 8mm على الأكثر', () => {
    for (const [src, sel] of [[VERIFY_STYLE, '.vm'], [IN_STYLE, '.in-verify']]) {
      const r = rule(src, sel);
      expect(r).toMatch(/border: 0\.3mm solid/);
      expect(r).not.toMatch(/dashed|dotted/);
      const m = Number((r.match(/margin-top: ([0-9.]+)mm/) || [])[1]);
      expect(m).toBeLessThanOrEqual(8);
    }
  });
  it('علامة المنصة في الختام أكبر وأوضح', () => {
    const r = rule(css(documentHtml({ title: 'ت' }, '')), '.close .mi-mark svg');
    expect(r).toMatch(/height: 9mm/);
    expect(r).not.toMatch(/opacity/);
  });
  it('الفقرات والقوائم text-wrap: pretty', () => {
    expect(rule(css(documentHtml({ title: 'ت' }, '')), 'p, li')).toMatch(/text-wrap: pretty/);
  });
});

describe('الفهرس الجانبي في الملف المرسوم', () => {
  it('كل باب بصفحته، بلا تكرار ولا فارغ', () => {
    const plan = [{ start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 300 }];
    const pageOf = (y) => plan.findIndex((p) => y >= p.start && y < p.end);
    expect(outlineItems([{ y: 150, text: 'ب' }, { y: 20, text: 'أ' }, { y: 250, text: ' ' }, { y: 260, text: 'ج' }], pageOf))
      .toEqual([{ title: 'أ', page: 1 }, { title: 'ب', page: 2 }, { title: 'ج', page: 3 }]);
  });
  it('buildPdf يضيف الفهرس إلى jsPDF', () => {
    expect(readFileSync(resolve('src/lib/brand/pdf.js'), 'utf8')).toMatch(/pdf\.outline\.add\(null, it\.title, \{ pageNumber: it\.page \}\)/);
  });
});

describe('لا صفحة شبه فارغة', () => {
  it('كتلة لا تنقسم بعد محتوى قصير: يُكسر داخلها بدل صفحة تحت 25%', () => {
    const pageH = 1000;
    // كسر صلب عند 100 فقط، ثم كتلة keep من 100 إلى 1800 فيها مواضع لينة
    const cands = [{ y: 100 }, { y: 600, soft: true }, { y: 900, soft: true }, { y: 1500, soft: true }];
    const plan = planPages({ total: 1800, cands, pageH, firstH: pageH });
    expect(plan[0].end).toBe(900);
    for (const p of plan.slice(0, -1)) expect(p.end - p.start).toBeGreaterThanOrEqual(pageH * 0.25);
  });
  it('الكسر الصلب الممتلئ يُقدَّم على اللين', () => {
    const plan = planPages({ total: 1500, cands: [{ y: 700 }, { y: 950, soft: true }], pageH: 1000, firstH: 1000 });
    expect(plan[0].end).toBe(700);
  });
  it('اللين يُقبل إن كان تقديم الصلب يزيد الوثيقة صفحة (عقد مدى صفحات الشكل في البديل المصور)', () => {
    // الصلب عند 700 يترك 30% فارغة ثم يجر ذيلًا إلى صفحة رابعة؛ اللين عند 950 يُبقيها ثلاثًا
    const plan = planPages({ total: 2900, cands: [{ y: 700 }, { y: 950, soft: true }, { y: 1650 }, { y: 1900 }], pageH: 1000, firstH: 1000 });
    expect(plan.length).toBe(3);
    expect(plan[0].end).toBe(950);
  });
  it('نهاية الباب (كسر إجباري) مستثناة', () => {
    const plan = planPages({ total: 1500, cands: [{ y: 1100 }], forced: [100], pageH: 1000, firstH: 1000 });
    expect(plan[0].end).toBe(100);
  });
  it('PAGE ثابت', () => { expect(PAGE.h).toBe(1123); });
});

// المرحلة 6: الغلاف في البديل المصور صفحة واحدة لا تنقسم. كان أطول من 90% من الصفحة فلا يُحسب «لا ينقسم»، فانكسر عند
// سطر الحالة أسفله وجر شريطه إلى الصفحة الثانية، فزادت البطاقة صفحة عن مدى شكلها (e2e/initiative-pdf-reference.spec.js)
describe('الغلاف لا ينقسم في البديل المصور', () => {
  const fake = (els) => {
    const mk = (e) => ({ ...e, getBoundingClientRect: () => ({ top: e.top, bottom: e.bottom, height: e.bottom - e.top, left: 0, right: 794 }) });
    const nodes = els.map(mk);
    const root = { ...mk({ top: 0, bottom: 2000 }), querySelectorAll: () => nodes };
    const styles = new Map(nodes.map((n) => [n, { display: 'block', breakBefore: 'auto', breakAfter: 'auto', breakInside: 'auto', ...n.cs }]));
    return { querySelector: () => root, defaultView: { getComputedStyle: (n) => styles.get(n) } };
  };
  it('break-after: page على الغلاف كسر إجباري عند نهايته، ولا كسر داخله', () => {
    const doc = fake([
      { tagName: 'HEADER', top: 0, bottom: 1123, cs: { breakAfter: 'page', breakInside: 'avoid' } },
      { tagName: 'DIV', top: 1045, bottom: 1070 },
      { tagName: 'DIV', top: 1123, bottom: 2000 },
    ]);
    const br = collectBreaks(doc, 949);
    expect(br.forced).toContain(1123);
    expect(br.cands.filter((c) => c.y > 0 && c.y < 1123 && !c.soft)).toEqual([]);
    expect(planPages({ ...br, firstH: 1123 })[0].end).toBe(1123);
  });
  it('غلاف PDF يعلن break-after: page', () => {
    const html = documentHtml({ title: 'ت', brand: { name: 'جهة' } }, '<p>x</p>', { pdf: true });
    expect(css(html)).toMatch(/html\.pdf \.mast\.co \{[^}]*break-after: page/);
  });
});
