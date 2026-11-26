// المرحلة 27: السلم الطباعي والصفحات الداخلية. ثابت الصفحة المشترك، ولا وزن دون 400، والترويسة والتذييل وأرقام الفهرس
import { describe, expect, it } from 'vitest';
import { documentHtml, PAGE_MM, TYPE_SCALE, mmPx, contrastRatio, C } from './doc.js';
import { PAGE, chapterAt, withDocId } from './pdf.js';
import { STYLE } from './capstone.js';
import { accentText, TEXT_MIN_CONTRAST } from './institutional.js';

const brand = { name: 'جهة تجريبية', color: '#123456' };
const meta = { kind: 'CP', id: 'MI-CP-0042-V2', title: 'عنوان', rows: [], brand, pageAr: true };
const html = documentHtml(meta, STYLE + '<section class="sec"><header><h2>باب</h2></header><p>x</p></section>');
const styles = (h) => [...h.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const pageRule = (h) => h.match(/@page \{([\s\S]*?)\} \}/)[1];

describe('ثابت الصفحة المشترك', () => {
  it('الهوامش 22/20/24 مم، وPAGE في pdf.js مشتق منها', () => {
    expect(PAGE_MM).toMatchObject({ top: 22, side: 20, bottom: 24 });
    expect(PAGE).toEqual({ w: 794, h: 1123, top: mmPx(22), side: mmPx(20), bottom: mmPx(24) });
  });
  it('قاعدة @page في الوثيقة تطابق PAGE_MM', () => {
    expect(pageRule(html)).toMatch(new RegExp(`margin: ${PAGE_MM.top}mm ${PAGE_MM.side}mm ${PAGE_MM.bottom}mm;`));
    // الغلاف في ملف PDF يملأ ما فوق هامش التذييل
    expect(html).toContain(`html.pdf .mast.co { min-height: ${PAGE.h - PAGE.bottom}px;`);
  });
});

// الغلاف (.mast) خارج هذه المرحلة: حكمه في doc-contrast.test.js (المرحلتان 22 و25)
const inner = (css) => css.split('\n').filter((l) => !/^\s*(html[^{]*\s)?\.mast\b/.test(l)).join('\n');
describe('لا وزن 200 أو 300 في الطباعة (الصفحات الداخلية)', () => {
  for (const [name, h] of Object.entries({ brand: html, plain: documentHtml({ ...meta, brand: undefined }, STYLE), pdf: documentHtml(meta, STYLE, { pdf: true }) })) {
    it(name, () => {
      const css = inner(styles(h)) + (h.match(/id="pdf-head" style="([^"]*)"/)?.[1] || '');
      expect(css).not.toMatch(/font-weight:\s*[23]00\b/);
      expect(css).not.toMatch(/font:\s*[23]00\b/);
    });
  }
});

describe('السلم والترويسة والتذييل', () => {
  const page = pageRule(html);
  it('المتن 10.5pt بتباعد 1.7، والباب 18pt بوزن 600، وh3 12pt بوزن 500', () => {
    const css = styles(html);
    expect(css).toMatch(/body \{[^}]*font-weight: 400;[^}]*font-size: 10\.5pt; line-height: 1\.7;/);
    expect(css).toMatch(/\.sec h2 \{ font-weight: 600; font-size: 18pt;/);
    expect(css).toMatch(/\nh3 \{ font-size: 12pt; font-weight: 500; \}/);
    expect(css).toMatch(/\.tbl \{[^}]*font-size: 9pt;/);
  });
  it('التذييل «صفحة N من M» والرقم المرجعي 7.5pt بوزن 400 ولون #5F7176', () => {
    expect(TYPE_SCALE).toMatchObject({ footer: 7.5, footerColor: '#5F7176' });
    expect(page).toMatch(/@bottom-left \{ content: "صفحة " counter\(page\) " من " counter\(pages\); font: 400 7\.5pt/);
    expect(page).toMatch(/@bottom-right \{ content: "MI-CP-0042-V2"; font: 400 7\.5pt[^}]*color: #5F7176/);
    expect(page).not.toContain('"Milestone Impact"');
  });
  it('الترويسة: اسم الجهة في جهة واسم الباب (string set) في الأخرى، والعنوان احتياط لمن لا يدعمها', () => {
    expect(page).toMatch(/@top-right \{ content: "عنوان"; content: string\(chapter\);/);
    expect(page).toContain('@top-left { content: "جهة تجريبية"');
    expect(styles(html)).toContain('.sec > header h2, .in-open h2 { string-set: chapter content(text); }');
  });
  it('أرقام الفهرس في الطباعة من target-counter، وملف المتصفح يكتبها بنفسه', () => {
    expect(STYLE).toContain('target-counter(attr(data-ref url), page)');
  });
});

describe('اسم الباب لكل صفحة في ملف المتصفح (chapterAt)', () => {
  const heads = [{ y: 100, text: 'أ' }, { y: 1500, text: 'ب' }, { y: 1600, text: 'ج' }];
  it('أول باب يبدأ في الصفحة، وإلا آخر باب قبلها، ولا شيء قبل أول باب', () => {
    expect(chapterAt(heads, 0, 50)).toBe('');
    expect(chapterAt(heads, 50, 1000)).toBe('أ');
    expect(chapterAt(heads, 1000, 1400)).toBe('أ');
    expect(chapterAt(heads, 1400, 2400)).toBe('ب');
    expect(chapterAt(heads, 2400, 3000)).toBe('ج');
  });
});

describe('تباين تسميات .in-lean', () => {
  it('لون البنية نصًا صغيرًا يجتاز 4.5:1 وإلا الذهبي النصي', () => {
    expect(accentText('#0B272F')).toBe('#0B272F');
    expect(accentText(C.gold)).toBe(C.goldText);
    expect(accentText('#1F8B6F')).toBe(C.goldText);
    for (const c of ['#A97A2E', '#1F6F5C', '#123456', '#3A7D44']) expect(contrastRatio(accentText(c))).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
  });
});

describe('الرقم المرجعي واحد في الغلاف والتذييل (withDocId)', () => {
  it('يولد رقمًا عند غيابه ويظهر نفسه في الغلاف', () => {
    const m = withDocId({ title: 'ت', kind: 'RPT', brand: { name: 'ج' } });
    expect(m.id).toBeTruthy();
    expect(withDocId(m).id).toBe(m.id);
    expect(documentHtml(m, '<p>x</p>')).toContain(m.id);
  });
  it('يبقي الرقم الممرر', () => { expect(withDocId({ id: 'X-1' }).id).toBe('X-1'); });
});
