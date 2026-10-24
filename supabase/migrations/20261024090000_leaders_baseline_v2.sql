-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: الإصدار الثاني من القياس المبدئي (baseline-v2)
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يمس baseline-v1 ولا نتائجه.
-- يُنشأ الإصدار غير مفعّل، ويُفعَّل من لوحة الإدارة (الأسئلة ← تفعيل).
--
-- ما تغيّر عن الإصدار الأول (المرحلة الأولى من مراجعة الأسئلة):
--   1. أطوال البدائل متقاربة: الإجابة الصحيحة كانت الأطول في 21 من 24
--      سؤال اختيار، فكان اختيار الأطول دائمًا يمنح مستوى احترافي.
--      صارت الأطول في سؤال واحد فقط، واختبار logic.test.js يحرس ذلك.
--   2. البدائل الخاطئة مقبولة لممارس حقيقي، بلا خيارات ساذجة.
--   3. عبارات الممارسة بفكرة واحدة، بإطار زمني (آخر 12 شهرًا)،
--      ولكل منها خيار "لا ينطبق على عملي" بدرجة سالبة لا تدخل الحساب.
--   4. أسئلة نقلت حفظ النموذج إلى موقف (M-K3، M-K4، I-K1، I-K4، L-K1).

insert into leaders.instruments (key, title_ar, kind, active, version, intro_ar, est_minutes)
values ('baseline-v2', 'القياس المبدئي لإدارة المشروعات للقادة', 'baseline', false, 2,
  'يقيس هذا القياس ثلاثة جوانب في كل إطار: ممارستك الفعلية، وحكمك في مواقف العمل، ومعرفتك بالمفاهيم. أسئلة الممارسة ليس فيها إجابة صحيحة، فأجب بما تفعله فعلًا لا بما ينبغي فعله، ونتيجتك لا تُشارك مع جهتك. وفي المواقف اختر ما تراه الأنسب ولو لم يكن ما تفعله عادة.',
  15)
on conflict (key) do nothing;

insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-K1', 'knowledge', 'أي تعريف للمعلم (Milestone) هو الأقرب لمنظور المنهجية؟', null, 'choice', '[{"label": "نهاية نشاط رئيسي يُثبَّت تاريخه في الجدول الزمني", "score": 0}, {"label": "نقطة قرار تُقاس عندها القيمة والمخاطر قبل المتابعة", "score": 4}, {"label": "موعد دوري ثابت لمراجعة نسب الإنجاز مع الفريق", "score": 0}, {"label": "مخرج تعاقدي يُسلَّم للجهة المالكة وتُصرف مقابله دفعة", "score": 0}]'::jsonb, 1 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-K2', 'knowledge', 'ما العلاقة الصحيحة بين بوابة المرحلة (Stage Gate) والمعلم؟', null, 'choice', '[{"label": "هما اسمان مختلفان لنقطة المتابعة نفسها", "score": 0}, {"label": "كل معلم بوابة تتطلب قرارًا رسميًا من اللجنة", "score": 0}, {"label": "كل بوابة معلم، وليس كل معلم بوابة", "score": 4}, {"label": "البوابة للبرامج والمحافظ، والمعلم للمشروعات", "score": 0}]'::jsonb, 2 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-K3', 'knowledge', '"اعتماد اللجنة التوجيهية لخطة الإطلاق" مثال على أي نوع من أنواع المعالم؟', null, 'choice', '[{"label": "معلم تعاقدي", "score": 0}, {"label": "معلم تقني أو إنجاز", "score": 0}, {"label": "معلم حوكمي أو قرار", "score": 4}, {"label": "معلم قيمة أو منافع", "score": 0}]'::jsonb, 3 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-K4', 'knowledge', 'جهة تطلق برنامجًا متطلباته واضحة ومستقرة، وتشترط اعتماد اللجنة قبل كل مرحلة وصرف الميزانية على دفعات. أي نهج أنسب لإدارته؟', null, 'choice', '[{"label": "نهج تنبؤي بمراحل وبوابات اعتماد", "score": 4}, {"label": "نهج تكيفي بدورات قصيرة وأولويات متغيرة", "score": 0}, {"label": "نهج هجين يبدأ تكيفيًا ثم يصبح تنبؤيًا", "score": 0}, {"label": "إدارة تشغيلية بمؤشرات أداء شهرية", "score": 0}]'::jsonb, 4 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-S1', 'skill', 'طُلب منك بناء سجل معالم لمشروع جديد. أي سجل هو الأفضل؟', null, 'choice', '[{"label": "معالم لاكتمال كل مخرج، لكل منها تاريخ ومسؤول", "score": 1}, {"label": "معالم مخرجات وقرارات وقيمة، لكل منها معيار تحقق", "score": 4}, {"label": "معلم في نهاية كل شهر لضمان انتظام التقارير", "score": 0}, {"label": "معالم دفعات العقد مع المورد ومواعيد استحقاق كل دفعة", "score": 1}]'::jsonb, 5 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-S2', 'skill', 'في جلسة بوابة مرحلة: المشروع متأخر ثلاثة أسابيع، ومبرر الاستمرار قائم، والمخاطر معروفة. ما القرار الأنسب؟', null, 'choice', '[{"label": "عبور كامل مع رفع المخاطر إلى سجل اللجنة", "score": 1}, {"label": "عبور مشروط بخطة تصحيح ومعلم مراجعة قريب", "score": 4}, {"label": "تأجيل الجلسة حتى يلحق المشروع بالخطة الأصلية", "score": 1}, {"label": "إيقاف مؤقت حتى يُعاد اعتماد خط الأساس كاملًا", "score": 0}]'::jsonb, 6 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-S3', 'skill', 'تحليل اتجاه المعالم (MTA) يظهر أن تاريخ معلم رئيسي يتأخر أسبوعًا في كل تقرير منذ أربعة أشهر. ما أول خطوة؟', null, 'choice', '[{"label": "مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة", "score": 1}, {"label": "تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة", "score": 4}, {"label": "اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي", "score": 1}, {"label": "الاستمرار في المتابعة لأن تأخير كل تقرير محدود", "score": 0}]'::jsonb, 7 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-S4', 'skill', 'مشروع تنموي ممول من جهة مانحة، وتقارير المنحة ترهق الفريق ولا تُستخدم داخليًا. ما المعالجة الأنسب؟', null, 'choice', '[{"label": "التفاوض مع المانح على تقرير فصلي بدل الشهري", "score": 1}, {"label": "ربط مواعيد التقارير بمعالم القرار الداخلية", "score": 4}, {"label": "إسناد التقارير لموظف متخصص بعيدًا عن الفريق", "score": 1}, {"label": "دمج التقارير في تقرير سنوي واحد شامل", "score": 0}]'::jsonb, 8 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-B1', 'behavior', 'أختم اجتماعات المتابعة التي أقودها بقرار موثق له مسؤول وموعد.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 9 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-B2', 'behavior', 'أتفق مع الجهة المستلمة على معايير قبول المخرج قبل تسليمه.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 10 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-B3', 'behavior', 'أراجع مبرر استمرار المشروع عند كل بوابة، حتى لو كان سير العمل جيدًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 11 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'milestone', 'M-B4', 'behavior', 'أقترح إيقاف عمل حين يتضح أنه لم يعد يخدم الهدف، ولو كان مكتملًا جزئيًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 12 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-K1', 'knowledge', '"ارتفاع معرفة المتدربين بالمهارة المستهدفة بعد انتهاء الدورة" يقع في أي مستوى من سلسلة القيمة؟', null, 'choice', '[{"label": "مخرجات", "score": 0}, {"label": "نتائج مباشرة", "score": 4}, {"label": "منافع", "score": 0}, {"label": "أثر مستدام طويل المدى", "score": 0}]'::jsonb, 13 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-K2', 'knowledge', 'في أي حالة تكون لغة "المساهمة" أدق من "الإسناد" في تقرير الأثر؟', null, 'choice', '[{"label": "عند الإبلاغ عن عدد المستفيدين من الخدمة", "score": 0}, {"label": "عند تغيّر مؤشر وطني تؤثر فيه عوامل كثيرة", "score": 4}, {"label": "عندما يكون البرنامج ممولًا من ميزانية الجهة", "score": 0}, {"label": "عندما يكون التقرير موجهًا للإدارة العليا", "score": 0}]'::jsonb, 14 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-K3', 'knowledge', 'أي مما يلي **ليس** شرطًا لاعتبار النتيجة "منفعة" في المنهجية؟', null, 'choice', '[{"label": "أن يكون لها مالك محدد يُحاسب على تحققها", "score": 0}, {"label": "أن يكون لها مؤشر وتاريخ تحقق", "score": 0}, {"label": "أن تخدم هدفًا استراتيجيًا للجهة", "score": 0}, {"label": "أن تُحوَّل إلى قيمة مالية بالريال", "score": 4}]'::jsonb, 15 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-K4', 'knowledge', 'أي ما يلي أقرب إلى نتيجة رئيسية (Key Result) منه إلى مؤشر أداء تشغيلي (KPI)؟', null, 'choice', '[{"label": "متوسط زمن الرد على العملاء أقل من 3 دقائق", "score": 0}, {"label": "نسبة توفر النظام 99.5% في كل شهر", "score": 0}, {"label": "رفع رضا المستفيدين من 60% إلى 80% هذا العام", "score": 4}, {"label": "إنجاز 1200 معاملة يوميًا في مراكز الخدمة كافة", "score": 0}]'::jsonb, 16 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-S1', 'skill', 'تبني سجل منافع لبرنامج تدريبي. أي صياغة تصلح منفعةً؟', null, 'choice', '[{"label": "تدريب 500 متدرب خلال العام بنسبة حضور تتجاوز 95%", "score": 0}, {"label": "رفع توظيف الخريجين من 30% إلى 45% خلال 12 شهرًا", "score": 4}, {"label": "رضا المتدربين عن الدورة بنسبة 90% في الاستبانة", "score": 1}, {"label": "إنجاز 40 ساعة تدريبية لكل متدرب حتى نهاية العام", "score": 0}]'::jsonb, 17 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-S2', 'skill', 'في مراجعة منافع: منفعة متأخرة عن مسارها 40%، ومالكها يقترح تأجيل القياس للدورة القادمة. ما القرار الأنسب؟', null, 'choice', '[{"label": "الموافقة على التأجيل مع توثيق السبب في السجل", "score": 1}, {"label": "تحليل السبب ثم قرار موثق بتصحيح المسار", "score": 4}, {"label": "ضخ موارد إضافية فورًا لتعويض الفجوة", "score": 1}, {"label": "خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي", "score": 0}]'::jsonb, 18 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-S3', 'skill', 'تقرير أثر يذكر أن البرنامج خفّض البطالة في المنطقة 10%، دون خط أساس أو مجموعة مقارنة. كيف تتعامل معه؟', null, 'choice', '[{"label": "أعتمده مع حاشية تذكر غياب خط الأساس", "score": 1}, {"label": "أعيد صياغته بلغة المساهمة مع أدلة داعمة", "score": 4}, {"label": "أحذف الرقم وأكتفي بعرض مخرجات البرنامج", "score": 1}, {"label": "أوقف نشر التقرير كاملًا حتى تُجرى دراسة مقارنة", "score": 1}]'::jsonb, 19 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-S4', 'skill', 'برنامج بدأ قبل شهرين دون خط أساس. ما التصرف الأنسب؟', null, 'choice', '[{"label": "بناء خط أساس فوري بالبيانات المتاحة وتوثيق قيوده", "score": 4}, {"label": "اعتماد أول قياس بعد ثلاثة أشهر خطًا للأساس", "score": 1}, {"label": "الاكتفاء بقياس المخرجات حتى نهاية البرنامج", "score": 0}, {"label": "استخدام تقديرات الفريق للوضع الذي سبق بدء البرنامج", "score": 1}]'::jsonb, 20 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-B1', 'behavior', 'أطلب في مراجعات المشروعات بيانات عما تغيّر لدى المستفيدين، لا عن الأنشطة فقط.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 21 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-B2', 'behavior', 'أتأكد أن لكل منفعة أقترحها أو أعتمدها مالكًا محددًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 22 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-B3', 'behavior', 'أذكر حدود الأدلة في تقارير الأثر التي أعدّها أو أعتمدها.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 23 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'impact', 'I-B4', 'behavior', 'أستخدم مؤشرات الأثر عند ترتيب أولويات المشروعات.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 24 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-K1', 'knowledge', 'وفق سلسلة الاستجابة، ما الخطوة التي تأتي مباشرة بعد تلقي الأمر؟', null, 'choice', '[{"label": "التفهم", "score": 4}, {"label": "تحديد الأولوية", "score": 0}, {"label": "التحرك", "score": 0}, {"label": "الإغلاق", "score": 0}]'::jsonb, 25 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-K2', 'knowledge', 'في القيادة الموقفية، على أي أساس يُختار أسلوب القائد مع الفرد؟', null, 'choice', '[{"label": "شخصية القائد وما اعتاد عليه", "score": 0}, {"label": "قدرة الفرد ورغبته في المهمة المحددة", "score": 4}, {"label": "أقدمية الفرد ومستواه الوظيفي", "score": 0}, {"label": "حجم المشروع وحساسية مخرجاته للجهة", "score": 0}]'::jsonb, 26 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-K3', 'knowledge', 'ماذا تعني "الجدارة الأفقية" في قيادة المشروعات؟', null, 'choice', '[{"label": "قيادة الفريق التنفيذي المباشر للمشروع", "score": 0}, {"label": "إقناع الإدارة العليا باعتماد القرارات", "score": 0}, {"label": "التأثير في النظراء دون سلطة مباشرة", "score": 4}, {"label": "ضبط الانفعال وإدارة الذات تحت الضغط", "score": 0}]'::jsonb, 27 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-K4', 'knowledge', 'متى يكتمل التسليم والتسلم بالمفهوم القيادي؟', null, 'choice', '[{"label": "عند توقيع الطرفين محضر التسليم", "score": 0}, {"label": "عند نقل الملفات والصلاحيات كاملة", "score": 0}, {"label": "عند استقلال المتسلم بالعهدة", "score": 4}, {"label": "عند انتقال المسلّم إلى مهمته الجديدة", "score": 0}]'::jsonb, 28 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-S1', 'skill', 'كلّفت عضوًا انضم حديثًا بإعداد أول خطة تواصل في مسيرته، وهو يبادر ويطلب مزيدًا من المهام. ما الأسلوب الأنسب معه في هذه المهمة؟', null, 'choice', '[{"label": "تفويض المهمة كاملة مع موعد تسليم واضح", "score": 0}, {"label": "تعليمات محددة ومتابعة قريبة لكل خطوة", "score": 4}, {"label": "تشجيعه ودعمه وترك طريقة التنفيذ له", "score": 1}, {"label": "شرح المطلوب ثم مراجعة النسخة النهائية فقط", "score": 1}]'::jsonb, 29 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-S2', 'skill', 'خلاف مع إدارة موازية على مورد مشترك. القضية مهمة لمشروعك، والعلاقة ممتدة، وأمامكما أسبوعان قبل الحاجة إلى المورد. ما الأنسب؟', null, 'choice', '[{"label": "حسم المورد لصالح مشروعك عبر الإدارة العليا", "score": 1}, {"label": "جلسة مشتركة لبناء حل يلبي حاجة الطرفين", "score": 4}, {"label": "تقاسم المورد مناصفة لإنهاء الخلاف سريعًا", "score": 2}, {"label": "تأجيل الموضوع حفاظًا على العلاقة بينكما", "score": 0}]'::jsonb, 30 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-S3', 'skill', 'وصلك توجيه عاجل من الإدارة العليا بصياغة عامة. ما أول خطوة؟', null, 'choice', '[{"label": "البدء بالتنفيذ فورًا لإظهار سرعة الاستجابة", "score": 1}, {"label": "إقرار الاستلام والتحقق من المقصود قبل التحرك", "score": 4}, {"label": "انتظار وصول تفاصيل إضافية مكتوبة من مكتب المسؤول", "score": 0}, {"label": "تمرير التوجيه للفريق كما وصل لبدء العمل", "score": 0}]'::jsonb, 31 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-S4', 'skill', 'مسؤول له نفوذ عالٍ على قرارات مشروعك، لكنه قليل الاهتمام بتفاصيله. ما الأنسب معه؟', null, 'choice', '[{"label": "اجتماع أسبوعي لاطلاعه على كل التفاصيل", "score": 1}, {"label": "إحاطة موجزة عند كل نقطة قرار تخصه", "score": 4}, {"label": "الاكتفاء بنسخة من التقرير الشهري العام", "score": 1}, {"label": "التواصل معه فقط عند ظهور مشكلة كبيرة", "score": 0}]'::jsonb, 32 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-B1', 'behavior', 'أغيّر طريقة قيادتي للشخص بحسب خبرته في المهمة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 33 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-B2', 'behavior', 'أحافظ على هدوئي في الاجتماعات المتوترة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 34 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-B3', 'behavior', 'أوثّق المخاطر والقرارات المعلقة عند تسليم أي عهدة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 35 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select id, 'leadership', 'L-B4', 'behavior', 'أشرح لفريقي سبب التغيير قبل توزيع المهام.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 36 from leaders.instruments where key = 'baseline-v2'
on conflict (instrument_id, code) do nothing;

notify pgrst, 'reload schema';
