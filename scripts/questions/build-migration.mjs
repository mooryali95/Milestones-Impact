// يبني ترحيل بنك الأسئلة v4.1 من الفرق بين v4 و v4.1
//   node scripts/questions/build-migration.mjs
// الناتج: supabase/migrations/20261101110000_leaders_questions_v4_1.sql
//   1. جدول نسخ احتياطي leaders.questions_backup_20261101 (صفوف الأداتين النشطتين) مع RLS
//   2. لكل فقرة أُعيد ترتيب خياراتها: إعادة ربط فهرس الإجابة المخزون value.k في
//      leaders.assessment_answers (محمية بشرط أن خيارات الصف ما زالت القديمة، فلا تتكرر)
//   3. UPDATE واحد لكل صف تغيّر فعلًا (text_ar/help_ar/text_rater_ar/options) بمعرّفه
// لا يُضيف ولا يحذف صفوفًا، ولا يمس الأدوات غير النشطة.
import { readFileSync, writeFileSync } from 'node:fs';
import { EDITS, ACTIVE } from './edits-v4_1.mjs';

const ROOT = new URL('../../', import.meta.url);
const BEFORE = JSON.parse(readFileSync(new URL('supabase/content/questions/v4/items.json', ROOT), 'utf8'));
const AFTER = JSON.parse(readFileSync(new URL('supabase/content/questions/v4.1/items.json', ROOT), 'utf8'));
const OUT = new URL('supabase/migrations/20261101110000_leaders_questions_v4_1.sql', ROOT);
const BACKUP = 'leaders.questions_backup_20261101';

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const jsonb = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const beforeById = Object.fromEntries(BEFORE.map((q) => [q.id, q]));
const changed = AFTER.filter((q) => {
  const o = beforeById[q.id];
  if (!o) throw new Error(`${q.code}: id غير موجود في v4`);
  if (!ACTIVE.includes(q.instrument)) throw new Error(`${q.code}: أداة غير نشطة`);
  return !['text_ar', 'help_ar', 'text_rater_ar', 'options'].every((f) => same(o[f], q[f]));
});

const lines = [];
lines.push('-- ════════════════════════════════════════════════════════════════');
lines.push('-- بنك الأسئلة v4.1: تعديلات تدقيق 31 أكتوبر 2026 (الملحق 2)');
lines.push('-- ════════════════════════════════════════════════════════════════');
lines.push('-- مولَّد بـ scripts/questions/build-migration.mjs من supabase/content/questions/v4.1/items.json');
lines.push(`-- ${changed.length} صفًا معدّلًا في ${ACTIVE.join(' و')} (${new Set(changed.map((q) => q.code)).size} رمزًا)؛ لا إضافة ولا حذف.`);
lines.push('-- آمن لإعادة التشغيل: النسخ الاحتياطي لا يُعاد إنشاؤه، وإعادة ربط الإجابات مشروطة بالخيارات القديمة.');
lines.push('');
lines.push('-- 1) نسخة احتياطية من صفوف الأداتين النشطتين قبل أي تعديل');
lines.push(`create table if not exists ${BACKUP} as`);
lines.push('  select q.* from leaders.questions q');
lines.push(`  where q.instrument_id in (select id from leaders.instruments where key in (${ACTIVE.map(lit).join(', ')}));`);
lines.push(`alter table ${BACKUP} enable row level security;`);
lines.push(`comment on table ${BACKUP} is 'نسخة من leaders.questions (baseline-v4 و post-v2) قبل ترحيل v4.1 — للرجوع فقط';`);
lines.push('');

// 2) إعادة ربط فهارس الإجابات للفقرات المعاد ترتيبها
const reordered = changed.filter((q) => EDITS[q.code]?.order);
if (reordered.length) {
  lines.push('-- 2) الإجابات المخزونة تشير إلى موضع الخيار (value.k)؛ عند إعادة الترتيب يُنقل الفهرس إلى الموضع الجديد');
  lines.push('--    new[j] = old[order[j]]  ⇒  k_old = order[j] يصبح k_new = j');
  for (const q of reordered) {
    const order = EDITS[q.code].order;
    const o = beforeById[q.id];
    const cases = order.map((oldIdx, newIdx) => `when ${oldIdx} then ${newIdx}`).join(' ');
    lines.push(`-- ${q.instrument} / ${q.code}: ${order.map((oldIdx, newIdx) => `${'ABCD'[oldIdx]}→${'ABCD'[newIdx]}`).join(' ')}`);
    lines.push('update leaders.assessment_answers a');
    lines.push(`   set value = jsonb_set(a.value, '{k}', to_jsonb(case (a.value->>'k')::int ${cases} else (a.value->>'k')::int end))`);
    lines.push(` where a.question_id = ${lit(q.id)}`);
    lines.push(`   and jsonb_typeof(a.value->'k') = 'number'`);
    lines.push(`   and exists (select 1 from leaders.questions q where q.id = a.question_id and q.options = ${jsonb(o.options)});`);
  }
  lines.push('');
}

// 3) التعديلات
lines.push('-- 3) الصفوف المعدّلة (بالمعرّف)');
for (const q of changed) {
  const o = beforeById[q.id];
  const sets = [];
  for (const f of ['text_ar', 'help_ar', 'text_rater_ar']) if (!same(o[f], q[f])) sets.push(`${f} = ${lit(q[f])}`);
  if (!same(o.options, q.options)) sets.push(`options = ${jsonb(q.options)}`);
  lines.push(`-- ${q.instrument} / ${q.code}`);
  lines.push(`update leaders.questions set ${sets.join(', ')} where id = ${lit(q.id)};`);
}
lines.push('');

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`كُتب ${OUT.pathname}: ${changed.length} صفًا، ${reordered.length} إعادة ترتيب`);
