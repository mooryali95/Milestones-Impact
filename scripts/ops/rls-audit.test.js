import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { audit, loadAllow, QUERY } from '../db/rls-audit.mjs';
import { report, PRIV_QUERY } from '../db/definer-privileges.mjs';
import { PRELUDE } from '../db/local-db.mjs';

const row = (o) => ({ schema: 'leaders', name: 't', kind: 'r', rls: true, options: '', grants: '[]', policy_roles: '[]', ...o });

describe('rls-audit', () => {
  it('دالة SECURITY DEFINER ينفذها anon أو بلا search_path تفشل', () => {
    const fn = (o) => ({ schema: 'public', name: 'f()', kind: 'fn', exec_roles: '[]', search_path: true, ...o });
    expect(audit([fn({})]).violations).toEqual([]);
    expect(audit([fn({ exec_roles: '["anon"]' })]).violations.map((v) => v.rule)).toEqual(['definer-exposed']);
    expect(audit([fn({ search_path: false })]).violations.map((v) => v.rule)).toEqual(['definer-exposed']);
  });
  it('جدول أجنبي ممنوح يفشل، وتسلسل بـ USAGE أو UPDATE يفشل وبـ SELECT وحده لا', () => {
    expect(audit([row({ kind: 'f', rls: false, grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations.map((v) => v.rule)).toEqual(['foreign-grant']);
    expect(audit([row({ kind: 'S', seq_grants: JSON.stringify([{ role: 'authenticated', privilege: 'USAGE' }]) })]).violations.map((v) => v.rule)).toEqual(['sequence-grant']);
    expect(audit([row({ kind: 'S', seq_grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations).toEqual([]);
  });
  it('حالة نظيفة تنجح: RLS مفعّلة ومنح يقابله سياسة للدور', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'authenticated', privilege: 'SELECT' }]), policy_roles: '["authenticated"]' })]);
    expect(r.violations).toEqual([]);
    expect(r.unused).toEqual([]);
  });
  it('جدول بلا RLS يفشل', () => {
    expect(audit([row({ rls: false })]).violations.map((v) => v.rule)).toEqual(['no-rls']);
  });
  it('منح anon بلا سياسة له يفشل', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]), policy_roles: '["authenticated"]' })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['grant-no-policy']);
  });
  it('منح anon صلاحية TRUNCATE يفشل ولو وُجدت سياسة', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'anon', privilege: 'TRUNCATE' }]), policy_roles: '["anon"]' })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['rls-bypass-grant']);
  });
  it('عرض ممنوح لـ anon وليس security_invoker يفشل', () => {
    const r = audit([row({ kind: 'v', grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['view-grant']);
    expect(audit([row({ kind: 'v', options: 'security_invoker=true', grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations).toEqual([]);
  });
  it('الاستثناء الصريح يقبل المخالفة، والاستثناء المعطوب أو بلا سبب يفشل', () => {
    const allow = { tables: { 'leaders.t': { rules: ['no-rls'], reason: 'سبب', needs_decision: true } } };
    const r = audit([row({ rls: false })], allow);
    expect(r.violations).toEqual([]);
    expect(r.needsDecision).toEqual(['leaders.t']);
    expect(audit([row()], allow).unused).toHaveLength(1);
    expect(audit([row({ rls: false })], { tables: { 'leaders.t': { rules: ['no-rls'] } } }).unused).toHaveLength(1);
  });
  it('ملف الاستثناءات المودع صالح ولكل استثناء سبب', () => {
    for (const e of Object.values(loadAllow('scripts/db/rls-audit-allow.json').tables)) expect(e.reason).toBeTruthy();
  });
  it('الاستعلام يستثني sspdf المجمد', () => {
    expect(QUERY).toContain("'sspdf'");
  });
  it('لا استثناء ينتظر قرار المالك، ولا دالة للخادم وحده مستثناة (20261130060000)', () => {
    const tables = loadAllow('scripts/db/rls-audit-allow.json').tables;
    expect(Object.entries(tables).filter(([, e]) => e.needs_decision).map(([k]) => k)).toEqual([]);
    for (const fn of ['planner_hook_secret()', 'planner_log_otp_attempt(log_email text, was_success boolean)', 'planner_check_otp_rate(check_email text)'])
      expect(tables[`public.${fn}`]).toBeUndefined();
  });
  it('اللقطة تحمل ACL الدوال: سر الخطاف وتسجيل محاولة الرمز للخادم وحده، والمساعدات بلا anon', () => {
    const base = readFileSync('supabase/schema/baseline.sql', 'utf8');
    const grantOf = (fn) => base.match(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to ([^;]+);`))?.[1];
    expect(grantOf('planner_hook_secret')).toBe('service_role');
    expect(grantOf('planner_log_otp_attempt')).toBe('service_role');
    expect(grantOf('planner_check_otp_rate')).toBe('service_role');
    expect(grantOf('planner_is_owner')).toBe('authenticated, service_role');
    expect(base).toMatch(/revoke all on function public\.planner_hook_secret\(\) from public, anon, authenticated, service_role;/);
  });
  it('فحص الصلاحيات الحي: يعرض الجدول ويرفع المكشوف لـ anon بلا استثناء', () => {
    const rows = [
      { fn: 'public.planner_hook_secret()', public: false, anon: false, authenticated: false, service_role: true },
      { fn: 'public.leak()', public: 't', anon: 't', authenticated: 't', service_role: 't' },
      { fn: 'public.ok()', public: false, anon: true, authenticated: true, service_role: true },
      { fn: 'sspdf.frozen()', public: true, anon: true, authenticated: true, service_role: true },
    ];
    const r = report(rows, { tables: { 'public.ok()': { rules: ['definer-exposed'], reason: 'سبب' } } });
    expect(r.exposed).toEqual([{ fn: 'public.leak()', roles: ['anon', 'authenticated'] }]);
    expect(r.table).toContain('| public.planner_hook_secret() | - | - | - | نعم |');
    expect(PRIV_QUERY).toContain("has_function_privilege('anon'");
    expect(PRIV_QUERY).not.toMatch(/\b(insert|update|delete|grant|revoke)\b/i);
  });
  it('الترحيل 20261130060000 في PGlite: يسحب سر الخطاف وتسجيل الرمز من anon وauthenticated، ويبقي المساعدات لـ authenticated، ويتخطى الغائبة', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(PRELUDE);
    await db.exec(`create function public.planner_hook_secret() returns text language sql security definer as 'select 1::text';
      create function public.planner_log_otp_attempt(text, boolean) returns void language sql security definer as 'select';
      create function public.planner_is_owner(uuid) returns boolean language sql security definer as 'select true';
      grant execute on function public.planner_hook_secret(), public.planner_log_otp_attempt(text, boolean), public.planner_is_owner(uuid) to anon, authenticated;
      create schema leaders; create table leaders.schema_migrations (name text primary key);`);
    const mig = readFileSync('supabase/migrations/20261130060000_planner_definer_privileges.sql', 'utf8');
    await db.exec(mig);
    await db.exec(mig);
    const can = async (role, fn) => (await db.query(`select has_function_privilege('${role}', '${fn}', 'EXECUTE') as ok`)).rows[0].ok;
    for (const fn of ['public.planner_hook_secret()', 'public.planner_log_otp_attempt(text, boolean)']) {
      expect(await can('anon', fn)).toBe(false);
      expect(await can('authenticated', fn)).toBe(false);
      expect(await can('service_role', fn)).toBe(true);
    }
    expect(await can('anon', 'public.planner_is_owner(uuid)')).toBe(false);
    expect(await can('authenticated', 'public.planner_is_owner(uuid)')).toBe(true);
    await db.close();
  });
});
