-- توحيد المصادر، المرحلة الثانية من خطة التحليل الشامل
create table if not exists leaders.backup_20261030_phase2 as
  select 'req' kind, code ref, kind req_kind, title_ar, help_ar, config, active, null::text body from leaders.stage_requirements
  union all select 'stage', key, null, null, null, null, null, coalesce(activities_ar,'') || E'\n||\n' || coalesce(outcome_ar,'') from leaders.journey_stages
  union all select 'track', key, null, null, null, null, null, journey_ar || E'\n||\n' || focus_ar from leaders.tracks
  union all select 'model', key, null, null, null, fields, null, null from leaders.learning_models where key = 'development-plan'
  union all select 'module', chapter_key || '/' || dimension, null, null, null, null, null, reflection_ar || E'\n||\n' || body_md from leaders.handbook_modules where chapter_key = 'labs' and dimension = 'leadership';

-- 1) أعمال لها نموذج في مكتبة النماذج تُبنى فيه لا برفع ملف حر: فصل واحد يُقيَّم ويدخل وثيقة المبادرة
update leaders.stage_requirements set kind = 'model', config = '{"model_key":"direct","accept":"reviewed"}'::jsonb,
  help_ar = 'من نموذج «أداة DIRECT» في مكتبة النماذج، على تحدٍّ حقيقي في مشروعك، ويكتمل حين يقيّمه المستشار.'
 where code = 'L-DIRECT';
update leaders.stage_requirements set kind = 'model', config = '{"model_key":"theory-of-change","accept":"reviewed"}'::jsonb,
  title_ar = 'نظرية التغيير لمشروعك: من المخرجات إلى الأثر',
  help_ar = 'من نموذج «نظرية التغيير» في مكتبة النماذج، ويكتمل حين يقيّمه المستشار.'
 where code = 'O-CHAIN';

-- 2) مؤشرات الأثر جزء من سجل المنافع (خط أساس ومستهدف ومالك لكل منفعة)، فلا يُطلب العمل مرتين
update leaders.stage_requirements set active = false where code = 'O-KPI';
update leaders.stage_requirements set help_ar = 'لنفس المشروع: ثلاث منافع على الأقل، لكل منها مؤشر بخط أساس ومستهدف ومالك من الجهة وتوقيت قياس.'
 where code = 'O-BREG';
update leaders.stage_requirements set help_ar = 'من نموذج «سجل المعالم» في مكتبة النماذج، مطبقًا على مشروعك.' where code = 'O-MREG';
update leaders.stage_requirements set help_ar = 'حدّث نموذج «سجل المنافع» في مكتبة النماذج بالقراءات الفعلية، ثم ارفع تصديره هنا.' where code = 'S-UPDATE';

-- 3) خريطة أصحاب المصلحة: مسودة في التدريب، ثم تحديث في التوجيه القيادي لا إعادة
update leaders.stage_requirements set title_ar = 'رفع خطة التطبيق الأولية (مخرج آخر أيام التدريب)' where code = 'T-PLAN';
update leaders.stage_requirements set title_ar = 'تحديث خريطة أصحاب المصلحة لمشروعك',
  help_ar = 'تبني على مسودة التدريب في نموذج «خريطة أصحاب المصلحة» بمكتبة النماذج، وتكتمل حين يقيّمها المستشار، وهي فصل في وثيقة مبادرتك.'
 where code = 'L-MAP';

-- 4) تقييم 360: عنوانان متمايزان بحسب المستوى
update leaders.stage_requirements set title_ar = 'تقييم 360 درجة مختصر (المدير والزملاء)' where code = 'L-360I';
update leaders.stage_requirements set title_ar = 'تقييم 360 درجة مختصر (المدير والزملاء والفريق)' where code = 'L-360A';

-- 5) خطة التطوير القيادي: جدارتان وهدف قابل للقياس لكل منهما، كما في النموذج والكتيب (التركيز أنجع من التشتت)
update leaders.journey_stages set
  activities_ar = replace(activities_ar, 'بناء خطة تطوير قيادي بثلاثة أهداف قابلة للقياس', 'بناء خطة تطوير قيادي على جدارتين، لكل منهما هدف قابل للقياس'),
  outcome_ar = replace(outcome_ar, 'خطة تطوير قيادي شخصية بثلاثة أهداف قابلة للقياس.', 'خطة تطوير قيادي شخصية على جدارتين، لكل منهما هدف قابل للقياس.')
 where key = 'leadership_coaching';
update leaders.stage_requirements set help_ar = 'جدارتان من الجدارات الست، لكل منهما هدف قابل للقياس وسلوك أسبوعي.' where code = 'L-PLAN';

-- 6) المصطلحات: «التوجيه» لا «الكوتشينغ»، و«مجتمع الممارسة» لا «مجتمع الأقران»
update leaders.tracks set
  journey_ar = replace(replace(journey_ar, 'الكوتشينغ', 'التوجيه'), 'مجتمع الأقران', 'مجتمع الممارسة'),
  focus_ar = replace(replace(focus_ar, 'الكوتشينغ', 'التوجيه'), 'مجتمع الأقران', 'مجتمع الممارسة');

-- 7) الأسماء الإنجليزية للمستويات كما في قاموس labels.js (الشهادة والتقارير)
update leaders.levels set title_en = case key when 'beginner' then 'Foundation' when 'intermediate' then 'Intermediate' when 'advanced' then 'Professional' end;
