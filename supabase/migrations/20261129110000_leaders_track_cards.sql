-- deploy-gate: tolerant محتوى فقط: متطلبات رحلة ومختبرات وحقول جديدة، وأولوية أربعة مسارات. الدوال الأقدم تقرأ الصفوف الجديدة
-- كغيرها (requirementApplies وlabVisible وfieldsFor)، وأولوية المسار تُحسب من priorityFor في الدوال نفسها، فقبل نشر الدوال الجديدة
-- تبقى الأولوية القديمة محسوبة وملف التعريف المخزن هنا يُقرأ للعرض وحده.
-- ════════════════════════════════════════════════════════════════
-- بطاقة المسار (قرار المالك 2026-11-25): مولَّد بـ scripts/tracks/build-cards.mjs من supabase/content/tracks/v2/slices.json وtracks.json
-- ════════════════════════════════════════════════════════════════
-- 1) أولوية المسار وملفه: قاعدة «قرب الإتقان» (logic.js nearMastery) لثلاثة مسارات، وافتراض التعادل في M2I3L2، فيبلغ كل ملف من التسعة مسار.
--    الرحلة والعنوان الإنجليزي من ملف التعريف الجديد كما في 20261101140000.
-- 2) متطلبات الرحلة: لا تنقص رحلة إطار حين يرتفع مستواه. O-KPI وL-360I عُطّلا لسبب حقيقي (تكرار العمل)، فلا يُعادان، ويحل محلهما
--    بندان يطلبان ما لا يطلبه غيرهما (O-EVID خطة الأدلة، L-GOV الحوكمة)، ومعهما O-COST للمتوسط في إدارة المشروعات.
--    لكل برنامج فيه O-BREG، ولا يُمس ما حرّرته الإدارة (لا إدراج فوق رمز قائم). نسخ الرحلة المجمدة (program_versions) لا تُمس.
-- 3) مختبرا الأثر للمتوسط والاحترافي، فتختلف مختبرات الأثر بين المستويات الثلاثة.
-- restore: update leaders.track_profiles p set journey_ar = b.journey_ar from leaders.backup_20261129_track_profiles b where p.key = b.key; update leaders.tracks t set priority_dimension = b.priority_dimension, profile_key = b.profile_key, journey_ar = b.journey_ar, title_en = b.title_en from leaders.backup_20261129_track_cards b where t.key = b.key; delete from leaders.stage_requirements where code in ('O-COST', 'O-EVID', 'L-GOV'); delete from leaders.lab_items where key in ('baseline-target', 'evidence-ladder') and not exists (select 1 from leaders.lab_attempts a where a.item_id = lab_items.id)
create table if not exists leaders.backup_20261129_track_cards as
  select key, priority_dimension, profile_key, journey_ar, title_en from leaders.tracks;
alter table leaders.backup_20261129_track_cards enable row level security;
revoke all on leaders.backup_20261129_track_cards from anon, authenticated;

create table if not exists leaders.backup_20261129_track_profiles as
  select key, journey_ar from leaders.track_profiles;
alter table leaders.backup_20261129_track_profiles enable row level security;
revoke all on leaders.backup_20261129_track_profiles from anon, authenticated;

