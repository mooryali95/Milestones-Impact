// ترحيلا 20261128170000 (أرشفة المكرر بالهاتف وإلحاق من لا دفعة له) و20261128180000 (هاتف واحد لحساب قائم) على قاعدة مؤقتة
// حقيقية (PGlite) فوق 20261128160000: الأرشفة بلا حذف وإبطال الجلسات، والحارس على المكرر ذي الأثر، واستثناء التجريبي والاختبار
// وبصمات الأسماء الخمسة، والإلحاق، وإعادة التشغيل بلا أثر، والتحقق الذاتي يُرجع الترحيل، والفهرس الفريد يرفض التكرار.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const read = (n) => readFileSync(join(__dirname, `../../supabase/migrations/${n}.sql`), 'utf8');
const INTAKE = read('20261128160000_leaders_cohort_intake');
// بصمات الأسماء الخمسة لا تُعكس هنا: تُستبدل إحداها ببصمة اسم اختبار مصطنع، فيُختبر الاستثناء بالمطابقة نفسها
const TEST_NAME = 'اسم اختبار مصطنع';
const M1_REAL = read('20261128170000_leaders_duplicates_and_cohort_backfill');
const FAKE_HASH = createHash('md5').update(TEST_NAME).digest('hex');
const M1 = M1_REAL.replace('a3b0d8be3bc69a1c348a6f2ec974a3eb', FAKE_HASH);
const VERIFY = readFileSync(join(__dirname, '../../scripts/db/verify-backfill-after.sql'), 'utf8').replace('a3b0d8be3bc69a1c348a6f2ec974a3eb', FAKE_HASH);
const M2 = read('20261128180000_leaders_phone_unique');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(1), ORG = U(2), V1 = U(11);
const P = (n) => U(100 + n);
const TABLES = ['participant_requirements', 'capstones', 'assessments', 'reading_progress', 'points_ledger', 'payments', 'certificates'];
const BEFORE = `create role anon; create role authenticated; create role service_role;
  create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.audit_log (id bigint generated always as identity primary key, actor_type text not null, actor text, action text not null,
    entity text not null, entity_id text, before jsonb, after jsonb, created_at timestamptz not null default now());
  create table leaders.programs (id uuid primary key, name text not null, is_default boolean not null default false, archived_at timestamptz);
  create table leaders.program_versions (id uuid primary key, program_id uuid not null, number int not null);
  create table leaders.organizations (id uuid primary key, name text not null, status text not null default 'active');
  create table leaders.participants (id uuid primary key, full_name text, email text, phone text, organization_id uuid,
    is_demo boolean not null default false, is_test boolean not null default false, status text not null default 'registered',
    source text, last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table leaders.auth_sessions (id uuid primary key default gen_random_uuid(), participant_id uuid not null, revoked_at timestamptz);
  create table leaders.cohorts (id uuid primary key default gen_random_uuid(), name text not null, track text not null default 'individual', organization_id uuid,
    program_id uuid not null, program_version_id uuid, status text not null default 'planned', capacity smallint, is_default boolean not null default false,
    starts_on date, created_at timestamptz not null default now());
  create unique index cohorts_one_default on leaders.cohorts ((true)) where is_default;
  create table leaders.enrollments (id uuid primary key default gen_random_uuid(), participant_id uuid not null, cohort_id uuid not null,
    status text not null default 'nominated', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint enrollments_participant_id_cohort_id_key unique (participant_id, cohort_id));
  create table leaders.sponsor_codes (id uuid primary key default gen_random_uuid(), organization_id uuid not null, code text not null);
  ${TABLES.map((t) => `create table leaders.${t} (id uuid primary key default gen_random_uuid(), participant_id uuid not null);`).join('\n')}
  insert into leaders.programs (id, name, is_default) values ('${PROG}', 'برنامج القادة', true);
  insert into leaders.program_versions (id, program_id, number) values ('${V1}', '${PROG}', 1);
  insert into leaders.organizations (id, name) values ('${ORG}', 'منظومة');`;

