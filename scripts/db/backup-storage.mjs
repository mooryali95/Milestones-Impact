#!/usr/bin/env node
// يحمّل كل ملفات دلو تخزين خاص (السير الذاتية والأدلة) إلى مجلد، للنسخ الاحتياطي الليلي
// في backup.yml. الاستعمال:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db/backup-storage.mjs <المجلد> [الدلو]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const out = process.argv[2] || 'storage';
const bucket = process.argv[3] || 'leaders-private';
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };

// قائمة الملفات بكل مستوياتها: الصف بلا id مجلد يُفتح بدوره
export async function listAll(prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`list ${prefix || '/'}: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    for (const row of rows) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id) files.push({ path, size: Number(row.metadata?.size ?? 0) });
      else files.push(...await listAll(path));
    }
    if (rows.length < 1000) return files;
  }
}

async function download(path) {
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers });
  if (!r.ok) throw new Error(`get ${path}: ${r.status}`);
  const dest = join(out, path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

const files = await listAll('');
let bytes = 0;
for (const f of files) { await download(f.path); bytes += f.size; }
console.log(`${files.length} files, ${(bytes / 1e6).toFixed(1)} MB from ${bucket} -> ${out}`);
