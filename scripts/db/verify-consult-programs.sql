-- «الاستشارة خدمة» (docs/content/2026-11-24-تصور-البرامج-والرحلة-والجلسات-v1.md، المرحلة 2، §4.4 و§6.2): تقرير ما قبل الترحيل
-- 20261128150000_leaders_consult_service.sql وما بعده. قراءة فقط: لا يكتب شيئًا.
-- يُشغَّل بسير migrate.yml في الوضع verify (المسار: scripts/db/verify-consult-programs.sql)، أو يُلصق كل فحص في محرر SQL في Supabase.
-- قبل الترحيل: يسمي البرامج التي فيها consulting مرحلة عادية (سيحولها الترحيل) والتي هي خدمة (يتركها)، وبنودها الإلزامية،
-- والمراحل المعتمدة عليها. بعده: «مرحلة عادية» = 0 إلا ما فيه القياس البعدي (يُترك ويُراجع يدويًا).

-- 1) كل برنامج: مرحلة consulting في المسودة (الصفوف الحية)، طبيعتها وشرط إتاحتها، وما يمنع تحويلها
select p.name as program,
       case when s.rules->>'lane' = 'service' then 'خدمة' else 'مرحلة عادية' end as consulting_is,
       coalesce(s.rules->>'unlock', 'previous') as unlock, s.rules->'any' as any_conditions,
       exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false) as has_post_blocks,
       (select string_agg(r.code || case when r.required then ' (إلزامي)' else '' end, '، ' order by r.sort) from leaders.stage_requirements r
         where r.program_id = s.program_id and r.stage_key = 'consulting' and r.active is not false) as items,
       (select string_agg(o.key || ' ← ' || coalesce(o.rules::text, '{}'), ' | ') from leaders.journey_stages o
         where o.program_id = s.program_id and o.key <> 'consulting'
           and ((o.rules->>'unlock' = 'stages' and o.rules->'after' ? 'consulting') or (o.rules->>'unlock' = 'with' and o.rules->>'with' = 'consulting')
                or o.rules->>'due_before' = 'consulting' or o.rules->>'until' = 'stage:consulting')) as depends_on_consulting,
       (select count(*) from leaders.program_versions v where v.program_id = s.program_id) as frozen_versions,
       (select count(*) from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id where v.program_id = s.program_id) as pinned_cohorts
  from leaders.journey_stages s join leaders.programs p on p.id = s.program_id
 where s.key = 'consulting'
 order by consulting_is desc, p.name;

-- 2) النسخ المجمدة: كيف تقرأ كل نسخة الاستشارة (لا يمسها الترحيل؛ تتغير الرحلة لدفعة بترقيتها إلى نسخة جديدة وحدها)
select p.name as program, v.number as version,
       case when x->'rules'->>'lane' = 'service' then 'خدمة' else 'مرحلة عادية' end as consulting_is,
       (select count(*) from leaders.cohorts c where c.program_version_id = v.id) as cohorts_on_it
  from leaders.program_versions v join leaders.programs p on p.id = v.program_id
  cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) x
 where x->>'key' = 'consulting'
 order by p.name, v.number;

-- 3) بعد الترحيل: سطور السجل، وعدد ما بقي مرحلة عادية في المسودة (المتوقع 0 إلا ما فيه القياس البعدي)
select (select count(*) from leaders.audit_log where action = 'program.consult_service') as audit_rows,
       (select count(*) from leaders.journey_stages s where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service') as still_regular;

-- 4) بعد الترقية: من فُتحت له الخدمة لكل دفعة (service.unlocked) ولماذا
select c.name as cohort, a.after->>'via' as via, count(distinct a.entity_id) as participants
  from leaders.audit_log a join leaders.enrollments e on e.participant_id::text = a.entity_id join leaders.cohorts c on c.id = e.cohort_id
 where a.action = 'service.unlocked'
 group by 1, 2 order by 1, 2;
