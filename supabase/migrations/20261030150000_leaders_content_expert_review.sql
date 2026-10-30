-- ════════════════════════════════════════════════════════════════
-- المرحلة الثالثة: قرارات المحتوى بعد المراجعة الخبيرة (المنهجية والقياس وانتقال الأثر)
-- ════════════════════════════════════════════════════════════════
create table if not exists leaders.backup_20261030_phase3 as
  select 'model' kind, key ref, capstone_sort::text a, fields::text b from leaders.learning_models
  union all select 'module', chapter_key || '/' || dimension, title_ar, body_md from leaders.handbook_modules
  union all select 'stage', key, outcome_ar, activities_ar from leaders.journey_stages
  union all select 'req', code, active::text, title_ar from leaders.stage_requirements;

-- 1) وثيقة المبادرة تبدأ بالقيمة ثم تشتق النطاق (منطق إدارة المنافع MSP/BRM ورسالة البرنامج نفسه):
--    البطاقة ← المسوغ ← نظرية التغيير ← المنافع ← خطة الأدلة ← أصحاب المصلحة ← هيكل العمل ← المعالم ← …
update leaders.learning_models m set capstone_sort = v.s from (values
  ('initiative-charter', 10), ('options-analysis', 20), ('theory-of-change', 30), ('benefits-register', 40),
  ('evidence-plan', 50), ('stakeholder-map', 60), ('wbs', 70), ('milestone-register', 80), ('schedule', 90),
  ('cost-plan', 100), ('roadmap', 110), ('portfolio-review', 115), ('governance', 120), ('raid', 130),
  ('stage-gate', 140), ('change-sustain', 150), ('development-plan', 160), ('transformation-story', 170)
) v(k, s) where m.key = v.k;

-- 2) سجل المنافع يكتمل بما يعرّف به البرنامج المنفعة نفسها: تاريخ التحقق وتكرار القياس
--    (الأعمدة تُضاف في آخر الجدول فلا تتغير مواضع ما سُجّل قبلها)
update leaders.learning_models set fields = (
  select jsonb_agg(case when f->>'type' = 'table' and not (f->'columns' ? 'تاريخ التحقق')
    then jsonb_set(jsonb_set(f, '{columns}', (f->'columns') || '["تاريخ التحقق", "تكرار القياس"]'::jsonb),
         '{hint}', to_jsonb(coalesce(nullif(f->>'hint', ''), '') || case when coalesce(f->>'hint', '') = '' then '' else ' ' end || 'سجّل المنافع السلبية أيضًا (أثر جانبي غير مرغوب) بعلامة سالب في المستهدف.'))
    else f end order by o) from jsonb_array_elements(fields) with ordinality as t(f, o))
 where key = 'benefits-register';

-- 3) سلسلة القيمة: «التأثير» في السلسلة يلتبس بالتأثير بمعنى النفوذ (خطوة DIRECT وفصل «التأثير بلا سلطة»)،
--    فصار «الأثر الأوسع». وجسر صريح بين سلسلة النتائج (Milestone) والسلسلة الخماسية (Impact): عدستان لا نموذجان متنافسان.
update leaders.handbook_modules set body_md = replace(replace(replace(replace(body_md,
    'التأثير: التحول الأوسع في المنظومة أو المجتمع.', 'الأثر الأوسع: التحول في المنظومة أو المجتمع.'),
    'التأثير | ما التحول الأوسع الذي أسهمنا فيه؟', 'الأثر الأوسع | ما التحول الذي أسهمنا فيه؟'),
    'أعلى السلسلة: التأثير والأثر المستدام', 'أعلى السلسلة: الأثر الأوسع والأثر المستدام'),
    'التأثير: مساهمة بأدلة', 'الأثر الأوسع: مساهمة بأدلة')
 where chapter_key = 'ch2' and dimension = 'impact';
