// ترحيل 20261123100000 (حساب تجريبي لكل دفعة) على قاعدة مؤقتة حقيقية (PGlite): القيود التي يقوم عليها الضمان.
// حساب واحد لكل دفعة وحساب عام واحد، ولا يحمل الدفعة التجريبية إلا صف بعلامة is_demo، ولا يُربط الحساب بجهة، وحذف الدفعة
// يحذف حسابها التجريبي وحده ولا يمس مشاركًا حقيقيًا، والحساب العام وروابطه القائمة كما هي، وإعادة التشغيل بلا أثر.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const NAME = '20261123100000_leaders_demo_per_cohort';
const SQL = readFileSync(join(__dirname, `../../supabase/migrations/${NAME}.sql`), 'utf8');
const C1 = '00000000-0000-4000-8000-000000000902', C2 = '00000000-0000-4000-8000-000000000903', ORG = '00000000-0000-4000-8000-000000000800';
const DOMAIN = 'demo.milestone-impact.org';
// ما قبل الترحيل كما في اللقطة: فهرس البريد الفريد، وقيد الحساب الواحد، وقيد «بلا جهة»، وإلحاق عضو حقيقي بالدفعة
const BEFORE = `create schema leaders;
  create table leaders.schema_migrations (name text primary key);
  create table leaders.organizations (id uuid primary key);
  create table leaders.cohorts (id uuid primary key, name text not null, status text not null default 'running');
  create table leaders.participants (id uuid primary key default gen_random_uuid(), email text not null, full_name text not null, organization_id uuid references leaders.organizations (id),
    is_demo boolean not null default false, is_test boolean not null default false,
    constraint participants_demo_no_org check (not (is_demo and organization_id is not null)));
  create unique index participants_email_uniq on leaders.participants (lower(email));
  create unique index participants_one_demo on leaders.participants ((true)) where is_demo;
  create table leaders.enrollments (participant_id uuid not null references leaders.participants (id) on delete cascade, cohort_id uuid not null references leaders.cohorts (id) on delete restrict);
  create table leaders.auth_sessions (id uuid primary key default gen_random_uuid(), participant_id uuid not null references leaders.participants (id) on delete cascade);
  create table leaders.demo_links (id uuid primary key default gen_random_uuid(), label text not null);
  insert into leaders.organizations values ('${ORG}');
  insert into leaders.cohorts (id, name) values ('${C1}', 'قادة الجهة 1'), ('${C2}', 'دفعة الأفراد 2');
  insert into leaders.participants (email, full_name, organization_id) values ('real@example.sa', 'مشاركة حقيقية', '${ORG}'), ('second@example.sa', 'مشاركة ثانية', null);
  insert into leaders.participants (email, full_name, is_demo) values ('demo@${DOMAIN}', 'مشارك تجريبي', true);
  insert into leaders.demo_links (label) values ('رابط قائم');`;

async function db(before = BEFORE) { const d = new PGlite(); await d.exec(before); await d.exec(SQL); return d; }
const n = async (d, q) => (await d.query(`select count(*)::int n from ${q}`)).rows[0].n;
const demo = (cohort, email = `demo-${cohort}@${DOMAIN}`) => `insert into leaders.participants (email, full_name, is_demo, demo_cohort_id) values ('${email}', 'مشارك تجريبي', true, '${cohort}')`;

