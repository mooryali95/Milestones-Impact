import { describe, expect, it } from 'vitest';
import { bookHtml, coverHtml, parseMd, readingBlocks } from './book.js';

describe('كتاب القائد', () => {
  it('parseMd يميز العناوين والقوائم والاقتباس والفقرات', () => {
    expect(parseMd('## عنوان\nسطر\nتابع\n\n- بند\n2. مرقم\n> قول').map((b) => b.type)).toEqual(['h2', 'p', 'li', 'li', 'quote']);
  });
  it('الغلاف يرمّز الاسم', () => {
    expect(coverHtml({ name: '<سارة>', title: 'مسار' })).toContain('&lt;سارة&gt;');
  });
  it('النسخة تحمل رقمها وعلامتها المائية وتعرض الأجزاء التي فيها أبواب فقط', () => {
    const h = bookHtml(
      { ref: 'MI-BK-20261023-ABCDE', issued_at: '2026-10-23T09:00:00Z', name: 'سارة', email: 's@x.sa', chapters: [{ dimension: 'impact', title: 'باب', md: '**مهم** نص' }] },
      [{ key: 'milestone', roman: 'I', label: 'أ', title: 'إدارة' }, { key: 'impact', roman: 'II', label: 'ب', title: 'أثر' }],
    );
    expect(h).toContain('MI-BK-20261023-ABCDE');
    expect(h).toContain(encodeURIComponent('s@x.sa'));
    expect(h).toContain('<b>مهم</b>');
    expect(h).not.toContain('<small>أ</small><b>إدارة</b>');
  });
});

describe('إنفوجرافيك الكتاب', () => {
  const html = (md) => bookHtml({ ref: 'MI-BK-20261023-ABCDE', issued_at: '2026-10-23T09:00:00Z', name: 'س', email: 'e', code: 'M1I2L3', chapters: [{ dimension: 'impact', title: 'ب', md, reflection: 'سؤال؟' }] }, [{ key: 'impact', roman: 'II', label: 'ب', title: 'أثر' }]);
  it('قائمة «**مصطلح**: شرح» تصير بطاقات، والمرقّمة خطوات، وآخر اقتباس فكرة محورية', () => {
    const h = html('- **أ**: شرح\n- **ب**: شرح\n\n1. خطوة\n2. خطوة\n3. خطوة\n\n> أولى\n\n> الخلاصة');
    expect(h).toContain('class="cards"');
    expect(h).toContain('class="steps"');
    expect(h).toMatch(/class="key"><small>الفكرة المحورية<\/small><p>الخلاصة/);
    expect(h).toContain('class="reflect"');
    expect(h).toContain('M1I2L3');
  });
});

describe('رسوم الكتاب', () => {
  const md = '@chain السلسلة\nالمخرجات: ما يُسلَّم\nالمنافع: التحسن\n\n@compare مقارنة\nأ | ب\nالمعنى | س | ص\n\nنص بعدها';
  it('@النوع يُقرأ رسمًا حتى أول سطر فارغ', () => {
    const b = parseMd(md);
    expect(b.map((x) => x.type)).toEqual(['fig', 'fig', 'p']);
    expect(b[0]).toMatchObject({ kind: 'chain', title: 'السلسلة', lines: ['المخرجات: ما يُسلَّم', 'المنافع: التحسن'] });
  });
  it('القراءة على اللوحة تبسّط الرسم إلى عنوان وبنود', () => {
    expect(readingBlocks(md).slice(0, 3).map((x) => x.type)).toEqual(['h3', 'li', 'li']);
  });
  it('النسخة ترسم السلسلة والمقارنة', () => {
    const h = bookHtml({ ref: 'MI-BK-20261023-ABCDE', issued_at: '2026-10-23T09:00:00Z', name: 'س', email: 'e', chapters: [{ dimension: 'impact', title: 'ب', md }] }, [{ key: 'impact', roman: 'II', label: 'ب', title: 'أثر' }]);
    expect(h).toContain('class="f-chain"');
    expect(h).toContain('class="f-compare"');
  });
});