-- ════════════ 1) أولوية المسار وملفه، ورحلة الملفات التي تذكر ما أُضيف ════════════
update leaders.track_profiles p set journey_ar = v.j from (values
  ($q$milestone-beginner$q$, $q$الكتيب: أبواب إدارة المشروعات من التمهيد إلى الباب الرابع، تقرؤها وتجيب عن أسئلة كل باب.
المختبر: مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير؛ تتدرب فيها على حالات قبل أن تنقلها إلى مبادرتك.
وثيقة مبادرتك: معايير إدارة المشروعات وزنها مضاعف في تقييمها ما لم تتساوَ مستوياتك في الأطر الثلاثة، وتجيب عن سؤال تعمق إضافي في بطاقة المبادرة وسجل المعالم والجدول الزمني والمسار الحرج وسجل المخاطر والافتراضات والاعتماديات.
تمرين مستواك: تحويل جدول مشروعك إلى معالم قرار، لكل منها ما يُقرَّر عنده.$q$),
  ($q$milestone-intermediate$q$, $q$الكتيب: يُضاف إلى أبواب إدارة المشروعات الأساسية الباب الخامس، وهو ما يميّز مستواك فيها.
المختبر: مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير.
وثيقة مبادرتك: تضيف إليها هيكل تجزئة العمل والموارد والتكلفة وورقة قرار بوابة المرحلة، وتحدد في الجدول الزمني الأنشطة الحرجة والاحتياطي الزمني.
متطلب مستواك: الموارد والتكلفة لمشروعك بغلاف واحتياطي ومصدر تمويل، تبنيها في فصلها من وثيقتك.
التقييم: معايير إدارة المشروعات وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وفي كل فصل من فصولها سؤال تعمق إضافي: بطاقة المبادرة، وهيكل تجزئة العمل، وسجل المعالم، والجدول الزمني والمسار الحرج، والموارد والتكلفة، وسجل المخاطر والافتراضات والاعتماديات، وورقة قرار بوابة المرحلة.$q$),
  ($q$milestone-advanced$q$, $q$الكتيب: الباب الخامس والباب السادس من إدارة المشروعات فوق أبوابها الأساسية.
المختبر: القيمة المكتسبة عند المعلم، ومعه مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير.
وثيقة مبادرتك: حقول تخص مستواك في فصولها: حساسية الجدول، والتكلفة مقابل المنفعة، وحدود المخاطرة المقبولة، وما تتنازل عنه الجهة لأجل المبادرة، والتكلفة الغارقة في قرار البوابة، والواجهات بين حزم العمل والأطراف الأخرى. ومعايير إدارة المشروعات وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة.
متطلبات مستواك: إدارة جلسة بوابة مرحلة موثقة، وتمرين في تصميم بوابات المراحل لأكثر من مشروع معًا.$q$),
  ($q$impact-beginner$q$, $q$الكتيب: أبواب تحويل المشروع إلى أثر من التمهيد إلى الباب الرابع، وأقربها إلى أولويتك الباب الثاني: سلسلة القيمة والأثر.
المختبر: خريطة المنافع وسلسلة القيمة، وفاحص المؤشرات.
وثيقة مبادرتك: سجل المنافع، ونظرية التغيير في صيغتها الأولى (الأثر بعيد المدى والسلسلة السببية من الأنشطة إلى الأثر)، وفي كل منهما سؤال تعمق إضافي.
التقييم: معايير الأثر وزنها مضاعف في تقييم وثيقتك ما لم تتساوَ مستوياتك في الأطر الثلاثة.$q$),
  ($q$impact-intermediate$q$, $q$الكتيب: يُضاف إلى أبواب تحويل المشروع إلى أثر الأساسية الباب الخامس.
المختبر: خط الأساس والمستهدف، ومعه خريطة المنافع وسلسلة القيمة، وفاحص المؤشرات.
وثيقة مبادرتك: المبرر والبدائل، وخطة القياس والأدلة، ونظرية التغيير كاملة بافتراضها الأضعف وطريقة اختباره مبكرًا، مع سجل المنافع وتقرير الأثر.
متطلب مستواك: خطة القياس والأدلة لمنافع مشروعك، من أين يأتي كل رقم ومتى يُقرأ ومن يقرؤه.
التقييم: معايير الأثر وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وفي المبرر والبدائل، ونظرية التغيير، وسجل المنافع، وخطة القياس والأدلة سؤال تعمق إضافي.$q$),
  ($q$leadership-beginner$q$, $q$الكتيب: أبواب تمكين القائد من التمهيد إلى الباب الرابع، ومنها جدارة الاستجابة المنضبطة وجدارة انتقال العهدة.
المختبر: خريطة أصحاب المصلحة، ومصفوفة المسؤوليات والتفويض، والأسبوع الصعب، وأنماط إدارة الخلاف.
النماذج: تشخيص نمط الخلاف على موقف حقيقي مررت به، إلى جانب فصول وثيقتك.
وثيقة مبادرتك: معايير القيادة وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وتجيب عن سؤال تعمق إضافي في خريطة أصحاب المصلحة، وقيادة التغيير والاستدامة، وقصة التحول.
متطلب مستواك: تحديث خريطة أصحاب المصلحة لمشروعك.$q$),
  ($q$leadership-intermediate$q$, $q$الكتيب: يُضاف إلى أبواب تمكين القائد الأساسية الباب الخامس.
المختبر: الأسبوع الصعب، وأنماط إدارة الخلاف، وخريطة أصحاب المصلحة، ومصفوفة المسؤوليات والتفويض.
وثيقة مبادرتك: تضيف إلى فصول القيادة أصحاب المصلحة الصامتين، وإيقاع القرار ومسار التصعيد، ومن تمسّهم المبادرة وأين تتوقع مقاومتهم.
متطلب مستواك: الحوكمة ومصفوفة المساءلة لمبادرتك، بمحاسب واحد لكل قرار ومسار تصعيد واضح.
التقييم: معايير القيادة وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وفي خريطة أصحاب المصلحة، والحوكمة والمسؤوليات، وقيادة التغيير والاستدامة، وخطة التطوير القيادي، وقصة التحول سؤال تعمق إضافي.$q$),
  ($q$impact-advanced$q$, $q$الكتيب: الباب الخامس والباب السادس من تحويل المشروع إلى أثر فوق أبوابه الأساسية.
المختبر: سلّم الأدلة والإسناد، وخط الأساس والمستهدف، ومعهما خريطة المنافع وسلسلة القيمة، وفاحص المؤشرات.
وثيقة مبادرتك: تقرير الأثر فصل فيها، ومعه العوامل الخارجية التي قد تكسر سلسلة الأثر، ومعايير المفاضلة بين البدائل، ومستوى الدليل لكل مؤشر، ومنحنى تحقق المنافع بعد الإغلاق.
متطلب مستواك: نظرية التغيير لمشروعك من المخرجات إلى الأثر، يقيّمها المستشار.
التقييم: معايير الأثر وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وفي فصول الأثر سؤال تعمق إضافي: المبرر والبدائل، ونظرية التغيير، وسجل المنافع، وخطة القياس والأدلة، وتقرير الأثر.$q$),
  ($q$leadership-advanced$q$, $q$الكتيب: الباب الخامس والباب السادس من تمكين القائد فوق أبوابه الأساسية.
المختبر: تحدٍّ قيادي بأداة DIRECT، ومعه خريطة أصحاب المصلحة، ومصفوفة المسؤوليات والتفويض، والأسبوع الصعب، وأنماط إدارة الخلاف.
وثيقة مبادرتك: من تبنيه ليأخذ مكانك، وكسب المقاومين المؤثرين، واتصال الحوكمة بما فوقها، وما بقي في الجهة بعدك. وتطبّق أداة DIRECT على تحدٍّ حقيقي في مبادرتك.
التقييم: معايير القيادة وزنها مضاعف ما لم تتساوَ مستوياتك في الأطر الثلاثة، وفي خريطة أصحاب المصلحة، والحوكمة والمسؤوليات، وقيادة التغيير والاستدامة، وخطة التطوير القيادي، وقصة التحول سؤال تعمق إضافي.$q$)
) v(k, j)
 where p.key = v.k and p.journey_ar is distinct from v.j;

