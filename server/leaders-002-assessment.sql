-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة — الترحيل الثاني: أداة القياس المبدئي والرحلة والكتيب
-- ════════════════════════════════════════════════════════════════
-- يُشغَّل بعد leaders.sql. آمن لإعادة التشغيل. لا يحذف بيانات.
--
-- مبني على ملفات المشروع: الأطر الثلاثة (Milestone، Impact، Leadership)
-- والإطار التنفيذي. كل إطار يحدد مؤشرات إتقانه على ثلاثة مستويات:
-- المعرفة ثم المهارة ثم السلوك القيادي. أداة القياس تتبع ذلك حرفيًا:
-- لكل بُعد 12 سؤالًا (4 معرفة، 4 مهارة بمواقف، 4 سلوك بتقييم ذاتي).
--
-- قاعدة المستوى في كل بُعد (قابلة للتعديل من level_rules):
--   احترافي: معرفة ≥ 75 و مهارة ≥ 75 و سلوك ≥ 75
--   متوسط:   معرفة ≥ 75 و مهارة ≥ 50
--   تأسيسي:  ما عدا ذلك

-- ── المسميات من الإطار التنفيذي (ملف الكفاءة للمشارك) ──
update leaders.levels set title_ar = 'تأسيسي'  where key = 'beginner';
update leaders.levels set title_ar = 'متوسط'   where key = 'intermediate';
update leaders.levels set title_ar = 'احترافي', title_en = 'Professional' where key = 'advanced';

update leaders.dimensions set title_ar = 'إدارة المشروعات'       where key = 'milestone';
update leaders.dimensions set title_ar = 'تحويل المشروع إلى أثر'  where key = 'impact';
update leaders.dimensions set title_ar = 'تمكين القائد من قيادة التنفيذ' where key = 'leadership';

-- ── ملف الكفاءة: وصف كل خلية والمسار المقترح ──
-- حدود الدرجة المفردة استُبدلت بقواعد المستويات الثلاثة أدناه.
alter table leaders.grid_cells drop column if exists min_score;
alter table leaders.grid_cells drop column if exists max_score;
alter table leaders.grid_cells add column if not exists path_title_ar text;

update leaders.grid_cells set description_ar = 'يحتاج بناء الأساس: المعلم بمنظور قيادي، وأنواعه، والمدارس العالمية.', path_title_ar = 'بناء أساسيات التحكم بالتنفيذ' where dimension = 'milestone' and level = 'beginner';
update leaders.grid_cells set description_ar = 'يفهم المفاهيم ويحتاج تطبيقها: سجل المعالم، وبوابات المراحل، وقراءة الانزلاق.', path_title_ar = 'تطوير التطبيق وأدوات التحكم' where dimension = 'milestone' and level = 'intermediate';
update leaders.grid_cells set description_ar = 'يمتلك معرفة وخبرة متقدمة في تخطيط وإدارة وتنفيذ المشروعات.', path_title_ar = 'تعزيز الممارسة المتقدمة على البرامج والمحافظ' where dimension = 'milestone' and level = 'advanced';
update leaders.grid_cells set description_ar = 'يحتاج بناء الأساس: سلسلة القيمة، والفرق بين المخرج والمنفعة والأثر.', path_title_ar = 'بناء أساسيات قياس القيمة' where dimension = 'impact' and level = 'beginner';
update leaders.grid_cells set description_ar = 'يمتلك فهمًا جيدًا لمفاهيم إدارة الأثر، ويحتاج مزيدًا من التطبيق العملي والربط بالمخرجات.', path_title_ar = 'تطوير التطبيق والربط بالأثر' where dimension = 'impact' and level = 'intermediate';
update leaders.grid_cells set description_ar = 'يبني سجلات المنافع ويقود مراجعاتها ويحاكم جودة أدلة الأثر.', path_title_ar = 'تعزيز قيادة الأثر على مستوى المحفظة' where dimension = 'impact' and level = 'advanced';
update leaders.grid_cells set description_ar = 'يمتلك أساسيات في القيادة والتأثير، ويحتاج تطوير مهارات القيادة وإدارة أصحاب المصلحة.', path_title_ar = 'بناء الأساسيات القيادية' where dimension = 'leadership' and level = 'beginner';
update leaders.grid_cells set description_ar = 'يطبق الأنماط القيادية ويحتاج تثبيتها في المواقف الصعبة والخلافات.', path_title_ar = 'تطوير التطبيق القيادي الموقفي' where dimension = 'leadership' and level = 'intermediate';
update leaders.grid_cells set description_ar = 'يقود في كل الاتجاهات ويحوّل المقاومة إلى تبنٍّ للتغيير.', path_title_ar = 'تعزيز القيادة التحويلية' where dimension = 'leadership' and level = 'advanced';