// طبعة الجزء (تصور «أجزاء الكتاب وخبير المحتوى»، المرحلة 2): كتيب مكتمل ببداية ونهاية، ولا باب من جزء آخر
describe('طبعة الجزء', () => {
  const PARTS = [
    { key: 'milestone', roman: 'I', label: 'الجزء الأول · Milestone', title: 'إدارة المشروعات' },
    { key: 'impact', roman: 'II', label: 'الجزء الثاني · Impact', title: 'تحويل المشروع إلى أثر' },
    { key: 'leadership', roman: 'III', label: 'الجزء الثالث · Leadership', title: 'تمكين القائد' },
  ];
  const BOOK = {
    ref: 'MB-v31-20261116-II', issued_at: '2026-11-16T09:00:00Z', name: 'د. هند', email: 'h@x.sa', code: 'MASTER v3.1', edition: 'نسخة المراجعة',
    chapters: [
      { id: 'm1', dimension: 'milestone', title: 'باب المعالم الوحيد', md: 'نص' },
      { id: 'i1', dimension: 'impact', title: 'تمهيد الأثر', md: '**◆ للمتوسط فأعلى**\nفقرة\n**◇ عودة إلى النص العام**' },
      { id: 'i2', dimension: 'impact', title: 'خاتمة الأثر', md: 'نص' },
      { id: 'l1', dimension: 'leadership', title: 'باب القيادة الوحيد', md: 'نص' },
    ],
  };
  const h = bookHtml(BOOK, PARTS, { part: 'impact' });
  const pos = (needle) => { const i = h.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };

  it('الترتيب: غلاف الجزء، ثم «عن هذا الجزء»، ثم فهرسه، ثم صفحة الجزء وأبوابه، ثم «يتكامل مع»، ثم الغلاف الخلفي', () => {
    const order = [
      pos('<p class="bk-part">الجزء الثاني من ثلاثة · تحويل المشروع إلى أثر</p>'),
      pos('<h2>عن هذا الجزء</h2>'),
      pos('<h2>محتويات الجزء</h2>'),
      pos('<section class="full part">'),
      pos('<h2>تمهيد الأثر</h2>'),
      pos('<h2>خاتمة الأثر</h2>'),
      pos('<h2>يتكامل مع</h2>'),
      pos('<section class="full back">'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).toContain('نسخة المراجعة');
    expect(h).toContain('MASTER v3.1');
  });
  it('الفهرس فيه أبواب الجزء وحدها، ولا باب من جزء آخر في الطبعة كلها', () => {
    const toc = h.slice(pos('<h2>محتويات الجزء</h2>'), pos('<section class="full part">'));
    expect(toc).toContain('تمهيد الأثر');
    expect(toc).toContain('خاتمة الأثر');
    expect(h).not.toContain('باب المعالم الوحيد');
    expect(h).not.toContain('باب القيادة الوحيد');
    expect(h.match(/<article class="ch/g)).toHaveLength(2);
    // لا شيء من مقدمات الكتاب الكامل ولا خاتمته
    expect(h).not.toContain('كيف تقرأ هذا الكتاب');
    expect(h).not.toContain('<section class="end">');
  });
  it('«عن هذا الجزء» فيه خريطة الأجزاء والجزء مميز، ونصوص parts.json، ودليل علامات المستويات الموجودة في الجزء', () => {
    const about = h.slice(pos('<h2>عن هذا الجزء</h2>'), pos('<h2>محتويات الجزء</h2>'));
    expect(about).toMatch(/<div class="fw-n on"><span>II<\/span>/);
    expect(about.match(/class="fw-n/g)).toHaveLength(3);
    expect(about).toContain('هذا الجزء جسر المنظومة');
    expect(about).toContain('كيف يُقرأ');
    expect(about).toContain('◆ للمتوسط فأعلى');
    expect(about).toContain('◇ عودة إلى النص العام');
  });
  it('«يتكامل مع» يضع الجزء في السلسلة، ويعرّف بالجزأين الآخرين، ويقترح ما يُقرأ بعده', () => {
    const br = h.slice(pos('<h2>يتكامل مع</h2>'), pos('<section class="full back">'));
    expect(br).toMatch(/<div class="node on"><span>II<\/span>/);
    expect(br).toContain('إدارة المشروعات');
    expect(br).toContain('تمكين القائد');
    expect(br).toContain('الحلقة الوسطى');
    expect(br).toContain('ماذا تقرأ بعد هذا الجزء');
  });
  it('الغلاف الخلفي يحمل الإصدار والتاريخ والمرجع واسم القارئ وبريده، والعلامة المائية على الصفحات', () => {
    const back = h.slice(pos('<section class="full back">'));
    expect(back).toContain('MASTER v3.1');
    expect(back).toContain('MB-v31-20261116-II');
    expect(back).toContain('مرخصة لـ د. هند · h@x.sa');
    expect(back).toContain('الجزء الثاني من ثلاثة');
    expect(h).toContain(encodeURIComponent('h@x.sa'));
  });
  it('نصوص الطبعة قابلة للتمرير، والجزء غير المعروف يُرفض', () => {
    const t = { legend: 'دليل', parts: { impact: { about: { lead: 'نص تجريبي', read: ['خطوة'] }, bridges: { place: 'موقع', with: { milestone: 'م', leadership: 'ق' }, next: 'التالي' } } } };
    expect(bookHtml(BOOK, PARTS, { part: 'impact', texts: t })).toContain('نص تجريبي');
    expect(() => bookHtml(BOOK, PARTS, { part: 'nope' })).toThrow();
  });
  it('الكتاب كاملًا يُختم بالغلاف الخلفي نفسه بعد صفحة الختام', () => {
    const full = bookHtml(BOOK, PARTS);
    expect(full.indexOf('<section class="full back">')).toBeGreaterThan(full.indexOf('<section class="end">'));
    expect(full).toContain('مرخصة لـ د. هند · h@x.sa');
    expect(full).toContain('باب المعالم الوحيد');
  });
});
