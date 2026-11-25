-- deploy-gate: tolerant الدوال تتسامح مع غيابه: غياب place_participant (PGRST202/42883) يُقرأ «لا إلحاق» فيبقى التسجيل والربط
-- كما كانا بلا دفعة، وأعمدة cohorts.is_intake وsponsor_codes.cohort_id تُقرأ بـ select('*') فتغيب قبله ولا تُفشل القراءة،
-- وكتابة دفعة الرمز قبله ترد not_migrated صراحةً. لا تُغيّر الدوال القديمة شيئًا بعده: لا تعرف الأعمدة ولا الدالة.
-- ════════════════════════════════════════════════════════════════
-- الدفعة هي الوحدة الوحيدة (تصور «لا مشارك بلا دفعة»، اعتمده المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- 1) cohorts.is_intake: دفعة الاستقبال للجهة، واحدة لكل جهة على الأكثر (فهرس cohorts_one_intake) ولا تكون بلا جهة ولا مفتوحة عامة.
--    على نمط is_default (الدفعة المفتوحة، ملاذ من لا جهة له، وهي «المنصة العامة» هنا) لا عمود في organizations: الفهرس الفريد
--    الجزئي يحسم الإنشاء الكسول المتزامن (insert ... on conflict do nothing) بلا قفل على الجهة.
-- 2) sponsor_codes.cohort_id: دفعة يُلحق بها من يستعمل الرمز، أو null فدفعة استقبال جهته. حذف الدفعة يعيد الرمز إلى الاستقبال.
-- 3) cohort_placements: سجل كل إلحاق بمصدره (link/code/platform/manual) ونتيجته (placed، أو overflow حين امتلأت الدفعة المطلوبة أو
--    أُغلقت فبقي المشارك في المنصة العامة وظهر في قائمة انتظار جهته). يُصدَّر في نسخة بيانات المشارك (privacy.js).
-- 4) place_participant: الإلحاق الذري (دفعة الرمز، ثم دفعة الجهة الجارية كما في pickCohort، ثم الاستقبال): يقفل (for no key update) صف المشارك (فلا يُلحق بدفعتين أبدًا، ومن له دفعة لا يُنقل آليًا) ثم صف الدفعة
--    (فالسعة capacity تُحترم مع التزامن: يُلحق N بالضبط)، وينشئ دفعة الاستقبال أو المنصة العامة إن غابت، مثبتة على أحدث نسخة من
--    برنامجها (قاعدة pinTo في programs.ts). الحساب التجريبي لا يُلحق (refuseDemo). لا يُرسل بريدًا.
-- لا يُلحق الترحيل أحدًا ولا يغيّر صفًا قائمًا: إلحاق من لا دفعة له اليوم بأداة الإدارة (admin.cohortless-plan/apply) بعد معاينة
-- scripts/db/verify-cohortless.sql. آمن لإعادة التشغيل.

alter table leaders.cohorts add column if not exists is_intake boolean default false not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cohorts_intake_shape') then
    alter table leaders.cohorts add constraint cohorts_intake_shape check (not is_intake or (organization_id is not null and not is_default));
  end if;
end $$;
create unique index if not exists cohorts_one_intake on leaders.cohorts (organization_id) where is_intake;

alter table leaders.sponsor_codes add column if not exists cohort_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_codes_cohort_id_fkey') then
    alter table leaders.sponsor_codes add constraint sponsor_codes_cohort_id_fkey foreign key (cohort_id) references leaders.cohorts (id) on delete set null;
  end if;
end $$;

