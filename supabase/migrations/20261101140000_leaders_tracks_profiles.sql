-- ════════════════════════════════════════════════════════════════════
-- المسارات (المرحلة ب): ملفات التعريف، والمختبرات بالمستوى، ووعود الرحلة، والنماذج
-- مولَّد بـ scripts/tracks/build.mjs من supabase/content/tracks/v2؛ لا يُحرَّر يدويًا.
-- آمن لإعادة التشغيل: النسخة الاحتياطية تُؤخذ مرة واحدة، وكل تعديل يكتب قيمة ثابتة
-- بمفتاح الصف أو محروس بشرط يختفي بعد أول تشغيل.
-- 1) leaders.track_profiles: سبعة ملفات تعريف (إطار الأولوية × مستواه فيه) بنص أصيل،
--    وtracks.profile_key لكل مسار. المفتاح M{m}I{i}L{l} يبقى داخليًا للاشتقاق.
-- 2) tracks.journey_ar = رحلة ملف التعريف: بلا «النصيب الأكبر من الجلسات» ولا
--    «ورشة/عيادة/حلقة» بحسب المستوى (لا متطلب رحلة يفرّقها)، وtitle_en للـ27،
--    وتصحيح ثلاثة عناوين تناقض حزمتها (M3I1L3، M2I3L2، M3I3L3)
-- 3) lab_items.audience = all: المختبرات تصل بالمستوى تلقائيًا؛ portfolio-review يبقى بمنحة
-- 4) النماذج: نظرية التغيير وتشخيص نمط الخلاف تأسيسيان، وتقرير الأثر في الوثيقة،
--    وحقل احترافي لكل من خمسة نماذج راكدة
-- التحقق: node scripts/tracks/verify.mjs (المحتوى) وscripts/db/verify-tracks-profiles.sql (القاعدة)
-- ════════════════════════════════════════════════════════════════════

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل
create table if not exists leaders.backup_20261101_tracks_profiles as
  select 'track' kind, key ref, title_ar a, title_en b, journey_ar c from leaders.tracks
  union all select 'model', key, min_level, capstone_sort::text, fields::text from leaders.learning_models
   where key in ('theory-of-change', 'conflict-mode', 'impact-report', 'initiative-charter', 'benefits-register', 'transformation-story', 'stage-gate', 'wbs')
  union all select 'lab', key, audience, min_level, null from leaders.lab_items;
alter table leaders.backup_20261101_tracks_profiles enable row level security;

-- أدوات مؤقتة للجلسة: تعديل حقل بمفتاحه، أو إدراجه قبل «تعمق المسار» إن غاب
create or replace function pg_temp.patch_field(mkey text, fkey text, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey and m.fields @> jsonb_build_array(jsonb_build_object('key', fkey))
     and not m.fields @> jsonb_build_array(jsonb_build_object('key', fkey) || patch);
$f$;

create or replace function pg_temp.add_field(mkey text, field jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(x order by o) from (
       select f x, ord * 2 o from jsonb_array_elements(m.fields) with ordinality as e(f, ord)
       union all
       select field, coalesce((select ord * 2 - 1 from jsonb_array_elements(m.fields) with ordinality as e(f, ord) where f->>'key' = 'track_depth' limit 1), 100000)
     ) s)
   where m.key = mkey and not m.fields @> jsonb_build_array(jsonb_build_object('key', field->>'key'));
$f$;

-- ════════════ 1) ملفات التعريف ════════════
create table if not exists leaders.track_profiles (
  key text primary key,
  priority_dimension text not null references leaders.dimensions(key),
  level text not null references leaders.levels(key),
  title_ar text not null,
  title_en text,
  summary_ar text not null,
  journey_ar text not null,
  updated_at timestamptz not null default now(),
  constraint track_profiles_key_check check (key = priority_dimension || '-' || level),
  constraint track_profiles_title_ar_check check (char_length(title_ar) between 3 and 120),
  constraint track_profiles_title_en_check check (title_en is null or char_length(title_en) <= 200),
  constraint track_profiles_text_check check (char_length(summary_ar) <= 1000 and char_length(journey_ar) <= 3000)
);
alter table leaders.track_profiles enable row level security;
grant select, insert, update, delete on leaders.track_profiles to service_role;
drop trigger if exists track_profiles_touch on leaders.track_profiles;
create trigger track_profiles_touch before update on leaders.track_profiles for each row execute function leaders.touch_updated_at();

