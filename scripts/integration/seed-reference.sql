-- بذرة مرجعية لقاعدة التكامل (سير integration.yml)، تُطبَّق بعد اللقطة وقبل الترحيلات.
-- هذه الصفوف تلقاها الإنتاج قبل وجود مجلد الترحيلات (عهد server/*.sql ومحرر SQL)، وتشترطها
-- الترحيلات اللاحقة (مفاتيح أجنبية إلى المراحل والأدوار) أو المسارات الذهبية (نموذج التسكين).
-- القيم منقولة من الملفات التاريخية نفسها (server/ARCHIVE.md: لا تُشغَّل ولا تُعدَّل)، وما غيّرته
-- الترحيلات اللاحقة تغيّره هنا أيضًا بالترتيب. المحتوى الطويل (الكتيب، نصوص المسارات) ليس هنا لأنه
-- خارج المسارات الذهبية. لا يُشغَّل على الإنتاج؛ يستدعيه scripts/integration/apply-migrations.sh فقط.

-- صلاحيات مخطط leaders (server/leaders.sql): اللقطة لا تحمل الصلاحيات (introspect.sql يستبطن البنية لا ACL)،
-- والوصول عبر service_role وحده؛ والافتراضية تغطي ما تنشئه الترحيلات بعد هذا الملف بالدور نفسه (postgres)
revoke all on schema leaders from public, anon, authenticated;
grant usage on schema leaders to service_role;
revoke all on all tables    in schema leaders from public, anon, authenticated;
revoke all on all sequences in schema leaders from public, anon, authenticated;
revoke all on all functions in schema leaders from public, anon, authenticated;
grant all on all tables    in schema leaders to service_role;
grant all on all sequences in schema leaders to service_role;
alter default privileges in schema leaders revoke all on tables    from public, anon, authenticated;
alter default privileges in schema leaders revoke all on functions from public, anon, authenticated;
alter default privileges in schema leaders grant all on tables    to service_role;
alter default privileges in schema leaders grant all on sequences to service_role;

-- أدوار لوحة الإدارة (العقد في admin-api: super_admin | admin | viewer)
insert into public.admin_roles (id, name_ar, description) values
  ('super_admin', 'مالك',  'كل الصلاحيات وإدارة المدراء'),
  ('admin',       'مدير',  'إدارة المحتوى والمشاركين'),
  ('viewer',      'مطّلع', 'قراءة فقط')
on conflict (id) do nothing;

-- البرنامج الافتراضي بمعرّف الإنتاج (الترحيل 20261024190000 يدرجه إن غاب؛ المراحل أدناه تشير إليه)
insert into leaders.programs (id, name, description_ar, is_default)
values ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'برنامج القادة', 'البرنامج الأساسي. يسري على كل من ليس في دفعة برنامج آخر.', true)
on conflict (id) do nothing;

-- مراحل الرحلة (server/leaders-002-assessment.sql و003-journey.sql)
insert into leaders.journey_stages (program_id, key, sort, title_ar, duration_label, duration_days, description_ar) values
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'profile',             1,  'الملف الشخصي',          'دقائق',          0,  'بياناتك الأساسية وسيرتك المهنية.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'assessment',          2,  'تحديد المستوى',         '12 دقيقة',       0,  'القياس المبدئي في الأبعاد الثلاثة.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'approval',            3,  'اعتماد المستوى',        '3 أيام عمل',     3,  'يراجع المستشار نتيجتك ويعتمد مسارك.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',            4,  'التدريب',               '4 أيام تدريبية', 4,  'أيام تدريبية مكثفة على الأطر الثلاثة بعمق يناسب مستوى المشارك في كل بُعد.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching',        5,  'التوجيه على رأس العمل', '4 أسابيع',       28, 'تطبيق أدوات الإطار على مشروع حقيقي من عمل المشارك بمتابعة الموجّه.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'consulting',          6,  'الاستشارة',             'أسبوعان',        14, 'جلسة استشارية متخصصة مرتبطة بمشروعات المشارك.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 7,  'التوجيه القيادي',       '4 أسابيع',       28, 'جلسات توجيه فردية لدعم المسار القيادي وخطة التطوير الذاتي.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'support',             8,  'الدعم والتمكين',        '3 أشهر',         90, 'دعم فني وتقني مستمر عبر المنصة حتى استقلال المشارك.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'evaluation',          9,  'التقييم والقياس',       'أسبوعان',        14, 'القياس البعدي والتقييم النهائي وإصدار التقرير للمشارك أو جهته.'),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'report',              10, 'التقرير النهائي',       'أسبوع',          7,  'تقرير مفصل لك أو للجهة التي رشحتك.')
on conflict (program_id, key) do nothing;

-- نموذج التسكين (server/leaders-008-placement-model.sql؛ القيم الافتراضية في اللقطة هي المعايَرة الحالية)
insert into leaders.placement_model (id) values (1) on conflict (id) do nothing;

-- خلايا الشبكة: بُعد × مستوى (server/leaders.sql)
insert into leaders.grid_cells (dimension, level)
select d.key, l.key from leaders.dimensions d cross join leaders.levels l
on conflict (dimension, level) do nothing;

-- متطلبات المراحل الأولى (server/leaders-003-journey.sql و006-journey-content.sql)
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review) values
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'profile',    null, null, 'P-INFO',   1, 'إكمال البيانات الأساسية',        null, 'form',    true,  false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'profile',    null, null, 'P-CV',     2, 'رفع السيرة الذاتية',             null, 'upload',  false, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'profile',    null, null, 'P-PROJECT', 3, 'تسمية مشروع التطبيق ووصفه في سطرين', 'مشروع حقيقي تقوده الآن. اكتبه في نبذتك المهنية من ملفك الشخصي.', 'check', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'assessment', null, null, 'A-DONE',   1, 'إكمال القياس المبدئي',           null, 'auto',    true,  false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'approval',   null, null, 'AP-OK',    1, 'اعتماد المستوى من المستشار',     null, 'auto',    true,  false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'approval',   null, null, 'AP-INT',   2, 'مقابلة التحقق مع المستشار (عند الحاجة)', 'يحددها المستشار إن احتاج توضيحًا، ومدتها 20 دقيقة عن بعد.', 'meeting', false, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   null, null, 'T-PRE',    0, 'قراءة الباب التمهيدي لكل إطار قبل اليوم الأول', 'من كتيبك الشخصي. التدريب يبني على هذه القراءة ولا يكررها.', 'reading', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   null, null, 'T-ATTEND', 1, 'حضور الأيام التدريبية الأربعة', 'يسجل المدرب حضورك في نهاية كل يوم.', 'check', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   null, null, 'T-HB',     2, 'قراءة كتيبك الشخصي',             'الأبواب المخصصة لمستواك في الأطر الثلاثة.', 'reading', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   null, null, 'T-PLAN',   3, 'رفع خطة التطبيق الأولية (مخرج اليوم الرابع)', 'سجل معالم مبدئي، وفرضية أثر، وخريطة أصحاب مصلحة لمشروعك.', 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   'milestone', 'beginner', 'T-MB', 4, 'تمرين: تحويل جدول مشروعك إلى خمسة معالم قرار', null, 'check', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'training',   'milestone', 'advanced', 'T-MA', 4, 'تمرين: تصميم بوابات المراحل لمحفظة من مشروعين أو أكثر', null, 'check', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', null, null, 'O-SESS', 0, 'حضور أربع جلسات توجيه أسبوعية', 'يسجلها الموجّه بعد كل جلسة.', 'meeting', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', 'milestone', null, 'O-MREG', 1, 'بناء سجل معالم لمشروع من عملك', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', 'impact',    null, 'O-BREG', 2, 'بناء سجل منافع لنفس المشروع',   null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', 'milestone', 'advanced', 'O-GATE', 3, 'إدارة جلسة بوابة مرحلة موثقة', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', 'impact', 'intermediate', 'O-KPI', 4, 'مؤشرات أثر بخط أساس وقيمة مستهدفة', 'ثلاثة مؤشرات على الأقل، لكل منها مصدر بيانات وتوقيت قياس.', 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'ojt_coaching', 'impact', 'advanced', 'O-CHAIN', 5, 'سلسلة قيمة كاملة من المخرجات إلى الأثر الاستراتيجي', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'consulting', null, null, 'C-BRIEF',  0, 'ملخص التحدي في صفحة واحدة قبل الجلسة', 'القرار المطلوب، والخيارات المتاحة، والمخاطر، وما جربته.', 'upload', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'consulting', null, null, 'C-MEET',   1, 'حضور الجلسة الاستشارية',         null, 'meeting', true,  false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'consulting', null, null, 'C-ACT',    2, 'خطة تنفيذ التوصيات', 'ماذا ستطبق من مذكرة التوصيات، ومتى، ومن المسؤول.', 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', null, null, 'L-SESS', 0, 'حضور ثلاث جلسات توجيه فردية', 'جلسات سرية، ولا يُشارك مضمونها مع جهتك.', 'meeting', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 'leadership', null, 'L-PLAN', 1, 'خطة التطوير القيادي الشخصية', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 'leadership', 'beginner', 'L-MAP', 2, 'خريطة أصحاب المصلحة لمشروعك', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 'leadership', 'advanced', 'L-DIRECT', 2, 'تطبيق أداة DIRECT على تحدٍّ حقيقي', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 'leadership', 'intermediate', 'L-360I', 3, 'تقييم 360 درجة مختصر', 'يرسل لك الموجّه رابطًا توزعه على مديرك وثلاثة زملاء.', 'check', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'leadership_coaching', 'leadership', 'advanced', 'L-360A', 3, 'تقييم 360 درجة مختصر', 'يرسل لك الموجّه رابطًا توزعه على مديرك وثلاثة زملاء وثلاثة من فريقك.', 'check', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'support',    null, null, 'S-CHECK',  1, 'متابعة شهرية مع الموجّه (3 جلسات)', null, 'meeting', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'support',    null, null, 'S-COP',    2, 'المشاركة في لقاءات مجتمع الممارسة', 'لقاء جماعي شهري لدفعتك، تتبادلون فيه ما نجح وما تعثر.', 'check', false, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'support',    null, null, 'S-UPDATE', 3, 'سجل المنافع محدّثًا بالقراءات الفعلية', null, 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'evaluation', null, null, 'E-POST',   1, 'إكمال القياس البعدي',            null, 'auto',    true,  false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'evaluation', null, null, 'E-CASE',   2, 'قصة نجاح مشروعك بالأدلة', 'ما الذي تغير، وكيف تعرف، وما دور البرنامج فيه.', 'upload', true, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'evaluation', null, null, 'E-PRES',   3, 'عرض المشروع أمام لجنة التقييم', null, 'meeting', true, false),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'evaluation', null, null, 'E-MGR',    4, 'إفادة المدير المباشر', 'نموذج قصير يملؤه مديرك عن تغير ممارستك.', 'upload', false, true),
  ('2bb237ac-9e2d-4e75-8cb3-6ea4ade78c78', 'report',     null, null, 'R-ISSUE',  1, 'استلام التقرير النهائي',         null, 'auto',    true,  false)
on conflict (program_id, code) do nothing;
