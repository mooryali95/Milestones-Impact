// يولّد ترحيل «كاتون» CBM (المرحلة ط): الحكم بثقة مدرَّجة ووسوم الموقف، وجدول النقاط الثلاثي،
// ومزامنة الجمل التي بلا إجابات مع مصدرها supabase/content/katon/v1/topics.json (الصياغة المحوّطة).
//   node scripts/katon/build-cbm-migration.mjs > supabase/migrations/20261105160000_leaders_katon_cbm.sql
import { readFileSync } from 'node:fs';
const topics = JSON.parse(readFileSync(new URL('../../supabase/content/katon/v1/topics.json', import.meta.url), 'utf8'));
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const NAME = '20261105160000_leaders_katon_cbm';
let sql = `-- ════════════════════════════════════════════════════════════════
-- «كاتون» على CBM الثلاثي (المرحلة ط): حكم بثقة مدرَّجة، ووسوم موقف بلا نقاط، وجدول نقاط سليم
-- ════════════════════════════════════════════════════════════════
-- مولَّد من scripts/katon/build-cbm-migration.mjs. آمن لإعادة التشغيل.
-- 1) الإجابة: verdict (صحيحة/خاطئة) وconfidence (1..3) وstances (وسوم الموقف)؛ choice القديم يصير اختياريًا
--    ويُملأ منه: «صحيحة/خاطئة 100%» حكم بأعلى ثقة، وغيره وسم موقف.
-- 2) جدول النقاط في programs.katon_points يُقرأ بالشكل الجديد {right:{1,2,3}, wrong:{1,2,3}}؛ القديم يُهمل
--    فيعود إلى الافتراضي (Gardner-Medwin: 1/2/3 و0/−2/−6).
-- 3) الجمل التي بلا إجابات تُزامَن مع مصدرها: الخاطئة محوّطة بلا قرائن إطلاق، وبعض الصحيحة حازمة.
alter table leaders.katon_answers add column if not exists verdict text check (verdict in ('true', 'false'));
alter table leaders.katon_answers add column if not exists confidence smallint check (confidence between 1 and 3);
alter table leaders.katon_answers add column if not exists stances text[] not null default '{}';
alter table leaders.katon_answers alter column choice drop not null;
alter table leaders.katon_answers drop constraint if exists katon_answers_stances_check;
alter table leaders.katon_answers add constraint katon_answers_stances_check
  check (stances <@ array['question', 'research', 'idea', 'can', 'believe', 'assume']::text[]);
alter table leaders.katon_answers drop constraint if exists katon_answers_verdict_confidence_check;
alter table leaders.katon_answers add constraint katon_answers_verdict_confidence_check
  check ((verdict is null) = (confidence is null));
update leaders.katon_answers set verdict = choice, confidence = 3 where choice in ('true', 'false') and verdict is null;
update leaders.katon_answers set stances = array[choice] where choice in ('question', 'research', 'idea', 'can', 'believe', 'assume') and stances = '{}';

-- ── مزامنة الجمل التي بلا إجابات مع المصدر ──
`;
for (const t of topics) {
  for (const [k, s] of t.sentences.entries()) {
    sql += `update leaders.katon_sentences s set text_ar = ${q(s.text_ar)}, key = ${q(s.key)}, explain_ar = ${q(s.explain_ar || null)}, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = ${q(t.key)} and s.sort = ${k + 1}
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);\n`;
  }
}
sql += `\ninsert into leaders.schema_migrations (name) values (${q(NAME)}) on conflict do nothing;\n`;
process.stdout.write(sql);
