// المرحلة 32: نزاهة رمز التحقق. لا رمز إلا ببصمة مجمّدة في snapshot.issued، وverifyDoc يطابق البصمة المطبوعة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { capstoneReport } from './capstone.js';
import { documentHtml } from './doc.js';
import { institutionalReport, verifyUrl } from './institutional.js';
import { issuedFingerprint, verifyMark } from './verify-mark.js';
import { fingerprint, freezeIssued, verifyKey } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { DOC_VERIFY_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { docFormFor } from '../../../supabase/functions/leaders-api/doc-form.js';
import { EXAMPLES } from '../../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from '../../../leaders-app/src/guide.js';

const base = () => {
  const d = exampleDoc(EXAMPLES[0]);
  return { ...d, review: null, sponsor: null, meta: { ...d.meta, example: false, status: 'approved', approved_at: '2026-11-20T10:00:00Z', status_title: 'معتمدة', version: 1, ref: 'MI-CP-QR000001',
    org: { name: 'هيئة تجريبية', logo: null, color: '#1F6F5C' }, participant: { name: 'سارة' }, track_key: 'M2I2L2', doc_form: docFormFor({ track: 'M2I2L2' }) } };
};
const frozenDoc = () => { const d = base(); return { ...d, issued: freezeIssued(d) }; };
const legacyDoc = () => { const d = base(); return { ...d, meta: { ...d.meta, initiative: 'مبادرة أقدم' } }; }; // معتمدة قبل إضافة issued
const QR_TAG = /<svg class="qr"/;
const printedFp = (html) => (html.match(/class="vm-fp">([^<]+)</) || [])[1];

// محاكاة verifyDoc على صفوف القاعدة: eq('status','approved') وeq('snapshot->issued->>fingerprint', verifyKey(مدخل))
const verifyRows = (rows, scanned) => { const k = verifyKey(scanned); return k ? rows.filter((r) => r.status === 'approved' && r.snapshot?.issued?.fingerprint === k) : []; };

describe('نزاهة رمز التحقق', () => {
  it('المعتمدة بلا issued: لا رمز ولا رابط، وسطر «التحقق غير متاح لهذه النسخة» من labels.js', () => {
    for (const r of [institutionalReport(legacyDoc()), capstoneReport(legacyDoc())]) {
      expect(r.body).not.toMatch(QR_TAG);
      expect(r.body).not.toContain('/v/doc/');
      expect(r.body).toContain(DOC_VERIFY_AR.unavailable);
      expect(r.meta.footer).toBe('MI-CP-QR000001-V1');
    }
    expect(issuedFingerprint(legacyDoc())).toBeNull();
  });

  it('المعتمدة ببصمة مجمّدة: الرمز في المؤسسية وفي ملف العمل الكامل، بثلاثة أسطر وبالبصمة المجمّدة', () => {
    const d = frozenDoc();
    for (const r of [institutionalReport(d), capstoneReport(d)]) {
      expect(r.body).toMatch(QR_TAG);
      expect(r.body).toContain(DOC_VERIFY_AR.scan);
      expect(printedFp(r.body)).toBe(d.issued.fingerprint);
      expect(r.body).toContain(verifyUrl(d.issued.fingerprint).replace(/^https?:\/\//, ''));
      expect(r.meta.footer).toBe(`MI-CP-QR000001-V1  ·  ${d.issued.fingerprint}`);
      expect(documentHtml(r.meta, r.body)).toContain(d.issued.fingerprint);
    }
  });

  it('تعديل بعد الاعتماد لا يغيّر البصمة المطبوعة (لا بصمة محسوبة حيًا)', () => {
    const d = frozenDoc();
    const edited = { ...d, meta: { ...d.meta, initiative: 'اسم معدّل بعد الاعتماد' } };
    expect(fingerprint(edited)).not.toBe(d.issued.fingerprint);
    expect(printedFp(institutionalReport(edited).body)).toBe(d.issued.fingerprint);
  });

  it('غير المعتمدة لا رمز لها ولا علامة؛ وخيار qr:false يُبقي البصمة بلا رمز', () => {
    const draft = { ...frozenDoc(), meta: { ...base().meta, status: 'submitted' } };
    expect(verifyMark(draft)).toBeNull();
    expect(institutionalReport(draft).body).not.toMatch(QR_TAG);
    const off = institutionalReport(frozenDoc(), { qr: false });
    expect(off.body).not.toMatch(QR_TAG);
    expect(printedFp(off.body)).toBe(frozenDoc().issued.fingerprint);
  });

  it('بصمة issued غير صالحة الشكل تُعامل كالغائبة', () => {
    const d = { ...frozenDoc(), issued: { ...frozenDoc().issued, fingerprint: 'abc' } };
    expect(issuedFingerprint(d)).toBeNull();
    expect(institutionalReport(d).body).toContain(DOC_VERIFY_AR.unavailable);
  });

  it('verifyDoc يطابق البصمة المطبوعة والرابط الممسوح، ولا يطابق بصمة محسوبة حيًا', () => {
    const d = frozenDoc();
    const rows = [{ status: 'approved', snapshot: d }, { status: 'approved', snapshot: legacyDoc() }];
    const r = institutionalReport(d);
    const fp = printedFp(r.body);
    expect(verifyRows(rows, fp)).toHaveLength(1);
    expect(verifyRows(rows, ` ${fp.toLowerCase()} `)).toHaveLength(1); // مكتوبة باليد
    const scanned = decodeURIComponent(verifyUrl(fp).split('/v/doc/')[1]);
    expect(verifyRows(rows, scanned)).toHaveLength(1);
    expect(verifyRows(rows, fingerprint(legacyDoc()))).toHaveLength(0);
    // الخادم يستعمل المفتاح نفسه
    const ts = readFileSync('supabase/functions/leaders-api/capstone.ts', 'utf8');
    expect(ts).toMatch(/const key = verifyKey\(b\.fingerprint\)/);
    expect(ts).toMatch(/eq\('snapshot->issued->>fingerprint', fp\)/);
  });

  it('سكربت الاستعلام قراءة فقط', () => {
    const sql = readFileSync('scripts/db/verify-issued.sql', 'utf8').replace(/--.*$/gm, '');
    expect(sql).toMatch(/begin transaction read only/i);
    expect(sql).not.toMatch(/\b(update|insert|delete|alter|drop|create|truncate)\b/i);
  });
  it('بصمة واحدة على الصفحة: المعتمدة بلا مجمّدة لا تطبع البصمة الحية، وissued ببصمة بلا sections كالمعتمدة بلا issued', () => {
    const legacy = legacyDoc();
    const r = institutionalReport(legacy);
    expect(r.body).not.toContain(fingerprint(legacy));
    expect(r.meta.closing).not.toContain(fingerprint(legacy));
    const d = frozenDoc();
    const half = { ...legacyDoc(), issued: { fingerprint: d.issued.fingerprint } };
    expect(issuedFingerprint(half)).toBeNull();
    const h = institutionalReport(half);
    expect(h.body).not.toContain(d.issued.fingerprint);
    expect(h.body).not.toContain(fingerprint(half));
    const f = institutionalReport(d);
    const all = f.body.match(/[0-9A-F]{4}(-[0-9A-F]{4}){3}/g) || [];
    expect(new Set(all)).toEqual(new Set([d.issued.fingerprint]));
  });

  it('verifyKey يحذف الفراغات الداخلية ويوحّد الشرطات', () => {
    expect(verifyKey('abcd - 1234 - ef56 - 7890')).toBe('ABCD-1234-EF56-7890');
    expect(verifyKey('ABCD\u20131234\u2014EF56\u22127890')).toBe('ABCD-1234-EF56-7890');
    expect(verifyKey('ABCD 1234')).toBeNull();
  });
});
