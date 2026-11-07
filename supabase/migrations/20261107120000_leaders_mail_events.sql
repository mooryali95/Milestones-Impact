-- ════════════════════════════════════════════════════════════════
-- العداد الموحد للبريد وطابور الجماعي (D15 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تعدّ بالصيغة القديمة وترسل الجماعي مباشرة إن لم يُطبَّق هذا الترحيل
-- leaders.mail_events: سطر لكل بريد تُرسله الدوال الأربع (leaders-api وuser-api وadmin-api وsend-otp):
-- نوعه ومصدره ومعرّف Resend وحالته ونطاق المستلم والكيان المرتبط، بلا متن ولا رمز ولا عنوان كامل.
-- منه حصة اليوم (نصفها محجوز لرموز الدخول)، ونسب استجابة المقيّمين. يُحذف بعد 180 يومًا.
-- leaders.mail_queue: الجماعي (التذكيرات والملخصات) حين تُحجب حصته، تفرغه المهمة الساعية، وتُكتب علامته بعد الإرسال.
-- لا يقرأ الجدولين إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.mail_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('code', 'alert', 'notify', 'bulk', 'contact')),
  source text not null check (char_length(source) <= 40),
  status text not null check (status in ('sent', 'failed', 'blocked')),
  resend_id text check (char_length(resend_id) <= 100),
  to_domain text check (char_length(to_domain) <= 255),
  ref text check (char_length(ref) <= 100)
);
create index if not exists mail_events_window on leaders.mail_events (created_at desc, status, kind);
create index if not exists mail_events_ref on leaders.mail_events (ref) where ref is not null;
alter table leaders.mail_events enable row level security;

create table if not exists leaders.mail_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'bulk' check (kind in ('bulk', 'notify')),
  to_email text not null check (char_length(to_email) <= 254),
  subject text not null check (char_length(subject) <= 300),
  html text not null,
  ref text check (char_length(ref) <= 100),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  gave_up_at timestamptz
);
create index if not exists mail_queue_pending on leaders.mail_queue (created_at) where sent_at is null and gave_up_at is null;
alter table leaders.mail_queue enable row level security;

-- حد الشبكة في user-api (مصفوفة التأثير): عنوان الشبكة مع كل رمز، ويُحذف مع الرمز
do $$ begin
  if to_regclass('public.email_otps') is not null then
    alter table public.email_otps add column if not exists ip text;
    create index if not exists email_otps_ip_day on public.email_otps (ip, created_at) where ip is not null;
  end if;
end $$;

revoke all on leaders.mail_events, leaders.mail_queue from anon, authenticated;
revoke all on sequence leaders.mail_events_id_seq from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261107120000_leaders_mail_events') on conflict do nothing;
