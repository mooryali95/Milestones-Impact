// لقطة بنية قاعدة البيانات إلى supabase/schema/baseline.sql (قراءة فقط للقاعدة)
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/snapshot.mjs                   يكتب اللقطة من القاعدة الحية
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/snapshot.mjs --check           يفشل إن اختلفت الحية عن المودَعة
//   node scripts/db/snapshot.mjs --from-migrations                           يبني اللقطة محليًا (PGlite): اللقطة
//                                                                             المودعة + الترحيلات الأحدث من نقطتها
//   node scripts/db/snapshot.mjs --from-migrations --check                   يفشل إن لم تكن المودعة = مودعة + ترحيلاتها
//
// اللقطة تحمل في ترويستها آخر ترحيل دخل فيها (as-of)، فالبناء المحلي يطبّق ما بعده فقط.
// الحية هي الحقيقة؛ الفحص المحلي يضمن أن اللقطة والترحيلات في المستودع متسقان، والفحص
// الحي (ليليًا في schema-check.yml) يكشف انحراف الإنتاج عن المستودع.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const OUT = new URL('../../supabase/schema/baseline.sql', import.meta.url);
const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const AS_OF_RE = /^-- as-of migration: (\S+)$/m;
const committed = () => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } };
const migrationNames = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();

// ── المصدر: القاعدة الحية ──
function liveQuery(token) {
  return async (sql) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  };
}

// ── المصدر: بناء محلي في PGlite من اللقطة المودعة والترحيلات الأحدث من نقطتها ──
// ما توفره Supabase لكل مشروع قبل أي ترحيل (كما في baseline-schema.test.js)
const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
// ترحيلات بيانات محضة لا تغيّر البنية وتشترط بيانات حية (تفشل على قاعدة فارغة)؛ تُتخطى في البناء المحلي
const DATA_ONLY = new Set([
  '20261102100100_leaders_activate_v5',   // يفعّل أدوات v5 ويشترط وجود فقراتها
]);
async function localQuery() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(PRELUDE);
  const base = committed();
  await db.exec(base);
  const asOf = opt('--after') || base.match(AS_OF_RE)?.[1];
  if (!asOf) throw new Error('اللقطة المودعة بلا سطر as-of؛ مرّر --after <اسم آخر ترحيل فيها>');
  const pending = migrationNames().filter((n) => n > asOf);
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

// ── التوليد ──
const REFERENCE = ['dimensions', 'levels'];   // بيانات مرجعية صغيرة تشير إليها قيود الجداول
const lit = (v) => (v === null ? 'null' : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

async function render(query, asOf) {
  const rows = await query(readFileSync(new URL('./introspect.sql', import.meta.url), 'utf8'));
  let seed = '';
  for (const t of REFERENCE) {
    const data = await query(`select * from leaders.${t} order by 1`);
    if (!data.length) continue;
    const cols = Object.keys(data[0]);
    seed += `insert into leaders.${t} (${cols.join(', ')}) values\n${data.map((d) => `  (${cols.map((c) => lit(d[c])).join(', ')})`).join(',\n')}\non conflict do nothing;\n\n`;
  }
  return `-- ════════════════════════════════════════════════════════════════
-- بنية قاعدة البيانات كما هي في الإنتاج: المرجع الكامل لجداول leaders وpublic
-- ════════════════════════════════════════════════════════════════
-- مولَّد آليًا بـ scripts/db/snapshot.mjs من فهارس النظام؛ لا يُحرَّر يدويًا.
-- يبني قاعدة جديدة كاملة، ولا يغيّر القاعدة الحية (كل أمر مشروط). الترحيلات في
-- supabase/migrations هي سجل التغييرات، وهذا الملف حالتها المجمّعة الآن.
-- server/*.sql أرشيف تاريخي لا مصدر.
-- as-of migration: ${asOf}

-- كما في pg_dump: دوال SQL يشير بعضها إلى بعض، فلا يُتحقق من أجسامها لحظة الإنشاء
set check_function_bodies = off;
create schema if not exists leaders;

${rows.map((r) => r.ddl).join('\n\n')}

-- ── بيانات مرجعية ──
${seed}`;
}

let query, asOf;
if (flag('--from-migrations')) {
  query = await localQuery();
  asOf = query.asOf;
} else {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error('SUPABASE_ACCESS_TOKEN مطلوب (أو استعمل --from-migrations للبناء المحلي)'); process.exit(2); }
  query = liveQuery(token);
  // الحية لا تعرف أسماء الملفات: نقطتها آخر ترحيل في المستودع (يُفترض مطبّقًا)
  asOf = migrationNames().at(-1);
}
const sql = await render(query, asOf);

if (flag('--check')) {
  // المقارنة بلا سطر as-of: نقطة الحية مفترضة، ونقطة المحلي محسوبة
  const strip = (s) => s.replace(AS_OF_RE, '');
  const same = strip(committed()) === strip(sql);
  console.log(same
    ? (flag('--from-migrations') ? 'اللقطة المودعة تساوي اللقطة + ترحيلاتها' : 'اللقطة مطابقة للقاعدة الحية')
    : (flag('--from-migrations') ? 'اللقطة المودعة لا تساوي اللقطة + ترحيلاتها: شغّل node scripts/db/snapshot.mjs --from-migrations وأودع الناتج' : 'القاعدة الحية تختلف عن اللقطة المودعة: شغّل السكربت دون --check وراجع الفرق'));
  process.exit(same ? 0 : 1);
}
writeFileSync(fileURLToPath(OUT), sql);
console.log(`كُتبت اللقطة (as-of ${asOf})`);
