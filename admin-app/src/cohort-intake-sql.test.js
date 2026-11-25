// ترحيل 20261128160000 (الدفعة هي الوحدة الوحيدة) على قاعدة مؤقتة حقيقية (PGlite): place_participant ينشئ دفعة الاستقبال والمنصة
// العامة مثبتتين على أحدث نسخة، ويحترم السعة، ولا يُلحق أحدًا بدفعتين ولا ينقل من له دفعة، ويرد الحساب التجريبي، ويسجّل المصدر.
// والترحيل نفسه لا يُلحق أحدًا. (PGlite اتصال واحد: التزامن الحقيقي بأقفال الصفوف جُرّب على PostgreSQL 16، ويحاكيه cohort_intake_test.ts)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const NAME = '20261128160000_leaders_cohort_intake';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(1), ORG = U(2), ORG2 = U(3), V1 = U(11), V2 = U(12);
const P = (n) => U(100 + n);
const BEFORE = `create role anon; create role authenticated; create role service_role;
  create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.programs (id uuid primary key, name text not null, is_default boolean not null default false, archived_at timestamptz);
  create table leaders.program_versions (id uuid primary key, program_id uuid not null, number int not null, label text not null default 'v', data jsonb not null default '{}');
  create table leaders.organizations (id uuid primary key, name text not null, status text not null default 'active');
  create table leaders.participants (id uuid primary key, full_name text, organization_id uuid, is_demo boolean not null default false);
  create table leaders.cohorts (id uuid primary key default gen_random_uuid(), name text not null, track text not null default 'individual', organization_id uuid,
    program_id uuid not null, program_version_id uuid, status text not null default 'planned', capacity smallint, is_default boolean not null default false,
    starts_on date, created_at timestamptz not null default now());
  create unique index cohorts_one_default on leaders.cohorts ((true)) where is_default;
  create table leaders.enrollments (id uuid primary key default gen_random_uuid(), participant_id uuid not null, cohort_id uuid not null,
    status text not null default 'nominated', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint enrollments_participant_id_cohort_id_key unique (participant_id, cohort_id));
  create table leaders.sponsor_codes (id uuid primary key default gen_random_uuid(), organization_id uuid not null, code text not null);
  insert into leaders.programs (id, name, is_default) values ('${PROG}', 'برنامج القادة', true);
  insert into leaders.program_versions (id, program_id, number) values ('${V1}', '${PROG}', 1), ('${V2}', '${PROG}', 2);
  insert into leaders.organizations (id, name) values ('${ORG}', 'منظومة'), ('${ORG2}', 'جهة ثانية');
  insert into leaders.participants (id, full_name, organization_id) select ('00000000-0000-4000-8000-' || lpad((100 + g)::text, 12, '0'))::uuid, 'م' || g, '${ORG}' from generate_series(1, 8) g;
  insert into leaders.participants (id, full_name) values ('${P(20)}', 'بلا جهة');
  insert into leaders.participants (id, full_name, is_demo) values ('${P(21)}', 'تجريبي', true);`;

async function db() { const d = new PGlite(); await d.exec(BEFORE); await d.exec(SQL); return d; }
const place = async (d, p, source = 'link', wanted = null) => (await d.query('select * from leaders.place_participant($1, $2, $3, $4)', [p, source, wanted, null])).rows[0];
const n = async (d, sql) => (await d.query(sql)).rows[0].n;

