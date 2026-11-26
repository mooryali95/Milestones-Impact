-- deploy-gate: tolerant محتوى نماذج فقط. يضيف إلى اثني عشر جدولًا خاصيتين لا تقرؤهما الدوال الأقدم (columns_beginner وlabels_beginner)،
-- فتعرض الجدول كاملًا كما كانت. وmin_rows_beginner تقرؤها الدوال الأقدم أصلًا، وهي لا تزيد صفًا على أحد، فلا تنخفض جاهزية أحد
-- قبل نشر الدوال الجديدة ولا بعد التراجع عنها. إن احتجت المحتوى كما كان فشغّل سطر restore أدناه (RUNBOOK.md §2).
-- ════════════════════════════════════════════════════════════════
-- تخفيف وثيقة المبادرة للتأسيسي، المرحلة 2: أعمدة الجدول وصفوفه بالمستوى
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-تخفيف-المبادرة-للتأسيسي-v1.md §5 (اعتمده المالك 2026-11-26 بالخيار أ وجدول الأعمدة كما هو).
-- columns_beginner: مواضع الأعمدة الظاهرة للتأسيسي في الصف المخزن (من صفر)، وlabels_beginner: عناوينها بلغة بسيطة بالترتيب نفسه.
-- الصف المخزن لا يتغير، والمتوسط والاحترافي لا يتغير لهما شيء (fieldsFor تقرأ الخاصيتين للتأسيسي وحده، ويثبته
-- leaders-app/src/lighten-migration.test.js). ومن كتب في عمود صار مخفيًا يبقى ظاهرًا له وفي وثيقته غير مطلوب (قاعدة «لا فقد»).
-- كل خطوة مشروطة بوجود الفصل والحقل وبعدد أعمدته كما في التصور، فلا تُطبَّق مواضع على جدول أعادت الإدارة صياغة أعمدته.
-- يسري على الدفعات الجارية فورًا (قرار المالك): خفض المطلوب لا ينقص جاهزية أحد. نسخ البرامج (program_versions) لا تجمّد
-- حقول النماذج (لقطتها المراحل والمتطلبات وحدها)، فلا نسخة يُتجاوز تجميدها. آمن لإعادة التشغيل.

-- restore: update leaders.learning_models m set fields = b.b::jsonb from leaders.backup_20261129_beginner_columns b where m.key = b.ref
create table if not exists leaders.backup_20261129_beginner_columns as
  select key ref, fields::text b from leaders.learning_models
   where key in ('initiative-charter', 'options-analysis', 'milestone-register', 'schedule', 'cost-plan', 'impact-report',
                 'stakeholder-map', 'raid', 'theory-of-change', 'benefits-register', 'transformation-story');
alter table leaders.backup_20261129_beginner_columns enable row level security;
revoke all on leaders.backup_20261129_beginner_columns from anon, authenticated;

-- يدمج الخصائص في جدول الفصل إن وُجد بعدد أعمدته المتوقع ولم يحملها بعد
create or replace function pg_temp.bc_patch(mkey text, fkey text, ncols int, patch jsonb)
returns void language sql as $f$
  update leaders.learning_models m
     set fields = (select jsonb_agg(case when f->>'key' = fkey and f->>'type' = 'table' and jsonb_typeof(f->'columns') = 'array'
                                          and jsonb_array_length(f->'columns') = ncols then f || patch else f end order by ord)
                     from jsonb_array_elements(m.fields) with ordinality as e(f, ord))
   where m.key = mkey
     and exists (select 1 from jsonb_array_elements(m.fields) f
                  where f->>'key' = fkey and f->>'type' = 'table' and jsonb_typeof(f->'columns') = 'array' and jsonb_array_length(f->'columns') = ncols)
     and not m.fields @> jsonb_build_array(jsonb_build_object('key', fkey) || patch);
$f$;

