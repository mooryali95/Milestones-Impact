// فحص RLS والصلاحيات المباشرة لكل جدول في المخططات المكشوفة (قراءة فقط):
//   node scripts/db/rls-audit.mjs --from-migrations         على اللقطة المبنية من الترحيلات (PGlite، بلا أسرار) — في CI
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/rls-audit.mjs   على القاعدة الحية — ليليًا في schema-check.yml
//
// المخطط المكشوف: public وleaders دائمًا، وكل مخطط آخر يملك فيه anon أو authenticated صلاحية USAGE،
// عدا sspdf (مجمّد، D13) ومخططات النظام وSupabase. القواعد:
//   no-rls            جدول (أو جدول مقسّم) بلا RLS مفعّلة
//   rls-bypass-grant  منح anon أو authenticated صلاحية TRUNCATE أو REFERENCES أو TRIGGER (لا تخضع لـ RLS)
//   grant-no-policy   منح anon أو authenticated صلاحية على جدول لا سياسة فيه تنطبق على ذلك الدور (منح غير مقصود)
//   view-grant        عرض يملك عليه anon أو authenticated صلاحية وليس security_invoker (يتجاوز RLS الجداول تحته)
//   foreign-grant     جدول أجنبي عليه أي منح لـ anon أو authenticated (لا تنطبق عليه RLS أصلًا)
//   sequence-grant    تسلسل يملك عليه anon أو authenticated USAGE أو UPDATE (يُقرأ أو يُقدَّم)
//   definer-exposed   دالة SECURITY DEFINER ينفذها anon أو authenticated (تتجاوز RLS عبر /rpc) أو بلا search_path مثبت
// الاستثناءات في rls-audit-allow.json بالاسم والقاعدة وسبب لكل منها؛ استثناء لا يطابق مخالفة قائمة يُفشل الفحص.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROLES = ['anon', 'authenticated'];
export const BYPASS = ['TRUNCATE', 'REFERENCES', 'TRIGGER'];
export const SKIP_SCHEMAS = ['sspdf', 'information_schema', 'auth', 'extensions', 'storage', 'graphql', 'graphql_public',
  'realtime', 'vault', 'pgsodium', 'pgsodium_masks', 'net', 'cron', 'pgbouncer', 'supabase_functions', 'supabase_migrations', '_realtime', '_analytics'];

const list = (a) => a.map((x) => `'${x}'`).join(',');
// صف لكل علاقة: الاسم، النوع، RLS، الصلاحيات الممنوحة لكل دور، والأدوار التي تنطبق عليها سياسة
export const QUERY = `
with sch as (
  select n.oid, n.nspname from pg_namespace n
  where n.nspname not like 'pg\\_%' and n.nspname not in (${list(SKIP_SCHEMAS)})
    and (n.nspname in ('public','leaders') or exists (select 1 from pg_roles r where r.rolname in (${list(ROLES)}) and has_schema_privilege(r.oid, n.oid, 'USAGE')))
)
select sch.nspname as schema, c.relname as name, c.relkind::text as kind, c.relrowsecurity as rls,
  coalesce(array_to_string(c.reloptions, ','), '') as options,
  (select coalesce(json_agg(json_build_object('role', g.grantee, 'privilege', g.privilege_type)), '[]'::json)
     from information_schema.role_table_grants g
     where g.table_schema = sch.nspname and g.table_name = c.relname and g.grantee in (${list(ROLES)}))::text as grants,
  (select coalesce(json_agg(distinct rl), '[]'::json) from pg_policies p, unnest(p.roles) rl
     where p.schemaname = sch.nspname and p.tablename = c.relname)::text as policy_roles,
  (case when c.relkind = 'S' then (select coalesce(json_agg(json_build_object('role', r.rolname, 'privilege', pr)), '[]'::json)
     from pg_roles r, unnest(array['USAGE','SELECT','UPDATE']) pr
     where r.rolname in (${list(ROLES)}) and has_sequence_privilege(r.oid, c.oid, pr)) else '[]'::json end)::text as seq_grants
from pg_class c join sch on sch.oid = c.relnamespace
where c.relkind in ('r','p','v','m','f','S')
  and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
order by 1, 2`;

// صف لكل دالة SECURITY DEFINER في المخططات المكشوفة (عدا دوال الامتدادات)
export const FUNC_QUERY = `
with sch as (
  select n.oid, n.nspname from pg_namespace n
  where n.nspname not like 'pg\\_%' and n.nspname not in (${list(SKIP_SCHEMAS)})
    and (n.nspname in ('public','leaders') or exists (select 1 from pg_roles r where r.rolname in (${list(ROLES)}) and has_schema_privilege(r.oid, n.oid, 'USAGE')))
)
select sch.nspname as schema, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name, 'fn' as kind,
  (select coalesce(json_agg(r.rolname), '[]'::json) from pg_roles r
     where r.rolname in (${list(ROLES)}) and has_function_privilege(r.oid, p.oid, 'EXECUTE'))::text as exec_roles,
  exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%') as search_path
from pg_proc p join sch on sch.oid = p.pronamespace
where p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1, 2`;

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v || []);