update leaders.tracks t set priority_dimension = v.d, profile_key = v.p, journey_ar = p.journey_ar, title_en = v.en
  from leaders.track_profiles p, (values
    ($q$M1I1L1$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Even across all three frameworks$q$),
    ($q$M1I1L2$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Leadership$q$),
    ($q$M1I1L3$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Leadership$q$),
    ($q$M1I2L1$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Impact$q$),
    ($q$M1I2L2$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Impact & Leadership$q$),
    ($q$M1I2L3$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Leadership$q$),
    ($q$M1I3L1$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Impact$q$),
    ($q$M1I3L2$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Impact$q$),
    ($q$M1I3L3$q$, $q$milestone$q$, $q$milestone-beginner$q$, $q$From Plan to Decision Points · Strengths: Impact & Leadership$q$),
    ($q$M2I1L1$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Milestone$q$),
    ($q$M2I1L2$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Milestone & Leadership$q$),
    ($q$M2I1L3$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Leadership$q$),
    ($q$M2I2L1$q$, $q$leadership$q$, $q$leadership-beginner$q$, $q$Leading Through Others · Strengths: Milestone & Impact$q$),
    ($q$M2I2L2$q$, $q$milestone$q$, $q$milestone-intermediate$q$, $q$Tightening Delivery: Gates and Cost · Even across all three frameworks$q$),
    ($q$M2I2L3$q$, $q$milestone$q$, $q$milestone-intermediate$q$, $q$Tightening Delivery: Gates and Cost · Strengths: Leadership$q$),
    ($q$M2I3L1$q$, $q$leadership$q$, $q$leadership-beginner$q$, $q$Leading Through Others · Strengths: Impact$q$),
    ($q$M2I3L2$q$, $q$leadership$q$, $q$leadership-intermediate$q$, $q$Influence Beyond Authority · Strengths: Impact$q$),
    ($q$M2I3L3$q$, $q$impact$q$, $q$impact-advanced$q$, $q$Impact Told as Contribution · Strengths: Impact & Leadership$q$),
    ($q$M3I1L1$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Milestone$q$),
    ($q$M3I1L2$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Milestone$q$),
    ($q$M3I1L3$q$, $q$impact$q$, $q$impact-beginner$q$, $q$From Output to Benefit · Strengths: Milestone & Leadership$q$),
    ($q$M3I2L1$q$, $q$leadership$q$, $q$leadership-beginner$q$, $q$Leading Through Others · Strengths: Milestone$q$),
    ($q$M3I2L2$q$, $q$impact$q$, $q$impact-intermediate$q$, $q$Evidence Before Claims · Strengths: Milestone$q$),
    ($q$M3I2L3$q$, $q$leadership$q$, $q$leadership-advanced$q$, $q$Leaders Who Outlast You · Strengths: Milestone & Leadership$q$),
    ($q$M3I3L1$q$, $q$leadership$q$, $q$leadership-beginner$q$, $q$Leading Through Others · Strengths: Milestone & Impact$q$),
    ($q$M3I3L2$q$, $q$milestone$q$, $q$milestone-advanced$q$, $q$Delivery Decisions Under Pressure · Strengths: Milestone & Impact$q$),
    ($q$M3I3L3$q$, $q$milestone$q$, $q$milestone-advanced$q$, $q$Delivery Decisions Under Pressure · Even across all three frameworks$q$)
  ) v(k, d, p, en)
 where t.key = v.k and p.key = v.p
   and (t.priority_dimension, t.profile_key, t.journey_ar, t.title_en) is distinct from (v.d, v.p, p.journey_ar, v.en);

