-- ════════════════════════════════════════════════════════════════
-- هوية الدفعة في وثيقة المبادرة، وسجل التحقق العام من الوثائق المعتمدة (قرار المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الوثيقة تعمل بلا هوية دفعة قبل الترحيل (cohortIdentity يعيد null)، والحفظ يرد 503 برسالة (cohort-brand.ts)،
-- والتحقق العام يعمل ولا يُسجَّل (capstone.ts verifyDoc)
-- 1) cohorts.identity: { program, logo, color }. الصدارة للجهة، والدفعة توقيع بعدها، ولونها لا يقود البنية إلا بعد فحص التباين.
--    تُجمَّد في لقطة الاعتماد (snapshot.meta.cohort_brand) كهوية الجهة، فلا يغيّر تعديلها وثيقة صدرت
alter table leaders.cohorts add column if not exists identity jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cohorts_identity_object_chk') then
    alter table leaders.cohorts add constraint cohorts_identity_object_chk check (jsonb_typeof(identity) = 'object');
  end if;
end $$;
comment on column leaders.cohorts.identity is 'هوية الدفعة في وثيقة المبادرة: program (اسم البرنامج)، logo، color (cohort-identity.js)';

-- 2) سجل التحقق العام بالبصمة (doc.verify)، ومنه حد الطلبات لكل عنوان. بلا محتوى ولا اسم
create table if not exists leaders.document_checks (
  id          bigint generated always as identity primary key,
  fingerprint text,
  found       boolean not null,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists document_checks_ip_idx on leaders.document_checks (ip, created_at desc);
alter table leaders.document_checks enable row level security;
revoke all on leaders.document_checks from anon, authenticated;
grant all on leaders.document_checks to service_role;
grant usage, select on all sequences in schema leaders to service_role;

-- 3) البحث بالبصمة في الوثائق المعتمدة
create index if not exists capstones_issued_fingerprint_idx on leaders.capstones ((snapshot -> 'issued' ->> 'fingerprint')) where status = 'approved';

insert into leaders.schema_migrations (name) values ('20261129100000_leaders_cohort_identity') on conflict do nothing;
