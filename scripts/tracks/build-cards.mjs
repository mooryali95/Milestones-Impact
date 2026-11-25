// ════════════════════════════════════════════════════════════════
// بطاقة المسار: يولّد ترحيل ما أضافته البطاقة إلى القاعدة من مصدره الواحد
// ════════════════════════════════════════════════════════════════
// المصدر: supabase/content/tracks/v2/{slices,tracks,profiles}.json
//   slices.additions.requirements  متطلبات رحلة جديدة (بدائل O-KPI وL-360I، وبند المتوسط في إدارة المشروعات)
//   slices.additions.labs          مختبرات الأثر للمتوسط والاحترافي
//   slices.additions.models        حقول وفصول جديدة في الوثيقة (المرحلة 2)
//   tracks.json                     أولوية المسار وملفه (قاعدة «قرب الإتقان»)
// الناتج: supabase/migrations/20261129110000_leaders_track_cards.sql
//   node scripts/tracks/build-cards.mjs           يكتب الترحيل
//   node scripts/tracks/build-cards.mjs --check   يفشل إن اختلف المودع عن المولَّد
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'supabase/content/tracks/v2');
export const NAME = '20261129110000_leaders_track_cards';
const OUT = join(ROOT, `supabase/migrations/${NAME}.sql`);
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const S = read('slices.json');
const { tracks } = read('tracks.json');
const { profiles } = read('profiles.json');

const q = (v) => (v == null ? 'null' : `$q$${String(v)}$q$`);
const jq = (v) => `$j$${JSON.stringify(v)}$j$::jsonb`;
const reqs = S.additions.requirements || [];
const labs = S.additions.labs || [];
const models = S.additions.models || { fields: [], chapters: [] };

