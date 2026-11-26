// تصور المرحلة 1، البند 1 (1ب): ترحيل تنظيف عضويات المجموعات العالقة على البنية المرجعية (PGlite) ببيانات:
// المنقول إلى دفعة أخرى يُحذف صفه القديم وينسخ ويُسجَّل، والحالي وعضو الجهة بالتبعية لا يُمسان، وإعادة التشغيل لا تغيّر شيئًا.
// وملف التحقق القرائي يعد ما سيحذفه الترحيل نفسه قبل تطبيقه.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NAME = '20261129160000_leaders_group_members_cleanup';
const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [OLD, NEW, ORG, G] = [U(1), U(2), U(3), U(4)];
const [MOVED, STAY, IMPLICIT, ERASED] = [U(11), U(12), U(13), U(14)];
let db, verifyBefore, after, again, audit, backup;
const members = async () => (await db.query('select participant_id from leaders.cohort_group_members order by participant_id')).rows.map((r) => r.participant_id);
const verify = async () => {
  const sql = read('scripts/db/verify-group-members-cleanup.sql');
  const first = sql.split(/^-- 2\)/m)[0].split(/^-- 1\)[^\n]*\n/m)[1];
  return (await db.query(first)).rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(read('supabase/schema/baseline.sql'));
  await db.exec(`
    insert into leaders.organizations (id, name) values ('${ORG}', 'جهة');
    insert into leaders.programs (id, name) values ('${U(5)}', 'برنامج');
    insert into leaders.cohorts (id, name, program_id, organization_id, status) values ('${OLD}', 'قديمة', '${U(5)}', '${ORG}', 'running'), ('${NEW}', 'جديدة', '${U(5)}', '${ORG}', 'running');
    insert into leaders.participants (id, email, full_name, organization_id) values
      ('${MOVED}', 'm@example.com', 'م', '${ORG}'), ('${STAY}', 's@example.com', 'س', '${ORG}'),
      ('${IMPLICIT}', 'i@example.com', 'ع', '${ORG}'), ('${ERASED}', 'e@example.com', 'ح', '${ORG}');
    insert into leaders.enrollments (participant_id, cohort_id, status) values
      ('${MOVED}', '${OLD}', 'withdrawn'), ('${MOVED}', '${NEW}', 'active'), ('${STAY}', '${OLD}', 'active'),
      ('${ERASED}', '${OLD}', 'withdrawn'), ('${ERASED}', '${NEW}', 'active');
    insert into leaders.cohort_groups (id, cohort_id, name) values ('${G}', '${OLD}', 'أ');
    insert into leaders.cohort_group_members (cohort_id, participant_id, group_id) values
      ('${OLD}', '${MOVED}', '${G}'), ('${OLD}', '${STAY}', '${G}'), ('${OLD}', '${IMPLICIT}', '${G}'), ('${OLD}', '${ERASED}', '${G}');`);
  verifyBefore = await verify();
  const sql = read(`supabase/migrations/${NAME}.sql`);
  await db.exec(sql);
  after = await members();
  audit = (await db.query("select before, after from leaders.audit_log where action = 'group_members.cleanup'")).rows;
  backup = (await db.query('select participant_id from leaders.backup_20261129_group_members_cleanup order by participant_id')).rows.map((r) => r.participant_id);
  await db.exec(sql);
  again = await members();
}, 180000);

describe('ترحيل تنظيف عضويات المجموعات', () => {
  it('ملف التحقق يعد قبل التطبيق ما سيحذفه بالضبط', () => {
    expect(verifyBefore.ok).toBe(false);
    expect(verifyBefore.detail).toMatch(/^عالقة 2 /);
  });
  it('يحذف المنقولين وحدهم، ويبقي الحالي وعضو الجهة بالتبعية', () => expect(after).toEqual([STAY, IMPLICIT]));
  it('ينسخ المحذوف ويكتب العدد والقائمة في السجل مرة واحدة', () => {
    expect(backup).toEqual([MOVED, ERASED]);
    expect(audit).toHaveLength(1);
    expect(audit[0].after.deleted).toBe(2);
    expect(audit[0].before.map((r) => r.participant_id).sort()).toEqual([MOVED, ERASED]);
  });
  it('آمن لإعادة التشغيل', () => expect(again).toEqual(after));
  it('بعد التطبيق يجتاز التحقق، والنسخة تُمحى مع حذف المشارك', async () => {
    expect((await verify()).ok).toBe(true);
    await db.exec(`delete from leaders.enrollments where participant_id = '${ERASED}'; delete from leaders.participants where id = '${ERASED}'`);
    const left = (await db.query('select participant_id from leaders.backup_20261129_group_members_cleanup')).rows.map((r) => r.participant_id);
    expect(left).toEqual([MOVED]);
  });
  it('سطر الإرجاع يعيد المحذوف', async () => {
    const restore = read(`supabase/migrations/${NAME}.sql`).match(/^-- restore: (.*)$/m)[1];
    await db.exec(restore);
    expect(await members()).toEqual([MOVED, STAY, IMPLICIT].sort());
  });
});
