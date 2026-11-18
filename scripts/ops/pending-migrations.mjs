#!/usr/bin/env node
// بوابة الترحيلات قبل نشر الدوال (D16): يقارن ترحيلات المستودع بسجل leaders.schema_migrations
// في الإنتاج عبر Management API (قراءة فقط)، ويفشل إن بقي ترحيل غير مطبّق تعتمد عليه الدوال.
//   SUPABASE_ACCESS_TOKEN=... node scripts/ops/pending-migrations.mjs          بوابة: رمز 1 إن بقي ترحيل حاجب
//   SUPABASE_ACCESS_TOKEN=... node scripts/ops/pending-migrations.mjs --list   قائمة فقط، رمز 0 دائمًا
//   ... --dir=<مجلد ترحيلات>   ترحيلات شجرة أخرى (هدف التراجع في deploy-leaders-api.yml)
//   ... --expect="<أسماء>"      قبل «طبّق ثم انشر» (migrate.yml): رمز 1 إن بقي ترحيل حاجب غير مطبّق لم يُسمَّ، فلا يُطبَّق
//                               شيء ثم يقف النشر بعده على ترحيل منسي (المرحلة 6، البند 8)
//
// كل ترحيل حاجب ما لم يحمل في سطوره الأولى أحد وسمين:
//   -- deploy-gate: tolerant   الدوال تقرؤه قراءة متسامحة، فتعمل قبله وبعده
//   -- deploy-gate: deferred   مؤجل بقرار مسمّى في سطره (مثل تفعيل أداة قياس)، ولا تعتمد عليه الدوال
// الوسم وعد يحرسه مراجع الطلب. ترحيل لا يحمله يُطبّق بسير migrate.yml قبل أن يمر النشر.
// الوسم ينتهي حين يُطبَّق الترحيل على الإنتاج ويُحذف الكود المتسامح معه: لا يُمس ملفه (بصمته في
// scripts/db/applied-manifest.json لا تتغير)، بل يصير حاجبًا لأي قاعدة تنقصه لأن اسمه في البيان.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APPLIED = new Set(Object.keys(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../db/applied-manifest.json'), 'utf8')).migrations));

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const LIST = process.argv.includes('--list');
// --dir=<مسار>: ترحيلات شجرة أخرى (سير التراجع الموحد يفحص ترحيلات الإيداع الهدف بسكربت main)
const DIR_ARG = process.argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length);
const DIR = DIR_ARG ? pathToFileURL(`${DIR_ARG.replace(/\/+$/, '')}/`) : new URL('../../supabase/migrations/', import.meta.url);

export function gateOf(sql, name) {
  if (name && APPLIED.has(name)) return { gate: 'blocking', note: 'مطبّق على الإنتاج، فوسمه منتهٍ' };
  const head = sql.split('\n').slice(0, 15).join('\n');
  const m = head.match(/^--\s*deploy-gate:\s*(tolerant|deferred)\b(.*)$/m);
  return m ? { gate: m[1], note: m[2].trim() } : { gate: 'blocking', note: '' };
}

// الحاجب غير المطبّق الذي لم يسمّه المالك
export const unnamedBlocking = (pending, named) => pending.filter((p) => p.gate === 'blocking' && !named.includes(p.name)).map((p) => p.name);

export function classify(repoNames, applied, readSql) {
  const set = new Set(applied);
  return repoNames.filter((n) => !set.has(n)).map((n) => ({ name: n, ...gateOf(readSql(n), n) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب للقراءة من سجل الإنتاج'); process.exit(2); }
  const names = readdirSync(DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select name from leaders.schema_migrations order by name' }),
  });
  if (!r.ok) { console.error(`تعذرت قراءة السجل: ${r.status} ${(await r.text()).slice(0, 400)}`); process.exit(LIST ? 0 : 1); }
  const applied = (await r.json()).map((x) => x.name);
  const pending = classify(names, applied, (n) => readFileSync(new URL(`${n}.sql`, DIR), 'utf8'));
  const blocking = pending.filter((p) => p.gate === 'blocking');
  console.log(`السجل: ${applied.length} مطبّقًا، والمستودع ${names.length}، وغير المطبّق ${pending.length}`);
  for (const p of pending) console.log(`${p.gate === 'blocking' ? '✗' : '•'} ${p.name} (${p.gate}${p.note ? `: ${p.note}` : ''})`);
  const EXPECT = process.argv.find((a) => a.startsWith('--expect='))?.slice('--expect='.length);
  if (EXPECT !== undefined) {
    const missing = unnamedBlocking(pending, EXPECT.split(/\s+/).filter(Boolean).map((n) => n.replace(/\.sql$/, '')));
    if (missing.length) {
      console.error(`::error::ترحيل حاجب غير مطبّق لم يُسمَّ: ${missing.join('، ')}. النشر بعد التطبيق سيقف عليه، فلا يُطبَّق شيء. سمِّ الترحيلات الحاجبة كلها بالترتيب.`);
      process.exit(1);
    }
    console.log('كل ترحيل حاجب غير مطبّق مسمّى: يُطبَّق ثم يُنشر.');
    process.exit(0);
  }
  if (blocking.length && !LIST) {
    console.error(`\n::error::${blocking.length} ترحيل حاجب غير مطبّق. يطبّقه المالك بسير migrate.yml بأسمائه بالترتيب أعلاه، ثم يُعاد تشغيل النشر. لا تُنشر الدوال قبله.`);
    process.exit(1);
  }
}
