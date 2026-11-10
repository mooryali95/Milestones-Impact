// يولّد ترحيل موضوعات «كاتون» لإطاري الأثر والقيادة من supabase/content/katon/v2/topics.json.
// الموضوعات تدخل مسودة (draft): تظهر في محرر كاتون باللوحة للمراجعة والنشر، ولا تظهر للمشاركين ولا في القاعة قبل نشرها.
//   node scripts/katon/build-v2-migration.mjs > supabase/migrations/20261110170000_leaders_katon_impact_leadership.sql
import { readFileSync } from 'node:fs';
const topics = JSON.parse(readFileSync(new URL('../../supabase/content/katon/v2/topics.json', import.meta.url), 'utf8'));
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const NAME = '20261110170000_leaders_katon_impact_leadership';
const FIRST_SORT = 101;   // بعد بنك البداية، فلا يزاحم ترتيبه
let sql = `-- ════════════════════════════════════════════════════════════════
-- موضوعات «كاتون» لإطاري الأثر والقيادة (مسودة للجنة المحتوى)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant بيانات فقط في جدولين قائمين، والدوال تقرأ المنشور وحده فلا يتغير شيء للمشارك قبله ولا بعده
-- مولَّد من scripts/katon/build-v2-migration.mjs ومصدره supabase/content/katon/v2/topics.json.
-- ستة موضوعات (ثلاثة لكل إطار) بحالة draft: تُراجَع وتُنشر من محرر كاتون في اللوحة بعد اعتماد لجنة المحتوى،
-- وبنشر ثلاثة في كل إطار تجتاز بوابة م4 (كاتون بثلاثة موضوعات منشورة في كل إطار).
-- آمن لإعادة التشغيل: الموضوع الموجود بمفتاحه لا يُمس، وجمله لا تُدرج مرتين.
`;
topics.forEach((t, i) => {
  sql += `
insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values (${q(t.key)}, ${q(t.title_ar)}, ${q(t.dimension)}, ${q(JSON.stringify(t.layers))}::jsonb, ${q(t.source)}, 'draft', ${FIRST_SORT + i})
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
${t.sentences.map((s, k) => `  (${k + 1}, ${q(s.question)}, ${q(s.text_ar)}, ${q(s.key)}, ${q(s.explain_ar || null)}, ${q(JSON.stringify(s.tasks))})`).join(',\n')}
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = ${q(t.key)} and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);
`;
});
sql += `\ninsert into leaders.schema_migrations (name) values (${q(NAME)}) on conflict do nothing;\n`;
process.stdout.write(sql);
