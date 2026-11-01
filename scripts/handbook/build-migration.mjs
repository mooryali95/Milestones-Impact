// يولّد ترحيل الكتاب v2 من ملفات supabase/content/handbook/v2
//   node scripts/handbook/build-migration.mjs
// يكتب supabase/migrations/20261101100000_leaders_handbook_v2.sql، وإعادة تشغيله تعطي الملف نفسه
// وبعد تطبيق v2 على القاعدة، يُولَّد ترحيل للأبواب المعدلة وحدها من الملفات نفسها:
//   node scripts/handbook/build-migration.mjs --only=a.md,b.md --out=<اسم الترحيل> --note="سبب التعديل"
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintHandbookMd, lintQuiz } from '../../supabase/functions/leaders-api/logic.js';
import { loadChapters, ROOT } from './content.mjs';

const OUT = join(ROOT, 'supabase/migrations/20261101100000_leaders_handbook_v2.sql');
const TAG = '$hb$';
const q = (s) => {
  if (s.includes(TAG)) throw new Error(`النص يحوي ${TAG}`);
  return `${TAG}${s}${TAG}`;
};

const chapters = loadChapters();
if (chapters.length !== 27) throw new Error(`المتوقع 27 بابًا، والموجود ${chapters.length}`);
for (const c of chapters) {
  const errs = [...lintHandbookMd(c.body_md), ...lintHandbookMd(c.quiz_md), ...lintQuiz(c.quiz_md)].filter((x) => x.level === 'error');
  if (errs.length) throw new Error(`${c.file}: ${errs.map((e) => e.msg).join(' | ')}`);
}

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg('only')?.split(',').map((x) => x.trim()).filter(Boolean);

const updatesOf = (list) => list.map((c) => `-- ${c.file}
update leaders.handbook_modules set
  body_md = ${q(c.body_md)},
  quiz_md = ${q(c.quiz_md)},
  reflection_ar = ${q(c.reflection_ar)}
 where dimension = '${c.dimension}' and chapter_key = '${c.chapter_key}';`).join('\n\n');

if (only) {
  const picked = chapters.filter((c) => only.includes(c.file));
  const missing = only.filter((f) => !picked.some((c) => c.file === f));
  if (missing.length) throw new Error(`أبواب غير موجودة: ${missing.join('، ')}`);
  const name = arg('out');
  if (!/^\d{14}_[a-z0-9_]+$/.test(name || '')) throw new Error('--out يحتاج اسم ترحيل مثل 20261101150000_leaders_handbook_v2_1');
  const stamp = name.slice(0, 8);
  const out = join(ROOT, `supabase/migrations/${name}.sql`);
  writeFileSync(out, `-- ════════════════════════════════════════════════════════════════
-- كتاب القائد: تحديث ${picked.length} أبواب من supabase/content/handbook/v2
-- ════════════════════════════════════════════════════════════════
-- مولّد بالأمر: node scripts/handbook/build-migration.mjs --only=${only.join(',')} --out=${name}
-- لا تحرّره يدويًا؛ عدّل ملفات المحتوى ثم أعد التوليد.
-- ${arg('note') || ''}
--
-- آمن لإعادة التشغيل: النسخة الاحتياطية تُؤخذ مرة واحدة، والتحديث يكتب قيمًا ثابتة.

create table if not exists leaders.handbook_modules_backup_${stamp}_${name.slice(8, 12)} as
  select * from leaders.handbook_modules;
alter table leaders.handbook_modules_backup_${stamp}_${name.slice(8, 12)} enable row level security;

${updatesOf(picked)}
`);
  console.log(`كُتب ${out} (${picked.length} أبواب)`);
  process.exit(0);
}

const updates = updatesOf(chapters);

writeFileSync(OUT, `-- ════════════════════════════════════════════════════════════════
-- كتاب القائد v2: تطبيق تدقيق 2026-10-31 (الملحق 3) على الأبواب الـ27
-- ════════════════════════════════════════════════════════════════
-- مولّد من supabase/content/handbook/v2 بالأمر: node scripts/handbook/build-migration.mjs
-- لا تحرّره يدويًا؛ عدّل ملفات المحتوى ثم أعد التوليد.
--
--   • الأخطاء السبعة: نموذج جدارات واحد (الست)، وتعريف DIRECT يصل كل
--     المستويات، و«ثلاث نقاط ربط» مكتملة للمبتدئ، وحذف Kotter من السؤال
--     وإضافته لعنوان الجدول، و«كتمان اعتراض وجيه» في فخ التفهم، واستبدال
--     ثلاثة أسئلة تطابق بنود التسكين (M-K3 و I-K5B و L-K9B)، وحذف @timeline
--     المتسرب في milestone/ch6.
--   • فجوات البوابات الثماني، وحذف التكرار القالبي، وتوحيد المصطلحات،
--     وتفكيك الاختصارات عربيًا عند أول ظهور.
--
-- آمن لإعادة التشغيل: النسخة الاحتياطية تُؤخذ مرة واحدة قبل أول تشغيل،
-- والتحديث يكتب قيمًا ثابتة.

create table if not exists leaders.handbook_modules_backup_20261101 as
  select * from leaders.handbook_modules;
alter table leaders.handbook_modules_backup_20261101 enable row level security;

${updates}
`);
console.log(`كُتب ${OUT} (${chapters.length} بابًا)`);
