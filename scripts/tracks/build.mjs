// ════════════════════════════════════════════════════════════════
// المسارات (المرحلة ب): يولّد ربط المسارات الـ27 بملفات التعريف، وترحيل قاعدة البيانات
// ════════════════════════════════════════════════════════════════
// المصدر: supabase/content/tracks/v2/{profiles,models,labs,title-fixes}.json
// الناتج:  supabase/content/tracks/v2/tracks.json
//          supabase/migrations/20261101140000_leaders_tracks_profiles.sql
// state-before.json لقطة مختصرة من قاعدة الإنتاج (المفاتيح والمستويات والحقول)؛
// تُحدَّث من لقطة كاملة بـ: node scripts/tracks/build.mjs --snapshot <dir>
// حيث <dir> فيه tracks.json وmodels.json وlabs.json وrequirements.json وstages.json وhandbook.json
// ثم: node scripts/tracks/verify.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIMENSIONS } from '../../supabase/functions/leaders-api/labels.js';
import { profileKey, trackLevels } from '../../supabase/functions/leaders-api/logic.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, 'supabase/content/tracks/v2');
const MIGRATION = join(ROOT, 'supabase/migrations/20261101140000_leaders_tracks_profiles.sql');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };

// ── لقطة الحالة قبل الترحيل (اختياري) ──
const snap = process.argv.indexOf('--snapshot');
if (snap > 0) {
  const src = process.argv[snap + 1];
  const j = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
  const state = {
    _about: 'لقطة مختصرة من قاعدة الإنتاج قبل ترحيل 20261101140000 (المفاتيح والمستويات والحقول، بلا محتوى طويل). يقرؤها verify.mjs.',
    tracks: j('tracks.json').map((t) => ({ key: t.key, priority_dimension: t.priority_dimension, title_ar: t.title_ar })).sort((a, b) => a.key.localeCompare(b.key)),
    models: j('models.json').map((m) => ({
      key: m.key, dimension: m.dimension, title_ar: m.title_ar, min_level: m.min_level, capstone_sort: m.capstone_sort, scopes: m.scopes || [], active: m.active,
      fields: m.fields.map((f) => ({ key: f.key, label: f.label, ...(f.min_level ? { min_level: f.min_level } : {}), ...(f.track ? { track: true } : {}), ...(f.scopes ? { scopes: f.scopes } : {}) })),
    })),
    labs: j('labs.json').map((l) => ({ key: l.key, dimension: l.dimension, chapter_key: l.chapter_key, min_level: l.min_level, audience: l.audience, active: l.active, title_ar: l.title_ar, sort: l.sort })),
    requirements: j('requirements.json').map((r) => ({ code: r.code, stage_key: r.stage_key, dimension: r.dimension, level: r.level, active: r.active, title_ar: r.title_ar })),
    stages: j('stages.json').map((s) => ({ key: s.key, active: s.active })),
    chapters: j('handbook.json').map((h) => ({ dimension: h.dimension, chapter_key: h.chapter_key, min_level: h.min_level, title_ar: h.title_ar })),
  };
  writeFileSync(join(DIR, 'state-before.json'), `${JSON.stringify(state, null, 1)}\n`);
  console.log('state-before.json ←', src);
}

const state = read('state-before.json');
const { profiles } = read('profiles.json');
const models = read('models.json');
const labs = read('labs.json');
const fixes = read('title-fixes.json');
const byProfile = Object.fromEntries(profiles.map((p) => [p.key, p]));

// ── ربط المسارات ──
const SHORT = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.short]));
export function strengthsEn(levels) {
  const r = DIMENSIONS.map((d) => RANK[levels[d.key]]);
  const top = Math.max(...r);
  const strong = DIMENSIONS.filter((_, i) => r[i] === top).map((d) => SHORT[d.key]);
  return strong.length === DIMENSIONS.length ? 'Even across all three frameworks' : `Strengths: ${strong.join(' & ')}`;
}
const tracks = state.tracks.map((t) => {
  const levels = trackLevels(t.key);
  const pk = profileKey(levels, t.priority_dimension);
  const p = byProfile[pk];
  if (!p) throw new Error(`${t.key}: لا ملف تعريف ${pk}`);
  const fix = fixes.titles[t.key];
  return {
    key: t.key, priority_dimension: t.priority_dimension, profile_key: pk,
    title_ar: fix?.to || t.title_ar, ...(fix ? { title_ar_before: t.title_ar } : {}),
    title_en: `${p.title_en} · ${strengthsEn(levels)}`,
  };
});
writeFileSync(join(DIR, 'tracks.json'), `${JSON.stringify({
  _about: 'مولَّد بـ scripts/tracks/build.mjs: كل مسار من الـ27 وملف تعريفه (إطار الأولوية + مستواه فيه)، وعنوانه الإنجليزي، والعناوين الثلاثة المصححة. journey_ar للمسار = رحلة ملف تعريفه.',
  tracks,
}, null, 1)}\n`);

