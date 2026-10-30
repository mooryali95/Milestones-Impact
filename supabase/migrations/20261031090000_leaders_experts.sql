-- الخبراء: ملف واحد للشخص، بعدة أدوار (كوتش، مستشار، خبير موضوعي، مقيّم، مرشد).
-- ينضم بدعوة من الإدارة أو بطلب منه، ولا يعمل قبل اعتماده. سعر الساعة والتكلفة للإدارة وحدها.
create table if not exists leaders.experts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  full_name text not null check (char_length(full_name) between 2 and 120),
  title text check (title is null or char_length(title) <= 160),
  phone text check (phone is null or char_length(phone) <= 30),
  bio text check (bio is null or char_length(bio) <= 3000),
  linkedin_url text check (linkedin_url is null or char_length(linkedin_url) <= 300),
  roles text[] not null default '{}' check (roles <@ array['coach', 'advisor', 'specialist', 'assessor', 'mentor']::text[]),
  dimensions text[] not null default '{}' check (dimensions <@ array['milestone', 'impact', 'leadership']::text[]),
  levels text[] not null default '{}' check (levels <@ array['beginner', 'intermediate', 'advanced']::text[]),
  sectors text[] not null default '{}',
  languages text[] not null default '{ar}' check (languages <@ array['ar', 'en']::text[]),
  weekly_hours smallint check (weekly_hours is null or weekly_hours between 0 and 60),
  years_experience smallint check (years_experience is null or years_experience between 0 and 60),
  hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0),   -- للإدارة وحدها، وصفر للمتطوع
  status text not null default 'applied' check (status in ('applied', 'invited', 'active', 'paused', 'suspended', 'rejected')),
  source text not null default 'application' check (source in ('application', 'admin')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  applied_ip text,
  approved_by text,
  approved_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experts_status_idx on leaders.experts (status);
alter table leaders.experts enable row level security;