insert into leaders.track_profiles (key, priority_dimension, level, title_ar, title_en, summary_ar, journey_ar) values
  ('milestone-beginner', 'milestone', 'beginner', 'من الخطة إلى نقاط القرار', 'From Plan to Decision Points', 'أولويتك الآن إدارة المشروعات: أن تتحول خطة مبادرتك من قائمة مهام وتواريخ إلى معالم يُتخذ عند كل منها قرار واضح، وأن ترى مبكرًا ما يؤخرها وما يهددها قبل أن يصير مشكلة على طاولة الراعي.', 'الكتيب: أبواب إدارة المشروعات من التمهيد إلى الباب الرابع، تقرؤها وتجيب عن أسئلة كل باب.
المختبر: مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير؛ تتدرب فيها على حالات قبل أن تنقلها إلى مبادرتك.
وثيقة مبادرتك: معايير إدارة المشروعات وزنها مضاعف في تقييمها، وتجيب عن سؤال تعمق إضافي في بطاقة المبادرة وسجل المعالم والجدول الزمني والمسار الحرج وسجل المخاطر والافتراضات والاعتماديات.
تمرين مستواك: تحويل جدول مشروعك إلى معالم قرار، لكل منها ما يُقرَّر عنده.'),
  ('milestone-intermediate', 'milestone', 'intermediate', 'إحكام التنفيذ بالبوابات والتكلفة', 'Tightening Delivery: Gates and Cost', 'تعرف أدوات التخطيط وتستعملها، والخطوة التالية أن تصمد خطتك أمام أول تغيير: مبادرة مجزأة إلى حزم عمل لكل منها مالك وتكلفة، وقرار عبور موثق عند كل بوابة بين الاستمرار والتصحيح والإيقاف.', 'الكتيب: يُضاف إلى أبواب إدارة المشروعات الأساسية الباب الخامس، وهو ما يميّز مستواك فيها.
المختبر: مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير.
وثيقة مبادرتك: تضيف إليها هيكل تجزئة العمل والموارد والتكلفة وورقة قرار بوابة المرحلة، وتحدد في الجدول الزمني الأنشطة الحرجة والاحتياطي الزمني.
التقييم: معايير إدارة المشروعات وزنها مضاعف، وفي كل فصل من فصولها سؤال تعمق إضافي: بطاقة المبادرة، وهيكل تجزئة العمل، وسجل المعالم، والجدول الزمني والمسار الحرج، والموارد والتكلفة، وسجل المخاطر والافتراضات والاعتماديات، وورقة قرار بوابة المرحلة.'),
  ('milestone-advanced', 'milestone', 'advanced', 'قرارات التنفيذ تحت الضغط', 'Delivery Decisions Under Pressure', 'مستواك احترافي في الأطر الثلاثة، فتبدأ أولويتك من إدارة المشروعات لأنها الأولى في ترتيب الأطر عند التساوي. المنتظر منك هنا قرارات لا خطط: أن تختبر حساسية الجدول، وتزن التكلفة بالمنفعة، وتحدد كم من المخاطرة تقبله الجهة قبل أن تلتزم.', 'الكتيب: الباب الخامس والباب السادس من إدارة المشروعات فوق أبوابها الأساسية.
المختبر: القيمة المكتسبة عند المعلم، ومعه مخطط الجدول والمسار الحرج، والبوابة الحمراء، وسجل المخاطر والمشكلات والتغيير.
وثيقة مبادرتك: حقول تخص مستواك في فصولها: حساسية الجدول، والتكلفة مقابل المنفعة، وحدود المخاطرة المقبولة، وما تتنازل عنه الجهة لأجل المبادرة، والتكلفة الغارقة في قرار البوابة، والواجهات بين حزم العمل والأطراف الأخرى. ومعايير إدارة المشروعات وزنها مضاعف.
متطلبات مستواك: إدارة جلسة بوابة مرحلة موثقة، وتمرين في تصميم بوابات المراحل لأكثر من مشروع معًا.'),
  ('impact-beginner', 'impact', 'beginner', 'من المخرج إلى المنفعة', 'From Output to Benefit', 'تسلّم ما تعد به في موعده، والسؤال الذي ينتظرك بعد التسليم: ماذا تغيّر للمستفيد؟ تتعلم أن تفرّق بين المخرج والمنفعة والأثر، وأن تكتب لكل منفعة مؤشرًا بخط أساس ومستهدف، ومالكًا من الجهة يبقى بعد إغلاق المبادرة.', 'الكتيب: أبواب تحويل المشروع إلى أثر من التمهيد إلى الباب الرابع، وأقربها إلى أولويتك الباب الثاني: سلسلة القيمة والأثر.
المختبر: خريطة المنافع وسلسلة القيمة، وفاحص المؤشرات.
وثيقة مبادرتك: سجل المنافع، ونظرية التغيير في صيغتها الأولى (الأثر بعيد المدى والسلسلة السببية من الأنشطة إلى الأثر)، وفي كل منهما سؤال تعمق إضافي.
التقييم: معايير الأثر وزنها مضاعف في تقييم وثيقتك.'),
  ('impact-intermediate', 'impact', 'intermediate', 'الدليل قبل الادعاء', 'Evidence Before Claims', 'تكتب منافع مبادرتك ومؤشراتها، وما يرفعك الآن أن تدافع عن اختيارك وتثبت نتيجته: لماذا هذا الحل دون بدائله، وما الافتراض الأضعف في سلسلة الأثر، وكيف ستعرف أن المنفعة تحققت بفعل مبادرتك لا بعامل آخر.', 'الكتيب: يُضاف إلى أبواب تحويل المشروع إلى أثر الأساسية الباب الخامس.
المختبر: خريطة المنافع وسلسلة القيمة، وفاحص المؤشرات.
وثيقة مبادرتك: المبرر والبدائل، وخطة القياس والأدلة، ونظرية التغيير كاملة بافتراضها الأضعف وطريقة اختباره مبكرًا، مع سجل المنافع.
التقييم: معايير الأثر وزنها مضاعف، وفي كل فصل من فصوله الأربعة سؤال تعمق إضافي.'),
  ('leadership-beginner', 'leadership', 'beginner', 'القيادة من خلال الآخرين', 'Leading Through Others', 'تتقن أدوات العمل، والفرق الذي ينتظرك في الناس: أن يرفع فريقك المشكلة إليك مبكرًا، وأن يعرف كل واحد قراره ومسؤوليته، وأن تبقى ثابتًا حين يشتد الضغط ويتعارض أصحاب المصلحة.', 'الكتيب: أبواب تمكين القائد من التمهيد إلى الباب الرابع، ومنها جدارة الاستجابة المنضبطة وجدارة انتقال العهدة.
المختبر: خريطة أصحاب المصلحة، ومصفوفة المسؤوليات والتفويض، والأسبوع الصعب، وأنماط إدارة الخلاف.
النماذج: تشخيص نمط الخلاف على موقف حقيقي مررت به، إلى جانب فصول وثيقتك.
وثيقة مبادرتك: معايير القيادة وزنها مضاعف، وتجيب عن سؤال تعمق إضافي في خريطة أصحاب المصلحة، والحوكمة والمسؤوليات، وقيادة التغيير والاستدامة، وخطة التطوير القيادي، وقصة التحول.
متطلب مستواك: تحديث خريطة أصحاب المصلحة لمشروعك.'),
  ('leadership-intermediate', 'leadership', 'intermediate', 'التأثير فيمن لا يتبعك إداريًا', 'Influence Beyond Authority', 'تتقدم في التنفيذ والأثر، وما يرفع قيادتك الآن أن تؤثر فيمن لا تملك عليهم سلطة: مديرك، وشركاؤك في الجهات الأخرى، والطرف الآخر في خلاف لا يُحسم بقرار.', 'الكتيب: يُضاف إلى أبواب تمكين القائد الأساسية الباب الخامس.
المختبر: الأسبوع الصعب، وأنماط إدارة الخلاف، وخريطة أصحاب المصلحة، ومصفوفة المسؤوليات والتفويض.
وثيقة مبادرتك: تضيف إلى فصول القيادة أصحاب المصلحة الصامتين، وإيقاع القرار ومسار التصعيد، ومن تمسّهم المبادرة وأين تتوقع مقاومتهم.
التقييم: معايير القيادة وزنها مضاعف، وفي خريطة أصحاب المصلحة، والحوكمة والمسؤوليات، وقيادة التغيير والاستدامة، وخطة التطوير القيادي، وقصة التحول سؤال تعمق إضافي.')
on conflict (key) do update set
  priority_dimension = excluded.priority_dimension, level = excluded.level, title_ar = excluded.title_ar, title_en = excluded.title_en,
  summary_ar = excluded.summary_ar, journey_ar = excluded.journey_ar
where (track_profiles.title_ar, track_profiles.title_en, track_profiles.summary_ar, track_profiles.journey_ar)
  is distinct from (excluded.title_ar, excluded.title_en, excluded.summary_ar, excluded.journey_ar);

-- ════════════ 2) المسارات: ملف التعريف، والرحلة الصادقة، والعنوان الإنجليزي ════════════
alter table leaders.tracks add column if not exists profile_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tracks_profile_key_fkey') then
    alter table leaders.tracks add constraint tracks_profile_key_fkey foreign key (profile_key) references leaders.track_profiles(key);
  end if;
end $$;

-- ملف التعريف يُشتق من محور الأولوية الحالي ومستوى المسار فيه، كما يشتقه الخادم (profileKey)
update leaders.tracks t set profile_key = t.priority_dimension || '-' || case t.priority_dimension
    when 'milestone' then t.milestone_level when 'impact' then t.impact_level else t.leadership_level end
 where t.priority_dimension is not null and t.profile_key is distinct from t.priority_dimension || '-' || case t.priority_dimension
    when 'milestone' then t.milestone_level when 'impact' then t.impact_level else t.leadership_level end;

-- الرحلة = رحلة ملف التعريف؛ والعنوان الإنجليزي = عنوان الملف وأقوى الأطر (من مستويات المسار)
update leaders.tracks t set journey_ar = p.journey_ar, title_en = p.title_en || ' · ' || v.en
  from leaders.track_profiles p, (values
    ('M1I1L1', 'Even across all three frameworks'),
    ('M1I1L2', 'Strengths: Leadership'),
    ('M1I1L3', 'Strengths: Leadership'),
    ('M1I2L1', 'Strengths: Impact'),
    ('M1I2L2', 'Strengths: Impact & Leadership'),
    ('M1I2L3', 'Strengths: Leadership'),
    ('M1I3L1', 'Strengths: Impact'),
    ('M1I3L2', 'Strengths: Impact'),
    ('M1I3L3', 'Strengths: Impact & Leadership'),
    ('M2I1L1', 'Strengths: Milestone'),
    ('M2I1L2', 'Strengths: Milestone & Leadership'),
    ('M2I1L3', 'Strengths: Leadership'),
    ('M2I2L1', 'Strengths: Milestone & Impact'),
    ('M2I2L2', 'Even across all three frameworks'),
    ('M2I2L3', 'Strengths: Leadership'),
    ('M2I3L1', 'Strengths: Impact'),
    ('M2I3L2', 'Strengths: Impact'),
    ('M2I3L3', 'Strengths: Impact & Leadership'),
    ('M3I1L1', 'Strengths: Milestone'),
    ('M3I1L2', 'Strengths: Milestone'),
    ('M3I1L3', 'Strengths: Milestone & Leadership'),
    ('M3I2L1', 'Strengths: Milestone'),
    ('M3I2L2', 'Strengths: Milestone'),
    ('M3I2L3', 'Strengths: Milestone & Leadership'),
    ('M3I3L1', 'Strengths: Milestone & Impact'),
    ('M3I3L2', 'Strengths: Milestone & Impact'),
    ('M3I3L3', 'Even across all three frameworks')
  ) v(k, en)
 where t.key = v.k and p.key = t.profile_key
   and (t.journey_ar, t.title_en) is distinct from (p.journey_ar, p.title_en || ' · ' || v.en);

-- ثلاثة عناوين تعد بما لا تسلّمه الحزمة (الملحق 4 §2-ب)
update leaders.tracks t set title_ar = v.t from (values
  ('M3I1L3', 'مسار القائد التنفيذي نحو إثبات الأثر', 'مسار القائد التنفيذي: من المخرج إلى المنفعة'),
  ('M2I3L2', 'مسار الأثر المؤسسي', 'مسار صانع الأثر: إحكام التنفيذ'),
  ('M3I3L3', 'مسار الريادة الاستراتيجية للأثر', 'مسار الاحتراف الشامل: قرارات التنفيذ تحت الضغط')
) v(k, f, t)
 where t.key = v.k and t.title_ar = v.f;

-- ════════════ 3) المختبرات بالمستوى ════════════
update leaders.lab_items l set audience = v.a from (values
  ('schedule-critical-path', 'all'),
  ('red-gate', 'all'),
  ('risk-register', 'all'),
  ('evm-checkpoint', 'all'),
  ('benefits-map', 'all'),
  ('indicator-check', 'all'),
  ('stakeholder-map', 'all'),
  ('raci-delegation', 'all'),
  ('hard-week', 'all'),
  ('conflict-modes', 'all'),
  ('direct-challenge', 'all'),
  ('portfolio-review', 'granted')
) v(k, a)
 where l.key = v.k and l.audience <> v.a;

-- ════════════ 4) النماذج ════════════
-- الأثر التأسيسي كان نموذجًا واحدًا (سجل المنافع) بلا تدرج؛ نظرية التغيير المخففة (الأثر والسلسلة السببية) نموذجه الثاني، وحقولها التحليلية تبقى للمتوسط فأعلى عبر fieldsFor.
update leaders.learning_models set min_level = 'beginner' where key = 'theory-of-change' and min_level <> 'beginner';
-- مختبر «أنماط إدارة الخلاف» والباب الرابع في تمكين القائد تأسيسيان؛ النموذج كان متوسطًا فيرى المبتدئ المختبر ولا يرى نموذجه.
update leaders.learning_models set min_level = 'beginner' where key = 'conflict-mode' and min_level <> 'beginner';
-- تقرير الأثر غائب عن وثيقة التخرج التي يُقيَّم بها معيار «القيمة والدليل»؛ يدخل الوثيقة للأثر الاحترافي بعد خطة القياس والأدلة (50) وقبل خريطة أصحاب المصلحة (60).
update leaders.learning_models set capstone_sort = 55 where key = 'impact-report' and capstone_sort is null;

select pg_temp.patch_field('theory-of-change', 'chain', '{"hint":"سطر لكل مستوى: الأنشطة، فالمخرجات، فالنتائج، فالأثر، ولكل انتقال الافتراض الذي يجعله صحيحًا"}'::jsonb);
select pg_temp.patch_field('theory-of-change', 'weakest', '{"min_level":"intermediate"}'::jsonb);
select pg_temp.patch_field('theory-of-change', 'test', '{"min_level":"intermediate"}'::jsonb);
select pg_temp.patch_field('impact-report', 'changes', '{"hint":"إن لم يكتمل القياس بعد: القراءة الأولى المتاحة، واذكر تاريخها، وما تتوقعه عند القراءة التالية"}'::jsonb);

select pg_temp.add_field('initiative-charter', '{"key":"trade_off","label":"ما تتنازل عنه الجهة لأجل هذه المبادرة: الموارد والفرص التي تُحجز لها، ومن يتحمل كلفة ذلك","type":"textarea","hint":"مثال: فريق التحول الرقمي يتفرغ لها ستة أشهر، فتتأجل أتمتة المشتريات إلى العام القادم","required":true,"min_level":"advanced"}'::jsonb);
select pg_temp.add_field('benefits-register', '{"key":"realization_curve","label":"منحنى تحقق المنافع: متى تبدأ كل منفعة، ومتى تبلغ ذروتها، وما الذي يجعلها تتآكل بعد الإغلاق","type":"textarea","hint":"منفعة تبلغ ذروتها في الشهر الأول ثم تهبط تحتاج مالكًا ومراجعة غير التي تنمو ببطء","required":true,"min_level":"advanced"}'::jsonb);
select pg_temp.add_field('transformation-story', '{"key":"system_change","label":"ما بقي في الجهة بعدك: ممارسة أو قاعدة أو أداة صارت تعمل دون أن تتدخل، ودليل ذلك","type":"textarea","hint":"القائد المحترف يُقاس بما يستمر بعد خروجه من المبادرة، لا بما أنجزه بنفسه","required":true,"min_level":"advanced"}'::jsonb);
select pg_temp.add_field('stage-gate', '{"key":"sunk_cost","label":"التكلفة الغارقة: ما أُنفق ولا يُسترد، وكيف منعته من التأثير في القرار المقترح","type":"textarea","hint":"السؤال الصحيح عند البوابة: لو بدأنا اليوم من الصفر، هل نموّل ما تبقى؟","required":true,"min_level":"advanced"}'::jsonb);
select pg_temp.add_field('wbs', '{"key":"interfaces","label":"الواجهات: حزم تعتمد على طرف خارج فريقك أو يعتمد عليها، ومن يسلّم ماذا لمن ومتى","type":"textarea","hint":"أغلب التأخير يقع عند الواجهات لا داخل الحزم؛ سمِّ المالك من كل طرف","required":true,"min_level":"advanced"}'::jsonb);
