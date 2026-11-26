-- تحقق الترحيلين 20261130010000 و20261130020000 على القاعدة الحية (قراءة فقط)
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده
-- 1) الأعمدة الثلاثة موجودة
select count(*) = 3 as ok, 'موجود ' || count(*) || ' من 3' as detail from information_schema.columns
 where table_schema = 'leaders' and ((table_name = 'questions' and column_name = 'core')
    or (table_name = 'assessments' and column_name in ('post_form', 'served_count')));
-- 2) الترحيلان في السجل
select count(*) = 2 as ok, 'مسجل ' || count(*) || ' من 2' as detail from leaders.schema_migrations
 where left(name, 14) in ('20261130010000', '20261130020000');
-- 3) لا فقرة معلّمة نواة بعد (التعليم ينتظر اعتماد المالك للقائمة)
select count(*) = 0 as ok, 'فقرات نواة ' || count(*) as detail from leaders.questions where core;
