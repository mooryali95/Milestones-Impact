// المرحلة 28: التمييز بين الحية والمعتمدة. العلامة المائية في كل صفحة من الحية وتغيب عن المعتمدة،
// والترويسة «مسودة للمراجعة · غير معتمدة»، والختم الذهبي في إغلاق المعتمدة وحدها، وصفحة الاعتماد بماسة لا برقم
import { describe, expect, it } from 'vitest';
import { documentHtml, WATERMARK } from '../../src/lib/brand/doc.js';
import { stampWatermark } from '../../src/lib/brand/pdf.js';
import { institutionalReport } from '../../src/lib/brand/institutional.js';
import { DOC_LIVE_HEAD_AR, DOC_WATERMARK_AR, DOC_LIVE_AR } from '../../supabase/functions/leaders-api/labels.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const org = { name: 'التجمع الصحي الأول', logo: null, color: '#1F6F5C' };
function docOf(status) {
  const d = exampleDoc(EXAMPLES[0]);
  return {
    ...d,
    meta: { ...d.meta, example: false, status, approved_at: status === 'approved' ? '2027-01-10T09:00:00Z' : null, version: 2, ref: 'MI-CP-1A2B3C4D', org, participant: { name: 'سارة' } },
    review: { score: 86, scores: {}, notes: {} },
  };
}
const build = (status, opts) => { const r = institutionalReport(docOf(status)); return { r, html: documentHtml(r.meta, r.body, opts) }; };
const count = (s, re) => (s.match(re) || []).length;

// jsPDF مقلَّد: يسجل ما يُرسم في كل صفحة
function fakePdf(n) {
  const calls = [];
  let page = 1;
  return {
    calls,
    getNumberOfPages: () => n,
    setPage: (p) => { page = p; },
    saveGraphicsState: () => calls.push([page, 'save']),
    restoreGraphicsState: () => calls.push([page, 'restore']),
    GState: function GState(o) { Object.assign(this, o); },
    setGState: (g) => calls.push([page, 'gstate', g.opacity]),
    addImage: (...a) => calls.push([page, 'image', a[2], a[3], a[4], a[5]]),
  };
}

describe('نصوص الحية من labels.js', () => {
  it('الترويسة ونص العلامة', () => {
    expect(DOC_LIVE_HEAD_AR).toBe('مسودة للمراجعة · غير معتمدة');
    expect(DOC_WATERMARK_AR).toBe(DOC_LIVE_AR);
    expect(WATERMARK).toEqual({ text: DOC_WATERMARK_AR, angle: 30, size: 54, color: '#0B272F', opacity: 0.045 });
  });
});

describe('الحية', () => {
  const { r, html } = build('draft');
  it('الوثيقة الحية معلّمة live', () => expect(r.meta.live).toBe(true));
  it('العلامة المائية عنصر ثابت يتكرر في كل صفحة مطبوعة، بالزاوية والحجم واللون والشفافية', () => {
    expect(count(html, /class="wm"/g)).toBe(1);
    expect(html).toContain(`<span>${DOC_WATERMARK_AR}</span>`);
    expect(html).toMatch(/html:not\(\.pdf\) \.wm \{ display: flex; position: fixed; inset: 0;/);
    expect(html).toContain('rotate(-30deg)');
    expect(html).toContain('font: 500 54pt');
    expect(html).toContain('color: #0B272F; opacity: 0.045;');
  });
  it('الترويسة «مسودة للمراجعة · غير معتمدة» بدل اسم الباب', () => {
    expect(html).toContain(`@top-right { content: "${DOC_LIVE_HEAD_AR}";`);
    expect(html).not.toContain('content: string(chapter)');
  });
  it('لا ختم ذهبي: حلقة رمادية منقطة في الاعتماد، وعلامة Milestone الصغيرة في الإغلاق', () => {
    expect(html).not.toContain('class="seal"');
    expect(html).toContain('class="ring"');
    expect(html).toContain('stroke-dasharray="2 3"');
    expect(html).toMatch(/<span class="mi-mark" aria-hidden="true"><svg/);
  });
  it('ملف pdf.js لا يحمل العنصر (يرسمها طبقة بـ jsPDF)', () => {
    expect(build('draft', { pdf: true }).html).not.toContain('class="wm"');
  });
  it('طبقة jsPDF في كل صفحة، صورة الصفحة كاملة بشفافية 0.045', () => {
    const pdf = fakePdf(7);
    expect(stampWatermark(pdf, 'data:image/png;base64,x')).toBe(7);
    for (let p = 1; p <= 7; p++) {
      const on = pdf.calls.filter((c) => c[0] === p).map((c) => c[1]);
      expect(on).toEqual(['save', 'gstate', 'image', 'restore']);
    }
    expect(pdf.calls.filter((c) => c[1] === 'gstate').every((c) => c[2] === 0.045)).toBe(true);
    expect(pdf.calls.find((c) => c[1] === 'image').slice(2)).toEqual([0, 0, 595.28, 841.89]);
  });
});

describe('المعتمدة', () => {
  const { r, html } = build('approved');
  it('نظيفة بلا علامة مائية، والترويسة باسم الباب', () => {
    expect(r.meta.live).toBe(false);
    expect(html).not.toContain('class="wm"');
    expect(html).not.toContain(DOC_WATERMARK_AR + '</span></div>');
    expect(html).not.toContain(DOC_LIVE_HEAD_AR);
    expect(html).toContain('content: string(chapter)');
  });
  it('الختم الذهبي مرة واحدة، في الإغلاق، بقطر 34 مم', () => {
    expect(count(html, /class="seal"/g)).toBe(1);
    expect(html).toMatch(/<div class="close">[\s\S]*class="seal"[^>]*width:34mm;height:34mm[\s\S]*<\/div>\s*<footer class="rights">/);
    expect(html).not.toContain('class="ring"');
  });
  it('صفحة الاعتماد بماسة ولا تأخذ رقمًا تسلسليًا', () => {
    const m = html.match(/<span class="n">([^<]+)<\/span><div><span class="eyebrow">Approval<\/span>/);
    expect(m?.[1]).toBe('◆');
  });
});
