-- توحيد المصادر، المرحلة الثانية: أرقام الجلسات والمدد في نصوص الرحلة تصير رموزًا تُملأ من مصدرها
-- (renderJourney في leaders-api/logic.js). حفظ نص فيه رقم صريح يرفضه الخادم (hardcodedFacts).
create table if not exists leaders.backup_20261030_journey_text as
  select 'stage' as kind, key as ref, duration_label, activities_ar, description_ar, null::text as title_ar, null::text as help_ar, null::jsonb as config
    from leaders.journey_stages
  union all
  select 'req', code, null, null, null, title_ar, help_ar, config from leaders.stage_requirements;

-- مدة المرحلة من duration_days
update leaders.journey_stages set duration_label = '{duration}' where key in ('ojt_coaching', 'consulting', 'leadership_coaching', 'support', 'evaluation', 'report');
update leaders.journey_stages set duration_label = '{duration} عمل' where key = 'approval';
update leaders.journey_stages set duration_label = '{assessment_minutes}' where key = 'assessment';
update leaders.journey_stages set duration_label = '{days:T-ATTEND} تدريبية',
  description_ar = replace(description_ar, 'أربعة أيام تطبيقية', '{days:T-ATTEND} تطبيقية')
 where key = 'training';

-- الجلسات والدقائق من إعداد كل نشاط
update leaders.journey_stages set activities_ar = replace(activities_ar, 'مقابلة تحقق مدتها 20 دقيقة', 'مقابلة تحقق مدتها {minutes:AP-INT}') where key = 'approval';
update leaders.journey_stages set activities_ar = replace(activities_ar, 'أربع جلسات توجيه أسبوعية مدة كل منها 60 دقيقة', '{sessions:O-SESS} توجيه أسبوعية مدة كل منها {minutes:O-SESS}') where key = 'ojt_coaching';
update leaders.journey_stages set activities_ar = replace(activities_ar, 'جلسة استشارية مدتها 90 دقيقة', 'جلسة استشارية مدتها {minutes:C-MEET}') where key = 'consulting';
update leaders.journey_stages set activities_ar = replace(activities_ar, 'ثلاث جلسات فردية مدة كل منها 60 دقيقة', '{sessions:L-SESS} فردية مدة كل منها {minutes:L-SESS}') where key = 'leadership_coaching';
update leaders.journey_stages set activities_ar = replace(activities_ar, 'جلسة متابعة شهرية مدتها 45 دقيقة (ثلاث جلسات)', 'جلسة متابعة شهرية مدتها {minutes:S-CHECK} ({sessions:S-CHECK})') where key = 'support';
update leaders.journey_stages set activities_ar = replace(replace(activities_ar,
    'عرض مشروعك أمام لجنة التقييم في 20 دقيقة', 'عرض مشروعك أمام لجنة التقييم في {minutes:E-PRES}'),
    'القياس البعدي بنفس أداة القياس المبدئي للمقارنة', 'القياس البعدي بأداة مكافئة للقياس المبدئي، فتُقارن النتيجتان على المحاور نفسها')
 where key = 'evaluation';

update leaders.stage_requirements set config = config || '{"minutes": 20}'::jsonb where code = 'E-PRES';
update leaders.stage_requirements set title_ar = 'حضور الأيام التدريبية ({days:T-ATTEND})' where code = 'T-ATTEND';
update leaders.stage_requirements set title_ar = 'حضور {sessions:O-SESS} توجيه أسبوعية' where code = 'O-SESS';
update leaders.stage_requirements set title_ar = 'حضور {sessions:L-SESS} توجيه فردية' where code = 'L-SESS';
update leaders.stage_requirements set title_ar = 'متابعة شهرية مع الموجّه ({sessions:S-CHECK})' where code = 'S-CHECK';
update leaders.stage_requirements set help_ar = 'يحددها المستشار إن احتاج توضيحًا، ومدتها {minutes:AP-INT} عن بعد.' where code = 'AP-INT';
update leaders.stage_requirements set help_ar = replace(help_ar, 'جاهزيتها 80%', 'جاهزيتها {ready_min}%') where code = 'CP-FINAL';