// المنطق المحض: يعيد { violations, unused } بعد تطبيق الاستثناءات
export function audit(rows, allow = {}) {
  const found = [];
  for (const r of rows) {
    const id = `${r.schema}.${r.name}`;
    const grants = parse(r.grants);
    const policyRoles = parse(r.policy_roles);
    const isTable = r.kind === 'r' || r.kind === 'p';
    if (r.kind === 'fn') {
      const exec = parse(r.exec_roles);
      if (exec.length) found.push({ id, rule: 'definer-exposed', detail: `${exec.join(', ')}: EXECUTE على دالة SECURITY DEFINER` });
      if (!r.search_path) found.push({ id, rule: 'definer-exposed', detail: 'SECURITY DEFINER بلا search_path مثبت' });
    } else if (r.kind === 'f') {
      const roles = [...new Set(grants.map((g) => g.role))].sort();
      if (roles.length) found.push({ id, rule: 'foreign-grant', detail: `${roles.join(', ')} على جدول أجنبي (لا RLS)` });
    } else if (r.kind === 'S') {
      const bad = parse(r.seq_grants).filter((g) => g.privilege === 'USAGE' || g.privilege === 'UPDATE');
      if (bad.length) found.push({ id, rule: 'sequence-grant', detail: [...new Set(bad.map((g) => `${g.role}: ${g.privilege}`))].sort().join('، ') });
    } else if (isTable) {
      if (!r.rls) found.push({ id, rule: 'no-rls', detail: 'RLS غير مفعّلة' });
      for (const role of ROLES) {
        const mine = [...new Set(grants.filter((g) => g.role === role).map((g) => g.privilege))].sort();
        if (!mine.length) continue;
        const bypass = mine.filter((p) => BYPASS.includes(p));
        if (bypass.length) found.push({ id, rule: 'rls-bypass-grant', detail: `${role}: ${bypass.join(', ')}` });
        if (r.rls && !policyRoles.includes(role) && !policyRoles.includes('public'))
          found.push({ id, rule: 'grant-no-policy', detail: `${role}: ${mine.join(', ')} بلا سياسة تنطبق عليه` });
      }
    } else {
      const invoker = /security_invoker=(true|on|1)/i.test(r.options || '');
      const roles = [...new Set(grants.map((g) => g.role))].sort();
      if (roles.length && !invoker) found.push({ id, rule: 'view-grant', detail: `${roles.join(', ')} على عرض ليس security_invoker` });
    }
  }
  const tables = allow.tables || {};
  const violations = found.filter((v) => !(tables[v.id]?.rules || []).includes(v.rule));
  const unused = [];
  for (const [id, e] of Object.entries(tables)) {
    if (!e.reason) unused.push({ id, rule: '*', detail: 'استثناء بلا سبب' });
    for (const rule of e.rules || []) if (!found.some((v) => v.id === id && v.rule === rule)) unused.push({ id, rule, detail: 'استثناء لا يطابق مخالفة قائمة' });
  }
  const needsDecision = Object.entries(tables).filter(([, e]) => e.needs_decision).map(([id]) => id);
  return { violations, unused, needsDecision, checked: rows.length };
}

export const loadAllow = (path = fileURLToPath(new URL('./rls-audit-allow.json', import.meta.url))) => JSON.parse(readFileSync(path, 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { localQuery, liveQuery } = await import('./local-db.mjs');
  let q;
  if (process.argv.includes('--from-migrations')) q = await localQuery();
  else {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error('SUPABASE_ACCESS_TOKEN مطلوب (أو استعمل --from-migrations للبناء المحلي)'); process.exit(2); }
    q = liveQuery(token);
  }
  const rows = [...(await q(QUERY)), ...(await q(FUNC_QUERY))];
  const { violations, unused, needsDecision, checked } = audit(rows, loadAllow());
  for (const v of violations) console.log(`مخالفة [${v.rule}] ${v.id}: ${v.detail}`);
  for (const v of unused) console.log(`استثناء معطوب [${v.rule}] ${v.id}: ${v.detail}`);
  if (needsDecision.length) console.log(`::warning::استثناءات تحتاج قرار المالك: ${needsDecision.join('، ')}`);
  const ok = !violations.length && !unused.length;
  console.log(ok ? `فحص RLS نظيف: ${checked} علاقة ودالة في المخططات المكشوفة` : `فحص RLS فشل: ${violations.length} مخالفة، ${unused.length} استثناء معطوب`);
  process.exit(ok ? 0 : 1);
}
