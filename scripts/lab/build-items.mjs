// يولّد ترحيل إضافة أدوات مختبر بعد التحقق من كل مواصفة بالمحرك نفسه
//   node scripts/lab/build-items.mjs phase2 > supabase/migrations/<ts>_leaders_lab_phase2.sql
import { validateLab } from '../../supabase/functions/leaders-api/lab.js';

const phase = process.argv[2] || 'phase2';
const { ITEMS } = await import(`./${phase}.mjs`);
const q = (s) => `$x$${s}$x$`;
const rows = ITEMS.map((it) => `insert into leaders.lab_items (key, kind, dimension, chapter_key, sort, min_level, minutes, points, title_ar, summary_ar, spec) values (
  ${q(it.key)}, ${q(it.kind)}, ${q(it.dimension)}, ${q(it.chapter_key)}, ${it.sort}, ${q(it.min_level)}, ${it.minutes}, ${it.points},
  ${q(it.title_ar)},
  ${q(it.summary_ar)},
  ${q(JSON.stringify(validateLab(it.spec)))}::jsonb
) on conflict (key) do nothing;`);
process.stdout.write(`-- مختبر القائد (${phase}): أدوات لأبواب لم يكن لها مختبر وللمستويات الأعلى.
-- مولّد من scripts/lab/${phase}.mjs بالأمر: node scripts/lab/build-items.mjs ${phase}
-- آمن لإعادة التشغيل (on conflict do nothing)، والظهور كما في المرحلة الأولى بحسب الفتح (lab_grants).

${rows.join('\n\n')}
`);
