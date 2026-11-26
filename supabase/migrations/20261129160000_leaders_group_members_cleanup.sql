-- deploy-gate: deferred بقرار المالك (تصور المرحلة 1، القرار 2): يُطبَّق بعد عرض العد من scripts/db/verify-group-members-cleanup.sql قراءةً
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 1، البند 1 (1ب): تنظيف عضويات المجموعات العالقة بعد نقل المشارك
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-1-إصلاحات-المراجعة-العاجلة-v1.md §5 البند 1 (اعتمده المالك 2026-11-26).
-- نقل المشارك (cohortEnroll) كان يسحب تسجيلاته الأخرى ولا يمس cohort_group_members ولا cohort_roles، فبقي خبير مجموعته
-- القديمة يراه. الدوال صارت تحذف الصفين عند النقل وتستبعد العالق دفاعيًا (currentGroupLinks)، وهذا الترحيل ينظف ما بقي.
-- العالق: صف لعضو له تسجيل غير منسحب في دفعة أخرى قائمة، ولا تسجيل غير منسحب له في دفعة الصف. دفعته الفعلية (pickCohort)
-- تقع إذن على تسجيله الآخر يقينًا. عضو دفعة الجهة بالتبعية بلا تسجيل صريح عضو حقيقي فلا يُمس.
-- قبل الحذف: نسخة في backup_20261129_group_members_cleanup (تُمحى مع حذف المشارك بمفتاحها الأجنبي)، وسطر في audit_log
-- بالعدد والقائمة. الدوال لا تعتمد عليه (الفلتر الدفاعي يحجب العالق قبله)، وآمن لإعادة التشغيل.

-- restore: insert into leaders.cohort_group_members (cohort_id, participant_id, group_id, created_at) select b.cohort_id, b.participant_id, b.group_id, b.created_at from leaders.backup_20261129_group_members_cleanup b join leaders.cohort_groups g on g.id = b.group_id on conflict do nothing
create table if not exists leaders.backup_20261129_group_members_cleanup as
  select m.cohort_id, m.participant_id, m.group_id, m.created_at, now() as backed_up_at
    from leaders.cohort_group_members m
   where not exists (select 1 from leaders.enrollments e where e.participant_id = m.participant_id and e.cohort_id = m.cohort_id and e.status <> 'withdrawn')
     and exists (select 1 from leaders.enrollments e join leaders.cohorts c on c.id = e.cohort_id
                  where e.participant_id = m.participant_id and e.cohort_id <> m.cohort_id and e.status <> 'withdrawn');
alter table leaders.backup_20261129_group_members_cleanup enable row level security;
revoke all on leaders.backup_20261129_group_members_cleanup from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'backup_20261129_group_members_cleanup_participant_fk') then
    alter table leaders.backup_20261129_group_members_cleanup add constraint backup_20261129_group_members_cleanup_participant_fk
      foreign key (participant_id) references leaders.participants(id) on delete cascade;
  end if;
end $$;

-- إعادة التشغيل: ما عَلِق بعد التشغيل الأول يُنسخ قبل حذفه أيضًا
insert into leaders.backup_20261129_group_members_cleanup (cohort_id, participant_id, group_id, created_at, backed_up_at)
  select m.cohort_id, m.participant_id, m.group_id, m.created_at, now()
    from leaders.cohort_group_members m
   where not exists (select 1 from leaders.enrollments e where e.participant_id = m.participant_id and e.cohort_id = m.cohort_id and e.status <> 'withdrawn')
     and exists (select 1 from leaders.enrollments e join leaders.cohorts c on c.id = e.cohort_id
                  where e.participant_id = m.participant_id and e.cohort_id <> m.cohort_id and e.status <> 'withdrawn')
     and not exists (select 1 from leaders.backup_20261129_group_members_cleanup b where b.cohort_id = m.cohort_id and b.participant_id = m.participant_id);

-- العدد والقائمة في السجل قبل الحذف، وسطر واحد فقط حين يوجد ما يُحذف
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
  select 'system', 'migration', 'group_members.cleanup', 'cohort_group_members', null,
         jsonb_agg(jsonb_build_object('cohort_id', m.cohort_id, 'participant_id', m.participant_id, 'group_id', m.group_id)),
         jsonb_build_object('deleted', count(*), 'migration', '20261129160000_leaders_group_members_cleanup')
    from leaders.cohort_group_members m
    join leaders.backup_20261129_group_members_cleanup b on b.cohort_id = m.cohort_id and b.participant_id = m.participant_id
  having count(*) > 0;

delete from leaders.cohort_group_members m
 using leaders.backup_20261129_group_members_cleanup b
 where b.cohort_id = m.cohort_id and b.participant_id = m.participant_id
   and not exists (select 1 from leaders.enrollments e where e.participant_id = m.participant_id and e.cohort_id = m.cohort_id and e.status <> 'withdrawn');

insert into leaders.schema_migrations (name) values ('20261129160000_leaders_group_members_cleanup') on conflict do nothing;
