// صلاحية EXECUTE الحية على دوال SECURITY DEFINER في المخططات المكشوفة (قراءة فقط، لا يكتب شيئًا):
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/definer-privileges.mjs     عبر Management API (migrate.yml، الوضع privileges)
//   SUPABASE_DB_URL=... node scripts/db/definer-privileges.mjs           عبر psql في جلسة للقراءة فقط
//   node scripts/db/definer-privileges.mjs --from-migrations             على البناء المحلي (PGlite) للمقارنة
// يطبع جدولًا: الدالة، وهل ينفذها PUBLIC وanon وauthenticated وservice_role، وأي منح لـ PUBLIC أو anon أو authenticated غير مستثنى
// في rls-audit-allow.json يُطبع تحذيرًا ويُنهي برمز 1، فيظهر الفرق بين الحية واللقطة قبل أن يكشفه فحص الليل.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKIP_SCHEMAS, loadAllow } from './rls-audit.mjs';

const list = (a) => a.map((x) => `'${x}'`).join(',');
export const PRIV_QUERY = `
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
  (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname not like 'pg\\_%' and n.nspname not in (${list(SKIP_SCHEMAS.filter((s) => s !== 'sspdf'))})
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1`;

// المنطق المحض: صفوف الاستعلام والاستثناءات → سطور الجدول والمكشوف غير المستثنى
export function report(rows, allow = {}) {
  const tables = allow.tables || {};
  const yes = (v) => v === true || v === 't' || v === 'true';
  const lines = [];
  const exposed = [];
  for (const r of rows) {
    const roles = ['public', 'anon', 'authenticated', 'service_role'].map((k) => (yes(r[k]) ? 'نعم' : '-'));
    lines.push(`| ${r.fn} | ${roles.join(' | ')} |`);
    const open = ['public', 'anon', 'authenticated'].filter((k) => yes(r[k]));
    if (open.length && !r.fn.startsWith('sspdf.') && !(tables[r.fn]?.rules || []).includes('definer-exposed')) exposed.push({ fn: r.fn, roles: open });
  }
  return { table: ['| الدالة | PUBLIC | anon | authenticated | service_role |', '|---|---|---|---|---|', ...lines].join('\n'), exposed };
}

async function source() {
  if (process.argv.includes('--from-migrations')) return (await import('./local-db.mjs')).localQuery();
  if (process.env.SUPABASE_DB_URL) {
    return async (sql) => {
      const out = execFileSync('psql', [process.env.SUPABASE_DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c',
        `select coalesce(json_agg(q), '[]'::json) from (${sql}) q`], { env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' }, encoding: 'utf8' });
      return JSON.parse(out.trim());
    };
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error('SUPABASE_ACCESS_TOKEN أو SUPABASE_DB_URL مطلوب (أو --from-migrations)'); process.exit(2); }
  return (await import('./local-db.mjs')).liveQuery(token);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const q = await source();
  const { table, exposed } = report(await q(PRIV_QUERY), loadAllow());
  console.log(table);
  for (const e of exposed) console.log(`::warning::${e.fn}: EXECUTE لـ ${e.roles.join(', ')} بلا استثناء في rls-audit-allow.json`);
  console.log(exposed.length ? `${exposed.length} دالة مكشوفة بلا استثناء` : 'لا دالة SECURITY DEFINER مكشوفة بلا استثناء');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### صلاحية دوال SECURITY DEFINER (حية)\n\n${table}\n`);
  }
  process.exit(exposed.length ? 1 : 0);
}
