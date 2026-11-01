-- ════════════════════════════════════════════════════════════════════
-- توحيد نصوص القاعدة (تدقيق 2026-10-31، المرحلة أ: إصلاحات لا تحتاج قرارًا)
-- آمن لإعادة التشغيل: كل تعديل يستبدل عبارة بعينها تختفي بعد أول تشغيل،
-- أو يكتب قيمة ثابتة بمفتاح الصف (key / code)، لا بمعرّفه.
-- أ) tracks.journey_ar: أسماء الأطر الثلاثة كما في قاموس labels.js
--    (إدارة المشروعات / تحويل المشروع إلى أثر / تمكين القائد)، و«الإطار» لا «محور»
-- ب) tracks.focus_ar: حذف نطاق «على مستوى المحفظة / البرامج والمحافظ» من جمل
--    المستوى (خلط المستوى بالنطاق، الملحق 4 §6)
-- ج) questions.help_ar لعبارات الممارسة في الأدوات المفعّلة: نافذة زمنية واحدة
--    «الأشهر الثلاثة الأخيرة» بدل «آخر 12 شهرًا»
-- د) journey_stages وstage_requirements: حذف القالب المكرر في help_ar لبنود
--    النماذج السبعة، والقوس المزدوج، و«المبادرة» بدل «مشروع التطبيق»، و«التوجيه»
--    بدل «الكوتشنغ»، و«كتيبك» و«الأطر»، وإسناد الأدوار الصحيح، وصيغة واحدة
--    لـ«تقييم 360 مختصر»
-- التحقق بعد التطبيق: scripts/db/verify-text-fixes.sql (كل استعلام يعيد 0 صفًا)
-- ════════════════════════════════════════════════════════════════════

-- نسخة لما يتغير، تُؤخذ مرة واحدة قبل أول تشغيل (الصفوف التي تمسها الخطوات أدناه فقط)
create table if not exists leaders.backup_20261101_text_fixes as
  select 'track' kind, key ref, journey_ar a, focus_ar b, null::text c from leaders.tracks
   where journey_ar ~ 'إدارة التنفيذ والمعالم|تحويل المخرجات إلى أثر|قيادة الناس والتغيير|لمحور '
      or focus_ar ~ ' على مستوى (المحفظة|البرامج والمحافظ|المحافظ|البرامج)'
  union all
  select 'question', q.code, q.help_ar, null, null from leaders.questions q
   where q.tier = 'behavior' and q.help_ar ~ '12 شهر|اثني عشر شهر'
     and q.instrument_id in (select id from leaders.instruments where active)
  union all
  select 'stage', key, description_ar, activities_ar, outcome_ar from leaders.journey_stages
   where key in ('profile', 'approval', 'leadership_coaching', 'evaluation')
  union all
  select 'req', code, title_ar, help_ar, null from leaders.stage_requirements
   where code in ('AP-INT', 'P-PROJECT', 'O-MREG', 'O-GATE', 'O-CHAIN', 'L-MAP', 'L-DIRECT', 'T-AGREE', 'S-UPDATE',
                  'T-HB', 'C-MEET', 'T-360', 'L-360A', 'L-360I', 'E-360');
alter table leaders.backup_20261101_text_fixes enable row level security;

-- ════════════ أ) أسماء الأطر في رحلة المسار (27 مسارًا) ════════════
-- الاسم الحالي في النص ← اسم القاموس؛ و«لمحور X» ← «لإطار X» (TERMS.framework)
update leaders.tracks set journey_ar =
  regexp_replace(
  regexp_replace(
  regexp_replace(
  regexp_replace(journey_ar,
    'إدارة التنفيذ والمعالم', 'إدارة المشروعات', 'g'),
    'تحويل المخرجات إلى أثر', 'تحويل المشروع إلى أثر', 'g'),
    'قيادة الناس والتغيير', 'تمكين القائد', 'g'),
    'لمحور ', 'لإطار ', 'g')
 where journey_ar ~ 'إدارة التنفيذ والمعالم|تحويل المخرجات إلى أثر|قيادة الناس والتغيير|لمحور ';

-- ════════════ ب) النطاق في جمل تركيز المستوى المتقدم ════════════
-- «قيادة إثبات الأثر وتقييم أدلته على مستوى المحفظة» ← بلا النطاق،
-- «قيادة التنفيذ على مستوى البرامج والمحافظ» ← بلا النطاق
update leaders.tracks set focus_ar = regexp_replace(focus_ar, ' على مستوى (المحفظة|البرامج والمحافظ|المحافظ|البرامج)', '', 'g')
 where focus_ar ~ ' على مستوى (المحفظة|البرامج والمحافظ|المحافظ|البرامج)';

-- ════════════ ج) نافذة الممارسة الزمنية في الأدوات المفعّلة ════════════
-- البنك الحي (baseline-v4 وpost-v2) يقول «الأشهر الثلاثة الأخيرة» أصلًا؛ الخطوة
-- حارس لأي أداة مفعّلة ما زالت على صيغة «آخر 12 شهرًا» (baseline-v2 غير مفعّلة)
update leaders.questions set help_ar = regexp_replace(help_ar, 'آخر (12|اثني عشر) شهر(ًا|اً|ا)?', 'الأشهر الثلاثة الأخيرة', 'g')
 where tier = 'behavior' and help_ar ~ '12 شهر|اثني عشر شهر'
   and instrument_id in (select id from leaders.instruments where active);

