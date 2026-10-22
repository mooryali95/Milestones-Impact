-- ════════════════════════════════════════════════════════════════
-- أكثر من مالك (22 أكتوبر 2026) — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- يرفع قيد المالك الواحد ويضيف milestonesimpact@gmail.com مالكًا.
-- المالكون متساوون: لا يستطيع أحدهم من اللوحة تنزيل الآخر أو تعطيله أو حذفه
-- (admin_owner_guard)، والإضافة والإزالة من هنا فقط. آمن لإعادة التشغيل.

begin;

drop index if exists public.admin_users_one_owner;

-- admin_users.id بلا قيمة افتراضية، فيفشل أي إدراج لا يحدده (ومنه "إضافة مستخدم"
-- في اللوحة). نضبط الافتراضي بحسب نوع العمود.
do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute
   where attrelid = 'public.admin_users'::regclass and attname = 'id';
  if t = 'uuid' then
    execute 'alter table public.admin_users alter column id set default gen_random_uuid()';
  elsif t in ('text', 'character varying') then
    execute 'alter table public.admin_users alter column id set default gen_random_uuid()::text';
  end if;
end $$;

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
