#!/usr/bin/env node
// فاحص الترحيلات الثابت (تصور تحديث المنصة بلا أثر، المرحلة 6، البند 5، وش4 وش5): يرفض في CI ما يحجب القراءة أو يكسر
// الإصدار السابق قبل أن يصل الإنتاج. لا قاعدة ولا شبكة: يقرأ النص بـ migration-sql.mjs.
//   node scripts/db/migration-lint.mjs          الترحيلات الجديدة وحدها (بعد LINT_AFTER)، ورمز 1 عند أي مخالفة غير مستثناة
//   node scripts/db/migration-lint.mjs --all    تقرير بكل الترحيلات، ورمز 0 دائمًا (القديمة طُبّقت ولا تُعدَّل بايتاتها)
//
// القواعد (الست الأولى نص البند 5، والأخيرتان من البندين 1 و3):
//   not-null-no-default   عمود NOT NULL يُضاف إلى جدول قائم بلا قيمة افتراضية: يُفشل الكتابة من الكود القديم
//   set-not-null          SET NOT NULL مباشرة على جدول قائم: يمسح الجدول كله تحت قفل حصري. البديل قيد check ... not valid ثم validate
//   index-not-concurrent  فهرس بلا CONCURRENTLY على جدول كبير (LARGE_TABLES): يحجب الكتابة طوال البناء
//   column-type           تغيير نوع عمود في جدول قائم: يعيد كتابة الجدول تحت قفل حصري، ويكسر الكود القديم
//   drop-or-rename        إعادة تسمية جدول أو عمود (تكسر الإصدار السابق دائمًا: أضف الجديد ثم احذف القديم لاحقًا)، أو حذف جدول أو
//                         عمود أو عرض في ترحيل يُدخل استعمالًا جديدًا. الحذف في ترحيل انكماش وحده، بسطر
//                         «-- contract: <ترحيل التوسيع>» يسمي ترحيلًا مطبّقًا على الإنتاج قبل 14 يومًا على الأقل (ش4)
//   tolerant-note         «deploy-gate: tolerant» بلا ملاحظة تقول كيف تتسامح الدوال معه
//   data-backup           ترحيل بيانات يغيّر صفوفًا قائمة أو يحذفها (update، delete، truncate، حذف جدول أو عمود) بلا جدول backup_*
//                         يحفظها قبله، وبلا سطر «-- restore: <أمر الإرجاع>»
//   transaction           begin أو commit باليد (التطبيق يلف كل ترحيل في معاملته)، أو concurrently بلا الوسم
//                         «-- migrate: no-transaction»، أو ترحيل بهذا الوسم فيه غير الفهارس المتزامنة وسطر السجل
//
// الاستثناء باسم الترحيل وسببه في migration-lint-allow.json، ولكل استثناء قواعد مسماة. استثناء لا يطابق مخالفة قائمة يُفشل،
// فلا يبقى استثناء قديم يغطي ما بعده.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, isBackupTable, noTransaction } from './migration-sql.mjs';
import { gateOf } from '../ops/pending-migrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
export const ALLOW_FILE = join(ROOT, 'scripts/db/migration-lint-allow.json');

// آخر ترحيل يوم دخل الفاحص (2026-11-18): ما بعده يُفحص، وما قبله تاريخ مطبّق أو مدموج لا تُغيَّر بايتاته
export const LINT_AFTER = '20261118150000_leaders_client_events';
export const RULES = ['not-null-no-default', 'set-not-null', 'index-not-concurrent', 'column-type', 'drop-or-rename', 'tolerant-note', 'data-backup', 'transaction'];
export const CONTRACT_MIN_DAYS = 14;

// جداول تكتب فيها كل جلسة أو كل إجابة فتكبر بلا حد. فهرس عادي عليها يحجب الكتابة دقائق مع النمو. تُحدَّث القائمة من عدّ
// الإنتاج (SQL Editor: select relname, n_live_tup from pg_stat_user_tables order by 2 desc limit 30) حين يتجاوز جدول 50 ألف صف
export const LARGE_TABLES = new Set([
  'leaders.assessment_answers', 'leaders.assessment_results', 'leaders.assessments', 'leaders.audit_log', 'leaders.auth_sessions',
  'leaders.client_events', 'leaders.consent_events', 'leaders.content_progress', 'leaders.conversation_messages', 'leaders.email_challenges',
  'leaders.guidance_messages', 'leaders.hall_presence', 'leaders.handbook_progress', 'leaders.handbook_views', 'leaders.idempotency_keys',
  'leaders.katon_answers', 'leaders.lab_attempts', 'leaders.mail_events', 'leaders.mail_queue', 'leaders.participants', 'leaders.peer_answers',
  'leaders.points_ledger', 'leaders.reading_progress', 'leaders.video_progress', 'leaders.workshop_attendance', 'leaders.workshop_scan_receipts',
  'public.admin_audit_log', 'public.api_sessions', 'public.contact_requests', 'public.email_otps', 'public.mail_log', 'public.page_views',
]);

