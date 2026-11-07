#!/usr/bin/env node
// بوابة الترحيلات قبل نشر الدوال (D16): يقارن ترحيلات المستودع بسجل leaders.schema_migrations
// في الإنتاج عبر Management API (قراءة فقط)، ويفشل إن بقي ترحيل غير مطبّق تعتمد عليه الدوال.
//   SUPABASE_ACCESS_TOKEN=... node scripts/ops/pending-migrations.mjs          بوابة: رمز 1 إن بقي ترحيل حاجب
//   SUPABASE_ACCESS_TOKEN=... node scripts/ops/pending-migrations.mjs --list   قائمة فقط، رمز 0 دائمًا
//
// كل ترحيل حاجب ما لم يحمل في سطوره الأولى أحد وسمين:
//   -- deploy-gate: tolerant   الدوال تقرؤه قراءة متسامحة، فتعمل قبله وبعده
//   -- deploy-gate: deferred   مؤجل بقرار مسمّى في سطره (مثل تفعيل أداة قياس)، ولا تعتمد عليه الدوال
// الوسم وعد يحرسه مراجع الطلب. ترحيل لا يحمله يُطبّق بسير migrate.yml قبل أن يمر النشر.
import { readdirSync, readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const LIST = process.argv.includes('--list');
const DIR = new URL('../../supabase/migrations/', import.meta.url);

export function gateOf(sql) {
  const head = sql.split('\n').slice(0, 15).join('\n');
  const m = head.match(/^--\s*deploy-gate:\s*(tolerant|deferred)\b(.*)$/m);
  return m ? { gate: m[1], note: m[2].trim() } : { gate: 'blocking', note: '' };
}

export function classify(repoNames, applied, readSql) {
  const set = new Set(applied);
  return repoNames.filter((n) => !set.has(n)).map((n) => ({ name: n, ...gateOf(readSql(n)) }));
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
  if (blocking.length && !LIST) {
    console.error(`\n::error::${blocking.length} ترحيل حاجب غير مطبّق. يطبّقه المالك بسير migrate.yml بأسمائه بالترتيب أعلاه، ثم يُعاد تشغيل النشر. لا تُنشر الدوال قبله.`);
    process.exit(1);
  }
}
