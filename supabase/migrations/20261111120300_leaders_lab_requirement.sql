-- ════════════════════════════════════════════════════════════════
-- الرحلة: متطلب «أداة من المختبر» وخريطة عمليات إدارة المشاريع في التدريب (المرحلة الثالثة، قرار المالك 2026-11-11)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تعرف النوع lab قبله وبعده (activityFor وlabStatus في logic.js)، وقبله لا متطلب من هذا النوع فلا يتغير شيء
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261111120300_leaders_lab_requirement)، بعد 20261111120100 (الأداة نفسها).
-- قرار المالك: خطوة إلزامية في مرحلة التدريب لإطار المعلم بعتبة نجاح 70%، ومحاولة استرجاع اختيارية لاحقًا في التوجيه.
--   • stage_requirements_kind_check يقبل lab: يكتمل من محاولات المشارك في الأداة (config: lab_key، وaccept:
--     mastery بلوغ 70% في أفضل محاولة، أو finished إنهاء محاولة، أو spaced محاولة ثانية بعد أسبوعين من الأولى)
--   • المتطلب يفتح أداته لمن يخصه (labVisible)، فلا يلزم منح يدوي، والغائبة أو الموقوفة لا تحبس المرحلة
--   • T-PMMAP في training لإطار المعلم (dimension = milestone بلا مستوى: لكل مشارك)، إلزامي بالإتقان
--   • O-PMMAP في ojt_coaching، اختياري: «أعد بناء الخريطة» بعد أسبوعين على الأقل من أول محاولة
-- يُضاف لكل برنامج فيه المرحلتان، ولا يمس متطلبًا بالرمز نفسه، ولا نسخ البرامج المنشورة (محتوى الدفعة المجمّد). آمن لإعادة التشغيل.
alter table leaders.stage_requirements drop constraint if exists stage_requirements_kind_check;
alter table leaders.stage_requirements add constraint stage_requirements_kind_check check (kind = any (array[
  'check','upload','form','meeting','reading','auto','video','workshop','coaching','curriculum','model','capstone','survey','lab']));

insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, config)
select s.program_id, 'training', 'milestone', null, 'T-PMMAP', 8, $q$خريطة عمليات إدارة المشاريع في المختبر$q$,
       $q$بعد الباب الأول من كتيب المعلم: ابنِ الخريطة الكلاسيكية للعمليات في المختبر، وهي البطاقات نفسها التي في عُدّة الورشة. يكتمل حين تبلغ 70% في أفضل محاولة، ولك أن تعيد المحاولة.$q$,
       'lab', true, false, '{"lab_key": "pm-process-map", "accept": "mastery"}'::jsonb
  from leaders.journey_stages s where s.key = 'training'
on conflict (program_id, code) do nothing;

insert into leaders.stage_requirements (program_id, stage_key, dimension, level, code, sort, title_ar, help_ar, kind, required, needs_review, config)
select s.program_id, 'ojt_coaching', 'milestone', null, 'O-PMMAP', 9, $q$أعد بناء خريطة العمليات بعد أسبوعين$q$,
       $q$محاولة استرجاع اختيارية: أعد بناء الخريطة في المختبر بعد أسبوعين على الأقل من محاولتك الأولى، فالتذكر بعد مدة يثبّت ما تعلمته.$q$,
       'lab', false, false, '{"lab_key": "pm-process-map", "accept": "spaced"}'::jsonb
  from leaders.journey_stages s where s.key = 'ojt_coaching'
on conflict (program_id, code) do nothing;

insert into leaders.schema_migrations (name) values ('20261111120300_leaders_lab_requirement') on conflict do nothing;
