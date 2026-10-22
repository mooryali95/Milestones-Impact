-- ════════════════════════════════════════════════════════════════
-- مفاتيح المرور وحماية المالك (22 أكتوبر 2026) — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. لا يحذف بيانات. يُشغَّل قبل نشر admin-api وuser-api الجديدتين.
--
-- النطاق المعتمد للمفاتيح (RP ID) هو sunkvalue.com، فمفتاح المدير يعمل في
-- admin.sunkvalue.com وفي دخول المستشار داخل matrix.sunkvalue.com معًا.
-- منصة القادة لها مفاتيحها المستقلة في leaders.passkeys.

begin;

-- ── 1. أعمدة الحساب ──
-- is_owner: المالك. لا يُعدَّل دوره ولا يُعطَّل ولا يُحذف إلا من SQL Editor.
-- passkey_only: الدخول بمفتاح المرور وحده، فلا يُقبل رمز البريد ولا تطبيق المصادقة.
alter table public.admin_users add column if not exists is_owner     boolean not null default false;
alter table public.admin_users add column if not exists passkey_only boolean not null default false;

-- يجوز أكثر من مالك (20261022110000_multiple_owners.sql). كل مالك محمي من الآخر،
-- وإضافة مالك أو إزالته من SQL Editor فقط.

-- ── 2. مفاتيح المدراء والمشاركين ──
-- نوع المعرّف يُقرأ من الجدول الأصلي كي يصح المفتاح الأجنبي أيًّا كان.
do $$
declare admin_t text; reg_t text;
begin
  select format_type(atttypid, atttypmod) into admin_t from pg_attribute
   where attrelid = 'public.admin_users'::regclass and attname = 'id';
  select format_type(atttypid, atttypmod) into reg_t from pg_attribute
   where attrelid = 'public.registrations'::regclass and attname = 'id';

  execute format($t$
    create table if not exists public.admin_passkeys (
      id            uuid primary key default gen_random_uuid(),
      admin_id      %s not null references public.admin_users(id) on delete cascade,
      credential_id text not null unique,          -- base64url
      public_key    bytea not null,                -- COSE
      sign_count    bigint not null default 0,
      transports    text[],
      aaguid        text,
      backed_up     boolean not null default false,
      device_label  text check (char_length(device_label) <= 80),
      created_at    timestamptz not null default now(),
      last_used_at  timestamptz
    )$t$, admin_t);

  execute format($t$
    create table if not exists public.user_passkeys (
      id              uuid primary key default gen_random_uuid(),
      registration_id %s not null references public.registrations(id) on delete cascade,
      credential_id   text not null unique,
      public_key      bytea not null,
      sign_count      bigint not null default 0,
      transports      text[],
      aaguid          text,
      backed_up       boolean not null default false,
      device_label    text check (char_length(device_label) <= 80),
      created_at      timestamptz not null default now(),
      last_used_at    timestamptz
    )$t$, reg_t);
end $$;

create index if not exists admin_passkeys_admin_idx on public.admin_passkeys (admin_id);
create index if not exists user_passkeys_reg_idx    on public.user_passkeys (registration_id);

-- تحديات WebAuthn قصيرة العمر، تُستهلك مرة واحدة. subject فارغ عند الدخول.
create table if not exists public.webauthn_challenges (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('admin', 'user')),
  purpose     text not null check (purpose in ('register', 'authenticate')),
  subject     text,
  challenge   text not null unique,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists webauthn_challenges_created_idx on public.webauthn_challenges (created_at);

alter table public.admin_passkeys      enable row level security;
alter table public.user_passkeys       enable row level security;
alter table public.webauthn_challenges enable row level security;
revoke all on public.admin_passkeys, public.user_passkeys, public.webauthn_challenges from anon, authenticated;

-- ── 3. حماية المالك على مستوى القاعدة ──
-- حتى لو سُرق مفتاح service_role أو جلسة مدير عام، لا يمكن عبر الواجهات
-- تنزيل المالك أو تعطيله أو تغيير بريده أو حذفه أو تعيين مالك آخر.
-- الاستثناء الوحيد: postgres من SQL Editor، أي من يملك حساب Supabase نفسه.
-- الدالة ليست SECURITY DEFINER عمدًا، فـ current_user هو دور المتصل الفعلي.
create or replace function public.admin_owner_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_owner then raise exception 'owner_protected' using errcode = 'P0001'; end if;
    return old;
  end if;
  if new.is_owner and (tg_op = 'INSERT' or not old.is_owner) then
    raise exception 'owner_protected' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and (
       not new.is_owner
       or new.role_id   is distinct from old.role_id
       or new.is_active is distinct from old.is_active
       or lower(new.email) is distinct from lower(old.email)) then
    raise exception 'owner_protected' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.admin_owner_guard() from public, anon, authenticated;

drop trigger if exists admin_owner_guard on public.admin_users;
create trigger admin_owner_guard before insert or update or delete on public.admin_users
  for each row execute function public.admin_owner_guard();

commit;

-- ── 4. عيّن نفسك مالكًا (مرة واحدة، ضع بريدك) ──
-- update public.admin_users set is_owner = true, role_id = 'super_admin', is_active = true
--  where lower(email) = lower('ضع_بريدك_هنا');
--
-- ── الاسترداد إن فقدت كل أجهزتك (من SQL Editor فقط) ──
-- update public.admin_users set passkey_only = false where is_owner;
