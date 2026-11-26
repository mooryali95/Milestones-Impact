// أمن الوثيقة وتحميل الأدمن للوثيقة النهائية (المرحلة 21): علامة RAW، والشعار الخارجي وتعقيم SVG، وربط تذكرة PDF ببصمة
// الوثيقة، ومعامل الخيارات الموحد { annex, decision, appendix, qr } ونسختا التحميل
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { documentHtml, isRaw, points, raw, safeLogo, table } from '../../src/lib/brand/doc.js';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { DOC_PRESETS, docOptions, EXPORT_PRESETS, exportSummary, finalDocument, fingerprint, institutionalReport, renderInitiative } from '../../src/lib/brand/institutional.js';
import { docFingerprint, freezeIssued } from '../../supabase/functions/leaders-api/doc-quality.js';
import { fingerprintAllowed, fingerprintsIn, signTicket, ticketClaims, verifyTicket } from '../../supabase/functions/_shared/pdf-ticket.js';
import { cleanLogoData, cleanSvgText } from '../../supabase/functions/leaders-api/svg-clean.js';
import { cleanIdentity, cohortIdentity } from '../../supabase/functions/leaders-api/cohort-identity.js';
import { LEADERS_ADMIN_LOGGED_READS } from '../../supabase/functions/_shared/action-kinds.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from './guide.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
const unb64 = (u) => new TextDecoder().decode(Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0)));

function doc({ approved = true, review_levels = null } = {}) {
  const d = exampleDoc(EXAMPLES[0]);
  return {
    ...d,
    meta: { ...d.meta, example: false, status: approved ? 'approved' : 'submitted', status_title: approved ? 'معتمدة' : 'مقدمة', approved_at: approved ? '2027-01-10T09:00:00Z' : null,
      version: 2, ref: 'MI-CP-1A2B3C4D', org: { name: 'جهة', logo: null, color: null }, participant: { name: 'سارة' }, readiness: 87 },
    review: { score: 86, scores: {}, notes: {} },
    sponsor: { name: 'الراعي', status: 'endorsed', at: '2027-01-08T09:00:00Z', note: null },
    ...(review_levels ? { review_levels } : {}),
  };
}
const LEVELS = { level: 'beginner', chapters: [{ key: 'raid', title: 'سجل المخاطر', level: 'beginner', standing: 'required', standing_title: 'مطلوب', kept_fields: 0, criteria: [] }] };

describe('علامة RAW: لا يمر HTML خام إلا من raw()', () => {
  it('كائن { html } قادم من القاعدة أو JSON يُهرَّب نصًا في الجدول والنقاط', () => {
    const evil = { html: '<img src=x onerror=alert(1)>' };
    expect(table([{ label: 'أ' }], [[evil]])).not.toContain('<img');
    expect(points([evil])).not.toContain('<img');
    const parsed = JSON.parse(JSON.stringify(raw('<b>x</b>')));
    expect(isRaw(parsed)).toBe(false);
    expect(table([{ label: 'أ' }], [[parsed]])).not.toContain('<b>x</b>');
  });
  it('raw() وحده يمر خامًا', () => {
    expect(table([{ label: 'أ' }], [[raw('<b>x</b>')]])).toContain('<b>x</b>');
    expect(points([raw('<i>y</i>')])).toContain('<i>y</i>');
  });
  it('حقن HTML في حقل وثيقة يُهرَّب في ملف العمل والمؤسسية', () => {
    const d = doc();
    const inj = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    d.summary = inj;
    d.sections = d.sections.map((s) => ({ ...s, fields: (s.fields || []).map((f) => (typeof f.value === 'string' ? { ...f, value: `${f.value} ${inj}` } : f)) }));
    d.meta = { ...d.meta, initiative: `${d.meta.initiative}${inj}` };
    for (const r of [capstoneReport(d), renderInitiative(d, 'institutional')]) {
      expect(r.body).not.toMatch(/<script>alert|<img src=x/);
      expect(documentHtml(r.meta, r.body)).not.toMatch(/<script>alert|<img src=x/);
    }
  });
});

