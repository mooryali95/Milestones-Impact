-- ════════════════════════════════════════════════════════════════
-- مشروع التخرج القيادي: «وثيقة المبادرة»
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. يُشغَّل بعد 20261026160000_leaders_book_v4.
--
-- مبدأ واحد: لكل معلومة مصدر واحد، والباقي يستورد منه.
--   1) فصول الوثيقة هي النماذج التعليمية نفسها: عمود capstone_sort يضع
--      النموذج في الوثيقة بترتيبه، وscopes يقصره على نطاق (مشروع، برنامج،
--      محفظة). محرر واحد للإدارة، وقائمة تقييم واحدة، ونقاط واحدة.
--   2) حقول النموذج تتعمق بالمستوى (min_level) والنطاق (scopes) داخل
--      النموذج نفسه، بدل نسخة لكل مستوى.
--   3) اسم المبادرة يُكتب مرة في «بطاقة المبادرة»، وحقول اسم المشروع في
--      النماذج الأخرى مربوطة به (bind). وجدول يُبنى على آخر يستورد صفوفه
--      منه (import): مخاطر البوابة من سجل المخاطر، وخطة الأدلة من المنافع.
--   4) متطلبات الرحلة التي كانت رفع ملفات لنفس العمل (O-MREG، O-BREG،
--      O-GATE، L-MAP، L-PLAN) تصبح من نوع «نموذج»: تكتمل من تسليم النموذج
--      أو تقييمه، فلا نسخة ثانية من العمل في ملف مرفوع.
--   5) متطلبان جديدان في كل برنامج: بطاقة المبادرة أول التدريب، واعتماد
--      الوثيقة في مرحلة التقييم.
--   6) جدول capstones لحالة الوثيقة وحدها: التسليم، ومعيار المستشار،
--      وتأييد الراعي، والاعتماد، ولقطة الوثيقة المعتمدة. المحتوى نفسه في
--      model_submissions لا يتكرر.
-- ما حرّرته الإدارة لا يُمس: كل إضافة لا تقع إلا إن غابت، وكل تعديل
-- مشروط بالقيمة الأصلية.

-- ════════════ 1) أعمدة النماذج ════════════
alter table leaders.learning_models add column if not exists capstone_sort smallint;
alter table leaders.learning_models add column if not exists scopes text[] not null default '{}';
create index if not exists learning_models_capstone_idx on leaders.learning_models (capstone_sort) where capstone_sort is not null;

