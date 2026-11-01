// يولّد ترحيل الكتاب v3 من ملفات supabase/content/handbook/v3
//   node scripts/handbook/build-migration.mjs
// يكتب supabase/migrations/20261102110000_leaders_handbook_v3.sql، وإعادة تشغيله تعطي الملف نفسه.
// (ترحيل v2 السابق 20261101100000 مُثبت في المستودع ولا يُعاد توليده.)
//
// حارس التعديلات: لا يُحدَّث صف إلا إن كانت بصمته الحالية
//   md5(body_md || quiz_md || reflection_ar)
// تساوي بصمة v2، فما حرّره المشرف منذ v2 لا يُكتب فوقه، ويُبلَّغ عنه بـ NOTICE.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintHandbookMd, lintQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { loadChapters, ROOT } from './content.mjs';

const OUT = join(ROOT, 'supabase/migrations/20261102110000_leaders_handbook_v3.sql');
const TAG = '$hb$';
const q = (s) => {
  if (s.includes(TAG)) throw new Error(`النص يحوي ${TAG}`);
  return `${TAG}${s}${TAG}`;
};
export const fingerprint = (c) => createHash('md5').update(c.body_md + c.quiz_md + c.reflection_ar, 'utf8').digest('hex');

const v3 = loadChapters('v3');
const v2 = Object.fromEntries(loadChapters('v2').map((c) => [`${c.dimension}/${c.chapter_key}`, c]));
if (v3.length !== 27) throw new Error(`المتوقع 27 بابًا، والموجود ${v3.length}`);
for (const c of v3) {
  const errs = [...lintHandbookMd(c.body_md), ...lintHandbookMd(c.quiz_md), ...lintQuiz(c.quiz_md)].filter((x) => x.level === 'error');
  if (errs.length) throw new Error(`${c.file}: ${errs.map((e) => e.msg).join(' | ')}`);
}

const changed = v3.filter((c) => fingerprint(c) !== fingerprint(v2[`${c.dimension}/${c.chapter_key}`]));

const blocks = changed.map((c) => {
  const old = fingerprint(v2[`${c.dimension}/${c.chapter_key}`]);
  const now = fingerprint(c);
  return `  -- ${c.file}
  update leaders.handbook_modules set
    body_md = ${q(c.body_md)},
    quiz_md = ${q(c.quiz_md)},
    reflection_ar = ${q(c.reflection_ar)}
   where dimension = '${c.dimension}' and chapter_key = '${c.chapter_key}'
     and md5(body_md || quiz_md || reflection_ar) = '${old}';
  get diagnostics n = row_count;
  if n > 0 then updated := updated + 1;
  elsif exists (select 1 from leaders.handbook_modules where dimension = '${c.dimension}' and chapter_key = '${c.chapter_key}'
                  and md5(body_md || quiz_md || reflection_ar) = '${now}') then already := already + 1;
  else skipped := array_append(skipped, '${c.dimension}/${c.chapter_key}');
  end if;`;
}).join('\n\n');

writeFileSync(OUT, `-- ════════════════════════════════════════════════════════════════
-- كتاب القائد v3 (المرحلة ج): الاختبارات والأمثلة والتأملات
-- ════════════════════════════════════════════════════════════════
-- مولّد من supabase/content/handbook/v3 بالأمر: node scripts/handbook/build-migration.mjs
-- لا تحرّره يدويًا؛ عدّل ملفات المحتوى ثم أعد التوليد.
--
--   • سؤال سيناريو ثانٍ لكل باب كان اختباره سؤالًا واحدًا (intro/labs/close × 3).
--   • leadership/ch4: سؤال ترتيب خطوات DIRECT (استدعاء) صار سيناريو تطبيق.
--   • leadership/ch5: التأمل (نعم/لا) صار سؤالًا مفتوحًا.
--   • مثالا milestone/ch3 و milestone/ch6 في المتن أُحكما.
--   المراجعة: docs/audit/2026-11-02-الكتيب-v3-للمراجعة.md
--
-- الحارس: يُحدَّث الباب فقط إن طابقت بصمته الحالية md5(body_md||quiz_md||reflection_ar)
-- بصمة v2؛ ما عدّله المشرف منذ v2 يُترك كما هو ويُذكر في NOTICE.
-- آمن لإعادة التشغيل: النسخة الاحتياطية تُؤخذ مرة واحدة، والصف المحدث سلفًا يُعدّ «مطبقًا».
-- الأبواب المتغيرة: ${changed.length} من ${v3.length}.

create table if not exists leaders.handbook_modules_backup_20261102 as
  select * from leaders.handbook_modules;
alter table leaders.handbook_modules_backup_20261102 enable row level security;

do $v3$
declare
  n int;
  updated int := 0;
  already int := 0;
  skipped text[] := '{}';
begin
${blocks}

  raise notice 'handbook v3: حُدّث % · مطبق سلفًا % · تُخطّي (عدّله المشرف أو مفقود) %: %',
    updated, already, coalesce(array_length(skipped, 1), 0), array_to_string(skipped, ', ');
end
$v3$;
`);
console.log(`كُتب ${OUT} (${changed.length} بابًا متغيرًا: ${changed.map((c) => c.file).join(', ')})`);
