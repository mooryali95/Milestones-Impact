-- «الاستشارة خدمة»: فحص ما بعد ترحيل 20261128150000_leaders_consult_service.sql. قراءة فقط.
-- يُشغَّل بسير migrate.yml في الوضع verify بعد التطبيق. كل فحص يرجع (ok، detail).

-- 1) سطور السجل، وما بقي مرحلة عادية في المسودة (المتوقع 0 إلا ما فيه القياس البعدي)
select (select count(*) from leaders.journey_stages s where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
          and not exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false)) = 0 as ok,
       'سجل=' || (select count(*) from leaders.audit_log where action = 'program.consult_service')
       || ' · بقي مرحلة=' || (select count(*) from leaders.journey_stages s where s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
          and not exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false)) as detail;

-- 2) من فُتحت له الخدمة لكل دفعة ولماذا
select true as ok, coalesce(string_agg(cohort || ' · ' || via || '=' || n, ' | ' order by cohort, via), 'لم تُفتح لأحد بعد') as detail
  from (select coalesce(c.name, 'بلا دفعة') as cohort, u.via, count(distinct u.participant_id) as n
          from leaders.service_unlocks u left join leaders.enrollments e on e.participant_id = u.participant_id left join leaders.cohorts c on c.id = e.cohort_id
         group by 1, 2) s;
