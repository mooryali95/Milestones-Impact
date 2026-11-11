// تدقيق الإنتاج، الجولة 5 (2026-11-11): قرارات المالك بعد تقرير الإغلاق.
// حساب الاختبار يُعلَّم حساب عرض (5.1)، وsecurity.txt ببريد التواصل، ونص إصدار الشهادة في اللوحة (9.2).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('5.1 حساب الاختبار حساب عرض', () => {
  it('حساب العرض الأصلي يُعرَّف ببريده، فلا يتعطل الفتح بأكثر من حساب موسوم، ولا تحذف إعادة الضبط غيره', () => {
    const d = read('supabase/functions/leaders-api/demo.ts');
    expect(d.match(/\.eq\('is_demo', true\)\.eq\('email', DEMO_EMAIL\)\.maybeSingle\(\)/g)).toHaveLength(2);
    expect(d).not.toMatch(/\.eq\('is_demo', true\)\.maybeSingle\(\)/);
  });
  const NAME = '20261111100000_leaders_test_account_demo';
  const SQL = read(`supabase/migrations/${NAME}.sql`);
  it('الترحيل مؤجل حتى نشر الدالة، ويمس الحساب بمعرّفه وحده، وإعادته آمنة', async () => {
    expect(gateOf(SQL, NAME).gate).toBe('deferred');
    expect(SQL).not.toMatch(/@|OmarManzoma/);
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.participants (id uuid primary key, is_demo boolean not null default false, updated_at timestamptz);
      insert into leaders.participants (id) values ('4b1d2d2b-8817-4cff-a55d-ca95416d28e2'), ('00000000-0000-0000-0000-000000000001');`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query('select id, is_demo from leaders.participants order by id');
    expect(rows.map((r) => r.is_demo)).toEqual([false, true]);
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
