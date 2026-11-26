-- «مصدر واحد للدفعة الحاكمة» (تصور المرحلة 4، م1): القياس قبل الكتابة. قراءة فقط: لا يكتب شيئًا. يُشغَّل بسير migrate.yml في الوضع verify
-- قبل تطبيق 20261129230000_leaders_single_cohort وبعده. كل فحص يرجع صفًا واحدًا (ok، detail) كما يقرؤه scripts/db/apply-migration.mjs --verify.
-- «بلا دفعة» = لا إلحاق قائم (غير منسحب) في enrollments. حساب العرض (is_demo) دفعته من عموده فلا يُعد في أي فحص.
-- الأسماء الخمسة التي استثناها المالك تُطابق ببصمة الاسم كما في 20261128170000، فلا تُكتب أسماؤها هنا.

-- 1) من لا إلحاق نشط له، بالحالة. ok = لا أحد في «حقيقي قائم» (هم من تلحقهم التعبئة؛ بعد الترحيل يجب أن يكونوا صفرًا)
with lone as (
  select pa.* from leaders.participants pa
   where not pa.is_demo
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')),
k as (
  select case
    when status in ('suspended', 'withdrawn') then 'موقوف أو منسحب'
    when md5(regexp_replace(coalesce(full_name, ''), '^[\s ]+|[\s ]+$', '', 'g')) in ('fabd495fc8a7654531ea1b20e4260a4a', '95f8958a8fbcda02de1a8a5cf8f4f3a9', '34bba4869d4a4a9b23ca3d3b021ffa9b',
           '406c5913519e5427b9a6717e29cf2f12', 'a3b0d8be3bc69a1c348a6f2ec974a3eb') then 'الحسابات الخمسة المسماة'
    when is_test then 'حساب اختبار'
    when created_at >= '2026-11-28' then 'تسجيل بعد 2026-11-28 تعذر إلحاقه'
    else 'حقيقي قائم' end as kind
    from lone)
select count(*) filter (where kind in ('حقيقي قائم', 'تسجيل بعد 2026-11-28 تعذر إلحاقه')) = 0 as ok,
       coalesce(string_agg(kind || '=' || c, ' · ' order by kind), 'لا أحد بلا دفعة') as detail
  from (select kind, count(*) c from k group by kind) x;

-- 2) من له إلحاقان نشطان أو أكثر. ok = صفر (التعبئة تبقي الأحدث وتسحب ما سواه)
select count(*) = 0 as ok, 'مشاركون بأكثر من إلحاق قائم=' || count(*) as detail
  from (select e.participant_id from leaders.enrollments e where e.status <> 'withdrawn' group by e.participant_id having count(*) > 1) x;

-- 3) من إلحاقه النشط في دفعة جهة غير جهته (الدفعة العامة لا تُعد تعارضًا). ok = صفر؛ نقل الجهة بعد م4 ينقل الدفعة معها
select count(*) = 0 as ok, 'ملحقون بدفعة جهة أخرى=' || count(*)
       || coalesce(' · ' || string_agg(distinct o.name || ' ← ' || c.name, ' | '), '') as detail
  from leaders.enrollments e
  join leaders.participants pa on pa.id = e.participant_id and not pa.is_demo
  join leaders.cohorts c on c.id = e.cohort_id and c.organization_id is not null and not c.is_default
  left join leaders.organizations o on o.id = pa.organization_id
 where e.status <> 'withdrawn' and c.organization_id is distinct from pa.organization_id;

-- 4) من يحكمه اليوم الاستنتاج بالجهة: بلا إلحاق، ولجهته دفعة مفتوحة أو جارية (غير العامة والاستقبال).
-- ok = صفر من القائمين قبل نشر م3 (الموقوف والمنسحب لا رحلة لهم فيُذكرون ولا يُفشلون الفحص)
select count(*) filter (where pa.status not in ('suspended', 'withdrawn')) = 0 as ok, 'يحكمهم الاستنتاج بالجهة=' || count(*) || ' · منهم قائمون غير موقوفين=' || count(*) filter (where pa.status not in ('suspended', 'withdrawn')) as detail
  from leaders.participants pa
 where not pa.is_demo and pa.organization_id is not null
   and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')
   and exists (select 1 from leaders.cohorts c where c.organization_id = pa.organization_id and not c.is_default
                 and not coalesce((to_jsonb(c)->>'is_intake')::boolean, false) and c.status in ('open', 'running'));

-- 5) الجهات بأكثر من دفعة حالية (مفتوحة أو جارية، ومعها الاستقبال): لها خريطة منسق لكل دفعة بعد م5 (معلومة)
select true as ok, coalesce(string_agg(o.name || '=' || x.n, ' | ' order by o.name), 'لا جهة بأكثر من دفعة حالية') as detail
  from (select organization_id, count(*) n from leaders.cohorts
         where organization_id is not null and not is_default and status in ('open', 'running') group by 1 having count(*) > 1) x
  join leaders.organizations o on o.id = x.organization_id;

-- 6) الدفعات المفتوحة أو الجارية بلا نسخة برنامج: تُثبَّت قبل نشر م6 (الحفظ يمنع فتح دفعة بلا نسخة). ok = صفر
select count(*) = 0 as ok, 'دفعات حية بلا نسخة=' || count(*) || coalesce(' · ' || string_agg(name || ' (' || status || ')', ' | '), '') as detail
  from leaders.cohorts where status in ('open', 'running') and program_version_id is null;

-- 7) الترحيل: الفهرس الفريد الجزئي ودالة النقل (معلومة؛ قبل الترحيل كلاهما false)
select true as ok,
       'enrollments_one_active=' || exists (select 1 from pg_indexes where schemaname = 'leaders' and indexname = 'enrollments_one_active')
       || ' · transfer_participant=' || exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'leaders' and p.proname = 'transfer_participant')
       || ' · 20261129230000=' || exists (select 1 from leaders.schema_migrations where left(name, 14) = '20261129230000') as detail;
