// الوثيقة المؤسسية وملف العمل الكامل (التصور المعتمد، الخيار ب، 2026-11-24)
import { describe, expect, it } from 'vitest';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { documentHtml } from '../../src/lib/brand/doc.js';
import { fingerprint, institutionalReport, missingMessage } from '../../src/lib/brand/institutional.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const LOGO = `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="56"><rect x="0" y="8" width="40" height="40" rx="6" fill="#1F6F5C"/><text x="52" y="38" font-family="sans-serif" font-size="22" fill="#1F6F5C">HEALTH</text></svg>') : ''}`;

/** المكتملة: المثال المحلول بصفته وثيقة معتمدة لجهة لها شعار ولون */
function completeDoc(org = { name: 'التجمع الصحي الأول', logo: LOGO, color: '#1F6F5C' }) {
  const d = exampleDoc(EXAMPLES[0]);
  return {
    ...d,
    meta: { ...d.meta, example: false, status: 'approved', status_title: 'معتمدة', approved_at: '2027-01-10T09:00:00Z', version: 2, ref: 'MI-CP-1A2B3C4D', org,
      participant: { name: 'سارة القحطاني' } },
    summary: 'نطلب اعتماد تجربة لمدة اثني عشر أسبوعًا لتقليل زمن انتظار المراجعين، بتكلفة محدودة ومنافع مقيسة يتابعها الراعي شهريًا.',
    review: { score: 86, scores: {}, notes: {} },
    sponsor: { name: 'مدير التجمع', status: 'endorsed', at: '2027-01-08T09:00:00Z', note: null },
  };
}

const GIB = 'شسيبلاتنمكطظزو٣٤٥ سيبلاتنم asdkjh';
const junk = (f) => {
  if (f.type === 'table') return [['لايوجد', 'لايوجد', 'لايوجد'], ['-', '123-04820-209', '']];
  if (f.key === 'start' || f.key === 'end') return GIB;
  if (f.type === 'select') return null;
  return ['لايوجد', '', '-', GIB, '...'][f.key.length % 5];
};

/** يحيى: مستوى تأسيسي، بطاقة فيها عنوان ومشكلة صالحان وما سواهما تالف أو فارغ، ولا جهة */
function yahyaDoc() {
  const d = exampleDoc(EXAMPLES[0]);
  return {
    ...d,
    meta: { ...d.meta, example: false, status: 'draft', status_title: 'مسودة', level: 'beginner', scope: null, scope_title: null, org: null, initiative: 'تحسين خدمة المراجعين',
      participant: { name: 'يحيى' }, readiness: 22, start: GIB, end: '', sponsor: 'لايوجد', host: null, context: null, version: 1, ref: 'MI-CP-YAHYA001' },
    summary: '',
    cost: { total: 0, contingency: 0, withContingency: 0, envelope: null, by: {} },
    review: null, sponsor: null, checks: [],
    sections: d.sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f,
      value: s.key === 'initiative-charter' && f.key === 'problem' ? 'المراجعون ينتظرون أكثر من ساعة في العيادات الخارجية دون معرفة دورهم'
        : s.key === 'initiative-charter' && f.key === 'title' ? 'تحسين خدمة المراجعين' : junk(f) })) })),
  };
}


const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

describe('ملف العمل الكامل', () => {
  const { meta, body } = capstoneReport(yahyaDoc());
  const t = text(body);
  it('لا «لم يُملأ» ولا عدّ للحقول الفارغة في الفهرس، وما ينقص في ملحقه', () => {
    expect(t).not.toContain('لم يُملأ');
    expect(t).not.toMatch(/حقول فارغة|حقل فارغ|حقلان فارغان/);
    expect(t).not.toContain('لم تُملأ فصوله');
    expect(body).toContain('id="ch-gaps"');
    expect(t).toContain('ما ينقص لإكمال الوثيقة');
    expect(t).toContain('تاريخ لا يُقرأ');
  });
  it('لا مؤشر صفري ولا قيمة تالفة في المتن، وختم «مسودة عمل»', () => {
    expect(t).not.toMatch(/\b0 ريال|0\s*حزمة|0\s*منفعة|النوع\s*·/);
    expect(t).not.toContain('لايوجد');
    expect(t).not.toContain('123-04820-209');
    expect(t).not.toContain('سيبلاتنم');
    expect(meta.stamp).toBe('مسودة عمل');
    expect(documentHtml(meta, body)).toContain('class="stamp">مسودة عمل');
  });
  it('المعتمدة بلا ختم مسودة', () => {
    expect(capstoneReport(completeDoc()).meta.stamp).toBe(null);
  });
});

describe('الوثيقة المؤسسية', () => {
  it('لا تُصدر وثيقة يحيى، وتسمي الأسئلة الناقصة', () => {
    const r = institutionalReport(yahyaDoc());
    expect(r.blocked).toBe(true);
    expect(r.missing.length).toBeGreaterThan(5);
    expect(missingMessage(r.missing)).toContain('ما المخاطر وكيف تُعالج؟');
  });
  it('المكتملة: غلاف مشترك بشعار الجهة ولونها، وأبواب مرقمة، وصفحة اعتماد ببصمة', () => {
    const r = institutionalReport(completeDoc());
    expect(r.blocked).toBeUndefined();
    const html = documentHtml(r.meta, r.body);
    expect(html).toContain('class="mast co"');
    expect(html).toContain('<img src="data:image/svg+xml;base64,');
    expect(html).toContain('بإعداد');
    expect(html).toContain('style="background:#1F6F5C"');
    const heads = [...r.body.matchAll(/<h2>(\d+)\. ([^<]+)<\/h2>/g)].map((m) => +m[1]);
    expect(heads).toEqual(heads.map((_, i) => i + 1));
    expect(text(r.body)).toContain('الاعتماد');
    expect(r.body).toContain(`FINGERPRINT ${r.fingerprint}`);
    expect(text(r.body)).not.toContain('لم يُملأ');
  });
  it('بلا شعار يُكتب اسم الجهة، وبلا جهة «مبادرة مجتمعية»، واللون غير الصالح لا يُحقن', () => {
    const named = documentHtml(...Object.values((({ meta, body }) => ({ meta, body }))(institutionalReport(completeDoc({ name: 'بلدية الحي', logo: null, color: 'red;x:1' })))));
    expect(named).toContain('بلدية الحي');
    expect(named).not.toContain('class="accent"');
    const none = institutionalReport(completeDoc(null));
    expect(documentHtml(none.meta, none.body)).toContain('مبادرة مجتمعية');
  });
  it('البصمة ثابتة للمحتوى نفسه وتتغير بتغيّره', () => {
    const a = completeDoc();
    expect(fingerprint(a)).toBe(fingerprint(completeDoc()));
    const b = { ...a, sections: a.sections.map((s, i) => (i ? s : { ...s, fields: s.fields.map((f, j) => (j ? f : { ...f, value: 'عنوان آخر' })) })) };
    expect(fingerprint(b)).not.toBe(fingerprint(a));
  });
});
