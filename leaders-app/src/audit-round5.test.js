// تدقيق الإنتاج، الجولة 5 (2026-11-11): قرارات المالك بعد تقرير الإغلاق.
// حساب الاختبار يُعلَّم حساب عرض (5.1)، وsecurity.txt ببريد التواصل، ونص إصدار الشهادة في اللوحة (9.2).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('5.1 حساب العرض الأصلي يُعرَّف ببريده', () => {
  it('حساب العرض الأصلي يُعرَّف ببريده، فلا يتعطل الفتح بأكثر من حساب موسوم، ولا تحذف إعادة الضبط غيره', () => {
    const d = read('supabase/functions/leaders-api/demo.ts');
    expect(d.match(/\.eq\('is_demo', true\)\.eq\('email', DEMO_EMAIL\)\.maybeSingle\(\)/g)).toHaveLength(2);
    expect(d).not.toMatch(/\.eq\('is_demo', true\)\.maybeSingle\(\)/);
  });
});

// حساب الاختبار علامة مستقلة (قرار المالك 2026-11-11 بعد أن رفضت القاعدة 20261111100000 ولم يُطبَّق):
// is_demo يغيّر سلوك الحساب كله (لا تبديل أدوار، واعتماد آلي، وإجراءات محجوبة)، وparticipants_one_demo يسمح بحساب عرض واحد.
describe('5.1 حساب الاختبار is_test: خارج الإحصاءات وحدها', () => {
  const NAME = '20261111110000_leaders_test_accounts';
  const SQL = read(`supabase/migrations/${NAME}.sql`);
  it('الترحيل المرفوض أُزيل، والجديد حاجب (الدوال تقرأ العمود) ويمس الحساب بمعرّفه وحده، وإعادته آمنة', async () => {
    expect(existsSync(join(root, 'supabase/migrations/20261111100000_leaders_test_account_demo.sql'))).toBe(false);
    expect(gateOf(SQL, NAME).gate).toBe('blocking');
    expect(SQL).not.toMatch(/@|OmarManzoma|is_demo\s*=\s*true/);
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.participants (id uuid primary key, is_demo boolean not null default false, updated_at timestamptz);
      create unique index participants_one_demo on leaders.participants ((true)) where is_demo;
      insert into leaders.participants (id, is_demo) values ('4b1d2d2b-8817-4cff-a55d-ca95416d28e2', false), ('00000000-0000-0000-0000-000000000001', true);`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query('select id, is_demo, is_test from leaders.participants order by id');
    // حساب العرض الأصلي باقٍ وحده حساب عرض، وحساب الاختبار حساب اختبار لا عرض
    expect(rows.map((r) => [r.is_demo, r.is_test])).toEqual([[true, false], [false, true]]);
  });
  it('الإحصاءات تستبعده، والقوائم تُظهره بشارته، والمدير يضبطه', () => {
    const a = read('supabase/functions/leaders-api/admin.ts');
    expect(a).toContain("export const forStats = (q: any) => q.eq('is_demo', false).eq('is_test', false);");
    expect(a).toContain('const orgFilter = (q: any, org: unknown) => scopeOrg(forStats(q), org);');
    // النظرة العامة وصفحة الجهة (ولوحة منسقها عبر orgPayload) بـ orgFilter، وقائمة المشاركين بـ listFilter
    expect(a.slice(a.indexOf('export async function overview'), a.indexOf('export async function overview') + 200)).toContain('orgFilter(');
    expect(a.slice(a.indexOf('export async function org('), a.indexOf('export async function org(') + 400)).toContain('orgFilter(');
    expect(a).toContain('q = listFilter(q, b.org);');
    expect(a).toContain("if ('is_test' in f) row.is_test = f.is_test === true;");
    expect(read('supabase/functions/leaders-api/coordinator.ts')).toContain("import { org as orgPayload, requireWrite } from './admin.ts';");
    const pay = read('supabase/functions/leaders-api/payments.ts');
    expect(pay.match(/\.eq\('is_demo', false\)\.eq\('is_test', false\)/g)).toHaveLength(2);
    expect(read('supabase/functions/leaders-api/impact.ts')).toContain(".eq('is_demo', false).eq('is_test', false);");
    const ui = read('admin-app/src/screens/Participants.jsx');
    expect(ui).toContain("fields: { is_test: !p.is_test }");
    expect(ui).toContain('حساب اختبار</span>');
    // لا يمس سلوك الحساب: لا is_test في بوابات العرض وتبديل الأدوار والاعتماد الآلي
    for (const f of ['index.ts', 'switch.ts', 'doors.ts', 'participant.ts', 'demo.ts', 'entitlements.ts']) {
      expect(read(`supabase/functions/leaders-api/${f}`), f).not.toContain('is_test');
    }
  });
});

describe('security.txt (RFC 9116)', () => {
  for (const [dir, host] of [['home', 'mi.sunkvalue.com'], ['public', 'matrix.sunkvalue.com'], ['leaders-app/public', 'leaders.sunkvalue.com'], ['admin-app/public', 'admin.sunkvalue.com']]) {
    it(`${host}: بريد التواصل، وتاريخ انتهاء خلال سنة، وعنوانه المعتمد`, () => {
      const f = `${dir}/.well-known/security.txt`;
      expect(existsSync(join(root, f)), f).toBe(true);
      const t = read(f);
      expect(t).toContain('Contact: mailto:mi@sunkvalue.com');
      expect(t).toContain(`Canonical: https://${host}/.well-known/security.txt`);
      const exp = Date.parse(t.match(/^Expires: (.+)$/m)[1]);
      expect(exp - Date.parse('2026-11-11T00:00:00Z')).toBeLessThanOrEqual(366 * 864e5);
    });
  }
});

describe('9.2 نص إصدار الشهادة في اللوحة يطابق الخادم', () => {
  it('لا «تصدر حين تصير الحالة أنهى البرنامج»', () => {
    const c = read('admin-app/src/screens/Certificates.jsx');
    expect(c).not.toMatch(/تصير حالة المشارك «أنهى البرنامج»|تغيّر حالة مشارك إلى «أنهى البرنامج»/);
    expect(c).toContain('تغيير الحالة يدويًا لا يصدر شهادة');
  });
});
