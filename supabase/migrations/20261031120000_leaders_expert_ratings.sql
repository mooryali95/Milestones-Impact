-- التقييم في الاتجاهين: المشارك يقيّم الخبير بعد كل جلسة منعقدة أو خدمة مكتملة، والخبير يقيّم المشارك.
-- تقييم واحد لكل اتجاه لكل جلسة أو طلب: لا تكرار ولا تضخيم.
create table if not exists leaders.expert_ratings (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('to_expert', 'to_participant')),
  expert_id uuid not null references leaders.experts(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  session_id uuid references leaders.coaching_sessions(id) on delete cascade,
  request_id uuid references leaders.expert_requests(id) on delete cascade,
  scores jsonb not null,
  overall numeric(3, 2) not null check (overall between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  check (session_id is not null or request_id is not null)
);
create unique index if not exists expert_ratings_session_uq on leaders.expert_ratings (direction, session_id) where session_id is not null;
create unique index if not exists expert_ratings_request_uq on leaders.expert_ratings (direction, request_id) where request_id is not null;
create index if not exists expert_ratings_expert_idx on leaders.expert_ratings (expert_id, direction);
alter table leaders.expert_ratings enable row level security;

-- لوحة الخبير: الدخول برمز البريد، وجلسات مستقلة عن المشاركين والمنسقين
create table if not exists leaders.expert_challenges (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references leaders.experts(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts smallint not null default 0,
  ip text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists expert_challenges_email_idx on leaders.expert_challenges (email, created_at desc);
create table if not exists leaders.expert_sessions (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid not null references leaders.experts(id) on delete cascade,
  token_hash text not null unique,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table leaders.experts add column if not exists last_login_at timestamptz;
alter table leaders.expert_challenges enable row level security;
alter table leaders.expert_sessions enable row level security;
