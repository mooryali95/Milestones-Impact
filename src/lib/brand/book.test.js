import { describe, expect, it } from 'vitest';
import { bookHtml, coverHtml, parseMd } from './book.js';

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
      [{ key: 'milestone', roman: 'I', label: 'أ', title: 'إدارة' }, { key: 'impact', roman: 'II', label: 'ب', title: 'أثر' }], 'متوسط',
    );
    expect(h).toContain('MI-BK-20261023-ABCDE');
    expect(h).toContain(encodeURIComponent('s@x.sa'));
    expect(h).toContain('<b>مهم</b>');
    expect(h).not.toContain('>إدارة<');
  });
});
