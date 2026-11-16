-- ════════════════════════════════════════════════════════════════
-- اسم المنتج «كتاب القائد» بدل «كتيب القائد» في نصوص الرحلة والمسارات والمختبر (قرار المالك 2026-11-16)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant نصوص عرض وحدها، والدوال والواجهات تعمل قبله وبعده (يبقى الاسم القديم في هذه النصوص حتى يُطبَّق)
-- يستبدل «كتيب» بـ«كتاب» بكل صيغها (الكتيب، كتيبك، بالكتيب...) في الحقول التي فحصها scripts/db/verify-handbook-name.sql
-- على الإنتاج قبله: journey_stages وstage_requirements وtracks وtrack_profiles وlab_items.
-- لا يمس سجلات التاريخ ولا نصوص المستخدمين (audit_log، والتعليقات، والإجابات، ورسائل المساعد)، ولا نسخ البرامج المجمدة
-- (program_versions: نسخة دفعة جارية تبقى كما اعتُمدت). النسخة السابقة لكل صف تغيّر في backup_20261116_handbook_name
-- (id: مفتاح الصف، ولمراحل الرحلة program_id:key).
-- آمن لإعادة التشغيل: الصف الذي لا «كتيب» فيه لا يُمس، والنسخة الاحتياطية لا تُكتب مرتين.
create table if not exists leaders.backup_20261116_handbook_name (tbl text not null, id text not null, col text not null, before text not null, primary key (tbl, id, col));
alter table leaders.backup_20261116_handbook_name enable row level security;
revoke all on leaders.backup_20261116_handbook_name from anon, authenticated;

do $hn$
declare
  t record;
  n int;
begin
  for t in select * from (values
    ('journey_stages', $k$program_id::text || ':' || key$k$, 'activities_ar'), ('journey_stages', $k$program_id::text || ':' || key$k$, 'builds_on_ar'),
    ('journey_stages', $k$program_id::text || ':' || key$k$, 'outcome_ar'), ('journey_stages', $k$program_id::text || ':' || key$k$, 'description_ar'),
    ('journey_stages', $k$program_id::text || ':' || key$k$, 'title_ar'),
    ('stage_requirements', 'id::text', 'help_ar'), ('stage_requirements', 'id::text', 'title_ar'),
    ('tracks', 'key', 'journey_ar'), ('tracks', 'key', 'summary_ar'), ('track_profiles', 'key', 'journey_ar'), ('track_profiles', 'key', 'summary_ar'),
    ('lab_items', 'key', 'spec')
  ) as v(tbl, pk, col) loop
    -- العمود قد يغيب في بيئة أقدم: يُتخطى ولا يُسقط الترحيل
    if not exists (select 1 from information_schema.columns where table_schema = 'leaders' and table_name = t.tbl and column_name = t.col) then continue; end if;
    execute format('insert into leaders.backup_20261116_handbook_name (tbl, id, col, before)
      select %L, %s, %L, %I::text from leaders.%I where %I::text like %L on conflict do nothing',
      t.tbl, t.pk, t.col, t.col, t.tbl, t.col, '%كتيب%');
    if (select data_type from information_schema.columns where table_schema = 'leaders' and table_name = t.tbl and column_name = t.col) = 'jsonb' then
      execute format('update leaders.%I set %I = replace(%I::text, %L, %L)::jsonb where %I::text like %L', t.tbl, t.col, t.col, 'كتيب', 'كتاب', t.col, '%كتيب%');
    else
      execute format('update leaders.%I set %I = replace(%I, %L, %L) where %I like %L', t.tbl, t.col, t.col, 'كتيب', 'كتاب', t.col, '%كتيب%');
    end if;
    get diagnostics n = row_count;
    if n > 0 then raise notice 'handbook name: %.% صفوف %', t.tbl, t.col, n; end if;
  end loop;
end
$hn$;

insert into leaders.schema_migrations (name) values ('20261116050000_leaders_handbook_name') on conflict do nothing;
