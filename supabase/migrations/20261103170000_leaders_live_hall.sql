-- ════════════════════════════════════════════════════════════════
-- القاعة الحية: جلسة لكل دفعة، وحضور المشاركين، وفرق الأدوار
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل. نمطان: live (حيّة يقودها الخبير خطوة بخطوة على شاشة العرض)
-- وself (ذاتية: الفرق قائمة والجمل مفتوحة، والعمل يستمر دون اجتماع).
-- التزامن: كل تغيير يرفع version، والأجهزة تسأل كل ثوانٍ «هل تغيّر شيء منذ رقمي؟».

-- فريق كل مشارك في دفعته: الدعم، القيادة، التوجيه، التقييم (والشخصية الافتراضية دور في الجلسة)
create table if not exists leaders.cohort_roles (
  cohort_id      uuid not null references leaders.cohorts(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  team           text not null check (team in ('support', 'lead', 'guide', 'eval')),
  updated_at     timestamptz not null default now(),
  primary key (cohort_id, participant_id)
);

create table if not exists leaders.hall_sessions (
  id                  uuid primary key default gen_random_uuid(),
  cohort_id           uuid not null references leaders.cohorts(id) on delete cascade,
  topic_id            uuid references leaders.katon_topics(id) on delete set null,
  mode                text not null default 'live' check (mode in ('live', 'self')),
  stage               text not null default 'enter' check (stage in ('enter', 'train', 'split', 'round', 'reveal', 'closed')),
  split_method        text check (split_method in ('mixed', 'level', 'choose', 'manual')),
  sentence_id         uuid references leaders.katon_sentences(id) on delete set null,
  revealed            uuid[] not null default '{}',     -- جمل كُشف مفتاحها في القاعة
  round               smallint not null default 1,
  leader_id           uuid references leaders.participants(id) on delete set null,
  persona_id          uuid references leaders.participants(id) on delete set null,
  persona_ar          text check (char_length(persona_ar) <= 200),
  code                text not null unique check (code ~ '^[0-9]{6}$'),
  version             int not null default 1,
  created_by          text,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz
);
create index if not exists hall_sessions_cohort_idx on leaders.hall_sessions (cohort_id, stage);
-- جلسة مفتوحة واحدة لكل دفعة
create unique index if not exists hall_sessions_one_open on leaders.hall_sessions (cohort_id) where stage <> 'closed';

create table if not exists leaders.hall_presence (
  session_id     uuid not null references leaders.hall_sessions(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  joined_at      timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  hand           boolean not null default false,
  primary key (session_id, participant_id)
);

alter table leaders.cohort_roles  enable row level security;
alter table leaders.hall_sessions enable row level security;
alter table leaders.hall_presence enable row level security;
revoke all on leaders.cohort_roles, leaders.hall_sessions, leaders.hall_presence from public, anon, authenticated;
grant all on leaders.cohort_roles, leaders.hall_sessions, leaders.hall_presence to service_role;
