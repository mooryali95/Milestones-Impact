-- تشخيص أعمدة التأسيسي في جداول الوثيقة الاثني عشر على القاعدة الحية (قراءة فقط)
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده
-- 1) كل جدول متوقع: عدد أعمدته في الإنتاج مقابل المتوقع، وهل أخذ columns_beginner
with exp(mkey, fkey, ncols) as (values
  ('initiative-charter', 'deliverables', 3), ('options-analysis', 'evidence', 3), ('options-analysis', 'options', 5),
  ('milestone-register', 'milestones', 6), ('schedule', 'activities', 5), ('cost-plan', 'items', 5),
  ('impact-report', 'changes', 4), ('stakeholder-map', 'stakeholders', 5), ('raid', 'items', 8),
  ('theory-of-change', 'chain', 3), ('benefits-register', 'benefits', 6), ('transformation-story', 'decisions', 4)),
got as (
  select e.mkey, e.fkey, e.ncols, count(f) n, max(jsonb_array_length(f->'columns')) actual, bool_or(f ? 'columns_beginner') has_bc
    from exp e left join leaders.learning_models m on m.key = e.mkey
    left join lateral jsonb_array_elements(m.fields) f on f->>'key' = e.fkey and f->>'type' = 'table'
   group by e.mkey, e.fkey, e.ncols)
select bool_and(coalesce(has_bc, false)) as ok,
       string_agg(mkey || '/' || fkey || ': ' || coalesce(actual::text, 'غائب') || ' من ' || ncols
         || case when has_bc then '' else ' (بلا أعمدة التأسيسي)' end, '، ' order by mkey, fkey) as detail
  from got;
-- 2) أعمدة الجدول الذي لم يأخذها، بأسمائها في الإنتاج
select count(*) = 0 as ok, coalesce(string_agg(m.key || '/' || (f->>'key') || ' = ' || (f->'columns')::text, ' | '), 'لا شيء') as detail
  from leaders.learning_models m, jsonb_array_elements(m.fields) f
 where f->>'type' = 'table' and not (f ? 'columns_beginner')
   and (m.key, f->>'key') in (('initiative-charter', 'deliverables'), ('options-analysis', 'evidence'), ('options-analysis', 'options'),
     ('milestone-register', 'milestones'), ('schedule', 'activities'), ('cost-plan', 'items'), ('impact-report', 'changes'),
     ('stakeholder-map', 'stakeholders'), ('raid', 'items'), ('theory-of-change', 'chain'), ('benefits-register', 'benefits'),
     ('transformation-story', 'decisions'));
