// الوثيقة المؤسسية وملف العمل الكامل (التصور المعتمد، الخيار ب، 2026-11-24)
import { describe, expect, it } from 'vitest';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { documentHtml } from '../../src/lib/brand/doc.js';
import { fingerprint, institutionalReport, missingMessage, renderInitiative } from '../../src/lib/brand/institutional.js';
import { freezeIssued } from '../../supabase/functions/leaders-api/doc-quality.js';
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
  it('لا مؤشر صفري، والقيمة التالفة تبقى في فصلها بعلامة «يحتاج مراجعة» ومقتبسة في الملحق، وختم «مسودة عمل»', () => {
    expect(t).not.toMatch(/\b0 ريال|0\s*حزمة|0\s*منفعة|النوع\s*·/);
    expect(t).toContain('يحتاج مراجعة');
    expect(t).toContain('سيبلاتنم');
    expect(t.split('ما ينقص لإكمال الوثيقة').pop()).toContain('123-04820-209');
    expect(meta.rows.map(([, v]) => v).join(' ')).not.toContain('لايوجد');
    expect(meta.stamp).toBe('مسودة عمل');
    expect(documentHtml(meta, body)).toContain('class="stamp">مسودة عمل');
  });
  it('القارئ الخارجي: بلا ملحق ولا ختم', () => {
    const r = capstoneReport(yahyaDoc(), { appendix: false });
    expect(r.meta.stamp).toBe(null);
    expect(r.body).not.toContain('id="ch-gaps"');
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
    expect(html).toContain('<img data-org-logo src="data:image/svg+xml;base64,');
    expect(html).toContain('بإعداد');
    expect(html).toContain('style="background:#1F6F5C"');
    const heads = [...r.body.matchAll(/<span class="n">(\d+)<\/span>/g)].map((m) => +m[1]);
    expect(heads.length).toBeGreaterThan(4);
    expect(heads).toEqual(heads.map((_, i) => i + 1));
    expect(text(r.body)).toContain('الاعتماد');
    // المرحلة 32: المعتمدة بلا بصمة مجمّدة لا تطبع البصمة الحية (لا تُطابَق في التحقق)، والمجمّدة تطبع بصمتها
    expect(r.body).not.toContain('FINGERPRINT');
    const d = completeDoc(); const f = institutionalReport({ ...d, issued: freezeIssued(d) });
    expect(f.body).toContain(`FINGERPRINT <b>${f.fingerprint}</b>`);
    // حالة العمل (المرحلة 29): كل باب بعد الأول يبدأ صفحته؛ الميثاق والبطاقة: الاعتماد وحده يبدأ صفحته
    const forced = (r.body.match(/class="in-sec np"/g) || []).length;
    expect(forced).toBe(r.form.key === 'case' ? (r.body.match(/class="in-sec[ "]/g) || []).length - 1 : 1);
    expect(r.body).toContain('.in-open + * { break-before: avoid; }');
    expect(r.body).toContain('من 4 يناير 2026');
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

describe('الإصدار والقراء', () => {
  it('المعتمدة تُعرض من محتواها المجمّد وبصمتها، ولا يغيّرها تغيّر لاحق', () => {
    const d = completeDoc();
    const issued = freezeIssued(d);
    const later = { ...d, issued, sections: d.sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f, value: f.type === 'table' ? [] : '' })) })) };
    const r = institutionalReport(later);
    expect(r.blocked).toBeUndefined();
    expect(r.fingerprint).toBe(issued.fingerprint);
    expect(JSON.stringify(issued)).not.toMatch(/email/i);
  });
  it('الجهة: صفحة «قيد الإعداد» لما لم يكتمل؛ الراعي: ملف العمل بلا ملحق', () => {
    expect(renderInitiative(yahyaDoc(), 'external').body).toContain('الوثيقة قيد الإعداد');
    const rd = renderInitiative(yahyaDoc(), 'reader');
    expect(rd.meta.stamp).toBe(null);
    expect(rd.body).not.toContain('id="ch-gaps"');
  });
  it('لا تكرار للراعي ولا لصفوف المخاطر في المؤسسية', () => {
    const b = institutionalReport(completeDoc()).body;
    expect((b.match(/الراعي ودوره/g) || []).length).toBe(1);
  });
  it('الشعار: يُرفض المسار المبدوء بشرطتين', () => {
    const r = institutionalReport(completeDoc({ name: 'جهة', logo: '//evil.example/x.png', color: null }));
    expect(documentHtml(r.meta, r.body)).not.toContain('evil.example');
  });
});

describe('المراجعة الثانية: الاحتياطي ومكوّنات القيمة وما يُضاف', () => {
  it('بلا احتياطي لا يُذكر «مع الاحتياطي»', () => {
    const d = completeDoc();
    const b = institutionalReport({ ...d, cost: { ...d.cost, contingency: 0 }, sections: d.sections.map((s) => (s.key === 'cost-plan' ? { ...s, fields: s.fields.map((f) => (f.key === 'contingency' ? { ...f, value: '' } : f)) } : s)) }).body;
    expect(b).not.toContain('<span>التكلفة مع الاحتياطي</span>');
    expect(b).not.toContain('<span>الاحتياطي</span>');
  });
  it('«مؤشرات النجاح» يظهر في القيمة حين يُكتب', () => {
    const d = completeDoc();
    const ep = d.sections.find((s) => s.key === 'evidence-plan');
    ep.fields.push({ key: 'success_signal', label: 'كيف ستعرف أنك نجحت؟', type: 'textarea', value: 'ينخفض زمن الإنجاز إلى ثلاثة أيام في تقرير النظام الشهري' });
    expect(institutionalReport(d).body).toContain('مؤشرات النجاح');
  });
  it('قائمة الحجب تقول ماذا يُضاف', () => {
    expect(missingMessage(institutionalReport(yahyaDoc()).missing)).toContain('املأ سجل المخاطر');
  });
});

describe('الغلاف الفاخر في النسخة المؤسسية (المرحلة 25)', () => {
  it('صف رسمي واحد بلا الحالة والتاريخ والإصدار، وشريط ضبط لاتيني، والختم العربي بجانبه في الحالتين', () => {
    const { meta } = institutionalReport(completeDoc());
    expect(meta.rows.map(([l]) => l).every((l) => ['الجهة', 'الراعي', 'قائد المبادرة'].includes(l))).toBe(true);
    expect(meta.control).toMatch(/^[A-Z0-9-]+ · V\d+ · (DRAFT|APPROVED)$/); // المرحلة 5: لا تاريخ ISO في الشريط
    expect(meta.stamp).toBeTruthy();
    expect(meta.controlLabel).toMatch(/^رمز الوثيقة /);
    const html = documentHtml(meta, '');
    expect(html).toMatch(/class="ctlrow">.*aria-label="رمز الوثيقة .*class="stamp">/);
    expect(html).not.toMatch(/<span>الحالة<\/span>/);
  });
});
