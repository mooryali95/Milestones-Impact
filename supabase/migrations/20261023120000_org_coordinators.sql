-- ════════════════════════════════════════════════════════════════
-- منسق الجهة: حساب اطلاع لكل جهة (23 أكتوبر 2026)
-- ════════════════════════════════════════════════════════════════
-- منسق واحد لكل جهة، يدخل برمز بريد إلى leaders.sunkvalue.com/org ويرى
-- لوحة جهته فقط. جداوله منفصلة عن المشاركين حتى لا تختلط الجلسات أو
-- الرموز إن كان المنسق مشاركًا بالبريد نفسه. المخطط مغلق إلا لـ service_role.

-- 1) المنسق
create table if not exists leaders.org_coordinators (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null unique references leaders.organizations(id) on delete cascade,
  email            text not null check (email = lower(email) and char_length(email) <= 254),
  full_name        text check (full_name is null or char_length(full_name) <= 120),
  phone            text check (phone is null or char_length(phone) <= 30),
  -- invited: لم يدخل بعد · active: دخل مرة على الأقل · suspended: أوقفه المدير
  status           text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  -- ما يظهر له من بيانات المشاركين، يضبطه المدير لكل جهة
  permissions      jsonb not null default '{"scores": false, "contact": false, "export": true}'::jsonb,
  weekly_report    boolean not null default true,
  invited_at       timestamptz,
  last_login_at    timestamptz,
  last_report_at   timestamptz,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists org_coordinators_email_idx on leaders.org_coordinators (email);

-- 2) رموز الدخول (بريد: رمز من 6 أرقام ورابط)
create table if not exists leaders.coordinator_challenges (
  id               uuid primary key default gen_random_uuid(),
  coordinator_id   uuid not null references leaders.org_coordinators(id) on delete cascade,
  email            text not null,
  code_hash        text not null,
  link_token_hash  text not null unique,
  attempts         smallint not null default 0,
  ip               inet,
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists coordinator_challenges_email_idx on leaders.coordinator_challenges (email, created_at desc);

-- 3) الجلسات
create table if not exists leaders.coordinator_sessions (
  id               uuid primary key default gen_random_uuid(),
  coordinator_id   uuid not null references leaders.org_coordinators(id) on delete cascade,
  token_hash       text not null unique,
  method           text not null,
  ip               inet,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz,
  expires_at       timestamptz not null,
  revoked_at       timestamptz
);
create index if not exists coordinator_sessions_coord_idx on leaders.coordinator_sessions (coordinator_id);

-- 4) السجل يقبل المنسق فاعلًا
alter table leaders.audit_log drop constraint if exists audit_log_actor_type_check;
alter table leaders.audit_log add constraint audit_log_actor_type_check
  check (actor_type in ('admin', 'participant', 'system', 'coordinator'));

-- 5) مغلقة تمامًا: لا وصول إلا لـ service_role عبر leaders-api
alter table leaders.org_coordinators      enable row level security;
alter table leaders.coordinator_challenges enable row level security;
alter table leaders.coordinator_sessions   enable row level security;
revoke all on leaders.org_coordinators, leaders.coordinator_challenges, leaders.coordinator_sessions from anon, authenticated;
