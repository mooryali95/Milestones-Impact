// المرحلة 29: أبواب حالة العمل. كل باب صفحة، والميثاق انسياب بحاجز 60 مم، وفاتحة الباب بسؤال صاحب القرار من
// decision-questions.json، وفهرس سطر القرار بأرقام target-counter، والافتراضات من RAID، وفصل نجاح المشروع عن نجاح المنافع.
import { describe, expect, it } from 'vitest';
import { assumptionsOf, institutionalReport } from '../../src/lib/brand/institutional.js';
import { capstoneReport, STYLE } from '../../src/lib/brand/capstone.js';
import { chapterQuestion, doorQuestion, DECISION_QUESTIONS } from '../../src/lib/brand/decision-questions.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json' with { type: 'json' };
import { DOC_DOORS_AR } from '../../supabase/functions/leaders-api/labels.js';
import { trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { exampleDoc } from './guide.js';

const build = (track, ex = EXAMPLES[0], opt) => { const d = exampleDoc(ex); d.meta.track_key = track; return institutionalReport(d, opt); };
const secs = (body) => [...body.matchAll(/<section class="in-sec([^"]*)" id="([^"]+)">/g)].map((m) => ({ np: m[1].includes('np'), id: m[2], flow: body.slice(m.index, m.index + 400).includes('in-keep') }));
const IMPACT_Q = 'هل يبقى ما تحقق بعد انتهاء المبادرة، ومن يحمله؟';

describe('مصدر أسئلة صاحب القرار', () => {
  it('الملف بجانب fields.json، وفيه سؤال باب الأثر، وكل باب وفصل يُحل إلى مفتاح', () => {
    expect(FIELDS).toBeTruthy();
    expect(DECISION_QUESTIONS.questions.impact).toBe(IMPACT_Q);
    expect(doorQuestion('Impact')).toBe(IMPACT_Q);
    expect(chapterQuestion('change-sustain')).toBe(IMPACT_Q);
    const q = trackManifest('M3I3L3').card.support.case.questions;
    expect(doorQuestion('Commercial', q)).toBe(q.commercial);
    expect(chapterQuestion('procurement', q)).toBe(q.commercial);
    expect(doorQuestion('Overview', q)).toBeNull();
  });
});

describe('حالة العمل: كل باب يبدأ صفحة', () => {
  const r = build('M3I3L3');
  const list = secs(r.body);
  it('كل باب بعد الأول صفحة مفروضة، والأول بعد صفحة القرار', () => {
    expect(r.form.key).toBe('case');
    expect(list.length).toBeGreaterThan(6);
    expect(list.slice(1).every((x) => x.np)).toBe(true);
    expect(list.some((x) => x.flow)).toBe(false);
    expect(r.body).toContain('class="in-dec"');
  });
  it('كل باب يفتح بسؤال صاحب القرار بخطه الجانبي، ومنه باب الأثر', () => {
    const q = trackManifest('M3I3L3').card.support.case.questions;
    for (const k of ['strategic', 'economic', 'commercial', 'financial', 'management']) expect(r.body).toContain(`<p class="ask">${q[k]}</p>`);
    expect(r.body).toContain(`<p class="ask">${IMPACT_Q}</p>`);
  });
  it('فهرس سطر أسفل صفحة القرار بأرقام target-counter لكل باب', () => {
    const dec = r.body.slice(r.body.indexOf('class="in-dec"'), r.body.indexOf('</section>', r.body.indexOf('class="in-dec"')));
    expect(dec).toContain(`<nav class="in-toc" aria-labelledby="in-toc-h"><span id="in-toc-h">${DOC_DOORS_AR.toc}</span>`);
    for (const x of list) expect(dec).toContain(`<span class="cp-pgno" data-ref="#${x.id}"></span>`);
    expect(STYLE).toContain('target-counter(attr(data-ref url), page)');
  });
  it('الافتراضات من RAID حيث نوعها افتراض، ولا تتكرر في المخاطر', () => {
    const d = exampleDoc(EXAMPLES[0]);
    const a = assumptionsOf(d);
    expect(a.length).toBe(1);
    expect(r.body).toContain(`<b>${DOC_DOORS_AR.assumptions}</b>`);
    // خارج خريطة المخاطر (تلميح SVG يرسم كل بنود السجل): مرة واحدة في بابه
    expect((r.body.replace(/<svg[\s\S]*?<\/svg>/g, '').match(new RegExp(a[0].title, 'g')) || []).length).toBe(1);
  });
  it('نجاح المشروع (النطاق والوقت والكلفة) منفصل عن نجاح المنافع وقبله', () => {
    const p = r.body.indexOf('data-success="project"'), b = r.body.indexOf('data-success="benefits"');
    expect(p).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(p);
    const proj = r.body.slice(p, b);
    for (const k of [DOC_DOORS_AR.scope, DOC_DOORS_AR.time, DOC_DOORS_AR.cost]) expect(proj).toContain(`<span>${k}</span>`);
  });
  it('لا مصطلح SROI بلا حقوله (deadweight وdisplacement وdrop off)', () => {
    expect(r.body).not.toMatch(/SROI|العائد الاجتماعي على الاستثمار/);
  });
  it('ملف العمل يفتتح الفصل المقابل بالسؤال نفسه', () => {
    const d = exampleDoc(EXAMPLES[0]); d.meta.track_key = 'M3I3L3';
    expect(capstoneReport(d).body).toContain(IMPACT_Q);
  });
});

describe('الميثاق والبطاقة', () => {
  it('الميثاق انسياب متصل بحاجز 60 مم، وبفهرس سطر، وبلا أسئلة', () => {
    const r = build('M2I2L2');
    expect(r.form.key).toBe('charter');
    const list = secs(r.body);
    expect(list.filter((x) => x.np).map((x) => x.id)).toEqual(['in-approval']);
    expect(list.slice(1).filter((x) => !x.np).every((x) => x.flow)).toBe(true);
    expect(r.body).toContain('.in-keep { display: block; height: 60mm; margin-bottom: -60mm; break-inside: avoid;');
    expect(r.body).toContain('class="in-toc"');
    expect(r.body).not.toContain('class="ask"');
    expect(r.body).not.toContain(IMPACT_Q);
  });
  it('البطاقة بلا فهرس ولا حاجز', () => {
    const r = build('M1I1L1');
    expect(r.form.key).toBe('card');
    expect(r.body).not.toContain('<nav class="in-toc"');
    expect(r.body).not.toContain('class="in-keep"');
  });
});

describe('المرحلة 29: مراجعة', () => {
  it('عدد المخرجات بلا تكرار المثنى', () => {
    expect(DOC_DOORS_AR.deliverables(2)).toBe('مخرجان بمعيار قبول');
    expect(DOC_DOORS_AR.deliverables(1)).toBe('1 مخرج بمعيار قبول');
    expect(DOC_DOORS_AR.deliverables(3)).toBe('3 مخرجات بمعيار قبول');
  });
  it('عنوان الباب اللاتيني بتباين AA', async () => {
    const { contrastRatio } = await import('../../src/lib/brand/doc.js');
    expect(contrastRatio('#5F7176', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
