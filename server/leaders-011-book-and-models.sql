-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة · الترحيل الحادي عشر: الكتاب التفاعلي والنماذج التعليمية
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد 001 إلى 010. آمن لإعادة التشغيل، ولا يطمس تعديلات الإدارة.
--
--   • لكل باب سؤال تأمل واختبار قصير (quiz_md) يُصحَّح على الخادم
--   • تقدم القراءة لكل مشارك (handbook_progress)
--   • النماذج التعليمية: أدوات عمل يملؤها المشارك على مشروعه (learning_models)
--   • تسليمات المشاركين للنماذج وتقييم الإدارة لها (model_submissions)
--   • سجل النقاط (points_ledger): مصدر واحد لكل نقطة، ولا تُمنح مرتين لنفس الإنجاز

alter table leaders.handbook_modules add column if not exists reflection_ar text;
alter table leaders.handbook_modules add column if not exists quiz_md text;

create table if not exists leaders.handbook_progress (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  module_id      uuid not null references leaders.handbook_modules(id) on delete cascade,
  completed_at   timestamptz not null default now(),
  quiz_score     smallint not null default 0,
  quiz_total     smallint not null default 0,
  reflection     text check (reflection is null or char_length(reflection) <= 4000),
  primary key (participant_id, module_id)
);

create table if not exists leaders.learning_models (
  id          uuid primary key default gen_random_uuid(),
  dimension   text not null references leaders.dimensions(key),
  key         text not null unique check (key ~ '^[a-z0-9-]{2,60}$'),
  sort        smallint not null default 1,
  title_ar    text not null,
  icon        text,
  summary_ar  text,
  when_ar     text,
  steps_ar    text,
  source_ar   text,
  min_level   text not null default 'beginner' references leaders.levels(key),
  points      smallint not null default 30 check (points between 0 and 500),
  fields      jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists leaders.model_submissions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  model_id       uuid not null references leaders.learning_models(id) on delete cascade,
  answers        jsonb not null default '{}'::jsonb,
  status         text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed', 'returned')),
  rating         smallint check (rating is null or rating between 1 and 5),
  feedback_ar    text,
  bonus          smallint not null default 0 check (bonus between 0 and 100),
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    text,
  updated_at     timestamptz not null default now(),
  unique (participant_id, model_id)
);

create table if not exists leaders.points_ledger (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  source         text not null check (source in ('chapter', 'model', 'review', 'bonus')),
  ref_id         uuid,
  points         smallint not null,
  note           text,
  created_at     timestamptz not null default now(),
  unique (participant_id, source, ref_id)
);
create index if not exists points_ledger_participant on leaders.points_ledger (participant_id);

alter table leaders.handbook_progress enable row level security;
alter table leaders.learning_models   enable row level security;
alter table leaders.model_submissions enable row level security;
alter table leaders.points_ledger     enable row level security;
grant all on leaders.handbook_progress, leaders.learning_models, leaders.model_submissions, leaders.points_ledger to service_role;

-- أسئلة التأمل والاختبارات: تُملأ فقط إن كانت فارغة

update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الإطار الأضعف حضورًا في طريقة إدارتك لمشاريعك اليوم، ولماذا؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الذي يضيفه تكامل الأطر الثلاثة لإدارة المشروعات؟
- مزيد من التقارير الدورية
* التحول من متابعة تنفيذية إلى قيادة للأثر والتحول
- تقليل عدد المعالم في الخطة
لماذا: التكامل يربط التنفيذ بالقيمة والقيادة، فيتحول الدور من متابعة إلى قيادة للأثر.$q$)
  where dimension = 'milestone' and chapter_key = 'intro';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$أي مدرسة أقرب لسياق مؤسستك، وما الذي يجعلها الأنسب؟$q$), quiz_md = coalesce(quiz_md, $q$س: أي العبارات أدق في المفاضلة بين مدارس إدارة المشاريع؟
- مدرسة PMI أفضل دائمًا لأنها الأوسع انتشارًا
* لا توجد مدرسة أفضل بإطلاق، بل أنسب لسياق المؤسسة ونضجها ونوع مشاريعها
- PRINCE2 تصلح للمشاريع الحكومية فقط
لماذا: الاختيار يتبع السياق والنضج ونوع المشاريع، لا شهرة المدرسة.

س: ما الذي تقيسه نماذج مثل P3M3 وOPM3؟
- كفاءة مدير المشروع الفردية
* نضج المؤسسة في إدارة المشاريع والبرامج والمحافظ
- التكلفة الفعلية للمشروع
لماذا: هي نماذج نضج مؤسسي تحدد أين تقف المؤسسة وما خطوتها التالية.$q$)
  where dimension = 'milestone' and chapter_key = 'ch1';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$اختر مشروعًا حاليًا: ما النتيجة التي ستُحاسب عليها فعلًا، لا النشاط؟$q$), quiz_md = coalesce(quiz_md, $q$س: في الإدارة القائمة على النتائج، على ماذا نُحاسب؟
- على تنفيذ الأنشطة في وقتها
* على النتائج والأثر، لا الأنشطة وحدها
- على حجم الإنفاق
لماذا: المساءلة تصعد في السلسلة: ننفذ الأنشطة لكننا نُحاسب على النتائج والأثر.

س: ما الذي تضيفه نظرية التغيير إلى الإطار المنطقي؟
- لا شيء، هما اسمان لأداة واحدة
* تكشف المسار السببي وافتراضاته، بينما يضبطه الإطار المنطقي في مصفوفة مؤشرات
- تحدد ميزانية المشروع
لماذا: نظرية التغيير تشرح لماذا سيحدث التغيير، والإطار المنطقي يحدد كيف نقيسه.$q$)
  where dimension = 'milestone' and chapter_key = 'ch2';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما آخر قرار مهم في مشروعك اتُّخذ متأخرًا أو بمعلومات متقادمة؟ وأي معلم كان سيمنع ذلك؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما دور المعلم في حلقة صناعة القرار؟
