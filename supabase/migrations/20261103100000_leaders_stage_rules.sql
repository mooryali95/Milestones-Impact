-- ════════════════════════════════════════════════════════════════
-- محرك الرحلة: قواعد كل مرحلة، وتدخل الأدمن لمشارك بعينه
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يغيّر رحلة أي مشارك: القواعد الفارغة تعني السلوك
-- الأصلي حرفيًا (إلزامية، تُفتح بعد ما قبلها، تكتمل بمتطلباتها الإلزامية).
--
-- rules: { mode: required|on_demand|optional,
--          unlock: previous|always|stages|day|approval, after: [stage keys], day: n,
--          complete: required|any|approval }
-- تُحفظ في نسخ البرنامج مع المرحلة، فالدفعة المثبتة على نسخة تحتفظ بقواعدها.

alter table leaders.journey_stages add column if not exists rules jsonb not null default '{}'::jsonb;

-- تدخل الأدمن أو الخبير لمشارك في مرحلة من برنامجه: يفتحها، أو يعتمد اكتمالها، أو يعفيه منها.
-- سجل واحد لكل (مشارك، برنامج، مرحلة)؛ الإلغاء يحذفه، والتاريخ في audit_log.
create table if not exists leaders.participant_stage_overrides (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  program_id     uuid not null references leaders.programs(id) on delete cascade,
  stage_key      text not null,
  action         text not null check (action in ('open', 'complete', 'skip')),
  note           text check (char_length(note) <= 1000),
  by_email       text,
  created_at     timestamptz not null default now(),
  primary key (participant_id, program_id, stage_key)
);

alter table leaders.participant_stage_overrides enable row level security;
revoke all on leaders.participant_stage_overrides from public, anon, authenticated;
grant all on leaders.participant_stage_overrides to service_role;
