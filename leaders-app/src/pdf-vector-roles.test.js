// المسار المتجهي لكل دور (تصور فخامة ملف المبادرة، المرحلة 1، الخيار ب): كل نقطة تُعيد وثيقة مبادرة تُعيد معها تذكرة مربوطة ببصمتها،
// فلا ترفض العامل وثيقةً معتمدة بتذكرة الجلسة العامة؛ والشاشات تمرر التذكرة إلى writeDocument وdownloadBest. والبديل المصور بمقياس 3
// معلَّم «نسخة مصورة» في بيانات الملف وتذييله، وأداة قراءة تميز المسارين.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pdfPath } from '../../scripts/pdf-path.mjs';
import { RASTER_SCALE, SCANNED_NOTE_AR } from '../../src/lib/brand/pdf.js';

const root = join(__dirname, '../..');
const read = (f) => readFileSync(join(root, f), 'utf8');

describe('تذكرة مربوطة بالبصمة لكل دور يقرأ وثيقة مبادرة', () => {
  it('الخادم: الخبير والراعي ورابط المشاركة والإدارة', () => {
    const t = read('supabase/functions/leaders-api/pdf-ticket.ts');
    expect(t).toMatch(/export async function docTicket\(sub: string, doc: unknown\)/);
    expect(read('supabase/functions/leaders-api/file.ts')).toMatch(/pdf: await docTicket\(`expert-\$\{e\.id\}`, doc\)/);
    const cap = read('supabase/functions/leaders-api/capstone.ts');
    expect(cap).toMatch(/pdf: await docTicket\(`sponsor-\$\{c\.participants\?\.id \|\| 'x'\}`, out\.doc\)/);
    expect(cap).toMatch(/pdf: await docTicket\(`admin-\$\{a\?\.id \|\| 'owner'\}`, doc\)/);
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'admin.capstone': (a, b) => X.adminGet(b, a),");
    expect(read('supabase/functions/leaders-api/share.ts')).toMatch(/pdf: row\.allow_download \? await docTicket\(`share-\$\{row\.id\}`, doc\) : null/);
  });
  it('الواجهات تمرر التذكرة: openCapstoneDoc وopenDoc ورابط المشاركة', () => {
    const cap = read('leaders-app/src/screens/Capstone.jsx');
    expect(cap).toMatch(/pdf = null \} = \{\}\)/);
    expect(cap).toMatch(/writeDocument\(win, r\.meta, r\.body, pdf \? \{ pdf: async \(\) => pdf \} : \{\}\)/);
    expect(cap).toMatch(/openCapstoneDoc\(r\.doc, win, \{ kind, pdf: r\.pdf \}\)/);
    expect(read('leaders-app/src/screens/Sponsor.jsx')).toMatch(/kind: 'reader', pdf: data\.pdf/);
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/annex: true, pdf: r\.pdf/);
    const si = read('leaders-app/src/screens/SharedInitiative.jsx');
    expect(si).toMatch(/downloadBest\(report\.meta, report\.body, \{ server: data\.pdf/);
    expect(si).not.toMatch(/downloadPdf\(/);
    const adm = read('admin-app/src/screens/Capstones.jsx');
    expect(adm).toMatch(/writeDocument\(win, r\.meta, r\.body, pdf \? \{ pdf: async \(\) => pdf \} : \{\}\)/);
    expect(adm).toMatch(/openDoc\(d\.doc, toast, 'institutional', setBlocked, undefined, d\.pdf\)/);
  });
});

describe('البديل المصور: مقياس 3 ومعلَّم نسخة مصورة', () => {
  it('المقياس والإشعار', () => {
    expect(RASTER_SCALE).toBe(3);
    expect(SCANNED_NOTE_AR).toBe('نسخة مصورة');
    const src = read('src/lib/brand/pdf.js');
    expect(src).toMatch(/scale = RASTER_SCALE/);
    expect(src).toMatch(/keywords: 'scanned-copy'/);
  });
});

describe('أداة تمييز المسار (scripts/pdf-path.mjs)', () => {
  const enc = (s) => new TextEncoder().encode(s);
  it('متجهي: خط مضمن ونص، ومصور: صور بلا خط مضمن (قاموس Helvetica في jsPDF لا يُعد)، والكلمة المفتاحية تحسم', () => {
    expect(pdfPath(enc('%PDF-1.3\n<< /Type /Font /BaseFont /Helvetica /Subtype /Type1 >> << /Subtype /Image >> /Producer (jsPDF 4.2.1)')).path).toBe('raster');
    expect(pdfPath(enc('%PDF-1.7\n1 0 obj << /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+NotoKufiArabic >> << /FontFile2 5 0 R >>\n/Producer (Skia/PDF m120)\nBT (x) Tj ET'))).toMatchObject({ path: 'vector', text: true, fonts: 1 });
    expect(pdfPath(enc('%PDF-1.3\n<< /Type /XObject /Subtype /Image /Filter /DCTDecode >>\n/Producer (jsPDF 2.5.1)'))).toMatchObject({ path: 'raster', text: false, images: 1 });
    expect(pdfPath(enc('%PDF-1.3\n/Keywords (scanned-copy) /Type /Font /Subtype /Type1'))).toMatchObject({ path: 'raster', scanned: true });
    expect(pdfPath(enc('not a pdf')).path).toBe('unknown');
  });
});
