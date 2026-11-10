-- ════════════════════════════════════════════════════════════════
-- إجابات استبيان سهولة الاستخدام SUS للأدوار الثلاثة (بوابة م4: خمسة لكل دور فوق 75)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (sus.ts: mine وadminSummary)، فقبله لا تُعرض بطاقة الاستبيان لأحد
-- لم يُطبَّق على الإنتاج بعد: يُطبَّق بسير migrate.yml باسمه (20261110160000_leaders_sus_responses).
-- صف واحد لكل شخص في كل دور: إما تأجيل (snoozed_at وحده) أو إجابة (answers وscore).
-- subject_id بلا مفتاح أجنبي لأن الدور يحدد الجدول (مشارك أو خبير أو منسق)، كما في consent_events.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.sus_responses (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('participant', 'expert', 'coordinator')),
  subject_id uuid not null,
  answers smallint[] check (answers is null or (array_length(answers, 1) = 10 and 1 <= all (answers) and 5 >= all (answers))),
  score numeric(5, 1) check (score is null or (score >= 0 and score <= 100)),
  comment text check (comment is null or char_length(comment) <= 600),
  snoozed_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (role, subject_id)
);
create index if not exists sus_responses_role on leaders.sus_responses (role, answered_at);
alter table leaders.sus_responses enable row level security;
revoke all on leaders.sus_responses from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261110160000_leaders_sus_responses') on conflict do nothing;
