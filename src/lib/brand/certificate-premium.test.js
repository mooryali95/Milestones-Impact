// فخامة الشهادة (تصور الفخامة 2026-11-27، المرحلة 2): الخط المحلي، والسلم، وكتلة التوقيع، والختم، والدفعة والجهة، والتحميل المتجهي
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { certificateHtml, nameSize, CERT_TYPE, ISSUER_AR } from './certificate.js';

const base = {
  serial: 'MI-LDR-2026-7K3QX9', name_ar: 'سارة الأحمد', name_en: 'Sarah Alahmad', program_ar: 'برنامج القادة', program_en: 'Leaders Program',
  issued_at: '2026-10-23T09:00:00Z', start: '2026-01-10', end: '2026-06-30', signatories: [], verify_url: 'https://leaders.sunkvalue.com/v/MI-LDR-2026-7K3QX9',
};
// قاعدة CSS لمحدد بعينه من نص الشهادة
const rule = (h, sel) => {
  const m = h.match(new RegExp(`(?:^|\\n|\\}\\s*)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('فخامة الشهادة: الخط', () => {
  it('خطوط المنصة المستضافة ذاتيًا، لا Google Fonts التي تمنعها سياسة المحتوى', () => {
    const h = certificateHtml(base, '<svg></svg>');
    expect(h).toContain('<link rel="stylesheet" href="/fonts/fonts.css">');
    expect(h).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
  it('لا وزن دون 400 في أي قاعدة', () => {
    const h = certificateHtml(base, '<svg></svg>');
    const css = h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
    expect(css).not.toMatch(/font-weight:\s*[23]00\b/);
    expect(css).not.toMatch(/font:\s*[23]00\b/);
  });
  it('الطباعة تنتظر الخطوط: writeCertificate يطبع بعد document.fonts.ready', () => {
    const src = readFileSync('src/lib/brand/certificate.js', 'utf8');
    expect(src).toMatch(/fonts\?\.ready/);
    expect(src).toMatch(/await ready\(win\);\s*win\.print\(\)/);
  });
});

describe('فخامة الشهادة: السلم', () => {
  const h = certificateHtml(base, '<svg></svg>');
  it('الاسم أبرز من العنوان: 40pt وزن 500، والعنوان 28pt وزن 400', () => {
    expect(CERT_TYPE.name).toBe(40);
    expect(CERT_TYPE.title).toBe(28);
    expect(rule(h, '.name')).toMatch(/font-weight: 500/);
    expect(rule(h, '.name')).toMatch(/font-size: 40pt/);
    expect(rule(h, '.kind')).toMatch(/font-weight: 400/);
    expect(rule(h, '.kind')).toMatch(/font-size: 28pt/);
  });
  it('المتن 12pt وزن 400 بتباعد 1.8', () => {
    expect(rule(h, '.body')).toMatch(/font-size: 12pt/);
    expect(rule(h, '.body')).toMatch(/line-height: 1\.8/);
  });
  it('التحقق 7.5pt، والرقم والرابط 8pt، والحقوق 7pt، وQR 19mm', () => {
    expect(rule(h, '.verify dl')).toMatch(/font-size: 7\.5pt/);
    expect(rule(h, '.verify dd.ltr')).toMatch(/8pt/);
    expect(rule(h, '.rights')).toMatch(/font-size: 7pt/);
    expect(rule(h, '.verify .qr')).toMatch(/width: 19mm; height: 19mm/);
  });
  it('العنوان الإنجليزي بتباعد 0.28em', () => {
    expect(rule(h, '.kind-en')).toMatch(/letter-spacing: \.28em/);
  });
  it('الكتلة السفلية مرفوعة 6mm (23mm من الحافة بدل 17mm)', () => {
    expect(rule(h, '.content')).toMatch(/inset: 18mm 24mm 23mm/);
  });
  it('الاسم الطويل يصغر بدرجات ولا يكسر التكوين', () => {
    expect(nameSize('سارة الأحمد')).toBe(40);
    expect(nameSize('عبدالرحمن بن عبدالعزيز بن محمد آل سعود')).toBeLessThan(40);
    expect(nameSize('ا'.repeat(80))).toBeGreaterThanOrEqual(24);
    const long = certificateHtml({ ...base, name_ar: 'عبدالرحمن بن عبدالعزيز بن محمد بن عبدالله آل سعود' }, '');
    expect(long).toMatch(/<h2 class="name" style="font-size: (\d+)pt">/);
    expect(Number(long.match(/<h2 class="name" style="font-size: (\d+)pt">/)[1])).toBeLessThan(40);
  });
});

describe('فخامة الشهادة: التوقيع والختم والتاريخ', () => {
  it('الموقّع من الإعداد: اسمه وصفته بالعربية، والخط 58mm، والاسم 10pt وزن 500 والصفة 8pt', () => {
    const h = certificateHtml({ ...base, signatories: [{ name: 'د. أحمد العلي', title: 'مدير البرنامج' }] }, '');
    expect(h).toContain('<b>د. أحمد العلي</b><span>مدير البرنامج</span>');
    expect(rule(h, '.attest')).toMatch(/width: 58mm/);
    expect(rule(h, '.attest b')).toMatch(/font-weight: 500; font-size: 10pt/);
    expect(rule(h, '.attest span')).toMatch(/font-size: 8pt/);
  });
  it('بلا موقّع: اسم الجهة المصدرة بالعربية، بلا توقيع مصطنع', () => {
    const h = certificateHtml(base, '');
    // اسم الجهة عربي الأساس واسم المنصة اللاتيني معزول، فلا ينقلب ترتيبه في كتلة التوقيع
    expect(h).toContain('<b dir="rtl">منصة <bdi dir="ltr">Milestone Impact</bdi></b>');
    expect(h).not.toContain('class="issuer"');
    expect(h).toMatch(/<div class="ink"><\/div>/);
  });
  it('تاريخ الإصدار مرة واحدة', () => {
    const h = certificateHtml(base, '');
    const issued = new Date(base.issued_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(h.split(issued).length - 1).toBe(1);
  });
  it('الختم بلغتين: نص عربي مع الحلقة الإنجليزية', () => {
    const h = certificateHtml(base, '');
    const seal = h.slice(h.indexOf('<svg class="cseal"'), h.indexOf('</svg>', h.indexOf('<svg class="cseal"')));
    expect(seal).toContain('شهادة معتمدة');
    expect(seal).toContain('M');
  });
});

describe('فخامة الشهادة: الدفعة والجهة', () => {
  it('الدفعة والجهة تُطبعان ولو بلا شعار', () => {
    const h = certificateHtml({ ...base, cohort_ar: 'الدفعة الثالثة', org: { name: 'هيئة التطوير', logo: null } }, '');
    expect(h).toContain('الدفعة الثالثة');
    expect(h).toContain('هيئة التطوير');
  });
  it('الجهة بشعارها لا تتكرر في المتن', () => {
    const h = certificateHtml({ ...base, org: { name: 'هيئة التطوير', logo: 'data:image/png;base64,AA' } }, '');
    expect(h.split('هيئة التطوير').length - 1).toBe(2);   // نص بديل الشعار، و«بالشراكة مع»
  });
});

describe('فخامة الشهادة: التحميل', () => {
  it('زر «تحميل PDF» أولًا، والطباعة بجانبه', () => {
    const h = certificateHtml(base, '');
    expect(h).toMatch(/<button class="pri" data-act="pdf">تحميل PDF<\/button><button data-act="print">طباعة<\/button>/);
  });
  it('نسخة الخادم بلا شريط وبأساس الخطوط', () => {
    const h = certificateHtml(base, '', { print: true, base: 'https://leaders.example/' });
    expect(h).not.toContain('class="toolbar"');
    expect(h).toContain('<base href="https://leaders.example/">');
    expect(h.startsWith('<!doctype html>')).toBe(true);
  });
  it('التحميل عبر المولّد المتجهي، والطباعة بديل حين يتعذر', () => {
    const src = readFileSync('src/lib/brand/certificate.js', 'utf8');
    expect(src).toMatch(/embedAssets\(certificateHtml\(c, qr, \{ \.\.\.opts, print: true, base: `\$\{location\.origin\}\/` \}\)/);
    expect(src).toMatch(/fetch\(`\$\{server\.url\}\/pdf`/);
    expect(src).toMatch(/catch[\s\S]{0,200}win\.print\(\)/);
  });
});

describe('فخامة الشهادة: الختم لا يشهد لما ليس شهادة سارية', () => {
  const sealOf = (h) => h.slice(h.indexOf('<svg class="cseal"'), h.indexOf('</svg>', h.indexOf('<svg class="cseal"')));
  it('النموذج للعرض والشهادة الموسومة بحالة (ملغاة) بلا «شهادة معتمدة» ولا CERTIFIED في الختم', () => {
    for (const h of [certificateHtml({ ...base, sample: true }, ''), certificateHtml(base, '<svg></svg>', { status: 'ملغاة' })]) {
      const seal = sealOf(h);
      expect(seal).not.toContain('شهادة معتمدة');
      expect(seal).not.toMatch(/C<\/text>.*E<\/text>.*R<\/text>.*T<\/text>.*I<\/text>.*F<\/text>.*I<\/text>.*E<\/text>.*D<\/text>/s);
      expect(seal).not.toContain('>CERTIFIED<');
    }
  });
  it('الشهادة السارية تبقي الختم بلغتين', () => {
    const seal = sealOf(certificateHtml(base, '<svg></svg>'));
    expect(seal).toContain('شهادة معتمدة');
    expect(seal).toContain('>CERTIFIED<');
  });
});
