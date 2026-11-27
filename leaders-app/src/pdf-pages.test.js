// تقسيم صفحات ملف PDF الجاهز (src/lib/brand/pdf.js): منطق خالص يحكمه CSS الوثيقة نفسه
import { describe, expect, it } from 'vitest';
import { PAGE, planPages } from '../../src/lib/brand/pdf.js';
import { capstoneReport, pdfFileName } from '../../src/lib/brand/capstone.js';
import { documentHtml } from '../../src/lib/brand/doc.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const C = (...ys) => ys.map((y) => ({ y }));

describe('planPages: حدود الصفحات من مواضع الكسر المسموحة', () => {
  it('يملأ الصفحة إلى أبعد كسر مسموح، ولا يقطع خارج المواضع المسموحة', () => {
    const p = planPages({ total: 2500, cands: C(300, 900, 1000, 1500, 1900, 2400), pageH: 1000, firstH: 1000 });
    expect(p.map((x) => [x.start, x.end])).toEqual([[0, 1000], [1000, 1900], [1900, 2500]]);
  });
  it('الكسر الإجباري (صفحة جديدة) يُقدَّم ولو بقي فراغ', () => {
    const p = planPages({ total: 2000, cands: C(400, 900), forced: [500], pageH: 1000, firstH: 1000 });
    expect(p[0]).toMatchObject({ start: 0, end: 500 });
  });
  it('لا صفحة شبه فارغة: يُفضَّل كسر يملأ ثلث الصفحة على الأقل، وبلا كسر مسموح يُقطع عند الحد', () => {
    expect(planPages({ total: 3000, cands: C(100, 800), pageH: 1000, firstH: 1000 })[0].end).toBe(800);
    expect(planPages({ total: 3000, cands: [], pageH: 1000, firstH: 1000 })[0].end).toBe(1000);
  });
  it('الكسر بين صفوف جدول يكرر رأسه أعلى الصفحة التالية، وتنقص مساحتها بقدره', () => {
    const head = { top: 950, bottom: 990 };
    const p = planPages({ total: 2600, cands: [{ y: 1000 }, { y: 1600, head }, { y: 1950, head }], pageH: 1000, firstH: 1700 });
    expect(p[0]).toMatchObject({ end: 1600, head: null });
    expect(p[1]).toMatchObject({ start: 1600, head });
    expect(p[1].end).toBeLessThanOrEqual(1600 + 1000 - 40);
  });
  it('الصفحة الأولى للغلاف أطول (تبدأ من حافة الورقة) وما بعدها بهامشيها', () => {
    expect(PAGE.h - PAGE.bottom).toBeGreaterThan(PAGE.h - PAGE.top - PAGE.bottom);
    const p = planPages({ total: 5000, cands: [] });
    expect(p[0].end).toBe(PAGE.h); // المرحلة 5: الغلاف بلا تذييل إلى حافة الورقة
    expect(p[1].end - p[1].start).toBe(PAGE.h - PAGE.top - PAGE.bottom);
  });
});

describe('الوثيقة جاهزة للتصدير', () => {
  const { meta, body } = capstoneReport(exampleDoc(EXAMPLES[0]));
  it('اسم ملف عربي يدل على الوثيقة: «وثيقة-المبادرة-<اسمها>-<التاريخ>»، وملف العمل باسمه', () => {
    expect(meta.pdfName).toMatch(/^وثيقة-المبادرة-.+-\d{4}-\d{2}-\d{2}-MI-EX-GOV-V1$/);
    const day = new Date(2026, 10, 24);
    expect(pdfFileName({ initiative: 'موعد أول / أقرب' }, 'working', day)).toBe('ملف-عمل-المبادرة-موعد-أول-أقرب-2026-11-24');
    // محارف الاتجاه الخفية تُحذف، والبديل بعد التنظيف، واللاحقة رقم الوثيقة وإصدارها
    expect(pdfFileName({ initiative: '\u202e\u200f', ref: 'MI-CP-AB12', version: 3 }, 'institutional', day)).toBe('وثيقة-المبادرة-MI-CP-AB12-2026-11-24-AB12-V3');
    expect(pdfFileName({ initiative: '///' }, 'draft', day)).toBe('مسودة-وثيقة-المبادرة-المبادرة-2026-11-24');
    // القص بنقاط الترميز: لا يُشطر حرف خارج BMP، ولا تبقى شرطة في الطرف
    const long = pdfFileName({ initiative: `${'أ'.repeat(59)} 😀😀` }, 'institutional', day);
    expect(long).toBe(`وثيقة-المبادرة-${'أ'.repeat(59)}-2026-11-24`);
    expect(long).not.toMatch(/[\ud800-\udfff]/u);
    expect(documentHtml(meta, body, { pdf: true })).toContain('id="pdf-head"');
    expect(meta.title).toMatch(/[؀-ۿ]/);
  });
  it('الشريط فيه «تحميل PDF» و«طباعة»، والخطوط من المنصة لا من Google (سياسة CSP)', () => {
    const html = documentHtml(meta, body);
    expect(html).toContain('data-act="pdf"');
    expect(html).toContain('<link rel="stylesheet" href="/fonts/fonts.css">');
    expect(documentHtml(meta, body, { pdf: true })).toContain('<html lang="ar" dir="rtl" class="pdf">');
  });
  it('الأقسام التي تبدأ صفحة جديدة معلَّمة، ولكل عنوان في الفهرس موضع لرقم صفحته', () => {
    for (const k of ['toc', 'charter', 'case', 'launch', 'visuals', 'glossary']) expect(body).toContain(`class="cp-anchor cp-np" id="ch-${k}"`);
    expect(body.match(/class="cp-pgno"/g).length).toBe(EXAMPLES[0].sections.length + 5);
  });
});
