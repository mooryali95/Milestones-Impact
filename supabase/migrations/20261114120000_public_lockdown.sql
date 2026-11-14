-- deploy-gate: tolerant
-- ════════════════════════════════════════════════════════════════
-- إقفال إرث مخطط public (تدقيق الأمان 2026-11-14: D1 وD2 وD3 وD5 وD9)
-- ════════════════════════════════════════════════════════════════
-- الدوال (admin-api وuser-api وsend-otp وleaders-api) تكتب وتقرأ بمفتاح الخدمة، فلا شيء مشروعًا يحتاج ما يُسحب هنا.
-- لا يمس جداول المخطِّط planner_* (منتج آخر على القاعدة نفسها، قراره منفصل)، ولا app_content وprocess_details
-- (تقرؤهما المصفوفة علنًا).
-- إعادة تشغيله آمنة.

-- ── D1: جلسة GoTrue لحساب مدير كانت تقرأ سر TOTP (العامل الوحيد في دخول اللوحة) وتعدّله عبر PostgREST ──
drop policy if exists admin_read_users on public.admin_users;
drop policy if exists super_admin_manage_users on public.admin_users;
drop policy if exists admin_insert_audit on public.admin_audit_log;
drop policy if exists admin_read_audit on public.admin_audit_log;
drop policy if exists admin_read_permissions on public.admin_role_permissions;
drop policy if exists admin_read_roles on public.admin_roles;
drop policy if exists admin_read_contact_requests on public.contact_requests;
drop policy if exists admin_update_contact_requests on public.contact_requests;
-- سياسة ميتة منذ 20261105100000 (لا منحة إدراج للزائر): تُزال فلا توهم بمسار مفتوح
drop policy if exists anon_insert_contact_requests on public.contact_requests;

do $$
declare t text;
begin
  foreach t in array array['admin_users', 'admin_audit_log', 'admin_roles', 'admin_role_permissions', 'api_sessions', 'email_otps',
    'contact_requests', 'registrations', 'reports', 'totp_attempts', 'mail_log', 'admin_passkeys', 'user_passkeys', 'webauthn_challenges'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- دالتا الصلاحية كانتا تخدمان السياسات المحذوفة وحدها
do $$ begin
  revoke execute on function public.get_my_admin_role() from public, anon, authenticated;
exception when undefined_function then null; end $$;
do $$ begin
  revoke execute on function public.has_permission(text, text) from public, anon, authenticated;
exception when undefined_function then null; end $$;

-- ── D2: زيارات الصفحات. الزائر يُدرج الأعمدة السبعة وحدها، بأطوال محدودة، وبحد إدراج في الدقيقة ──
do $$ begin
  alter table public.page_views add constraint page_views_len_chk
    check (coalesce(char_length(device), 0) <= 20 and coalesce(char_length(lang), 0) <= 35);
exception when duplicate_object then null; end $$;

revoke all on public.page_views from anon, authenticated;
grant insert (site, path, title, referrer, visit_id, device, lang) on public.page_views to anon;
-- والتسلسل الذي يولّد معرّف الصف: صراحةً، فلا يعتمد الإدراج على منحة افتراضية تُسحب أدناه
do $$ begin
  if to_regclass('public.page_views_id_seq') is not null then
    grant usage on sequence public.page_views_id_seq to anon;
  end if;
end $$;

-- أقصى ما سُجّل في دقيقة 25 زيارة؛ 600 تتسع لأضعاف الذروة وتوقف الإغراق. الزيارة الزائدة تُهمل ولا تُفشل الصفحة
create or replace function public.page_views_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.page_views where created_at > now() - interval '1 minute') >= 600 then
    return null;
  end if;
  return new;
end $$;
revoke execute on function public.page_views_guard() from public, anon, authenticated;
drop trigger if exists page_views_guard on public.page_views;
create trigger page_views_guard before insert on public.page_views for each row execute function public.page_views_guard();

-- ── D3: الجديد في public لا يُمنح للزائر تلقائيًّا ──
do $$ begin
  alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
  alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
  alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
exception when others then raise notice 'default privileges unchanged: %', sqlerrm; end $$;

-- ── D5: سجلا التدقيق للإضافة فقط. الصيانة المقصودة (حذف بيانات شخصية بطلب صاحبها) تفتحه داخل معاملتها
--    بـ set local leaders.audit_maintenance = 'on' ──
create or replace function leaders.audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('leaders.audit_maintenance', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'سجل التدقيق لا يُعدَّل ولا يُحذف' using errcode = '42501';
end $$;
create or replace function leaders.audit_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'سجل التدقيق لا يُعدَّل ولا يُحذف' using errcode = '42501';
end $$;

drop trigger if exists audit_log_frozen on leaders.audit_log;
create trigger audit_log_frozen before update or delete on leaders.audit_log for each row execute function leaders.audit_append_only();
drop trigger if exists audit_log_no_truncate on leaders.audit_log;
create trigger audit_log_no_truncate before truncate on leaders.audit_log for each statement execute function leaders.audit_no_truncate();
drop trigger if exists admin_audit_log_frozen on public.admin_audit_log;
create trigger admin_audit_log_frozen before update or delete on public.admin_audit_log for each row execute function leaders.audit_append_only();
drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log for each statement execute function leaders.audit_no_truncate();

-- ── D9: جدول نسخة قديم بلا RLS ──
do $$ begin
  if to_regclass('leaders.handbook_modules_backup_20261023') is not null then
    alter table leaders.handbook_modules_backup_20261023 enable row level security;
  end if;
end $$;

insert into leaders.schema_migrations (name) values ('20261114120000_public_lockdown') on conflict do nothing;
