-- ════════════════════════════════════════════════════════════════
-- «كاتون» على CBM الثلاثي (المرحلة ط): حكم بثقة مدرَّجة، ووسوم موقف بلا نقاط، وجدول نقاط سليم
-- ════════════════════════════════════════════════════════════════
-- مولَّد من scripts/katon/build-cbm-migration.mjs. آمن لإعادة التشغيل.
-- 1) الإجابة: verdict (صحيحة/خاطئة) وconfidence (1..3) وstances (وسوم الموقف)؛ choice القديم يصير اختياريًا
--    ويُملأ منه: «صحيحة/خاطئة 100%» حكم بأعلى ثقة، وغيره وسم موقف.
-- 2) جدول النقاط في programs.katon_points يُقرأ بالشكل الجديد {right:{1,2,3}, wrong:{1,2,3}}؛ القديم يُهمل
--    فيعود إلى الافتراضي (Gardner-Medwin: 1/2/3 و0/−2/−6).
-- 3) الجمل التي بلا إجابات تُزامَن مع مصدرها: الخاطئة محوّطة بلا قرائن إطلاق، وبعض الصحيحة حازمة.
alter table leaders.katon_answers add column if not exists verdict text check (verdict in ('true', 'false'));
alter table leaders.katon_answers add column if not exists confidence smallint check (confidence between 1 and 3);
alter table leaders.katon_answers add column if not exists stances text[] not null default '{}';
alter table leaders.katon_answers alter column choice drop not null;
alter table leaders.katon_answers drop constraint if exists katon_answers_stances_check;
alter table leaders.katon_answers add constraint katon_answers_stances_check
  check (stances <@ array['question', 'research', 'idea', 'can', 'believe', 'assume']::text[]);
alter table leaders.katon_answers drop constraint if exists katon_answers_verdict_confidence_check;
alter table leaders.katon_answers add constraint katon_answers_verdict_confidence_check
  check ((verdict is null) = (confidence is null));
update leaders.katon_answers set verdict = choice, confidence = 3 where choice in ('true', 'false') and verdict is null;
update leaders.katon_answers set stances = array[choice] where choice in ('question', 'research', 'idea', 'can', 'believe', 'assume') and stances = '{}';

