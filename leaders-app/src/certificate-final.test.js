// حراس الحزمة 6 (D05): «شهادة إتمام بنجاح» من اعتماد ختامي باجتياز وحده، والتعليق عند إعادة الفتح، والإلغاء
// عند الاسترداد، ولا إصدار يدويًا، ومفتاح توقيع مستقل، وصفحة تحقق بلا تفاصيل لغير السارية، ونتيجة واحدة للقائد.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const cert = read('supabase/functions/leaders-api/certificates.ts');
const final = read('supabase/functions/leaders-api/final.ts');

describe('دورة الشهادة من التقييم الختامي', () => {
  it('الاعتماد وحده يصدر الشهادة أو يلغي المعلّقة، ثم بريد القرار بخطوته التالية', () => {
    const vote = final.slice(final.indexOf('export async function vote('), final.indexOf('export async function reopen('));
    expect(vote).toMatch(/if \(patch\.status === 'approved'\) \{[\s\S]*onFinalApproved\(pid, \{ decision, formula_version:[\s\S]*finalDecisionMail\(/);
    const on = cert.slice(cert.indexOf('export async function onFinalApproved('), cert.indexOf('export async function suspendForReopen('));
    expect(on).toMatch(/if \(!PASSING\.includes\(final\.decision\)\) \{[\s\S]*'revoked'[\s\S]*return null;/);
    expect(on).toMatch(/suspended\.snapshot\?\.decision === final\.decision[\s\S]*setStatus\(suspended\.id, 'valid'/);
    expect(cert).toMatch(/export const PASSING = \['pass', 'pass_notes'\];/);
  });
  it('التعليق يبقى تعليقًا: تعذّره يفشل ولا يصير إلغاءً', () => {
    const set = cert.slice(cert.indexOf('async function setStatus('), cert.indexOf('// ── التحقق العام ──'));
    expect(set).not.toMatch(/23514|status: 'revoked'/);
    expect(set).toMatch(/const \{ error \} = await db\.from\('certificates'\)\.update\(patch\)\.eq\('id', id\);\n\s+if \(error\) throw new Fail\('تعذّر تحديث حالة الشهادة', 500, 'db_error'\);/);
  });
  it('إعادة الفتح تعلّق، والاسترداد يلغي، وتغيير الحالة لا يصدر شيئًا، ولا إصدار يدويًا', () => {
    expect(final.slice(final.indexOf('export async function reopen('))).toMatch(/await suspendForReopen\(pid, a\.email, note\);/);
    expect(read('supabase/functions/leaders-api/payments.ts')).toMatch(/if \(pay\.item === 'program' && pay\.participant_id\) await revokeForRefund\(pay\.participant_id\);/);
    const admin = read('supabase/functions/leaders-api/admin.ts');
    expect(admin).not.toMatch(/issueOnCompletion/);
    expect(cert).not.toMatch(/issueOnCompletion/);
    expect(cert.slice(cert.indexOf('export async function issue('))).toMatch(/^export async function issue\(_a: Actor, _b: Body\) \{\n\s+throw new Fail\([^)]*409, 'cert_from_final'\);/);
    expect(read('admin-app/src/screens/Participants.jsx')).not.toMatch(/certificate-issue/);
  });
  it('التعليق والإلغاء اليدويان للمدير الأعلى بتعليل', () => {
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'admin.certificate-revoke': (a, b) => A.superWriter(a, Z.revoke, b),");
    expect(cert).toMatch(/if \(reason\.length < 5\) throw new Fail\('سبب الإلغاء أو التعليق مطلوب'\);/);
  });
  it('التحقق العام لا يرسل لقطة غير السارية، والصفحة تعرض المعلّقة', () => {
    expect(cert).toMatch(/const shown = authentic && c\.status === 'valid';[\s\S]*certificate: shown \? c\.snapshot : null,/);
    expect(read('leaders-app/src/screens/Verify.jsx')).toMatch(/suspended: 'شهادة معلّقة/);
  });
  it('اللقطة تحمل النوع والقرار وإصدار المعادلة والبرنامج، وتدخل التوقيع', () => {
    expect(cert).toMatch(/kind: 'completion_success', decision: final\.decision, formula_version: final\.formula_version \?\? null, program_id: final\.program_id/);
    expect(cert).toMatch(/\.\.\.\(s\.kind \? \[s\.kind, s\.decision \|\| '', s\.formula_version \?\? ''\] : \[\]\)/);
    expect(read('src/lib/brand/certificate.js')).toMatch(/const kindAr = success \? 'شهادة إتمام بنجاح' : 'شهادة مشاركة';/);
  });
  it('مفتاح التوقيع مستقل عن الفلفل بمعرّف، ويظهر غيابه في فحص الصحة', () => {
    expect(cert).toMatch(/return `\$\{kid\}:\$\{await hmacWith\(key, text\)\}`;/);
    expect(cert).not.toMatch(/`cert:\$\{CONFIG\.pepper\}`\), \{ name: 'HMAC'/);   // التوقيع الجديد لا يشتق من الفلفل
    expect(read('supabase/functions/leaders-api/system.ts')).toMatch(/LEADERS_CERT_SIGNING_KEY: certKeys\(\)\.key\.length >= 32/);
    expect(read('docs/SECRETS.md')).toContain('`LEADERS_CERT_SIGNING_KEY`');
  });
  it('نتيجة القائد من التقييم الختامي وحده', () => {
    const cap = read('supabase/functions/leaders-api/capstone.ts');
    expect(cap).toMatch(/const f: any = await finalGet\(\{ participant_id: p\.id \}\)/);
    expect(cap).not.toMatch(/leaderComposite/);
    expect(read('admin-app/src/screens/Capstones.jsx')).toContain('<h3>التقييم الختامي</h3>');
  });
});

describe('ترحيل 20261107140000_leaders_certificate_suspended', () => {
  const SQL = read('supabase/migrations/20261107140000_leaders_certificate_suspended.sql');
  it('حاجب بعد تطبيقه، ويقبل المعلّقة، وإعادته آمنة', async () => {
    expect(gateOf(SQL).gate).toBe('blocking');
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.certificates (id serial primary key, status text not null default 'valid',
        constraint certificates_status_check check (status = any (array['valid', 'revoked', 'replaced'])));`);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec("insert into leaders.certificates (status) values ('suspended')");
    await expect(db.exec("insert into leaders.certificates (status) values ('lost')")).rejects.toThrow();
  });
});