const LEDGER = 'leaders.schema_migrations';
const stamp = (name) => {
  const m = String(name).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
};

// مخالفات ترحيل واحد: [{ rule, line, message }]. applied: أسماء الترحيلات المطبّقة على الإنتاج (البيان)
export function lint(name, sql, { applied = new Set() } = {}) {
  const ops = analyze(sql);
  const out = [];
  const add = (rule, line, message) => out.push({ rule, line, message });
  const created = new Set();
  const createdViews = new Set(ops.filter((o) => o.op === 'create-view').map((o) => o.table));
  const fresh = (t) => created.has(t);
  const head = sql.split('\n').slice(0, 15).join('\n');

  // يُدخل استعمالًا جديدًا: جدول أو عمود أو عرض أو دالة جديدة (لا جداول backup_ ولا ما يُحذف ويُعاد في الترحيل نفسه)
  const expands = ops.some((o) => (o.op === 'create-table' && !isBackupTable(o.table)) || o.op === 'add-column' || o.op === 'function'
    || (o.op === 'create-view' && !ops.some((d) => d.op === 'drop-view' && d.table === o.table)));

  for (const o of ops) {
    if (o.op === 'create-table') { created.add(o.table); continue; }
    const t = o.table;
    if (o.op === 'add-column' && o.notNull && !o.hasDefault && !fresh(t)) add('not-null-no-default', o.line, `${t}.${o.column}: NOT NULL بلا DEFAULT على جدول قائم`);
    if (o.op === 'set-not-null' && !fresh(t)) add('set-not-null', o.line, `${t}.${o.column}: SET NOT NULL مباشرة. أضف check (${o.column} is not null) not valid، ثم validate constraint في ترحيل لاحق`);
    if (o.op === 'create-index' && !o.concurrently && LARGE_TABLES.has(t) && !fresh(t)) add('index-not-concurrent', o.line, `فهرس على ${t} (جدول كبير) بلا CONCURRENTLY، في ترحيل وحده بالوسم -- migrate: no-transaction`);
    if (o.op === 'column-type' && !fresh(t)) add('column-type', o.line, `${t}.${o.column}: تغيير نوع عمود قائم. أضف عمودًا جديدًا وانسخ إليه، ثم احذف القديم بترحيل انكماش`);
    if (o.op === 'rename' && !fresh(t)) add('drop-or-rename', o.line, `${t}: ${o.detail} يكسر الإصدار السابق. أضف الاسم الجديد، ثم احذف القديم بترحيل انكماش بعد ${CONTRACT_MIN_DAYS} يومًا`);
    const dropsData = (o.op === 'drop-table' || o.op === 'drop-column') && !isBackupTable(t) && !fresh(t);
    const dropsView = o.op === 'drop-view' && !createdViews.has(t);
    if (dropsData || dropsView) {
      const what = o.op === 'drop-column' ? `${t}.${o.column}` : t;
      if (expands) add('drop-or-rename', o.line, `حذف ${what} في ترحيل يُدخل استعمالًا جديدًا. الحذف في ترحيل انكماش وحده`);
      else {
        const c = head.match(/^--\s*contract:\s*(\d{14}_[a-z0-9_]+)/m);
        if (!c) add('drop-or-rename', o.line, `حذف ${what} بلا سطر «-- contract: <ترحيل التوسيع>»`);
        else if (!applied.has(c[1])) add('drop-or-rename', o.line, `ترحيل التوسيع ${c[1]} لم يُطبَّق على الإنتاج (ليس في applied-manifest.json)`);
        else if ((stamp(name) - stamp(c[1])) / 864e5 < CONTRACT_MIN_DAYS) add('drop-or-rename', o.line, `الانكماش بعد أقل من ${CONTRACT_MIN_DAYS} يومًا من ترحيل التوسيع ${c[1]}`);
      }
    }
  }

  const g = gateOf(sql);
  if (g.gate === 'tolerant' && g.note.replace(/\s/g, '').length < 10) add('tolerant-note', 1, 'deploy-gate: tolerant بلا ملاحظة تقول كيف تعمل الدوال قبل الترحيل');

  const destructive = ops.filter((o) => ['update', 'delete', 'truncate'].includes(o.op) ? (o.table !== LEDGER && !isBackupTable(o.table) && !fresh(o.table))
    : (o.op === 'drop-table' || o.op === 'drop-column') && !isBackupTable(o.table) && !fresh(o.table));
  if (destructive.length) {
    const backup = ops.some((o) => o.op === 'create-table' && isBackupTable(o.table) && o.asSelect);
    const restore = /^--\s*restore:\s*\S/m.test(sql);
    if (!backup || !restore) {
      const tables = [...new Set(destructive.map((o) => o.table))].join('، ');
      add('data-backup', destructive[0].line, `يغيّر صفوفًا قائمة في ${tables} بلا ${[!backup && 'create table <مخطط>.backup_<الوصف> as select ...', !restore && 'سطر «-- restore: <أمر الإرجاع>»'].filter(Boolean).join(' ولا ')}`);
    }
  }

  const marker = noTransaction(sql);
  for (const o of ops) {
    if (o.op === 'tx-control') add('transaction', o.line, `${o.detail} باليد: التطبيق يلف الترحيل في معاملته (migration-tx.mjs)`);
    const concurrent = ['create-index', 'drop-index', 'reindex'].includes(o.op) && o.concurrently;
    if (concurrent && !marker) add('transaction', o.line, 'concurrently لا يعمل داخل معاملة: ضعه في ترحيل وحده بالوسم -- migrate: no-transaction');
    if (marker && !concurrent && !(o.op === 'insert' && o.table === LEDGER)) add('transaction', o.line, 'ترحيل بلا معاملة لا يحمل إلا الفهارس المتزامنة وسطر السجل، فلا يبقى نصف ترحيل عند الفشل');
    if (marker && o.op === 'create-index' && o.concurrently && !o.ifNotExists) add('transaction', o.line, 'create index concurrently بلا if not exists: إعادة التشغيل بعد فشل تفشل');
  }
  return out;
}

