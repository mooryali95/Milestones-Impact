-- ════════════════════════════════════════════════════════════════
-- نموذج «كاتون»: المواضيع وجملها الست، وإجابات المشاركين، ونقاط البرنامج
-- ════════════════════════════════════════════════════════════════
-- مولَّد من scripts/katon/build-migration.mjs. آمن لإعادة التشغيل.
-- بنك البداية من ملف الأسس يُدرج مسودة (status=draft): يراجعه الأدمن ويضبط المفاتيح ثم ينشره.

alter table leaders.programs add column if not exists katon_points jsonb not null default '{}'::jsonb;

create table if not exists leaders.katon_topics (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (char_length(key) between 2 and 60),
  title_ar   text not null check (char_length(title_ar) between 2 and 160),
  dimension  text check (dimension in ('milestone', 'impact', 'leadership')),
  layers     jsonb not null default '{}'::jsonb,   -- competencies[], principles[], assumptions[], logic
  source     text,
  status     text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort       smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leaders.katon_sentences (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references leaders.katon_topics(id) on delete cascade,
  sort       smallint not null default 0,
  question   text not null check (question in ('why', 'what', 'how', 'absent', 'who', 'when')),
  text_ar    text not null check (char_length(text_ar) between 8 and 600),
  key        text not null default 'opinion' check (key in ('true', 'false', 'opinion')),
  explain_ar text check (char_length(explain_ar) <= 800),
  tasks      jsonb not null default '{}'::jsonb,   -- support|lead|guide|eval: تكليف كل فريق
  updated_at timestamptz not null default now()
);
create index if not exists katon_sentences_topic_idx on leaders.katon_sentences (topic_id, sort);

create table if not exists leaders.katon_answers (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  sentence_id    uuid not null references leaders.katon_sentences(id) on delete cascade,
  choice         text not null check (choice in ('question', 'research', 'true', 'false', 'idea', 'can', 'believe', 'assume')),
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, sentence_id)
);
create index if not exists katon_answers_sentence_idx on leaders.katon_answers (sentence_id);

alter table leaders.katon_topics    enable row level security;
alter table leaders.katon_sentences enable row level security;
alter table leaders.katon_answers   enable row level security;
revoke all on leaders.katon_topics, leaders.katon_sentences, leaders.katon_answers from public, anon, authenticated;
grant all on leaders.katon_topics, leaders.katon_sentences, leaders.katon_answers to service_role;

