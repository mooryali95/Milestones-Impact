-- ════════════════════════════════════════════════════════════════════
-- مواءمة المستويات في وثيقة المبادرة والكتاب والمسارات (تدقيق 2026-10-31)
-- آمن لإعادة التشغيل: كل خطوة محروسة أو تكتب قيمة ثابتة.
-- 1) فصول تخطيط ثقيلة تنتقل إلى المتوسط، والتأسيسي بصفوف أقل
-- 2) حقول متقدمة تُعمّق الوثيقة للمتقدم، وحقل «تعمق المسار» لمحور الأولوية
-- 3) مصطلحات أوضح: شدة الأثر، مشكلة، المبرر
-- 4) أسئلة الكتاب تتبع مستوى الكتل التي تختبرها
-- 5) المشروع التطبيقي في المسار يُشتق من فصول الوثيقة، فيُحذف عمود project_ar
-- ════════════════════════════════════════════════════════════════════

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل
create table if not exists leaders.backup_20261031_level_fit as
  select 'model' kind, key ref, min_level a, title_ar || E'\n||\n' || coalesce(summary_ar, '') || E'\n||\n' || fields::text b from leaders.learning_models
  union all select 'module', chapter_key || '/' || dimension, null, body_md || E'\n||\n' || coalesce(quiz_md, '') from leaders.handbook_modules
  union all select 'lab', key, min_level, title_ar || E'\n||\n' || coalesce(summary_ar, '') || E'\n||\n' || spec::text from leaders.lab_items
  union all select 'track', key, title_ar, focus_ar from leaders.tracks;
alter table leaders.backup_20261031_level_fit enable row level security;

-- أدوات مؤقتة للجلسة: تعديل حقل بمفتاحه، أو إضافته إن غاب
create or replace function pg_temp.patch_field(mkey text, fkey text, patch jsonb, drop_keys text[] default '{}')
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey then (f || patch) - drop_keys else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey));
$f$;

create or replace function pg_temp.add_field(mkey text, field jsonb)
returns void language sql as $f$
  update leaders.learning_models m set fields = m.fields || jsonb_build_array(field)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

-- ════════════ 1) مستوى الفصول والحقول ════════════
-- تحليل البدائل وخطة الأدلة وهيكل التجزئة والتكلفة: أدوات تخطيط متوسطة.
-- لا متطلب رحلة يشير إليها، فالنقل لا يكسر مرحلة.
update leaders.learning_models set min_level = 'intermediate'
 where key in ('options-analysis', 'evidence-plan', 'wbs', 'cost-plan') and min_level = 'beginner';

select pg_temp.patch_field('options-analysis', 'criteria', '{"min_level": "advanced"}');
-- صار الفصل متوسطًا، فحقلاه المتوسطان يظهران لكل من يراه
select pg_temp.patch_field('wbs', 'rule', '{}', '{min_level}');
select pg_temp.patch_field('cost-plan', 'contingency', '{}', '{min_level}');
select pg_temp.patch_field('evidence-plan', 'attribution', '{}', '{min_level}');
select pg_temp.patch_field('stakeholder-map', 'silent', '{"min_level": "intermediate"}');
select pg_temp.patch_field('governance', 'cadence', '{"min_level": "intermediate"}');
select pg_temp.patch_field('change-sustain', 'impacted', '{"min_level": "intermediate"}');
-- التأسيسي يبني السجل نفسه بصفوف أقل
select pg_temp.patch_field('milestone-register', 'milestones', '{"min_rows_beginner": 5}');
select pg_temp.patch_field('raid', 'items', '{"min_rows_beginner": 4}');

-- ════════════ 2) عمق المتقدم ════════════
select pg_temp.add_field('theory-of-change', $j${"key": "external", "label": "العوامل الخارجية التي قد تكسر السلسلة وكيف ترصدها", "type": "textarea", "hint": "سياسات، أو سوق، أو جهات أخرى تعمل على المستفيدين أنفسهم", "required": true, "min_level": "advanced"}$j$::jsonb);
select pg_temp.add_field('evidence-plan', $j${"key": "evidence_level", "label": "مستوى الدليل لكل مؤشر على سلّم الأدلة، ولماذا يكفي لقرارك", "type": "textarea", "hint": "من الرواية إلى التجربة العشوائية؛ واختر المستوى بحسب حجم القرار المبني عليه", "required": true, "min_level": "advanced"}$j$::jsonb);
select pg_temp.add_field('governance', $j${"key": "layers", "label": "اتصال الحوكمة بالبرنامج أو المحفظة: ما يُرفع، ومتى، ولمن", "type": "textarea", "hint": "القرار في أعلى طبقة يمسها", "required": true, "min_level": "advanced"}$j$::jsonb);
select pg_temp.add_field('change-sustain', $j${"key": "win_resisters", "label": "كسب المقاومين المؤثرين: من هم، وما مصلحتهم، وكيف تحولهم إلى داعمين", "type": "textarea", "hint": "", "required": true, "min_level": "advanced"}$j$::jsonb);
select pg_temp.add_field('development-plan', $j${"key": "successor", "label": "من تبنيه قائدًا في فريقك ليأخذ مكانك، وكيف", "type": "textarea", "hint": "مقياس قيادة القادة: كم منهم يستطيع أخذ مكانك غدًا", "required": true, "min_level": "advanced"}$j$::jsonb);

