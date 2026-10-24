-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: أسئلة المعرفة في القياس البعدي (post-v1)
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد 20261024150000 الذي ينشئ post-v1.
-- 6 أسئلة معرفة لكل إطار، موازية لأسئلة المعرفة في baseline-v3:
-- الجدارة نفسها والباب نفسه ومستوى الصعوبة نفسه، بصياغة وموقف مختلفين،
-- حتى يقيس الفرق التعلم لا تذكّر السؤال. لذلك لا anchor_code لها.
-- البديل الصحيح موزع على مواضع البدائل ورتب طولها دون نمط.

insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K2', 'knowledge', 'أي عبارة تصف بوابة المرحلة (Stage Gate) وصفًا صحيحًا؟', null, 'choice', '[{"label": "أي موعد تسليم يرد في الجدول الزمني المعتمد للمشروع مع مسؤوله", "score": 0}, {"label": "اجتماع أسبوعي ثابت يتابع فيه الفريق تقدم المهام والمخاطر", "score": 0}, {"label": "تقرير ختامي يُرفع إلى اللجنة بعد إغلاق المشروع وتسليم مخرجاته", "score": 0}, {"label": "معلم يُتخذ عنده قرار رسمي بالاستمرار أو التعديل أو الإيقاف", "score": 4}]'::jsonb, 11, 'البوابة والمعلم', 'ch3', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K4', 'knowledge', 'فريق يبني خدمة رقمية جديدة، ومتطلباتها غير واضحة وتتغير مع ملاحظات المستخدمين كل أسبوعين. أي نهج أنسب؟', null, 'choice', '[{"label": "نهج تنبؤي بخطة تفصيلية معتمدة من البداية حتى الإغلاق", "score": 0}, {"label": "نهج تكيفي بدورات قصيرة", "score": 4}, {"label": "تجميد المتطلبات حتى تتضح كاملة ثم البدء في التنفيذ", "score": 0}, {"label": "إدارة تشغيلية بمؤشرات أداء شهرية لكل فريق", "score": 0}]'::jsonb, 12, 'اختيار نهج الإدارة', 'ch1', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K5', 'knowledge', 'نشاط ليس على المسار الحرج وله فائض زمني (Float) قدره خمسة أيام. ماذا يحدث إن تأخر ثلاثة أيام؟', null, 'choice', '[{"label": "يتأخر موعد انتهاء المشروع ثلاثة أيام كاملة", "score": 0}, {"label": "يصبح المسار الحرج أطول بمقدار خمسة أيام", "score": 0}, {"label": "لا يتأثر موعد انتهاء المشروع", "score": 4}, {"label": "يجب إعادة اعتماد خط الأساس قبل أي خطوة", "score": 0}]'::jsonb, 13, 'المسار الحرج', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K6', 'knowledge', 'وصل طلب بإضافة مخرج جديد بعد اعتماد النطاق. ما الخطوة الصحيحة أولًا وفق ضبط التغيير؟', null, 'choice', '[{"label": "تنفيذه فورًا ما دام الراعي هو من طلبه", "score": 0}, {"label": "رفضه لأن النطاق معتمد ومغلق", "score": 0}, {"label": "تحليل أثره على الوقت والتكلفة ثم عرضه للقرار", "score": 4}, {"label": "إضافته للخطة وتوثيقه لاحقًا في التقرير الختامي للمشروع", "score": 0}]'::jsonb, 14, 'ضبط التغيير', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K7', 'knowledge', '"قد يتأخر المورد في تسليم الأجهزة بسبب نقص عالمي في الرقائق". كيف يُصنَّف هذا البند؟', null, 'choice', '[{"label": "مشكلة لأنها تتعلق بالتزامات المورد التعاقدية", "score": 0}, {"label": "قرار معلق ينتظر حسم اللجنة التوجيهية", "score": 0}, {"label": "افتراض ثابت لا يحتاج إلى متابعة دورية", "score": 0}, {"label": "خطر، لأنه حدث محتمل لم يقع بعد وقد يؤثر في الجدول الزمني", "score": 4}]'::jsonb, 15, 'الخطر والمشكلة', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'milestone', 'P-M-K8', 'knowledge', 'لماذا يُحتفظ بخط الأساس (Baseline) دون تعديل إلا بتغيير معتمد؟', null, 'choice', '[{"label": "ليبقى مرجعًا يُقاس عليه الانحراف", "score": 4}, {"label": "لأن الأنظمة لا تسمح بتعديل الخطط", "score": 0}, {"label": "لتقليل عدد التقارير المطلوبة من الفريق كل شهر", "score": 0}, {"label": "لأن الراعي وحده يملك النسخة المعتمدة منه", "score": 0}]'::jsonb, 16, 'خط الأساس', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K1', 'knowledge', '"تدريب 200 موظف على نظام المشتريات الجديد" يقع في أي مستوى من سلسلة القيمة؟', null, 'choice', '[{"label": "أثر مستدام", "score": 0}, {"label": "منافع", "score": 0}, {"label": "نتائج مباشرة", "score": 0}, {"label": "مخرجات", "score": 4}]'::jsonb, 27, 'مستويات سلسلة القيمة', 'ch2', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K2', 'knowledge', 'انخفض معدل البطالة في المنطقة بعد برنامج تدريب نفذته الجهة. أي صياغة أدق للتقرير؟', null, 'choice', '[{"label": "البرنامج خفض معدل البطالة في المنطقة بوضوح", "score": 0}, {"label": "البرنامج أسهم مع عوامل أخرى في الانخفاض", "score": 4}, {"label": "انخفاض البطالة دليل كافٍ على نجاح البرنامج وحده", "score": 0}, {"label": "لا يُذكر البرنامج في التقرير لأن أثره غير مؤكد إطلاقًا", "score": 0}]'::jsonb, 28, 'المساهمة والإسناد', 'ch2', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K4', 'knowledge', 'ما الفرق الأساسي بين النتيجة الرئيسية (Key Result) ومؤشر الأداء التشغيلي (KPI)؟', null, 'choice', '[{"label": "الأولى تقيس تغييرًا مستهدفًا في مدة محددة، والثاني يراقب أداءً مستمرًا", "score": 4}, {"label": "الأولى تخص الإدارة العليا، والثاني يخص الموظفين في الميدان", "score": 0}, {"label": "الأولى تُقاس يوميًا، والثاني يُقاس مرة واحدة في نهاية السنة", "score": 0}, {"label": "الأولى نوعية لا أرقام فيها، والثاني كمي يُقاس بالأرقام دائمًا", "score": 0}]'::jsonb, 29, 'النتائج الرئيسية ومؤشرات الأداء', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K5', 'knowledge', 'أي عنصر ينقص المؤشر التالي: "خفض زمن إنجاز المعاملة من 10 أيام إلى 4 أيام"؟', null, 'choice', '[{"label": "خط الأساس للقياس", "score": 0}, {"label": "القيمة المستهدفة", "score": 0}, {"label": "الموعد المستهدف", "score": 4}, {"label": "وحدة القياس المستخدمة", "score": 0}]'::jsonb, 30, 'مكونات المؤشر', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K6', 'knowledge', 'أي سؤال تجيب عنه نظرية التغيير (Theory of Change)؟', null, 'choice', '[{"label": "كم تكلفة كل نشاط من أنشطة البرنامج؟", "score": 0}, {"label": "من المسؤول عن تنفيذ كل مهمة في كل مرحلة؟", "score": 0}, {"label": "لماذا نتوقع أن تؤدي أنشطتنا إلى الأثر؟", "score": 4}, {"label": "متى يُسلَّم كل مخرج من مخرجات البرنامج للجهة؟", "score": 0}]'::jsonb, 31, 'نظرية التغيير', 'ch3', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'impact', 'P-I-K7', 'knowledge', 'نظام إلكتروني جديد سرّع الخدمة، لكنه ألغى وظائف عشرة موظفين في مراكز الخدمة. كيف يُصنَّف إلغاء الوظائف؟', null, 'choice', '[{"label": "خطر محتمل لم يقع بعد", "score": 0}, {"label": "منفعة مؤجلة تظهر لاحقًا", "score": 0}, {"label": "منفعة سلبية تُدار وتُقاس", "score": 4}, {"label": "تكلفة رأسمالية في ميزانية النظام", "score": 0}]'::jsonb, 32, 'المنافع السلبية', 'ch2', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K2', 'knowledge', 'موظف متحمس للمهمة لكنه جديد عليها ولا يملك خبرتها. أي أسلوب أنسب وفق القيادة الموقفية؟', null, 'choice', '[{"label": "التفويض الكامل له مع متابعة في نهاية المهمة", "score": 0}, {"label": "التوجيه بتعليمات واضحة ومتابعة قريبة", "score": 4}, {"label": "الدعم والتشجيع فقط دون أي توجيه في التفاصيل", "score": 0}, {"label": "تركه يتعلم من أخطائه ثم مراجعتها معه", "score": 0}]'::jsonb, 43, 'القيادة الموقفية', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K5', 'knowledge', 'أي ما يلي من مصادر التأثير لا يعتمد على السلطة الرسمية؟', null, 'choice', '[{"label": "صلاحية اعتماد الميزانية وصرفها", "score": 0}, {"label": "حق التقييم السنوي لأداء الموظف", "score": 0}, {"label": "الخبرة والثقة والعلاقات المتبادلة", "score": 4}, {"label": "قرار التعيين والنقل والترقية في الإدارة", "score": 0}]'::jsonb, 44, 'التأثير دون سلطة', 'ch6', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K6', 'knowledge', 'أي سلوك من القائد يبني الأمان النفسي في الفريق أكثر من غيره؟', null, 'choice', '[{"label": "أن يعترف بأخطائه ويشكر من ينبّه إلى خلل", "score": 4}, {"label": "أن يتجنب الخلاف داخل الفريق حفاظًا على الانسجام", "score": 0}, {"label": "أن يعد الفريق بعدم تغيير المهام حتى نهاية المشروع", "score": 0}, {"label": "أن يحمي الفريق من أي ملاحظة تأتي من خارجه", "score": 0}]'::jsonb, 45, 'الأمان النفسي', 'ch6', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K7', 'knowledge', 'في مصفوفة RACI، كم شخصًا يُفضّل أن يكون في خانة A لكل مهمة؟', null, 'choice', '[{"label": "شخصان على الأقل", "score": 0}, {"label": "كل أعضاء الفريق", "score": 0}, {"label": "لا قاعدة لذلك", "score": 0}, {"label": "شخص واحد", "score": 4}]'::jsonb, 46, 'المساءلة', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K8', 'knowledge', 'وفق نموذج كوتر، لماذا يُنصح بتحقيق مكاسب سريعة قصيرة المدى؟', null, 'choice', '[{"label": "لإعلان انتهاء التغيير مبكرًا", "score": 0}, {"label": "لإثبات جدوى التغيير للمتشككين والحفاظ على زخمه", "score": 4}, {"label": "لتقليل الحاجة إلى بناء تحالف قيادي داعم", "score": 0}, {"label": "للاستغناء عن صياغة رؤية التغيير ونشرها", "score": 0}]'::jsonb, 47, 'قيادة التغيير', 'ch6', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key, retro)
select id, 'leadership', 'P-L-K9', 'knowledge', 'ما الذي يجعل الملاحظة على الأداء بنّاءة؟', null, 'choice', '[{"label": "أن تكون عامة حتى لا تجرح الشخص المعني", "score": 0}, {"label": "أن تصف سلوكًا محددًا وأثره، ثم تفتح حوارًا عن الحل", "score": 4}, {"label": "أن تُقال أمام الفريق كله ليتعلم الجميع منها", "score": 0}, {"label": "أن تُؤجل إلى التقييم السنوي لتكون شاملة", "score": 0}]'::jsonb, 48, 'الملاحظة البنّاءة', 'ch4', false from leaders.instruments where key = 'post-v1'
on conflict (instrument_id, code) do nothing;

notify pgrst, 'reload schema';
