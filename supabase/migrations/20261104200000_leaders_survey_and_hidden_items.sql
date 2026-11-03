-- قاعدة «كل بند يكتمل من مصدره ويُدار حيًا» (خطة الملاحظات v2، البند 5):
-- 1) نوع متطلب «استبانة»: أسئلة يحررها الأدمن، يكتمل بإرسال الإجابات (تُحفظ مع تقدّم المشارك).
alter table leaders.stage_requirements drop constraint if exists stage_requirements_kind_check;
alter table leaders.stage_requirements add constraint stage_requirements_kind_check check (kind = any (array[
  'check','upload','form','meeting','reading','auto','video','workshop','coaching','curriculum','model','capstone','survey']));
alter table leaders.participant_requirements add column if not exists answers jsonb;
-- 2) إخفاء بنود من رحلة دفعة بعينها: تختفي من رحلات أعضائها فورًا، وما أُنجز يبقى في السجل.
alter table leaders.cohorts add column if not exists hidden_requirements text[] not null default '{}';
-- 3) «رأيك في أيام التدريب» استبانة فعلية بدل «أنجزته».
update leaders.stage_requirements
   set kind = 'survey',
       config = jsonb_build_object('questions',
         'ما مدى إفادتك من أيام التدريب لمشروعك؟' || chr(10) ||
         'ما مدى وضوح المحتوى وتنظيمه؟' || chr(10) ||
         'ما مدى كفاءة المدرب في الشرح والتفاعل؟' || chr(10) ||
         'ما مدى استعدادك لتطبيق ما تعلمته الآن؟' || chr(10) ||
         '(نص) ما أكثر ما أفادك؟' || chr(10) ||
         '(نص اختياري) ما الذي تقترح تحسينه للدفعات القادمة؟')
 where code = 'T-REACT' and kind = 'check';