-- تعمق المسار: يظهر لمن محور الأولوية في مساره هو محور الفصل، بكل المستويات
select pg_temp.add_field(v.k, jsonb_build_object('key', 'track_depth', 'label', v.l, 'type', 'textarea', 'hint', 'هذا محور الأولوية في مسارك، ووزنه في التقييم مضاعف', 'required', true, 'track', true))
  from (values
    ('initiative-charter',   'تعمق المسار: معيار نجاح كل مخرج رئيس، ومن يعلن تحققه'),
    ('milestone-register',   'تعمق المسار: المعلم الذي يحسم مصير المبادرة، ومعيار القرار عنده'),
    ('wbs',                  'تعمق المسار: الحزم الأعلى خطرًا على الموعد، ولماذا'),
    ('schedule',             'تعمق المسار: المعالم الحاكمة في الجدول، والقرار المرتبط بكل منها'),
    ('cost-plan',            'تعمق المسار: متى يُراجع تقدير التكلفة عند المعالم، ومن يقرر استخدام الاحتياطي'),
    ('roadmap',              'تعمق المسار: معلم التكامل الذي يحكم منفعة الدفعة الأولى'),
    ('portfolio-review',     'تعمق المسار: ما الذي يدفعك إلى إعادة المفاضلة قبل موعد المراجعة'),
    ('raid',                 'تعمق المسار: أخطر بند على المعالم، ومؤشر الإنذار المبكر له'),
    ('stage-gate',           'تعمق المسار: المعيار الذي لو لم يتحقق لأوصيت بالإيقاف'),
    ('options-analysis',     'تعمق المسار: أثر كل بديل على المستفيد النهائي، لا على الجهة وحدها'),
    ('theory-of-change',     'تعمق المسار: كيف يعرف المستفيد أن التغيير حدث، بلسانه لا بلسان الجهة'),
    ('benefits-register',    'تعمق المسار: المنفعة الأصعب إثباتًا، وكيف ستثبتها'),
    ('evidence-plan',        'تعمق المسار: المؤشر المبكر الذي يتنبأ بالأثر قبل ظهوره'),
    ('stakeholder-map',      'تعمق المسار: كيف تبني تحالفًا من أصحاب النفوذ خارج سلطتك'),
    ('governance',           'تعمق المسار: كيف تبني قرار فريقك في هذه الحوكمة بدل أن تتخذه عنه'),
    ('change-sustain',       'تعمق المسار: دورك الشخصي في التغيير، ومن يحمله معك'),
    ('development-plan',     'تعمق المسار: جدارتك الأضعف، وكيف يقيس فريقك تقدمك فيها'),
    ('transformation-story', 'تعمق المسار: كيف تغيّر أسلوبك القيادي عبر المبادرة، بشاهد من فريقك')
  ) as v(k, l);

-- ════════════ 3) المصطلحات ════════════
select pg_temp.patch_field('raid', 'items', $j${"columns": ["الرمز", "النوع (خطر، افتراض، اعتمادية، مشكلة)", "الوصف", "الاحتمال (1 إلى 5)", "شدة الأثر (1 إلى 5)", "المالك", "الاستجابة", "مرتبط بحزمة"]}$j$::jsonb);
select pg_temp.patch_field('stage-gate', 'risks', $j${"columns": ["الخطر", "الاحتمال", "شدة الأثر", "المالك", "الإجراء"]}$j$::jsonb);
update leaders.learning_models set summary_ar = replace(summary_ar, 'والقضايا،', 'والمشكلات،') where key = 'raid';
update leaders.learning_models set title_ar = 'المبرر والبدائل' where key = 'options-analysis' and title_ar = 'المسوغ والبدائل';

