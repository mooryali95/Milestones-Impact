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

// المرحلة 25: الغلاف الفاخر. صف رسمي واحد، شريط ضبط لاتيني، الختم شارة أفقية، خط الجهة بحماية، الشعار النصي في الإغلاق
import { coverAccent, controlStrip, contrastRatio as cr } from './doc.js';
describe('الغلاف الفاخر (المرحلة 25)', () => {
  const m25 = { kind: 'CP', title: 'عنوان', brand: { name: 'جهة', color: '#123456', logo: 'data:image/png;base64,AAAA' }, stamp: 'مسودة للمراجعة',
    rows: [['الجهة', 'ج'], ['الراعي', 'ر'], ['قائد المبادرة', 'ق'], ['الحالة', 'قيد الاعتماد']], control: controlStrip(['MI-CP-0042', 'V2', '2026-11-26', 'DRAFT']) };
  const h = documentHtml(m25, '<p>x</p>');
  const mast = h.match(/<header class="mast co">([\s\S]*?)<\/header>/)[1];
  const get = (sel) => rules(h).filter((r) => r.sel === sel).map((r) => r.body).join(';');
  it('صف رسمي واحد بثلاثة حقول بوزن 500، بلا «الحالة»', () => {
    expect(mast).toContain('style="--n:3"');
    expect(mast).not.toContain('الحالة');
    expect(get('.mast.co .meta b')).toMatch(/font-weight: 500/);
  });
  it('شريط الضبط لاتيني معزول بالصيغة المعتمدة، ومنقّى من أي حقن', () => {
    expect(mast).toContain('<bdi class="ctl" dir="ltr">MI-CP-0042 · V2 · 2026-11-26 · DRAFT</bdi>');
    expect(controlStrip(['<b>x', 'V1'])).toBe('BX · V1');
    expect(get('.mast .ctl')).toMatch(/7\.5pt/);
  });
  it('العنوان 30pt بتباعد 1.25 مع خط ذهبي قصير، ولا 34pt', () => {
    expect(get('.mast.co h1')).toMatch(/font-size: 30pt/);
    expect(get('.mast.co h1')).toMatch(/line-height: 1\.25/);
    expect(mast).toContain('class="rule"');
    expect(css(h)).not.toMatch(/34pt/);
  });
  it('الختم شارة أفقية هادئة داخل الغلاف لا عائمة مائلة', () => {
    const st = get('.mast .stamp');
    expect(st).toMatch(/font-size: 9pt/); expect(st).toMatch(/font-weight: 500/);
    expect(st).toContain(`color: ${C.goldText}`); expect(st).toContain(`border: 1px solid ${C.gold}`);
    expect(st).not.toMatch(/rotate|position: absolute/);
    expect(mast).toMatch(/class="ctlrow">.*<span class="stamp">مسودة للمراجعة<\/span>/);
    expect(cr(C.goldText, C.paper)).toBeGreaterThanOrEqual(4.5);
  });
  it('لوحة بيضاء تحمي الشعار بحدود 18 مم ارتفاعًا و30 مم عرضًا أدنى', () => {
    expect(mast).toContain('class="org plate"');
    expect(get('.mast.co .org.plate')).toContain(`background-color: ${C.paper}`);
    expect(get('.mast.co .org img')).toMatch(/max-height: 18mm/);
    expect(get('.mast.co .org img')).toMatch(/min-width: 30mm/);
  });
  it('خط الجهة 1.6 مم عبر structuralAccent، وحد جرافيتي حين يقل التباين عن 1.5:1', () => {
    expect(get('.mast .accent')).toMatch(/height: 1\.6mm/);
    expect(css(h)).not.toMatch(/height: 2\.4mm/);
    expect(coverAccent('#123456')).toEqual({ color: '#123456', passes: true, guard: false });
    expect(coverAccent('#EEEEEE').guard).toBe(true);
    expect(coverAccent('#EEEEEE').color).toBe('#EEEEEE');
    expect(coverAccent('red;x')).toBe(null);
    expect(documentHtml({ ...m25, brand: { ...m25.brand, color: '#F0F0F0' } }, '')).toContain('class="accent guard"');
  });
  it('الشعار النصي في الإغلاق لا في الغلاف', () => {
    expect(mast).not.toContain('من النية');
    expect(h.match(/<div class="close">[\s\S]*?<\/div>/)[0]).toContain('من النية… إلى الأثر');
  });
  it('صفحة غلاف كاملة في PDF والطباعة', () => {
    const pdf = documentHtml(m25, '', { pdf: true });
    expect(css(pdf)).toMatch(/html\.pdf \.mast\.co \{ min-height: 1123px/);
    expect(css(pdf)).toMatch(/@page :first \{ margin: 0;/);
  });
});
