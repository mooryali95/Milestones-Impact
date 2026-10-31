-- الإسناد: طلب خدمة لمشارك يُعرض على الخبير الأنسب، وله 24 ساعة ليقبل أو يعتذر، ثم ينتقل للتالي.
-- مصدر واحد لحالة الطلب، وسجل كامل بمن عُرض عليه ومن اعتذر، فلا يُفقد طلب ولا يُعرض مرتين على الشخص نفسه.
create table if not exists leaders.expert_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  role text not null check (role in ('coach', 'advisor', 'specialist', 'assessor', 'mentor')),
  dimension text check (dimension is null or dimension in ('milestone', 'impact', 'leadership')),
  status text not null default 'open' check (status in ('open', 'offered', 'accepted', 'unmatched', 'cancelled', 'completed')),
  expert_id uuid references leaders.experts(id) on delete set null,   -- المعروض عليه الآن، أو من قبِل
  offer_token_hash text,
  offered_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  tried uuid[] not null default '{}',     -- كل من عُرض عليه (اعتذر أو انتهت مهلته): لا يُعرض عليه ثانية
  score numeric(5, 2),                    -- نقاط المطابقة لمن عُرض عليه
  manual_reason text check (manual_reason is null or char_length(manual_reason) <= 500),
  note text check (note is null or char_length(note) <= 1000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expert_requests_status_idx on leaders.expert_requests (status, expires_at);
create index if not exists expert_requests_expert_idx on leaders.expert_requests (expert_id);
create unique index if not exists expert_requests_token_idx on leaders.expert_requests (offer_token_hash) where offer_token_hash is not null;
-- طلب مفتوح واحد لكل مشارك ودور: لا تكرار
create unique index if not exists expert_requests_live_idx on leaders.expert_requests (participant_id, role)
  where status in ('open', 'offered', 'accepted');
alter table leaders.expert_requests enable row level security;

-- كل ساعة: العروض التي انتهت مهلتها تنتقل للخبير التالي
select cron.schedule(
  'leaders-expert-offers',
  '17 * * * *',
  $$
  select net.http_post(
    url     := 'https://eormhcupwgwpllhrfxxg.supabase.co/functions/v1/leaders-api',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0'),
    body    := jsonb_build_object(
      'action', 'cron.expert-offers',
      'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'leaders_cron_secret')
    )
  );
  $$
);
