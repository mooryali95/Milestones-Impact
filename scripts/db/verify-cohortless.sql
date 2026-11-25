-- «الدفعة هي الوحدة الوحيدة» (ترحيل 20261128160000_leaders_cohort_intake): معاينة إلحاق من لا دفعة له قبل تشغيل أداة الإدارة
-- (admin.cohortless-plan ثم admin.cohortless-apply ببصمة الخطة). قراءة فقط: لا يكتب شيئًا. يُشغَّل بسير migrate.yml في الوضع verify.
-- كل فحص يرجع صفًا واحدًا (ok، detail) كما يقرؤه scripts/db/apply-migration.mjs --verify.
-- يعمل قبل الترحيل وبعده: is_intake يُقرأ من to_jsonb(c) فلا يُفشل غيابُه الاستعلام.
-- «حقيقي» = غير تجريبي (is_demo)، كما في أداة الإلحاق. «بلا دفعة» = لا إلحاق قائم (غير منسحب) في enrollments.

-- 1) الترحيل: هل أعمدته ودالته موجودة (معلومة؛ الأداة ترد not_migrated قبله)
select true as ok,
       'is_intake=' || exists (select 1 from information_schema.columns where table_schema = 'leaders' and table_name = 'cohorts' and column_name = 'is_intake')
       || ' · sponsor_codes.cohort_id=' || exists (select 1 from information_schema.columns where table_schema = 'leaders' and table_name = 'sponsor_codes' and column_name = 'cohort_id')
       || ' · place_participant=' || exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'leaders' and p.proname = 'place_participant') as detail;

-- 2) العدد: من لا دفعة له من الحقيقيين، بجهة وبلا جهة (معلومة)
with lone as (
  select pa.* from leaders.participants pa
   where coalesce(pa.is_demo, false) = false
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn'))
select true as ok,
       'بلا دفعة=' || count(*) || ' · بجهة=' || count(*) filter (where organization_id is not null)
       || ' · بلا جهة (المنصة العامة)=' || count(*) filter (where organization_id is null)
       || ' · منهم حسابات اختبار=' || count(*) filter (where coalesce(is_test, false)) as detail
  from lone;

-- 3) المعاينة: كل مشارك بلا دفعة ودفعته المستهدفة (استقبال جهته القائمة أو التي ستُنشأ، أو المنصة العامة)
with lone as (
  select pa.id, pa.full_name, pa.organization_id from leaders.participants pa
   where coalesce(pa.is_demo, false) = false
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')),
intake as (
  select c.organization_id, c.name from leaders.cohorts c where coalesce((to_jsonb(c)->>'is_intake')::boolean, false)),
-- دفعة الجهة الجارية كما في place_participant وpickCohort: أحدث مفتوحة أو جارية، لا العامة ولا الاستقبال
cur as (
  select distinct on (c.organization_id) c.organization_id, c.id, c.name from leaders.cohorts c
   where c.organization_id is not null and not c.is_default and not coalesce((to_jsonb(c)->>'is_intake')::boolean, false) and c.status in ('open', 'running')
   order by c.organization_id, coalesce(c.starts_on::timestamptz, c.created_at) desc),
platform as (select c.name from leaders.cohorts c where c.is_default limit 1)
select true as ok, coalesce(string_agg(
         l.full_name || ' → ' || case
           when l.organization_id is null then coalesce((select name from platform), 'المنصة العامة (تُنشأ)')
           else coalesce(cu.name || ' (دفعة الجهة الجارية)', i.name, o.name || ' · الاستقبال (تُنشأ)') end,
         ' | ' order by o.name nulls last, l.full_name), 'لا أحد بلا دفعة') as detail
  from lone l
  left join leaders.organizations o on o.id = l.organization_id
  left join intake i on i.organization_id = l.organization_id
  left join cur cu on cu.organization_id = l.organization_id;

-- 4) لكل جهة: من سيُلحق بها، ووجهتهم (دفعة الجهة الجارية إن وُجدت، وإلا الاستقبال) وسعتها. ok = لا جهة يتجاوز القادمون إليها سعة وجهتها الباقية
-- (من يتجاوز يبقى في المنصة العامة ويظهر في قائمة انتظار جهته، فلا خطأ، لكنه يُراجع قبل التطبيق)
with lone as (
  select pa.organization_id from leaders.participants pa
   where coalesce(pa.is_demo, false) = false and pa.organization_id is not null
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')),
per as (
  select o.id, o.name, o.status, count(*) as incoming,
         coalesce(
           (select c.id from leaders.cohorts c where c.organization_id = o.id and not c.is_default and not coalesce((to_jsonb(c)->>'is_intake')::boolean, false)
               and c.status in ('open', 'running') order by coalesce(c.starts_on::timestamptz, c.created_at) desc limit 1),
           (select c.id from leaders.cohorts c where c.organization_id = o.id and coalesce((to_jsonb(c)->>'is_intake')::boolean, false))) as intake_id
    from lone l join leaders.organizations o on o.id = l.organization_id group by o.id, o.name, o.status),
cap as (
  select per.*, c.capacity, c.status as intake_status, c.name as target_name,
         (select count(*) from leaders.enrollments e where e.cohort_id = per.intake_id and e.status <> 'withdrawn') as taken
    from per left join leaders.cohorts c on c.id = per.intake_id)
select coalesce(bool_and(status <> 'inactive' and coalesce(intake_status, 'open') <> 'closed' and (capacity is null or incoming <= capacity - taken)), true) as ok,
       coalesce(string_agg(name || ': قادمون=' || incoming
         || case when intake_id is null then ' · الاستقبال يُنشأ' else ' · إلى «' || target_name || '» ' || intake_status || ' · السعة=' || coalesce(capacity::text, 'بلا حد') || ' · فيها=' || taken end
         || case when status = 'inactive' then ' · الجهة موقوفة: إلى المنصة العامة' else '' end,
         ' | ' order by name), 'لا جهة') as detail
  from cap;

-- 5) المنصة العامة (الدفعة المفتوحة is_default): موجودة ومثبتة على نسخة، أو غائبة فتُنشأ مثبتة. ok = ليست موجودة غير مثبتة
select coalesce(bool_and(c.program_version_id is not null), true) as ok,
       coalesce(string_agg(c.name || ' · ' || c.status || ' · ' || case when c.program_version_id is null then 'غير مثبتة على نسخة: ثبّتها من ملفها قبل التطبيق'
         else 'مثبتة على v' || (select v.number from leaders.program_versions v where v.id = c.program_version_id) end, ' | '), 'غائبة: تُنشأ عند أول إلحاق') as detail
  from leaders.cohorts c where c.is_default;

-- 6) البرامج التي ستُنشأ عليها دفعات: لها نسخة (بلا نسخة لا تُنشأ دفعة ويبقى المشارك بلا دفعة). ok = للبرنامج الافتراضي نسخة
select exists (select 1 from leaders.program_versions v join leaders.programs p on p.id = v.program_id where p.is_default) as ok,
       coalesce((select p.name || ': أحدث نسخة v' || max(v.number) from leaders.programs p left join leaders.program_versions v on v.program_id = p.id where p.is_default group by p.name), 'لا برنامج افتراضي') as detail;

-- 7) لا مشارك في دفعتين: إلحاقان قائمان أو أكثر للمشارك نفسه. ok = صفر
select count(*) = 0 as ok, 'مشاركون بأكثر من إلحاق قائم=' || count(*) as detail
  from (select e.participant_id from leaders.enrollments e where e.status <> 'withdrawn' group by e.participant_id having count(*) > 1) x;
