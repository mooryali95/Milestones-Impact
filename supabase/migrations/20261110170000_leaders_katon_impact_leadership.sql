-- ════════════════════════════════════════════════════════════════
-- موضوعات «كاتون» لإطاري الأثر والقيادة (مسودة للجنة المحتوى)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant بيانات فقط في جدولين قائمين، والدوال تقرأ المنشور وحده فلا يتغير شيء للمشارك قبله ولا بعده
-- مولَّد من scripts/katon/build-v2-migration.mjs ومصدره supabase/content/katon/v2/topics.json.
-- ستة موضوعات (ثلاثة لكل إطار) بحالة draft: تُراجَع وتُنشر من محرر كاتون في اللوحة بعد اعتماد لجنة المحتوى،
-- وبنشر ثلاثة في كل إطار تجتاز بوابة م4 (كاتون بثلاثة موضوعات منشورة في كل إطار).
-- آمن لإعادة التشغيل: الموضوع الموجود بمفتاحه لا يُمس، وجمله لا تُدرج مرتين.

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('impact-baseline', 'خط الأساس', 'impact', '{"competencies":["القياس","الأثر"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 101)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'خط الأساس يُقاس قبل التدخل لأن التغيير لا يُثبت بلا نقطة بداية يُقارن بها.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'خط الأساس هو قيمة المؤشر عند انتهاء المشروع، ويُقارن بها المستهدف.', 'false', 'الصحيح: خط الأساس قيمة المؤشر قبل التدخل. ما يُقاس عند الانتهاء هو النتيجة.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يُقاس خط الأساس بالمؤشر نفسه وبالطريقة نفسها التي ستُقاس بها النتيجة لاحقًا.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'إذا غاب خط الأساس أمكن عرض ما تحقق، وتعذّر إثبات أن المشروع هو سببه.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'قياس خط الأساس من مسؤولية جهة التقييم الخارجية، وتتولاه بعد إغلاق المشروع.', 'false', 'الصحيح: يُقاس مع تصميم المشروع، ومسؤوليته على فريق المشروع ومالك المنفعة. بعد الإغلاق فات وقته.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'الوقت الصحيح لقياس خط الأساس هو مرحلة التصميم، قبل أول نشاط.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'impact-baseline' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('impact-benefits-plan', 'خطة تحقيق المنافع', 'impact', '{"competencies":["الأثر","الرؤية الكلية"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 102)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'خطة تحقيق المنافع توجد لأن تسليم المخرج لا يضمن تحقق المنفعة منه.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'خطة تحقيق المنافع وثيقة تسرد مخرجات المشروع ومواعيد تسليمها.', 'false', 'الصحيح: الخطة تحدد لكل منفعة مالكها ومؤشرها وموعد تحققها. سرد المخرجات ومواعيدها خطة تسليم.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'تُبنى الخطة بحصر مخرجات المشروع ثم البحث عن منفعة تناسب كل مخرج.', 'false', 'الصحيح: الاتجاه معكوس. تبدأ الخطة من المنفعة المطلوبة ثم تُحدَّد المخرجات التي تحققها.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'بلا خطة منافع قد يُغلق المشروع ناجحًا في التسليم ولا يسأل أحد بعده هل تحققت المنفعة.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'مالك المنفعة في الغالب من الجهة المستفيدة التي ستشغّل المخرج، لا من فريق المشروع.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'تُكتب خطة تحقيق المنافع مع دراسة الجدوى، وتُتابَع بعد إغلاق المشروع.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'impact-benefits-plan' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('impact-report', 'تقرير الأثر', 'impact', '{"competencies":["الأثر","التواصل"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 103)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'تقرير الأثر يُكتب ليخدم قرارًا: استمرار أو تعديل أو إيقاف.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'تقرير الأثر يقيس النتيجة مقابل خط الأساس، لا عدد الأنشطة المنفذة.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يُعرض في تقرير الأثر التغيّر في المؤشر مع ما يدل على أن المشروع ساهم فيه.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'حين يغيب تقرير الأثر تبقى قرارات التمويل سليمة ما دامت تقارير الإنجاز منتظمة.', 'false', 'الصحيح: تقرير الإنجاز يثبت اكتمال التسليم لا تحقق المنفعة، فتُبنى قرارات التمويل والاستمرار على غير دليل الأثر.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'جمهور تقرير الأثر من يملك القرار: الجهة المموِّلة وجهة الإشراف والمستفيد.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'يصدر تقرير الأثر مع تقرير الإغلاق، وبه ينتهي قياس المشروع.', 'false', 'الصحيح: يصدر في مواعيد ترتبط بتحقق المنفعة، وكثير منها بعد الإغلاق.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'impact-report' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('leadership-stakeholders', 'مصفوفة أصحاب المصلحة', 'leadership', '{"competencies":["التأثير","التواصل"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 104)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'تُصنَّف المصفوفة أصحاب المصلحة لأن جرعة التواصل وقناته تختلف من واحد لآخر.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'المصفوفة تصنف أصحاب المصلحة على محورين: النفوذ والاهتمام.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'صاحب النفوذ العالي والاهتمام القليل يُرسَل له تقرير تفصيلي يومي حتى يزيد اهتمامه.', 'false', 'الصحيح: يُبقى راضيًا بإحاطة موجزة في ما يخص جهته. إغراقه بالتفاصيل يضعف علاقته بالمشروع.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'بلا تصنيف يتلقى أصحاب المصلحة الرسالة نفسها، فيُهمَل من يملك القرار ويُغرَق من لا يحتاج.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'تُبنى المصفوفة مع الفريق وتُراجَع معه، لا في رأس القائد.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'تُرسم المصفوفة عند بداية المشروع، ويُعتمد عليها كما هي حتى إغلاقه.', 'false', 'الصحيح: المصفوفة خريطة حية تُحدَّث مع كل تغير في النفوذ أو الاهتمام.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'leadership-stakeholders' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('leadership-manage-lead', 'الإدارة والقيادة', 'leadership', '{"competencies":["القيادة","الرؤية الكلية"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 105)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'يحتاج المشروع إلى القيادة في مرحلة البداية، ثم تكفيه الإدارة حتى الإغلاق.', 'false', 'الصحيح: يحتاج الاثنتين معًا طوال عمره. الإدارة تضبط التعقيد، والقيادة تصنع التغيير.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'القيادة والإدارة وظيفتان مختلفتان، لا درجتان على سلّم واحد.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'تظهر القيادة في تحديد الاتجاه وحشد الناس حوله، وتظهر الإدارة في التخطيط والتنظيم والمتابعة.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'مشروع بإدارة قوية بلا قيادة قد يسلّم في موعده ما لم يعد أحد يحتاجه.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'القيادة في المشروع مسؤولية صاحب المنصب الأعلى فيه.', 'false', 'الصحيح: القيادة فعل لا منصب، وتُمارَس في الاتجاهات كلها ومن أي موقع.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'تزيد الحاجة إلى القيادة حين يتغير الاتجاه أو يقاوم الناس التغيير.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'leadership-manage-lead' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('leadership-handover', 'التسليم والتسلم', 'leadership', '{"competencies":["التسليم","المسؤولية"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'مسودة لجنة المحتوى (2026-11-10)', 'draft', 106)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, explain_ar, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.explain_ar, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'التسليم القيادي يوجد لأن توقيع المحضر لا يعني أن المتسلِّم قادر على التشغيل.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'التسليم هو نقل الوثائق والصلاحيات إلى الجهة المشغّلة في يوم الإغلاق.', 'false', 'الصحيح: هذا التسليم الشكلي. التسليم القيادي نقل للقدرة والمسؤولية، ويبدأ قبل الإغلاق.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يتم التسليم على مراحل يشغّل فيها المتسلِّم بنفسه والمسلِّم حاضر يسنده.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'إذا اقتصر التسليم على المحضر سقطت الخدمة في الفجوة بين فريق انصرف ومشغّل لم يستعد.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'للتسليم مسؤوليتان متقابلتان: المسلِّم يمكّن، والمتسلِّم يستعد ويسأل ويجرّب.', 'true', null, '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'يبدأ الإعداد للتسليم في الشهر الأخير من المشروع، بعد اكتمال المخرجات.', 'false', 'الصحيح: يبدأ من تصميم المشروع، فما لم يُصمَّم للتشغيل لا يُسلَّم بنجاح في شهر.', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, explain_ar, tasks)
where tp.key = 'leadership-handover' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.schema_migrations (name) values ('20261110170000_leaders_katon_impact_leadership') on conflict do nothing;
