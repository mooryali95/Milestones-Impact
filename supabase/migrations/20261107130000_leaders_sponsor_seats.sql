-- ════════════════════════════════════════════════════════════════
-- مقاعد العقد (D20 في سجل قرارات لجنة الخبراء): فحص ذري لحظة تثبيت إعفاء الراعي
-- ════════════════════════════════════════════════════════════════
-- المرجع الواحد للمقعد عقد الجهة: organizations.seats ومدة العقد (contract_starts وcontract_ends).
-- leaders.pin_sponsor_seat يقفل صف الجهة، ويفحص المدة والمقاعد، ويثبّت البندين في المعاملة نفسها،
-- فلا يتجاوز تسجيلان متزامنان المقعد الأخير. يعيد: granted، أو exists (مثبّت سلفًا)، أو full، أو before، أو after، أو inactive.
-- من يُرد بغير granted وexists يدخل حالة «رعاية بانتظار الاعتماد» (sponsor_requests.kind = seats أو contract).
-- آمن لإعادة التشغيل.

alter table leaders.sponsor_requests add column if not exists kind text not null default 'claim';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_requests_kind_check') then
    alter table leaders.sponsor_requests add constraint sponsor_requests_kind_check check (kind in ('claim', 'seats', 'contract'));
  end if;
end $$;

create or replace function leaders.pin_sponsor_seat(p_participant uuid, p_org uuid, p_program_value integer, p_currency text, p_note text)
returns text language plpgsql set search_path to 'leaders' as $$
declare
  o record;
  used int;
begin
  select id, seats, contract_starts, contract_ends, status into o from leaders.organizations where id = p_org for update;
  if not found or o.status <> 'active' then return 'inactive'; end if;
  if exists (select 1 from leaders.entitlements where participant_id = p_participant and organization_id = p_org and source = 'sponsor' and revoked_at is null) then
    insert into leaders.entitlements (participant_id, item, source, organization_id, granted_by, note, value_cents, currency)
      select p_participant, i, 'sponsor', p_org, 'sponsor', p_note, case when i = 'program' then p_program_value else 0 end, p_currency
        from unnest(array['assessment', 'program']) as i
    on conflict do nothing;
    return 'exists';
  end if;
  if o.contract_starts is not null and current_date < o.contract_starts then return 'before'; end if;
  if o.contract_ends is not null and current_date > o.contract_ends then return 'after'; end if;
  if o.seats is not null then
    select count(distinct participant_id) into used from leaders.entitlements
     where organization_id = p_org and source = 'sponsor' and revoked_at is null;
    if used >= o.seats then return 'full'; end if;
  end if;
  insert into leaders.entitlements (participant_id, item, source, organization_id, granted_by, note, value_cents, currency)
    select p_participant, i, 'sponsor', p_org, 'sponsor', p_note, case when i = 'program' then p_program_value else 0 end, p_currency
      from unnest(array['assessment', 'program']) as i
  on conflict do nothing;
  return 'granted';
end $$;

revoke all on function leaders.pin_sponsor_seat(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function leaders.pin_sponsor_seat(uuid, uuid, integer, text, text) to service_role;

insert into leaders.schema_migrations (name) values ('20261107130000_leaders_sponsor_seats') on conflict do nothing;