// الزوج الأول: الهاتف بصيغتين (+966 و05)، والأحدث دخولًا يبقى. الثاني: الدخول متساوٍ (null) فالأحدث إنشاءً يبقى
const SEED = `insert into leaders.participants (id, full_name, email, phone, organization_id, source, last_login_at, created_at) values
  ('${P(1)}', 'سامر نوفل', 'a1@gmail.com', '+966501111111', '${ORG}', 'invite', '2026-11-01', '2026-10-01'),
  ('${P(2)}', 'سامرنوفل', 'a2@gmail.com', '0501111111', '${ORG}', 'invite', '2026-11-20', '2026-10-05'),
  ('${P(3)}', 'سارة', 'b1@gmail.com', '00966502222222', '${ORG}', 'invite', null, '2026-10-01'),
  ('${P(4)}', 'سارة', 'b2@gmail.com', '+966502222222', '${ORG}', 'invite', null, '2026-10-09'),
  ('${P(5)}', 'بلا جهة', 'c@x.sa', null, null, 'self', null, now()),
  ('${P(6)}', 'اختبار', 't@x.sa', null, null, 'self', null, now()),
  ('${P(7)}', $n$ 	${TEST_NAME}  $n$, 'o@x.sa', null, null, 'self', null, now()),
  ('${P(8)}', 'منسحب', 'w@x.sa', null, '${ORG}', 'self', null, now()),
  ('${P(9)}', 'جهة', 'd@x.sa', '+966503333333', '${ORG}', 'self', null, now());
  update leaders.participants set is_test = true where id = '${P(6)}';
  update leaders.participants set status = 'withdrawn' where id = '${P(8)}';
  insert into leaders.participants (id, full_name, email, phone, is_demo) values ('${P(10)}', 'تجريبي', 'demo@demo.milestone-impact.org', '+966501111111', true);
  insert into leaders.auth_sessions (participant_id) values ('${P(1)}'), ('${P(1)}'), ('${P(2)}');`;

async function db(extra = '') {
  const d = new PGlite();
  await d.exec(BEFORE); await d.exec(INTAKE); await d.exec(SEED);
  if (extra) await d.exec(extra);
  return d;
}
const rows = async (d, sql) => (await d.query(sql)).rows;
const n = async (d, sql) => (await d.query(sql)).rows[0].n;
const status = async (d, id) => (await rows(d, `select status from leaders.participants where id = '${id}'`))[0].status;
const cohortless = (d) => rows(d, `select id from leaders.participants pa where not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn') order by id`);