-- ── بنك البداية (مسودة) ──

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('basics-1', 'مصفوفة تتبع المتطلبات', 'milestone', '{"competencies":["الرقابة","الفعل"],"principles":["أن تركز على القيمة"],"assumptions":[],"logic":""}'::jsonb, 'ملف الأسس (الجولة الأولى)', 'draft', 1)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'مصفوفة تتبع المتطلبات توفر وسيلة منظمة لربط المتطلبات بالأهداف والنتائج النهائية لضمان تحقيق القيمة المضافة للمشروع.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'مصفوفة تتبع المتطلبات تحوي مجموعة من المعلومات المنظمة بشكل هيكلي تتعلق بتحقيق متطلبات معينة في إطار مشروع أو عمل.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يمكن استخدام المصفوفة لتوزيع المسؤوليات وتحديد الأفراد أو الفرق المسؤولة عن تحقيق كل متطلب.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'قد يكون من الصعب تحديد الأثر المالي لكل متطلب دون استخدام مصفوفة، مما قد يؤدي إلى تصاعد التكلفة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'قد يشارك العميل أو المالك في تحديث المصفوفة إذا كان لديه دور فعّال في تحديد المتطلبات ومتابعة تحقيقها.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'يمكن تحديث المصفوفة عند تحقيق مراحل مهمة في المشروع أو عند إكمال تحقيق مجموعة معينة من المتطلبات.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, tasks)
where tp.key = 'basics-1' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('basics-2', 'وثيقة المشروع', 'milestone', '{"competencies":["الأثر","الرؤية الكلية"],"principles":["أن تنشئ بيئة فريق مشروع متعاون"],"assumptions":[],"logic":""}'::jsonb, 'ملف الأسس (الجولة الأولى)', 'draft', 2)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'يساعد مخطط المشروع في تحديد أهداف المشروع بشكل واضح ودقيق، ويوفر نظرة فاحصة على الغرض من المشروع والنتائج المتوقعة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'يشمل مخطط المشروع جداول زمنية تفصيلية لترتيب المهام والأنشطة، ويساعد في تحديد مواعيد بدء الأنشطة وانتهائها ومدة كل نشاط.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يتضمن مخطط المشروع تحليلًا للمخاطر المحتملة التي يمكن أن تواجه المشروع، وتحديد استراتيجيات التعامل معها.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'قد يكون من الصعب الحفاظ على الجودة إذا لم يتم تحليل المخاطر واتخاذ الإجراءات الوقائية المناسبة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'مدير المشروع يتحمل المسؤولية الرئيسية لتحقيق أهداف المشروع وتسليمه بنجاح.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'يتم إعداد مخطط المشروع في المرحلة التمهيدية من دورة حياة المشروع، قبل بدء تنفيذ الأنشطة الفعلية.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, tasks)
where tp.key = 'basics-2' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('basics-3', 'الجدول الزمني', 'milestone', '{"competencies":["الرقابة","التتابع"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'ملف الأسس (الجولة الأولى)', 'draft', 3)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'الجدول الزمني يركز على الجوانب الزمنية للمشروع: متى يُؤدّى كل نشاط، ومتى تتحقق مراحل المشروع، ومتى تُقدَّم التسليمات.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'يوضح الجدول الزمني المراحل الرئيسية للمشروع، مثل التخطيط والتصميم والتنفيذ والاختبار والتسليم.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يساعد الجدول الزمني في تحديد الأنشطة ذات الأولوية العالية، مما يسهم في التسليم في المواعيد النهائية.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'في حالة عدم وجود جدول زمني، قد يكون من الصعب تنسيق الأنشطة والتواصل بشكل فعّال بين أعضاء الفريق.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'قد يكون للفريق المختص في إدارة المشروع دور في تطبيق الجدول الزمني ودعمه، لكن المسؤولية الرئيسية تقع على مدير المشروع.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'قبل إعداد الجدول الزمني يجب تحديد نطاق المشروع بوضوح وتحديد المهام والأنشطة المحتملة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, tasks)
where tp.key = 'basics-3' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('basics-4', 'تحقق النطاق', 'milestone', '{"competencies":["التسليم","الرقابة"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'ملف الأسس (الجولة الأولى)', 'draft', 4)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'من خلال تحقق النطاق يتأكد المشروع من أن المنتج النهائي يفي بالتوقعات والمتطلبات المحددة في وثيقة النطاق، فيسهم في رضا العميل.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'يتم التحقق من أن المنتجات أو الخدمات تقدم الفائدة المطلوبة وتحقق الأهداف المحددة للمشروع.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'يجب توضيح المعايير والمتطلبات المحددة للمنتج أو الخدمة، ومنها المواصفات الفنية والأداء المطلوب.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'إذا احتاج المنتج تحسينات أو تعديلات كبيرة بعد التسليم، فقد يتأثر الجدول الزمني ويتطلب تمديد المواعيد.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'قد يكون هناك مدير لضمان الجودة يسهم في تنظيم عملية التحقق من النطاق وفحص الجودة وتوجيهها.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'تُضمَّن جلسات تحقق النطاق أثناء عملية التطوير للتأكد من أن المنتج يتجه في الاتجاه الصحيح ويتماشى مع متطلبات النطاق.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, tasks)
where tp.key = 'basics-4' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);

insert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values ('basics-5', 'ضبط الجودة', 'milestone', '{"competencies":["الرقابة","الأثر"],"principles":[],"assumptions":[],"logic":""}'::jsonb, 'ملف الأسس (الجولة الأولى)', 'draft', 5)
on conflict (key) do nothing;
insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values
  (1, 'why', 'عملية ضبط الجودة جزء أساسي من إدارة المشروع، وتهدف إلى ضمان أن المنتجات أو الخدمات المقدمة تلبي معايير الجودة المحددة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (2, 'what', 'يتم توثيق جميع الأنشطة والنتائج ذات الصلة بضبط الجودة، ومنها تسجيل الاختبارات وتقارير الفحوصات والتغييرات المنفذة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (3, 'how', 'تُحدَّد المعايير والمواصفات التي يجب أن يلتزم بها المنتج أو الخدمة، ومنها متطلبات العميل والمعايير الصناعية المعترف بها.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (4, 'absent', 'قد يؤثر تصحيح العيوب على الجداول الزمنية للمشروع، فيؤدي إلى تأخير في التسليم والمواعيد النهائية.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (5, 'who', 'المسؤول عن ضبط الجودة يعتمد على سياق العمل ونوع المؤسسة أو المشروع.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}'),
  (6, 'when', 'تتم عملية ضبط الجودة على مراحل مختلفة في دورة حياة المشروع أو الإنتاج، بحسب نوع الصناعة أو الخدمة.', 'true', '{"support":"شرح الجملة لزملائك","lead":"إدارة النقاش بالتشاور مع المدرب","guide":"التفكير في تطبيقها داخل المنظمة","eval":"تجهيز سؤال تقييم عليها"}')
) as v(sort, question, text_ar, key, tasks)
where tp.key = 'basics-5' and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);
