// البنية المرجعية تبني قاعدة جديدة كاملة، وأسماؤها المرجعية تطابق قاموس labels.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, LEVELS } from '../../supabase/functions/leaders-api/labels.js';

const SQL = readFileSync(join(__dirname, '../../supabase/schema/baseline.sql'), 'utf8');
// ما توفره Supabase لكل مشروع قبل أي ترحيل
const SUPABASE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;

describe('البنية المرجعية', () => {
  it('تبني قاعدة فارغة كاملة، وإعادة تشغيلها لا تغير شيئًا', async () => {
    const db = new PGlite();
    await db.exec(SUPABASE);
    await db.exec(SQL);
    const { rows: [n] } = await db.query(`select
      (select count(*) from pg_tables where schemaname in ('leaders', 'public'))::int tables,
      (select count(*) from pg_policies)::int policies,
      (select count(*) from pg_constraint where contype = 'f')::int fks`);
    expect(n.tables).toBeGreaterThan(80);
    expect(n.policies).toBeGreaterThan(30);
    expect(n.fks).toBeGreaterThan(100);
    await db.exec(SQL);

    const dims = (await db.query('select key, title_ar from leaders.dimensions')).rows;
    const lvls = (await db.query('select key, title_ar from leaders.levels')).rows;
    for (const d of DIMENSIONS) expect(dims.find((x) => x.key === d.key)?.title_ar, d.key).toBe(d.title);
    for (const l of LEVELS) expect(lvls.find((x) => x.key === l.key)?.title_ar, l.key).toBe(l.title);
  }, 60000);
});
