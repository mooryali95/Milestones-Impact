// المرحلة 22: تباين غلاف الوثيقة. يحسب التباين لكل لون نص في قواعد الغلاف على خلفيته (mist)
// ويفشل دون 4.5:1 للنص العادي و3:1 للعناوين الكبيرة، ويمنع أي وزن دون 300 في الغلاف ورابط الخطوط
import { describe, it, expect } from 'vitest';
import { documentHtml, contrastRatio, C } from './doc.js';

const brand = { name: 'جهة تجريبية', color: '#123456', program: 'برنامج' };
const meta = { kind: 'ORG', title: 'عنوان الوثيقة', subtitle: 'فرعي', rows: [['الحالة', 'مسودة']], brand, stamp: 'مسودة' };
const docs = { plain: documentHtml({ ...meta, brand: undefined }, '<p>x</p>'), brand: documentHtml(meta, '<p>x</p>') };
const css = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (html) => [...css(html).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const COVER = /(^|[\s,])(\.mast|\.thesis|\.eyebrow)\b/;
const coverRules = (html) => rules(html).filter((r) => COVER.test(r.sel));
const LARGE = /\bh1\b|\.nm\b(?!\s+small)/;

describe('تباين غلاف الوثيقة', () => {
  for (const [name, html] of Object.entries(docs)) {
    it(`${name}: كل لون نص في الغلاف يجتاز الحد على mist`, () => {
      const checked = [];
      for (const r of coverRules(html)) {
        const m = r.body.match(/(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})/);
        if (!m) continue;
        const bg = /\.stamp/.test(r.sel) ? C.paper : C.mist;
        const min = LARGE.test(r.sel) ? 3 : 4.5;
        const ratio = contrastRatio(m[1], bg);
        checked.push(r.sel);
        expect(ratio, `${r.sel} ${m[1]} على ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      }
      expect(checked.length).toBeGreaterThan(5);
    });
    it(`${name}: العنوان والقيم والعنوان الفرعي بلون صريح، ووزن العنوان 500`, () => {
      const rs = coverRules(html);
      const get = (sel) => rs.filter((r) => r.sel === sel).map((r) => r.body).join(';');
      expect(get('.mast h1')).toContain(`color: ${C.graphite}`);
      expect(get('.mast h1')).toMatch(/font-weight: 500/);
      expect(get('.mast .meta b')).toContain(`color: ${C.graphite}`);
      expect(get('.mast .sub')).toContain(`color: ${C.slate}`);
      expect(get('.mast')).toContain(`background-color: ${C.mist}`);
      expect(get('.thesis')).toContain(`color: ${C.goldText}`);
      if (name === 'brand') expect(get('.mast.co h1')).toMatch(/font-weight: 500/);
    });
    it(`${name}: لا وزن دون 300 في الغلاف ولا في رابط الخطوط`, () => {
      for (const r of coverRules(html)) {
        for (const [, w] of r.body.matchAll(/font(?:-weight)?:\s*(\d{3})\b/g)) expect(Number(w), r.sel).toBeGreaterThanOrEqual(300);
      }
      const link = html.match(/fonts\.googleapis\.com\/css2\?[^"]+/)[0];
      for (const [, ws] of link.matchAll(/wght@([\d;]+)/g)) for (const w of ws.split(';')) expect(Number(w)).toBeGreaterThanOrEqual(300);
    });
    it(`${name}: الوثيقة فاتحة فقط مع قفل Dark Reader`, () => {
      expect(html).toContain('<meta name="color-scheme" content="light">');
      expect(html).toContain('<meta name="darkreader-lock">');
      expect(css(html)).toMatch(/:root \{ color-scheme: light; \}/);
    });
  }
});
