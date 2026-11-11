// الصفوف التي تُفتح بالنقر تُفتح بلوحة المفاتيح أيضًا (التدقيق 2026-11-11، admin-eval-13)، بنمط المشاركين نفسه
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f) => readFileSync(join(__dirname, 'screens', f), 'utf8');

describe('صفوف الخبراء وأثر كل مشارك بلوحة المفاتيح', () => {
  it('صف الخبير يبلغه التبويب ويُفتح بـEnter', () => {
    expect(read('Experts.jsx')).toMatch(/<tr key=\{e\.id\} className="la-click" tabIndex=\{0\} onClick=\{\(\) => onOpen\(e\.id\)\} onKeyDown=\{\(k\) => \{ if \(k\.key === 'Enter'\) onOpen\(e\.id\); \}\}>/);
  });
  it('صف «أثر كل مشارك» يبلغه التبويب ويُفتح بـEnter', () => {
    expect(read('Impact.jsx')).toMatch(/<tr key=\{p\.id\} className="la-click" tabIndex=\{0\} onClick=\{\(\) => onPerson\(p\.id\)\} onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) onPerson\(p\.id\); \}\}>/);
  });
});
