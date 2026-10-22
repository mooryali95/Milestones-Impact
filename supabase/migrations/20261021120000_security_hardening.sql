-- ════════════════════════════════════════════════════════════════
-- تقوية الأمان (21 أكتوبر 2026) — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. لا يحذف بيانات. القيود NOT VALID: تسري على
-- الصفوف الجديدة فقط، والصفوف الثمانية الحالية سليمة أصلًا (فُحصت).

begin;

-- ── 1. طلبات التواصل: الإدراج العام يبقى، والتلاعب يُمنع ──

-- حدود الأطوال والتنسيق. البريد بلا علامات تكسر HTML أو JavaScript.
alter table public.contact_requests drop constraint if exists contact_requests_len_chk;
alter table public.contact_requests add constraint contact_requests_len_chk check (
  char_length(product) <= 40
  and char_length(name) between 1 and 120
  and char_length(organization) <= 200
  and char_length(interest) <= 40
  and coalesce(char_length(interest_label), 0) <= 200
  and coalesce(char_length(context), 0) <= 4000
  and coalesce(char_length(source_url), 0) <= 1024
  and coalesce(char_length(user_agent), 0) <= 512
  and coalesce(char_length(language), 0) <= 35
) not valid;

alter table public.contact_requests drop constraint if exists contact_requests_email_chk;
alter table public.contact_requests add constraint contact_requests_email_chk check (
  char_length(email) <= 254
  and email ~* '^[^@\s<>"''();,]+@[^@\s<>"''();,]+\.[a-z]{2,}$'
) not valid;

alter table public.contact_requests drop constraint if exists contact_requests_phone_chk;
alter table public.contact_requests add constraint contact_requests_phone_chk check (
  phone ~ '^[0-9٠-٩+() -]{0,30}$'
) not valid;

alter table public.contact_requests drop constraint if exists contact_requests_status_chk;
alter table public.contact_requests add constraint contact_requests_status_chk check (
  status in ('new', 'read', 'replied', 'archived')
) not valid;

-- الزائر لا يختار الحالة ولا المعرّف ولا التاريخ، وحدّ للإغراق:
-- 3 طلبات لكل بريد في الساعة، و60 طلبًا من الجميع في الساعة.
create or replace function public.contact_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- الدالة تعمل بصلاحية مالكها، فدور المتصل يُقرأ من توكن الطلب لا من current_user.
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
       in ('anon', 'authenticated') then
    new.id         := gen_random_uuid();
    new.created_at := now();
    new.status     := 'new';
    new.email      := lower(trim(new.email));
    if (select count(*) from public.contact_requests
        where lower(email) = new.email and created_at > now() - interval '1 hour') >= 3 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    if (select count(*) from public.contact_requests
        where created_at > now() - interval '1 hour') >= 60 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.contact_requests_guard() from public, anon, authenticated;

drop trigger if exists contact_requests_guard on public.contact_requests;
create trigger contact_requests_guard before insert on public.contact_requests
  for each row execute function public.contact_requests_guard();

create index if not exists contact_requests_created_idx on public.contact_requests (created_at desc);

-- anon يدرج فقط: لا قراءة ولا تعديل ولا حذف حتى لو أُضيفت سياسة بالخطأ لاحقًا.
revoke all on public.contact_requests from anon;
grant insert on public.contact_requests to anon;

-- ── 2. جداول الإدارة والجلسات: لا صلاحية للمفتاح العام إطلاقًا ──
-- RLS يحجبها اليوم، وهذا خط دفاع ثانٍ إن عُطّل RLS أو أُضيفت سياسة خاطئة.
-- كل الوصول إليها عبر دوال الحافة بمفتاح service_role الذي لا يتأثر.
revoke all on public.admin_users, public.admin_roles, public.admin_role_permissions,
              public.admin_audit_log, public.api_sessions, public.email_otps,
              public.totp_attempts, public.registrations, public.reports
  from anon;

-- المحتوى العام: قراءة فقط.
revoke all on public.app_content, public.process_details from anon;
grant select on public.app_content, public.process_details to anon;

-- TRUNCATE يتجاوز RLS كليًا؛ لا يحتاجه أي تطبيق.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 3. رموز الدخول القديمة كانت نصًا صريحًا؛ الدالة الجديدة تحفظ الهاش ──
-- شغّل هذا السطر بعد نشر admin-api الجديدة (يُبطل رموزًا عمرها دقائق فقط):
-- delete from public.email_otps where created_at < now();

commit;
