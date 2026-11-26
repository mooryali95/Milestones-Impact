// تصور المرحلة 4 (مصدر واحد للدفعة الحاكمة) على قاعدة مؤقتة حقيقية (PGlite) فوق 20261128160000: فحص القياس قبل الكتابة
// scripts/db/verify-single-cohort.sql (م1)، وترحيل التعبئة والفهرس الفريد الجزئي (م2) حين يُضاف.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (n) => readFileSync(join(root, `supabase/migrations/${n}.sql`), 'utf8');
const INTAKE = read('20261128160000_leaders_cohort_intake');
const VERIFY = readFileSync(join(root, 'scripts/db/verify-single-cohort.sql'), 'utf8');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(1), ORG = U(2), ORG2 = U(3), V1 = U(11);
const P = (n) => U(100 + n);
const C_ORG = U(50), C_ORG2 = U(51), C_NEW = U(52);
export const BEFORE = `create role anon; create role authenticated; create role service_role;
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
  create table leaders.cohorts (id uuid primary key default gen_random_uuid(), name text not null, track text not null default 'individual', organization_id uuid,
    program_id uuid not null, program_version_id uuid, status text not null default 'planned', capacity smallint, is_default boolean not null default false,
    starts_on date, created_at timestamptz not null default now());
  create unique index cohorts_one_default on leaders.cohorts ((true)) where is_default;
  create table leaders.enrollments (id uuid primary key default gen_random_uuid(), participant_id uuid not null, cohort_id uuid not null,
    status text not null default 'nominated', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint enrollments_participant_id_cohort_id_key unique (participant_id, cohort_id));
  create table leaders.sponsor_codes (id uuid primary key default gen_random_uuid(), organization_id uuid not null, code text not null);
  create table leaders.cohort_group_members (cohort_id uuid not null, participant_id uuid not null, group_id uuid not null, created_at timestamptz not null default now(), primary key (cohort_id, participant_id));
  create table leaders.cohort_roles (id uuid primary key default gen_random_uuid(), cohort_id uuid not null, participant_id uuid not null, role text);
  insert into leaders.programs (id, name, is_default) values ('${PROG}', 'برنامج القادة', true);
  insert into leaders.program_versions (id, program_id, number) values ('${V1}', '${PROG}', 1);
  insert into leaders.organizations (id, name) values ('${ORG}', 'منظومة'), ('${ORG2}', 'جهة ثانية');`;

// 1 حقيقي بجهة بلا إلحاق (يحكمه الاستنتاج)، 2 حقيقي بإلحاقين، 3 ملحق بدفعة جهة أخرى، 4 اختبار بجهة بلا إلحاق،
// 5 موقوف، 6 بلا جهة بلا إلحاق، 7 ملحق سليم، 8 تجريبي
export const SEED = `insert into leaders.cohorts (id, name, organization_id, program_id, program_version_id, status, created_at) values
    ('${C_ORG}', 'دفعة منظومة', '${ORG}', '${PROG}', '${V1}', 'running', '2026-10-01'),
    ('${C_ORG2}', 'دفعة الثانية', '${ORG2}', '${PROG}', '${V1}', 'open', '2026-10-01'),
    ('${C_NEW}', 'دفعة بلا نسخة', '${ORG}', '${PROG}', null, 'open', '2026-11-01');
  insert into leaders.participants (id, full_name, organization_id, is_test, status, is_demo, created_at) values
    ('${P(1)}', 'أ', '${ORG}', false, 'registered', false, '2026-10-01'),
    ('${P(2)}', 'ب', '${ORG}', false, 'registered', false, '2026-10-01'),
    ('${P(3)}', 'ج', '${ORG}', false, 'registered', false, '2026-10-01'),
    ('${P(4)}', 'د', '${ORG}', true, 'registered', false, '2026-10-01'),
    ('${P(5)}', 'هـ', '${ORG}', false, 'suspended', false, '2026-10-01'),
    ('${P(6)}', 'و', null, false, 'registered', false, '2026-10-01'),
    ('${P(7)}', 'ز', '${ORG2}', false, 'registered', false, '2026-10-01'),
    ('${P(8)}', 'تجريبي', null, false, 'registered', true, '2026-10-01');
  insert into leaders.enrollments (participant_id, cohort_id, status, created_at) values
    ('${P(2)}', '${C_ORG}', 'active', '2026-10-02'), ('${P(2)}', '${C_ORG2}', 'active', '2026-10-05'),
    ('${P(3)}', '${C_ORG2}', 'active', '2026-10-02'), ('${P(7)}', '${C_ORG2}', 'active', '2026-10-02');`;

export async function db(extra = '') {
  const d = new PGlite();
  await d.exec(BEFORE); await d.exec(INTAKE); await d.exec(SEED);
  if (extra) await d.exec(extra);
  return d;
}
export const rows = async (d, sql) => (await d.query(sql)).rows;
export const checksOf = (sql) => sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
export const verify = async (d) => {
  const out = [];
  for (const q of checksOf(VERIFY)) { const r = await rows(d, q); expect(r).toHaveLength(1); out.push(r[0]); }
  return out;
};

describe('scripts/db/verify-single-cohort.sql (م1: القياس قبل الكتابة)', { timeout: 60000 }, () => {
  it('سبعة فحوص قراءة فقط، كل منها صف واحد ok/detail', () => {
    const checks = checksOf(VERIFY);
    expect(checks).toHaveLength(7);
    for (const q of checks) expect(q).toMatch(/^(select|with)\b/i);
    expect(VERIFY).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/i);
  });

  it('قبل التعبئة يعد من بلا إلحاق بحالته، والإلحاق المزدوج، ودفعة جهة أخرى، والاستنتاج بالجهة، والدفعة بلا نسخة', async () => {
    const d = await db();
    const [lone, dbl, foreign, inferred, , unpinned, mig] = await verify(d);
    expect(lone.ok).toBe(false);
    expect(lone.detail).toContain('حقيقي قائم=2');
    expect(lone.detail).toContain('حساب اختبار=1');
    expect(lone.detail).toContain('موقوف أو منسحب=1');
    expect(dbl).toEqual({ ok: false, detail: 'مشاركون بأكثر من إلحاق قائم=1' });
    expect(foreign.ok).toBe(false);
    expect(foreign.detail).toMatch(/^ملحقون بدفعة جهة أخرى=2/);
    expect(inferred.ok).toBe(false);
    expect(inferred.detail).toBe('يحكمهم الاستنتاج بالجهة=3 · منهم قائمون غير موقوفين=2');
    expect(unpinned.ok).toBe(false);
    expect(unpinned.detail).toContain('دفعة بلا نسخة');
    expect(mig.detail).toBe('enrollments_one_active=false · transfer_participant=false · 20261129230000=false');
  });
});