-- ── قواعد تحديد المستوى ──
create table if not exists leaders.level_rules (
  dimension     text not null references leaders.dimensions(key),
  level         text not null references leaders.levels(key),
  min_knowledge numeric(5,2) not null default 0,
  min_skill     numeric(5,2) not null default 0,
  min_behavior  numeric(5,2) not null default 0,
  primary key (dimension, level)
);

insert into leaders.level_rules (dimension, level, min_knowledge, min_skill, min_behavior)
select d.key, v.level, v.k, v.s, v.b
from leaders.dimensions d
cross join (values ('beginner', 0, 0, 0), ('intermediate', 75, 50, 0), ('advanced', 75, 75, 75))
  as v(level, k, s, b)
on conflict (dimension, level) do nothing;

-- ── مستويات الإتقان داخل الأسئلة والنتائج ──
alter table leaders.questions add column if not exists tier text not null default 'knowledge'
  check (tier in ('knowledge', 'skill', 'behavior'));

alter table leaders.assessment_results add column if not exists knowledge_pct numeric(5,2);
alter table leaders.assessment_results add column if not exists skill_pct     numeric(5,2);
alter table leaders.assessment_results add column if not exists behavior_pct  numeric(5,2);

-- ── رحلة التأهيل (ست مراحل من الإطار التنفيذي) ──
create table if not exists leaders.journey_stages (
  key            text primary key,
  sort           smallint not null,
  title_ar       text not null,
  duration_label text not null,
  duration_days  smallint not null,
  description_ar text
);