// ── الترحيل ──
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const jq = (o) => `${q(JSON.stringify(o))}::jsonb`;
const journey = (p) => p.journey_ar.join('\n');
const L = [];
L.push(`-- ════════════════════════════════════════════════════════════════════
-- المسارات (المرحلة ب): ملفات التعريف، والمختبرات بالمستوى، ووعود الرحلة، والنماذج
-- مولَّد بـ scripts/tracks/build.mjs من supabase/content/tracks/v2؛ لا يُحرَّر يدويًا.
-- آمن لإعادة التشغيل: النسخة الاحتياطية تُؤخذ مرة واحدة، وكل تعديل يكتب قيمة ثابتة
-- بمفتاح الصف أو محروس بشرط يختفي بعد أول تشغيل.
-- 1) leaders.track_profiles: تسعة ملفات تعريف (إطار الأولوية × مستواه فيه) بنص أصيل،
--    وtracks.profile_key لكل مسار. المفتاح M{m}I{i}L{l} يبقى داخليًا للاشتقاق.
-- 2) tracks.journey_ar = رحلة ملف التعريف: بلا «النصيب الأكبر من الجلسات» ولا
--    «ورشة/عيادة/حلقة» بحسب المستوى (لا متطلب رحلة يفرّقها)، وtitle_en للـ27،
--    وتصحيح ثلاثة عناوين تناقض حزمتها (M3I1L3، M2I3L2، M3I3L3)
-- 3) lab_items.audience = all: المختبرات تصل بالمستوى تلقائيًا؛ portfolio-review يبقى بمنحة
-- 4) النماذج: نظرية التغيير وتشخيص نمط الخلاف تأسيسيان، وتقرير الأثر في الوثيقة،
--    وحقل احترافي لكل من خمسة نماذج راكدة
-- التحقق: node scripts/tracks/verify.mjs (المحتوى) وscripts/db/verify-tracks-profiles.sql (القاعدة)
-- ════════════════════════════════════════════════════════════════════

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل
create table if not exists leaders.backup_20261101_tracks_profiles as
  select 'track' kind, key ref, title_ar a, title_en b, journey_ar c from leaders.tracks
  union all select 'model', key, min_level, capstone_sort::text, fields::text from leaders.learning_models
   where key in (${[...new Set([...Object.keys(models.min_level), ...Object.keys(models.capstone_sort), ...models.patch_fields.map((x) => x.model), ...models.add_fields.map((x) => x.model)])].map(q).join(', ')})
  union all select 'lab', key, audience, min_level, null from leaders.lab_items;
alter table leaders.backup_20261101_tracks_profiles enable row level security;

-- أدوات مؤقتة للجلسة: تعديل حقل بمفتاحه، أو إدراجه قبل «تعمق المسار» إن غاب
create or replace function pg_temp.patch_field(mkey text, fkey text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey))
     and not m.fields @> jsonb_build_array(jsonb_build_object('key', fkey) || patch);
$f$;

create or replace function pg_temp.add_field(mkey text, field jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(x order by o) from (
       select f x, ord * 2 o from jsonb_array_elements(m.fields) with ordinality as e(f, ord)
       union all
       select field, coalesce((select ord * 2 - 1 from jsonb_array_elements(m.fields) with ordinality as e(f, ord) where f->>'key' = 'track_depth' limit 1), 100000)
     ) s)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

-- ════════════ 1) ملفات التعريف ════════════
create table if not exists leaders.track_profiles (
  key text primary key,
  priority_dimension text not null references leaders.dimensions(key),
  level text not null references leaders.levels(key),
  title_ar text not null,
  title_en text,
  summary_ar text not null,
  journey_ar text not null,
  updated_at timestamptz not null default now(),
  constraint track_profiles_key_check check (key = priority_dimension || '-' || level),
  constraint track_profiles_title_ar_check check (char_length(title_ar) between 3 and 120),
  constraint track_profiles_title_en_check check (title_en is null or char_length(title_en) <= 200),
  constraint track_profiles_text_check check (char_length(summary_ar) <= 1000 and char_length(journey_ar) <= 3000)
);
alter table leaders.track_profiles enable row level security;
grant select, insert, update, delete on leaders.track_profiles to service_role;
drop trigger if exists track_profiles_touch on leaders.track_profiles;
create trigger track_profiles_touch before update on leaders.track_profiles for each row execute function leaders.touch_updated_at();

insert into leaders.track_profiles (key, priority_dimension, level, title_ar, title_en, summary_ar, journey_ar) values
${profiles.map((p) => `  (${[p.key, p.priority_dimension, p.level, p.title_ar, p.title_en, p.summary_ar, journey(p)].map(q).join(', ')})`).join(',\n')}
on conflict (key) do update set
  priority_dimension = excluded.priority_dimension, level = excluded.level, title_ar = excluded.title_ar, title_en = excluded.title_en,
  summary_ar = excluded.summary_ar, journey_ar = excluded.journey_ar
where (track_profiles.title_ar, track_profiles.title_en, track_profiles.summary_ar, track_profiles.journey_ar)
  is distinct from (excluded.title_ar, excluded.title_en, excluded.summary_ar, excluded.journey_ar);

-- ════════════ 2) المسارات: ملف التعريف، والرحلة الصادقة، والعنوان الإنجليزي ════════════
alter table leaders.tracks add column if not exists profile_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tracks_profile_key_fkey') then
    alter table leaders.tracks add constraint tracks_profile_key_fkey foreign key (profile_key) references leaders.track_profiles(key);
  end if;
end $$;

-- ملف التعريف يُشتق من محور الأولوية الحالي ومستوى المسار فيه، كما يشتقه الخادم (profileKey)
update leaders.tracks t set profile_key = t.priority_dimension || '-' || case t.priority_dimension
    when 'milestone' then t.milestone_level when 'impact' then t.impact_level else t.leadership_level end
 where t.priority_dimension is not null and t.profile_key is distinct from t.priority_dimension || '-' || case t.priority_dimension
    when 'milestone' then t.milestone_level when 'impact' then t.impact_level else t.leadership_level end;

-- الرحلة = رحلة ملف التعريف؛ والعنوان الإنجليزي = عنوان الملف وأقوى الأطر (من مستويات المسار)
update leaders.tracks t set journey_ar = p.journey_ar, title_en = p.title_en || ' · ' || v.en
  from leaders.track_profiles p, (values
${tracks.map((t) => `    (${q(t.key)}, ${q(strengthsEn(trackLevels(t.key)))})`).join(',\n')}
  ) v(k, en)
 where t.key = v.k and p.key = t.profile_key
   and (t.journey_ar, t.title_en) is distinct from (p.journey_ar, p.title_en || ' · ' || v.en);

-- ثلاثة عناوين تعد بما لا تسلّمه الحزمة (الملحق 4 §2-ب)
update leaders.tracks t set title_ar = v.t from (values
${Object.entries(fixes.titles).map(([k, f]) => `  (${q(k)}, ${q(f.from)}, ${q(f.to)})`).join(',\n')}
) v(k, f, t)
 where t.key = v.k and t.title_ar = v.f;

-- ════════════ 3) المختبرات بالمستوى ════════════
update leaders.lab_items l set audience = v.a from (values
${Object.entries(labs.audience).map(([k, a]) => `  (${q(k)}, ${q(a)})`).join(',\n')}
) v(k, a)
 where l.key = v.k and l.audience <> v.a;

-- ════════════ 4) النماذج ════════════
${Object.entries(models.min_level).map(([k, v]) => `-- ${v.why}\nupdate leaders.learning_models set min_level = ${q(v.to)} where key = ${q(k)} and min_level <> ${q(v.to)};`).join('\n')}
${Object.entries(models.capstone_sort).map(([k, v]) => `-- ${v.why}\nupdate leaders.learning_models set capstone_sort = ${v.to} where key = ${q(k)} and capstone_sort is null;`).join('\n')}

${models.patch_fields.map((x) => `select pg_temp.patch_field(${q(x.model)}, ${q(x.field)}, ${jq(x.patch)});`).join('\n')}

${models.add_fields.map((x) => `select pg_temp.add_field(${q(x.model)}, ${jq(x.field)});`).join('\n')}
`);
writeFileSync(MIGRATION, L.join(''));
console.log('tracks.json:', tracks.length, '· migration:', MIGRATION.replace(`${ROOT}/`, ''));
