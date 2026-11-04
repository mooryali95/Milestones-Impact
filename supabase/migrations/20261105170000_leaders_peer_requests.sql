-- ════════════════════════════════════════════════════════════════
-- طلبات الأقران وتأكيد الخبير ونمط الإشراف (المرحلة 8 من التصور المعتمد، 2026-11-05)
-- ════════════════════════════════════════════════════════════════
-- المشارك يرفع «طلب توجيه» (سؤال أو جزء من مشروعه) فيظهر لأعضاء الفريق المعني في دفعته
-- (cohort_roles) فيجيبون، ثم يؤكّد مستشار الدفعة الإجابة أو يصحّحها أو يخفيها. الإسهام المؤكَّد
-- مصدر سادس في التقييم المستمر (peer في CONTINUOUS_SOURCE_AR). نمط الإشراف لكل دفعة:
--   peers_expert (الافتراضي) · expert_only (الخبير وحده يجيب) · mixed
-- آمن لإعادة التشغيل.

alter table leaders.cohorts add column if not exists supervision text not null default 'peers_expert'
  check (supervision in ('peers_expert', 'expert_only', 'mixed'));

create table if not exists leaders.peer_requests (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  cohort_id      uuid not null references leaders.cohorts(id) on delete cascade,
  source         text not null default 'free' check (source in ('sentence', 'milestone', 'capstone', 'free')),
  ref_id         uuid,
  text           text not null check (char_length(text) between 10 and 2000),
  target_team    text check (target_team in ('support', 'lead', 'guide', 'eval')),
  status         text not null default 'open' check (status in ('open', 'answered', 'confirmed', 'closed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz,
  closed_by      text
);
create index if not exists peer_requests_cohort_idx on leaders.peer_requests (cohort_id, status, created_at desc);
create index if not exists peer_requests_participant_idx on leaders.peer_requests (participant_id);

create table if not exists leaders.peer_answers (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references leaders.peer_requests(id) on delete cascade,
  author_id    uuid references leaders.participants(id) on delete cascade,    -- زميل
  expert_id    uuid references leaders.experts(id) on delete set null,        -- أو الخبير نفسه
  text         text not null check (char_length(text) between 10 and 2000),
  status       text not null default 'pending' check (status in ('pending', 'confirmed', 'corrected', 'hidden')),
  expert_note  text check (char_length(expert_note) <= 1000),
  confirmed_by text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (author_id is not null or expert_id is not null)
);
create index if not exists peer_answers_request_idx on leaders.peer_answers (request_id, created_at);
create index if not exists peer_answers_author_idx on leaders.peer_answers (author_id, status);

alter table leaders.peer_requests enable row level security;
alter table leaders.peer_answers  enable row level security;
revoke all on leaders.peer_requests, leaders.peer_answers from public, anon, authenticated;
grant all on leaders.peer_requests, leaders.peer_answers to service_role;

insert into leaders.schema_migrations (name) values ('20261105170000_leaders_peer_requests') on conflict do nothing;
