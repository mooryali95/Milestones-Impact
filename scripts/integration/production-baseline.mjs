#!/usr/bin/env node
// بنية الإنتاج لسير التكامل (تصور تحديث المنصة بلا أثر، المرحلة 6، البند 6): الدوال الجديدة على القاعدة كما ستلقاها
// لحظة نشرها، فيصير وعد «deploy-gate: tolerant» مختبرًا لا مكتوبًا فقط.
//   node scripts/integration/production-baseline.mjs --baseline <ملف>   يكتب لقطة البنية كما كانت عند آخر ترحيل مطبّق
//   node scripts/integration/production-baseline.mjs --names            أسماء الترحيلات التي تُطبَّق في هذا الوضع، سطرًا سطرًا
//
// ما يُطبَّق: كل ما في applied-manifest.json (المطبّق على الإنتاج)، ومعه الحاجب غير المطبّق، لأن بوابة النشر لا تنشر الدوال
// قبله فلا تلقى الدوال قاعدة تنقصه أبدًا. ويُترك المتسامح والمؤجل غير المطبّقين: هما ما قد تعمل الدوال بدونه.
// اللقطة: supabase/schema/baseline.sql تُبنى من كل الترحيلات (ومنها غير المطبّق)، فتُؤخذ من تاريخ git نسختها التي سطر as-of
// فيها ترحيل مطبّق، ويُرفض ما فيه ترحيل غير مطبّق قبل as-of (لا تكون اللقطة عندها بنية الإنتاج). يحتاج تاريخًا كاملًا (fetch-depth: 0).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateOf } from '../ops/pending-migrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = 'supabase/schema/baseline.sql';
const AS_OF_RE = /^-- as-of migration: (\S+)$/m;

// names: كل ترحيلات المستودع، applied: البيان، gate(name) وسمه. يعيد ما يُطبَّق بالترتيب، وما يُترك بوسمه
export function productionNames(names, applied, gate) {
  const apply = [], skipped = [];
  for (const n of [...names].sort()) {
    if (applied.has(n)) apply.push(n);
    else if (gate(n) === 'blocking') apply.push(n);
    else skipped.push({ name: n, gate: gate(n) });
  }
  return { apply, skipped };
}

// versions: [{ commit, asOf }] من الأحدث. يختار أحدث نسخة as-of فيها مطبّق، ولا غير مطبّق قبله
export function pickBaseline(versions, names, applied) {
  for (const v of versions) {
    if (!v.asOf || !applied.has(v.asOf)) continue;
    const early = names.filter((n) => n <= v.asOf && !applied.has(n));
    if (early.length) throw new Error(`لقطة ${v.commit} (as-of ${v.asOf}) تسبقها ترحيلات غير مطبّقة: ${early.join('، ')}؛ لا لقطة تطابق الإنتاج`);
    return v;
  }
  throw new Error('لا نسخة من اللقطة سطر as-of فيها ترحيل مطبّق (هل التاريخ كامل؟ fetch-depth: 0)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const applied = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, 'scripts/db/applied-manifest.json'), 'utf8')).migrations));
  const names = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  const gate = (n) => gateOf(readFileSync(join(ROOT, 'supabase/migrations', `${n}.sql`), 'utf8'), n).gate;
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (process.argv.includes('--names')) {
    const { apply, skipped } = productionNames(names, applied, gate);
    for (const s of skipped) console.error(`skip  ${s.name} (${s.gate}، غير مطبّق على الإنتاج)`);
    process.stdout.write(`${apply.join('\n')}\n`);
  } else if (process.argv.includes('--baseline')) {
    const out = process.argv[process.argv.indexOf('--baseline') + 1];
    if (!out) { console.error('--baseline <ملف>'); process.exit(2); }
    const commits = git('log', '--format=%H', '--', BASELINE).split('\n').filter(Boolean);
    const versions = commits.map((commit) => ({ commit, asOf: git('show', `${commit}:${BASELINE}`).match(AS_OF_RE)?.[1] }));
    const v = pickBaseline(versions, names, applied);
    writeFileSync(out, git('show', `${v.commit}:${BASELINE}`));
    console.log(`لقطة الإنتاج: ${v.commit.slice(0, 8)} as-of ${v.asOf}`);
  } else {
    console.error('الاستعمال: --baseline <ملف>، أو --names');
    process.exit(2);
  }
}
