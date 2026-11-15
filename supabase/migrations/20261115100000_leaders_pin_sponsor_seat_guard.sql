-- ════════════════════════════════════════════════════════════════
-- حارس تثبيت إعفاء الراعي (P1-06): لا تثبيت لمن خرج من البرنامج
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تفحص الشرط نفسه قبل استدعاء الدالة (entitlements.ts seatStopped)، فتعمل قبله وبعده
-- كان رد المقعد عند الانسحاب (admin.ts setStatus، revoked_by = seat-return) يُنقض في أول قراءة لملف المشارك: access()
-- يثبّت احتياطًا لكل مرتبط بجهة نشطة ينقصه بند، والدالة لا تنظر في حالة المشارك، فيُستهلك المقعد المردود ثانية.
-- الحارس بعد قفل صف الجهة وقبل فرع «مثبّت سلفًا»، ويعيد قيمة جديدة لا تمنح شيئًا:
--   out  حالة المشارك withdrawn أو suspended (OUT_OF_PROGRAM في logic.js)، لكل تثبيت آليًا كان أو صريحًا
-- وسحب الإعفاء ورفض طلب المقعد (cancelled وrejected) يفحصهما الخادم للتثبيت الآلي وحده (seatStopped)، لا هنا: الفعل الصريح
-- من الإدارة (نقله إلى الجهة، قبول طلب رعايته) يعيد الرعاية بعدهما عبر هذه الدالة نفسها بفحص المقاعد والعقد.
-- التوقيع والإعدادات والصلاحيات كما في 20261107130000. آمن لإعادة التشغيل.
-- ترتيب النشر: الدالة الجديدة أولًا ثم هذا الترحيل، لا قبلها. والتسامح في اتجاه واحد: الإصدار السابق (2710ba5 فما قبله)
-- يعد كل نتيجة سوى full وbefore وafter تثبيتًا، فيقرأ out تثبيتًا ناجحًا، فقبوله طلب مقعد لمنسحب يضيف مقعدًا إلى العقد
-- ويعتمد الطلب ويرسل «تأكدت رعايتك» ولا تثبيت. فالتراجع بالدالة إلى ما قبل P1-06 بعد تطبيقه يرافقه إرجاع هذه الدالة:
-- أعد تشغيل 20261107130000 (آمن لإعادة التشغيل)، فتعود بلا الحارس كما يتوقعها ذلك الإصدار، ثم أعد هذا مع إعادة النشر.

create or replace function leaders.pin_sponsor_seat(p_participant uuid, p_org uuid, p_program_value integer, p_currency text, p_note text)
returns text language plpgsql set search_path to 'leaders' as $$
declare
  o record;
  used int;
begin
  select id, seats, contract_starts, contract_ends, status into o from leaders.organizations where id = p_org for update;
  if not found or o.status <> 'active' then return 'inactive'; end if;
  if exists (select 1 from leaders.participants where id = p_participant and status in ('withdrawn', 'suspended')) then return 'out'; end if;
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

insert into leaders.schema_migrations (name) values ('20261115100000_leaders_pin_sponsor_seat_guard') on conflict do nothing;
