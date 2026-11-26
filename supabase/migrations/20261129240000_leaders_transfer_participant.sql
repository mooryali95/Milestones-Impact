-- deploy-gate: tolerant قبله يُنقل المشارك بين الجهات كما كان (admin.assign-org يحدّث الجهة وحدها) ما دام لا إلحاق له بدفعة جهة أخرى،
-- ومن له إلحاق كهذا يُرد نقله بـ409 not_migrated بعد التأكيد ولا يُكتب شيء (missingRpc في admin.ts). والنقل بين الدفعات
-- (admin.cohort-enroll) يمضي بطلباته المتتابعة كما كان حين تغيب الدالة.
-- ════════════════════════════════════════════════════════════════
-- مصدر واحد للدفعة الحاكمة (تصور المرحلة 4، م4): النقل الذري للجهة والدفعة
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-4-مصدر-واحد-للدفعة-الحاكمة-v1.md §5 البندان 4 و5 (اعتمده المالك 2026-11-26).
-- transfer_participant في معاملة واحدة: (1) الجهة إن طُلب تغييرها (p_set_org)، (2) سحب الإلحاقات القائمة، (3) الإلحاق بالدفعة المطلوبة
-- (p_cohort) أو بـ place_participant (دفعة الجهة الجارية أو استقبالها أو المنصة العامة)، (4) حذف عضوية المجموعات والأدوار في غير
-- الدفعة الجديدة فلا يراه خبير مجموعته القديمة. لا إلحاق ممكن: يرمي فيُرجع كل شيء، فلا يبقى مشارك بلا دفعة.
-- دالة جديدة وحدها: لا يمس صفًا قائمًا، فلا نسخة احتياطية ولا سطر restore. آمن لإعادة التشغيل (create or replace).

create or replace function leaders.transfer_participant(p_participant uuid, p_actor text default null, p_org uuid default null,
  p_set_org boolean default false, p_cohort uuid default null)
returns table (cohort_id uuid, outcome text) language plpgsql as $$
#variable_conflict use_column
declare
  p record; res record; got uuid; how text := 'placed'; c record;
begin
  select id, is_demo, organization_id into p from leaders.participants where id = p_participant for no key update;
  if not found then return query select null::uuid, 'none'::text; return; end if;
  if p.is_demo then return query select null::uuid, 'demo'::text; return; end if;
  if p_set_org then
    update leaders.participants set organization_id = p_org, org_via = case when p_org is null then null else 'admin' end, updated_at = now()
     where id = p_participant;
  end if;
  update leaders.enrollments set status = 'withdrawn', updated_at = now()
   where participant_id = p_participant and status <> 'withdrawn' and (p_cohort is null or cohort_id <> p_cohort);
  if p_cohort is not null then
    select id, organization_id into c from leaders.cohorts where id = p_cohort;
    if not found then raise exception 'transfer_participant: no cohort % for participant %', p_cohort, p_participant; end if;
    insert into leaders.enrollments (participant_id, cohort_id, status) values (p_participant, p_cohort, 'active')
    on conflict on constraint enrollments_participant_id_cohort_id_key do update set status = 'active', updated_at = now();
    insert into leaders.cohort_placements (participant_id, cohort_id, wanted_cohort_id, organization_id, source, outcome, actor)
    values (p_participant, p_cohort, p_cohort, c.organization_id, 'manual', 'placed', p_actor);
    got := p_cohort;
  else
    select * into res from leaders.place_participant(p_participant, 'manual', null, p_actor);
    if res.cohort_id is null then raise exception 'transfer_participant: no cohort for participant %', p_participant; end if;
    got := res.cohort_id; how := res.outcome;
  end if;
  delete from leaders.cohort_group_members where participant_id = p_participant and cohort_id <> got;
  delete from leaders.cohort_roles where participant_id = p_participant and cohort_id <> got;
  return query select got, how;
end;
$$;

alter function leaders.transfer_participant(uuid, text, uuid, boolean, uuid) set search_path = leaders, public;
revoke all on function leaders.transfer_participant(uuid, text, uuid, boolean, uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.transfer_participant(uuid, text, uuid, boolean, uuid) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261129240000_leaders_transfer_participant') on conflict do nothing;
