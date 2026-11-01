-- كاتون: جملتان محرّفتان عمدًا في كل موضوع من بنك الأسس (تبديل الفاعل، وقلب التوقيت أو السببية).
-- النص الصحيح يصير الشرح بعد كشف المفتاح. يمس الجمل التي بلا إجابات فقط، وآمن لإعادة التشغيل.
update leaders.katon_sentences s set text_ar = 'يتولى العميل وحده تحديث مصفوفة تتبع المتطلبات في كل الأحوال، ولا دور لفريق المشروع فيها.', key = 'false', explain_ar = 'الصحيح: قد يشارك العميل أو المالك في تحديث المصفوفة إذا كان لديه دور فعّال في تحديد المتطلبات ومتابعة تحقيقها.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تُحدَّث مصفوفة تتبع المتطلبات مرة واحدة في نهاية المشروع بعد التسليم النهائي.', key = 'false', explain_ar = 'الصحيح: يمكن تحديث المصفوفة عند تحقيق مراحل مهمة في المشروع أو عند إكمال تحقيق مجموعة معينة من المتطلبات.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-1' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'فريق المشروع يتحمل المسؤولية الرئيسية لتحقيق أهداف المشروع، ودور مدير المشروع استشاري فقط.', key = 'false', explain_ar = 'الصحيح: مدير المشروع يتحمل المسؤولية الرئيسية لتحقيق أهداف المشروع وتسليمه بنجاح.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُعَدّ مخطط المشروع بعد بدء تنفيذ الأنشطة، حين تتضح الصورة الفعلية للعمل.', key = 'false', explain_ar = 'الصحيح: يتم إعداد مخطط المشروع في المرحلة التمهيدية من دورة حياة المشروع، قبل بدء تنفيذ الأنشطة الفعلية.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-2' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'غياب الجدول الزمني يرفع مرونة الفريق ويحسّن التنسيق بين أعضائه.', key = 'false', explain_ar = 'الصحيح: في حالة عدم وجود جدول زمني، قد يكون من الصعب تنسيق الأنشطة والتواصل بشكل فعّال بين أعضاء الفريق.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يُعَدّ الجدول الزمني أولًا، ثم يُحدَّد نطاق المشروع بناءً عليه.', key = 'false', explain_ar = 'الصحيح: قبل إعداد الجدول الزمني يجب تحديد نطاق المشروع بوضوح وتحديد المهام والأنشطة المحتملة.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-3' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'يكفي في تحقق النطاق التأكد من اكتمال المخرجات شكليًا، دون التحقق من أنها تقدم الفائدة المطلوبة.', key = 'false', explain_ar = 'الصحيح: يتم التحقق من أن المنتجات أو الخدمات تقدم الفائدة المطلوبة وتحقق الأهداف المحددة للمشروع.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 2
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تُعقد جلسات تحقق النطاق بعد التسليم النهائي فقط، لا أثناء عملية التطوير.', key = 'false', explain_ar = 'الصحيح: تُضمَّن جلسات تحقق النطاق أثناء عملية التطوير للتأكد من أن المنتج يتجه في الاتجاه الصحيح ويتماشى مع متطلبات النطاق.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-4' and s.sort = 6
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'تصحيح العيوب لا يؤثر في الجداول الزمنية للمشروع لأنه يتم بالتوازي مع العمل دائمًا.', key = 'false', explain_ar = 'الصحيح: قد يؤثر تصحيح العيوب على الجداول الزمنية للمشروع، فيؤدي إلى تأخير في التسليم والمواعيد النهائية.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 4
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
update leaders.katon_sentences s set text_ar = 'ضبط الجودة مسؤولية العميل وحده في كل أنواع المشاريع والمؤسسات.', key = 'false', explain_ar = 'الصحيح: المسؤول عن ضبط الجودة يعتمد على سياق العمل ونوع المؤسسة أو المشروع.', updated_at = now()
from leaders.katon_topics tp where tp.id = s.topic_id and tp.key = 'basics-5' and s.sort = 5
  and not exists (select 1 from leaders.katon_answers a where a.sentence_id = s.id);
