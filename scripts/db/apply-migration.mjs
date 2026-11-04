#!/usr/bin/env node
// يطبّق ترحيلات مسمّاة على القاعدة الحية بالترتيب عبر Management API (الطريقة الموثقة في RUNBOOK.md §1)،
// ويتحقق بعد كل ترحيل (منذ سجل 20261105110000) أنه سجّل نفسه في leaders.schema_migrations.
// لا يُشغَّل إلا بقرار المالك الذي يسمّي الترحيل (سير migrate.yml أو يدويًا):
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/apply-migration.mjs <name> [<name> ...]
// المسجّل سلفًا في السجل يُتخطى، وأول فشل يوقف السلسلة برمز خروج 1.
import { existsSync, readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const LEDGER_FROM = '20261105110000';
const NAME_RE = /^\d{14}_[a-z0-9_]+$/;

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب'); process.exit(2); }
const names = process.argv.slice(2).map((n) => n.trim().replace(/\.sql$/, '')).filter(Boolean);
if (!names.length) { console.error('سمِّ ترحيلًا واحدًا على الأقل'); process.exit(2); }
for (const n of names) if (!NAME_RE.test(n)) { console.error(`اسم ترحيل غير صالح: ${n}`); process.exit(2); }

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 1200)}`);
  try { return text ? JSON.parse(text) : []; } catch { return []; }
}
const inLedger = async (name) => {
  try { return (await query(`select name from leaders.schema_migrations where name = '${name}'`)).length > 0; }
  catch { return false; }   // السجل نفسه لم يُنشأ بعد (قبل 20261105110000)
};

for (const name of names) {
  const path = `supabase/migrations/${name}.sql`;
  if (!existsSync(path)) { console.error(`✗ ${name}: لا ملف له في supabase/migrations`); process.exit(1); }
  if (await inLedger(name)) { console.log(`• ${name}: مسجّل سلفًا، تُخطّى`); continue; }
  console.log(`→ ${name}`);
  try { await query(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); process.exit(1); }
  if (name >= LEDGER_FROM && !(await inLedger(name))) { console.error(`✗ ${name}: طُبّق لكنه لم يُسجَّل في leaders.schema_migrations`); process.exit(1); }
  console.log(`✓ ${name}`);
}
const all = await query('select name from leaders.schema_migrations order by name').catch(() => []);
console.log(`السجل: ${all.length} ترحيلًا، آخره ${all.at(-1)?.name || '—'}`);
