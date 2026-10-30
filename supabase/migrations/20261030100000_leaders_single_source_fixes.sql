-- توحيد المصادر، المرحلة الأولى: ما كان متعارضًا فعلًا.
-- 1) اسم بُعد القيادة المعتمد: «تمكين القائد» (مطابق لقاموس leaders-api/labels.js).
update leaders.dimensions set title_ar = 'تمكين القائد' where key = 'leadership';

-- 2) القيم الافتراضية لعتبات قياس الأثر تطابق IMPACT_DEFAULTS في logic.js (50 و15)،
--    فلا يبدأ أي إعداد جديد أو مُعاد بقيم مختلفة عما يعمل به الخادم.
alter table leaders.placement_model alter column impact_min_n set default 50;
alter table leaders.placement_model alter column rater_threshold set default 15;

-- 3) وصف التقييم كان يعد بـ«نفس أداة القياس المبدئي»، والأداة البعدية أسئلتها مكافئة لا مطابقة.
update leaders.journey_stages
   set activities_ar = replace(activities_ar, 'القياس البعدي بنفس أداة القياس المبدئي للمقارنة', 'القياس البعدي بأداة مكافئة للقياس المبدئي، فتُقارن النتيجتان على المحاور نفسها')
 where key = 'evaluation';
