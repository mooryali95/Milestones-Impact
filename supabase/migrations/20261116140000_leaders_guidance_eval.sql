-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد» G4a: تقييم الدقة قبل الإطلاق، والدفعة التجريبية (تصور 2026-11-16 v6)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant بلا الجدولين ترد مسارات التقييم not_migrated والبوابة مغلقة، وبلا العمود لا دفعة تجريبية فالبوابة مغلقة
-- قرار المالك: دقة 99٪ على مجموعة عربية تعتمدها لجنة المحتوى، ثم الإطلاق لدفعة تجريبية أولًا.
-- - guidance_eval_runs: كل تشغيل بصمته (النموذج والقواعد ونسخة المجموعة). البوابة تفتح بآخر تشغيل منتهٍ ناجح لبصمة اليوم.
-- - guidance_eval_results: نتيجة كل حالة وسببها ورد النموذج للمراجعة. الأسئلة مصطنعة من الكتاب، لا بيانات مشارك فيها.
-- - cohorts.guidance_pilot: الدفعة التي يعمل لها المساعد. مطفأ افتراضيًا لكل دفعة.
-- لا يقرؤها إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.guidance_eval_runs (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null check (char_length(fingerprint) <= 200),
  cases_version text not null check (char_length(cases_version) <= 80),
  status text not null default 'running' check (status in ('running', 'passed', 'failed', 'stopped', 'error')),
  stop_reason text check (char_length(stop_reason) <= 40),
  total_cases integer not null check (total_cases > 0),
  done_cases integer not null default 0,
  passed_cases integer not null default 0,
  cost_micros bigint not null default 0,
  max_micros bigint not null,
  started_by text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  lease_until timestamptz
);
create index if not exists guidance_eval_runs_started_idx on leaders.guidance_eval_runs (started_at desc);
-- تشغيل واحد يجري في كل وقت
create unique index if not exists guidance_eval_runs_one_running on leaders.guidance_eval_runs ((true)) where status = 'running';

create table if not exists leaders.guidance_eval_results (
  run_id uuid not null references leaders.guidance_eval_runs(id) on delete cascade,
  case_id text not null check (char_length(case_id) <= 20),
  ok boolean not null,
  verdict text check (char_length(verdict) <= 20),
  reasons text[] not null default '{}',
  reply text check (char_length(reply) <= 6000),
  cost_micros bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (run_id, case_id)
);

-- حجز دفعة من التشغيل لطلب واحد (يمنع طلبين متوازيين من تشغيل الحالات نفسها)
create or replace function leaders.guidance_eval_lease(p_id uuid, p_seconds integer)
returns setof leaders.guidance_eval_runs language sql as $$
  update leaders.guidance_eval_runs set lease_until = now() + make_interval(secs => p_seconds)
   where id = p_id and status = 'running' and (lease_until is null or lease_until < now())
  returning *;
$$;

alter table leaders.cohorts add column if not exists guidance_pilot boolean not null default false;
comment on column leaders.cohorts.guidance_pilot is 'دفعة تجريبية للمساعد الذكي «التوجيه والإرشاد»: لا يعمل إلا لأعضاء دفعة مفعّلة';

alter table leaders.guidance_eval_runs enable row level security;
alter table leaders.guidance_eval_results enable row level security;
revoke all on leaders.guidance_eval_runs, leaders.guidance_eval_results from anon, authenticated;
revoke all on function leaders.guidance_eval_lease(uuid, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.guidance_eval_lease(uuid, integer) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261116140000_leaders_guidance_eval') on conflict do nothing;
