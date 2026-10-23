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
