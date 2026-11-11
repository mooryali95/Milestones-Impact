#!/usr/bin/env node
// يولّد قائمة أسماء الترحيلات في supabase/migrations إلى وحدة يقرؤها الخادم
// (supabase/functions/leaders-api/migrations.js) ليقارنها بسجل leaders.schema_migrations
// في فحص الصحة، ومعها وسم بوابة النشر لكل ترحيل يحمله (tolerant أو deferred) بالمحلل نفسه الذي تحكم به البوابة
// (gateOf)، فتعرض اللوحة والبوابات المؤجل والمتسامح منفصلين عن الحاجب. المصدر المجلد؛ الملف المولَّد يُفحص تطابقه في CI.
//   node scripts/db/migrations-list.mjs          يكتب الملف
//   node scripts/db/migrations-list.mjs --check  يفشل إن اختلف المولَّد عن المجلد
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gateOf } from '../ops/pending-migrations.mjs';

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const OUT = new URL('../../supabase/functions/leaders-api/migrations.js', import.meta.url);
const names = readdirSync(DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
// الوسم من سطور الملف وحدها (بلا بيان المطبّق): الترحيل في البيان مطبّق على الإنتاج فلا يظهر غير مطبّق، وإضافته إلى البيان لا تغيّر هذا الملف
const gates = names.map((n) => [n, gateOf(readFileSync(new URL(`${n}.sql`, DIR), 'utf8'))]).filter(([, g]) => g.gate !== 'blocking');
const body = `// مولَّد آليًا من supabase/migrations بـ scripts/db/migrations-list.mjs؛ لا يُحرَّر يدويًا.
// فحص الصحة يقارن هذه القائمة بسجل leaders.schema_migrations فيظهر ما لم يُطبَّق بعد.
export const MIGRATIONS = [
${names.map((n) => `  '${n}',`).join('\n')}
];
// وسم بوابة النشر لما يحمله في سطوره الأولى، بملاحظته (gateOf في scripts/ops/pending-migrations.mjs). ما ليس هنا حاجب
export const MIGRATION_GATES = {
${gates.map(([n, g]) => `  '${n}': [${JSON.stringify(g.gate)}, ${JSON.stringify(g.note)}],`).join('\n')}
};
`;
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch { /* غير موجود */ }
  if (cur !== body) { console.error('migrations.js لا يطابق مجلد الترحيلات: شغّل node scripts/db/migrations-list.mjs'); process.exit(1); }
  console.log('migrations.js مطابق');
} else {
  writeFileSync(fileURLToPath(OUT), body);
  console.log(`كُتبت ${names.length} ترحيلًا`);
}