create table if not exists leaders.cohort_placements (
  id uuid default gen_random_uuid() not null primary key,
  participant_id uuid not null references leaders.participants (id) on delete cascade,
  cohort_id uuid references leaders.cohorts (id) on delete set null,
  wanted_cohort_id uuid references leaders.cohorts (id) on delete set null,
  organization_id uuid references leaders.organizations (id) on delete set null,
  source text not null,
  outcome text not null,
  -- سبب البقاء في المنصة العامة لمن له جهة: full | closed | no_intake (الجهة موقوفة أو برنامجها بلا نسخة)
  reason text,
  actor text,
  created_at timestamptz default now() not null,
  constraint cohort_placements_source_check check (source in ('link', 'code', 'platform', 'manual')),
  constraint cohort_placements_outcome_check check (outcome in ('placed', 'overflow')),
  constraint cohort_placements_reason_check check (reason is null or reason in ('full', 'closed', 'no_intake'))
);
create index if not exists cohort_placements_participant_idx on leaders.cohort_placements (participant_id, created_at desc);
create index if not exists cohort_placements_org_idx on leaders.cohort_placements (organization_id, outcome) where outcome = 'overflow';
alter table leaders.cohort_placements enable row level security;
revoke all on leaders.cohort_placements from anon, authenticated;

-- دفعة الاستقبال للجهة: القائمة، وإلا تُنشأ باسم الجهة على برنامجها (برنامج دفعتها الأحدث غير المؤرشف، كـorgProgram) أو الافتراضي،
-- مثبتة على أحدث نسخة منه. null: لا نسخة للبرنامج بعد، فلا تُنشأ دفعة غير مثبتة
create or replace function leaders.ensure_intake_cohort(p_org uuid)
returns uuid language plpgsql as $$
declare
  cid uuid; o record; pid uuid; vid uuid;
begin
  select id into cid from leaders.cohorts where organization_id = p_org and is_intake;
  if cid is not null then return cid; end if;
  select id, name, status into o from leaders.organizations where id = p_org;
  if not found or o.status = 'inactive' then return null; end if;
  select c.program_id into pid from leaders.cohorts c join leaders.programs pr on pr.id = c.program_id and pr.archived_at is null
   where c.organization_id = p_org and not c.is_default
   order by coalesce(c.starts_on::timestamptz, c.created_at) desc limit 1;
  if pid is null then select id into pid from leaders.programs where is_default limit 1; end if;
  if pid is null then return null; end if;
  select id into vid from leaders.program_versions where program_id = pid order by number desc limit 1;
  if vid is null then return null; end if;
  insert into leaders.cohorts (name, track, organization_id, program_id, program_version_id, status, is_intake)
  values (left(o.name, 140) || ' · الاستقبال', 'institutional', p_org, pid, vid, 'open', true)
  on conflict do nothing;
  select id into cid from leaders.cohorts where organization_id = p_org and is_intake;
  return cid;
end;
$$;

-- المنصة العامة: الدفعة المفتوحة القائمة (is_default)، وإلا تُنشأ على البرنامج الافتراضي مثبتة على أحدث نسخه
create or replace function leaders.ensure_platform_cohort()
returns uuid language plpgsql as $$
declare
  cid uuid; pid uuid; vid uuid;
begin
  select id into cid from leaders.cohorts where is_default limit 1;
  if cid is not null then return cid; end if;
  select id into pid from leaders.programs where is_default limit 1;
  if pid is null then return null; end if;
  select id into vid from leaders.program_versions where program_id = pid order by number desc limit 1;
  if vid is null then return null; end if;
  insert into leaders.cohorts (name, track, organization_id, program_id, program_version_id, status, is_default)
  values ('المنصة العامة', 'individual', null, pid, vid, 'open', true)
  on conflict do nothing;
  select id into cid from leaders.cohorts where is_default limit 1;
  return cid;
end;
$$;

-- الإلحاق الذري. p_wanted: دفعة الرمز إن كانت للجهة نفسها، وإلا دفعة استقبال الجهة، وإلا المنصة العامة.
-- outcome: placed | overflow | already (له دفعة فلا يُنقل) | demo | none (لا مشارك أو لا دفعة تُنشأ)
create or replace function leaders.place_participant(p_participant uuid, p_source text, p_wanted uuid default null, p_actor text default null)
returns table (cohort_id uuid, outcome text) language plpgsql as $$
#variable_conflict use_column
declare
  p record; w record; target uuid; got uuid; n integer; res text := 'placed'; why text;
