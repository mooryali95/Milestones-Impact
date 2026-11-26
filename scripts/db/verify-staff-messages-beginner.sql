-- تحقق الترحيلات 20261129130000 و20261129140000 و20261129150000 على القاعدة الحية (قراءة فقط)
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده
-- 1) أعمدة صندوق الخبير والمنسق في جدولي الإشعارات والتفضيلات
select count(*) = 8 as ok, 'موجود ' || count(*) || ' من 8' as detail
  from information_schema.columns where table_schema = 'leaders' and (
    (table_name = 'participant_notifications' and column_name in ('expert_id', 'coordinator_id', 'about_participant_id', 'action_until', 'resolved_at'))
 or (table_name = 'participant_mail_prefs' and column_name in ('id', 'expert_id', 'coordinator_id')));
-- 2) قيدا «مالك واحد» موجودان ومتحقق منهما، ومفتاح التفضيلات الأساسي على id
select count(*) = 3 as ok, string_agg(conname || case when convalidated then '' else ' (غير متحقق)' end, '، ' order by conname) as detail
  from pg_constraint where conrelid in ('leaders.participant_notifications'::regclass, 'leaders.participant_mail_prefs'::regclass)
   and ((conname in ('participant_notifications_one_owner', 'participant_mail_prefs_one_owner') and convalidated)
     or (conrelid = 'leaders.participant_mail_prefs'::regclass and contype = 'p' and pg_get_constraintdef(oid) ilike '%(id)%'));
-- 3) الترحيلات الثلاثة في السجل
select count(*) = 3 as ok, 'مسجل ' || count(*) || ' من 3' as detail from leaders.schema_migrations
 where left(name, 14) in ('20261129130000', '20261129140000', '20261129150000');
-- 4) جداول الوثيقة التي صار لها أعمدة للتأسيسي (المتوقع 12)
select count(*) = 12 as ok, 'جداول بأعمدة التأسيسي ' || count(*) || ' من 12' as detail
  from leaders.learning_models m, jsonb_array_elements(m.fields) f
 where f->>'type' = 'table' and f ? 'columns_beginner';
-- 5) جدولا النسخة الاحتياطية للتراجع موجودان ومحميان
select count(*) = 2 as ok, string_agg(c.relname || case when c.relrowsecurity then '' else ' (بلا RLS)' end, '، ') as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'leaders' and c.relname in ('backup_20261129_beginner_columns', 'backup_20261129_beginner_language') and c.relrowsecurity;