export function build() {
  const L = [];
  L.push(`-- deploy-gate: tolerant محتوى فقط: متطلبات رحلة ومختبرات وحقول جديدة، وأولوية أربعة مسارات. الدوال الأقدم تقرأ الصفوف الجديدة
-- كغيرها (requirementApplies وlabVisible وfieldsFor)، وأولوية المسار تُحسب من priorityFor في الدوال نفسها، فقبل نشر الدوال الجديدة
-- تبقى الأولوية القديمة محسوبة وملف التعريف المخزن هنا يُقرأ للعرض وحده.
-- ════════════════════════════════════════════════════════════════
-- بطاقة المسار (قرار المالك 2026-11-25): مولَّد بـ scripts/tracks/build-cards.mjs من supabase/content/tracks/v2/slices.json وtracks.json
-- ════════════════════════════════════════════════════════════════
-- 1) أولوية المسار وملفه: قاعدة «قرب الإتقان» (logic.js nearMastery) لثلاثة مسارات، وافتراض التعادل في M2I3L2، فيبلغ كل ملف من التسعة مسار.
--    الرحلة والعنوان الإنجليزي من ملف التعريف الجديد كما في 20261101140000.
-- 2) متطلبات الرحلة: لا تنقص رحلة إطار حين يرتفع مستواه. O-KPI وL-360I عُطّلا لسبب حقيقي (تكرار العمل)، فلا يُعادان، ويحل محلهما
--    بندان يطلبان ما لا يطلبه غيرهما (O-EVID خطة الأدلة، L-GOV الحوكمة)، ومعهما O-COST للمتوسط في إدارة المشروعات.
--    لكل برنامج فيه O-BREG، ولا يُمس ما حرّرته الإدارة (لا إدراج فوق رمز قائم). نسخ الرحلة المجمدة (program_versions) لا تُمس.
-- 3) مختبرا الأثر للمتوسط والاحترافي، فتختلف مختبرات الأثر بين المستويات الثلاثة.
-- restore: update leaders.track_profiles p set journey_ar = b.journey_ar from leaders.backup_20261129_track_profiles b where p.key = b.key; update leaders.tracks t set priority_dimension = b.priority_dimension, profile_key = b.profile_key, journey_ar = b.journey_ar, title_en = b.title_en from leaders.backup_20261129_track_cards b where t.key = b.key; delete from leaders.stage_requirements where code in (${reqs.map((r) => `'${r.code}'`).join(', ')}); delete from leaders.lab_items where key in (${labs.map((l) => `'${l.key}'`).join(', ')}) and not exists (select 1 from leaders.lab_attempts a where a.item_id = lab_items.id)
`);
  L.push(`create table if not exists leaders.backup_20261129_track_cards as
  select key, priority_dimension, profile_key, journey_ar, title_en from leaders.tracks;
alter table leaders.backup_20261129_track_cards enable row level security;
revoke all on leaders.backup_20261129_track_cards from anon, authenticated;

create table if not exists leaders.backup_20261129_track_profiles as
  select key, journey_ar from leaders.track_profiles;
alter table leaders.backup_20261129_track_profiles enable row level security;
revoke all on leaders.backup_20261129_track_profiles from anon, authenticated;

-- ════════════ 1) أولوية المسار وملفه، ورحلة الملفات التي تذكر ما أُضيف ════════════
update leaders.track_profiles p set journey_ar = v.j from (values
${profiles.map((p) => `  (${q(p.key)}, ${q(p.journey_ar.join('\n'))})`).join(',\n')}
) v(k, j)
 where p.key = v.k and p.journey_ar is distinct from v.j;

update leaders.tracks t set priority_dimension = v.d, profile_key = v.p, journey_ar = p.journey_ar, title_en = v.en
  from leaders.track_profiles p, (values
${tracks.map((t) => `    (${q(t.key)}, ${q(t.priority_dimension)}, ${q(t.profile_key)}, ${q(t.title_en)})`).join(',\n')}
  ) v(k, d, p, en)
 where t.key = v.k and p.key = v.p
   and (t.priority_dimension, t.profile_key, t.journey_ar, t.title_en) is distinct from (v.d, v.p, p.journey_ar, v.en);

-- ════════════ 2) متطلبات الرحلة ════════════
`);
  for (const r of reqs) {
    L.push(`-- ${r.code}: ${r.why}
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, active, config)
select b.program_id, ${q(r.stage_key)}, ${q(r.dimension)}, ${q(r.level)}, ${q(r.code)}, ${r.sort}, ${q(r.title_ar)}, ${q(r.help_ar)}, ${q(r.kind)}, true, false, true,
       ${jq({ model_key: r.model_key, accept: r.accept })}
  from leaders.stage_requirements b
 where b.code = 'O-BREG'
   and not exists (select 1 from leaders.stage_requirements x where x.program_id = b.program_id and x.code = ${q(r.code)});
`);
  }
  L.push(`
-- ════════════ 3) المختبرات ════════════
`);
  for (const l of labs) {
    L.push(`insert into leaders.lab_items (key, kind, dimension, chapter_key, sort, min_level, minutes, points, title_ar, summary_ar, spec, audience) values (
  ${q(l.key)}, ${q(l.kind)}, ${q(l.dimension)}, ${q(l.chapter_key)}, ${l.sort}, ${q(l.min_level)}, ${l.minutes}, ${l.points},
  ${q(l.title_ar)},
  ${q(l.summary_ar)},
  ${jq(l.spec)}, 'all'
) on conflict (key) do nothing;
`);
  }
  if ((models.fields || []).length || (models.chapters || []).length) {
    L.push(`
-- ════════════ 4) الوثيقة ════════════
`);
    for (const c of models.chapters || []) {
      L.push(`-- ${c.why}
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, capstone_sort, scopes, fields)
values (${q(c.dimension)}, ${q(c.key)}, ${c.sort}, ${q(c.title_ar)}, ${q(c.icon)}, ${q(c.summary_ar)}, ${q(c.when_ar)}, ${q(c.steps_ar)}, ${q(c.source_ar)}, ${q(c.min_level)}, ${c.points}, ${c.capstone_sort}, '{}', ${jq(c.fields)})
on conflict (key) do nothing;
`);
    }
    for (const f of models.fields || []) {
      L.push(`-- ${f.model}.${f.field.key}: ${f.why}
update leaders.learning_models m set fields = m.fields || jsonb_build_array(${jq(f.field)})
 where m.key = ${q(f.model)} and not exists (select 1 from jsonb_array_elements(m.fields) e where e->>'key' = ${q(f.field.key)});
`);
    }
    for (const p of models.patches || []) {
      L.push(`-- ${p.model}.${p.field}: ${p.why}
update leaders.learning_models m set fields = (
  select jsonb_agg(case when e->>'key' = ${q(p.field)} then e || ${jq(p.patch)} else e end order by n) from jsonb_array_elements(m.fields) with ordinality x(e, n))
 where m.key = ${q(p.model)} and exists (select 1 from jsonb_array_elements(m.fields) e where e->>'key' = ${q(p.field)} and not (e @> ${jq(p.patch)}));
`);
    }
  }
  L.push(`
insert into leaders.schema_migrations (name) values ('${NAME}') on conflict do nothing;
`);
  return L.join('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = build();
  if (process.argv.includes('--check')) {
    const cur = readFileSync(OUT, 'utf8');
    if (cur !== sql) { console.error(`${NAME}.sql لا يطابق مصدره: node scripts/tracks/build-cards.mjs`); process.exit(1); }
    console.log(`✓ ${NAME}.sql يطابق مصدره`);
  } else {
    writeFileSync(OUT, sql);
    console.log(`← supabase/migrations/${NAME}.sql`);
  }
}
