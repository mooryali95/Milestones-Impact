-- deploy-gate: tolerant قبله يرد admin-api على غياب الدالة أو العمود بالمسار السابق (تسجيل المحاولة ثم العد، وقبول الرمز بلا مقارنة خطوة)، فلا ينقطع الدخول
-- ════════════════════════════════════════════════════════════════
-- دخول الإدارة: حجز المحاولة ذريًا، ومنع إعادة رمز تطبيق المصادقة (تقرير الأمن 2026-11-27، الثغرتان 1 و2)
-- ════════════════════════════════════════════════════════════════
-- 1) public.admin_login_attempt تقفل على البريد (pg_advisory_xact_lock)، وتعد الفاشلة خلال النافذة لهذا العنوان وللبريد كله،
--    فإن بلغت الحد ردت null، وإلا سجلت المحاولة الحالية فاشلة وأعادت معرّفها. يُفحص الرمز بعدها، والنجاح يحدّث السطر نفسه.
--    فالطلبات المتزامنة تُسلسل على البريد، ولا يُفحص منها أكثر من الحد. والحدود يمررها admin-api كما هي (5 للعنوان، 20 للبريد).
-- 2) admin_users.totp_last_step آخر خطوة زمنية قُبلت لرمز تطبيق المصادقة. يقبل admin-api الرمز فقط إن نجح تحديث مشروط
--    بأن خطوته أكبر من المخزنة، فلا يُقبل الرمز نفسه مرتين لأي غرض. ويُصفَّر مع كل سر جديد. عمود جديد بلا قيمة، آمن لإعادة التشغيل.

alter table public.admin_users add column if not exists totp_last_step bigint;
comment on column public.admin_users.totp_last_step is 'آخر خطوة TOTP (30 ثانية) قُبلت؛ لا يُقبل رمز خطوته أصغر منها أو مساوية';

create index if not exists totp_attempts_email_created_idx on public.totp_attempts (email, created_at);

create or replace function public.admin_login_attempt(p_email text, p_ip text, p_max_ip integer, p_max_all integer, p_window_s integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare n_all integer; n_ip integer; aid uuid;
begin
  if p_email is null or p_email = '' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin.login:' || p_email, 0));
  select count(*), count(*) filter (where a.ip = p_ip) into n_all, n_ip
  from public.totp_attempts a
  where a.email = p_email and a.success = false and a.created_at >= now() - make_interval(secs => p_window_s);
  if n_all >= p_max_all or n_ip >= p_max_ip or (nullif(p_ip, '') is null and n_all >= p_max_ip) then return null; end if;
  insert into public.totp_attempts (email, success, ip) values (p_email, false, nullif(p_ip, '')) returning id into aid;
  return aid;
end;
$$;

revoke all on function public.admin_login_attempt(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_login_attempt(text, text, integer, integer, integer) to service_role;

insert into leaders.schema_migrations (name) values ('20261130040000_admin_login_attempts_atomic') on conflict do nothing;
