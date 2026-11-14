// ترحيل إقفال مخطط public (تدقيق 2026-11-14: D1 وD2 وD3 وD5 وD9): يُختبر على قاعدة مؤقتة بصيغة الإنتاج
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261114120000_public_lockdown.sql'), 'utf8');
// ما يكفي من مخطط الإنتاج قبل الترحيل: الجداول وسياساتها ومنحها كما في اللقطة
const BEFORE = `
  create role anon; create role authenticated; create role service_role;
  create schema leaders; create table leaders.schema_migrations (name text primary key);
  create table leaders.audit_log (id bigserial primary key, action text);
  create table leaders.handbook_modules_backup_20261023 (id int);
  create table public.admin_users (id uuid primary key, email text, totp_secret text);
  create table public.admin_audit_log (id bigserial primary key, action text);
  create table public.admin_roles (id text primary key);
  create table public.admin_role_permissions (role_id text);
  create table public.contact_requests (id bigserial primary key, email text);
  create table public.app_content (id int);
  create table public.page_views (id bigserial primary key, site text, path text, title text, referrer text, visit_id text, device text, lang text, created_at timestamptz not null default now());
  create function public.get_my_admin_role() returns text language sql security definer set search_path = '' as $$ select 'super_admin'::text $$;
  create function public.has_permission(text, text) returns boolean language sql security definer set search_path = '' as $$ select true $$;
  alter table public.admin_users enable row level security;
  alter table public.page_views enable row level security;
  alter table public.app_content enable row level security;
  create policy admin_read_users on public.admin_users for select to authenticated using (public.get_my_admin_role() = 'super_admin');
  create policy super_admin_manage_users on public.admin_users for all to authenticated using (public.get_my_admin_role() = 'super_admin');
  create policy "anon can insert page views" on public.page_views for insert to anon with check (char_length(site) <= 40);
  create policy "Allow read all" on public.app_content for select to public using (true);
  grant usage on schema public to anon, authenticated;
  grant all on public.admin_users, public.admin_audit_log, public.contact_requests, public.page_views to anon, authenticated;
  grant select on public.app_content to anon;
  insert into public.admin_users values ('00000000-0000-0000-0000-000000000001', 'a@x.sa', 'SEED');
`;
const as = async (db, role, sql) => {
  await db.exec(`set role ${role}`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
};

describe('ترحيل 20261114120000_public_lockdown', () => {
  it('متسامح (الخادم لا يعتمد عليه)، وإعادته آمنة', async () => {
    expect(SQL.split('\n')[0]).toBe('-- deploy-gate: tolerant');
    const db = new PGlite();
    await db.exec(BEFORE);
    await db.exec(SQL);
    await db.exec(SQL);
    expect((await db.query("select count(*)::int n from leaders.schema_migrations where name = '20261114120000_public_lockdown'")).rows[0].n).toBe(1);
  });

  it('D1: جلسة authenticated كانت تقرأ سر TOTP، وبعد الترحيل لا تقرأ ولا تعدّل', async () => {
    const db = new PGlite();
    await db.exec(BEFORE);
    expect((await as(db, 'authenticated', 'select totp_secret from public.admin_users')).rows[0].totp_secret).toBe('SEED');
    await db.exec(SQL);
    await expect(as(db, 'authenticated', 'select totp_secret from public.admin_users')).rejects.toThrow(/permission denied/);
    await expect(as(db, 'authenticated', "update public.admin_users set totp_secret = 'X'")).rejects.toThrow(/permission denied/);
    await expect(as(db, 'authenticated', 'select public.get_my_admin_role()')).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', 'select * from public.contact_requests')).rejects.toThrow(/permission denied/);
    expect((await db.query("select count(*)::int n from pg_policies where schemaname = 'public' and tablename in ('admin_users', 'admin_audit_log', 'contact_requests')")).rows[0].n).toBe(0);
  });

  it('لا يمس ما تقرؤه المصفوفة علنًا', async () => {
    const db = new PGlite();
    await db.exec(BEFORE);
    await db.exec(SQL);
    expect((await as(db, 'anon', 'select count(*)::int n from public.app_content')).rows[0].n).toBe(0);
  });

  it('D2: الزائر يُدرج زيارة بأعمدتها، ولا يقرأ ولا يحذف، والطول محدود، والإغراق يُهمل', async () => {
    const db = new PGlite();
    await db.exec(BEFORE);
    await db.exec(SQL);
    await as(db, 'anon', "insert into public.page_views (site, path, visit_id, device, lang) values ('mi', '/', 'v1', 'desktop', 'ar-SA')");
    await expect(as(db, 'anon', 'select * from public.page_views')).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', 'delete from public.page_views')).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', 'truncate public.page_views')).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', `insert into public.page_views (site, path, visit_id, device) values ('mi', '/', 'v1', '${'x'.repeat(21)}')`)).rejects.toThrow(/page_views_len_chk/);
    await expect(as(db, 'anon', "insert into public.page_views (id, site, path) values (999, 'mi', '/')")).rejects.toThrow(/permission denied/);
    // 600 في الدقيقة: ما زاد يُهمل بلا خطأ
    await db.exec("insert into public.page_views (site, path) select 'mi', '/' from generate_series(1, 600)");
    const n = (await db.query('select count(*)::int n from public.page_views')).rows[0].n;
    await as(db, 'anon', "insert into public.page_views (site, path, visit_id) values ('mi', '/', 'flood')");
    expect((await db.query('select count(*)::int n from public.page_views')).rows[0].n).toBe(n);
  });

  it('D5: سجلا التدقيق يُضاف إليهما ولا يُعدَّلان ولا يُحذفان ولا يُفرَّغان، والصيانة المقصودة تفتحهما داخل معاملتها', async () => {
    const db = new PGlite();
    await db.exec(BEFORE);
    await db.exec(SQL);
    for (const t of ['leaders.audit_log', 'public.admin_audit_log']) {
      await db.exec(`insert into ${t} (action) values ('x')`);
      await expect(db.exec(`update ${t} set action = 'y'`), t).rejects.toThrow(/لا يُعدَّل/);
      await expect(db.exec(`delete from ${t}`), t).rejects.toThrow(/لا يُعدَّل/);
      await expect(db.exec(`truncate ${t}`), t).rejects.toThrow(/لا يُعدَّل/);
      expect((await db.query(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(1);
    }
    await db.exec("begin; set local leaders.audit_maintenance = 'on'; update leaders.audit_log set action = 'scrubbed'; commit;");
    expect((await db.query('select action from leaders.audit_log')).rows[0].action).toBe('scrubbed');
    await expect(db.exec('delete from leaders.audit_log')).rejects.toThrow(/لا يُعدَّل/);
  });

  it('D9: جدول النسخة القديم صار عليه RLS', async () => {
    const db = new PGlite();
    await db.exec(BEFORE);
    await db.exec(SQL);
    expect((await db.query("select relrowsecurity r from pg_class where oid = 'leaders.handbook_modules_backup_20261023'::regclass")).rows[0].r).toBe(true);
  });
});