-- ════════════ د) المراحل ════════════
-- «المبادرة» اسم واحد للمشروع الذي يطبّق عليه المشارك (لا «مشروع التطبيق»)
update leaders.journey_stages set
  description_ar = replace(description_ar, 'ليصبح مشروع التطبيق الذي ترافقه طوال البرنامج', 'ليصبح المبادرة التي ترافقها طوال البرنامج'),
  outcome_ar = replace(outcome_ar, 'ومشروع تطبيق محدد', 'ومبادرة محددة')
 where key = 'profile' and (description_ar like '%مشروع التطبيق%' or outcome_ar like '%مشروع تطبيق%');
update leaders.journey_stages set activities_ar = replace(activities_ar, 'ومشروع التطبيق', 'والمبادرة')
 where key = 'approval' and activities_ar like '%مشروع التطبيق%';
-- «التوجيه» لا «الكوتشنغ» (TERMS.coaching)، وصيغة واحدة لتقييم 360 بلا شرط في النص (الشرط من level)
update leaders.journey_stages set
  description_ar = replace(description_ar, 'الاتحاد الدولي للكوتشنغ', 'الاتحاد الدولي للتوجيه'),
  activities_ar = replace(activities_ar, 'تقييم 360 درجة مختصر من مديرك وزملائك وفريقك (للمستويين المتوسط والاحترافي)', 'تقييم 360 مختصر من مديرك وزملائك وفريقك')
 where key = 'leadership_coaching' and (description_ar like '%الكوتشنغ%' or activities_ar like '%تقييم 360 درجة%');
-- «الأطر» لا «المحاور» (TERMS.framework)
update leaders.journey_stages set activities_ar = replace(activities_ar, 'على المحاور نفسها', 'على الأطر نفسها')
 where key = 'evaluation' and activities_ar like '%المحاور نفسها%';

-- ════════════ د) المتطلبات ════════════
-- القوس المزدوج: الواجهة تلحق «(اختياري)» بكل بند غير مطلوب، و«عند الحاجة» باقية في help_ar
update leaders.stage_requirements set title_ar = 'مقابلة التحقق مع المستشار'
 where code = 'AP-INT' and title_ar <> 'مقابلة التحقق مع المستشار';
update leaders.stage_requirements set title_ar = 'تسمية المبادرة ووصفها في سطرين'
 where code = 'P-PROJECT' and title_ar <> 'تسمية المبادرة ووصفها في سطرين';

-- بنود النماذج السبعة: البند يفتح النموذج نفسه، وحالة التقييم تظهر في شارته،
-- و«فصل في وثيقة مبادرتك» تظهر داخل النموذج؛ فيبقى في help_ar ما يميز البند وحده
update leaders.stage_requirements set help_ar = v.help
  from (values
    ('O-MREG',   'معالم القرار ونقاط التحكم لمشروعك.'),
    ('O-GATE',   'ورقة قرار لبوابة مرحلة حقيقية في مشروعك.'),
    ('O-CHAIN',  'سلسلة من مخرجات مشروعك إلى أثره، مع افتراضات كل حلقة.'),
    ('L-MAP',    'تبني على مسودة التدريب بما تغيّر في مواقف أصحاب المصلحة ونفوذهم.'),
    ('L-DIRECT', 'على تحدٍّ حقيقي في مشروعك.'),
    ('T-AGREE',  'قبل اليوم الأول من التدريب.'),
    ('S-UPDATE', 'حدّث سجل المنافع بالقراءات الفعلية، ثم ارفع تصديره هنا.')
  ) as v(code, help)
 where stage_requirements.code = v.code and stage_requirements.help_ar is distinct from v.help;

-- «كتيبك» كما في عنوان البند نفسه («قراءة كتيبك الشخصي»)
update leaders.stage_requirements set help_ar = replace(help_ar, 'اقرأ أبواب كتابك كاملة', 'اقرأ أبواب كتيبك كاملة')
 where code = 'T-HB' and help_ar like '%كتابك%';

-- الأدوار: الجلسة الاستشارية مع الخبير لا المستشار، ورابط 360 يرسله الموجّه في المراحل كلها
update leaders.stage_requirements set help_ar = 'يُسجَّل حضورك بعد انعقاد الجلسة.'
 where code = 'C-MEET' and help_ar is distinct from 'يُسجَّل حضورك بعد انعقاد الجلسة.';
update leaders.stage_requirements set help_ar = replace(help_ar, 'يرسل لك المستشار رابطًا', 'يرسل لك الموجّه رابطًا')
 where code = 'T-360' and help_ar like '%يرسل لك المستشار%';

-- صيغة واحدة: «تقييم 360 مختصر» (لا «360 درجة» ولا «قبلي/بعدي»)، ومن يُدعى بين قوسين
update leaders.stage_requirements set title_ar = v.title
  from (values
    ('T-360',  'تقييم 360 مختصر قبل البرنامج (المدير والزملاء)'),
    ('L-360I', 'تقييم 360 مختصر (المدير والزملاء)'),
    ('L-360A', 'تقييم 360 مختصر (المدير والزملاء والفريق)'),
    ('E-360',  'تقييم 360 مختصر بعد البرنامج')
  ) as v(code, title)
 where stage_requirements.code = v.code and stage_requirements.title_ar <> v.title;
update leaders.stage_requirements set help_ar = 'ادعُ الأشخاص أنفسهم إن أمكن لتُقارن النتيجتان.'
 where code = 'E-360' and help_ar is distinct from 'ادعُ الأشخاص أنفسهم إن أمكن لتُقارن النتيجتان.';