describe(`ترحيل ${NAME}`, { timeout: 60000 }, () => {
  it('الترحيل لا يُلحق أحدًا، وإعادة تشغيله بلا أثر', async () => {
    const d = await db();
    await d.exec(SQL);
    expect(await n(d, 'select count(*)::int n from leaders.enrollments')).toBe(0);
    expect(await n(d, 'select count(*)::int n from leaders.cohorts')).toBe(0);
  });

  it('أول عضو ينشئ دفعة استقبال الجهة باسمها مثبتة على أحدث نسخة، والسعة تُحترم والزائد إلى المنصة العامة', async () => {
    const d = await db();
    const first = await place(d, P(1));
    expect(first.outcome).toBe('placed');
    const intake = (await d.query('select * from leaders.cohorts where is_intake')).rows[0];
    expect([intake.organization_id, intake.program_version_id, intake.status, intake.track]).toEqual([ORG, V2, 'open', 'institutional']);
    expect(intake.name).toContain('منظومة');
    await d.exec(`update leaders.cohorts set capacity = 3 where id = '${intake.id}'`);
    const rest = [];
    for (let i = 2; i <= 8; i++) rest.push(await place(d, P(i)));
    expect(rest.filter((r) => r.outcome === 'placed')).toHaveLength(2);
    expect(rest.filter((r) => r.outcome === 'overflow')).toHaveLength(5);
    const platform = (await d.query('select * from leaders.cohorts where is_default')).rows[0];
    expect([platform.organization_id, platform.program_version_id, platform.name]).toEqual([null, V2, 'المنصة العامة']);
    expect(await n(d, `select count(*)::int n from leaders.enrollments where cohort_id = '${intake.id}'`)).toBe(3);
    expect(await n(d, `select count(*)::int n from leaders.cohort_placements where outcome = 'overflow' and organization_id = '${ORG}'`)).toBe(5);
  });

  it('من له دفعة لا يُنقل ولا يُلحق بثانية، والتجريبي لا يُلحق، والمصدر يُسجَّل', async () => {
    const d = await db();
    expect((await place(d, P(20), 'platform')).outcome).toBe('placed');
    const again = await place(d, P(20), 'code');
    expect(again.outcome).toBe('already');
    expect((await place(d, P(21), 'platform')).outcome).toBe('demo');
    expect(await n(d, `select count(*)::int n from leaders.enrollments where participant_id = '${P(20)}'`)).toBe(1);
    expect(await n(d, `select count(*)::int n from leaders.enrollments where participant_id = '${P(21)}'`)).toBe(0);
    expect((await d.query('select source from leaders.cohort_placements')).rows.map((r) => r.source)).toEqual(['platform']);
    await expect(place(d, P(1), 'nope')).rejects.toThrow(/bad source/);
  });

  it('دفعة الرمز تُحترم إن كانت للجهة نفسها، ودفعة جهة أخرى تُتجاهل إلى الاستقبال، والمغلقة إلى المنصة العامة', async () => {
    const d = await db();
    const own = (await d.query(`insert into leaders.cohorts (name, organization_id, program_id, program_version_id, status) values ('دفعة الربيع', '${ORG}', '${PROG}', '${V1}', 'open') returning id`)).rows[0].id;
    const other = (await d.query(`insert into leaders.cohorts (name, organization_id, program_id, program_version_id, status) values ('غريبة', '${ORG2}', '${PROG}', '${V1}', 'open') returning id`)).rows[0].id;
    expect((await place(d, P(1), 'code', own)).cohort_id).toBe(own);
    const r = await place(d, P(2), 'code', other);
    expect(r.cohort_id).not.toBe(other);
    expect((await d.query(`select is_intake from leaders.cohorts where id = '${r.cohort_id}'`)).rows[0].is_intake).toBe(true);
    // برنامج دفعة الجهة القائمة هو برنامج الاستقبال
    expect((await d.query(`select program_id from leaders.cohorts where id = '${r.cohort_id}'`)).rows[0].program_id).toBe(PROG);
    await d.exec(`update leaders.cohorts set status = 'closed' where id = '${own}'`);
    expect((await place(d, P(3), 'code', own)).outcome).toBe('overflow');
  });

  it('القيود: استقبال واحد لكل جهة، ولا استقبال بلا جهة، ولا برنامج بلا نسخة تُنشأ عليه دفعة', async () => {
    const d = await db();
    await place(d, P(1));
    await expect(d.exec(`insert into leaders.cohorts (name, organization_id, program_id, is_intake) values ('ثانية', '${ORG}', '${PROG}', true)`)).rejects.toThrow(/cohorts_one_intake/);
    await expect(d.exec(`insert into leaders.cohorts (name, program_id, is_intake) values ('بلا جهة', '${PROG}', true)`)).rejects.toThrow(/cohorts_intake_shape/);
    const e = await db();
    await e.exec('delete from leaders.program_versions');
    expect((await place(e, P(20), 'platform')).outcome).toBe('none');
    expect(await n(e, 'select count(*)::int n from leaders.cohorts')).toBe(0);
  });
});
