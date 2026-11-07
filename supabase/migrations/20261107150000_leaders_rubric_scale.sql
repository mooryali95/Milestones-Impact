-- ════════════════════════════════════════════════════════════════
-- السلّم الرباعي الموحد لتقدير النماذج (D08 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: deferred بقرار D08، بعد عدّ التقييمات القائمة على الإنتاج قراءةً وإقرار المالك جدول التحويل
-- يحوّل ما قُيّم بالسلّم الخماسي السابق بالجدول المعتمد (1←1، 2←2، 3←2، 4←3، 5←4)، ثم يضيّق القيد إلى 1..4.
-- التقييم القديم يُعرف من سجله: آخر قيد مراجعة له بلا إصدار سلّم (scale). ما قيّمه الخادم الجديد يحمل الإصدار
-- فلا يمسه التحويل، وكل صف يُحوَّل يُسجَّل في audit_log بقيمته قبل وبعد وإصدار السلّم، فإعادة التشغيل لا تحوّله ثانية.
-- الكود يعمل قبله وبعده: الخادم يحصر الجديد في 1..4، والمستمر يقرأ 5 القديمة «متميز».

with legacy as (
  select s.id, s.rating as old
  from leaders.model_submissions s
  where s.rating is not null
    and coalesce((
      select l.after->>'scale' is not null
      from leaders.audit_log l
      where l.entity = 'model_submissions' and l.entity_id = s.id::text
        and l.action in ('submission.review', 'submission.rescale')
      order by l.created_at desc, l.id desc
      limit 1), false) = false
), moved as (
  update leaders.model_submissions s
  set rating = case legacy.old when 3 then 2 when 4 then 3 when 5 then 4 else legacy.old end
  from legacy
  where s.id = legacy.id
  returning s.id, s.rating
)
insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
select 'system', 'migration:20261107150000', 'submission.rescale', 'model_submissions', moved.id::text,
  jsonb_build_object('rating', legacy.old, 'scale', 0),
  jsonb_build_object('rating', moved.rating, 'scale', 1)
from moved join legacy on legacy.id = moved.id;

alter table leaders.model_submissions drop constraint if exists model_submissions_rating_check;
alter table leaders.model_submissions add constraint model_submissions_rating_check
  check (rating is null or (rating >= 1 and rating <= 4));

insert into leaders.schema_migrations (name) values ('20261107150000_leaders_rubric_scale') on conflict do nothing;
