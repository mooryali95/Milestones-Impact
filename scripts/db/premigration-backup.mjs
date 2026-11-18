#!/usr/bin/env node
// خطة النسخة الإلزامية قبل تطبيق ترحيل (تصور تحديث المنصة بلا أثر، المرحلة 6، البند 3، وش5): أي الجداول القائمة يمسها
// الترحيل فتُفرَّغ بـ pg_dump إلى مخزن النسخ (R2، البادئة premigration/) قبل التطبيق، في الخطوة نفسها من migrate.yml.
//   node scripts/db/premigration-backup.mjs <الاسم>...   يطبع key=value لـ $GITHUB_OUTPUT:
//     tables=leaders.a,leaders.b  الجداول الممسوسة (alter وupdate وdelete وtruncate وinsert وحذف جدول، وما تكتبه دوال الترحيل)
//     full=true|false             ما لا يُعرف هدفه (execute ديناميكي، أو استدعاء دالة قائمة) يفرّغ مخططات leaders وpublic كاملة
//     skip=true|false             لا جدول قائم ممسوس (جداول جديدة أو دوال وصلاحيات وحدها): لا شيء يُنسخ
//     label=premig-<أول ترحيل>    وسم اسم الملف في المخزن
// والجدول الجديد يُرشَّح عند التفريغ (backup.sh يسأل القاعدة أيها موجود)، فلا يفشل pg_dump على جدول لم يُنشأ بعد.
// ترحيل بيانات (يغيّر صفوفًا قائمة) يحمل فوق هذا جدول backup_* وأمر إرجاع مكتوبًا يفرضهما الفاحص (migration-lint.mjs).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, isBackupTable } from './migration-sql.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = 'leaders.schema_migrations';
const TOUCH = new Set(['alter-other', 'add-column', 'drop-column', 'alter-column', 'set-not-null', 'column-type', 'rename', 'drop-table', 'update', 'delete', 'truncate', 'insert']);

// sqls: [{ name, sql }]
export function backupPlan(sqls) {
  const tables = new Set();
  const unknown = [];
  const restore = [];
  for (const { name, sql } of sqls) {
    const ops = analyze(sql);
    const created = new Set();
    for (const o of ops) {
      if (o.op === 'create-table') created.add(o.table);
      if (o.op === 'unknown') unknown.push(`${name}: ${o.detail}`);
      // جدول أنشأه الترحيل نفسه قبل أن يمسه لا يحتاج نسخة، وكذلك جداول النسخ والسجل
      if (TOUCH.has(o.op) && o.table && o.table !== LEDGER && !isBackupTable(o.table) && !created.has(o.table)) tables.add(o.table);
    }
    for (const m of sql.matchAll(/^--\s*restore:\s*(.+)$/gm)) restore.push(`${name}: ${m[1].trim()}`);
  }
  const full = unknown.length > 0;
  return { tables: [...tables].sort(), full, skip: !full && tables.size === 0, unknown, restore, label: `premig-${(sqls[0]?.name || 'x').slice(0, 14)}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = process.argv.slice(2).map((n) => n.trim().replace(/\.sql$/, '')).filter(Boolean);
  if (!names.length) { console.error('سمِّ ترحيلًا واحدًا على الأقل'); process.exit(2); }
  const sqls = names.map((name) => {
    const p = join(ROOT, 'supabase/migrations', `${name}.sql`);
    if (!/^\d{14}_[a-z0-9_]+$/.test(name) || !existsSync(p)) { console.error(`ترحيل غير موجود: ${name}`); process.exit(2); }
    return { name, sql: readFileSync(p, 'utf8') };
  });
  const plan = backupPlan(sqls);
  const out = `tables=${plan.tables.join(',')}\nfull=${plan.full}\nskip=${plan.skip}\nlabel=${plan.label}\n`;
  process.stdout.write(out);
  for (const u of plan.unknown) console.error(`::notice::هدف غير معروف (${u})، فتُنسخ المخططات كاملة`);
  for (const r of plan.restore) console.error(`::notice::أمر الإرجاع المكتوب في ${r}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### النسخة قبل الترحيل\n\n${plan.skip ? 'لا جدول قائم يمسه الترحيل: لا نسخة.' : plan.full ? 'المخططان leaders وpublic كاملين (هدف غير معروف).' : `الجداول: ${plan.tables.join('، ')}`}\n\n${plan.restore.map((r) => `- الإرجاع: ${r}`).join('\n')}\n`);
  }
}