-- البطاقة: المخرجات (المخرج، معيار القبول، الموعد) كاملة بعناوين أبسط، وصفان
select pg_temp.bc_patch('initiative-charter', 'deliverables', 3, '{"columns_beginner": [0, 1, 2], "labels_beginner": ["المخرج", "كيف تعرف أنه اكتمل", "الموعد"], "min_rows_beginner": 2}');
-- المبرر والبدائل: الدليل صف واحد، والبدائل عمودان (البديل، الوصف) في صفين
select pg_temp.bc_patch('options-analysis', 'evidence', 3, '{"columns_beginner": [0, 1, 2], "labels_beginner": ["المؤشر", "الرقم اليوم", "المصدر"], "min_rows_beginner": 1}');
select pg_temp.bc_patch('options-analysis', 'options', 5, '{"columns_beginner": [0, 1], "labels_beginner": ["البديل", "مزاياه وعيوبه"], "min_rows_beginner": 2}');
-- سجل المعالم: المعلم، والتاريخ المستهدف (أسبوعًا)، ومعيار التحقق، في أربعة صفوف
select pg_temp.bc_patch('milestone-register', 'milestones', 6, '{"columns_beginner": [0, 2, 5], "labels_beginner": ["المعلم", "الأسبوع", "كيف تتحقق منه"], "min_rows_beginner": 4}');
-- الجدول الزمني: النشاط والبداية والنهاية (بلا رمز ولا اعتماديات)، أربعة صفوف
select pg_temp.bc_patch('schedule', 'activities', 5, '{"columns_beginner": [1, 2, 3], "labels_beginner": ["النشاط", "أسبوع البداية", "أسبوع النهاية"], "min_rows_beginner": 4}');
-- الموارد والتكلفة: البند والإجمالي
select pg_temp.bc_patch('cost-plan', 'items', 5, '{"columns_beginner": [1, 4], "labels_beginner": ["ما تحتاجه", "كلفته التقديرية"], "min_rows_beginner": 3}');
-- تقرير الأثر: التغيير وخط الأساس والقيمة الحالية
select pg_temp.bc_patch('impact-report', 'changes', 4, '{"columns_beginner": [0, 1, 2], "labels_beginner": ["التغيير", "قبل", "بعد"], "min_rows_beginner": 1}');
-- أصحاب المصلحة: صاحب المصلحة، والاهتمام، والتكرار والقناة، ثلاثة صفوف
select pg_temp.bc_patch('stakeholder-map', 'stakeholders', 5, '{"columns_beginner": [0, 2, 4], "labels_beginner": ["الشخص أو الجهة", "ما يهمه", "كيف تتواصل معه"], "min_rows_beginner": 3}');
-- المخاطر: الوصف والاستجابة، ثلاثة صفوف (كانت 4)
select pg_temp.bc_patch('raid', 'items', 8, '{"columns_beginner": [2, 6], "labels_beginner": ["ما قد يعطلك", "ما ستفعله إن حدث"], "min_rows_beginner": 3}');
-- نظرية التغيير: المستوى والوصف، أربعة صفوف
select pg_temp.bc_patch('theory-of-change', 'chain', 3, '{"columns_beginner": [0, 1], "labels_beginner": ["المرحلة", "ماذا يحدث فيها"], "min_rows_beginner": 4}');
-- سجل المنافع: المنفعة والمؤشر وخط الأساس والمستهدف، صفان
select pg_temp.bc_patch('benefits-register', 'benefits', 6, '{"columns_beginner": [0, 1, 2, 3], "labels_beginner": ["المنفعة", "كيف تقيسها", "الرقم اليوم", "المستهدف"], "min_rows_beginner": 2}');
-- قصة التحول: القرار وما تغيّر بسببه، صفان
select pg_temp.bc_patch('transformation-story', 'decisions', 4, '{"columns_beginner": [0, 2], "labels_beginner": ["القرار", "ما الذي تغيّر بسببه"], "min_rows_beginner": 2}');