-- ── مزامنة الجمل التي بلا إجابات مع المصدر ──
update leaders.katon_sentences s set text_ar = 'مصفوفة تتبع المتطلبات توفر وسيلة منظمة لربط المتطلبات بالأهداف والنتائج النهائية لضمان تحقيق القيمة المضافة للمشروع.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 1
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'مصفوفة تتبع المتطلبات تحوي مجموعة من المعلومات المنظمة بشكل هيكلي تتعلق بتحقيق متطلبات معينة في إطار مشروع أو عمل.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تُستخدم المصفوفة لتوزيع المسؤوليات وتحديد من يتولى تحقيق كل متطلب.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 3
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'قد يكون من الصعب تحديد الأثر المالي لكل متطلب دون استخدام مصفوفة، مما قد يؤدي إلى تصاعد التكلفة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُفضَّل أن يقتصر تحديث مصفوفة تتبع المتطلبات على العميل، لأن فريق المشروع قد لا يملك صورة كافية عن المتطلبات.', key = 'false', explain_ar = 'الصحيح: فريق المشروع يتولى تحديث المصفوفة، وقد يشارك العميل إذا كان له دور فعّال في تحديد المتطلبات ومتابعة تحقيقها.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُستحسن تأجيل تحديث مصفوفة تتبع المتطلبات إلى ما بعد التسليم، حتى تكتمل صورة ما تحقق فعلًا.', key = 'false', explain_ar = 'الصحيح: تُحدَّث المصفوفة عند بلوغ مراحل مهمة في المشروع أو عند إكمال مجموعة من المتطلبات، لا بعد التسليم.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يحدد مخطط المشروع أهدافه بوضوح ويبيّن الغرض منه ونتائجه المتوقعة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 1
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يشمل مخطط المشروع جداول زمنية تفصيلية لترتيب المهام والأنشطة، ويساعد في تحديد مواعيد بدء الأنشطة وانتهائها ومدة كل نشاط.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يتضمن مخطط المشروع تحليلًا للمخاطر المحتملة التي يمكن أن تواجه المشروع، وتحديد استراتيجيات التعامل معها.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 3
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'قد يكون من الصعب الحفاظ على الجودة إذا لم يتم تحليل المخاطر واتخاذ الإجراءات الوقائية المناسبة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'في أغلب المشاريع يحمل فريق التنفيذ المسؤولية الرئيسية عن تحقيق أهداف المشروع، ويبقى دور مدير المشروع استشاريًا في الغالب.', key = 'false', explain_ar = 'الصحيح: مدير المشروع يتحمل المسؤولية الرئيسية عن تحقيق أهداف المشروع وتسليمه بنجاح، والفريق ينفذ تحت إدارته.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'غالبًا ما يُعدّ مخطط المشروع بعد انطلاق التنفيذ، حين تتضح الصورة الفعلية للعمل وتقلّ الافتراضات.', key = 'false', explain_ar = 'الصحيح: يُعدّ مخطط المشروع في المرحلة التمهيدية قبل بدء التنفيذ الفعلي للأنشطة.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'الجدول الزمني يركز على الجوانب الزمنية للمشروع: متى يُؤدّى كل نشاط، ومتى تتحقق مراحل المشروع، ومتى تُقدَّم التسليمات.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 1
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يوضح الجدول الزمني المراحل الرئيسية للمشروع، مثل التخطيط والتصميم والتنفيذ والاختبار والتسليم.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يساعد الجدول الزمني في تحديد الأنشطة ذات الأولوية العالية، مما يسهم في التسليم في المواعيد النهائية.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 3
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يمكن الاستغناء عن الجدول الزمني إذا كان الفريق متمرسًا، لأن التنسيق بين أعضائه يتم تلقائيًا.', key = 'false', explain_ar = 'الصحيح: بلا جدول زمني يصعب تنسيق الأنشطة والتواصل بين أعضاء الفريق مهما بلغت خبرتهم.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'قد يكون للفريق المختص في إدارة المشروع دور في تطبيق الجدول الزمني ودعمه، لكن المسؤولية الرئيسية تقع على مدير المشروع.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُفضَّل إعداد الجدول الزمني قبل تحديد نطاق المشروع، حتى يُضبط النطاق على ما يسمح به الوقت.', key = 'false', explain_ar = 'الصحيح: يُحدَّد نطاق المشروع ومهامه بوضوح أولًا، ثم يُبنى الجدول الزمني عليه.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'من خلال تحقق النطاق يتأكد المشروع من أن المنتج النهائي يفي بالتوقعات والمتطلبات المحددة في وثيقة النطاق، فيسهم في رضا العميل.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 1
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'في أغلب الأحوال يكفي لتحقق النطاق التأكد من اكتمال المخرجات، وتُترك الفائدة لتقييم لاحق.', key = 'false', explain_ar = 'الصحيح: يتحقق النطاق من أن المخرجات تقدم الفائدة المطلوبة وتحقق أهداف المشروع، لا من اكتمالها شكليًا.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يجب توضيح المعايير والمتطلبات المحددة للمنتج أو الخدمة، ومنها المواصفات الفنية والأداء المطلوب.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 3
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'إذا احتاج المنتج تحسينات أو تعديلات كبيرة بعد التسليم، فقد يتأثر الجدول الزمني ويتطلب تمديد المواعيد.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يتولى العميل أو من يمثله قبول المخرجات رسميًا في تحقق النطاق.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُستحسن جمع جلسات تحقق النطاق في نهاية المشروع حتى لا تعطّل التطوير أثناء عمله.', key = 'false', explain_ar = 'الصحيح: تُضمَّن جلسات تحقق النطاق أثناء التطوير للتأكد من أن المنتج يتجه في الاتجاه الصحيح.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'عملية ضبط الجودة جزء أساسي من إدارة المشروع، وتهدف إلى ضمان أن المنتجات أو الخدمات المقدمة تلبي معايير الجودة المحددة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 1
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يتم توثيق جميع الأنشطة والنتائج ذات الصلة بضبط الجودة، ومنها تسجيل الاختبارات وتقارير الفحوصات والتغييرات المنفذة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تُحدَّد المعايير والمواصفات التي يجب أن يلتزم بها المنتج أو الخدمة، ومنها متطلبات العميل والمعايير الصناعية المعترف بها.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 3
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'في الغالب يمكن تصحيح العيوب بالتوازي مع العمل دون أن يمس الجدول الزمني للمشروع.', key = 'false', explain_ar = 'الصحيح: قد يؤثر تصحيح العيوب في الجدول الزمني فيؤخر التسليم والمواعيد النهائية.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُفضَّل أن تُسند مسؤولية ضبط الجودة إلى العميل، لأنه الأقدر على الحكم على المنتج.', key = 'false', explain_ar = 'الصحيح: المسؤول عن ضبط الجودة يعتمد على سياق العمل ونوع المؤسسة أو المشروع، ولا يُسند إلى العميل.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تتم عملية ضبط الجودة على مراحل مختلفة في دورة حياة المشروع أو الإنتاج، بحسب نوع الصناعة أو الخدمة.', key = 'true', explain_ar = null, updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);

insert into leaders.schema_migrations (name) values ('20261105160000_leaders_katon_cbm') on conflict do nothing;