describe('ترحيل 20261128170000 (المكرر بالهاتف وإلحاق من لا دفعة له)', { timeout: 60000 }, () => {
  it('البصمات الخمس في الترحيل، والاستبدال في الاختبار وقع', () => {
    expect(M1_REAL.match(/'[0-9a-f]{32}'/g)).toHaveLength(5);
    expect(M1).not.toBe(M1_REAL);
  });

  it('يؤرشف الأقدم في كل زوج ولا يحذفه، ويبطل جلساته، ويسجل kept_id', async () => {
    const d = await db();
    await d.exec(M1);
    expect([await status(d, P(1)), await status(d, P(2)), await status(d, P(3)), await status(d, P(4))]).toEqual(['suspended', 'registered', 'suspended', 'registered']);
    expect(await n(d, 'select count(*)::int n from leaders.participants')).toBe(10);
    expect(await n(d, `select count(*)::int n from leaders.auth_sessions where participant_id = '${P(1)}' and revoked_at is null`)).toBe(0);
    expect(await n(d, `select count(*)::int n from leaders.auth_sessions where participant_id = '${P(2)}' and revoked_at is null`)).toBe(1);
    const log = await rows(d, `select entity_id, after from leaders.audit_log where action = 'participant.duplicate_archived' order by entity_id`);
    expect(log.map((r) => [r.entity_id, r.after.kept_id])).toEqual([[P(1), P(2)], [P(3), P(4)]]);
    expect(log[0].after.sessions_revoked).toBe(2);
  });

  it('يلحق الباقين ويستثني التجريبي والاختبار والبصمة والمؤرشف والمنسحب', async () => {
    const d = await db();
    await d.exec(M1);
    expect((await cohortless(d)).map((r) => r.id)).toEqual([P(1), P(3), P(6), P(7), P(8), P(10)]);
    const src = await rows(d, `select distinct source, actor from leaders.cohort_placements`);
    expect(src).toEqual([{ source: 'manual', actor: 'migration:20261128170000' }]);
    expect(await n(d, 'select count(*)::int n from leaders.cohort_placements')).toBe(4);
    expect(await n(d, `select count(*)::int n from leaders.audit_log where action = 'participant.cohort_backfill'`)).toBe(4);
  });

  it('إعادة التشغيل لا تغيّر شيئًا', async () => {
    const d = await db();
    await d.exec(M1);
    const snap = async () => JSON.stringify([await rows(d, 'select id, status from leaders.participants order by id'),
      await rows(d, 'select participant_id, cohort_id, status from leaders.enrollments order by participant_id'),
      await n(d, 'select count(*)::int n from leaders.audit_log'), await n(d, 'select count(*)::int n from leaders.cohort_placements'),
      await n(d, 'select count(*)::int n from leaders.backup_20261128_duplicates_backfill')]);
    const before = await snap();
    await d.exec(M1);
    expect(await snap()).toBe(before);
  });

  it('المكرر ذو الأثر يُترك (لا يُؤرشف) ويُلحق كغيره، والترحيل الثاني يرفض حينها', async () => {
    const d = await db(`insert into leaders.participant_requirements (participant_id) values ('${U(101)}')`);
    await d.exec(M1);
    expect(await status(d, P(1))).toBe('registered');
    expect(await status(d, P(3))).toBe('suspended');
    expect(await n(d, `select count(*)::int n from leaders.enrollments where participant_id = '${P(1)}'`)).toBe(1);
    await expect(d.exec(M2)).rejects.toThrow(/phone_unique: 1 phone number/);
    expect(await n(d, `select count(*)::int n from pg_indexes where indexname = 'participants_phone_key_uniq'`)).toBe(0);
  });

  it('الإلحاق بلا دفعة (none) يرمي فورًا باسم المشارك ويُرجع الترحيل كله', async () => {
    const d = await db('delete from leaders.program_versions');   // لا نسخة فلا دفعة تُنشأ
    await expect(d.exec(`begin; ${M1}; commit;`)).rejects.toThrow(/returned none for participant 00000000-0000-4000-8000-/);
    await d.exec('rollback').catch(() => {});
    expect(await status(d, P(1))).toBe('registered');
    expect(await n(d, `select count(*)::int n from leaders.audit_log`)).toBe(0);
    expect(await n(d, `select count(*)::int n from pg_tables where tablename = 'backup_20261128_duplicates_backfill'`)).toBe(0);
  });

  it('ثلاثة حسابات بهاتف واحد: يبقى الأحدث دخولًا ويُؤرشف الاثنان بالباقي نفسه', async () => {
    const d = await db(`insert into leaders.participants (id, full_name, email, phone, organization_id, source, last_login_at, created_at)
      values ('${P(11)}', 'ثالث', 'a3@gmail.com', '966501111111', '${ORG}', 'invite', '2026-11-10', '2026-10-02')`);
    await d.exec(M1);
    expect([await status(d, P(1)), await status(d, P(11)), await status(d, P(2))]).toEqual(['suspended', 'suspended', 'registered']);
    const log = await rows(d, `select entity_id, after->>'kept_id' k from leaders.audit_log where action = 'participant.duplicate_archived' and after->>'kept_id' = '${P(2)}' order by entity_id`);
    expect(log.map((r) => r.entity_id)).toEqual([P(1), P(11)]);
    await d.exec(M2);
  });

  it('سطر restore يعيد الحال: المؤرشف إلى حاله، والإلحاقات وسجلها، والدفعات التي أنشأها الإلحاق وبقيت فارغة', async () => {
    const d = await db();
    await d.exec(M1);
    expect(await n(d, `select count(*)::int n from leaders.backup_20261128_duplicates_backfill where kind = 'cohort'`)).toBe(2);
    await d.exec(M1_REAL.match(/^-- restore: (.*)$/m)[1]);
    expect(await status(d, P(1))).toBe('registered');
    expect(await n(d, 'select count(*)::int n from leaders.enrollments')).toBe(0);
    expect(await n(d, 'select count(*)::int n from leaders.cohort_placements')).toBe(0);
    expect(await n(d, 'select count(*)::int n from leaders.cohorts')).toBe(0);
  });

  it('التحقق الذاتي يرمي إن كان أحد في دفعتين', async () => {
    const d = await db(`insert into leaders.cohorts (id, name, program_id, program_version_id, status) values ('${U(50)}', 'أ', '${PROG}', '${V1}', 'open'), ('${U(51)}', 'ب', '${PROG}', '${V1}', 'open');
      insert into leaders.enrollments (participant_id, cohort_id, status) values ('${P(9)}', '${U(50)}', 'active'), ('${P(9)}', '${U(51)}', 'active')`);
    await expect(d.exec(`begin; ${M1}; commit;`)).rejects.toThrow(/more than one cohort/);
  });
});

