#!/usr/bin/env node
// يولّد قائمة أسماء الترحيلات في supabase/migrations إلى وحدة يقرؤها الخادم
// (supabase/functions/leaders-api/migrations.js) ليقارنها بسجل leaders.schema_migrations
// في فحص الصحة. المصدر المجلد؛ الملف المولَّد يُفحص تطابقه في CI.
//   node scripts/db/migrations-list.mjs          يكتب الملف
//   node scripts/db/migrations-list.mjs --check  يفشل إن اختلف المولَّد عن المجلد
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const OUT = new URL('../../supabase/functions/leaders-api/migrations.js', import.meta.url);
const names = readdirSync(DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
const body = `// مولَّد آليًا من supabase/migrations بـ scripts/db/migrations-list.mjs؛ لا يُحرَّر يدويًا.
// فحص الصحة يقارن هذه القائمة بسجل leaders.schema_migrations فيظهر ما لم يُطبَّق بعد.
export const MIGRATIONS = [
${names.map((n) => `  '${n}',`).join('\n')}
];
`;
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch { /* غير موجود */ }
  if (cur !== body) { console.error('migrations.js لا يطابق مجلد الترحيلات: شغّل node scripts/db/migrations-list.mjs'); process.exit(1); }
  console.log('migrations.js مطابق');
} else {
  writeFileSync(fileURLToPath(OUT), body);
  console.log(`كُتبت ${names.length} ترحيلًا`);
}
