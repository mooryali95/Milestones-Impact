-- طلب رعاية: مشارك كتب اسم جهة رشّحته دون رمز. لا يُعفى قبل أن تؤكده الإدارة (أو منسق الجهة لاحقًا).
create table if not exists leaders.sponsor_requests (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references leaders.participants(id) on delete cascade,
  typed_name        text not null check (char_length(typed_name) between 2 and 200),
  contact_email     text check (contact_email is null or char_length(contact_email) <= 254),
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  organization_id   uuid references leaders.organizations(id) on delete set null,
  decided_by        text,
  decided_at        timestamptz,
  reason            text,
  created_at        timestamptz not null default now()
);
create unique index if not exists sponsor_requests_one_pending on leaders.sponsor_requests (participant_id) where status = 'pending';
create index if not exists sponsor_requests_status on leaders.sponsor_requests (status, created_at desc);
alter table leaders.sponsor_requests enable row level security;
revoke all on leaders.sponsor_requests from public, anon, authenticated;