describe('ترحيل 20261128180000 (هاتف واحد لحساب قائم)', { timeout: 60000 }, () => {
  it('يرفض قبل الأرشفة، ويُنشأ بعدها، ثم يرد هاتفًا قائمًا بأي صيغة ويقبل الموقوف والتجريبي', async () => {
    const d = await db();
    await expect(d.exec(M2)).rejects.toThrow(/phone_unique: 2 phone number/);
    await d.exec(M1); await d.exec(M2); await d.exec(M2);
    // الباقي +966501111111: كل صيغة للرقم نفسه تصطدم به (00 الدولية، والمحلية، والأرقام الهندية، والمسافات)
    for (const [i, v] of ['00966501111111', '0501111111', '٠٥٠١١١١١١١', '+966 50 111 1111', '501111111'].entries()) {
      await expect(d.exec(`insert into leaders.participants (id, email, phone) values ('${U(310 + i)}', 'v${i}@x.sa', '${v}')`)).rejects.toThrow(/participants_phone_key_uniq/);
    }
    await expect(d.exec(`insert into leaders.participants (id, email, phone) values ('${U(300)}', 'z@x.sa', '0503333333')`)).rejects.toThrow(/participants_phone_key_uniq/);
    await d.exec(`insert into leaders.participants (id, email, phone, status) values ('${U(301)}', 'y@x.sa', '0503333333', 'suspended')`);
    await d.exec(`insert into leaders.participants (id, email, phone) values ('${U(302)}', 'short@x.sa', '1234')`);
    await d.exec(`insert into leaders.participants (id, email, phone) values ('${U(303)}', 'short2@x.sa', '1234')`);
    // إعادة تفعيل المؤرشف تصطدم بالباقي
    await expect(d.exec(`update leaders.participants set status = 'registered' where id = '${P(1)}'`)).rejects.toThrow(/participants_phone_key_uniq/);
  });
});

describe('scripts/db/verify-backfill-after.sql', { timeout: 60000 }, () => {
  it('كل فحص صف واحد ok/detail، وكلها ok بعد الترحيلين', async () => {
    const d = await db();
    await d.exec(M1); await d.exec(M2);
    const checks = VERIFY.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    expect(checks.length).toBeGreaterThanOrEqual(4);
    for (const q of checks) {
      expect(q).toMatch(/^(select|with)\b/i);
      const r = await rows(d, q);
      expect(r).toHaveLength(1);
      expect(r[0].ok, `${q}\n${r[0].detail}`).toBe(true);
    }
  });
});