-- ════════════ 2) متطلبات الرحلة ════════════
-- O-COST: مستوى المتوسط في إدارة المشروعات كان ينقص بندًا عن التأسيسي (T-MB للتأسيسي وحده). الموارد والتكلفة أول ما يضيفه مستواه إلى وثيقته، فيصير بندًا في رحلته.
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, active, config)
select b.program_id, $q$ojt_coaching$q$, $q$milestone$q$, $q$intermediate$q$, $q$O-COST$q$, 3, $q$الموارد والتكلفة لمشروعك: غلاف واحتياطي ومصدر تمويل$q$, $q$من نموذج «الموارد والتكلفة» في مكتبة النماذج: بنود ما تحتاجه وكلفته، والغلاف الكلي، ونسبة احتياطي تُحسب من مخاطرك، ومن يموّل. يكتمل حين تسلّمه، وهو فصل في وثيقة مبادرتك.$q$, $q$model$q$, true, false, true,
       $j${"model_key":"cost-plan","accept":"submitted"}$j$::jsonb
  from leaders.stage_requirements b
 where b.code = 'O-BREG'
   and not exists (select 1 from leaders.stage_requirements x where x.program_id = b.program_id and x.code = $q$O-COST$q$);
-- O-EVID: بديل O-KPI: عُطّل في 20261030140000 لأن مؤشرات الأثر بخط أساس ومستهدف صارت داخل سجل المنافع (O-BREG)، فطلبه يكرر العمل. ما لا يغطيه السجل هو كيف تُجمع الأدلة، وهو فصل في وثيقة المتوسط أصلًا.
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, active, config)
select b.program_id, $q$ojt_coaching$q$, $q$impact$q$, $q$intermediate$q$, $q$O-EVID$q$, 4, $q$خطة القياس والأدلة لمنافع مشروعك$q$, $q$من نموذج «خطة القياس والأدلة» في مكتبة النماذج: لكل منفعة في سجلك مصدر بياناتها ومتى تُقرأ ومن يقرؤها وكيف تميز أثر المبادرة من غيره. يكتمل حين تسلّمه، وهو فصل في وثيقة مبادرتك.$q$, $q$model$q$, true, false, true,
       $j${"model_key":"evidence-plan","accept":"submitted"}$j$::jsonb
  from leaders.stage_requirements b
 where b.code = 'O-BREG'
   and not exists (select 1 from leaders.stage_requirements x where x.program_id = b.program_id and x.code = $q$O-EVID$q$);
