-- ════════════════════════════════════════════════════════════════
-- أكثر من مالك (22 أكتوبر 2026) — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- يرفع قيد المالك الواحد ويضيف milestonesimpact@gmail.com مالكًا.
-- المالكون متساوون: لا يستطيع أحدهم من اللوحة تنزيل الآخر أو تعطيله أو حذفه
-- (admin_owner_guard)، والإضافة والإزالة من هنا فقط. آمن لإعادة التشغيل.

begin;

drop index if exists public.admin_users_one_owner;

-- إن كان البريد مسجّلًا يُرفع إلى مالك، وإلا يُضاف حسابًا جديدًا.
update public.admin_users
   set is_owner = true, role_id = 'super_admin', is_active = true
 where lower(email) = 'milestonesimpact@gmail.com';

insert into public.admin_users (name, email, role_id, is_active, is_owner)
select 'Milestone Impact', 'milestonesimpact@gmail.com', 'super_admin', true, true
 where not exists (select 1 from public.admin_users where lower(email) = 'milestonesimpact@gmail.com');

commit;

-- للتحقق:
-- select name, email, role_id, is_active, is_owner from public.admin_users where is_owner;
--
-- لإزالة مالك لاحقًا (من هنا فقط):
-- update public.admin_users set is_owner = false where lower(email) = lower('البريد');
