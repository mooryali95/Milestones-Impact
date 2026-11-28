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
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASELINE as OUT, AS_OF_RE, committed, migrationNames, localQuery as buildLocal, liveQuery } from './local-db.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
// المصدران (الحية، والبناء المحلي في PGlite من اللقطة والترحيلات الأحدث من نقطتها) في local-db.mjs
const localQuery = () => buildLocal({ after: opt('--after') });

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