insert into leaders.journey_stages values ('training', 1, 'التدريب', '4 أيام تدريبية', 4, 'أيام تدريبية مكثفة على الأطر الثلاثة بعمق يناسب مستوى المشارك في كل بُعد.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;
insert into leaders.journey_stages values ('ojt_coaching', 2, 'التوجيه على رأس العمل', '4 أسابيع', 28, 'تطبيق أدوات الإطار على مشروع حقيقي من عمل المشارك بمتابعة الموجّه.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;
insert into leaders.journey_stages values ('consulting', 3, 'الاستشارة', 'أسبوعان', 14, 'جلسة استشارية متخصصة مرتبطة بمشروعات المشارك.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;
insert into leaders.journey_stages values ('leadership_coaching', 4, 'التوجيه القيادي', '4 أسابيع', 28, 'جلسات توجيه فردية لدعم المسار القيادي وخطة التطوير الذاتي.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;
insert into leaders.journey_stages values ('support', 5, 'الدعم والتمكين', '3 أشهر', 90, 'دعم فني وتقني مستمر عبر المنصة حتى استقلال المشارك.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;
insert into leaders.journey_stages values ('evaluation', 6, 'التقييم والقياس', 'أسبوعان', 14, 'القياس البعدي والتقييم النهائي وإصدار التقرير للمشارك أو جهته.')
  on conflict (key) do update set sort = excluded.sort, title_ar = excluded.title_ar, duration_label = excluded.duration_label, duration_days = excluded.duration_days, description_ar = excluded.description_ar;

alter table leaders.step_catalog add column if not exists stage_key text references leaders.journey_stages(key);

-- ── الكتيب: أبواب كل إطار والمستوى الذي يُضمَّن عنده ──
-- كتيب المشارك = أبواب الأطر الثلاثة التي مستواها الأدنى ≤ مستواه في ذلك البُعد،
-- مع صفحة أولى شخصية (ملف الكفاءة والمسار).
create table if not exists leaders.handbook_modules (
  id          uuid primary key default gen_random_uuid(),
  dimension   text not null references leaders.dimensions(key),
  chapter_key text not null,
  sort        smallint not null,
  title_ar    text not null,
  min_level   text not null references leaders.levels(key),
  body_md     text,                          -- المحتوى، يُحرَّر من اللوحة
  unique (dimension, chapter_key)
);

insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'intro', 1, 'القسم التمهيدي: التعريف بالإطار وأهدافه', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch1', 2, 'الباب الأول: المشهد العالمي والمستخلص القيادي', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch2', 3, 'الباب الثاني: إدارة المشاريع التنموية', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch3', 4, 'الباب الثالث: النموذج الفكري لصناعة القرار', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch4', 5, 'الباب الرابع: عمق المفهوم، القاموس، النماذج ومنتجات العمل', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch5', 6, 'الباب الخامس: الطبقات الثلاث (المشروع، البرنامج، المحفظة)', 'intermediate')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'ch6', 7, 'الباب السادس: النظام البيئي وجدارات القائد', 'advanced')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'labs', 8, 'التطبيقات العملية والمختبرات', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('milestone', 'close', 9, 'الخلاصة: خمس رسائل جوهرية', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'intro', 1, 'القسم التمهيدي: التعريف بالإطار وأهدافه', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch1', 2, 'الباب الأول: المشهد العالمي والمستخلص القيادي', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch2', 3, 'الباب الثاني: سلسلة القيمة والأثر', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch3', 4, 'الباب الثالث: النموذج الفكري لقيادة الأثر', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch4', 5, 'الباب الرابع: عمق المفهوم، القاموس، النماذج ومنتجات العمل', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch5', 6, 'الباب الخامس: الطبقات الثلاث (المشروع، البرنامج، المحفظة)', 'intermediate')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'ch6', 7, 'الباب السادس: النظام البيئي وجدارات القائد', 'advanced')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'labs', 8, 'التطبيقات العملية والمختبرات', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('impact', 'close', 9, 'الخلاصة: خمس رسائل جوهرية', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'intro', 1, 'القسم التمهيدي: التعريف بالإطار وأهدافه', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch1', 2, 'الباب الأول: المشهد العالمي والمستخلص القيادي', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch2', 3, 'الباب الثاني: جدارة سرعة الاستجابة', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch3', 4, 'الباب الثالث: جدارة التسليم والتسلم', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch4', 5, 'الباب الرابع: عمق المفهوم، القاموس، النماذج ومنتجات العمل', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch5', 6, 'الباب الخامس: الطبقات الثلاث (المشروع، البرنامج، المحفظة)', 'intermediate')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'ch6', 7, 'الباب السادس: النظام البيئي وجدارات القائد', 'advanced')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'labs', 8, 'التطبيقات العملية والمختبرات', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;
insert into leaders.handbook_modules (dimension, chapter_key, sort, title_ar, min_level) values ('leadership', 'close', 9, 'الخلاصة: خمس رسائل جوهرية', 'beginner')
  on conflict (dimension, chapter_key) do update set sort = excluded.sort, title_ar = excluded.title_ar, min_level = excluded.min_level;

-- ── أداة القياس المبدئي baseline-v1 ──
insert into leaders.instruments (key, title_ar, kind, active)
values ('baseline-v1', 'القياس المبدئي لإدارة المشروعات للقادة', 'baseline', true)
on conflict (key) do nothing;

insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-K1', 'knowledge', 'أي العبارات التالية تعبّر عن المعلم (Milestone) بالمنظور القيادي للمنهجية؟', 'choice', '[{"label": "تاريخ انتهاء نشاط رئيسي في الجدول الزمني", "score": 0}, {"label": "نقطة قرار محورية نقيس عندها التقدم ونتحكم بالمخاطر ونتحقق من اقتراب القيمة", "score": 4}, {"label": "اجتماع دوري لمتابعة نسب الإنجاز", "score": 0}, {"label": "تقرير شهري يُرفع للإدارة العليا", "score": 0}]'::jsonb, 1 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-K2', 'knowledge', 'ما العلاقة الصحيحة بين بوابة المرحلة (Stage Gate) والمعلم؟', 'choice', '[{"label": "هما اسمان لشيء واحد", "score": 0}, {"label": "كل معلم بوابة مرحلة تتطلب قرارًا رسميًا", "score": 0}, {"label": "كل بوابة مرحلة معلم، وليس كل معلم بوابة؛ البوابة قرار إلزامي بالاستمرار أو التصحيح أو الإيقاف", "score": 4}, {"label": "البوابة تخص المحافظ فقط والمعلم يخص المشاريع", "score": 0}]'::jsonb, 2 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-K3', 'knowledge', '"أول مستفيد يستخدم الخدمة" مثال على أي نوع من أنواع المعالم الأربعة؟', 'choice', '[{"label": "معلم تعاقدي", "score": 0}, {"label": "معلم تقني أو إنجاز", "score": 0}, {"label": "معلم حوكمي أو قرار", "score": 0}, {"label": "معلم قيمة أو منافع", "score": 4}]'::jsonb, 3 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-K4', 'knowledge', 'مؤسسة تحتاج حوكمة صارمة، وإدارة بالمراحل، ومراجعة لمبرر الاستمرار عند كل مرحلة. أي مدرسة أقرب لاحتياجها؟', 'choice', '[{"label": "PMI / PMBOK", "score": 0}, {"label": "Axelos / PRINCE2", "score": 4}, {"label": "Agile", "score": 0}, {"label": "IPMA / ICB", "score": 0}]'::jsonb, 4 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-S1', 'skill', 'طُلب منك بناء سجل معالم لمشروع جديد. أي سجل هو الأفضل؟', 'choice', '[{"label": "معالم تقنية لاكتمال كل مخرج من مخرجات المشروع", "score": 1}, {"label": "مزيج من معالم تعاقدية وتقنية وحوكمية وقيمة، لكل معلم معيار تحقق وصاحب قرار", "score": 4}, {"label": "معلم في نهاية كل شهر لضمان انتظام المتابعة", "score": 0}, {"label": "معالم الدفعات التعاقدية مع الجهة الممولة", "score": 1}]'::jsonb, 5 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-S2', 'skill', 'في جلسة بوابة مرحلة: المشروع متأخر ثلاثة أسابيع، ومبرر الاستمرار ما زال قائمًا، والمخاطر معروفة. ما القرار الأنسب؟', 'choice', '[{"label": "العبور تلقائيًا لأن العمل مستمر", "score": 0}, {"label": "إيقاف المشروع حتى تتضح الصورة", "score": 0}, {"label": "عبور مشروط بخطة تصحيح موثقة ومسؤول محدد ومعلم مراجعة قريب", "score": 4}, {"label": "تأجيل الجلسة حتى يلحق المشروع بالخطة", "score": 1}]'::jsonb, 6 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-S3', 'skill', 'تحليل اتجاه المعالم (MTA) يظهر أن تاريخ معلم رئيسي يتأخر أسبوعًا في كل تقرير منذ أربعة أشهر. ما التصرف الأنسب؟', 'choice', '[{"label": "الانتظار، فالتأخير بسيط في كل مرة", "score": 0}, {"label": "الضغط على الفريق لتعويض التأخير", "score": 1}, {"label": "التعامل معه كانزلاق منهجي: معالجة السبب الجذري، وإعادة تقدير خط الأساس، والتصعيد بقرار مطلوب", "score": 4}, {"label": "حذف المعلم من التقارير لتجنب الإحراج", "score": 0}]'::jsonb, 7 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-S4', 'skill', 'مشروع تنموي ممول من جهة مانحة، وتقارير المنح ترهق الفريق ولا يُستفاد منها. ما المعالجة الأنسب؟', 'choice', '[{"label": "تقليل عدد التقارير قدر الإمكان", "score": 0}, {"label": "تحويل تقارير المانح إلى معالم تعاقدية مرتبطة بنقاط قرار وتعلّم داخلية", "score": 4}, {"label": "إسنادها لموظف متخصص بعيدًا عن الفريق", "score": 1}, {"label": "دمجها في تقرير سنوي واحد", "score": 1}]'::jsonb, 8 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-B1', 'behavior', 'أبدأ اجتماعات المتابعة بسؤال "ما القرار المطلوب الآن؟" لا "ماذا أنجزنا؟"', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 9 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-B2', 'behavior', 'عند تسليم مخرج إلى وحدة الأعمال، أتفق مسبقًا على معايير التسليم ومن يملك القرار بعده.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 10 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-B3', 'behavior', 'أراجع مبرر استمرار المشروع عند كل بوابة حتى لو كان سير العمل جيدًا.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 11 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'milestone', 'M-B4', 'behavior', 'أوقف أو أعيد توجيه عمل حين تُظهر المعالم أنه لم يعد يخدم القيمة، ولو كان مكتملًا جزئيًا.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 12 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-K1', 'knowledge', 'ما الترتيب الصحيح لسلسلة القيمة الخماسية؟', 'choice', '[{"label": "مخرجات ← منافع ← نتائج مباشرة ← أثر مستدام ← تأثير", "score": 0}, {"label": "مخرجات ← نتائج مباشرة ← منافع ← تأثير ← أثر مستدام", "score": 4}, {"label": "نتائج مباشرة ← مخرجات ← تأثير ← منافع ← أثر مستدام", "score": 0}, {"label": "منافع ← مخرجات ← نتائج مباشرة ← تأثير ← أثر مستدام", "score": 0}]'::jsonb, 1 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-K2', 'knowledge', 'متى تكون لغة "المساهمة" أدق من "الإسناد" في تقارير الأثر؟', 'choice', '[{"label": "عند تسليم المخرجات", "score": 0}, {"label": "في أعلى السلسلة (التأثير والأثر المستدام) حيث تتعدد العوامل التي صنعت التغيير", "score": 4}, {"label": "عندما يكون المشروع ممولًا ذاتيًا", "score": 0}, {"label": "لا فرق بينهما في الممارسة", "score": 0}]'::jsonb, 2 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-K3', 'knowledge', 'ما الذي يجعل النتيجة "منفعة" بمفهوم المنهجية؟', 'choice', '[{"label": "أن تكون إيجابية في نظر المستفيدين", "score": 0}, {"label": "أن تظهر في تقرير الإغلاق", "score": 0}, {"label": "أن تكون تحسنًا مقيسًا له مالك ومؤشر وتاريخ تحقق، ويخدم هدفًا استراتيجيًا", "score": 4}, {"label": "أن تكون قابلة للتحويل إلى قيمة مالية", "score": 0}]'::jsonb, 3 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-K4', 'knowledge', 'ما الفرق الجوهري بين OKR وKPI؟', 'choice', '[{"label": "لا فرق، كلاهما مؤشرات أداء", "score": 0}, {"label": "OKR تقود التغيير نحو طموح محدد وتُراجع فصليًا، وKPI تراقب صحة التشغيل المستمر", "score": 4}, {"label": "KPI للقطاع الخاص وOKR للقطاع الحكومي", "score": 0}, {"label": "OKR للأفراد وKPI للمؤسسات", "score": 0}]'::jsonb, 4 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-S1', 'skill', 'تبني سجل منافع لبرنامج تدريبي. أي صياغة تصلح منفعةً؟', 'choice', '[{"label": "تدريب 500 متدرب خلال العام", "score": 0}, {"label": "رفع نسبة توظيف الخريجين من 30% إلى 45% خلال 12 شهرًا، ومالكها مدير التوظيف", "score": 4}, {"label": "تحسين جودة حياة المجتمع", "score": 1}, {"label": "رضا المتدربين عن الدورة بنسبة 90%", "score": 1}]'::jsonb, 5 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-S2', 'skill', 'في مراجعة منافع: منفعة متأخرة عن مسارها بنسبة 40%، ومالكها يقترح تأجيل القياس للدورة القادمة. ما القرار الأنسب؟', 'choice', '[{"label": "الموافقة على التأجيل", "score": 0}, {"label": "تحليل السبب واتخاذ قرار موثق: تعزيز أو تصحيح مسار أو إعادة توجيه الاستثمار", "score": 4}, {"label": "حذف المنفعة من السجل", "score": 0}, {"label": "ضخ موارد إضافية فورًا", "score": 1}]'::jsonb, 6 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-S3', 'skill', 'تقرير أثر يذكر أن البرنامج خفّض البطالة في المنطقة 10%، دون خط أساس أو مجموعة مقارنة. كيف تتعامل معه؟', 'choice', '[{"label": "أعتمده، فالنتيجة إيجابية", "score": 0}, {"label": "أعيد صياغته بلغة المساهمة مع أدلة داعمة ونظرية تغيير توضح المسار السببي", "score": 4}, {"label": "أحذف الرقم من التقرير", "score": 1}, {"label": "أطلب من الفريق رقمًا أعلى لتعزيز التمويل", "score": 0}]'::jsonb, 7 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-S4', 'skill', 'برنامج بدأ قبل شهرين دون خط أساس. ما التصرف الأنسب؟', 'choice', '[{"label": "الانتظار حتى النهاية والقياس مرة واحدة", "score": 0}, {"label": "بناء خط أساس فوري بأفضل بيانات متاحة، وتوثيق قيوده", "score": 4}, {"label": "الاكتفاء بقياس المخرجات", "score": 1}, {"label": "الاعتماد على انطباعات الفريق", "score": 0}]'::jsonb, 8 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-B1', 'behavior', 'أفتتح مراجعات المشاريع بسؤال "ما الذي تغيّر؟"', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 9 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-B2', 'behavior', 'أرفض اعتماد منفعة ليس لها مالك محدد يُحاسب عليها.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 10 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-B3', 'behavior', 'أقاوم تجميل الأرقام وادعاء الإسناد حتى لو أضعف ذلك التقرير.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 11 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'impact', 'I-B4', 'behavior', 'أستخدم مؤشرات الأثر في قرارات الاستثمار والأولويات، لا في التقارير فقط.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 12 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-K1', 'knowledge', 'ما الترتيب الصحيح لسلسلة الاستجابة الخماسية؟', 'choice', '[{"label": "التحرك ← التفهم ← تلقي الأمر ← الإغلاق ← الأولوية", "score": 0}, {"label": "تلقي الأمر ← الأولوية ← التحرك ← التفهم ← الإغلاق", "score": 0}, {"label": "تلقي الأمر ← التفهم ← الأولوية ← التحرك ← الإغلاق", "score": 4}, {"label": "التفهم ← تلقي الأمر ← التحرك ← الأولوية ← الإغلاق", "score": 0}]'::jsonb, 1 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-K2', 'knowledge', 'في القيادة الموقفية، على أي أساس يُختار النمط القيادي؟', 'choice', '[{"label": "شخصية القائد وما يرتاح له", "score": 0}, {"label": "جاهزية الفرد للمهمة المحددة: قدرته ورغبته", "score": 4}, {"label": "أقدمية الفرد في المؤسسة", "score": 0}, {"label": "حجم المشروع وميزانيته", "score": 0}]'::jsonb, 2 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-K3', 'knowledge', 'ماذا تعني "الجدارة الأفقية" في قيادة المشاريع؟', 'choice', '[{"label": "إدارة الفريق التنفيذي المباشر", "score": 0}, {"label": "إقناع الإدارة العليا", "score": 0}, {"label": "تحريك النظراء والإدارات الموازية بلا سلطة مباشرة عليهم", "score": 4}, {"label": "ضبط الانفعال تحت الضغط", "score": 0}]'::jsonb, 3 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-K4', 'knowledge', 'متى يكتمل التسليم والتسلم بالمفهوم القيادي؟', 'choice', '[{"label": "عند توقيع محضر التسليم", "score": 0}, {"label": "عند تسليم الملفات كاملة", "score": 0}, {"label": "عند تحقق الأثر واستقلال المتسلم بالعهدة", "score": 4}, {"label": "عند انتقال المسلّم لمهمة أخرى", "score": 0}]'::jsonb, 4 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-S1', 'skill', 'عضو جديد في فريقك متحمس جدًا لكن تنقصه الخبرة في المهمة المكلف بها. ما النمط الأنسب معه؟', 'choice', '[{"label": "التفويض الكامل لتعزيز ثقته", "score": 0}, {"label": "المساندة والتشجيع فقط", "score": 1}, {"label": "التوجيه: تعليمات واضحة ومتابعة قريبة", "score": 4}, {"label": "التدريب مع ترك القرار له", "score": 2}]'::jsonb, 5 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-S2', 'skill', 'خلاف مع إدارة موازية على مورد مشترك؛ القضية مهمة للمشروع والعلاقة طويلة الأمد. أي نمط (TKI) هو الأنسب؟', 'choice', '[{"label": "التنافس لحسم المورد لصالح مشروعك", "score": 1}, {"label": "التجنب حفاظًا على العلاقة", "score": 0}, {"label": "التعاون للوصول إلى حل يحقق مصلحة الطرفين", "score": 4}, {"label": "التسوية بتقاسم المورد مناصفة", "score": 2}]'::jsonb, 6 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-S3', 'skill', 'وصلك توجيه عاجل من الإدارة العليا بصياغة عامة. ما أول خطوة؟', 'choice', '[{"label": "البدء بالتنفيذ فورًا لإظهار سرعة الاستجابة", "score": 1}, {"label": "إقرار الاستلام مع إعادة صياغة المقصود للتحقق منه قبل التحرك", "score": 4}, {"label": "انتظار وصول تفاصيل إضافية", "score": 0}, {"label": "تمرير التوجيه للفريق كما وصل", "score": 0}]'::jsonb, 7 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-S4', 'skill', 'جهة ذات نفوذ عالٍ واهتمام منخفض بمشروعك. ما الاستراتيجية الأنسب معها؟', 'choice', '[{"label": "إدارتها عن قرب بتواصل يومي", "score": 1}, {"label": "إبقاؤها راضية بإحاطات موجزة عند نقاط القرار", "score": 4}, {"label": "الاكتفاء بالمراقبة", "score": 1}, {"label": "تجاهلها ما دامت غير مهتمة", "score": 0}]'::jsonb, 8 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-B1', 'behavior', 'أغيّر أسلوبي القيادي بحسب جاهزية الشخص والموقف، لا بحسب ما يريحني.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 9 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-B2', 'behavior', 'أضبط انفعالي تحت الضغط وأفصل بين الموقف والشخص.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 10 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-B3', 'behavior', 'عند تسليم عهدة أوثّق حالتها ومخاطرها وقراراتها المعلقة، وأرافق المتسلم حتى يستقل.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 11 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, kind, options, sort)
select id, 'leadership', 'L-B4', 'behavior', 'أشرح لفريقي "لماذا نتغير ومعنا من؟" قبل أن أطلب إنجاز المهام.', 'likert', '[{"label": "نادرًا جدًا", "score": 0}, {"label": "نادرًا", "score": 1}, {"label": "أحيانًا", "score": 2}, {"label": "غالبًا", "score": 3}, {"label": "دائمًا", "score": 4}]'::jsonb, 12 from leaders.instruments where key = 'baseline-v1'
on conflict (instrument_id, code) do update set dimension = excluded.dimension, tier = excluded.tier, text_ar = excluded.text_ar, kind = excluded.kind, options = excluded.options, sort = excluded.sort;

-- ── الحماية للجداول الجديدة ──
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'leaders' loop
    execute format('alter table leaders.%I enable row level security', t);
  end loop;
end $$;

alter table leaders.level_rules      enable row level security;
alter table leaders.journey_stages   enable row level security;
alter table leaders.handbook_modules enable row level security;

revoke all on all tables in schema leaders from public, anon, authenticated;
grant  all on all tables in schema leaders to service_role;

