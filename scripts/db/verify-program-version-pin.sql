-- تثبيت نسخ البرامج (ترحيل 20261116110000، #389) على القاعدة الحية. قراءة فقط.
-- يُشغَّل بسير migrate.yml في الوضع verify. شاشة «البرامج والدفعات» تعرض «النسخة N» للدفعة المثبتة و«غير مثبتة» لغيرها
-- (Programs.jsx: version ? `النسخة ${version.number}` : «غير مثبتة»)، فهذه الفحوص تقرأ ما تقرأ منه الشاشة نفسه.

-- 1) لا دفعة بلا نسخة لبرنامج له متطلب فعّال (استعلام التحقق في وصف #389)
select count(*) = 0 as ok,
       case when count(*) = 0 then 'صفر: كل دفعة لبرنامج فيه متطلب فعّال مثبتة على نسخة'
            else count(*) || ' دفعة بلا نسخة: ' || string_agg(c.name, '، ' order by c.name) end as detail
  from leaders.cohorts c
 where c.program_version_id is null
   and exists (select 1 from leaders.stage_requirements r where r.program_id = c.program_id and r.active);

-- 2) ما تعرضه الشاشة: كل دفعة بنسختها، و«غير مثبتة» لكل دفعة بلا نسخة أيًا كان برنامجها
select count(*) filter (where v.id is null) = 0 as ok,
       count(*) || ' دفعة؛ ' || count(*) filter (where v.id is not null) || ' تعرض «النسخة N»، و'
         || count(*) filter (where v.id is null) || ' تعرض «غير مثبتة»'
         || coalesce(' (' || string_agg(c.name, '، ' order by c.name) filter (where v.id is null) || ')', '') as detail
  from leaders.cohorts c
  left join leaders.program_versions v on v.id = c.program_version_id;

-- 3) النسخة المثبتة من برنامج الدفعة نفسه، فلا تعرض الشاشة رقم نسخة لبرنامج آخر
select count(*) = 0 as ok,
       case when count(*) = 0 then 'كل نسخة مثبتة من برنامج دفعتها' else count(*) || ' دفعة على نسخة برنامج آخر' end as detail
  from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id
 where v.program_id <> c.program_id;

-- 4) القائمة كما في الشاشة: الدفعة وبرنامجها ورقم نسختها
select true as ok,
       coalesce(string_agg(c.name || ' ← ' || coalesce(p.name, '؟') || ' · ' || coalesce('النسخة ' || v.number, 'غير مثبتة'), ' | ' order by p.name, c.name), 'لا دفعات') as detail
  from leaders.cohorts c
  left join leaders.programs p on p.id = c.program_id
  left join leaders.program_versions v on v.id = c.program_version_id;
