-- ════════════════════════════════════════════════════════════════
-- نمط المجموعة: تجانس المستوى، ونمط العمل لكل مرحلة، والمجموعات
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، والافتراضي هو السلوك الحالي: مختلط، ونمط العمل غير محدد، ومشروع فردي.

alter table leaders.cohorts add column if not exists level_mode    text not null default 'mixed';
alter table leaders.cohorts add column if not exists content_level text;
alter table leaders.cohorts add column if not exists stage_modes   jsonb not null default '{}'::jsonb;
alter table leaders.cohorts add column if not exists project_mode  text not null default 'individual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cohorts_level_mode_check') then
    alter table leaders.cohorts add constraint cohorts_level_mode_check check (level_mode in ('mixed', 'uniform'));
    alter table leaders.cohorts add constraint cohorts_content_level_check check (content_level is null or content_level in ('beginner', 'intermediate', 'advanced'));
    alter table leaders.cohorts add constraint cohorts_project_mode_check check (project_mode in ('individual', 'group'));
    alter table leaders.cohorts add constraint cohorts_uniform_level_check check (level_mode <> 'uniform' or content_level is not null);
  end if;
end $$;

create table if not exists leaders.cohort_groups (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid not null references leaders.cohorts(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  sort       smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cohort_groups_cohort_idx on leaders.cohort_groups (cohort_id, sort);

-- عضوية المشارك: مجموعة واحدة في الدفعة
create table if not exists leaders.cohort_group_members (
  cohort_id      uuid not null references leaders.cohorts(id) on delete cascade,
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  group_id       uuid not null references leaders.cohort_groups(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (cohort_id, participant_id)
);
create index if not exists cohort_group_members_group_idx on leaders.cohort_group_members (group_id);

alter table leaders.cohort_groups        enable row level security;
alter table leaders.cohort_group_members enable row level security;
revoke all on leaders.cohort_groups, leaders.cohort_group_members from public, anon, authenticated;
grant all on leaders.cohort_groups, leaders.cohort_group_members to service_role;
