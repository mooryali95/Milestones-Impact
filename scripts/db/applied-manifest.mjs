#!/usr/bin/env node
// بصمات الترحيلات المطبّقة على الإنتاج (sha256 لكل ملف) في scripts/db/applied-manifest.json.
// الترحيل المطبّق لا يُعدَّل ولا يُعاد توليده: بوابة النشر تقارن الأسماء وحدها (pending-migrations.mjs)،
// فالملف المعدَّل بعد تطبيقه لا يصل الإنتاج أبدًا ويفترق المستودع عن القاعدة بلا إشارة. التغيير بترحيل جديد باسم جديد.
// البيان لا يضم إلا ما طُبّق فعلًا: الترحيل الجديد خارجه حتى يُطبَّق، فيُضاف باسمه بعد أن يظهر في سجل الإنتاج.
//   node scripts/db/applied-manifest.mjs --check           يفشل إن تغيّر ملف مطبّق أو غاب
//   node scripts/db/applied-manifest.mjs --add <الاسم>...  يضيف ترحيلًا بعد تطبيقه على الإنتاج، ولا يغيّر بصمة قائمة
// ويحرسه applied-manifest.test.js في npm test.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST = join(ROOT, 'scripts/db/applied-manifest.json');
export const MIGRATIONS = join(ROOT, 'supabase/migrations');
const fileOf = (name) => join(MIGRATIONS, `${name}.sql`);

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const readManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
const hashOf = (name) => (existsSync(fileOf(name)) ? sha256(readFileSync(fileOf(name))) : null);

// الفروق بين البيان والملفات: ترحيل مطبّق غاب ملفه أو تغيّرت بايتاته
export function drift(manifest = readManifest(), hash = hashOf) {
  const out = [];
  for (const [name, want] of Object.entries(manifest.migrations)) {
    const got = hash(name);
    if (got === null) out.push(`${name}: مطبّق على الإنتاج وملفه غائب`);
    else if (got !== want) out.push(`${name}: مطبّق على الإنتاج وتغيّرت بايتاته؛ أرجعه كما كان واكتب التغيير في ترحيل جديد`);
  }
  return out;
}

// يضيف أسماء طُبّقت للتو، ويرفض ما ليس له ملف وما يغيّر بصمة قائمة
export function addApplied(manifest, names, hash = hashOf) {
  const migrations = { ...manifest.migrations };
  for (const name of names) {
    const got = hash(name);
    if (got === null) throw new Error(`${name}: لا ملف بهذا الاسم في supabase/migrations`);
    if (migrations[name] && migrations[name] !== got) throw new Error(`${name}: في البيان ببصمة أخرى؛ الترحيل المطبّق لا يُعدَّل`);
    migrations[name] = got;
  }
  const sorted = Object.fromEntries(Object.keys(migrations).sort().map((n) => [n, migrations[n]]));
  return { ...manifest, migrations: sorted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--add' && args.length > 1) {
    const next = addApplied(readManifest(), args.slice(1).map((a) => a.replace(/\.sql$/, '').replace(/^.*\//, '')));
    writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
    console.log(`البيان: ${Object.keys(next.migrations).length} ترحيلًا مطبّقًا`);
  } else if (args[0] === '--check') {
    const d = drift();
    for (const l of d) console.error(`✗ ${l}`);
    if (d.length) process.exit(1);
    console.log(`الترحيلات المطبّقة (${Object.keys(readManifest().migrations).length}) كما طُبّقت`);
  } else {
    console.error('الاستعمال: --check، أو --add <اسم الترحيل>... بعد تطبيقه على الإنتاج');
    process.exit(2);
  }
}
