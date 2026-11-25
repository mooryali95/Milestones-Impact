-- تحقق الترحيلات 20261128200000 و20261129100000 و20261129110000 و20261129120000 على القاعدة الحية (قراءة فقط)
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده
-- 1) الجداول الجديدة موجودة
select count(*) = 7 as ok, 'موجود ' || count(*) || ' من 7: ' || string_agg(table_name, '، ' order by table_name) as detail
  from information_schema.tables where table_schema = 'leaders' and table_name in
  ('participant_mail_prefs', 'participant_notifications', 'document_checks', 'backup_20261129_track_cards',
   'backup_20261129_track_profiles', 'participant_track_history', 'participant_new_items');
-- 2) الترحيلات الأربعة في السجل
select count(*) = 4 as ok, 'مسجل ' || count(*) || ' من 4' as detail from supabase_migrations.schema_migrations
 where version in ('20261128200000', '20261129100000', '20261129110000', '20261129120000');
-- 3) المسارات الأربعة التي تغير ملفها تشير إلى الملف الجديد
select count(*) = 4 as ok, string_agg(key || ' ← ' || coalesce(profile_key, 'بلا ملف'), '، ' order by key) as detail
  from leaders.tracks where (key, profile_key) in (('M2I3L2', 'leadership-intermediate'), ('M2I3L3', 'impact-advanced'),
  ('M3I2L3', 'leadership-advanced'), ('M3I3L2', 'milestone-advanced'));
-- 4) المتطلبات الجديدة والمختبران
select (select count(distinct code) from leaders.stage_requirements where code in ('O-COST', 'O-EVID', 'L-GOV')) = 3
   and (select count(*) from leaders.lab_items where key in ('baseline-target', 'evidence-ladder')) = 2 as ok,
  'متطلبات ' || (select count(distinct code) from leaders.stage_requirements where code in ('O-COST', 'O-EVID', 'L-GOV')) || ' من 3، مختبرات '
  || (select count(*) from leaders.lab_items where key in ('baseline-target', 'evidence-ladder')) || ' من 2' as detail;
-- 5) المشاركون الحقيقيون في المسارات الأربعة التي تغير ملفها (للعلم، لا يفشل)
with lv as (
  select pl.participant_id,
         'M' || max(case when dimension = 'milestone' then case level when 'beginner' then 1 when 'intermediate' then 2 else 3 end end)
      || 'I' || max(case when dimension = 'impact' then case level when 'beginner' then 1 when 'intermediate' then 2 else 3 end end)
      || 'L' || max(case when dimension = 'leadership' then case level when 'beginner' then 1 when 'intermediate' then 2 else 3 end end) as k
    from leaders.placements pl join leaders.participants p on p.id = pl.participant_id
   where not p.is_demo and not p.is_test group by pl.participant_id)
select true as ok, 'المتأثرون ' || count(*) || coalesce(': ' || (select string_agg(k || ' ' || n, '، ' order by k)
    from (select k, count(*) n from lv where k in ('M2I3L2', 'M2I3L3', 'M3I2L3', 'M3I3L2') group by k) x), '') as detail
  from lv where k in ('M2I3L2', 'M2I3L3', 'M3I2L3', 'M3I3L2');