- موعد لتسليم التقرير الشهري
* البنية التحتية التي تضبط توقيت القرار وجودة معلوماته
- مؤشر لقياس رضا الفريق
لماذا: بدون المعلم تصبح القرارات عشوائية التوقيت ومبنية على معلومات متقادمة.

س: بماذا تختلف هيكلة المشروع عن الهيكلة الدائمة للمؤسسة؟
- لا تختلف
* هي هيكلة مؤقتة تُبنى لغرض محدد وتنتهي بانتهائه
- هي هيكلة أعلى سلطة من الإدارات
لماذا: المشروع تنظيم مؤقت، ولذلك يحتاج حوكمة ومعالم قرار واضحة.$q$)
  where dimension = 'milestone' and chapter_key = 'ch3';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$كم معلمًا في خطتك الحالية هو نقطة قرار حقيقية، وكم منها مجرد تاريخ؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما أنواع المعالم الأربعة في هذا الإطار؟
* تعاقدي، وتقني، وحوكمي، وقيمة
- زمني، ومالي، وفني، وإداري
- بداية، ومنتصف، ونهاية، وإغلاق
لماذا: الأنواع الأربعة تغطي الالتزام والإنجاز والقرار والقيمة.

س: ماذا يعني الانتقال من إدارة الزمن إلى قيادة القيمة؟
- إلغاء الجدول الزمني
* أن يصبح المعلم نقطة قرار وقيمة، لا مجرد تاريخ في الخطة
- زيادة عدد المعالم
لماذا: إعادة تعريف المعلم تجعله لحظة قرار تُقرأ فيها القيمة.$q$)
  where dimension = 'milestone' and chapter_key = 'ch4';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$هل في محفظتك مبادرة يجب إيقافها أو إعادة توجيهها؟ ما الذي يمنع اتخاذ القرار؟$q$), quiz_md = coalesce(quiz_md, $q$س: كيف تُقرأ المبادرات الموقفة أو المعاد توجيهها عند معالم المراجعة؟
- دليل فشل إدارة المحفظة
* مؤشر صحة يدل على حوكمة تعمل
- خطأ يجب إخفاؤه في التقارير
لماذا: الإيقاف المبكر يحرر الموارد لما يحقق القيمة، وهذه علامة نضج.

س: ما الذي يميز البرنامج عن المشروع؟
- البرنامج مشروع بميزانية أكبر
* البرنامج مشاريع مترابطة تُدار معًا لتحقيق منافع لا تتحقق منفردة
- البرنامج لا يحتاج معالم
لماذا: قيمة البرنامج في الترابط والمنافع المشتركة لا في الحجم.$q$)
  where dimension = 'milestone' and chapter_key = 'ch5';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$أي حلقة في سلسلة (فهم، قرار، تسليم، متابعة) هي الأضعف لديك؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما تسلسل الجدارات الذي يختبره كل معلم؟
* فهم، ثم قرار، ثم تسليم، ثم متابعة، وصولًا إلى الأثر
- تخطيط، ثم تنفيذ، ثم إغلاق
- رقابة، ثم تقرير، ثم تقييم
لماذا: كل معلم اختبار عملي للسلسلة كاملة حتى الأثر.

س: كيف تُصقل الجدارات المؤسسية؟
- بالدورات النظرية وحدها
* بممارسة المعالم في مشاريع حقيقية
- بتوظيف خبراء من الخارج
لماذا: الجدارات الشخصية تُبنى، والمؤسسية تُصقل بالممارسة الحقيقية.$q$)
  where dimension = 'milestone' and chapter_key = 'ch6';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما المشروع الذي ستبني له سجل المعالم الأول، ولماذا اخترته؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الذي يحمي المعلم في سجلك من "الأخضر المجامل"؟
