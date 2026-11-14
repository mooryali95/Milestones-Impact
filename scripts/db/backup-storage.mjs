#!/usr/bin/env node
// يحمّل كل ملفات دلو تخزين خاص (السير الذاتية والأدلة) إلى مجلد، للنسخ الاحتياطي الليلي
// في backup.yml. الاستعمال:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db/backup-storage.mjs <المجلد> [الدلو]
// المفتاح: مفتاح سري جديد باسم مستقل للنسخ (sb_secret_، من Settings ← API Keys ← Secret keys)، أو service_role القديم
// (JWT) إلى أن يتقاعد أوائل 2027. والسر في GitHub اسمه SUPABASE_SERVICE_ROLE_KEY في الحالين.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// المفتاح السري الجديد ليس JWT، فيُرسل في apikey وحده ولا يُقبل في Authorization: Bearer (وثائق Supabase للمفاتيح).
// ومفتاح service_role القديم يُرسل في الاثنين كما كان. والمفتاح العام (publishable أو anon) لا يرى الدلو الخاص فيُرفض.
export function authHeaders(key) {
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (key.startsWith('sb_publishable_')) throw new Error('SUPABASE_SERVICE_ROLE_KEY holds a publishable key; use a secret key (sb_secret_...)');
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = `Bearer ${key}`;
  return h;
}

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const out = process.argv[2] || 'storage';
const bucket = process.argv[3] || 'leaders-private';
let headers = {};

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

// يعمل حين يُشغَّل مباشرة لا حين يُستورد (الاختبار). pathToFileURL يطابق المسار ولو فيه مسافات أو حروف عربية
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!url) { console.error('SUPABASE_URL is required'); process.exit(2); }
  try { headers = authHeaders(key); } catch (e) { console.error(e.message); process.exit(2); }
  const files = await listAll('');
  let bytes = 0;
  for (const f of files) { await download(f.path); bytes += f.size; }
  console.log(`${files.length} files, ${(bytes / 1e6).toFixed(1)} MB from ${bucket} -> ${out}`);
}
