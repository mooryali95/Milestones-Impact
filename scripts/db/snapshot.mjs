// لقطة بنية قاعدة البيانات الحية إلى supabase/schema/baseline.sql (قراءة فقط)
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/snapshot.mjs          يكتب اللقطة
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/snapshot.mjs --check  يفشل إن اختلفت الحية عن المودَعة
import { readFileSync, writeFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const OUT = new URL('../../supabase/schema/baseline.sql', import.meta.url);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('SUPABASE_ACCESS_TOKEN مطلوب'); process.exit(2); }

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// بيانات مرجعية صغيرة تشير إليها قيود الجداول، فلا تُبنى قاعدة جديدة بدونها
const REFERENCE = ['dimensions', 'levels'];
const lit = (v) => (v === null ? 'null' : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const rows = await query(readFileSync(new URL('./introspect.sql', import.meta.url), 'utf8'));
let seed = '';
for (const t of REFERENCE) {
  const data = await query(`select * from leaders.${t} order by 1`);
  if (!data.length) continue;
  const cols = Object.keys(data[0]);
  seed += `insert into leaders.${t} (${cols.join(', ')}) values\n${data.map((d) => `  (${cols.map((c) => lit(d[c])).join(', ')})`).join(',\n')}\non conflict do nothing;\n\n`;
}
const sql = `-- ════════════════════════════════════════════════════════════════
-- بنية قاعدة البيانات كما هي في الإنتاج: المرجع الكامل لجداول leaders وpublic
-- ════════════════════════════════════════════════════════════════
-- مولَّد آليًا بـ scripts/db/snapshot.mjs من فهارس النظام؛ لا يُحرَّر يدويًا.
-- يبني قاعدة جديدة كاملة، ولا يغيّر القاعدة الحية (كل أمر مشروط). الترحيلات في
-- supabase/migrations هي سجل التغييرات، وهذا الملف حالتها المجمّعة الآن.
-- server/*.sql أرشيف تاريخي لا مصدر.

-- كما في pg_dump: دوال SQL يشير بعضها إلى بعض، فلا يُتحقق من أجسامها لحظة الإنشاء
set check_function_bodies = off;
create schema if not exists leaders;

${rows.map((r) => r.ddl).join('\n\n')}

-- ── بيانات مرجعية ──
${seed}`;

if (process.argv.includes('--check')) {
  const same = readFileSync(OUT, 'utf8') === sql;
  console.log(same ? 'اللقطة مطابقة للقاعدة الحية' : 'القاعدة الحية تختلف عن اللقطة المودعة: شغّل السكربت دون --check وراجع الفرق');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, sql);
console.log(`كُتبت اللقطة: ${rows.length} أمرًا`);
