#!/usr/bin/env node
// بوابة النشر (ci.yml): يفشل إن وُجد في supabase/migrations ترحيل لا يسجله scripts/db/applied-manifest.json مطبقًا،
// فلا يفترق المستودع عن السجل المودع بصمت. قراءة فقط، بلا أسرار ولا شبكة. لا يكتب في البيان: الإضافة باسم صريح
// بعد التطبيق (node scripts/db/applied-manifest.mjs --add <الاسم>)، وسير migrate.yml يذكّر بها بعد كل تطبيق ناجح.
import { readdirSync } from 'node:fs';
import { MIGRATIONS, readManifest, unrecorded } from './applied-manifest.mjs';

const manifest = readManifest();
const names = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, -4));
const u = unrecorded(manifest, names);
for (const n of u) console.error(`✗ ${n}: في المستودع وغير مسجل مطبقًا؛ طبّقه بسير migrate.yml ثم node scripts/db/applied-manifest.mjs --add ${n}`);
if (u.length) process.exit(1);
console.log(`كل ترحيلات المستودع (${names.length}) مسجلة مطبقة`);
