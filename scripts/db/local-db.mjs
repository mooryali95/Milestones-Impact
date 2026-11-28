// بناء محلي لقاعدة البيانات في PGlite من اللقطة المودعة والترحيلات الأحدث من نقطتها (بلا أسرار).
// يستعمله snapshot.mjs --from-migrations وrls-audit.mjs --from-migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { DATA_ONLY } from './data-only.mjs';

export const BASELINE = new URL('../../supabase/schema/baseline.sql', import.meta.url);
export const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
export const AS_OF_RE = /^-- as-of migration: (\S+)$/m;
export const committed = () => { try { return readFileSync(BASELINE, 'utf8'); } catch { return ''; } };
export const migrationNames = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();

// ما توفره Supabase لكل مشروع قبل أي ترحيل (كما في baseline-schema.test.js)
export const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;

// يعيد دالة استعلام q(sql) => rows، ومعها q.asOf آخر ترحيل طُبّق
export async function localQuery({ after } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(PRELUDE);
  const base = committed();
  await db.exec(base);
  const asOf = after || base.match(AS_OF_RE)?.[1];
  if (!asOf) throw new Error('اللقطة المودعة بلا سطر as-of؛ مرّر --after <اسم آخر ترحيل فيها>');
  const pending = migrationNames().filter((n) => n > asOf);
  // ترحيلات بيانات محضة تُتخطى في البناء المحلي: القائمة في data-only.mjs (مشتركة مع سير التكامل)
  for (const n of pending) {
    if (DATA_ONLY.has(n)) continue;
    try { await db.exec(readFileSync(new URL(`${n}.sql`, MIGRATIONS), 'utf8')); }
    catch (e) { throw new Error(`فشل تطبيق ${n} محليًا: ${e.message}`); }
    // كل ترحيل يُطبَّق في الإنتاج بجلسة مستقلة؛ دواله المؤقتة (pg_temp) لا تبقى للتالي
    await db.exec('discard temp').catch(() => {});
  }
  console.error(`بناء محلي: اللقطة (${asOf}) + ${pending.length} ترحيلًا`);
  const q = async (sql) => (await db.query(sql)).rows;
  q.asOf = pending.length ? pending[pending.length - 1] : asOf;
  return q;
}

// القاعدة الحية عبر Management API (قراءة فقط بحسب الاستعلام)
export function liveQuery(token, ref = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg') {
  return async (sql) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  };
}
