// حجم الوثيقة المؤسسية بشكلها: «حالة العمل» للمسار الاحترافي 18 إلى 25 صفحة، و«ميثاق المبادرة» 8 إلى 12 (document-forms.js).
// القياس الفعلي بالمتصفح (buildPdf في src/lib/brand/pdf.js، chromium، 2026-11-25) على الأمثلة المحلولة الثلاثة:
//   M3I3L3 وM2I3L3 (حالة العمل): 19 صفحة لكل مثال؛ M2I2L2 (الميثاق): 10؛ M1I1L1 (البطاقة): 5.
// هنا تقدير مكافئ بلا متصفح، معايَر على ذلك القياس: صفحتا الغلاف والقرار وصفحة الاعتماد وفواصل الأبواب (نحو 4.5)،
// ثم صفحة لكل نحو 1311 حرفًا من نص الأبواب. يحرس أن يبقى الشكلان في مداهما حين يتغير القالب أو الأمثلة.
import { describe, expect, it } from 'vitest';
import { institutionalReport } from '../../src/lib/brand/institutional.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { exampleDoc } from './guide.js';

const MEASURED = { M3I3L3: 19, M2I3L3: 19, M2I2L2: 10 };
const textOf = (body) => body.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length;
const estimate = (body) => 4.5 + textOf(body) / 1311;
const build = (track, ex) => { const d = exampleDoc(ex); d.meta.track_key = track; return institutionalReport(d); };

describe('عدد صفحات الوثيقة المؤسسية بشكلها', () => {
  for (const [track, pages] of Object.entries(MEASURED)) {
    const form = trackManifest(track).document;
    for (const ex of EXAMPLES) {
      it(`${track} (${form.name}) بمثال ${ex.sector}: في مدى ${form.pages.join(' إلى ')} وقريب من المقيس`, () => {
        const r = build(track, ex);
        expect(r.form.key).toBe(form.key);
        const n = estimate(r.body);
        expect(Math.abs(n - pages)).toBeLessThan(1.5);
        expect(n).toBeGreaterThanOrEqual(form.pages[0]);
        expect(n).toBeLessThanOrEqual(form.pages[1]);
      });
    }
  }
  it('حالة العمل تفتح كل باب بسؤال صاحب القرار من الشرائح، وفيها الشراء والتعاقد ومصطلحات الوثيقة', () => {
    const r = build('M3I3L3', EXAMPLES[0]);
    const q = trackManifest('M3I3L3').card.support.case.questions;
    for (const k of ['strategic', 'economic', 'commercial', 'financial', 'management']) expect(r.body).toContain(q[k]);
    expect(r.body).toContain('الشراء والتعاقد');
    expect(r.body).toContain('مصطلحات الوثيقة');
    expect(trackManifest('M3I3L3').document.sections).toEqual(['decision', 'overview', 'why', 'value', 'plan', 'commercial', 'governance', 'impact', 'glossary', 'approval']);
    // الميثاق لا يأخذ ما يخص حالة العمل
    const c = build('M2I2L2', EXAMPLES[0]);
    expect(c.body).not.toContain('الشراء والتعاقد');
    expect(c.body).not.toContain('مصطلحات الوثيقة');
  });
});
