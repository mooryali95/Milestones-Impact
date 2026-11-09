#!/usr/bin/env node
// بصمات وسائط تطبيق القادة (sha256 لكل ملف) في leaders-app/media-manifest.json، خارج public فلا يُنشر.
// ‏/media/* يُخدم بتخزين immutable لسنة (leaders-app/public/_headers)، فما تأخذه حافة Cloudflare أول مرة يبقى
// عندها بالاسم نفسه: ملف أعيد توليده بالاسم نفسه، أو طلب لاسم جديد قبل النشر فيرد بصفحة HTML، يسمّم الاسم سنة.
// القاعدة: الاسم الواحد لبايتات واحدة أبدًا، والوسيط الجديد أو المعدَّل باسم جديد (RUNBOOK §1).
// يبقى الاسم في البيان بعد حذف ملفه، فلا يعود الاسم نفسه ببايتات أخرى.
//   node scripts/ops/media-manifest.mjs          يضيف الملفات الجديدة، ويفشل إن تغيّرت بايتات اسم قائم
//   node scripts/ops/media-manifest.mjs --check  يفشل إن تغيّر اسم قائم أو وُجد ملف خارج البيان
// ويحرسه media-manifest.test.js في npm test.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST = join(ROOT, 'leaders-app/media-manifest.json');
// المصدر، والمبني المودع الذي ينشره mi-leaders كما هو
export const MEDIA_DIRS = ['leaders-app/public/media', 'leaders/media'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const readManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));

// كل ملف في مجلد الوسائط بمساره النسبي (ومنه المجلدات الفرعية مثل tour/)
export function mediaFiles(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return {};
  const out = {};
  for (const e of readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = join(e.parentPath ?? e.path, e.name);
    out[full.slice(abs.length + 1)] = sha256(readFileSync(full));
  }
  return out;
}

// الفروق: اسم قائم تغيّرت بايتاته (changed)، وملف لا يعرفه البيان (unknown)
export function compare(manifest, files) {
  const changed = [], unknown = [];
  for (const [name, h] of Object.entries(files)) {
    if (!(name in manifest.files)) unknown.push(name);
    else if (manifest.files[name] !== h) changed.push(name);
  }
  return { changed: changed.sort(), unknown: unknown.sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = readManifest();
  const all = {}, changed = new Set(), unknown = new Set();
  for (const d of MEDIA_DIRS) {
    const files = mediaFiles(d);
    Object.assign(all, files);
    const r = compare(manifest, files);
    r.changed.forEach((n) => changed.add(`${d}/${n}`));
    r.unknown.forEach((n) => unknown.add(n));
  }
  for (const n of changed) console.error(`✗ ${n}: الاسم منشور ببايتات أخرى؛ أرجع الملف وانشر التعديل باسم جديد`);
  if (changed.size) process.exit(1);
  if (process.argv.includes('--check')) {
    for (const n of unknown) console.error(`✗ ${n}: خارج البيان؛ شغّل node scripts/ops/media-manifest.mjs`);
    if (unknown.size) process.exit(1);
    console.log(`الوسائط (${Object.keys(manifest.files).length}) كما نُشرت`);
  } else {
    const files = { ...manifest.files };
    for (const n of unknown) files[n] = all[n];
    const sorted = Object.fromEntries(Object.keys(files).sort().map((n) => [n, files[n]]));
    writeFileSync(MANIFEST, JSON.stringify({ ...manifest, files: sorted }, null, 2) + '\n');
    console.log(`البيان: ${Object.keys(sorted).length} ملفًا، منها ${unknown.size} جديدًا`);
  }
}
