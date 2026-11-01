-- ════════════════════════════════════════════════════════════════
-- المدة الحرة والمعالم: جدول مراحل الدفعة، ومعالم البرنامج، وسجل كل مشارك
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يغيّر شيئًا على أي مشارك: لا معالم ولا جدول حتى يضيفها الأدمن.

-- تواريخ كل مرحلة في الدفعة: { "<stage_key>": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }
alter table leaders.cohorts add column if not exists schedule jsonb not null default '{}'::jsonb;

-- معالم البرنامج: مرتبطة بحدث في مرحلة (بدايتها أو نهايتها بإزاحة أيام)، أو ببداية الدفعة
-- أو نهايتها، أو بتاريخ محدد. تكتمل آليًا باكتمال مرحلتها أو باعتماد يدوي.
create table if not exists leaders.program_milestones (
  id             uuid primary key default gen_random_uuid(),
  program_id     uuid not null references leaders.programs(id) on delete cascade,
  stage_key      text,
  title_ar       text not null check (char_length(title_ar) between 1 and 160),
  description_ar text check (char_length(description_ar) <= 1000),
  anchor         text not null default 'stage_end' check (anchor in ('stage_end', 'stage_start', 'cohort_start', 'cohort_end', 'date')),
  offset_days    smallint not null default 0 check (offset_days between -365 and 365),
  fixed_date     date,
  complete       text not null default 'stage' check (complete in ('stage', 'manual')),
  weight         smallint check (weight between 0 and 100),
  active         boolean not null default true,
  sort           smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists program_milestones_program_idx on leaders.program_milestones (program_id, sort);

-- سجل المشارك في المعلم: اعتماد إنجازه، أو تمديد موعده له وحده، بسبب مكتوب
create table if not exists leaders.participant_milestones (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  milestone_id   uuid not null references leaders.program_milestones(id) on delete cascade,
  done_at        timestamptz,
  due_override   date,
  note           text check (char_length(note) <= 1000),
  by_email       text,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, milestone_id)
);

alter table leaders.program_milestones     enable row level security;
alter table leaders.participant_milestones enable row level security;
revoke all on leaders.program_milestones, leaders.participant_milestones from public, anon, authenticated;
grant all on leaders.program_milestones, leaders.participant_milestones to service_role;