- أن يُلوّن بالأخضر عند الاقتراب منه
* أن يكون له معيار تحقق واضح يثبت الإنجاز
- أن يعتمده مدير المشروع وحده
لماذا: معيار التحقق يجعل الحالة دليلًا لا انطباعًا.$q$)
  where dimension = 'milestone' and chapter_key = 'labs';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الممارسة الواحدة التي ستبدأها غدًا من هذا الإطار؟$q$), quiz_md = coalesce(quiz_md, $q$س: إلى ماذا تتحول المشاريع حين تتكامل الإدارة والقيادة والقيمة؟
- إلى عدد أكبر من المبادرات
* إلى منظومة أثر مؤسسي مستدام
- إلى إجراءات أكثر صرامة
لماذا: هذه خلاصة الإطار: التكامل يصنع أثرًا مؤسسيًا مستدامًا.$q$)
  where dimension = 'milestone' and chapter_key = 'close';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما التغيير الذي يجب أن يحدث بسبب مشروعك لو نجح تمامًا؟$q$), quiz_md = coalesce(quiz_md, $q$س: بماذا يُقاس الأثر في هذا الإطار؟
- بحجم ما ننجزه من أنشطة
* بما يتغيّر بسبب ما ننجزه
- بعدد المستفيدين المسجلين فقط
لماذا: الأثر لا يُقاس بما ننجزه، بل بما يتغيّر بسببه.$q$)
  where dimension = 'impact' and chapter_key = 'intro';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$من جمهور تقرير الأثر في مؤسستك، وما السؤال الذي يريد جوابه؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما المعيار الصحيح لاختيار نموذج قياس الأثر؟
- الأشهر عالميًا
* الأنسب لنوع الأثر المستهدف وجمهور التقرير
- الأقل تكلفة
لماذا: لا نموذج أفضل بإطلاق؛ يوجد الأنسب للأثر وللجمهور.

س: ما محور إدارة المنافع (BRM)؟
- ضبط التكلفة
* تحديد المنافع وتتبعها وتحقيقها بعد التسليم
- إدارة الموردين
لماذا: المنافع تتحقق غالبًا بعد التسليم، ولذلك تحتاج إدارة ومالكين.$q$)
  where dimension = 'impact' and chapter_key = 'ch1';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$أين يقف مشروعك في سلسلة النتائج اليوم: مخرجات، أم نتائج، أم أثر؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الفرق بين الإسناد والمساهمة؟
- لا فرق بينهما
* الإسناد ينسب التغيير لتدخلك وحده، والمساهمة تثبت دورك ضمن عوامل أخرى
- المساهمة تخص الجهات المانحة فقط
لماذا: لغة المساهمة أمينة حين تتعدد العوامل المؤثرة في التغيير.

س: بماذا يُبرر الاستثمار في المشروع؟
- بتسليم المخرجات في موعدها
* بالمنافع والأثر المستدام
- بانخفاض التكلفة
لماذا: نسلّم المخرجات، لكن الاستثمار لا يُبرر إلا بالمنافع والأثر.$q$)
  where dimension = 'impact' and chapter_key = 'ch2';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$هل يرتبط مؤشر مشروعك الرئيسي بهدف استراتيجي واضح للمؤسسة؟$q$), quiz_md = coalesce(quiz_md, $q$س: متى يبرر تقرير الأثر الاستثمار؟
- حين يسرد الإنجازات بإبهار
* حين يجيب عن سؤال التغيير بالدليل
- حين يكون طويلًا ومفصلًا
لماذا: التقرير الذي لا يجيب عن سؤال التغيير لا يبرر الاستثمار.

س: ما دور KPI وOKR في المحاذاة الاستراتيجية؟
* ربط مؤشرات المشروع بأهداف المؤسسة وقياس التقدم نحوها
- استبدال خطة المشروع
- تقييم أداء الأفراد فقط
لماذا: المحاذاة تضمن أن ما نقيسه في المشروع يخدم ما تريده المؤسسة.$q$)
  where dimension = 'impact' and chapter_key = 'ch3';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الادعاء في تقاريرك الذي يفتقد خط أساس اليوم؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما المقصود بـ"مسرح الأثر"؟
- عرض نتائج المشروع في حفل ختامي
* ادعاءات أثر بلا مؤشر ولا خط أساس
- تقرير مصور للمستفيدين
لماذا: مسرح الأثر سرد مقنع بلا دليل، وهو ما يمنعه هذا الإطار.

