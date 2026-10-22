-- ════════════════════════════════════════════════════════════════
-- أكثر من مالك (22 أكتوبر 2026) — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- يرفع قيد المالك الواحد ويضيف milestonesimpact@gmail.com مالكًا.
-- المالكون متساوون: لا يستطيع أحدهم من اللوحة تنزيل الآخر أو تعطيله أو حذفه
-- (admin_owner_guard)، والإضافة والإزالة من هنا فقط. آمن لإعادة التشغيل.

begin;

drop index if exists public.admin_users_one_owner;

-- admin_users.id مفتاح أجنبي إلى auth.users، فالمعرّف يُؤخذ من حساب Supabase Auth
-- بالبريد نفسه. إن لم يوجد الحساب: Authentication > Users > Add user > Create new user
-- (البريد، أي كلمة مرور قوية، وفعّل Auto Confirm User)، ثم شغّل هذا الملف.
do $$
begin
  if not exists (select 1 from auth.users where lower(email) = 'milestonesimpact@gmail.com') then
    raise exception 'أنشئ milestonesimpact@gmail.com أولًا من Authentication > Users ثم أعد التشغيل';
  end if;
end $$;

-- إن كان مسجّلًا مديرًا يُرفع إلى مالك، وإلا يُضاف بمعرّف حسابه في Auth.
update public.admin_users
   set is_owner = true, role_id = 'super_admin', is_active = true
 where lower(email) = 'milestonesimpact@gmail.com';

insert into public.admin_users (id, name, email, role_id, is_active, is_owner)
select u.id, 'Milestone Impact', 'milestonesimpact@gmail.com', 'super_admin', true, true
  from auth.users u
 where lower(u.email) = 'milestonesimpact@gmail.com'
   and not exists (select 1 from public.admin_users where lower(email) = 'milestonesimpact@gmail.com');

commit;

-- للتحقق:
-- select name, email, role_id, is_active, is_owner from public.admin_users where is_owner;
--
-- لإزالة مالك لاحقًا (من هنا فقط):
-- update public.admin_users set is_owner = false where lower(email) = lower('البريد');