export const readAllow = () => JSON.parse(readFileSync(ALLOW_FILE, 'utf8'));

// يطبّق الاستثناءات: { failures, allowed, stale }. stale استثناء بلا ترحيل أو بلا مخالفة يغطيها أو بقاعدة مجهولة أو سبب قصير
export function judge(results, allow) {
  const failures = [], allowed = [], stale = [];
  for (const [name, a] of Object.entries(allow.migrations || {})) {
    if (!a.reason || a.reason.replace(/\s/g, '').length < 15) stale.push(`${name}: الاستثناء بلا سبب كافٍ`);
    for (const r of a.rules || []) if (!RULES.includes(r)) stale.push(`${name}: قاعدة مجهولة ${r}`);
    if (!results.has(name)) stale.push(`${name}: مستثنى ولا ترحيل مفحوص بهذا الاسم`);
    else for (const r of a.rules || []) if (!results.get(name).some((f) => f.rule === r)) stale.push(`${name}: مستثنى من ${r} ولا مخالفة له فيها`);
  }
  for (const [name, list] of results) for (const f of list) ((allow.migrations?.[name]?.rules || []).includes(f.rule) ? allowed : failures).push({ name, ...f });
  return { failures, allowed, stale };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ALL = process.argv.includes('--all');
  const applied = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, 'scripts/db/applied-manifest.json'), 'utf8')).migrations));
  const names = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();
  const picked = ALL ? names : names.filter((n) => n > LINT_AFTER);
  const results = new Map(picked.map((n) => [n, lint(n, readFileSync(join(MIGRATIONS, `${n}.sql`), 'utf8'), { applied })]));
  const { failures, allowed, stale } = judge(results, ALL ? { migrations: {} } : readAllow());
  for (const f of failures) console.log(`${ALL ? '•' : '✗'} ${f.name}:${f.line} [${f.rule}] ${f.message}`);
  for (const f of allowed) console.log(`• ${f.name}:${f.line} [${f.rule}] مستثنى: ${readAllow().migrations[f.name].reason}`);
  for (const s of stale) console.log(`✗ استثناء: ${s}`);
  console.log(ALL ? `تقرير: ${failures.length} ملاحظة في ${picked.length} ترحيلًا (القديمة لا تُفشل)`
    : `فاحص الترحيلات: ${picked.length} ترحيلًا جديدًا بعد ${LINT_AFTER}، ${failures.length} مخالفة، ${allowed.length} مستثناة`);
  if (!ALL && (failures.length || stale.length)) process.exit(1);
}