begin
  if p_source not in ('link', 'code', 'platform', 'manual') then
    raise exception 'place_participant: bad source %', p_source using errcode = '22023';
  end if;
  select id, organization_id, is_demo into p from leaders.participants where id = p_participant for no key update;
  if not found then return query select null::uuid, 'none'::text; return; end if;
  if p.is_demo then return query select null::uuid, 'demo'::text; return; end if;
  select e.cohort_id into got from leaders.enrollments e where e.participant_id = p_participant and e.status <> 'withdrawn'
   order by e.created_at desc limit 1;
  if got is not null then return query select got, 'already'::text; return; end if;

  if p_wanted is not null then
    select id into target from leaders.cohorts where id = p_wanted and organization_id is not distinct from p.organization_id and not is_default;
  end if;
  -- دفعة الجهة الضمنية كما يختارها pickCohort (logic.js): أحدث دفعة مفتوحة أو جارية للجهة، لا المفتوحة العامة ولا الاستقبال.
  -- فمن كان يمر بها بلا إلحاق يُلحق بها نفسها ولا تتغير رحلته ولا تقاريره. والاستقبال حين لا دفعة جارية للجهة وحده
  if target is null and p.organization_id is not null then
    select id into target from leaders.cohorts
     where organization_id = p.organization_id and not is_default and not is_intake and status in ('open', 'running')
     order by coalesce(starts_on::timestamptz, created_at) desc limit 1;
  end if;
  if target is null and p.organization_id is not null then
    target := leaders.ensure_intake_cohort(p.organization_id);
    if target is null then res := 'overflow'; why := 'no_intake'; end if;
  end if;
  if target is not null then
    -- قفل صف الدفعة يسلسل الإلحاقات المتزامنة فيها، فالعد بعده يرى ما التزمه من سبقه
    select id, status, capacity into w from leaders.cohorts where id = target for no key update;
    select count(*) into n from leaders.enrollments e where e.cohort_id = target and e.status <> 'withdrawn';
    if w.status = 'closed' then res := 'overflow'; why := 'closed';
    elsif w.capacity is not null and n >= w.capacity then res := 'overflow'; why := 'full'; end if;
  end if;
  if target is null or res = 'overflow' then
    got := leaders.ensure_platform_cohort();
    if got is null then return query select null::uuid, 'none'::text; return; end if;
  else
    got := target;
  end if;

  insert into leaders.enrollments (participant_id, cohort_id, status)
  values (p_participant, got, 'active')
  on conflict on constraint enrollments_participant_id_cohort_id_key do update set status = 'active', updated_at = now();
  insert into leaders.cohort_placements (participant_id, cohort_id, wanted_cohort_id, organization_id, source, outcome, reason, actor)
  values (p_participant, got, coalesce(target, got), p.organization_id, p_source, res, why, p_actor);
  return query select got, res;
end;
$$;

alter function leaders.ensure_intake_cohort(uuid) set search_path = leaders, public;
alter function leaders.ensure_platform_cohort() set search_path = leaders, public;
alter function leaders.place_participant(uuid, text, uuid, text) set search_path = leaders, public;
revoke all on function leaders.ensure_intake_cohort(uuid) from public, anon, authenticated;
revoke all on function leaders.ensure_platform_cohort() from public, anon, authenticated;
revoke all on function leaders.place_participant(uuid, text, uuid, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.ensure_intake_cohort(uuid) to service_role;
    grant execute on function leaders.ensure_platform_cohort() to service_role;
    grant execute on function leaders.place_participant(uuid, text, uuid, text) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261128160000_leaders_cohort_intake') on conflict do nothing;
