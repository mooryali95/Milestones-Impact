#!/usr/bin/env node
// مولّد قابل لإعادة الاستعمال لكل إصدار جديد من الكتاب (D01): ينقل الأبواب من إصدار إلى الذي يليه بترحيل محروس.
//   node scripts/handbook/build-version.mjs --from=v3 --to=v3.1 [--name=<الطابع>_leaders_handbook_v3_1]
//   node scripts/handbook/build-version.mjs --check     كل إصدار له VERSION.json يُعاد توليده ويُقارن بترحيله (CI)
// الحارس كما في v3: يُحدَّث الباب إن طابقت بصمته الحالية md5(body_md || quiz_md || reflection_ar) بصمة
// الإصدار السابق، ويُعدّ مطبّقًا إن طابقت الإصدار الجديد، ويُترك ويُذكر ما عدا ذلك (عدّله المشرف).
// مستوى الباب (min_level في ترويسة ملفه) يُكتب مع المتن إن حمله الإصدار الجديد.
// الإصدار بعد ترحيله مجمّد: أي تعديل إصدار جديد، فلا يتغير ترحيل طُبّق.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintHandbookMd, lintQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { dirOf, loadChapters, ROOT, versions } from './content.mjs';

const TAG = '$hb$';
const q = (s) => { if (s.includes(TAG)) throw new Error(`النص يحوي ${TAG}`); return `${TAG}${s}${TAG}`; };
export const fingerprint = (c) => createHash('md5').update(c.body_md + c.quiz_md + c.reflection_ar, 'utf8').digest('hex');
const LEVELS = ['beginner', 'intermediate', 'advanced'];

export function buildVersion(from, to, name) {
  const a = Object.fromEntries(loadChapters(from).map((c) => [`${c.dimension}/${c.chapter_key}`, c]));
  const b = loadChapters(to);
  if (b.length !== Object.keys(a).length) throw new Error(`${to}: ${b.length} بابًا و${from}: ${Object.keys(a).length}. إضافة باب أو حذفه ترحيل صريح لا إصدار`);
  for (const c of b) {
    if (!a[`${c.dimension}/${c.chapter_key}`]) throw new Error(`${to}/${c.file}: لا مقابل له في ${from}`);
    if (c.min_level && !LEVELS.includes(c.min_level)) throw new Error(`${c.file}: min_level غير صالح`);
    const errs = [...lintHandbookMd(c.body_md, c.min_level || 'beginner'), ...lintHandbookMd(c.quiz_md, c.min_level || 'beginner'), ...lintQuiz(c.quiz_md)].filter((x) => x.level === 'error');
    if (errs.length) throw new Error(`${c.file}: ${errs.map((e) => e.msg).join(' | ')}`);
  }
  const changed = b.filter((c) => { const p = a[`${c.dimension}/${c.chapter_key}`]; return fingerprint(c) !== fingerprint(p) || (c.min_level || null) !== (p.min_level || null); });
  const tag = `$${to.replace(/\W/g, '_')}$`;
  const blocks = changed.map((c) => {
    const old = fingerprint(a[`${c.dimension}/${c.chapter_key}`]);
    const now = fingerprint(c);
    const where = `dimension = '${c.dimension}' and chapter_key = '${c.chapter_key}'`;
    return `  -- ${c.file}
  update leaders.handbook_modules set
    body_md = ${q(c.body_md)},
    quiz_md = ${q(c.quiz_md)},
    reflection_ar = ${q(c.reflection_ar)}${c.min_level ? `,\n    min_level = '${c.min_level}'` : ''}
   where ${where}
     and md5(body_md || quiz_md || reflection_ar) = '${old}';
  get diagnostics n = row_count;
  if n > 0 then updated := updated + 1;
  elsif exists (select 1 from leaders.handbook_modules where ${where} and md5(body_md || quiz_md || reflection_ar) = '${now}') then already := already + 1;
  else skipped := array_append(skipped, '${c.dimension}/${c.chapter_key}');
  end if;`;
  }).join('\n\n');
  return `-- ════════════════════════════════════════════════════════════════
-- كتاب القائد ${to}: من ${from} (D01 وD02 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- مولّد من supabase/content/handbook/${to} بالأمر:
--   node scripts/handbook/build-version.mjs --from=${from} --to=${to} --name=${name}
-- لا تحرّره يدويًا. الإصدار ${to} مجمّد بعد هذا الترحيل، والتعديل إصدار جديد.
-- الحارس: يُحدَّث الباب إن طابقت بصمته بصمة ${from}، ويُعدّ مطبّقًا إن طابقت ${to}، ويُترك ويُذكر ما عدا ذلك.
-- الأبواب المتغيرة: ${changed.length} من ${b.length}${changed.length ? `: ${changed.map((c) => c.file).join(', ')}` : ''}.

do ${tag}
declare
  n int;
  updated int := 0;
  already int := 0;
  skipped text[] := '{}';
begin
${blocks || '  null;'}

  raise notice 'handbook ${to}: حُدّث % · مطبق سلفًا % · تُخطّي (عدّله المشرف أو مفقود) %: %',
    updated, already, coalesce(array_length(skipped, 1), 0), array_to_string(skipped, ', ');
end
${tag};

insert into leaders.schema_migrations (name) values ('${name}') on conflict do nothing;
`;
}

const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const arg = (k) => (process.argv.find((x) => x.startsWith(`--${k}=`)) || '').split('=')[1];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    let bad = 0;
    let n = 0;
    for (const v of versions()) {
      const meta = join(dirOf(v), 'VERSION.json');
      if (!existsSync(meta)) continue;
      const { from, migration } = JSON.parse(readFileSync(meta, 'utf8'));
      const file = join(ROOT, 'supabase/migrations', `${migration}.sql`);
      n++;
      if (!existsSync(file) || readFileSync(file, 'utf8') !== buildVersion(from, v, migration)) { bad++; console.error(`✗ ${v}: ترحيله ${migration} لا يطابق ملفاته. الإصدار المرحَّل مجمّد: أنشئ إصدارًا جديدًا`); }
    }
    console.log(bad ? `${bad} إصدار غير مطابق` : `✓ ${n} إصدار يطابق ترحيله`);
    process.exit(bad ? 1 : 0);
  }
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) { console.error('--from و--to مطلوبان، مثل --from=v3 --to=v3.1'); process.exit(2); }
  const name = arg('name') || `${stamp()}_leaders_handbook_${to.replace(/\W/g, '_')}`;
  if (!/^\d{14}_[a-z0-9_]+$/.test(name)) { console.error(`اسم ترحيل غير صالح: ${name}`); process.exit(2); }
  const sql = buildVersion(from, to, name);
  writeFileSync(join(ROOT, 'supabase/migrations', `${name}.sql`), sql);
  writeFileSync(join(dirOf(to), 'VERSION.json'), `${JSON.stringify({ from, migration: name }, null, 2)}\n`);
  console.log(`كُتب ${name}.sql و${to}/VERSION.json. ثم: node scripts/db/migrations-list.mjs && node scripts/db/snapshot.mjs --from-migrations`);
}