س: لماذا خط الأساس شرط لأي ادعاء أثر؟
* لأن التغيير لا يُقاس إلا مقارنة بنقطة البداية
- لأنه مطلب شكلي للمانحين
- لأنه يحدد الميزانية
لماذا: بدون خط أساس لا نعرف ماذا تغيّر ولا بكم.$q$)
  where dimension = 'impact' and chapter_key = 'ch4';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$من مالك منافع مشروعك بعد التسليم؟ وهل يعرف ذلك؟$q$), quiz_md = coalesce(quiz_md, $q$س: كيف تصف مشروعًا سلّم مخرجاته ولم يغيّر شيئًا؟
- ناجح لأنه التزم بالعقد
* أنجز عقده وأخفق في مبرر وجوده
- يحتاج مزيدًا من التمويل
لماذا: المخرجات وسيلة؛ مبرر المشروع هو التغيير.

س: أين تُدار المنافع على مستوى البرنامج؟
* في سجل منافع له مالكون بعد التسليم
- في الخطة الزمنية للمشروع فقط
- لدى فريق التنفيذ حتى الإغلاق
لماذا: سجل المنافع ومالكوها يضمنون استمرار القياس بعد انتهاء الفريق.$q$)
  where dimension = 'impact' and chapter_key = 'ch5';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$متى آخر مرة سألت فيها: ما الدليل على أن هذا تغيّر فعلًا؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الذي تختبره معالم القيمة في جدارات القائد؟
* قراءة الدليل، ومساءلة التغيير، والقرار الموجّه نحو الأثر
- سرعة التنفيذ وحدها
- الالتزام بالميزانية
لماذا: معلم القيمة لحظة قرار مبنية على الدليل.

س: ما السلوك الذي يدل على إتقان قيادة الأثر؟
- كتابة تقارير أطول
* مساءلة التغيير بالدليل قبل إعلان النجاح
- الإكثار من المؤشرات
لماذا: القائد يسأل عن الدليل قبل الاحتفال.$q$)
  where dimension = 'impact' and chapter_key = 'ch6';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما المنفعة الأولى التي ستكتبها لمشروعك، ومن مالكها؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الحد الأدنى لكل منفعة في سجل المنافع؟
* المؤشر وطريقة قياسه، وخط الأساس، والمالك، ومعلم القيمة
- الاسم والتكلفة
- الوصف والصورة
لماذا: هذه العناصر الأربعة تجعل المنفعة قابلة للقياس والمساءلة.$q$)
  where dimension = 'impact' and chapter_key = 'labs';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الذي ستغيّره في تصميم مشروعك القادم من يومه الأول؟$q$), quiz_md = coalesce(quiz_md, $q$س: متى يُصمم الأثر في هذا الإطار؟
- في تقرير الختام
* من اليوم الأول، ويُثبت بالدليل
- بعد انتهاء التمويل
لماذا: الأثر لا يُدّعى في الختام، بل يُصمم من البداية.$q$)
  where dimension = 'impact' and chapter_key = 'close';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الجدارة القيادية التي لو امتلكتها اليوم لغيّرت نتائج مشروعك؟$q$), quiz_md = coalesce(quiz_md, $q$س: لماذا لا يكفي امتلاك المشاريع والخطط؟
* لأنها تحتاج قيادة تمتلك الجدارات المناسبة لتحقيقها
- لأن الخطط تتغير دائمًا
- لأن المشاريع تحتاج ميزانيات أكبر
لماذا: الخطط لا تنفذ نفسها؛ يحققها قادة بجدارات مناسبة.$q$)
  where dimension = 'leadership' and chapter_key = 'intro';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$هل تميل إلى الإدارة أم القيادة حين يشتد الضغط؟ وما أثر ذلك على فريقك؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما النمط القيادي الأفضل؟
- النمط التوجيهي دائمًا
* لا نمط أفضل بإطلاق؛ الأنسب لجاهزية الفريق وطبيعة الموقف
- النمط التفويضي دائمًا
لماذا: القيادة الموقفية تختار النمط بحسب الموقف لا بحسب التفضيل.

س: ما الفرق الجوهري بين الإدارة والقيادة؟
* الإدارة تضبط التنفيذ والموارد، والقيادة تحرك الناس نحو التغيير
- القيادة للمديرين التنفيذيين فقط
- لا فرق عملي بينهما
لماذا: قائد المشاريع يحتاج الاثنتين معًا.$q$)
  where dimension = 'leadership' and chapter_key = 'ch1';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$موقف استجبت فيه بسرعة دون تفهم كافٍ: ماذا كلفك؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الفرق بين سرعة الاستجابة والتسرع؟
- لا فرق، كلاهما سرعة
* سرعة الاستجابة تحرك بعد تفهم، والتسرع تحرك بلا تفهم
- التسرع أفضل في الأزمات دائمًا
لماذا: السرعة بلا تفهم تهور، والتفهم بلا تحرك تعطيل.

