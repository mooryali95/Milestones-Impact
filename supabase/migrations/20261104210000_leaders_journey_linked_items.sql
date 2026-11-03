-- خطة ملاحظات ما قبل الورشة (v2): كل بند في الرحلة يكتمل من مصدره، لا بنقرة «أنجزته»
-- البند 5: تمرينا أيام التدريب يُربطان بالنموذج التطبيقي نفسه (يكتملان بتسليمه)،
--          ويعود النموذج لاحقًا في مرحلة التوجيه ليُقيَّم (O-MREG وO-GATE)، فلا محرر ثانٍ.
-- البند 6: خطة التطبيق الأولية تُبنى داخل وثيقة المبادرة: تكتمل حين تُحفظ فصولها الثلاثة
--          (سجل المعالم، نظرية التغيير، خريطة أصحاب المصلحة) بدل رفع ملف.
-- ما سُجِّل سابقًا لهذه البنود في participant_requirements يبقى كما هو؛ الحالة الآن تُقرأ من المصدر.
update leaders.stage_requirements
   set kind = 'model', needs_review = false,
       config = '{"model_key": "milestone-register", "accept": "submitted"}'::jsonb,
       help_ar = 'ابنِه في نموذج «سجل المعالم» على مشروعك، ويكتمل بتسليمه. يعود إليك في مرحلة التوجيه للتحسين والتقييم.'
 where code = 'T-MB' and kind = 'check';

update leaders.stage_requirements
   set kind = 'model', needs_review = false,
       config = '{"model_key": "stage-gate", "accept": "submitted"}'::jsonb,
       help_ar = 'صمّمه في نموذج «ورقة قرار بوابة المرحلة» لمحفظتك، ويكتمل بتسليمه.'
 where code = 'T-MA' and kind = 'check';

update leaders.stage_requirements
   set kind = 'capstone', needs_review = false,
       title_ar = 'خطة التطبيق الأولية في وثيقة مبادرتك (مخرج آخر أيام التدريب)',
       config = '{"sections": ["milestone-register", "theory-of-change", "stakeholder-map"]}'::jsonb,
       help_ar = 'تكتمل حين تحفظ في وثيقة مبادرتك: سجل المعالم المبدئي، ونظرية التغيير (فرضية الأثر)، وخريطة أصحاب المصلحة.'
 where code = 'T-PLAN' and kind = 'upload';

-- البند 10: الراعي حافز لا شرط. حقوله في بطاقة المبادرة واتفاق التعلم تصير اختيارية بنص يحفّز على تسميته؛
-- وإن غاب، يعتمد المستشار الوثيقة دون تأييد بسبب مكتوب (المسار القائم sponsor_waived).
update leaders.learning_models m
   set fields = (
     select jsonb_agg(case
       when f->>'key' in ('sponsor', 'sponsor_email') then f || jsonb_build_object('required', false,
         'help', case when f->>'key' = 'sponsor_email'
           then 'اختياري. إن كتبته وصله طلب تأييد مبادرتك عند اعتمادها، وتأييده يقوّي فرص تبنّيها.'
           else 'اختياري ومستحسن: راعٍ من جهتك يفتح الأبواب ويحمي المبادرة عند القرار.' end)
       else f end order by ord)
     from jsonb_array_elements(m.fields) with ordinality as t(f, ord))
 where m.key in ('initiative-charter', 'learning-agreement')
   and m.fields::text like '%sponsor%';