describe(`ترحيل ${NAME}`, { timeout: 60000 }, () => {
  it('لا صف قائم يتغير: الحساب العام والمشاركون والروابط كما هي، والعمودان فارغان، وقيد الحساب الواحد يزول', async () => {
    const d = await db();
    expect((await d.query('select email, is_demo, demo_cohort_id from leaders.participants order by email')).rows).toEqual([
      { email: `demo@${DOMAIN}`, is_demo: true, demo_cohort_id: null }, { email: 'real@example.sa', is_demo: false, demo_cohort_id: null }, { email: 'second@example.sa', is_demo: false, demo_cohort_id: null }]);
    expect((await d.query('select label, cohort_id from leaders.demo_links')).rows).toEqual([{ label: 'رابط قائم', cohort_id: null }]);
    expect(await n(d, "pg_indexes where schemaname = 'leaders' and indexname = 'participants_one_demo'")).toBe(0);
    expect(await n(d, `leaders.schema_migrations where name = '${NAME}'`)).toBe(1);
  });

  it('حساب واحد لكل دفعة وحساب عام واحد، ببريد مشتق من الدفعة', async () => {
    const d = await db();
    await d.exec(demo(C1));
    await d.exec(demo(C2));
    expect(await n(d, 'leaders.participants where is_demo')).toBe(3);
    // حساب ثانٍ للدفعة نفسها: البريد المفروض بالقيد فريد
    await expect(d.exec(demo(C1))).rejects.toThrow(/participants_email_uniq/);
    await expect(d.exec(demo(C1, `demo2-${C1}@${DOMAIN}`))).rejects.toThrow(/participants_demo_identity/);
    await expect(d.exec(demo(C1, `demo-${C2}@${DOMAIN}`))).rejects.toThrow(/participants_demo_identity|participants_email_uniq/);
    // وحساب عام ثانٍ، أو حساب تجريبي ببريد آخر بلا دفعة
    await expect(d.exec(`insert into leaders.participants (email, full_name, is_demo) values ('other@${DOMAIN}', 'آخر', true)`)).rejects.toThrow(/participants_demo_identity/);
    await expect(d.exec(`insert into leaders.participants (email, full_name, is_demo) values ('DEMO@${DOMAIN}', 'آخر', true)`)).rejects.toThrow(/participants_email_uniq/);
    // وتبديل دفعة حساب قائم يرده القيد نفسه (بريده لدفعته الأولى)
    await expect(d.exec(`update leaders.participants set demo_cohort_id = '${C2}' where demo_cohort_id = '${C1}'`)).rejects.toThrow(/participants_demo_identity/);
    expect(await n(d, 'leaders.participants where is_demo')).toBe(3);
  });

  it('مشارك حقيقي لا يحمل دفعة تجريبية، والحساب التجريبي لا يُربط بجهة ولا تُنزع علامته وهو يحمل دفعة', async () => {
    const d = await db();
    await d.exec(demo(C1));
    await expect(d.exec(`update leaders.participants set demo_cohort_id = '${C1}' where email = 'real@example.sa'`)).rejects.toThrow(/participants_demo_cohort_is_demo/);
    await expect(d.exec(`insert into leaders.participants (email, full_name, demo_cohort_id) values ('x@example.sa', 'حقيقي', '${C1}')`)).rejects.toThrow(/participants_demo_cohort_is_demo/);
    await expect(d.exec(`update leaders.participants set is_demo = false where demo_cohort_id = '${C1}'`)).rejects.toThrow(/participants_demo_cohort_is_demo/);
    await expect(d.exec(`update leaders.participants set organization_id = '${ORG}' where demo_cohort_id = '${C1}'`)).rejects.toThrow(/participants_demo_no_org/);
    await expect(d.exec(`insert into leaders.participants (email, full_name, is_demo, demo_cohort_id) values ('demo-00000000-0000-4000-8000-000000000999@${DOMAIN}', 'بلا دفعة', true, '00000000-0000-4000-8000-000000000999')`)).rejects.toThrow(/participants_demo_cohort_id_fkey/);
  });

  it('حذف الدفعة يحذف حسابها التجريبي وجلساته وروابطها وحدها: لا مشارك حقيقي ولا حساب دفعة أخرى ولا العام', async () => {
    const d = await db();
    await d.exec(demo(C1));
    await d.exec(demo(C2));
    await d.exec(`insert into leaders.auth_sessions (participant_id) select id from leaders.participants where is_demo`);
    await d.exec(`insert into leaders.demo_links (label, cohort_id) values ('رابط الدفعة 1', '${C1}'), ('رابط الدفعة 2', '${C2}')`);
    // عضو حقيقي ملحق بالدفعة يمنع حذفها (enrollments: on delete restrict)، فلا يُحذف شيء
    await d.exec(`insert into leaders.enrollments select id, '${C1}' from leaders.participants where email = 'second@example.sa'`);
    await expect(d.exec(`delete from leaders.cohorts where id = '${C1}'`)).rejects.toThrow(/enrollments/);
    expect(await n(d, 'leaders.participants')).toBe(5);
    await d.exec('delete from leaders.enrollments');
    await d.exec(`delete from leaders.cohorts where id = '${C1}'`);
    expect((await d.query('select email from leaders.participants order by email')).rows.map((r) => r.email)).toEqual([`demo-${C2}@${DOMAIN}`, `demo@${DOMAIN}`, 'real@example.sa', 'second@example.sa']);
    expect(await n(d, 'leaders.auth_sessions')).toBe(2);
    expect((await d.query('select label from leaders.demo_links order by label')).rows.map((r) => r.label)).toEqual(['رابط الدفعة 2', 'رابط قائم']);
  });

  it('إعادة التشغيل لا تغيّر شيئًا، وبلا حساب عام قائم يمر كذلك', async () => {
    const d = await db();
    await d.exec(demo(C1));
    const snap = async () => JSON.stringify((await d.query(`select (select json_agg(p order by email) from leaders.participants p) p, (select json_agg(l order by label) from leaders.demo_links l) l,
      (select json_agg(c.conname order by c.conname) from pg_constraint c where c.conrelid = 'leaders.participants'::regclass) k`)).rows[0]);
    const first = await snap();
    await d.exec(SQL);
    expect(await snap()).toBe(first);
    const empty = await db(BEFORE.replace(/insert into leaders\.participants \(email, full_name, is_demo\)[^;]+;/, ''));
    expect(await n(empty, 'leaders.participants where is_demo')).toBe(0);
  });

  it('صف تجريبي قائم ببريد غير المعروف يُفشل التحقق (والتطبيق يلف الترحيل في معاملة، فلا يبقى أثر)', async () => {
    const odd = new PGlite();
    await odd.exec(BEFORE.replace(`'demo@${DOMAIN}'`, "'someone@example.sa'"));
    await expect(odd.exec(`begin; ${SQL} commit;`)).rejects.toThrow(/participants_demo_identity/);
    await odd.exec('rollback');
    expect(await n(odd, "pg_indexes where schemaname = 'leaders' and indexname = 'participants_one_demo'")).toBe(1);
    expect(await n(odd, "information_schema.columns where table_schema = 'leaders' and table_name = 'participants' and column_name = 'demo_cohort_id'")).toBe(0);
  });

  it('الوسم متسامح بملاحظته، وبلا فهرس جديد على جدول المشاركين، وبلا شرطة طويلة', () => {
    expect(SQL).toMatch(/^-- deploy-gate: tolerant .*غير مفعّلة بعد/m);
    expect(SQL).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(SQL).not.toMatch(/[–—]/);
    const applied = JSON.parse(readFileSync(join(__dirname, '../../scripts/db/applied-manifest.json'), 'utf8')).migrations;
    // طُبّق على الإنتاج (سجله 2026-11-26)، فصار في البيان وبصمته مجمدة
    expect(Object.keys(applied)).toContain(NAME);
  });
});