-- L-GOV: بديل L-360I: عُطّل في 20261030150000 لأن تقييم 360 القبلي والبعدي (T-360 وE-360) صار للجميع، فلا يُعاد في منتصف الرحلة. ما يميز المتوسط في القيادة هو الحوكمة والمساءلة، وهي فصل في وثيقته.
insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, active, config)
select b.program_id, $q$leadership_coaching$q$, $q$leadership$q$, $q$intermediate$q$, $q$L-GOV$q$, 4, $q$الحوكمة ومصفوفة المساءلة لمبادرتك$q$, $q$من نموذج «الحوكمة» في مكتبة النماذج: من يقرر ماذا، ومحاسب واحد لكل قرار، وإيقاع الاجتماعات، ومسار التصعيد. يكتمل حين تسلّمه، وهو فصل في وثيقة مبادرتك.$q$, $q$model$q$, true, false, true,
       $j${"model_key":"governance","accept":"submitted"}$j$::jsonb
  from leaders.stage_requirements b
 where b.code = 'O-BREG'
   and not exists (select 1 from leaders.stage_requirements x where x.program_id = b.program_id and x.code = $q$L-GOV$q$);

-- ════════════ 3) المختبرات ════════════
insert into leaders.lab_items (key, kind, dimension, chapter_key, sort, min_level, minutes, points, title_ar, summary_ar, spec, audience) values (
  $q$baseline-target$q$, $q$tool$q$, $q$impact$q$, $q$ch4$q$, 3, $q$intermediate$q$, 15, 40,
  $q$خط الأساس والمستهدف$q$,
  $q$ابنِ لكل منفعة خط أساس من مصدر معلوم ومستهدفًا واقعيًا بتاريخ، وافرز ما يصلح للقرار مما يحتاج قراءة قبل أن يُكتب.$q$,
  $j${"story_ar":"أعدّ فريق مبادرة تقليص زمن الانتظار في مراكز الرعاية الأولية سجل منافعه للجنة التوجيهية. أرقام المستهدفات جميلة، لكن رئيس اللجنة سأل: من أين جاءت أرقام اليوم؟ ولماذا هذه المستهدفات بالذات؟","role_ar":"مسؤول القياس في مبادرة تحسين تجربة المراجعين بالرعاية الأولية","closing_ar":"المستهدف بلا خط أساس وعد لا يُحاسب عليه، وخط الأساس بلا مصدر رأي. اقرأ قبل أن تكتب، وضع مستهدفًا يمكن بلوغه في مدة المبادرة.","meters":[],"steps":[{"type":"match","title_ar":"ما ينقص كل خط أساس؟","prompt_ar":"هذه أربع قيم كتبها الفريق خطوطَ أساس. اختر لكل منها حالها.","context_ar":"","why_ar":"خط الأساس الصالح قيمة من مصدر معلوم بتاريخ قراءة، تُقاس بالأداة نفسها التي ستُقاس بها النتيجة بعد التدخل.","weight":2,"left":[{"id":"a","label":"«الانتظار طويل جدًا بحسب شكاوى المراجعين»","match":"nonumber"},{"id":"b","label":"«متوسط الانتظار 42 دقيقة، من نظام الطوابير، للربع الأول»","match":"sound"},{"id":"c","label":"«رضا المراجعين 70% تقريبًا كما نعتقد»","match":"nosource"},{"id":"d","label":"«زمن الانتظار 25 دقيقة من استبانة، ثم سيقاس لاحقًا من نظام الطوابير»","match":"mismatch"}],"right":[{"id":"nonumber","label":"وصف بلا رقم"},{"id":"nosource","label":"رقم بلا مصدر"},{"id":"mismatch","label":"أداة قياس تختلف قبل وبعد"},{"id":"sound","label":"سليم"}]},{"type":"choice","title_ar":"أي مستهدف تكتب؟","prompt_ar":"خط الأساس 42 دقيقة، ومدة المبادرة تسعة أشهر، ومراكز مماثلة طبقت الحل نفسه فنزلت إلى 25 دقيقة خلال سنة.","context_ar":"","why_ar":"المستهدف الواقعي يستند إلى خط الأساس وتجربة مماثلة ومدة المبادرة، ويُكتب بتاريخ. المستهدف الطموح بلا سند يضعف ثقة صاحب القرار عند أول قراءة.","weight":2,"options":[{"id":"zero","label":"لا انتظار تقريبًا: 5 دقائق بنهاية المبادرة","score":0,"feedback_ar":"طموح بلا سند، وأول قراءة ستُظهر فجوة تُحسب عليك."},{"id":"real","label":"30 دقيقة بعد تسعة أشهر، و25 بعد سنة من التشغيل","score":2,"feedback_ar":"مستهدف مرحلي بتاريخين، يستند إلى خط الأساس وتجربة مماثلة."},{"id":"vague","label":"تحسن ملحوظ في زمن الانتظار","score":0,"feedback_ar":"لا رقم ولا تاريخ، فلا يُعرف هل تحقق."},{"id":"copy","label":"25 دقيقة بنهاية المبادرة كما في المراكز الأخرى","score":1,"feedback_ar":"قريب، لكنه يتجاهل أن المراكز الأخرى احتاجت سنة كاملة."}]}]}$j$::jsonb, 'all'
) on conflict (key) do nothing;
insert into leaders.lab_items (key, kind, dimension, chapter_key, sort, min_level, minutes, points, title_ar, summary_ar, spec, audience) values (
  $q$evidence-ladder$q$, $q$tool$q$, $q$impact$q$, $q$ch6$q$, 4, $q$advanced$q$, 18, 50,
  $q$سلّم الأدلة والإسناد$q$,
  $q$ضع كل ادعاء أثر على سلّم الأدلة، وقرر متى يصح أن تقول «بسبب المبادرة» ومتى تقول «أسهمت المبادرة»، قبل أن يُبنى عليه قرار استثمار.$q$,
  $j${"story_ar":"تطلب لجنة الاستثمار تعميم برنامج تأهيل الباحثين عن عمل على ثلاث مناطق بكلفة كبيرة. تقرير البرنامج يقول إن التوظيف ارتفع 18 نقطة «بفضل البرنامج». عليك أن تقول للجنة ما الذي تثبته الأدلة فعلًا.","role_ar":"مستشار التقييم لدى لجنة الاستثمار في صندوق التنمية البشرية","closing_ar":"قرار الاستثمار يُبنى على أقوى ادعاء تسنده الأدلة لا على أجمل رقم. حين لا يتيح التصميم الإسناد، قل «أسهم» واشرح كيف، فهذا أصدق وأقوى أمام لجنة تعرف الفرق.","meters":[],"steps":[{"type":"classify","title_ar":"أين يقع كل دليل على السلّم؟","prompt_ar":"صنّف ما جمعه فريق البرنامج بحسب قوة الدليل على أن التغير سببه البرنامج.","context_ar":"","why_ar":"قوة الدليل تزداد كلما وُجدت مقارنة بمن لم يتلقَّ التدخل وكان مماثلًا قبله؛ الرأي والقصة أضعف الأدلة، والمقارنة العشوائية أقواها.","weight":2,"bins":[{"id":"claim","label":"ادعاء أو رأي"},{"id":"before_after","label":"قبل وبعد بلا مقارنة"},{"id":"comparison","label":"مقارنة بمجموعة مماثلة"},{"id":"random","label":"مقارنة عشوائية"}],"items":[{"id":"stories","label":"قصص نجاح لعشرة متدربين توظفوا","bin":"claim"},{"id":"survey","label":"استبانة: 85% من المتدربين يرون أن البرنامج ساعدهم","bin":"claim"},{"id":"rate","label":"التوظيف بين المتدربين ارتفع من 30% قبل البرنامج إلى 48% بعده","bin":"before_after"},{"id":"waitlist","label":"مقارنة المتدربين بمن كانوا على قائمة الانتظار بالمؤهلات نفسها","bin":"comparison"},{"id":"lottery","label":"قرعة على المقاعد في منطقة واحدة، ومقارنة الفائزين بغيرهم","bin":"random"}]},{"type":"choice","title_ar":"ماذا تقول للجنة؟","prompt_ar":"مقارنة قائمة الانتظار تُظهر فرقًا 7 نقاط لا 18، وسوق العمل تحسن عمومًا في الفترة نفسها.","context_ar":"","why_ar":"الفرق مقابل مجموعة مماثلة هو الأقرب إلى أثر البرنامج، والباقي من ارتفاع 18 نقطة يعود إلى السوق. الصدق في حجم الأثر يحمي قرار التعميم من توقعات لن تتحقق.","weight":2,"options":[{"id":"eighteen","label":"البرنامج رفع التوظيف 18 نقطة، فالتعميم مبرر","score":0,"feedback_ar":"ينسب تحسن السوق كله إلى البرنامج، وسيُكتشف عند أول تقييم مستقل."},{"id":"seven","label":"الأثر المقدَّر نحو 7 نقاط مقابل مجموعة مماثلة؛ نوصي بالتعميم مرحليًا مع قرعة في منطقة جديدة لتأكيده","score":2,"feedback_ar":"أقوى ادعاء تسنده الأدلة، مع تصميم يرفع مستوى الدليل أثناء التعميم."},{"id":"none","label":"لا يمكن معرفة أي أثر، فلا توصية","score":0,"feedback_ar":"المقارنة المتاحة دليل معتبر، ورفض الحكم كليًا يحرم اللجنة من قرار مدروس."},{"id":"contrib","label":"البرنامج أسهم في التحسن بلا تحديد حجمه","score":1,"feedback_ar":"صحيح لكنه يترك دليلًا كميًا متاحًا، واللجنة تحتاج حجم الأثر لتقارنه بالكلفة."}]}]}$j$::jsonb, 'all'
) on conflict (key) do nothing;

insert into leaders.schema_migrations (name) values ('20261129110000_leaders_track_cards') on conflict do nothing;
