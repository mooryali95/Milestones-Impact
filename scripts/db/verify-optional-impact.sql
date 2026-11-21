-- أثر قاعدة «الاختياري لا يُحسب» (قرار المالك 2026-11-21) على البيانات القائمة، بالأرقام. قراءة فقط، ولا يغيّر شيئًا.
-- يُشغَّل قبل نشر القاعدة بسير migrate.yml في الوضع verify وملفه scripts/db/verify-optional-impact.sql، أو محليًا:
--   SUPABASE_ACCESS_TOKEN=... node scripts/db/apply-migration.mjs --verify scripts/db/verify-optional-impact.sql
-- القاعدة (supabase/functions/leaders-api/optional.js): النشاط الاختياري (required = false) والورشة الاختيارية خارج كل
-- عدّ. قبلها كان النشاط الاختياري يدخل مقام نسبة التقدم، ويكمل مرحلة «بأي متطلب»، ويحبس استبانة مرحلته حتى أول حضور.
-- المصدر كما تقرؤه الرحلة: متطلبات نسخة البرنامج المثبتة لكل دفعة غير مغلقة، بلا ما أخفته الدفعة. وعضو الدفعة بقاعدة
-- pickCohort (إلحاقه الأحدث غير المنسحب، ثم أحدث دفعة مفتوحة أو جارية لجهته، ثم الدفعة الافتراضية)، بلا حساب العرض ولا
-- حساب الاختبار ولا المنسحب والموقوف.
-- حدود معروفة: اكتمال الأنشطة الموثقة (قراءة، مشاهدة، حضور، توجيه، منهج، نموذج) يُحسب من دليلها لا من صف تقدم، فالفحص 3
-- يعدّ ما اكتمل بصف تقدم وحده ويسمي ما يحتاج مراجعة باليد. والمرحلة الموقوفة في خطة دفعة تُعد هنا كغيرها.
-- ✓ = لا يحتاج قرارًا. ✗ في الفحص 3 أو 6 = مشاركون تتغير مرحلتهم بنشر القاعدة: يُراجعون قبل النشر.

-- 1) الأنشطة الاختيارية في رحلات الدفعات غير المغلقة
with defs as (
  select c.id as cohort_id, c.name as cohort, r->>'id' as req_id, r->>'kind' as kind
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'requirements') r
   where c.status <> 'closed' and coalesce((r->>'active')::boolean, true) and coalesce((r->>'required')::boolean, true) = false
     and not (r->>'code' = any (c.hidden_requirements))
), kinds as (
  select kind, count(distinct req_id) as n from defs group by kind
)
select true as ok,
       (select count(distinct req_id) from defs) || ' نشاطًا اختياريًا في ' || (select count(distinct cohort_id) from defs) || ' دفعة غير مغلقة'
         || coalesce(' (بالنوع: ' || (select string_agg(kind || ' ' || n, '، ' order by n desc, kind) from kinds) || ')', '')
         || '. ودفعات غير مغلقة بلا نسخة مثبتة (خارج هذه الفحوص): '
         || (select count(*) from leaders.cohorts where status <> 'closed' and program_version_id is null) as detail;

