-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: بنك الأسئلة ومخطط الاختبار، والقياس المبدئي baseline-v3
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يمس baseline-v1 ولا baseline-v2 ولا نتائجهما.
-- يُنشأ الإصدار غير مفعّل، ويُفعَّل من لوحة الإدارة.
--
-- المرحلة الثانية من مراجعة الأسئلة:
--   1. مخطط الاختبار (Blueprint): لكل سؤال الجدارة التي يقيسها
--      (competency_ar) وباب الكتيب الذي يغطيها (chapter_key).
--   2. 16 سؤالًا لكل إطار بدل 12: 4 ممارسة، و6 مواقف، و6 معرفة، فيقل
--      أثر السؤال الواحد على المؤشر (5 نقاط للمعرفة و7.5 للمواقف).
--   3. المعرفة مفاهيم عامة يعرفها الممارس من أي مدرسة (المسار الحرج،
--      ضبط التغيير، الخطر والمشكلة، نظرية التغيير، RACI، كوتر...)،
--      لا مصطلحات الكتيب. أسئلة المصطلحات (M-K1، M-K3، I-K3، L-K1،
--      L-K3، L-K4) مكانها القياس البعدي لأنها تقيس أثر التدريب.
--   4. ترتيب طول الإجابة الصحيحة بين البدائل موزع بالتساوي تقريبًا
--      (في كل إطار وجانب لا تتكرر رتبة أكثر من مرتين من 6)، فلا تكشفها
--      أي قاعدة طول. اختبار logic.test.js يحرس ذلك.

alter table leaders.questions add column if not exists competency_ar text;
alter table leaders.questions add column if not exists chapter_key   text;

insert into leaders.instruments (key, title_ar, kind, active, version, intro_ar, est_minutes)
values ('baseline-v3', 'القياس المبدئي لإدارة المشروعات للقادة', 'baseline', false, 3,
  'يقيس هذا القياس ثلاثة جوانب في كل إطار: ممارستك الفعلية، وحكمك في مواقف العمل، ومعرفتك بالمفاهيم. أسئلة الممارسة ليس فيها إجابة صحيحة، فأجب بما تفعله فعلًا لا بما ينبغي فعله، ونتيجتك لا تُشارك مع جهتك. وفي المواقف اختر ما تراه الأنسب ولو لم يكن ما تفعله عادة.',
  18)
on conflict (key) do nothing;


