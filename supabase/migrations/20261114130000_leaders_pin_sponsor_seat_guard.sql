-- ════════════════════════════════════════════════════════════════
-- حارس تثبيت إعفاء الراعي (P1-06): لا يعود مقعد رُدّ أو سُحب أو رُفض، ولا تثبيت لمن خرج من البرنامج
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تفحص الشروط نفسها قبل استدعاء الدالة (entitlements.ts seatStopped)، فتعمل قبله وبعده
-- كان رد المقعد عند الانسحاب (admin.ts setStatus، revoked_by = seat-return) وسحب الإعفاء يدويًا (payments.ts adminGrant)
-- يُنقضان في أول قراءة لملف المشارك: access() يثبّت احتياطًا لكل مرتبط بجهة نشطة ينقصه بند، والدالة لا تنظر في
-- إلغاء سابق ولا في حالة المشارك ولا في طلب مقعد مرفوض، ففرع «مثبّت سلفًا» يكمل البند المسحوب، والمقعد المردود يُستهلك ثانية.
-- الحارس بعد قفل صف الجهة وقبل فرع «مثبّت سلفًا»، ويعيد ثلاث قيم جديدة لا تمنح شيئًا:
--   out        حالة المشارك withdrawn أو suspended (OUT_OF_PROGRAM في logic.js)
--   cancelled  صف sponsor لهذه الجهة ملغى (revoked_at): مقعد رُدّ أو إعفاء سُحب أو نقل منها
--   rejected   طلب seats أو contract لهذه الجهة رُفض (قرار الدفع الفردي، كما في holdSponsorship)
-- إعادة الرعاية بعدها فعل صريح من الإدارة. التوقيع والإعدادات والصلاحيات كما في 20261107130000. آمن لإعادة التشغيل.

create or replace function leaders.pin_sponsor_seat(p_participant uuid, p_org uuid, p_program_value integer, p_currency text, p_note text)
returns text language plpgsql set search_path to 'leaders' as $$
declare
  o record;
  used int;
begin
  select id, seats, contract_starts, contract_ends, status into o from leaders.organizations where id = p_org for update;
  if not found or o.status <> 'active' then return 'inactive'; end if;
  if exists (select 1 from leaders.participants where id = p_participant and status in ('withdrawn', 'suspended')) then return 'out'; end if;
  if exists (select 1 from leaders.entitlements where participant_id = p_participant and organization_id = p_org and source = 'sponsor' and revoked_at is not null) then return 'cancelled'; end if;
  if exists (select 1 from leaders.sponsor_requests where participant_id = p_participant and organization_id = p_org and status = 'rejected' and kind in ('seats', 'contract')) then return 'rejected'; end if;
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

insert into leaders.schema_migrations (name) values ('20261114130000_leaders_pin_sponsor_seat_guard') on conflict do nothing;
