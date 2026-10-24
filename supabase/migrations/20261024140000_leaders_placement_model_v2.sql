-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: معيار التسكين المعايَر
-- ════════════════════════════════════════════════════════════════
-- معايرة بمحاكاة 18 ألف استجابة على بنك baseline-v3:
--   الأوزان 35 معرفة، 50 مواقف، 15 ممارسة: المواقف أصدق تنبؤًا بالأداء،
--     والممارسة تقدير ذاتي يتضخم فلا يرفع المستوى وحده.
--   حد الجانب الأضعف للمتوسط 40 بدل 25: فوق نسبة التخمين (25%)،
--     فلا يبلغ المتوسط من يخمّن ويجيب "دائمًا" (من 20% إلى 6%).
--   حد الجانب الأضعف للاحترافي 60 بدل 50.
--   الهامش الحدّي 8 بدل 5: قريب من خطأ القياس لستة أسئلة في الجانب.
-- يُحدَّث الصف فقط إن كان على القيم الافتراضية القديمة، فلا يكتب فوق
-- ما ضُبط من لوحة الإدارة. وتبقى الأرقام قابلة للتعديل من هناك.

alter table leaders.placement_model
  alter column w_knowledge        set default 35,
  alter column w_skill            set default 50,
  alter column w_behavior         set default 15,
  alter column floor_intermediate set default 40,
  alter column floor_advanced     set default 60,
  alter column borderline         set default 8;

update leaders.placement_model
   set w_knowledge = 35, w_skill = 50, w_behavior = 15,
       floor_intermediate = 40, floor_advanced = 60, borderline = 8
 where id = 1
   and (w_knowledge, w_skill, w_behavior, min_intermediate, min_advanced, floor_intermediate, floor_advanced, borderline)
     = (30, 45, 25, 55, 80, 25, 50, 5);

notify pgrst, 'reload schema';