س: أين تكمن جدارة سرعة الاستجابة؟
- في مرحلة التنفيذ وحدها
* في المسار كاملًا، لا في مرحلة منه
- في كتابة التقارير السريعة
لماذا: الجدارة في المسار كاملًا من التلقي إلى التنفيذ.$q$)
  where dimension = 'leadership' and chapter_key = 'ch2';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما آخر عمل سلّمته أو تسلّمته دون متابعة كافية، وماذا حدث بعده؟$q$), quiz_md = coalesce(quiz_md, $q$س: متى تكتمل العهدة في التسليم والتسلم؟
- عند توقيع محضر التسليم
* بتحقيق الأثر المستهدف بعد التسليم
- عند الإغلاق المالي للمشروع
لماذا: العهدة لا تكتمل إلا بتحقيق الأثر.

س: ما خطر التسليم بلا تتابع ورقابة؟
* أن يعود المسلَّم مشكلة أكبر بعد حين
- تأخر صرف المستحقات
- زيادة عدد الاجتماعات
لماذا: ما يُسلَّم بلا متابعة يعود مشكلة أكبر.$q$)
  where dimension = 'leadership' and chapter_key = 'ch3';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$أي الجدارات الأربع هي الأقوى لديك وأيها الأضعف؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما الجدارات القيادية الأربع في هذا الإطار؟
* الرأسية، والأفقية، والتحويلية، والذاتية
- التخطيط، والتنظيم، والتوجيه، والرقابة
- التواصل، والتفاوض، والعرض، والكتابة
لماذا: القائد يقود في كل الاتجاهات، والذاتية أساس البقية.

س: في القيادة الموقفية، على ماذا يعتمد اختيار النمط؟
- على شخصية القائد
* على جاهزية الفرد للمهمة المحددة
- على أقدمية الموظف
لماذا: الجاهزية قدرة ورغبة تجاه مهمة محددة، والنمط يتبعها.$q$)
  where dimension = 'leadership' and chapter_key = 'ch4';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$هل يشعر فريقك بالأمان لنقل الأخبار السيئة إليك مبكرًا؟$q$), quiz_md = coalesce(quiz_md, $q$س: ماذا يسلّم فريق يقوده الخوف عادة؟
* تقارير خضراء ومشاريع حمراء
- مشاريع في موعدها دائمًا
- تقارير دقيقة ومفصلة
لماذا: الخوف يخفي المشكلات حتى تكبر.

س: كيف تتسع القيادة عبر طبقات البرنامج والمحفظة؟
* من قيادة فريق إلى قيادة قادة وأصحاب مصلحة ومؤسسة
- بزيادة عدد التقارير المطلوبة
- بتقليل التفويض
لماذا: كلما صعدت الطبقة اتسعت دائرة من تقودهم.$q$)
  where dimension = 'leadership' and chapter_key = 'ch5';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما التحدي القيادي المفتوح الآن الذي يستحق تطبيق DIRECT عليه؟$q$), quiz_md = coalesce(quiz_md, $q$س: ما مسار أداة DIRECT؟
* تشخيص ثم تأثير ثم حل، يسندها تعاطف وتواصل، ثم تتبع حتى الإغلاق
- حل ثم تواصل ثم تقييم
- تشخيص ثم تفويض ثم إغلاق
لماذا: الأداة مسار منضبط من الفهم إلى الإغلاق.

س: ما دور الأدوات والتقنية في النظام البيئي للقائد؟
- تصنع القيادة وتغني عن العلاقة
* تخدم القيادة والعلاقة ولا تستبدلها
- تقتصر على مكتب إدارة المشاريع
لماذا: الأداة تخدم القيادة ولا تصنعها.$q$)
  where dimension = 'leadership' and chapter_key = 'ch6';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما الجدارتان اللتان ستعمل عليهما في خطتك القيادية؟$q$), quiz_md = coalesce(quiz_md, $q$س: في خطة التطوير القيادي، ما المطلوب لكل جدارة ضعيفة؟
* سلوك واحد يُمارس أسبوعيًا ومؤشر يُعرف به التقدم
- دورة تدريبية خارجية
- تقييم من المدير المباشر فقط
لماذا: التطوير ممارسة متكررة قابلة للقياس.$q$)
  where dimension = 'leadership' and chapter_key = 'labs';
update leaders.handbook_modules set reflection_ar = coalesce(reflection_ar, $q$ما رسالتك القيادية التي ستحملها إلى فريقك بعد هذا الكتاب؟$q$), quiz_md = coalesce(quiz_md, $q$س: من يقود المشاريع في خلاصة هذا الإطار؟
- المنهجيات والأدوات
* أشخاص يمتلكون الجدارات
- اللجان والمجالس
لماذا: المشاريع يقودها أشخاص يمتلكون الجدارات.$q$)
  where dimension = 'leadership' and chapter_key = 'close';

