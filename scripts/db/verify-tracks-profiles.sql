-- تحقق ترحيل 20261101140000 على القاعدة الحية: كل استعلام يعيد 0 صفًا
-- 1) مسار بلا ملف تعريف، أو ملفه لا يطابق محور أولويته ومستواه فيه
select key, profile_key from leaders.tracks t
 where profile_key is distinct from priority_dimension || '-' || case priority_dimension
   when 'milestone' then milestone_level when 'impact' then impact_level else leadership_level end
    or not exists (select 1 from leaders.track_profiles p where p.key = t.profile_key);
-- 2) رحلة مسار تعد بما لا ينفذه النظام، أو تختلف عن رحلة ملفه، أو عنوان إنجليزي فارغ
select t.key from leaders.tracks t join leaders.track_profiles p on p.key = t.profile_key
 where t.journey_ar ~ 'النصيب الأكبر|ورشة|عيادة|حلقة' or t.journey_ar is distinct from p.journey_ar or coalesce(t.title_en, '') = '';
-- 3) نصوص ملفات التعريف بقوالب أو كلمات نطاق
select key from leaders.track_profiles
 where title_ar ~ '(^|\s)(نحو|مسار)(\s|$)' or (title_ar || summary_ar || journey_ar) ~ 'محفظ|المحافظ|برامج|برنامج|على مستوى|ورش|عيادة|حلقة|النصيب الأكبر|جلسات';
-- 4) مختبر بمنحة يدوية غير موقف المحفظة، أو مختبر قبل بابه
select l.key, l.audience from leaders.lab_items l
  left join leaders.handbook_modules h on h.dimension = l.dimension and h.chapter_key = l.chapter_key
  left join leaders.levels a on a.key = l.min_level left join leaders.levels b on b.key = h.min_level
 where (l.audience = 'granted' and l.key <> 'portfolio-review') or a.sort < b.sort;
-- 5) الأثر التأسيسي بأقل من نموذجين في الوثيقة، أو تقرير الأثر خارجها
select 'impact-beginner' k where (select count(*) from leaders.learning_models where dimension = 'impact' and min_level = 'beginner' and active and capstone_sort is not null) < 2
union all select 'impact-report' where not exists (select 1 from leaders.learning_models where key = 'impact-report' and capstone_sort is not null);