update leaders.handbook_modules set body_md = replace(body_md, '## سلسلة القيمة الخماسية',
  E'## سلسلة القيمة الخماسية\n\n> هذه السلسلة تفصيل لسلسلة النتائج في إطار Milestone لا بديل عنها: المخرجات هي المخرجات، والنتائج المباشرة والمنافع تفصيل «النتائج»، والأثر الأوسع والأثر المستدام تفصيل «الأثر». الأولى تحكم التنفيذ، وهذه تحكم القيمة.')
 where chapter_key = 'ch2' and dimension = 'impact' and body_md not like '%تفصيل لسلسلة النتائج%';

-- 4) أسماء الجدارات القيادية واحدة: «الاستجابة المنضبطة» و«انتقال العهدة» (وحلقة التسليم والتسلم إجراؤها)
update leaders.handbook_modules set body_md = replace(replace(replace(body_md,
    'الاستجابة المنضبطة (وتُسمى أيضًا سرعة الاستجابة)', 'الاستجابة المنضبطة'),
    '@compare سرعة الاستجابة مقابل التسرع', '@compare الاستجابة المنضبطة مقابل التسرع'),
    'سرعة الاستجابة | التسرع', 'الاستجابة المنضبطة | التسرع')
 where chapter_key = 'ch2' and dimension = 'leadership';
update leaders.handbook_modules set body_md = replace(replace(replace(body_md,
    'إتقان جدارة سرعة الاستجابة', 'إتقان جدارة الاستجابة المنضبطة'),
    'إتقان جدارة التسليم والتسلم', 'إتقان جدارة انتقال العهدة'),
    'جدارتا سرعة الاستجابة والتسليم والتسلم', 'جدارتا الاستجابة المنضبطة وانتقال العهدة')
 where chapter_key = 'intro' and dimension = 'leadership';
update leaders.handbook_modules set body_md = replace(replace(body_md,
    'سرعة الاستجابة: قرار في وقته.', 'الاستجابة المنضبطة: قرار في وقته.'),
    'التسليم والتسلم: نقل المسؤولية بوضوح.', 'انتقال العهدة: نقل المسؤولية بوضوح.')
 where chapter_key = 'ch6' and dimension = 'milestone';
update leaders.handbook_modules set body_md = replace(body_md, '## حلقة التسليم والتسلم', E'## حلقة التسليم والتسلم\n\nهي إجراء جدارة انتقال العهدة: كيف تنتقل المسؤولية من يد إلى يد دون أن يضيع الأثر.')
 where chapter_key = 'ch3' and dimension = 'leadership' and body_md not like '%هي إجراء جدارة انتقال العهدة%';

-- 5) DIRECT: التعاطف لا يأتي بعد الحل؛ حاضر منذ التشخيص، وموضعه في الأداة لحظة تثبيت الحل مع المتأثرين به
update leaders.handbook_modules set body_md = replace(body_md, E'تتبع: حتى الإغلاق.\n',
  E'تتبع: حتى الإغلاق.\n\n> التعاطف حاضر منذ التشخيص، فلا يُفهم تحدٍّ دون فهم من يعيشه. وموضعه بعد الحل في الأداة لأنه لحظة تثبيت الحل مع المتأثرين به: ما الذي سيخسرونه، وما الذي يحتاجونه ليتبنوه.\n')
 where chapter_key = 'ch6' and dimension = 'leadership' and body_md not like '%التعاطف حاضر منذ التشخيص%';

-- 6) EAC: الصيغة الثانية حين يكون الانحراف عارضًا
update leaders.handbook_modules set body_md = replace(body_md,
  'التكلفة النهائية المتوقعة إن استمر الأداء كما هو.',
  'التكلفة النهائية المتوقعة إن استمر الأداء كما هو. وإن كان الانحراف عارضًا لا يتكرر فالأدق: EAC = AC + (BAC − EV).')
 where chapter_key = 'ch4' and dimension = 'milestone' and body_md not like '%EAC = AC +%';