-- ════════════ 2) النماذج الجديدة ════════════
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, capstone_sort, scopes, fields) values
('milestone', 'initiative-charter', 10, $q$بطاقة المبادرة$q$, $q$✦$q$,
 $q$الصفحة الأولى في وثيقة مبادرتك: ما المبادرة، ولماذا، وحدودها، ومن يرعاها. منها يأخذ كل نموذج آخر اسم المبادرة.$q$,
 $q$في أول التدريب، قبل أي نموذج آخر، وتُحدَّث إن تغيّر النطاق.$q$,
 $q$اختر مبادرة حقيقية تقودها أو ستقودها في جهتك خلال البرنامج.
اكتب المشكلة أو الفرصة بالأرقام، لا بالوصف.
اربطها بهدف استراتيجي معلن في جهتك.
حدد ما داخل النطاق وما خارجه بوضوح.
سمِّ راعيها من الجهة، فهو من يؤيد الوثيقة قبل اعتمادها.$q$,
 $q$مستلهم من وثيقة بدء المشروع في PRINCE2 (Axelos) وميثاق المشروع في PMBOK (PMI)$q$,
 'beginner', 20, 10, '{}',
 $q$[
  {"key": "title", "label": "اسم المبادرة", "type": "text", "hint": "يظهر في كل نماذجك ووثيقتك كما تكتبه هنا", "required": true},
  {"key": "objective", "label": "الهدف الاستراتيجي الذي تخدمه في جهتك", "type": "textarea", "hint": "اذكر الهدف كما هو في استراتيجية الجهة أو برنامجها", "required": true},
  {"key": "problem", "label": "المشكلة أو الفرصة بالأرقام", "type": "textarea", "hint": "مثال على الصيغة: المؤشر الآن، ومصدره، والفجوة عن المستهدف", "required": true},
  {"key": "in_scope", "label": "داخل النطاق", "type": "textarea", "hint": "", "required": true},
  {"key": "out_scope", "label": "خارج النطاق", "type": "textarea", "hint": "ما قد يتوقعه أحد ولن تقدمه المبادرة", "required": true},
  {"key": "deliverables", "label": "المخرجات الرئيسة", "type": "table", "columns": ["المخرج", "معيار القبول", "الموعد"], "min_rows": 3, "hint": "", "required": true},
  {"key": "start", "label": "تاريخ البدء", "type": "text", "hint": "بصيغة 2026-03-15", "required": true},
  {"key": "end", "label": "تاريخ الانتهاء المستهدف", "type": "text", "hint": "بصيغة 2026-12-31", "required": true},
  {"key": "sponsor", "label": "الراعي: الاسم والمنصب", "type": "text", "hint": "صاحب القرار في الجهة الذي تخدم المبادرة أولوياته", "required": true},
  {"key": "sponsor_email", "label": "بريد الراعي", "type": "text", "hint": "يصله طلب تأييد الوثيقة بعد مراجعة المستشار", "required": true},
  {"key": "constraints", "label": "القيود والافتراضات الكبرى", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('impact', 'options-analysis', 10, $q$المسوغ والبدائل$q$, $q$⚖$q$,
 $q$لماذا هذه المبادرة الآن، ولماذا هذا الحل دون غيره: دليل على المشكلة، وبدائل تُقارن، وتوصية مسببة.$q$,
 $q$بعد بطاقة المبادرة، وقبل الالتزام بخطة أو ميزانية.$q$,
 $q$اجمع دليلين على الأقل على حجم المشكلة من مصادر معروفة.
اكتب ثلاثة بدائل على الأقل، أولها عدم التدخل.
قارن كل بديل بالتكلفة والمنفعة والمخاطر.
اكتب توصيتك ولماذا تتفوق على البدائل الأخرى.$q$,
 $q$مستلهم من حالة العمل في PRINCE2 ونموذج الحالات الخمس (Five Case Model) لوزارة الخزانة البريطانية$q$,
 'beginner', 30, 20, '{}',
 $q$[
  {"key": "evidence", "label": "الدليل على المشكلة", "type": "table", "columns": ["المؤشر", "القيمة الحالية", "المصدر"], "min_rows": 2, "hint": "", "required": true},
  {"key": "options", "label": "البدائل", "type": "table", "columns": ["البديل", "الوصف", "التكلفة التقديرية", "المنفعة المتوقعة", "المخاطر الرئيسة"], "min_rows": 3, "hint": "البديل الأول: عدم التدخل (الوضع الحالي)", "required": true},
  {"key": "criteria", "label": "معايير المقارنة وأوزانها", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"},
  {"key": "recommendation", "label": "التوصية ومبررها", "type": "textarea", "hint": "", "required": true}
 ]$q$::jsonb),

('milestone', 'wbs', 11, $q$هيكل تجزئة العمل$q$, $q$▤$q$,
 $q$كل عمل المبادرة مجزأ إلى حزم لكل منها مخرج ومالك، بقاعدة 100%: ما ليس في الهيكل ليس في المبادرة.$q$,
 $q$بعد اعتماد النطاق في بطاقة المبادرة، وقبل الجدول والتكلفة.$q$,
 $q$ابدأ بالمخرجات الرئيسة في بطاقة المبادرة، واجعلها المستوى الأول.
جزّئ كل مخرج إلى حزم عمل يمكن تقديرها وتسليمها.
رمّز الحزم ترميزًا هرميًا: 1، 1.1، 1.2، 2 …
سمِّ مالكًا واحدًا لكل حزمة.
تحقق أن مجموع الحزم يساوي النطاق كله، لا أكثر ولا أقل.$q$,
 $q$مستلهم من معيار PMI لهيكل تجزئة العمل وPMBOK$q$,
 'beginner', 40, 30, '{}',
 $q$[
  {"key": "packages", "label": "حزم العمل", "type": "table", "columns": ["الرمز", "حزمة العمل", "المخرج", "المالك", "المدة (أيام)"], "min_rows": 8, "hint": "في البرنامج: المستوى الأول هو المشاريع المكونة. في المحفظة: المبادرات", "required": true},
  {"key": "dictionary", "label": "قاموس الحزم: معيار اكتمال أهم ثلاث حزم", "type": "textarea", "hint": "", "required": true},
  {"key": "rule", "label": "كيف تحققت من قاعدة 100%", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('milestone', 'schedule', 12, $q$الجدول الزمني والمسار الحرج$q$, $q$▦$q$,
 $q$الأنشطة بتواريخها واعتمادياتها، يُرسم منها المخطط الزمني في الوثيقة ويُعرف المسار الحرج.$q$,
 $q$بعد هيكل تجزئة العمل.$q$,
 $q$انقل حزم العمل أو أنشطتها برموزها من هيكل التجزئة.
اكتب لكل نشاط بدايته ونهايته بصيغة 2026-03-15.
اكتب في «يعتمد على» رموز الأنشطة التي يجب أن تسبقه.
حدد المسار الحرج: أطول سلسلة اعتماديات، وأي تأخير فيها يؤخر المبادرة كلها.$q$,
 $q$مستلهم من أسلوب المسار الحرج (CPM) وPMBOK$q$,
 'beginner', 40, 45, '{}',
 $q$[
  {"key": "activities", "label": "الأنشطة", "type": "table", "columns": ["الرمز", "النشاط أو الحزمة", "البداية", "النهاية", "يعتمد على"], "min_rows": 6, "hint": "التاريخ بصيغة 2026-03-15، والاعتماديات رموز مفصولة بفاصلة", "required": true},
  {"key": "critical", "label": "المسار الحرج وما الذي يهدده", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"},
  {"key": "buffer", "label": "الاحتياطي الزمني ومكانه ومبرره", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"},
  {"key": "sensitivity", "label": "سيناريو التأخير: أثر تأخر أخطر نشاط شهرًا", "type": "textarea", "hint": "", "required": true, "min_level": "advanced"}
 ]$q$::jsonb),

('milestone', 'cost-plan', 13, $q$الموارد والتكلفة$q$, $q$◫$q$,
 $q$تقدير تكلفة المبادرة من حزم عملها، مع الاحتياطي ومصدر التمويل، ويُقارن تلقائيًا بالميزانية المتاحة.$q$,
 $q$بعد هيكل تجزئة العمل والجدول.$q$,
 $q$قدّر تكلفة كل حزمة بندًا بندًا، واكتب رمز الحزمة من هيكل التجزئة.
اكتب الكمية وسعر الوحدة، والإجمالي يُحسب إن تركته.
اكتب الميزانية المتاحة أو المعتمدة بالريال.
حدد نسبة الاحتياطي ومبررها من المخاطر.
اذكر مصدر التمويل ومن يعتمده.$q$,
 $q$مستلهم من تقدير التكلفة من أسفل لأعلى في PMBOK وإدارة الاحتياطي$q$,
 'beginner', 40, 50, '{}',
 $q$[
  {"key": "items", "label": "بنود التكلفة", "type": "table", "columns": ["رمز الحزمة", "البند", "الكمية", "سعر الوحدة", "الإجمالي"], "min_rows": 5, "hint": "المبالغ بالريال، أرقام فقط", "required": true},
  {"key": "envelope", "label": "الميزانية المتاحة أو المعتمدة (ريال)", "type": "text", "hint": "رقم فقط", "required": true},
  {"key": "contingency", "label": "نسبة الاحتياطي %", "type": "text", "hint": "رقم من 0 إلى 50", "required": true, "min_level": "intermediate"},
  {"key": "funding", "label": "مصدر التمويل ومن يعتمده", "type": "textarea", "hint": "", "required": true},
  {"key": "cba", "label": "التكلفة مقابل المنفعة: متى تسترد المبادرة كلفتها", "type": "textarea", "hint": "قيمة المنافع السنوية بالريال مقابل التكلفة، وفترة الاسترداد", "required": true, "min_level": "advanced"}
 ]$q$::jsonb),

('milestone', 'roadmap', 14, $q$خريطة طريق البرنامج$q$, $q$⇶$q$,
 $q$البرنامج مقسّم إلى دفعات، لكل دفعة مشاريعها ومنافعها، وصولًا إلى الحالة المستهدفة.$q$,
 $q$لمن يقود برنامجًا، بعد هيكل التجزئة.$q$,
 $q$اكتب الحالة المستهدفة بعد البرنامج في فقرة.
قسّم البرنامج إلى دفعات تنتهي كل منها بمنفعة يمكن قياسها.
وزّع المشاريع المكونة على الدفعات.
اذكر الاعتماديات بين المشاريع وكيف تديرها.$q$,
 $q$مستلهم من MSP (Axelos): المخطط والدفعات وتحقق المنافع$q$,
 'beginner', 40, 55, '{program}',
 $q$[
  {"key": "blueprint", "label": "الحالة المستهدفة بعد البرنامج", "type": "textarea", "hint": "", "required": true},
  {"key": "tranches", "label": "الدفعات", "type": "table", "columns": ["الدفعة", "المشاريع المكونة", "البداية", "النهاية", "المنافع المتوقعة"], "min_rows": 3, "hint": "", "required": true},
  {"key": "dependencies", "label": "الاعتماديات بين المشاريع وإدارتها", "type": "textarea", "hint": "", "required": true},
  {"key": "resources", "label": "التنازع على الموارد المشتركة وقواعد حسمه", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('leadership', 'governance', 10, $q$الحوكمة والمسؤوليات$q$, $q$⌘$q$,
 $q$من يقرر ماذا ومتى: هيكل الحوكمة، وإيقاع القرار، ومصفوفة مسؤوليات بمحاسب واحد لكل بند.$q$,
 $q$بعد هيكل تجزئة العمل، وقبل بدء التنفيذ.$q$,
 $q$ارسم هيكل الحوكمة: الراعي، ومجلس المبادرة، والفريق.
حدد اجتماعات القرار وتكرارها وما يُقرر فيها.
انقل حزم العمل الرئيسة من هيكل التجزئة إلى المصفوفة.
اجعل لكل بند محاسبًا واحدًا (A) فقط.$q$,
 $q$مستلهم من مصفوفة RACI وأدوار الحوكمة في PRINCE2$q$,
 'beginner', 35, 60, '{}',
 $q$[
  {"key": "structure", "label": "هيكل الحوكمة: من يقرر ماذا", "type": "textarea", "hint": "", "required": true},
  {"key": "cadence", "label": "إيقاع القرار", "type": "table", "columns": ["الاجتماع", "التكرار", "القرار المتخذ فيه", "الرئيس"], "min_rows": 2, "hint": "", "required": true},
  {"key": "raci", "label": "مصفوفة المسؤوليات", "type": "table", "columns": ["حزمة العمل أو القرار", "المسؤول R", "المحاسب A", "المستشار C", "المُطّلع I"], "min_rows": 5, "hint": "اكتب رمز الحزمة أو اسمها كما في هيكل التجزئة", "required": true},
  {"key": "escalation", "label": "حدود الصلاحية ومسار التصعيد", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('milestone', 'raid', 15, $q$سجل المخاطر والافتراضات والاعتماديات$q$, $q$⚠$q$,
 $q$سجل واحد للمخاطر والافتراضات والاعتماديات والقضايا، كل بند بمالك واستجابة ومرتبط بحزمة في الخطة.$q$,
 $q$من بداية التخطيط، ويُراجع في كل اجتماع قرار.$q$,
 $q$اكتب ستة بنود على الأقل، منها مخاطر وافتراضات واعتماديات.
قدّر الاحتمال والأثر من 1 إلى 5.
البند الذي حاصل ضرب احتماله في أثره 12 فأكثر عالٍ: له مالك واستجابة محددة.
اربط كل بند برمز الحزمة التي يمسها من هيكل التجزئة.$q$,
 $q$مستلهم من سجل RAID وإدارة المخاطر في PRINCE2 وISO 31000$q$,
 'beginner', 35, 80, '{}',
 $q$[
  {"key": "items", "label": "البنود", "type": "table", "columns": ["الرمز", "النوع (خطر، افتراض، اعتمادية، قضية)", "الوصف", "الاحتمال (1 إلى 5)", "الأثر (1 إلى 5)", "المالك", "الاستجابة", "مرتبط بحزمة"], "min_rows": 6, "hint": "", "required": true},
  {"key": "appetite", "label": "شهية المخاطرة: ما الذي تقبله الجهة وما لا تقبله", "type": "textarea", "hint": "", "required": true, "min_level": "advanced"}
 ]$q$::jsonb),

('impact', 'evidence-plan', 11, $q$خطة القياس والأدلة$q$, $q$◎$q$,
 $q$كيف ستثبت أن المنافع تحققت: لكل مؤشر مصدره وتكراره ومسؤوله وطريقة التحقق منه.$q$,
 $q$بعد سجل المنافع، وقبل بدء التنفيذ حتى يُقاس خط الأساس.$q$,
 $q$استورد مؤشرات المنافع من سجل المنافع.
حدد لكل مؤشر مصدر بياناته وتكرار قياسه ومسؤوله.
اكتب كيف يُتحقق من صحة القياس.
بيّن كيف تحمي بيانات الأشخاص في القياس.$q$,
 $q$مستلهم من خطة الرصد والتقييم ومعايير جودة المؤشرات، ونظام حماية البيانات الشخصية$q$,
 'beginner', 30, 100, '{}',
 $q$[
  {"key": "plan", "label": "خطة القياس", "type": "table", "columns": ["المؤشر", "المصدر", "التكرار", "المسؤول", "طريقة التحقق"], "min_rows": 3, "hint": "", "required": true, "import": {"model": "benefits-register", "field": "benefits"}},
  {"key": "privacy", "label": "حماية البيانات الشخصية في القياس", "type": "textarea", "hint": "ما الذي يُجمع، ومن يطلع عليه، وكيف يُخفى ما يدل على الأشخاص", "required": true},
  {"key": "attribution", "label": "المساهمة والإسناد: كيف تميّز أثر المبادرة من العوامل الأخرى", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('leadership', 'change-sustain', 11, $q$قيادة التغيير والاستدامة$q$, $q$↻$q$,
 $q$من تمسّه المبادرة وكيف تهيئه، ومن يتسلّم بعد الإغلاق، وما يحمي المنافع من التلاشي.$q$,
 $q$أثناء التخطيط، وتُحدَّث قبل الإغلاق.$q$,
 $q$حدد الفئات التي يتغير عملها بسبب المبادرة.
قدّر جاهزية كل فئة، وحدد التدخل المناسب.
اكتب خطة التسليم والتسلم: من يشغّل بعد الإغلاق، وماذا يتسلّم، ومتى.
اذكر ما يضمن استمرار المنافع بعد انتهاء المبادرة.$q$,
 $q$مستلهم من نموذج ADKAR (Prosci) ومراحل Kotter وانتقال الأعمال في ITIL$q$,
 'beginner', 35, 110, '{}',
 $q$[
  {"key": "impacted", "label": "الفئات المتأثرة", "type": "table", "columns": ["الفئة المتأثرة", "ما الذي يتغير عليها", "الجاهزية (منخفضة، متوسطة، عالية)", "التدخل"], "min_rows": 3, "hint": "", "required": true},
  {"key": "handover", "label": "التسليم والتسلم: من يشغّل بعد الإغلاق وكيف", "type": "textarea", "hint": "", "required": true},
  {"key": "sustain", "label": "ما يضمن استمرار المنافع بعد المبادرة", "type": "textarea", "hint": "", "required": true},
  {"key": "resistance", "label": "المقاومة المتوقعة وخطة التعامل معها", "type": "textarea", "hint": "", "required": true, "min_level": "intermediate"}
 ]$q$::jsonb),

('leadership', 'transformation-story', 12, $q$قصة التحول$q$, $q$✧$q$,
 $q$الفصل الأخير في وثيقتك: أين كانت المبادرة، وما الذي غيّرته أنت فيها، وما الدليل، وماذا تعلمت عن نفسك قائدًا.$q$,
 $q$في نهاية البرنامج، قبل تسليم الوثيقة.$q$,
 $q$صف نقطة البداية بصدق: المبادرة وأنت.
اذكر قرارين أو ثلاثة اتخذتها قائدًا وغيّرت المسار.
قدّم دليلًا على كل تغيير: رقم، أو وثيقة، أو شهادة من صاحب مصلحة.
اكتب ما ستفعله بشكل مختلف في مبادرتك القادمة.$q$,
 $q$مستلهم من التعلم التأملي (Kolb) وممارسة التأمل القيادي$q$,
 'beginner', 30, 130, '{}',
 $q$[
  {"key": "before", "label": "أين كانت المبادرة وأين كنت", "type": "textarea", "hint": "", "required": true},
  {"key": "decisions", "label": "قرارات قيادية غيّرت المسار", "type": "table", "columns": ["القرار", "لماذا اتخذته", "ما الذي تغيّر بسببه", "الدليل"], "min_rows": 2, "hint": "", "required": true},
  {"key": "lessons", "label": "ما تعلمته عن نفسك قائدًا، وما ستفعله بشكل مختلف", "type": "textarea", "hint": "", "required": true}
 ]$q$::jsonb)
on conflict (key) do nothing;

-- ════════════ 3) النماذج القائمة في الوثيقة ════════════
-- ترتيبها بين الفصول، دون مس ما رتبته الإدارة
update leaders.learning_models m set capstone_sort = v.o
  from (values ('milestone-register', 40), ('stakeholder-map', 70), ('stage-gate', 85), ('theory-of-change', 90),
               ('benefits-register', 95), ('development-plan', 120), ('portfolio-review', 56)) as v(k, o)
 where m.key = v.k and m.capstone_sort is null;
-- مراجعة المحفظة لمن يدير محفظة فقط
update leaders.learning_models set scopes = '{portfolio}' where key = 'portfolio-review' and scopes = '{}';

-- حقول اسم المشروع في النماذج القائمة: مربوطة باسم المبادرة، فلا تُكتب مرتين
update leaders.learning_models m
   set fields = (
     select jsonb_agg(case when f->>'type' = 'text' and f->>'key' in ('project', 'program', 'portfolio')
                           then f || '{"bind": "initiative", "hint": "من بطاقة المبادرة"}'::jsonb else f end order by ord)
       from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
 where m.key in ('milestone-register', 'stage-gate', 'portfolio-review', 'benefits-register', 'theory-of-change', 'impact-report', 'stakeholder-map')
   and not m.fields @> '[{"bind": "initiative"}]'::jsonb;

-- مخاطر ورقة البوابة تُستورد من سجل المخاطر بدل إعادة كتابتها
update leaders.learning_models m
   set fields = (
     select jsonb_agg(case when f->>'key' = 'risks' and f->>'type' = 'table'
                           then f || '{"import": {"model": "raid", "field": "items"}, "hint": "استوردها من سجل المخاطر ثم أبقِ المفتوح منها"}'::jsonb else f end order by ord)
       from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
 where m.key = 'stage-gate' and not m.fields @> '[{"key": "risks", "import": {"model": "raid"}}]'::jsonb;

-- ════════════ 4) متطلبات الرحلة: من رفع ملف إلى النموذج نفسه ════════════
alter table leaders.stage_requirements drop constraint if exists stage_requirements_kind_check;
alter table leaders.stage_requirements add constraint stage_requirements_kind_check
  check (kind in ('check', 'upload', 'form', 'meeting', 'reading', 'auto', 'video', 'workshop', 'coaching', 'curriculum', 'model', 'capstone'));

update leaders.stage_requirements r
   set kind = 'model', needs_review = false,
       config = jsonb_build_object('model_key', v.k, 'accept', 'reviewed'),
       help_ar = coalesce(r.help_ar, $q$يكتمل من نموذج «$q$ || v.t || $q$» في مكتبة النماذج حين يقيّمه المستشار، وهو فصل في وثيقة مبادرتك.$q$)
  from (values ('O-MREG', 'milestone-register', 'سجل المعالم'), ('O-BREG', 'benefits-register', 'سجل المنافع'),
               ('O-GATE', 'stage-gate', 'ورقة قرار بوابة المرحلة'), ('L-MAP', 'stakeholder-map', 'خريطة أصحاب المصلحة'),
               ('L-PLAN', 'development-plan', 'خطة التطوير القيادي')) as v(code, k, t)
 where r.code = v.code and r.kind = 'upload';

-- الجلسة الاستشارية: مراجعة تصميم منتصف الرحلة على الوثيقة نفسها
update leaders.stage_requirements
   set help_ar = $q$مراجعة تصميم منتصف الرحلة: يراجع المستشار معك وثيقة مبادرتك وجاهزيتها قبل التنفيذ.$q$
 where code = 'C-MEET' and help_ar is null;

-- بطاقة المبادرة أول التدريب، واعتماد الوثيقة في التقييم، لكل برنامج فيه المرحلتان
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, config)
select s.program_id, 'training', null, null, 'CP-CARD', 0, $q$بطاقة مبادرتك: بداية مشروع التخرج$q$,
       $q$اختر مبادرة حقيقية في جهتك واكتب بطاقتها. منها يبدأ مشروع تخرجك وتأخذ نماذجك اسمها.$q$,
       'model', true, false, '{"model_key": "initiative-charter", "accept": "submitted"}'::jsonb
  from leaders.journey_stages s where s.key = 'training'
on conflict (program_id, code) do nothing;

insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, config)
select s.program_id, 'evaluation', null, null, 'CP-FINAL', 0, $q$اعتماد وثيقة مبادرتك (مشروع التخرج)$q$,
       $q$تسلّم الوثيقة حين تكتمل فصولها وتبلغ جاهزيتها 80%، فيقيّمها المستشار ويؤيدها راعيها في جهتك.$q$,
       'capstone', true, false, '{}'::jsonb
  from leaders.journey_stages s where s.key = 'evaluation'
on conflict (program_id, code) do nothing;

-- ════════════ 5) حالة الوثيقة ════════════
create table if not exists leaders.capstones (
  participant_id     uuid primary key references leaders.participants(id) on delete cascade,
  status             text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'accepted', 'approved')),
  summary_ar         text check (summary_ar is null or char_length(summary_ar) <= 3000),
  readiness          smallint,
  revisions          smallint not null default 0,
  submitted_at       timestamptz,
  -- معيار المستشار: ستة أبعاد من 1 إلى 4، وملاحظة لكل بعد، والدرجة من 100
  scores             jsonb,
  notes              jsonb,
  review_note        text check (review_note is null or char_length(review_note) <= 3000),
  score              numeric(5, 1),
  reviewed_by        text,
  reviewed_at        timestamptz,
  -- تأييد الراعي: رابط خاص بلا حساب، يُخزَّن رمزه مجزّأً
  sponsor_name       text,
  sponsor_email      text,
  sponsor_token_hash text unique,
  sponsor_status     text check (sponsor_status is null or sponsor_status in ('pending', 'endorsed', 'declined')),
  sponsor_note       text check (sponsor_note is null or char_length(sponsor_note) <= 2000),
  sponsor_invited_at timestamptz,
  sponsor_expires_at timestamptz,
  sponsor_at         timestamptz,
  sponsor_waived     text check (sponsor_waived is null or char_length(sponsor_waived) <= 500),
  approved_at        timestamptz,
  approved_by        text,
  -- لقطة الوثيقة كما اعتُمدت: نسخة السجل التي لا تتغير بتعديل لاحق
  snapshot           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists capstones_status_idx on leaders.capstones (status, submitted_at);
alter table leaders.capstones enable row level security;

-- ════════════ 6) اسم الجهة: مصدره جدول الجهات ════════════
-- اسم الجهة في ملف المشارك نسخة تُستورد من الجهة المرتبطة: تُحدَّث عند الربط
-- وعند تغيير اسم الجهة، فلا يظهر للجهة الواحدة اسمان في التقارير والشهادات.
create or replace function leaders.sync_participant_org_name() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is not null and (tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id or new.organization_name is distinct from old.organization_name) then
    select o.name into new.organization_name from leaders.organizations o where o.id = new.organization_id;
  end if;
  return new;
end $$;
drop trigger if exists participants_org_name on leaders.participants;
create trigger participants_org_name before insert or update of organization_id, organization_name on leaders.participants
  for each row execute function leaders.sync_participant_org_name();

create or replace function leaders.sync_org_name_to_participants() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update leaders.participants set organization_name = new.name where organization_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists organizations_name_sync on leaders.organizations;
create trigger organizations_name_sync after update of name on leaders.organizations
  for each row execute function leaders.sync_org_name_to_participants();

-- مرة واحدة: من ارتبط بجهة يأخذ اسمها الحالي
update leaders.participants p set organization_name = o.name
  from leaders.organizations o where p.organization_id = o.id and p.organization_name is distinct from o.name;

-- ════════════ 7) نقاط اعتماد الوثيقة ════════════
alter table leaders.points_ledger drop constraint if exists points_ledger_source_check;
alter table leaders.points_ledger add constraint points_ledger_source_check
  check (source in ('chapter', 'model', 'review', 'bonus', 'lab', 'lab_bonus', 'capstone'));
