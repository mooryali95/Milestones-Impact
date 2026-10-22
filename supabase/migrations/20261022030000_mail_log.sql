-- ════════════════════════════════════════════════════════════════
-- سجل الرسائل (22 أكتوبر 2026) — يُشغَّل قبل نشر send-otp الجديدة
-- ════════════════════════════════════════════════════════════════
-- كل طلب تواصل يولّد رسالة تنبيه واحدة للإدارة ورسالة تأكيد واحدة
-- للمرسل، مهما استُدعيت الدالة. القيد الفريد هو الضامن.

create table if not exists public.mail_log (
  id         bigint generated always as identity primary key,
  kind       text        not null check (kind in ('notify', 'confirm')),
  ref        text        not null,            -- معرّف طلب التواصل
  created_at timestamptz not null default now(),
  unique (kind, ref)
);

alter table public.mail_log enable row level security;
revoke all on public.mail_log from anon, authenticated;
