-- ════════════════════════════════════════════════════════════════
-- إغلاق الحلقة (المرحلة ب): مستوى الفقرة الأدنى ومكتسبات المستوى
-- ════════════════════════════════════════════════════════════════
-- min_level: فقرة لا تُقدَّم في القياس البعدي إلا لمن اعتُمد مستواه في بُعدها
-- عند هذا المستوى أو فوقه (null = للجميع). القياس المبدئي لا يستعملها.
-- نتائج هذه الفقرات تُحفظ منفصلة في assessment_results (level_gain_*) باسم
-- «مكتسبات المستوى»، ولا تدخل في نسب المعرفة والمواقف التي تُقارن بالمبدئي.
alter table leaders.questions add column if not exists min_level text;
alter table leaders.questions drop constraint if exists questions_min_level_check;
alter table leaders.questions add constraint questions_min_level_check
  check (min_level in ('beginner', 'intermediate', 'advanced'));
comment on column leaders.questions.min_level is 'أدنى مستوى معتمد في البُعد تُقدَّم عنده الفقرة في البعدي (null للجميع)';

alter table leaders.assessment_results add column if not exists level_gain_pct   numeric(5,2);  -- مكتسبات المستوى: النسبة على فقرات المستوى المقدَّمة
alter table leaders.assessment_results add column if not exists level_gain_n     integer;       -- عدد فقرات المستوى المجابة
alter table leaders.assessment_results add column if not exists level_gain_level text;          -- أعلى مستوى قُدِّمت فقراته
