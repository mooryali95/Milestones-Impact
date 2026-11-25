-- قراءة فقط: نصوص فصول وثيقة المبادرة كما هي في الإنتاج (العنوان والملخص ومتى والخطوات، ولكل حقل: التسمية والتلميح والأعمدة والخيارات).
-- يخدم تدقيق اللغة: docs/content/2026-11-24-تدقيق-لغة-المبادرة-ومحتواها-v1.md (الملحق ب). لا يكتب شيئًا.
-- سطر لكل فصل، والحقول مفصولة بـ « ¦ »، ومكونات الحقل بـ « ‖ ».
select true as ok,
  m.key || ' · ' || coalesce(m.title_ar, '-')
  || ' ⟫ ملخص: ' || coalesce(m.summary_ar, '-')
  || ' ⟫ متى: ' || coalesce(m.when_ar, '-')
  || ' ⟫ خطوات: ' || replace(coalesce(m.steps_ar, '-'), E'\n', ' / ')
  || ' ⟫ حقول: ' || coalesce((
       select string_agg(
         (f->>'key') || ' ‖ ' || coalesce(f->>'label', '-')
         || case when coalesce(f->>'hint', '') <> '' then ' ‖ تلميح: ' || (f->>'hint') else '' end
         || case when coalesce(f->>'placeholder', '') <> '' then ' ‖ مثال: ' || (f->>'placeholder') else '' end
         || case when f ? 'columns' then ' ‖ أعمدة: ' || (select string_agg(c, '، ') from jsonb_array_elements_text(f->'columns') c) else '' end
         || case when f ? 'options' then ' ‖ خيارات: ' || (select string_agg(c, '، ') from jsonb_array_elements_text(f->'options') c) else '' end,
         ' ¦ ' order by o)
       from jsonb_array_elements(m.fields) with ordinality e(f, o)), '-') as detail
from leaders.learning_models m
where m.key in ('initiative-charter','options-analysis','evidence-plan','wbs','schedule','cost-plan','procurement','roadmap','governance','raid','change-sustain','transformation-story',
                'benefits-register','milestone-register','theory-of-change','stakeholder-map','stage-gate','impact-report','portfolio-review','development-plan')
order by m.dimension, m.sort;