-- النماذج التعليمية: لا تطمس تعديلات الإدارة
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('milestone', 'milestone-register', 1, $q$سجل المعالم$q$, $q$◆$q$, $q$سجل حي لمعالم مشروعك، كل معلم فيه نقطة قرار لا مجرد تاريخ في الخطة.$q$, $q$عند بدء مشروع أو إعادة تخطيطه، ويُراجع عند كل معلم.$q$, $q$اختر مشروعًا تقوده الآن.
اكتب ثمانية معالم على الأقل، معلمين من كل نوع: تعاقدي، وتقني، وحوكمي، وقيمة.
حدد لكل معلم القرار الذي يُتخذ عنده وصاحبه.
اكتب معيار تحقق يمنع "الأخضر المجامل".$q$, $q$مستلهم من PMBOK (PMI) وPRINCE2 (Axelos) وإطار Milestone$q$, 'beginner', 30, $q$[{"key": "project", "label": "اسم المشروع", "type": "text", "hint": "", "required": true}, {"key": "goal", "label": "هدف المشروع في جملة واحدة", "type": "textarea", "hint": "", "required": true}, {"key": "milestones", "label": "المعالم", "type": "table", "columns": ["المعلم", "النوع (تعاقدي، تقني، حوكمي، قيمة)", "التاريخ المستهدف", "القرار عنده", "صاحب القرار", "معيار التحقق"], "min_rows": 8, "hint": "ثمانية معالم على الأقل، معلمان من كل نوع", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('milestone', 'stage-gate', 2, $q$ورقة قرار بوابة المرحلة$q$, $q$⬢$q$, $q$ورقة من صفحة واحدة تمكّن مجلس المشروع من قرار عبور واعٍ: استمرار، أو تصحيح، أو إيقاف.$q$, $q$قبل أي بوابة مرحلة أو اجتماع لجنة توجيهية.$q$, $q$قارن الحالة الفعلية بخط الأساس.
اعرض المخاطر المفتوحة ومالكيها.
اكتب مبرر الاستمرار بلغة القيمة.
اقترح القرار ومعه البديل.$q$, $q$مستلهم من Stage-Gate (Robert Cooper) وحدود المراحل في PRINCE2$q$, 'intermediate', 40, $q$[{"key": "project", "label": "المشروع", "type": "text", "hint": "", "required": true}, {"key": "gate", "label": "البوابة أو المرحلة", "type": "text", "hint": "", "required": true}, {"key": "status", "label": "الحالة مقابل خط الأساس", "type": "textarea", "hint": "الزمن والتكلفة والنطاق والجودة", "required": true}, {"key": "risks", "label": "المخاطر المفتوحة", "type": "table", "columns": ["الخطر", "الاحتمال", "الأثر", "المالك", "الإجراء"], "min_rows": 3, "hint": "", "required": true}, {"key": "justification", "label": "مبرر الاستمرار", "type": "textarea", "hint": "", "required": true}, {"key": "decision", "label": "القرار المقترح", "type": "select", "options": ["استمرار", "تصحيح", "إيقاف"], "hint": "", "required": true}, {"key": "alternative", "label": "البديل إن لم يُعتمد القرار", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('milestone', 'portfolio-review', 3, $q$مراجعة المحفظة$q$, $q$▣$q$, $q$مفاضلة موزونة بين المبادرات تكشف ما يستحق الاستمرار وما يجب إيقافه أو إعادة توجيهه.$q$, $q$في دورة التخطيط السنوية أو عند ضغط الموارد.$q$, $q$حدد معايير المفاضلة وأوزانها.
قيّم خمس مبادرات على الأقل.
احسب الدرجة الموزونة لكل مبادرة.
حدد مبادرة واحدة على الأقل للإيقاف أو إعادة التوجيه واكتب المبرر.$q$, $q$مستلهم من The Standard for Portfolio Management (PMI) وMoP (Axelos)$q$, 'advanced', 50, $q$[{"key": "portfolio", "label": "المحفظة أو الإدارة", "type": "text", "hint": "", "required": true}, {"key": "criteria", "label": "معايير المفاضلة", "type": "table", "columns": ["المعيار", "الوزن %"], "min_rows": 3, "hint": "مجموع الأوزان 100%", "required": true}, {"key": "initiatives", "label": "المبادرات", "type": "table", "columns": ["المبادرة", "التوافق الاستراتيجي (1 إلى 5)", "القيمة (1 إلى 5)", "المخاطر (1 إلى 5)", "الدرجة الموزونة", "التوصية"], "min_rows": 5, "hint": "", "required": true}, {"key": "stop", "label": "المبادرة الموقفة أو المعاد توجيهها، ومبرر القرار", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('impact', 'benefits-register', 1, $q$سجل المنافع$q$, $q$◈$q$, $q$يحوّل وعود المشروع إلى منافع قابلة للقياس، لكل منها مؤشر وخط أساس ومالك.$q$, $q$مع سجل المعالم في بداية المشروع، ويُقرأ عند كل معلم قيمة.$q$, $q$اكتب ثلاث منافع على الأقل.
حدد لكل منفعة مؤشرها وطريقة قياسه.
سجّل خط الأساس اليوم قبل أي تدخل.
سمِّ المالك الذي سيتسلمها بعد التسليم ومعلم القيمة الذي تُقرأ عنده.$q$, $q$مستلهم من Benefits Realisation Management (APMG) وMSP (Axelos)$q$, 'beginner', 30, $q$[{"key": "project", "label": "المشروع", "type": "text", "hint": "", "required": true}, {"key": "benefits", "label": "المنافع", "type": "table", "columns": ["المنفعة", "المؤشر وطريقة القياس", "خط الأساس", "المستهدف", "المالك بعد التسليم", "معلم القيمة"], "min_rows": 3, "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('impact', 'theory-of-change', 2, $q$نظرية التغيير$q$, $q$⟡$q$, $q$خريطة سببية من الأنشطة إلى الأثر، تكشف الافتراضات التي يقوم عليها نجاح برنامجك.$q$, $q$عند تصميم برنامج أو مراجعة برنامج لا يحقق المتوقع.$q$, $q$ابدأ من الأثر بعيد المدى وارجع خطوة خطوة.
اكتب تحت كل انتقال الافتراض الذي يجعله صحيحًا.
حدد الافتراض الأضعف.
خطط لاختباره مبكرًا.$q$, $q$مستلهم من Theory of Change (Center for Theory of Change) والإطار المنطقي$q$, 'intermediate', 40, $q$[{"key": "program", "label": "البرنامج", "type": "text", "hint": "", "required": true}, {"key": "impact", "label": "الأثر بعيد المدى", "type": "textarea", "hint": "", "required": true}, {"key": "chain", "label": "السلسلة السببية", "type": "table", "columns": ["المستوى (أنشطة، مخرجات، نتائج، أثر)", "الوصف", "الافتراض الذي يجعل الانتقال صحيحًا"], "min_rows": 4, "hint": "", "required": true}, {"key": "weakest", "label": "الافتراض الأضعف", "type": "textarea", "hint": "", "required": true}, {"key": "test", "label": "كيف ستختبره مبكرًا", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('impact', 'impact-report', 3, $q$تقرير الأثر$q$, $q$◉$q$, $q$تقرير أمين يجيب عن سؤال التغيير بالدليل وبلغة المساهمة، ويعترف بما لم يتحقق.$q$, $q$عند إغلاق برنامج أو في مراجعة سنوية للأثر.$q$, $q$قارن كل تغيير بخط أساسه.
اذكر الدليل لكل ادعاء.
اكتب دورك بلغة المساهمة لا الإسناد المطلق.
وثّق ما لم يتحقق ولماذا.$q$, $q$مستلهم من معايير OECD DAC للتقييم ومبادئ Social Value International$q$, 'advanced', 50, $q$[{"key": "program", "label": "البرنامج", "type": "text", "hint": "", "required": true}, {"key": "changes", "label": "ما الذي تغيّر", "type": "table", "columns": ["التغيير", "خط الأساس", "القيمة الحالية", "الدليل"], "min_rows": 3, "hint": "", "required": true}, {"key": "contribution", "label": "لغة المساهمة: ما دورنا وما العوامل الأخرى", "type": "textarea", "hint": "", "required": true}, {"key": "not_achieved", "label": "ما لم يتحقق ولماذا", "type": "textarea", "hint": "", "required": true}, {"key": "lessons", "label": "الدروس للبرامج القادمة", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('leadership', 'stakeholder-map', 1, $q$خريطة أصحاب المصلحة$q$, $q$◎$q$, $q$تصنيف حي بالنفوذ والاهتمام يوجّه جهد التواصل حيث يصنع الفرق.$q$, $q$في بداية المشروع ومع كل تغير في المشهد.$q$, $q$اكتب خمسة من أصحاب المصلحة على الأقل.
صنّف كلًا منهم بالنفوذ والاهتمام.
حدد استراتيجية التواصل وتكرارها وقناتها.
حدد معارضًا صامتًا واحدًا وخطة كسبه.$q$, $q$مستلهم من مصفوفة Mendelow للنفوذ والاهتمام وPMBOK$q$, 'beginner', 30, $q$[{"key": "project", "label": "المشروع", "type": "text", "hint": "", "required": true}, {"key": "stakeholders", "label": "أصحاب المصلحة", "type": "table", "columns": ["صاحب المصلحة", "النفوذ (عالٍ، منخفض)", "الاهتمام (عالٍ، منخفض)", "الاستراتيجية", "التكرار والقناة"], "min_rows": 5, "hint": "", "required": true}, {"key": "silent", "label": "المعارض الصامت وخطة كسبه", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('leadership', 'development-plan', 2, $q$خطة التطوير القيادي$q$, $q$△$q$, $q$خطة شخصية قصيرة تحوّل فجوات الجدارات إلى سلوك أسبوعي قابل للقياس.$q$, $q$بعد التقييم الذاتي، وتُراجع بعد كل مشروع.$q$, $q$اختر جدارتين هما الأضعف لديك.
حدد لكل منهما سلوكًا واحدًا تمارسه أسبوعيًا.
حدد مؤشرًا تعرف به التقدم وموعدًا للمراجعة.
سمِّ من سيمنحك تغذية راجعة.$q$, $q$مستلهم من نموذج 70-20-10 (Center for Creative Leadership) ونموذج GROW$q$, 'beginner', 30, $q$[{"key": "competencies", "label": "الجدارات", "type": "table", "columns": ["الجدارة (رأسية، أفقية، تحويلية، ذاتية)", "السلوك الأسبوعي", "مؤشر التقدم", "موعد المراجعة"], "min_rows": 2, "hint": "", "required": true}, {"key": "support", "label": "من سيدعمك ويمنحك تغذية راجعة، وكيف", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('leadership', 'conflict-mode', 3, $q$تشخيص نمط الخلاف$q$, $q$⬡$q$, $q$يقارن النمط الذي استخدمته في خلاف حقيقي بالنمط الأنسب لأهمية القضية والعلاقة.$q$, $q$بعد أي خلاف مهم مع فريقك أو شريك أو جهة موازية.$q$, $q$صف موقف خلاف حقيقيًا.
قدّر أهمية القضية وأهمية العلاقة.
حدد النمط الذي استخدمته والنمط الأنسب.
اكتب ما ستفعله مختلفًا.$q$, $q$مستلهم من Thomas-Kilmann Conflict Mode Instrument (TKI)$q$, 'intermediate', 40, $q$[{"key": "situation", "label": "موقف الخلاف", "type": "textarea", "hint": "", "required": true}, {"key": "issue", "label": "أهمية القضية", "type": "select", "options": ["عالية", "متوسطة", "منخفضة"], "hint": "", "required": true}, {"key": "relation", "label": "أهمية العلاقة", "type": "select", "options": ["عالية", "متوسطة", "منخفضة"], "hint": "", "required": true}, {"key": "used", "label": "النمط الذي استخدمته", "type": "select", "options": ["تنافس", "تعاون", "تسوية", "تجنب", "مجاملة"], "hint": "", "required": true}, {"key": "right", "label": "النمط الأنسب", "type": "select", "options": ["تنافس", "تعاون", "تسوية", "تجنب", "مجاملة"], "hint": "", "required": true}, {"key": "next", "label": "ما الذي ستفعله مختلفًا", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, source_ar, min_level, points, fields)
values ('leadership', 'direct', 4, $q$أداة DIRECT$q$, $q$✦$q$, $q$مسار منضبط لأي تحدٍّ قيادي: تشخيص، فتأثير، فحل، يسندها تعاطف وتواصل، ثم تتبع حتى الإغلاق.$q$, $q$أمام تحدٍّ قيادي مفتوح يحتاج قرارًا وتحريك أشخاص.$q$, $q$اختر تحديًا قياديًا مفتوحًا الآن.
وثّق الخطوات الست بالترتيب.
حدد موعد التتبع ومعيار الإغلاق.$q$, $q$أداة DIRECT من منهجية Milestone Impact$q$, 'advanced', 50, $q$[{"key": "challenge", "label": "التحدي", "type": "textarea", "hint": "", "required": true}, {"key": "diagnose", "label": "التشخيص: ما حقيقة المشكلة وجذورها؟", "type": "textarea", "hint": "", "required": true}, {"key": "influence", "label": "التأثير: من تحتاج التأثير عليه وكيف؟", "type": "textarea", "hint": "", "required": true}, {"key": "resolve", "label": "الحل: ما القرار أو الإجراء؟", "type": "textarea", "hint": "", "required": true}, {"key": "empathy", "label": "التعاطف: كيف ستراعي المتأثرين؟", "type": "textarea", "hint": "", "required": true}, {"key": "communicate", "label": "التواصل: من يعرف ماذا ومتى؟", "type": "textarea", "hint": "", "required": true}, {"key": "track", "label": "التتبع: متى وكيف ستتابع حتى الإغلاق؟", "type": "textarea", "hint": "", "required": true}]$q$::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
