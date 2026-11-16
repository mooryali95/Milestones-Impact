-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد» G3: «أريد التأكد» حدثًا، وأعداد للمستشار والإدارة بلا نص (تصور 2026-11-16 v5)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant guide.confirm يُتجاهل بلا العمود، والأعداد ترجع null فلا يظهر سطرها في الملف ولا التقرير
-- قرار المالك: المستشار يتابع ما تم، والمحادثة نفسها خاصة بالمشارك لا يراها المشرف ولا الخبير.
-- لذلك ما يُقرأ هنا أعداد وحدها: الدالتان تعيدان أرقامًا وتاريخًا، ولا عمود نص فيهما، فلا مسار يصل إلى المحادثة منهما.
-- confirmed_at: متى ضغط المشارك «لم تقنعني، أريد التأكد» تحت رد. لا يُنقل شيء من المحادثة؛ الاستشارة يرسلها بنفسه.
-- آمن لإعادة التشغيل.

alter table leaders.guidance_messages add column if not exists confirmed_at timestamptz;

-- أعداد مشارك واحد منذ وقت: أسئلته المحسوبة، وما لم يتأكد فيه المساعد، وما طلب التأكد منه، وآخر سؤال
create or replace function leaders.guidance_counts(p_participant uuid, p_since timestamptz)
returns table (asked integer, unsure integer, confirmed integer, last_at timestamptz)
language sql stable as $$
  select count(*) filter (where role = 'user' and verdict is distinct from 'refused')::integer,
         count(*) filter (where role = 'assistant' and verdict = 'unsure')::integer,
         count(*) filter (where role = 'assistant' and confirmed_at is not null)::integer,
         max(created_at) filter (where role = 'user')
    from leaders.guidance_messages
   where participant_id = p_participant and created_at >= p_since;
$$;

-- أعداد كل المشاركين منذ وقت للإدارة: الأسئلة والمشاركون وتوزيع الحكم و«أريد التأكد» والكلفة. لا نص ولا معرّفات
create or replace function leaders.guidance_report(p_since timestamptz)
returns table (asked integer, participants integer, answered integer, unsure integer, refused integer, errors integer, confirmed integer, micros bigint)
language sql stable as $$
  select count(*) filter (where role = 'user' and verdict is distinct from 'refused')::integer,
         count(distinct participant_id) filter (where role = 'user')::integer,
         count(*) filter (where role = 'assistant' and verdict = 'answered')::integer,
         count(*) filter (where role = 'assistant' and verdict = 'unsure')::integer,
         count(*) filter (where role = 'assistant' and verdict = 'refused')::integer,
         count(*) filter (where role = 'assistant' and verdict = 'error')::integer,
         count(*) filter (where role = 'assistant' and confirmed_at is not null)::integer,
         coalesce(sum(cost_micros), 0)::bigint
    from leaders.guidance_messages
   where created_at >= p_since;
$$;

revoke all on function leaders.guidance_counts(uuid, timestamptz), leaders.guidance_report(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.guidance_counts(uuid, timestamptz), leaders.guidance_report(timestamptz) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261116130000_leaders_guidance_counts') on conflict do nothing;
