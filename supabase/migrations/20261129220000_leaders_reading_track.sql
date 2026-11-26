-- deploy-gate: tolerant قبل نشر الدوال يُقرأ النطاق track كنطاق all (readingChapters يعيد كل الأبواب لما لا يعرفه)، فلا يتغير شيء حتى تُنشر
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 3، المرحلة 3.4: قصر إلزام الكتيب على فصول المسار ومحوره
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-3-رفع-الفائدة-الحقيقية-v1.md §5.4 (اعتمده المالك 2026-11-26، القرار 6).
-- بند «قراءة الكتاب» T-HB بنطاقه all يصير track: أبواب محور أولوية المسار كلها وأول باب من كل إطار آخر، والبقية متاحة اختيارية.
-- قاعدة «لا فقد» في readingStatus: باب أتمه المشارك خارج النطاق يبقى محسوبًا، فلا تنخفض جاهزية أحد. بلا أولوية معروفة يبقى الإلزام كاملًا.
-- لا يمس ما حرّرته الإدارة: التعديل مشروط بالإعداد الأصلي حرفيًا (scope all مع quiz true) وبالنص الأصلي للمساعدة، في كل برنامج،
-- وفي نسخ البرامج المجمدة (program_versions.data) بالشرط نفسه، فالدفعة المثبتة على نسخة تقرأ رحلتها من لقطتها.
-- البيانات تتغير: الصفوف السابقة في backup_20261129_reading_track (الحية) وbackup_20261129_reading_track_versions (النسخ).
-- العدّ قراءةً قبل التطبيق: scripts/db/verify-reading-track.sql. آمن لإعادة التشغيل.
-- restore: update leaders.stage_requirements r set config = b.config, help_ar = b.help_ar from leaders.backup_20261129_reading_track b where b.id = r.id; update leaders.program_versions v set data = b.data from leaders.backup_20261129_reading_track_versions b where b.version_id = v.id

create table if not exists leaders.backup_20261129_reading_track as
  select id, config, help_ar from leaders.stage_requirements where false;
alter table leaders.backup_20261129_reading_track enable row level security;
revoke all on leaders.backup_20261129_reading_track from anon, authenticated;
create table if not exists leaders.backup_20261129_reading_track_versions as
  select id as version_id, data from leaders.program_versions where false;
alter table leaders.backup_20261129_reading_track_versions enable row level security;
revoke all on leaders.backup_20261129_reading_track_versions from anon, authenticated;

do $rt$
declare
  h_old text := 'اقرأ أبواب كتابك كاملة وأجب عن أسئلة كل باب. يُحتسب الباب حين تقرؤه فعلًا لا حين تتصفحه.';
  h_new text := 'اقرأ أبواب محور مسارك وأول باب من كل إطار، وأجب عن أسئلة كل باب. بقية الأبواب متاحة لك اختياريًا. يُحتسب الباب حين تقرؤه فعلًا لا حين تتصفحه.';
  n int;
begin
  insert into leaders.backup_20261129_reading_track (id, config, help_ar)
    select id, config, help_ar from leaders.stage_requirements
     where code = 'T-HB' and kind = 'reading' and config = '{"scope": "all", "quiz": true}'::jsonb
       and id not in (select b.id from leaders.backup_20261129_reading_track b);
  update leaders.stage_requirements
     set config = '{"scope": "track", "quiz": true}'::jsonb,
         help_ar = case when help_ar = h_old then h_new else help_ar end
   where code = 'T-HB' and kind = 'reading' and config = '{"scope": "all", "quiz": true}'::jsonb;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'reading track: stage_requirements %', n; end if;

  if to_regclass('leaders.program_versions') is null then return; end if;
  drop table if exists pg_temp.rt_hit;
  create temp table rt_hit on commit drop as
    select v.id from leaders.program_versions v
     where jsonb_typeof(v.data->'requirements') = 'array' and exists (select 1 from jsonb_array_elements(v.data->'requirements') r
       where r->>'code' = 'T-HB' and r->>'kind' = 'reading' and r->'config' = '{"scope": "all", "quiz": true}'::jsonb);
  insert into leaders.backup_20261129_reading_track_versions (version_id, data)
    select v.id, v.data from leaders.program_versions v join rt_hit h on h.id = v.id
     where v.id not in (select b.version_id from leaders.backup_20261129_reading_track_versions b);
  -- تصحيح صريح للقطة بالمنفذ الذي يسمح به program_version_frozen، محصور في هذه المعاملة
  perform set_config('leaders.program_version_fix', 'on', true);
  update leaders.program_versions v set data = jsonb_set(v.data, '{requirements}', (
      select coalesce(jsonb_agg(case
        when r->>'code' = 'T-HB' and r->>'kind' = 'reading' and r->'config' = '{"scope": "all", "quiz": true}'::jsonb
          then jsonb_set(jsonb_set(r, '{config}', '{"scope": "track", "quiz": true}'::jsonb), '{help_ar}',
            to_jsonb(case when r->>'help_ar' = h_old then h_new else coalesce(r->>'help_ar', '') end))
        else r end order by o), '[]'::jsonb)
      from jsonb_array_elements(v.data->'requirements') with ordinality e(r, o)))
   where v.id in (select id from rt_hit);
  perform set_config('leaders.program_version_fix', '', true);
  select count(*) into n from rt_hit;
  if n > 0 then raise notice 'reading track: program_versions %', n; end if;
end $rt$;

insert into leaders.schema_migrations (name) values ('20261129220000_leaders_reading_track') on conflict do nothing;
