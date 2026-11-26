-- تحقق الترحيل 20261129160000 على القاعدة الحية (قراءة فقط). يُشغَّل قبل التطبيق ليرى المالك ما سيُحذف، وبعده للتأكد
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده
-- 1) عضويات مجموعات عالقة سيحذفها الترحيل (قبل التطبيق: العدد للعرض على المالك؛ بعده المتوقع 0)
select count(*) = 0 as ok, 'عالقة ' || count(*) || ' لـ' || count(distinct m.participant_id) || ' مشارك في ' || count(distinct m.cohort_id) || ' دفعة' as detail
  from leaders.cohort_group_members m
 where not exists (select 1 from leaders.enrollments e where e.participant_id = m.participant_id and e.cohort_id = m.cohort_id and e.status <> 'withdrawn')
   and exists (select 1 from leaders.enrollments e join leaders.cohorts c on c.id = e.cohort_id
                where e.participant_id = m.participant_id and e.cohort_id <> m.cohort_id and e.status <> 'withdrawn');
-- 2) عضويات بلا تسجيل صريح في دفعتها ولا تسجيل آخر (أعضاء الجهة بالتبعية): لا يمسها الترحيل، ويحكمها الفلتر الدفاعي بالدفعة الفعلية
select true as ok, 'بلا تسجيل صريح ' || count(*) as detail
  from leaders.cohort_group_members m
 where not exists (select 1 from leaders.enrollments e where e.participant_id = m.participant_id and e.status <> 'withdrawn');
-- 3) أدوار القاعة في دفعة غير دفعة التسجيل النشط (للعلم؛ يحذفها النقل من الآن ولا يمسها الترحيل)
select true as ok, 'أدوار في دفعة قديمة ' || count(*) as detail
  from leaders.cohort_roles r
 where not exists (select 1 from leaders.enrollments e where e.participant_id = r.participant_id and e.cohort_id = r.cohort_id and e.status <> 'withdrawn')
   and exists (select 1 from leaders.enrollments e where e.participant_id = r.participant_id and e.cohort_id <> r.cohort_id and e.status <> 'withdrawn');
-- 4) الترحيل في السجل، ونسخته محمية، وسطر السجل بالعدد (بعد التطبيق)
select count(*) = 1 as ok, 'مسجل ' || count(*) || ' من 1' as detail from leaders.schema_migrations
 where name = '20261129160000_leaders_group_members_cleanup';
select count(*) = 1 as ok, string_agg(c.relname || case when c.relrowsecurity then '' else ' (بلا RLS)' end, '، ') as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'leaders' and c.relname = 'backup_20261129_group_members_cleanup' and c.relrowsecurity;
select true as ok, coalesce(max(after->>'deleted'), 'لا سطر (لا شيء حُذف أو لم يُطبَّق)') as detail
  from leaders.audit_log where action = 'group_members.cleanup';