notify pgrst, 'reload schema';
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-B1', 'behavior', 'أختم اجتماعات المتابعة التي أقودها بقرار موثق له مسؤول وموعد.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 1, 'قيادة اجتماعات القرار', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-B2', 'behavior', 'أتفق مع الجهة المستلمة على معايير قبول المخرج قبل تسليمه.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 2, 'معايير التسليم والقبول', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-B3', 'behavior', 'أراجع مبرر استمرار المشروع عند كل بوابة، حتى لو كان سير العمل جيدًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 3, 'مراجعة مبرر الاستمرار', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-B4', 'behavior', 'أقترح إيقاف عمل حين يتضح أنه لم يعد يخدم الهدف، ولو كان مكتملًا جزئيًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 4, 'إيقاف ما لا يخدم القيمة', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S1', 'skill', 'طُلب منك بناء سجل معالم لمشروع جديد. أي سجل هو الأفضل؟', null, 'choice', '[{"label": "معالم لاكتمال كل مخرج، لكل منها تاريخ ومسؤول", "score": 1}, {"label": "معالم مخرجات وقرارات وقيمة، لكل منها معيار تحقق", "score": 4}, {"label": "معلم في نهاية كل شهر لضمان انتظام التقارير", "score": 0}, {"label": "معالم دفعات العقد مع المورد ومواعيد استحقاق كل دفعة", "score": 1}]'::jsonb, 5, 'بناء سجل المعالم', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S2', 'skill', 'في جلسة بوابة مرحلة: المشروع متأخر ثلاثة أسابيع، ومبرر الاستمرار قائم، والمخاطر معروفة. ما القرار الأنسب؟', null, 'choice', '[{"label": "عبور كامل مع رفع المخاطر إلى سجل اللجنة", "score": 1}, {"label": "عبور مشروط بخطة تصحيح ومعلم مراجعة قريب", "score": 4}, {"label": "تأجيل الجلسة حتى يلحق المشروع بالخطة الأصلية", "score": 1}, {"label": "إيقاف مؤقت حتى يُعاد اعتماد خط الأساس كاملًا", "score": 0}]'::jsonb, 6, 'قرار البوابة', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S3', 'skill', 'تحليل اتجاه المعالم (MTA) يظهر أن تاريخ معلم رئيسي يتأخر أسبوعًا في كل تقرير منذ أربعة أشهر. ما أول خطوة؟', null, 'choice', '[{"label": "مطالبة الفريق بخطة تسريع لتعويض الأسابيع المتأخرة", "score": 1}, {"label": "تحليل السبب الجذري للانزلاق قبل أي تعديل للخطة", "score": 4}, {"label": "اعتماد التاريخ الجديد في خط الأساس وإبلاغ الراعي", "score": 1}, {"label": "الاستمرار في المتابعة لأن تأخير كل تقرير محدود", "score": 0}]'::jsonb, 7, 'قراءة الانزلاق', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S4', 'skill', 'مشروع تنموي ممول من جهة مانحة، وتقارير المنحة ترهق الفريق ولا تُستخدم داخليًا. ما المعالجة الأنسب؟', null, 'choice', '[{"label": "التفاوض مع المانح على تقرير فصلي بدل الشهري", "score": 1}, {"label": "ربط مواعيد التقارير بمعالم القرار الداخلية", "score": 4}, {"label": "إسناد التقارير لموظف متخصص بعيدًا عن الفريق", "score": 1}, {"label": "دمج التقارير في تقرير سنوي واحد شامل", "score": 0}]'::jsonb, 8, 'مواءمة متطلبات المانح', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S5', 'skill', 'في منتصف مرحلة التنفيذ طلب الراعي إضافة خدمة يراها مهمة، ويقدّر الفريق أنها تضيف شهرًا. ما التصرف الأنسب؟', null, 'choice', '[{"label": "إضافتها فورًا لأن طلب الراعي له الأولوية", "score": 0}, {"label": "رفضها حفاظًا على النطاق والموعد المعتمدين", "score": 1}, {"label": "عرض أثرها على الموعد والتكلفة ليقرر الراعي", "score": 4}, {"label": "إضافتها مع تقليص اختبارات الجودة", "score": 0}]'::jsonb, 9, 'ضبط تغيير النطاق', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-S6', 'skill', 'أبلغك المورد أن تسليم مكون رئيسي سيتأخر ستة أسابيع، وهذا الخطر مسجل مسبقًا مع خطة استجابة. ما أول خطوة؟', null, 'choice', '[{"label": "تفعيل خطة الاستجابة المسجلة وإبلاغ أصحاب القرار", "score": 4}, {"label": "مطالبة المورد بغرامة التأخير المنصوص عليها في العقد", "score": 1}, {"label": "إعادة جدولة المشروع كاملًا قبل إبلاغ أي طرف", "score": 0}, {"label": "انتظار تأكيد مكتوب من المورد قبل اتخاذ أي إجراء", "score": 1}]'::jsonb, 10, 'الاستجابة للمخاطر', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K2', 'knowledge', 'ما العلاقة الصحيحة بين بوابة المرحلة (Stage Gate) والمعلم؟', null, 'choice', '[{"label": "هما اسمان مختلفان لنقطة المتابعة نفسها", "score": 0}, {"label": "كل معلم بوابة تتطلب قرارًا رسميًا من اللجنة", "score": 0}, {"label": "كل بوابة مرحلة معلم، وليس كل معلم بوابة", "score": 4}, {"label": "البوابة للبرامج، والمعلم للمشروعات", "score": 0}]'::jsonb, 11, 'البوابة والمعلم', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K4', 'knowledge', 'جهة تطلق برنامجًا متطلباته واضحة ومستقرة، وتشترط اعتماد اللجنة قبل كل مرحلة وصرف الميزانية على دفعات. أي نهج أنسب لإدارته؟', null, 'choice', '[{"label": "نهج تنبؤي بمراحل وبوابات اعتماد", "score": 4}, {"label": "نهج تكيفي بدورات قصيرة وأولويات متغيرة", "score": 0}, {"label": "نهج هجين يبدأ تكيفيًا ثم يصبح تنبؤيًا", "score": 0}, {"label": "إدارة تشغيلية بمؤشرات أداء شهرية", "score": 0}]'::jsonb, 12, 'اختيار نهج الإدارة', 'ch1' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K5', 'knowledge', 'في الجدول الزمني، ماذا يعني أن نشاطًا يقع على المسار الحرج؟', null, 'choice', '[{"label": "أن تأخيره يؤخر موعد انتهاء المشروع مباشرة", "score": 4}, {"label": "أنه أعلى الأنشطة تكلفة في ميزانية المشروع", "score": 0}, {"label": "أنه يحتاج أكبر عدد من أعضاء الفريق", "score": 0}, {"label": "أنه يحمل أعلى درجة مخاطر في سجل المخاطر", "score": 0}]'::jsonb, 13, 'المسار الحرج', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K6', 'knowledge', 'ما الغرض الأساسي من إجراء ضبط التغيير في المشروع؟', null, 'choice', '[{"label": "منع أي تعديل على النطاق بعد اعتماده", "score": 0}, {"label": "تقييم أثر كل تغيير قبل اعتماده أو رفضه", "score": 4}, {"label": "توثيق التغييرات بعد تنفيذها لأغراض التدقيق", "score": 0}, {"label": "إحالة طلبات التغيير إلى الراعي ليقررها وحده", "score": 0}]'::jsonb, 14, 'ضبط التغيير', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K7', 'knowledge', 'ما الفرق بين الخطر (Risk) والمشكلة (Issue)؟', null, 'choice', '[{"label": "الخطر حدث محتمل لم يقع، والمشكلة حدث وقع فعلًا", "score": 4}, {"label": "الخطر يخص التكلفة، والمشكلة تخص الجدول الزمني", "score": 0}, {"label": "الخطر يديره الراعي، والمشكلة يديرها المدير", "score": 0}, {"label": "الخطر مصدره خارجي، والمشكلة مصدرها داخل الفريق", "score": 0}]'::jsonb, 15, 'الخطر والمشكلة', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'milestone', 'M-K8', 'knowledge', 'ما خط الأساس (Baseline) في إدارة المشروعات؟', null, 'choice', '[{"label": "النسخة المعتمدة من الخطة للقياس عليها", "score": 4}, {"label": "أحدث نسخة من الخطة بعد آخر تحديث أجراه فريق المشروع", "score": 0}, {"label": "الحد الأدنى من النطاق المقبول لتسليم المشروع", "score": 0}, {"label": "تقدير أولي للتكلفة قبل دراسة الجدوى التفصيلية", "score": 0}]'::jsonb, 16, 'خط الأساس', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-B1', 'behavior', 'أطلب في مراجعات المشروعات بيانات عما تغيّر لدى المستفيدين، لا عن الأنشطة فقط.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 17, 'سؤال التغيير', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-B2', 'behavior', 'أتأكد أن لكل منفعة أقترحها أو أعتمدها مالكًا محددًا.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 18, 'ملكية المنافع', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-B3', 'behavior', 'أذكر حدود الأدلة في تقارير الأثر التي أعدّها أو أعتمدها.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 19, 'نزاهة الأدلة', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-B4', 'behavior', 'أستخدم مؤشرات الأثر عند ترتيب أولويات المشروعات.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 20, 'الأثر في القرار', 'ch5' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S1', 'skill', 'تبني سجل منافع لبرنامج تدريبي. أي صياغة تصلح منفعةً؟', null, 'choice', '[{"label": "تدريب 500 متدرب خلال العام بنسبة حضور 95%", "score": 0}, {"label": "رفع توظيف الخريجين من 30% إلى 45% خلال 12 شهرًا", "score": 4}, {"label": "رضا المتدربين عن الدورة بنسبة 90% في الاستبانة", "score": 1}, {"label": "إنجاز 40 ساعة تدريبية لكل متدرب حتى نهاية العام", "score": 0}]'::jsonb, 21, 'صياغة المنفعة', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S2', 'skill', 'في مراجعة منافع: منفعة متأخرة عن مسارها 40%، ومالكها يقترح تأجيل القياس للدورة القادمة. ما القرار الأنسب؟', null, 'choice', '[{"label": "الموافقة على التأجيل مع توثيق السبب في السجل", "score": 1}, {"label": "تحليل السبب ثم قرار موثق بتصحيح المسار", "score": 4}, {"label": "ضخ موارد إضافية فورًا لتعويض الفجوة", "score": 1}, {"label": "خفض مستهدف المنفعة ليتوافق مع الأداء الفعلي", "score": 0}]'::jsonb, 22, 'مراجعة المنافع', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S3', 'skill', 'تقرير أثر يذكر أن البرنامج خفّض البطالة في المنطقة 10%، دون خط أساس أو مجموعة مقارنة. كيف تتعامل معه؟', null, 'choice', '[{"label": "أعتمده مع حاشية تذكر غياب خط الأساس", "score": 1}, {"label": "أعيد صياغته بلغة المساهمة مع أدلة", "score": 4}, {"label": "أحذف الرقم وأكتفي بعرض مخرجات البرنامج", "score": 1}, {"label": "أوقف نشر التقرير كاملًا حتى تُجرى دراسة مقارنة", "score": 1}]'::jsonb, 23, 'ادعاءات الأثر', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S4', 'skill', 'برنامج بدأ قبل شهرين دون خط أساس. ما التصرف الأنسب؟', null, 'choice', '[{"label": "بناء خط أساس فوري بالبيانات المتاحة وتوثيق قيوده", "score": 4}, {"label": "اعتماد أول قياس بعد ثلاثة أشهر خطًا للأساس", "score": 1}, {"label": "الاكتفاء بقياس المخرجات حتى نهاية البرنامج", "score": 0}, {"label": "استخدام تقديرات الفريق للوضع الذي سبق بدء البرنامج", "score": 1}]'::jsonb, 24, 'خط الأساس المتأخر', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S5', 'skill', 'تصمم مؤشر أثر لبرنامج يدعم رواد الأعمال. أي مؤشر هو الأنسب؟', null, 'choice', '[{"label": "عدد الورش المنفذة لرواد الأعمال خلال العام", "score": 0}, {"label": "نسبة المشاركين الراضين عن جودة الورش المقدمة", "score": 1}, {"label": "نسبة المنشآت المستمرة بعد عامين من الدعم", "score": 4}, {"label": "عدد طلبات الالتحاق بالبرنامج في كل دورة", "score": 0}]'::jsonb, 25, 'اختيار مؤشر الأثر', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-S6', 'skill', 'أظهرت متابعة برنامج توظيف أن أصحاب العمل صاروا يفضلون خريجيه على غيرهم، فتراجعت فرص المتقدمين من خارجه. ما التصرف الأنسب؟', null, 'choice', '[{"label": "تجاهل الأمر لأنه خارج نطاق مؤشرات البرنامج", "score": 0}, {"label": "تسجيله منفعة سلبية وقياسه وعرضه على صاحب القرار", "score": 4}, {"label": "حذف المؤشر الذي كشف الأثر من تقارير البرنامج", "score": 0}, {"label": "إبلاغ الفريق شفهيًا دون تعديل خطة القياس المعتمدة", "score": 1}]'::jsonb, 26, 'الآثار غير المقصودة', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K1', 'knowledge', '"ارتفاع معرفة المتدربين بالمهارة المستهدفة بعد انتهاء الدورة" يقع في أي مستوى من سلسلة القيمة؟', null, 'choice', '[{"label": "مخرجات", "score": 0}, {"label": "نتائج مباشرة", "score": 4}, {"label": "منافع", "score": 0}, {"label": "أثر مستدام طويل المدى", "score": 0}]'::jsonb, 27, 'مستويات سلسلة القيمة', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K2', 'knowledge', 'في أي حالة تكون لغة "المساهمة" أدق من "الإسناد" في تقرير الأثر؟', null, 'choice', '[{"label": "عند الإبلاغ عن عدد المستفيدين من الخدمة", "score": 0}, {"label": "عند تغيّر مؤشر وطني تؤثر فيه عوامل كثيرة", "score": 4}, {"label": "عندما يكون البرنامج ممولًا من الجهة", "score": 0}, {"label": "عندما يكون التقرير موجهًا للإدارة العليا", "score": 0}]'::jsonb, 28, 'المساهمة والإسناد', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K4', 'knowledge', 'أي ما يلي أقرب إلى نتيجة رئيسية (Key Result) منه إلى مؤشر أداء تشغيلي (KPI)؟', null, 'choice', '[{"label": "متوسط زمن الرد على العملاء أقل من 3 دقائق", "score": 0}, {"label": "نسبة توفر النظام 99.5% في كل شهر", "score": 0}, {"label": "رفع رضا المستفيدين من 60% إلى 80% هذا العام", "score": 4}, {"label": "إنجاز 1200 معاملة يوميًا في مراكز الخدمة كافة", "score": 0}]'::jsonb, 29, 'النتائج الرئيسية ومؤشرات الأداء', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K5', 'knowledge', 'أي عنصر ينقص المؤشر التالي: "رفع نسبة رضا المستفيدين إلى 85% بنهاية 2027"؟', null, 'choice', '[{"label": "خط الأساس للقياس", "score": 4}, {"label": "الجهة المستفيدة من النتيجة", "score": 0}, {"label": "الوحدة التي يُقاس بها المؤشر", "score": 0}, {"label": "صياغة اسم المؤشر بلغة واضحة", "score": 0}]'::jsonb, 30, 'مكونات المؤشر', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K6', 'knowledge', 'ما الذي تضيفه نظرية التغيير (Theory of Change) إلى خطة البرنامج؟', null, 'choice', '[{"label": "قائمة الأنشطة وجدولها الزمني ومسؤولياتها", "score": 0}, {"label": "المسار السببي من الأنشطة إلى الأثر", "score": 4}, {"label": "توزيع الميزانية على المخرجات بحسب أولويتها", "score": 0}, {"label": "مؤشرات الأداء الشهرية لكل فريق من فرق البرنامج", "score": 0}]'::jsonb, 31, 'نظرية التغيير', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'impact', 'I-K7', 'knowledge', 'ما المقصود بالمنفعة السلبية (Dis-benefit)؟', null, 'choice', '[{"label": "منفعة متوقعة لم تتحقق في موعدها المحدد", "score": 0}, {"label": "نتيجة يراها طرف سلبية وتنتج عن التغيير", "score": 4}, {"label": "تكلفة إضافية تتجاوز الميزانية المعتمدة", "score": 0}, {"label": "منفعة تحققت لكن لا يمكن قياسها بدقة كافية", "score": 0}]'::jsonb, 32, 'المنافع السلبية', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-B1', 'behavior', 'أغيّر طريقة قيادتي للشخص بحسب خبرته في المهمة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 33, 'المرونة القيادية', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-B2', 'behavior', 'أحافظ على هدوئي في الاجتماعات المتوترة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 34, 'ضبط الانفعال', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-B3', 'behavior', 'أوثّق المخاطر والقرارات المعلقة عند تسليم أي عهدة.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 35, 'توثيق العهدة', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-B4', 'behavior', 'أشرح لفريقي سبب التغيير قبل توزيع المهام.', 'فكّر في آخر 12 شهرًا من عملك. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}, {"label": "لا ينطبق على عملي", "score": -1}]'::jsonb, 36, 'شرح سبب التغيير', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S1', 'skill', 'كلّفت عضوًا انضم حديثًا بإعداد أول خطة تواصل في مسيرته، وهو يبادر ويطلب مزيدًا من المهام. ما الأسلوب الأنسب معه في هذه المهمة؟', null, 'choice', '[{"label": "تفويض المهمة كاملة مع موعد تسليم واضح", "score": 0}, {"label": "تعليمات محددة ومتابعة قريبة لكل خطوة", "score": 4}, {"label": "تشجيعه ودعمه وترك طريقة التنفيذ له", "score": 1}, {"label": "شرح المطلوب ثم مراجعة النسخة النهائية فقط", "score": 1}]'::jsonb, 37, 'توجيه عضو جديد', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S2', 'skill', 'خلاف مع إدارة موازية على مورد مشترك. القضية مهمة لمشروعك، والعلاقة ممتدة، وأمامكما أسبوعان قبل الحاجة إلى المورد. ما الأنسب؟', null, 'choice', '[{"label": "حسم المورد لصالح مشروعك عبر الإدارة العليا", "score": 1}, {"label": "جلسة مشتركة لبناء حل يلبي حاجة الطرفين", "score": 4}, {"label": "تقاسم المورد مناصفة لإنهاء الخلاف سريعًا", "score": 2}, {"label": "تأجيل الموضوع حفاظًا على العلاقة بينكما", "score": 0}]'::jsonb, 38, 'إدارة الخلاف', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S3', 'skill', 'وصلك توجيه عاجل من الإدارة العليا بصياغة عامة. ما أول خطوة؟', null, 'choice', '[{"label": "البدء بالتنفيذ فورًا لإظهار سرعة الاستجابة", "score": 1}, {"label": "إقرار الاستلام والتحقق من المقصود قبل التحرك", "score": 4}, {"label": "انتظار وصول تفاصيل إضافية مكتوبة من مكتب المسؤول", "score": 0}, {"label": "تمرير التوجيه للفريق كما وصل لبدء العمل", "score": 0}]'::jsonb, 39, 'تلقي التوجيه', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S4', 'skill', 'مسؤول له نفوذ عالٍ على قرارات مشروعك، لكنه قليل الاهتمام بتفاصيله. ما الأنسب معه؟', null, 'choice', '[{"label": "اجتماع أسبوعي لاطلاعه على كل التفاصيل", "score": 1}, {"label": "إحاطة موجزة عند كل نقطة قرار تخص جهته", "score": 4}, {"label": "الاكتفاء بنسخة من التقرير الشهري العام", "score": 1}, {"label": "التواصل معه فقط عند ظهور مشكلة كبيرة", "score": 0}]'::jsonb, 40, 'إدارة أصحاب المصلحة', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S5', 'skill', 'ستنتقل إلى مهمة جديدة بعد أسبوعين، وسيتسلم زميلك مشروعك. ما الأنسب؟', null, 'choice', '[{"label": "تسليمه الملفات كاملة مع محضر رسمي موقّع", "score": 1}, {"label": "مرافقته في الاجتماعات والقرارات حتى يقودها بنفسه", "score": 4}, {"label": "إعداد تقرير مفصل عن حالة المشروع وإرساله إليه", "score": 1}, {"label": "إبقاء قنوات التواصل مفتوحة لأي سؤال يطرأ لاحقًا", "score": 1}]'::jsonb, 41, 'التسليم والتسلم', 'ch3' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-S6', 'skill', 'اتضح لك أن البرنامج لن يحقق مستهدفه السنوي، ومراجعة الأداء مع المسؤول الأعلى بعد أسبوع. ما الأنسب؟', null, 'choice', '[{"label": "إبلاغه الآن بالأسباب وخيارات المعالجة", "score": 4}, {"label": "عرض الأمر في المراجعة كما هو مجدول", "score": 1}, {"label": "التركيز على المؤشرات المتحققة فقط", "score": 0}, {"label": "طلب تأجيل المراجعة حتى تتحسن المؤشرات", "score": 0}]'::jsonb, 42, 'إيصال الأخبار الصعبة', 'ch2' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K2', 'knowledge', 'في القيادة الموقفية، على أي أساس يُختار أسلوب القائد مع الفرد؟', null, 'choice', '[{"label": "شخصية القائد وما اعتاد عليه", "score": 0}, {"label": "قدرة الفرد ورغبته في المهمة المحددة", "score": 4}, {"label": "أقدمية الفرد ومستواه الوظيفي", "score": 0}, {"label": "حجم المشروع وحساسية مخرجاته للجهة المالكة", "score": 0}]'::jsonb, 43, 'القيادة الموقفية', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K5', 'knowledge', 'مدير مشروع يحتاج تعاون إدارة لا سلطة له عليها. ما الأساس الأقوى للتأثير فيها؟', null, 'choice', '[{"label": "رفع الأمر إلى الإدارة العليا لإلزامها بالتعاون", "score": 0}, {"label": "ربط طلبه بمصلحة تهم تلك الإدارة نفسها", "score": 4}, {"label": "الاستناد إلى أقدميته وخبرته الطويلة في الجهة", "score": 0}, {"label": "تكرار الطلب رسميًا حتى تستجيب الإدارة", "score": 0}]'::jsonb, 44, 'التأثير دون سلطة', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K6', 'knowledge', 'ما المقصود بالأمان النفسي في الفريق؟', null, 'choice', '[{"label": "ثقة الأعضاء بأن الاعتراض والخطأ لا يجلبان العقاب", "score": 4}, {"label": "ضمان استقرار وظائف الأعضاء حتى نهاية المشروع", "score": 0}, {"label": "تجنب الخلافات داخل الفريق حفاظًا على الانسجام", "score": 0}, {"label": "حماية الفريق من ضغط الإدارة العليا ومطالبها المتكررة", "score": 0}]'::jsonb, 45, 'الأمان النفسي', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K7', 'knowledge', 'في مصفوفة المسؤوليات (RACI)، من يمثله الحرف A؟', null, 'choice', '[{"label": "من ينفذ العمل بنفسه", "score": 0}, {"label": "من يُستشار قبل التنفيذ", "score": 0}, {"label": "من يُحاسب على النتيجة", "score": 4}, {"label": "من يُبلَّغ بعد اتخاذ القرار", "score": 0}]'::jsonb, 46, 'المساءلة', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K8', 'knowledge', 'وفق نموذج كوتر لقيادة التغيير، ما الخطوة الأولى؟', null, 'choice', '[{"label": "صياغة رؤية التغيير ونشرها", "score": 0}, {"label": "بناء الإحساس بضرورة التغيير", "score": 4}, {"label": "تحقيق مكاسب سريعة ظاهرة", "score": 0}, {"label": "تشكيل تحالف قيادي داعم", "score": 0}]'::jsonb, 47, 'قيادة التغيير', 'ch6' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort, competency_ar, chapter_key)
select id, 'leadership', 'L-K9', 'knowledge', 'أي صياغة للملاحظة على أداء زميل هي الأكثر فاعلية؟', null, 'choice', '[{"label": "أنت لا تهتم بمواعيد التسليم كما ينبغي", "score": 0}, {"label": "تأخر تقريرك يومين فتأخر قرار اللجنة", "score": 4}, {"label": "أرجو أن تكون أكثر التزامًا في الفترة القادمة", "score": 0}, {"label": "الفريق كله لاحظ أن أداءك تراجع في الفترة الأخيرة", "score": 0}]'::jsonb, 48, 'الملاحظة البنّاءة', 'ch4' from leaders.instruments where key = 'baseline-v3'
on conflict (instrument_id, code) do nothing;

notify pgrst, 'reload schema';
