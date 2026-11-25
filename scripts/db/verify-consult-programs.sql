-- «الاستشارة خدمة» (docs/content/2026-11-24-تصور-البرامج-والرحلة-والجلسات-v1.md، المرحلة 2): فحص ما قبل الترحيل
-- 20261128150000_leaders_consult_service.sql. قراءة فقط: لا يكتب شيئًا. يُشغَّل بسير migrate.yml في الوضع verify.
-- كل فحص يرجع صفًا واحدًا (ok، detail) كما يقرؤه scripts/db/apply-migration.mjs --verify.
-- وفحوص ما بعد الترحيل في verify-consult-service-after.sql (تقرأ جدول service_unlocks الذي ينشئه الترحيل).

-- 1) كل برنامج: الاستشارة في المسودة (الصفوف الحية) مرحلة أم خدمة، وبنودها الإلزامية، وما يمنع تحويلها (القياس البعدي)
select true as ok, coalesce(string_agg(
         p.name || ': ' || case when s.rules->>'lane' = 'service' then 'خدمة' else 'مرحلة' end
         || ' · إلزامي=' || (select count(*) from leaders.stage_requirements r where r.program_id = s.program_id and r.stage_key = 'consulting' and r.active is not false and r.required)
         || case when exists (select 1 from leaders.stage_requirements e where e.program_id = s.program_id and e.stage_key = 'consulting' and e.code = 'E-POST' and e.active is not false) then ' · فيه E-POST (يُترك)' else '' end
         || ' · نسخ=' || (select count(*) from leaders.program_versions v where v.program_id = s.program_id),
       ' | ' order by p.name), 'لا برنامج فيه consulting') as detail
  from leaders.journey_stages s join leaders.programs p on p.id = s.program_id
 where s.key = 'consulting';

-- 2) النسخ المجمدة: لا يمسها الترحيل. عدد الدفعات المثبتة على كل نسخة فيها الاستشارة
select true as ok, coalesce(string_agg(p.name || ' v' || v.number || ': دفعات=' || (select count(*) from leaders.cohorts c where c.program_version_id = v.id), ' | ' order by p.name, v.number), 'لا نسخ') as detail
  from leaders.program_versions v join leaders.programs p on p.id = v.program_id
 where exists (select 1 from jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) x where x->>'key' = 'consulting');

-- 3) التعرض للصفوف الحية: مشاركون (غير تجريبيين) يقرؤون البرنامج الحي لا نسخة مجمدة، فيصلهم التحويل فور التطبيق.
-- ok = صفر. غير الصفر يُعرض على المالك قبل التطبيق
with exposed as (
  select p.name as program,
         count(distinct pa.id) filter (where e.cohort_id is null) as no_cohort,
         count(distinct pa.id) filter (where e.cohort_id is not null and c.program_version_id is null) as unpinned
    from leaders.programs p
    join leaders.journey_stages s on s.program_id = p.id and s.key = 'consulting' and coalesce(s.rules->>'lane', 'stage') <> 'service'
    cross join leaders.participants pa
    left join leaders.enrollments e on e.participant_id = pa.id
    left join leaders.cohorts c on c.id = e.cohort_id
   where coalesce(pa.is_demo, false) = false
     and ((e.cohort_id is null and p.is_default) or (c.program_id = p.id and c.program_version_id is null))
   group by p.name)
select coalesce(sum(no_cohort + unpinned), 0) = 0 as ok,
       coalesce(string_agg(program || ': بلا دفعة=' || no_cohort || ' · دفعة غير مثبتة=' || unpinned, ' | ' order by program), 'لا أحد على الصفوف الحية') as detail
  from exposed;
