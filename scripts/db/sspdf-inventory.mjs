#!/usr/bin/env node
// جرد مخطط sspdf قبل تجميده (D13)، قراءةً فقط عبر Management API:
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/sspdf-inventory.mjs > sspdf-inventory.md
// لكل جدول: عدد الصفوف، والأعمدة التي تشبه بيانات شخصية، وآخر نشاط إن وُجد عمود زمني. ثم الصلاحيات الممنوحة
// لـ anon وauthenticated على الجداول والدوال، فيرى المالك ما يُسحب ومن آخر من استعمل المنصة.
// لا يطبع قيمة أي صف.
const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

export const PII = /(e-?mail|phone|mobile|name|national|id_?number|address|birth|iban|passport)/i;
export const QUERIES = {
  tables: `select c.table_name,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from sspdf.%I', c.table_name), false, true, '')))[1]::text::bigint as rows,
      array_agg(c.column_name::text order by c.ordinal_position) as columns
    from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
   where c.table_schema = 'sspdf' and t.table_type = 'BASE TABLE' group by c.table_name order by c.table_name`,
  activity: `select table_name, column_name,
      (xpath('/row/m/text()', query_to_xml(format('select max(%I)::text as m from sspdf.%I', column_name, table_name), false, true, '')))[1]::text as last
    from information_schema.columns where table_schema = 'sspdf' and column_name in ('updated_at', 'created_at') order by 1, 2`,
  table_grants: `select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
    from information_schema.role_table_grants where table_schema = 'sspdf' and grantee in ('anon', 'authenticated', 'PUBLIC')
   group by 1, 2 order by 1, 2`,
  function_grants: `select p.proname as function, coalesce(r.rolname, 'PUBLIC') as grantee
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'sspdf' and a.privilege_type = 'EXECUTE' and coalesce(r.rolname, 'PUBLIC') in ('anon', 'authenticated', 'PUBLIC')
   order by 1, 2`,
};

export function render({ tables = [], activity = [], table_grants = [], function_grants = [] }) {
  const L = ['# جرد مخطط sspdf قبل التجميد (D13)', '', `${new Date().toISOString().slice(0, 16)}، قراءة فقط.`, '',
    '| الجدول | الصفوف | أعمدة تشبه بيانات شخصية | آخر نشاط |', '|---|---|---|---|'];
  for (const t of tables) {
    const last = activity.filter((a) => a.table_name === t.table_name && a.last).map((a) => a.last.slice(0, 10)).sort().at(-1) || '';
    L.push(`| ${t.table_name} | ${t.rows} | ${(t.columns || []).filter((c) => PII.test(c)).join('، ')} | ${last} |`);
  }
  const total = tables.reduce((n, t) => n + Number(t.rows || 0), 0);
  L.push('', `**المجموع:** ${tables.length} جدولًا و${total} صفًا.`, '', '## الصلاحيات التي يسحبها ترحيل التجميد', '', '| الكائن | الدور | الصلاحية |', '|---|---|---|');
  for (const g of table_grants) L.push(`| ${g.table_name} | ${g.grantee} | ${g.privileges} |`);
  for (const g of function_grants) L.push(`| ${g.function}() | ${g.grantee} | EXECUTE |`);
  if (!table_grants.length && !function_grants.length) L.push('| لا شيء | | |');
  L.push('', 'التالي: التفريغ المشفر (`BACKUP_SCHEMAS=sspdf BACKUP_PREFIX=archive scripts/ops/backup.sh`)، ثم إخراج المخطط من Exposed schemas، ثم ترحيل `20261107110000_sspdf_freeze`.');
  return `${L.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب'); process.exit(2); }
  const out = {};
  for (const [k, sql] of Object.entries(QUERIES)) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) { console.error(`${k}: ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
    out[k] = await r.json();
  }
  process.stdout.write(render(out));
}
