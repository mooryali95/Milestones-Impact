// الوثيقة المطبوعة والمصدّرة (قرار المالك 2026-11-25): مصدر واحد للنسختين، والشكل من المسار، واللقطة المعتمدة مجمّدة
import { describe, expect, it } from 'vitest';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { contrastRatio, documentHtml, structuralAccent } from '../../src/lib/brand/doc.js';
import { institutionalReport, renderInitiative, verifyUrl } from '../../src/lib/brand/institutional.js';
import { freezeIssued } from '../../supabase/functions/leaders-api/doc-quality.js';
import { docFormFor, formOfDoc } from '../../supabase/functions/leaders-api/doc-form.js';
import { FORMS, PROFILE_FORMS } from '../../supabase/functions/leaders-api/document-forms.js';
import { trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { cleanIdentity, cohortIdentity } from '../../supabase/functions/leaders-api/cohort-identity.js';
import { signTicket, verifyTicket } from '../../supabase/functions/_shared/pdf-ticket.js';
import { allowedRequest } from '../../workers/pdf-render/policy.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import profiles from '../../supabase/content/tracks/v2/profiles.json';
import { exampleDoc } from './guide.js';

const TRACKS = [1, 2, 3].flatMap((m) => [1, 2, 3].flatMap((i) => [1, 2, 3].map((l) => `M${m}I${i}L${l}`)));
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function docWith(track, extra = {}) {
  const d = exampleDoc(EXAMPLES[0]);
  return {
    ...d,
    meta: { ...d.meta, example: false, status: 'submitted', status_title: 'بانتظار المراجعة', version: 1, ref: 'MI-CP-TEST0001', generated_at: '2026-11-25T10:00:00Z',
      org: { name: 'هيئة تجريبية', logo: null, color: '#1F6F5C' }, participant: { name: 'سارة' }, track_key: track, doc_form: track ? docFormFor({ track }) : undefined, ...extra },
    review: null, sponsor: null,
  };
}
const setField = (doc, key, field, value) => ({ ...doc, sections: doc.sections.map((s) => (s.key !== key ? s : { ...s, fields: s.fields.map((f) => (f.key === field ? { ...f, value } : f)) })) });

describe('شكل الوثيقة من المسار', () => {
  it('كل المسارات الـ27 تُحل إلى شكل صالح من ملفات التعريف التسعة', () => {
    for (const t of TRACKS) {
      const f = docFormFor({ track: t });
      expect(FORMS[f.key], t).toBeTruthy();
      expect(f.source, t).toBe('profile');
      expect(trackManifest(t).document.sections.length, t).toBeGreaterThan(3);
      expect(profiles.profiles.map((p) => p.key)).toContain(f.profile);
    }
    // كل ملف تعريف في المحتوى له شكل
    for (const p of profiles.profiles) expect(FORMS[PROFILE_FORMS[p.key]], p.key).toBeTruthy();
  });
  it('الشكل يتبع مستوى إطار الأولوية لا متوسط المستويات', () => {
    // الأولوية في المعالم (الأضعف، تأسيسي) والوسيط احترافي: بطاقة
    expect(docFormFor({ levels: { milestone: 'beginner', impact: 'advanced', leadership: 'advanced' }, priority: 'milestone' }).key).toBe('card');
    expect(docFormFor({ track: 'M2I3L2', priority: 'milestone' }).key).toBe('charter');
    expect(docFormFor({ track: 'M3I3L3' }).key).toBe('case');
    expect(docFormFor({}).key).toBe('case');
  });
  it('الاسم والحجم يتبعان الشكل، وبلا اسم للمبادرة لا يتكرر العنوان', () => {
    const card = institutionalReport(docWith('M1I2L2'));
    const charter = institutionalReport(docWith('M2I2L3'));
    const full = institutionalReport(docWith('M3I3L3'));
    expect(card.form.name).toBe('بطاقة المبادرة');
    expect(charter.form.name).toBe('ميثاق المبادرة');
    expect(full.form.name).toBe('حالة العمل');
    const n = (r) => (r.body.match(/class="in-sec/g) || []).length;
    expect(n(card)).toBeLessThan(n(charter));
    expect(n(charter)).toBeLessThan(n(full));
    expect(card.body.length).toBeLessThan(full.body.length);
    const untitled = institutionalReport(docWith('M1I1L1', { initiative: null }));
    expect(untitled.meta.title).toBe('بطاقة المبادرة');
    expect(untitled.meta.subtitle || '').not.toContain('بطاقة المبادرة');
  });
});

describe('مصدر واحد للنسختين', () => {
  it('النسختان من الوثيقة نفسها: قيمة واحدة تظهر في الاثنتين', () => {
    const d = setField(docWith('M3I3L3'), 'initiative-charter', 'problem', 'مشكلة فريدة للاختبار في زمن الانتظار بالعيادات الخارجية');
    expect(text(renderInitiative(d, 'institutional').body)).toContain('مشكلة فريدة للاختبار');
    expect(text(renderInitiative(d, 'working').body)).toContain('مشكلة فريدة للاختبار');
  });
  it('إعادة التوليد بعد تغيير البيانات تعكس التغيير وتغيّر البصمة، بلا نسخة مخبأة', () => {
    const a = docWith('M2I2L2');
    const b = setField(a, 'initiative-charter', 'problem', 'صياغة جديدة للمشكلة بعد ملاحظات الراعي في الاجتماع الأخير');
    const ra = institutionalReport(a), rb = institutionalReport(b);
    expect(text(rb.body)).toContain('صياغة جديدة للمشكلة');
    expect(text(ra.body)).not.toContain('صياغة جديدة للمشكلة');
    expect(rb.fingerprint).not.toBe(ra.fingerprint);
    expect(text(capstoneReport(b).body)).toContain('صياغة جديدة للمشكلة');
    // الحية معلّمة بتاريخ بنائها، بلا رمز تحقق
    expect(rb.meta.stamp).toBe('مسودة للمراجعة');
    expect(rb.body).not.toContain('class="qr"');
  });
  it('اللقطة المعتمدة مجمّدة: المحتوى والبصمة والشكل والهوية لا تتغير بتعديل لاحق ولا بترقية المسار', () => {
    const d = docWith('M1I1L1', { status: 'approved', status_title: 'معتمدة', approved_at: '2027-01-10T09:00:00Z', cohort_brand: { program: 'برنامج قادة التحول', logo: null, color: null } });
    const issued = freezeIssued(d);
    const later = setField({ ...d, issued, meta: { ...d.meta, doc_form: docFormFor({ track: 'M3I3L3' }), org: { name: 'جهة أخرى', logo: null, color: null }, cohort_brand: null } }, 'initiative-charter', 'problem', 'تعديل بعد الاعتماد');
    const r = institutionalReport(later);
    expect(r.fingerprint).toBe(issued.fingerprint);
    expect(r.form.key).toBe('card');
    expect(formOfDoc(later).key).toBe('card');
    expect(text(r.body)).not.toContain('تعديل بعد الاعتماد');
    expect(r.meta.brand.name).toBe('هيئة تجريبية');
    expect(r.meta.brand.program).toBe('برنامج قادة التحول');
    expect(r.body).toContain('class="qr"');
    expect(r.body).toContain(verifyUrl(issued.fingerprint));
    expect(r.meta.closing).toContain(issued.fingerprint);
  });
});

describe('الهوية والطباعة', () => {
  it('لون البنية بعد فحص التباين، وإلا الذهبي', () => {
    expect(contrastRatio('#FFFFFF')).toBeCloseTo(1);
    expect(structuralAccent('#1F6F5C').color).toBe('#1F6F5C');
    expect(structuralAccent('#FFE680').color).toBe('#A97A2E');
    expect(structuralAccent('#FFE680', '#123456').color).toBe('#123456');
    const pale = institutionalReport(docWith('M2I2L2', { org: { name: 'جهة', logo: null, color: '#FFF3B0' } }));
    expect(pale.body).toContain('--acc: #A97A2E');
  });
  it('الغلاف صفحة كاملة، وصفحة القرار بعده، والتذييل علامة صغيرة، ولا وزن خفيف في الطباعة', () => {
    const r = institutionalReport(docWith('M2I2L2'));
    const html = documentHtml(r.meta, r.body, { print: true, base: 'https://leaders.sunkvalue.com/' });
    expect(html).toContain('@page :first { margin: 0;');
    expect(html).toContain('break-after: page');
    expect(html).toContain('content: "Milestone Impact"');
    expect(html).not.toContain('DECISIONS  ·  DIRECTION');
    expect(html).toContain('<base href="https://leaders.sunkvalue.com/">');
    expect(r.body).toContain('class="in-dec"');
    expect(text(r.body)).toContain('القرار المعروض عليكم');
    expect(text(r.body)).toContain('اعتماد · اعتماد بشروط · إرجاع');
    expect(r.body).toContain('.in-sec .tbl { font-size: 9pt; }');
  });
  it('هوية الدفعة: تنظيف ما يُحفظ ورفض غير الصالح', () => {
    expect(cleanIdentity({ program: '  برنامج  القادة ', color: '#123456' })).toEqual({ program: 'برنامج القادة', logo: null, color: '#123456' });
    expect(() => cleanIdentity({ color: 'red' })).toThrow();
    expect(() => cleanIdentity({ logo: 'javascript:alert(1)' })).toThrow();
    expect(cohortIdentity({ identity: {} })).toBe(null);
  });
});

describe('مولّد الخادم', () => {
  it('التذكرة تصح بسرها وحده وتنتهي', async () => {
    const s = 'x'.repeat(40);
    const t = await signTicket(s, 'abc-123', 1000);
    expect(await verifyTicket(s, t, 2000)).toBe('abc-123');
    expect(await verifyTicket('y'.repeat(40), t, 2000)).toBe(null);
    expect(await verifyTicket(s, t, 1000 + 11 * 60e3)).toBe(null);
    expect(await verifyTicket(s, t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 2000)).toBe(null);
  });
  it('الشبكة محصورة في أصل التطبيق', () => {
    expect(allowedRequest('https://leaders.sunkvalue.com/fonts/fonts.css', 'https://leaders.sunkvalue.com')).toBe(true);
    expect(allowedRequest('data:image/png;base64,AAAA', 'https://leaders.sunkvalue.com')).toBe(true);
    expect(allowedRequest('https://evil.example/x', 'https://leaders.sunkvalue.com')).toBe(false);
    expect(allowedRequest('http://169.254.169.254/', 'https://leaders.sunkvalue.com')).toBe(false);
  });
});