update leaders.lab_items
   set title_ar = replace(title_ar, 'والقضايا', 'والمشكلات'),
       summary_ar = replace(summary_ar, 'والقضية', 'والمشكلة'),
       spec = replace(replace(replace(spec::text, 'قضية: وقعت', 'مشكلة: وقعت'), 'والقضية في الحاضر', 'والمشكلة في الحاضر'), 'أم قضية أم', 'أم مشكلة أم')::jsonb
 where key = 'risk-register';
update leaders.lab_items set spec = replace(replace(replace(spec::text, 'يصبح قضية:', 'يصبح مشكلة:'), 'القضية لا تنتظر', 'المشكلة لا تنتظر'), 'والقضية تحتاج قرارًا', 'والمشكلة تحتاج قرارًا')::jsonb where key = 'risk-register';

update leaders.handbook_modules
   set body_md = replace(body_md, '- ميثاق المشروع عقدًا داخليًا ملزمًا.', '- ميثاق المشروع (بطاقة المبادرة في وثيقتك) عقدًا داخليًا ملزمًا.')
 where dimension = 'milestone' and chapter_key = 'ch3';

update leaders.tracks set focus_ar = replace(focus_ar, 'ومحاكمة أدلته', 'وتقييم أدلته') where focus_ar like '%ومحاكمة أدلته%';

-- عناوين المسارات تصف المستوى لا النطاق: النطاق في ملف المشارك
update leaders.tracks t set title_ar = v.t
  from (values ('M3I2L1', 'مسار خبير التنفيذ نحو القيادة التحويلية'),
               ('M3I2L2', 'مسار خبير التنفيذ نحو إثبات القيمة'),
               ('M3I3L1', 'مسار خبير التنفيذ والأثر نحو القيادة التحويلية'),
               ('M3I3L2', 'مسار خبير التنفيذ والأثر نحو الريادة القيادية')) as v(k, t)
 where t.key = v.k;

-- ════════════ مستوى المختبرات ════════════
update leaders.lab_items set min_level = 'advanced' where key in ('evm-checkpoint', 'portfolio-review');
update leaders.lab_items set min_level = 'beginner' where key = 'conflict-modes';

-- تمرين DIRECT متقدم في الكتاب كما في المختبر، فيُنقل إلى آخر القائمة داخل كتلته
update leaders.handbook_modules
   set body_md = replace(body_md,
     E'4. **تمرين DIRECT**: تطبيق الأداة كاملة على تحدٍّ حقيقي من عملك.\n5. **فحص الجاهزية القيادية**: ',
     E'4. **فحص الجاهزية القيادية**: ')
 where dimension = 'leadership' and chapter_key = 'labs' and strpos(body_md, ':::min=advanced' || E'\n' || '5. **تمرين DIRECT**') = 0;
update leaders.handbook_modules
   set body_md = regexp_replace(body_md,
     '(4\. \*\*فحص الجاهزية القيادية\*\*: [^\n]*)',
     E'\\1\n:::min=advanced\n5. **تمرين DIRECT**: تطبيق الأداة كاملة على تحدٍّ حقيقي من عملك.\n:::')
 where dimension = 'leadership' and chapter_key = 'labs' and strpos(body_md, '5. **تمرين DIRECT**') = 0;

