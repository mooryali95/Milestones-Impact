-- ════════════════════════════════════════════════════════════════
-- نسخة كتاب القائد الشخصية PDF (23 أكتوبر 2026)
-- ════════════════════════════════════════════════════════════════
-- كل إصدار يُسجَّل برقم يظهر في العلامة المائية لكل صفحة، فأي تسريب يُعرف
-- مصدره ووقته. الحد اليومي يُحسب من هذا الجدول. مغلق إلا لـ service_role.
create table if not exists leaders.handbook_exports (
  id              bigint generated always as identity primary key,
  ref             text not null unique check (ref ~ '^MI-BK-[0-9]{8}-[0-9A-Z]{5}$'),
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  chapters        smallint not null,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists handbook_exports_participant_idx on leaders.handbook_exports (participant_id, created_at desc);
alter table leaders.handbook_exports enable row level security;
revoke all on leaders.handbook_exports from anon, authenticated;
grant all on leaders.handbook_exports to service_role;
grant usage, select on all sequences in schema leaders to service_role;