-- 2) نسبة التقدم: من ترتفع نسبته لأن الاختياري خرج من المقام
with defs as (
  select c.id as cohort_id, c.name as cohort, r->>'stage_key' as stage_key, coalesce((r->>'required')::boolean, true) as required
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'requirements') r
   where c.status <> 'closed' and coalesce((r->>'active')::boolean, true) and not (r->>'code' = any (c.hidden_requirements))
), stages as (
  select cohort_id, cohort, stage_key, count(*) filter (where required) as req, count(*) filter (where not required) as opt
    from defs group by 1, 2, 3 having count(*) filter (where not required) > 0
), members as (
  select p.id, coalesce(
      (select e.cohort_id from leaders.enrollments e where e.participant_id = p.id and e.status <> 'withdrawn' order by e.created_at desc limit 1),
      (select c.id from leaders.cohorts c where p.organization_id is not null and c.organization_id = p.organization_id and not c.is_default and c.status in ('open', 'running')
        order by coalesce(c.starts_on::text, c.created_at::text) desc limit 1),
      (select c.id from leaders.cohorts c where c.is_default limit 1)) as cohort_id
    from leaders.participants p
   where not p.is_demo and not coalesce((to_jsonb(p)->>'is_test')::boolean, false) and p.status not in ('withdrawn', 'suspended')
)
select true as ok,
       (select count(*) from stages) || ' مرحلة فيها نشاط اختياري، في دفعات فيها '
         || (select count(*) from members m where m.cohort_id in (select cohort_id from stages)) || ' مشاركًا. من يقف منهم في مرحلة منها ترتفع نسبته (المقام يصير بنودها الإلزامية وحدها)، ومن أتمها أو لم يبلغها لا تتغير نسبته'
         || coalesce('. المراحل: ' || (select string_agg(cohort || ' ← ' || stage_key || ' (' || req || ' إلزامي و' || opt || ' اختياري)', ' | ' order by cohort, stage_key) from stages), '') as detail;

-- 3) اكتمال «بأي متطلب»: من اكتملت مرحلته ببند اختياري وحده، فتعود غير مكتملة
with st as (
  select c.id as cohort_id, c.name as cohort, c.hidden_requirements, v.data, s->>'key' as stage_key, coalesce(s->>'title_ar', s->>'key') as title
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'stages') s
   where c.status <> 'closed' and coalesce((s->>'active')::boolean, true) and s->'rules'->>'complete' = 'any'
), items as (
  select st.cohort_id, st.cohort, st.stage_key, st.title, (r->>'id')::uuid as req_id, r->>'kind' as kind, coalesce((r->>'required')::boolean, true) as required
    from st cross join lateral jsonb_array_elements(st.data->'requirements') r
   where r->>'stage_key' = st.stage_key and coalesce((r->>'active')::boolean, true) and not (r->>'code' = any (st.hidden_requirements))
), members as (
  select p.id, coalesce(
      (select e.cohort_id from leaders.enrollments e where e.participant_id = p.id and e.status <> 'withdrawn' order by e.created_at desc limit 1),
      (select c.id from leaders.cohorts c where p.organization_id is not null and c.organization_id = p.organization_id and not c.is_default and c.status in ('open', 'running')
        order by coalesce(c.starts_on::text, c.created_at::text) desc limit 1),
      (select c.id from leaders.cohorts c where c.is_default limit 1)) as cohort_id
    from leaders.participants p
   where not p.is_demo and not coalesce((to_jsonb(p)->>'is_test')::boolean, false) and p.status not in ('withdrawn', 'suspended')
), done as (
  select m.id as participant_id, i.cohort_id, i.stage_key, bool_or(i.required) as by_required, bool_or(not i.required) as by_optional
    from members m join items i on i.cohort_id = m.cohort_id
    join leaders.participant_requirements pr on pr.participant_id = m.id and pr.requirement_id = i.req_id and pr.status = 'done'
   group by 1, 2, 3
), hit as (
  select * from done where by_optional and not by_required
), manual as (
  select count(distinct (cohort_id, stage_key)) as n from items where not required and kind in ('reading', 'video', 'workshop', 'coaching', 'curriculum', 'model', 'capstone', 'lab')
)
select (select count(*) from hit) = 0 as ok,
       (select count(distinct (cohort_id, stage_key)) from items where not required) || ' مرحلة تكتمل «بأي متطلب» وفيها نشاط اختياري. '
         || (select count(*) from hit) || ' مشاركًا اكتملت مرحلته ببند اختياري وحده (بصف تقدم)، فتعود غير مكتملة بالقاعدة'
         || coalesce(': ' || (select string_agg(n || ' في ' || cohort || ' ← ' || title, '، ') from (select count(*) as n, i.cohort, i.title from hit h join (select distinct cohort_id, cohort, stage_key, title from items) i using (cohort_id, stage_key) group by 2, 3) x), '')
         || '. ومراحل منها نشاطها الاختياري موثق بدليل (يُراجع باليد): ' || (select n from manual) as detail;

