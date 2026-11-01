-- ════════════════════════════════════════════════════════════════
-- التقييم الختامي: إعداد البرنامج، وسجل كل مشارك بتعديلاته وقراره واعتماده
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يغيّر شيئًا قائمًا. الدرجة الآلية لا تُخزَّن حية؛
-- تُحسب من مصادرها عند العرض، وتُحفظ لقطة منها لحظة الرفع للاعتماد فقط.

-- { weights: {continuous, milestones, project, post}, thresholds: {pass, pass_notes, extend},
--   approval: expert|committee_majority|committee_unanimous, committee_size, min_coverage }
alter table leaders.programs add column if not exists final_eval jsonb not null default '{}'::jsonb;

create table if not exists leaders.final_evaluations (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  program_id     uuid not null references leaders.programs(id) on delete cascade,
  adjust         jsonb not null default '{}'::jsonb,   -- تعديلات الخبير بتعليلاتها
  snapshot       jsonb,                                -- الحساب كاملًا لحظة الرفع للاعتماد
  score          smallint check (score between 0 and 100),
  decision       text check (decision in ('pass', 'pass_notes', 'extend', 'fail')),
  status         text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'returned')),
  votes          jsonb not null default '[]'::jsonb,   -- [{ by, vote: approve|return, note, at }]
  submitted_by   text,
  submitted_at   timestamptz,
  decided_at     timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, program_id)
);
create index if not exists final_evaluations_status_idx on leaders.final_evaluations (status);

alter table leaders.final_evaluations enable row level security;
revoke all on leaders.final_evaluations from public, anon, authenticated;
grant all on leaders.final_evaluations to service_role;