-- 7) انتقال الأثر (Kirkpatrick 1 و3 و4): بيئة العمل أقوى عامل في نقل التعلم، فيدخل المدير والراعي من البداية،
--    ويُقاس السلوك من منظور الآخرين قبل البرنامج وبعده للمستويات كلها لا مرة واحدة في منتصفه.
insert into leaders.learning_models (dimension, key, sort, title_ar, icon, summary_ar, when_ar, steps_ar, min_level, points, fields)
select 'leadership', 'learning-agreement', coalesce((select max(sort) from leaders.learning_models where dimension = 'leadership'), 0) + 1,
  'اتفاق التعلم الثلاثي', '◇',
  'اتفاق قصير بينك وبين مديرك وراعي مبادرتك على ما ستطبقه وما يقدمه كل منهم، قبل أن يبدأ التدريب.',
  'في أول التدريب، بعد اعتماد مستواك.',
  E'اجلس مع مديرك نصف ساعة\nاتفقا على سلوكين ستغيرهما في عملك\nحدد ما يقدمه المدير والراعي لك\nحدد موعد مراجعة في منتصف الرحلة',
  'beginner', 20,
  '[{"key":"project","type":"text","label":"مشروع التطبيق","required":true},
    {"key":"behaviors","type":"textarea","label":"السلوكان اللذان ستغيرهما في عملك، وكيف سيلاحظهما مديرك","required":true},
    {"key":"manager","type":"textarea","label":"ما يقدمه مديرك: وقت، أو صلاحية، أو فرصة تطبيق","required":true},
    {"key":"sponsor","type":"text","label":"راعي المبادرة وموعد إحاطته ببطاقتها","required":true},
    {"key":"review","type":"text","label":"موعد مراجعة منتصف الرحلة مع مديرك","required":true}]'::jsonb
where not exists (select 1 from leaders.learning_models where key = 'learning-agreement');

insert into leaders.stage_requirements (program_id, stage_key, code, title_ar, help_ar, kind, required, needs_review, active, sort, config)
select '2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', v.stage, v.code, v.title, v.help, v.kind, v.req, false, true, v.sort, v.config::jsonb
from (values
  ('training', 'T-AGREE', 'اتفاق التعلم الثلاثي: أنت ومديرك وراعي مبادرتك', 'من نموذج «اتفاق التعلم الثلاثي» في مكتبة النماذج، قبل اليوم الأول من التدريب.', 'model', true, 0, '{"model_key":"learning-agreement","accept":"submitted"}'),
  ('training', 'T-360', 'تقييم 360 قبلي مختصر (المدير والزملاء)', 'يرسل لك المستشار رابطًا قبل التدريب، ويُعاد بالأداة نفسها في التقييم فيُقاس تغير السلوك كما يراه الآخرون.', 'check', true, 5, '{}'),
  ('training', 'T-REACT', 'رأيك في أيام التدريب', 'استبانة قصيرة بعد آخر أيام التدريب، تحسّن الدفعات القادمة.', 'check', false, 6, '{}'),
  ('evaluation', 'E-360', 'تقييم 360 بعدي بالأداة القبلية نفسها', 'المقيّمون أنفسهم إن أمكن، فيُقارن السلوك قبل البرنامج وبعده.', 'check', true, 5, '{}'),
  ('report', 'R-6M', 'قراءة الأثر بعد ستة أشهر', 'تحدّث سجل المنافع بالقراءات بعد ستة أشهر من التقرير، فالمنافع تحتاج وقتًا لتظهر.', 'check', false, 2, '{}')
) v(stage, code, title, help, kind, req, sort, config)
where not exists (select 1 from leaders.stage_requirements r where r.code = v.code and r.program_id = '2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78');

-- تقييم 360 في منتصف الرحلة وللمتوسط والاحترافي فقط حلّ محله الزوج القبلي والبعدي للجميع
update leaders.stage_requirements set active = false where code in ('L-360I', 'L-360A');

-- نتائج التقييم بعد 104 أيام مؤشرات مبكرة؛ الأثر الكامل يُقرأ بعد ستة أشهر
update leaders.journey_stages set outcome_ar = 'مؤشرات أثر مبكرة موثقة بالأدلة: مقارنة قبل وبعد، وقصة نجاح معتمدة.'
 where key = 'evaluation';
