// المرحلة 4 من تصور فخامة ملف المبادرة: السلم الطباعي سبع درجات من TYPE_SCALE وحده، وكل حجم خط في أنماط
// الوثيقة (doc.js وinstitutional.js وcapstone.js) منها؛ فلا حجم يتيم ولا رقم مكتوب باليد خارج السلم
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentHtml, TYPE_SCALE, TYPE_STEPS } from './doc.js';
import { STYLE, ANNEX_STYLE } from './capstone.js';
import { IN_STYLE, LEAN_STYLE } from './institutional.js';

const SCALE = [7.5, 8.5, 9, 10.5, 12, 18, 30];
// أحجام الخط في CSS: font-size وصيغة font المختصرة (400 9pt/1.2 ...)
const sizes = (css) => {
  const out = [];
  for (const m of css.matchAll(/font-size:\s*([0-9.]+)(pt|px)/g)) out.push(`${m[1]}${m[2]}`);
  for (const m of css.matchAll(/font:\s*[^;"]*?\b([0-9.]+)(pt|px)(?:\/[0-9.]+)?\s/g)) out.push(`${m[1]}${m[2]}`);
  return out;
};
const outside = (css) => sizes(css).filter((s) => !(s.endsWith('pt') && SCALE.includes(Number.parseFloat(s))));

describe('السلم الطباعي لملف المبادرة', () => {
  it('سبع درجات بالقيم المعتمدة، وفيه التسمية 8.5 والصغير 9', () => {
    expect(TYPE_STEPS).toEqual(SCALE);
    expect(TYPE_SCALE).toMatchObject({ footer: 7.5, caption: 8.5, small: 9, body: 10.5, h3: 12, chapter: 18, display: 30 });
  });
  it('أنماط doc.js كلها من السلم', () => {
    const html = documentHtml({ title: 'ت', brand: { name: 'ج', color: '#0B272F' } }, '<p>x</p>');
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    expect(sizes(css).length).toBeGreaterThan(20);
    expect(outside(css)).toEqual([]);
  });
  it('أنماط capstone.js وinstitutional.js كلها من السلم', () => {
    for (const css of [STYLE, ANNEX_STYLE, IN_STYLE, LEAN_STYLE]) expect(outside(css)).toEqual([]);
  });
  it('متن ملف العمل 10.5pt بتباعد 1.75، وH3 موحد 12pt', () => {
    expect(STYLE).toMatch(/\.cp-p \{[^}]*font-size: 10\.5pt; line-height: 1\.75;/);
    for (const css of [STYLE, ANNEX_STYLE, IN_STYLE, LEAN_STYLE]) {
      for (const m of css.matchAll(/h3[^{,]*\{[^}]*font-size:\s*([0-9.]+)pt/g)) expect(m[1]).toBe('12');
    }
  });
  it('لا حجم خط مكتوب باليد في المصدر: كل حجم مربوط بـTYPE_SCALE', () => {
    for (const f of ['doc.js', 'institutional.js', 'capstone.js']) {
      const src = readFileSync(resolve('src/lib/brand', f), 'utf8');
      expect(sizes(src), f).toEqual([]);
    }
  });
});
