// المرحلة 30 (إكمال): بطاقة المبادرة ضمن 3 إلى 5 صفحات. تكثيف البطاقة بأسلوب خاص بها وحدها (LEAN_STYLE)،
// بلا حذف محتوى ولا نزول عن السلم الطباعي، ومع بقاء أحكام المراحل 26 إلى 29: صفحة القرار، ولا فهرس في البطاقة،
// ولا فاصل صفحة لكل باب (لحالة العمل وحدها)، والاعتماد في صفحة مستقلة. عدد الصفحات الفعلي يفرضه e2e/initiative-pdf-reference.spec.js
import { describe, expect, it } from 'vitest';
import { institutionalReport, LEAN_STYLE } from '../../src/lib/brand/institutional.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const build = (track) => { const d = exampleDoc(EXAMPLES[0]); d.meta.track_key = track; return institutionalReport(d); };
const secs = (body) => [...body.matchAll(/<section class="in-sec([^"]*)" id="([^"]+)">/g)].map((m) => ({ np: m[1].includes('np'), id: m[2] }));
const sizes = (css) => [...css.matchAll(/font-size:\s*([\d.]+)pt/g)].map((m) => Number(m[1]));

describe('بطاقة المبادرة: تخطيط ضمن مداها', () => {
  const card = build('M1I1L1');
  it('أسلوب البطاقة وحاويتها في البطاقة وحدها', () => {
    expect(card.form.key).toBe('card');
    expect(card.body).toContain(LEAN_STYLE);
    expect(card.body).toContain('<div class="in-lean-doc">');
    for (const t of ['M2I2L2', 'M3I3L3']) {
      const r = build(t);
      expect(r.form.key).not.toBe('card');
      expect(r.body).not.toContain(LEAN_STYLE);
      expect(r.body).not.toContain('in-lean-doc');
    }
  });
  it('أحكام المراحل 26 إلى 29 باقية: صفحة القرار، وبلا فهرس، والاعتماد وحده صفحة مفروضة', () => {
    expect(card.body).toContain('class="in-dec"');
    expect(card.body).not.toContain('<nav class="in-toc"');
    expect(card.body).not.toContain('class="in-keep"');
    const list = secs(card.body);
    expect(list.map((x) => x.id)).toEqual(['in-initiative-card', 'in-first-days', 'in-approval']);
    expect(list.filter((x) => x.np).map((x) => x.id)).toEqual(['in-approval']);
  });
  it('لا حذف محتوى: خلايا البطاقة وخطة 90 يومًا والمعالم كما هي', () => {
    for (const k of ['المشكلة أو الفرصة', 'الهدف', 'المخرجات', 'مؤشرات النجاح', 'المخاطر', 'المعالم']) expect(card.body).toContain(k);
  });
  it('التكثيف لا ينزل عن السلم الطباعي ولا يغير قواعد الكسر', () => {
    // أرضية 10.5pt لما يلمسه التكثيف وحده (بيان القرار)؛ خلايا البطاقة تبقى على أحجامها الأساسية 9.5pt و8.5pt
    expect(Math.min(...sizes(LEAN_STYLE))).toBeGreaterThanOrEqual(10.5);
    expect(LEAN_STYLE).not.toMatch(/\.in-lean (p|span)\s*\{[^}]*font-size/);
    expect(LEAN_STYLE).not.toMatch(/(table|td|th)[^{]*\{[^}]*font-size/);
    expect(LEAN_STYLE).not.toMatch(/dense/);
    expect(LEAN_STYLE).toContain('.in-lean-doc .in-sec:first-child { margin-top: 0; }');
    expect(LEAN_STYLE).not.toMatch(/break-(before|after|inside)/);
    expect(LEAN_STYLE).not.toMatch(/font-weight:\s*[23]00/);
  });
});