-- ════════════ 4) أسئلة بمستوى الكتل التي تختبرها ════════════
-- السؤال داخل :::min=… لا يظهر ولا يُحتسب إلا لمن يرى الكتلة نفسها
update leaders.handbook_modules m
   set quiz_md = coalesce(nullif(trim(m.quiz_md), ''), '') || E'\n\n' || v.q
  from (values
('milestone', 'ch1', $q$:::min=intermediate
س: جهة لكل مدير مشروع فيها طريقته الخاصة، وتنجح مشاريعها حين يقودها أشخاص بعينهم. أين تقع على P3M3، وما خطوتها التالية؟
- المستوى الثالث، وخطوتها القياس الكمي للأداء
* المستوى الأول (مبدئي)، وخطوتها توحيد الممارسات على المشاريع المتشابهة
- المستوى الثاني، وخطوتها التحسين المستمر والابتكار
- المستوى الأول، وخطوتها الانتقال مباشرة إلى منهجية مؤسسية كاملة
لماذا: الممارسات الفردية غير الموثقة علامة المستوى المبدئي، والمستويات لا يُقفز بينها، فالخطوة التالية هي التكرار على المشاريع المتشابهة قبل المنهجية المؤسسية.
:::$q$),
('milestone', 'ch4', $q$:::min=intermediate
س: في تحليل اتجاه المعالم، يصعد خط معلم «الإطلاق» في كل تقرير شهري منذ أربعة أشهر. ما القراءة الصحيحة؟
- ثبات في الخطة لأن المعلم ما زال قائمًا
- أمر طبيعي يكفيه تحديث التاريخ في كل تقرير
* انزلاق متكرر يستدعي قرارًا عند المعلم، لا تاريخًا جديدًا
- خطأ في الرسم، لأن خط المعلم يجب أن يهبط
لماذا: الخط الأفقي ثبات، والصاعد انزلاق متكرر، والتحليل يكشفه مبكرًا كي يُتخذ قرار قبل أن يصير أزمة.
:::

:::min=advanced
س: عند معلم منتصف المدة: القيمة المخططة 6 ملايين، والمكتسبة 6 ملايين، والتكلفة الفعلية 7.5 ملايين، والميزانية 12 مليونًا. ما القراءة؟
- متأخر في الجدول وضمن التكلفة
* في موعده ومتجاوز للتكلفة، ويُتوقع أن ينتهي بنحو 15 مليونًا إن استمر الأداء
- متأخر ومتجاوز معًا، والتقدير عند الإكمال 12 مليونًا
- في موعده وضمن التكلفة، لأن المنجز يساوي المخطط
لماذا: مؤشر الجدول 6 ÷ 6 = 1 فلا تأخر، ومؤشر التكلفة 6 ÷ 7.5 = 0.8 فهناك تجاوز، والتقدير عند الإكمال 12 ÷ 0.8 = 15 مليونًا.
:::$q$),
('milestone', 'ch5', $q$:::min=advanced
س: مشروع يسير على خطته، لكن مجلس البرنامج يرى أن استمراره يضر منفعة البرنامج الرئيسة، ومدير المشروع يقول إن القرار ضمن صلاحيته. أين يُحسم؟
- في المشروع، لأن الخطة معتمدة والمدير صاحب الصلاحية
* في البرنامج، لأن القرار يُحسم في أعلى طبقة يمسها
- في المحفظة دائمًا، لأن كل إيقاف قرار محفظي
- بالتصويت بين مدير المشروع ومجلس البرنامج
لماذا: ما يمس منافع البرنامج لا يُحسم في المشروع ولو كان ضمن صلاحية مديره، وإن تقرر الإيقاف فبمعلم إغلاق منظم يحفظ ما تحقق.
:::$q$),
('impact', 'ch2', $q$:::min=intermediate
س: برنامج بدأ قبل ستة أشهر، ويريد فريقه الآن إثبات أثره للمانح، ولم يُقس أي مؤشر قبل التدخل. ما الممارسة التي غابت؟
- تقييم الأثر المستقل بعد الإغلاق
* خط الأساس المبكر، فلا قياس أثر بلا نقطة بداية تُبنى قبل التدخل
- معايير DAC الست، لأنها تُطبق في البداية فقط
- الإطار المنطقي، لأنه يغني عن أي قياس
لماذا: خط الأساس يُبنى قبل التدخل لا بعده، وبدونه لا يُعرف مقدار التغيير مهما كانت المؤشرات جيدة.
:::$q$),
('impact', 'ch4', $q$:::min=intermediate
س: حسب فريق أن برنامج توظيف حقق عائدًا اجتماعيًا بستة أضعاف كلفته، لكنه لم يخصم من كانوا سيتوظفون بجهدهم لو لم يوجد البرنامج. أي خصم أهمل؟
* ما كان سيحدث بدوننا (Deadweight)
- ما يُنسب لغيرنا (Attribution)
- ما أزحناه من مكان آخر (Displacement)
- تناقص الأثر مع الزمن (Drop-off)
لماذا: من كانوا سيتوظفون دون البرنامج هم الأثر الذي كان سيحدث بدوننا، وإهماله يضخم العائد.
:::

:::min=advanced
س: وزارة ستقرر توسيع برنامج تجريبي إلى مستوى وطني، والدليل المتاح قياس قبل وبعد للمستفيدين فقط. ما الحكم؟
- كافٍ، لأنه يثبت حدوث التغيير
- كافٍ إن دعمته شهادات المستفيدين
* غير كافٍ لقرار بهذا الحجم، ويحتاج مقارنة بمجموعة لم تستفد فأعلى
- لا يُقبل إلا تجربة عشوائية محكمة في كل الأحوال
لماذا: القياس قبل وبعد يثبت التغيير ولا يثبت أننا سببه، وقرار التوسع الوطني يحتاج دليلًا من الدرجة الثالثة فأعلى، والتجربة العشوائية ليست شرطًا ولا تصلح لكل سياق.
:::$q$),
('impact', 'ch5', $q$:::min=advanced
س: يجمع مدير برنامج «الوظائف المتحققة» من تقارير مشاريعه الخمسة ليعلن أثر البرنامج، وبعض المستفيدين خدمهم أكثر من مشروع. ما الخلل؟
- لا خلل، فالجمع هو طريقة قياس أثر البرنامج
* عد مزدوج يضخم الأثر، وأثر البرنامج يُقاس على مستواه بمنهجية تجميع معلنة
- الخلل أن الوظائف ليست مؤشر أثر أصلًا
- يكفي خصم نسبة ثابتة من المجموع لتصحيحه
لماذا: منافع المشاريع تتداخل، وجمعها حرفيًا يضخم الأثر، ورقم مجمّع بلا منهجية معلنة ادعاء لا دليل.
:::$q$),
('leadership', 'ch2', $q$:::min=intermediate
س: تصل الفريق توجيهات من ثلاث قنوات متعارضة، ويختلف أفراده في فهم المطلوب. أي ممارستين تعالجان ذلك أولًا؟
- الأفق الزمني المعلن والتصعيد الذكي
* قناة التلقي الموحدة، وإقرار الاستلام والفهم
- التصعيد الذكي وزيادة عدد الاجتماعات
- الأفق الزمني المعلن وإقرار الاستلام
لماذا: القناة الموحدة تمنع تضارب الأوامر، وإقرار الاستلام بإعادة صياغة المقصود يكشف اختلاف الفهم قبل التنفيذ.
:::$q$),
('leadership', 'ch4', $q$:::min=advanced
س: في أداة DIRECT، بدأ قائد بحل مقترح قبل أن يفهم سبب التحدي. أي خطوة تخطاها؟
* التشخيص، وهو أول الأداة قبل التأثير والحل
- التتبع حتى الإغلاق
- التعاطف والتواصل
- التأثير
لماذا: DIRECT مسار منضبط يبدأ بالتشخيص ثم التأثير ثم الحل، يسنده التعاطف والتواصل، ثم التتبع حتى الإغلاق.
:::

:::min=advanced
س: مدير مشروع في فريقك يأتيك بكل مشكلة لتحلها، وأنت تحلها سريعًا. ما سلوك قيادة القادة المطلوب؟
- أن تستمر في الحل، لأن سرعتك تحمي المبادرة
* أن تعيد المشكلة إليه بسؤال يبني حكمه، وتتفق معه على حدود التصعيد
- أن تسحب منه الملف وتسنده لمن هو أقدر
- أن تتابع خطواته يوميًا حتى يتقن
لماذا: قيادة القادة تنقلك من الحل إلى السؤال، ومن متابعة الخطوات إلى المعايير، ومقياسها كم منهم يستطيع أخذ مكانك غدًا.
:::$q$),
('leadership', 'ch5', $q$:::min=advanced
س: قائد ناجح في المشاريع انتقل إلى قيادة برنامج، فاستمر في مراجعة تفاصيل كل مهمة بنفسه. ما خطأ الانتقال؟
- لا خطأ، فالتفاصيل أساس النجاح في كل طبقة
* حمل نجاح الطبقة الأدنى معه، والمطلوب قراءة الأنماط عبر المشاريع وبناء قرار قادتها
- أنه لم يختر مكسبًا سريعًا يثبت به نفسه
- أنه لم يوسّع فريقه
لماذا: الانتقال بين الطبقات تغيير في طبيعة العمل، من التفاصيل إلى الأنماط ومن الفريق إلى قادة الفرق.
:::$q$)
  ) as v(d, c, q)
 where m.dimension = v.d and m.chapter_key = v.c
   and strpos(coalesce(m.quiz_md, ''), split_part(split_part(v.q, E'\n', 2), '،', 1)) = 0;

-- ════════════ 5) مصدر واحد للمشروع التطبيقي ════════════
-- النص يُشتق الآن من فصول الوثيقة بمستويات المسار ونطاق المشارك (capstone.js trackProject)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'leaders' and table_name = 'tracks' and column_name = 'project_ar') then
    create table if not exists leaders.backup_20261031_track_project as select key, project_ar from leaders.tracks;
    alter table leaders.backup_20261031_track_project enable row level security;
    alter table leaders.tracks drop column project_ar;
  end if;
end $$;

notify pgrst, 'reload schema';
