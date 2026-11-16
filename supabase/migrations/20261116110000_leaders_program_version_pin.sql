-- ════════════════════════════════════════════════════════════════
-- تثبيت كل دفعة على نسخة من برنامجها: لا دفعة «تتبع آخر تعديل» بعد اليوم
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تقرأ نسخة الدفعة إن وُجدت وإلا البرنامج كما هو (programs.ts journeyDefinition)، وتثبّت كل دفعة جديدة على نسخة قبله وبعده
-- المشكلة: الدفعة بلا نسخة تقرأ صفوف البرنامج الحية، فكل حفظ في محرر الرحلة وكل استرجاع نسخة يغيّر رحلة أعضائها فورًا.
-- هذا الترحيل:
--   1) يحفظ نسخة لكل برنامج له متطلبات ولا نسخة له، ولكل برنامج عليه دفعة غير مثبتة وأحدث نسخه تختلف عن حاله الآن،
--      فتُثبَّت الدفعة على ما تمر به اليوم بالضبط لا على نسخة أقدم (اللقطة بشكل programSnapshot في logic.js).
--   2) يثبّت كل دفعة بلا نسخة، بكل حالاتها (والمفتوحة والمغلقة)، على أحدث نسخة من برنامجها. لا يمس قيمة قائمة.
--   3) حارس cohort_version_pinned: لا تُلغى نسخة دفعة مثبتة، ولا تُثبَّت دفعة على نسخة برنامج آخر، إلا بترحيل يضبط
--      leaders.program_unpin = on. وحارس program_versions_frozen: لقطة النسخة وبرنامجها ورقمها لا تتغير.
--   4) سطر في السجل لكل نسخة أُنشئت ولكل دفعة ثُبّتت.
-- تغيير في طريقة العمل: ترحيل تصحيح نص في البرنامج (مثل 20261116050000) لم يعد يصل إلى الدفعات بتعديل الصفوف الحية.
--   يُقطع بعده نسخة جديدة، وتُرقّى إليها الدفعات المسماة من «البرامج والدفعات»، أو يُصحَّح بيان نسخها صراحة.
-- آمن لإعادة التشغيل: الإعادة لا تجد برنامجًا بلا نسخة له متطلبات ولا دفعة بلا نسخة، فلا تكتب شيئًا.
-- التحقق بعد التطبيق (صفر في الاثنين):
--   select count(*) from leaders.cohorts where program_version_id is null;
--   select count(*) from leaders.cohorts c join leaders.program_versions v on v.id = c.program_version_id where v.program_id <> c.program_id;

do $pin$
declare
  pr record;
  snap jsonb;
  latest record;
  vid uuid;
  n int;
  pin record;
begin
  for pr in select p.id from leaders.programs p order by p.created_at loop
    snap := jsonb_build_object(
      'stages', coalesce((select jsonb_agg(to_jsonb(s) - 'program_id' - 'created_at' - 'updated_at' order by s.sort, s.key)
        from leaders.journey_stages s where s.program_id = pr.id), '[]'::jsonb),
      'requirements', coalesce((select jsonb_agg(to_jsonb(r) - 'program_id' - 'created_at' - 'updated_at' order by r.stage_key, r.sort, r.code)
        from leaders.stage_requirements r where r.program_id = pr.id), '[]'::jsonb));
    select v.id, v.number, v.data into latest from leaders.program_versions v where v.program_id = pr.id order by v.number desc limit 1;
    -- برنامج بلا متطلبات لا نسخة له ولا دفعة تُثبَّت عليه هنا؛ تعرضه جاهزية الإعداد
    if jsonb_array_length(snap -> 'requirements') = 0 then continue; end if;
    -- المقارنة بلا ترتيب: المراحل بمفاتيحها والمتطلبات بمعرفاتها، فترتيب اللغة لا يصنع فرقًا وهميًا
    if latest.id is null or (exists (select 1 from leaders.cohorts u where u.program_id = pr.id and u.program_version_id is null)
       and ((select coalesce(jsonb_agg(e order by e ->> 'key'), '[]'::jsonb) from jsonb_array_elements(latest.data -> 'stages') e)
             is distinct from (select coalesce(jsonb_agg(e order by e ->> 'key'), '[]'::jsonb) from jsonb_array_elements(snap -> 'stages') e)
         or (select coalesce(jsonb_agg(e order by e ->> 'id'), '[]'::jsonb) from jsonb_array_elements(latest.data -> 'requirements') e)
             is distinct from (select coalesce(jsonb_agg(e order by e ->> 'id'), '[]'::jsonb) from jsonb_array_elements(snap -> 'requirements') e))) then
      n := coalesce(latest.number, 0) + 1;
      insert into leaders.program_versions (program_id, number, label, data, created_by)
      values (pr.id, n, case when n = 1 then 'النسخة 1: لقطة التأسيس' else 'لقطة التثبيت 2026-11-16' end, snap, 'migration:20261116110000')
      on conflict (program_id, number) do nothing
      returning id into vid;
      if vid is not null then
        insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
        values ('system', 'migration:20261116110000', 'program.version', 'program_versions', vid::text, null,
          jsonb_build_object('number', n, 'auto', 'program.pin'));
      end if;
    end if;
  end loop;

  for pin in
    select co.id, co.program_id,
      (select v.id from leaders.program_versions v where v.program_id = co.program_id order by v.number desc limit 1) as vid,
      (select v.number from leaders.program_versions v where v.program_id = co.program_id order by v.number desc limit 1) as num
    from leaders.cohorts co where co.program_version_id is null
  loop
    continue when pin.vid is null;
    update leaders.cohorts set program_version_id = pin.vid where id = pin.id and program_version_id is null;
    insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
    values ('system', 'migration:20261116110000', 'cohort.pin', 'cohorts', pin.id::text, jsonb_build_object('program_version_id', null),
      jsonb_build_object('program_version_id', pin.vid, 'number', pin.num));
  end loop;
end $pin$;

-- نسخة الدفعة لا تُلغى ولا تكون من برنامج آخر
create or replace function leaders.cohort_version_pinned() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('leaders.program_unpin', true), '') = 'on' then return new; end if;
  if tg_op = 'UPDATE' and old.program_version_id is not null and new.program_version_id is null then
    raise exception 'الدفعة «%» مثبتة على نسخة من برنامجها، ولا يُلغى تثبيتها؛ رقِّها إلى نسخة أخرى', old.name using errcode = '42501';
  end if;
  if new.program_version_id is not null
     and not exists (select 1 from leaders.program_versions v where v.id = new.program_version_id and v.program_id = new.program_id) then
    raise exception 'نسخة الدفعة «%» لا تخص برنامجها', new.name using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists cohort_version_pinned on leaders.cohorts;
create trigger cohort_version_pinned before insert or update of program_version_id, program_id on leaders.cohorts
  for each row execute function leaders.cohort_version_pinned();

-- لقطة النسخة ثابتة: ما ثُبّتت عليه دفعة لا يتغير تحتها. الاسم وحده يُصحَّح
create or replace function leaders.program_version_frozen() returns trigger language plpgsql as $$
begin
  if new.data is distinct from old.data or new.program_id is distinct from old.program_id or new.number is distinct from old.number then
    raise exception 'لقطة نسخة البرنامج لا تُعدَّل؛ احفظ نسخة جديدة' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists program_versions_frozen on leaders.program_versions;
create trigger program_versions_frozen before update on leaders.program_versions
  for each row execute function leaders.program_version_frozen();

insert into leaders.schema_migrations (name) values ('20261116110000_leaders_program_version_pin') on conflict do nothing;