-- 4) بوابة الاستبانة: مراحل كانت استبانتها تنتظر حضور نشاط ورشة اختياري، فتُفتح بلا انتظار
with defs as (
  select c.id as cohort_id, c.name as cohort, r->>'stage_key' as stage_key, r->>'kind' as kind, coalesce((r->>'required')::boolean, true) as required
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'requirements') r
   where c.status <> 'closed' and coalesce((r->>'active')::boolean, true) and not (r->>'code' = any (c.hidden_requirements))
), gated as (
  select cohort_id, cohort, stage_key from defs group by 1, 2, 3
  having bool_or(kind = 'survey') and bool_or(kind = 'workshop' and not required) and not bool_or(kind = 'workshop' and required)
)
select true as ok,
       (select count(*) from gated) || ' مرحلة استبانتها كانت تنتظر حضور ورشة اختيارية وحدها، فتُفتح لأعضائها بلا انتظار'
         || coalesce(': ' || (select string_agg(cohort || ' ← ' || stage_key, ' | ' order by cohort, stage_key) from gated), '') as detail;

-- 5) «ماذا تغيّر» والملخص الأسبوعي والتذكير: ما أُنجز من أنشطة اختيارية في 30 يومًا لا يُعد بعد القاعدة
with opt as (
  select distinct (r->>'id')::uuid as req_id
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'requirements') r
   where c.status <> 'closed' and coalesce((r->>'active')::boolean, true) and coalesce((r->>'required')::boolean, true) = false
), rows as (
  select pr.participant_id from leaders.participant_requirements pr join opt on opt.req_id = pr.requirement_id
    join leaders.participants p on p.id = pr.participant_id and not p.is_demo
   where pr.status = 'done' and pr.completed_at > now() - interval '30 days'
)
select true as ok,
       (select count(*) from rows) || ' إنجازًا لنشاط اختياري من ' || (select count(distinct participant_id) from rows)
         || ' مشاركًا في 30 يومًا: تخرج من سطر «أنجزوا نشاطًا» ومن «أنجز N من M» في بريد التذكير. لا يُحذف منها شيء' as detail;

-- 6) الورش: جلسات أنشطة الحضور الاختيارية وحضورها (تخرج من «حضر N من M» ومن نسب الحضور)، والورش الموسومة اختيارية
with opt as (
  select distinct (r->>'id')::uuid as req_id
    from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(v.data->'requirements') r
   where c.status <> 'closed' and coalesce((r->>'active')::boolean, true) and r->>'kind' = 'workshop' and coalesce((r->>'required')::boolean, true) = false
), ses as (
  select w.id, coalesce((to_jsonb(w)->>'optional')::boolean, false) as flagged, (w.requirement_id in (select req_id from opt)) as in_optional
    from leaders.workshop_sessions w where w.active
), att as (
  select count(*) as n, count(distinct a.participant_id) as people
    from leaders.workshop_attendance a join ses on ses.id = a.session_id join leaders.participants p on p.id = a.participant_id and not p.is_demo
   where ses.in_optional or ses.flagged
)
select (select count(*) from ses where flagged) = 0 as ok,
       (select count(*) from ses where in_optional) || ' جلسة قائمة في أنشطة حضور اختيارية، و' || (select count(*) from ses where flagged) || ' ورشة موسومة اختيارية (المتوقع صفر قبل أول استعمال للوسم). '
         || (select n from att) || ' حضورًا من ' || (select people from att) || ' مشاركًا فيها يبقى مسجلًا ومعروضًا، ويخرج من العدّ' as detail;

-- 7) الشهادات: صفوف صادرة لا تُعاد من الرحلة، فلا تُمس بالقاعدة
select true as ok,
       (select count(*) from leaders.certificates where status = 'valid') || ' شهادة سارية: لا تُسحب ولا تُعلَّق بالقاعدة ولا بتغيير وسم ورشة. الشهادة تصدر باعتماد التقييم الختامي وتُعلَّق بإعادة فتحه أو بالاسترداد وحدهما' as detail;