describe('الشعار: لا رابط خارجي، وSVG معقّم عند الرفع', () => {
  it('العارض يرفض شعار https الخارجي ويقبل المضمّن وأصل المنصة', () => {
    expect(safeLogo('https://evil.example/t.png')).toBe(null);
    expect(safeLogo('//evil.example/t.png')).toBe(null);
    expect(safeLogo('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeLogo('/brand/logo.png')).toBe('/brand/logo.png');
    const html = documentHtml({ title: 'ت', brand: { name: 'جهة', logo: 'https://evil.example/t.png' } }, '');
    expect(html).not.toContain('evil.example');
  });
  it('تعقيم SVG يزيل السكربت والأحداث والروابط الخارجية، ويبقي الرسم', () => {
    const out = cleanSvgText('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><a href="https://evil.example"><rect width="4" height="4" onclick="x()"/></a><use href="#a"/></svg>');
    expect(out).not.toMatch(/script|onload|onclick|foreignObject|evil\.example/i);
    expect(out).toContain('<rect');
    expect(out).toContain('href="#a"');
  });
  it('الأحداث المفصولة بشرطة مائلة والروابط ببادئة أي مجال أسماء لا تفلت', () => {
    const out = cleanSvgText('<svg/onload=alert(1) xmlns="http://www.w3.org/2000/svg"><rect/onclick="x()" width="2"/><image x:href="https://evil.example/a.png"/></svg>');
    expect(out).not.toMatch(/onload|onclick|evil\.example/i);
    expect(out).toContain('<rect');
  });
  it('ما يبقى مريبًا بعد التعقيم يُرفض، وما ليس SVG يُرفض', () => {
    expect(() => cleanSvgText('<svg><style>@import url(https://evil.example/x.css);</style></svg>')).toThrow();
    expect(() => cleanSvgText('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>')).toThrow();
    expect(() => cleanSvgText('<html></html>')).toThrow();
  });
  it('هوية الدفعة: SVG يُحفظ معقّمًا، وhttps يُرفض عند الحفظ، والمحفوظ قديمًا يسقط شعاره وحده', () => {
    const dirty = `data:image/svg+xml;base64,${b64('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="2" height="2"/></svg>')}`;
    const { logo } = cleanIdentity({ program: 'ب', logo: dirty });
    expect(unb64(logo)).not.toContain('onload');
    expect(unb64(logo)).toContain('<rect');
    expect(() => cleanIdentity({ logo: 'https://evil.example/l.png' })).toThrow();
    expect(cohortIdentity({ identity: { program: 'برنامج', logo: 'https://evil.example/l.png', color: '#123456' } })).toEqual({ program: 'برنامج', logo: null, color: '#123456' });
    expect(cleanLogoData('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
  it('شعار الجهة في الإدارة يمر بالفحص نفسه', () => {
    const src = read('supabase/functions/leaders-api/admin.ts');
    expect(src).toMatch(/row\.logo = cleanLogoData\(logo\)/);
  });
});

describe('تذكرة PDF مربوطة ببصمة الوثيقة', () => {
  const S = 'x'.repeat(40);
  const FP = 'ABCD-1234-EF01-5678';
  it('التذكرة المربوطة تحمل بصمتها، وغير المربوطة كما كانت', async () => {
    const t = await signTicket(S, 'admin-1', 1000, FP);
    expect(await ticketClaims(S, t, 2000)).toEqual({ sub: 'admin-1', fp: FP });
    expect(await verifyTicket(S, t, 2000)).toBe('admin-1');
    const old = await signTicket(S, 'p-1', 1000);
    expect(old.split('.')).toHaveLength(3);
    expect(await ticketClaims(S, old, 2000)).toEqual({ sub: 'p-1', fp: null });
    // تبديل البصمة يكسر التوقيع
    expect(await ticketClaims(S, t.replace(FP, 'ABCD-1234-EF01-0000'), 2000)).toBe(null);
    await expect(signTicket(S, 'a', 1000, 'not-a-fp')).rejects.toThrow();
  });
  it('العامل لا يطبع HTML يدّعي بصمة غير بصمة تذكرته', () => {
    const html = `<!doctype html><p class="in-fp"><span>FINGERPRINT <b>${FP}</b></span></p><a href="https://leaders.sunkvalue.com/v/doc/${FP}">x</a>`;
    expect(fingerprintsIn(html)).toEqual([FP]);
    expect(fingerprintAllowed(html, FP)).toBe(true);
    expect(fingerprintAllowed(html, null)).toBe(false);
    expect(fingerprintAllowed(html, 'ABCD-1234-EF01-0000')).toBe(false);
    expect(fingerprintAllowed('<!doctype html><p>تقرير بلا بصمة</p>', null)).toBe(true);
    const D = FP.split('-');
    for (const v of [
      `FINGERPRINT <b><span>${FP}</span></b>`,
      `FINGERPRINT&nbsp;<strong>${D.join('&#45;')}</strong>`,
      `<b>${D[0]}-${D[1]}</b><i>-${D[2]}\u200B-${D[3]}</i>`,
      '<a href="/v%2Fdoc">تحقق</a>',
    ]) {
      expect(fingerprintAllowed(`<!doctype html>${v}`, null)).toBe(false);
      if (v.includes(D[0])) expect(fingerprintAllowed(`<!doctype html>${v}`, 'ABCD-1234-EF01-0000')).toBe(false);
    }
    const worker = read('workers/pdf-render/index.js');
    expect(worker).toMatch(/fingerprintAllowed\(html, claims\.fp\)/);
  });
  it('بصمة الخادم هي بصمة العارض: المجمّدة للمعتمدة، والحية لغيرها', () => {
    const live = doc({ approved: false });
    expect(docFingerprint(live)).toBe(fingerprint(live));
    expect(institutionalReport(live).fingerprint).toBe(docFingerprint(live));
    const a = doc();
    const issued = { ...a, issued: { ...freezeIssued(a), fingerprint: 'AAAA-BBBB-CCCC-DDDD' } };
    expect(docFingerprint(issued)).toBe('AAAA-BBBB-CCCC-DDDD');
    expect(institutionalReport(issued).fingerprint).toBe('AAAA-BBBB-CCCC-DDDD');
    const html = documentHtml(...(({ meta, body }) => [meta, body])(institutionalReport(issued)), { print: true });
    expect(fingerprintAllowed(html, docFingerprint(issued))).toBe(true);
  });
  it('capstone.doc وadmin.doc-export يربطان التذكرة ببصمة الوثيقة التي يرسلانها', () => {
    const src = read('supabase/functions/leaders-api/capstone.ts');
    expect(src).toMatch(/pdfTicket\(p\.id, docFingerprint\(document\)\)/);
    expect(src).toMatch(/pdfTicket\(`admin-\$\{a\.id \|\| 'owner'\}`, fp\)/);
  });
});

describe('معامل الخيارات الموحد ونسختا تحميل الأدمن', () => {
  it('الأنواع الأربعة إعدادات مسبقة، وما يُمرَّر منطقيًا يعلوها', () => {
    expect(Object.keys(DOC_PRESETS).sort()).toEqual(['external', 'institutional', 'reader', 'working']);
    for (const k of Object.keys(DOC_PRESETS)) expect(DOC_PRESETS[k].annex).toBe(false);
    expect(docOptions({ annex: true, qr: 'yes' }, 'reader')).toEqual({ annex: true, decision: true, appendix: false, qr: true });
  });
  it('نسخة للإرسال: بلا ملحق المراجع ولا صفحة القرار ولا ملحق ما ينقص، وبلا الجاهزية', () => {
    const d = doc({ review_levels: LEVELS });
    const send = finalDocument(d, EXPORT_PRESETS.send);
    expect(send.kind).toBe('institutional');
    expect(send.body).not.toContain('ch-levels');
    expect(send.body).not.toContain('class="in-dec"');
    expect(send.body).not.toContain('87%');
    expect(send.body).toContain('in-verify');
    const full = finalDocument(d, EXPORT_PRESETS.full);
    expect(full.body).toContain('ch-levels');
    expect(full.body).toContain('class="in-dec"');
  });
  it('مفتاح الرمز: بلا رمز ولا رابط تحقق، وتبقى البصمة', () => {
    const d = doc();
    const on = finalDocument(d, { ...EXPORT_PRESETS.send, qr: true }).body;
    const off = finalDocument(d, { ...EXPORT_PRESETS.send, qr: false }).body;
    expect(on).toContain('/v/doc/');
    expect(off).not.toContain('/v/doc/');
    expect(off).toContain('FINGERPRINT');
  });
  it('غير المعتمدة تُنزَّل بختم «مسودة للمراجعة»، مؤسسية كانت أو ملف عمل', () => {
    const d = doc({ approved: false });
    expect(finalDocument(d).meta.stamp).toMatch(/مسودة للمراجعة/);
    const blocked = { ...d, sections: d.sections.map((s) => ({ ...s, fields: (s.fields || []).map((f) => ({ ...f, value: null })) })) };
    const w = finalDocument(blocked, EXPORT_PRESETS.send);
    expect(w.kind).toBe('working');
    expect(w.meta.stamp).toMatch(/مسودة للمراجعة/);
    expect(w.body).not.toContain('id="ch-gaps"');
  });
  it('سطر الوصف يطابق الخيارات', () => {
    expect(exportSummary(EXPORT_PRESETS.send, { approved: true })).toMatch(/بلا صفحة القرار ولا ملحق ما ينقص ولا ملحق المراجع/);
    expect(exportSummary(EXPORT_PRESETS.full, { approved: false })).toMatch(/مسودة للمراجعة/);
  });
  it('admin.doc-export: اطلاع يُسجَّل admin.docExport، وزر أساسي في الشاشتين عبر downloadBest', () => {
    expect(LEADERS_ADMIN_LOGGED_READS.has('admin.doc-export')).toBe(true);
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toMatch(/'admin\.doc-export': \(a, b\) => X\.adminDocExport\(a, b\)/);
    const cap = read('supabase/functions/leaders-api/capstone.ts');
    expect(cap).toMatch(/audit\('admin', a\.email, 'admin\.docExport'/);
    const scr = read('admin-app/src/screens/Capstones.jsx');
    expect(scr).toMatch(/L\('admin\.doc-export'/);
    expect(scr).toMatch(/downloadBest\(out\.meta, out\.body, \{ server: r\.pdf/);
    expect(read('admin-app/src/screens/PersonFile.jsx')).toMatch(/<FinalDocExport participantId=\{participantId\}/);
  });
});
