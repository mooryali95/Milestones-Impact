#!/usr/bin/env node
// طلبات ترحيل واحد كما يرسلها الإنتاج (migration-tx.mjs applyPlan)، ليطبّقها سير التكامل بالشكل نفسه: معاملة صريحة بمهلتي
// القفل والتنفيذ، أو أمرًا أمرًا تحت الوسم «-- migrate: no-transaction»، أو النص كما هو إن حمل begin وcommit بيده.
//   node scripts/integration/apply-plan.mjs <ملف الترحيل> <مجلد>   يكتب كل طلب في ملف (000.sql، 001.sql، ...) ويطبع الوضع
// يستدعيه scripts/integration/apply-migrations.sh، ويرسل كل ملف بـ psql -f في اتصال وحده كما يصل كل طلب إلى Management API.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPlan } from '../db/migration-tx.mjs';

const [file, dir] = process.argv.slice(2);
if (!file || !dir) { console.error('الاستعمال: apply-plan.mjs <ملف الترحيل> <مجلد>'); process.exit(2); }
const plan = applyPlan(readFileSync(file, 'utf8'));
mkdirSync(dir, { recursive: true });
plan.requests.forEach((r, i) => writeFileSync(join(dir, `${String(i).padStart(3, '0')}.sql`), `${r}\n`));
console.log(plan.mode);
