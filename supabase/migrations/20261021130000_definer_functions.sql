-- ════════════════════════════════════════════════════════════════
-- دوال SECURITY DEFINER (21 أكتوبر 2026) — يُشغَّل مرّة في SQL Editor
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل.

begin;

-- ── 1. sspdf.bootstrap_admin ──
-- كان أي مستخدم مسجّل يستطيع أن يصير مديرًا لأي مشروع ليس فيه مدير
-- مربوط بحساب. الآن: لا يُربط إلا من دُعي مديرًا ببريده نفسه.
create or replace function sspdf.bootstrap_admin(p_project uuid, p_name text default 'Admin')
returns void
language plpgsql
security definer
set search_path to 'sspdf', 'public'
as $function$
declare v_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if exists (
    select 1 from sspdf.project_members
    where project_id = p_project and user_id is not null and role = 'admin'
  ) then
    raise exception 'project already has a linked admin';
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  update sspdf.project_members
     set user_id = auth.uid(), display_name = coalesce(p_name, display_name, 'Admin')
   where project_id = p_project and role = 'admin' and user_id is null
     and v_email is not null and lower(email) = v_email;
  if not found then
    raise exception 'not invited as admin of this project';
  end if;
end $function$;

revoke all on function sspdf.bootstrap_admin(uuid, text) from public, anon;
grant execute on function sspdf.bootstrap_admin(uuid, text) to authenticated;

-- ── 2. public.planner_lookup_user_by_email ──
-- كانت تكشف لأي زائر هل البريد مسجّل ومعتمد ومعرّفه. الآن للمعتمَدين فقط.
create or replace function public.planner_lookup_user_by_email(lookup_email text)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select id from public.planner_profiles
  where email = lookup_email and status = 'approved'
    and public.planner_is_approved(auth.uid())
  limit 1;
$function$;

revoke all on function public.planner_lookup_user_by_email(text) from public, anon;
grant execute on function public.planner_lookup_user_by_email(text) to authenticated;

-- ── 3. search_path ثابت للدوال التي بلا مسار ──
-- دالة SECURITY DEFINER بلا search_path قد تُخدع بجدول بالاسم نفسه في مخطط آخر.
alter function public.planner_check_otp_rate(text)          set search_path = public, pg_temp;
alter function public.planner_log_otp_attempt(text, boolean) set search_path = public, pg_temp;
alter function public.planner_handle_new_user()             set search_path = public, pg_temp;

commit;

-- للمراجعة: مشاريع SSPDF بلا مدير مربوط (هي وحدها المتأثرة بالبند 1).
-- select p.id, p.name, (select string_agg(coalesce(m.email,'(بلا بريد)'), ', ')
--   from sspdf.project_members m where m.project_id = p.id and m.role = 'admin') as admin_invites
-- from sspdf.projects p
-- where not exists (select 1 from sspdf.project_members m
--                   where m.project_id = p.id and m.role = 'admin' and m.user_id is not null);
