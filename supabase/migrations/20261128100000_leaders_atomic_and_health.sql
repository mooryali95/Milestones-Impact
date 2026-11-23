-- ════════════════════════════════════════════════════════════════
-- كتابتان ذريتان (نقل المشارك بين المراحل، واستهلاك رمز الرعاية مع ربط المشارك بجهته)، وقراءة حالة المهمة الساعية
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرد نقل المشارك بين المراحل (admin.stage-move) بـnot_migrated صراحةً ولا يكتب شيئًا، والتدخل في مرحلة
-- الواحدة (admin.stage-override) يعمل كما كان. ورمز الرعاية في «رشّحتك جهة؟» يعود إلى الطريق القديم (redeem_sponsor_code ثم الربط)
-- إن غابت الدالة الجديدة، فلا يتعطل شيء قبل التطبيق.
-- 1) apply_stage_move: يحذف تدخلات p_clears ويكتب p_writes ([{stage_key, action}]) في participant_stage_overrides في معاملة الدالة
--    الواحدة، بقاعدة writeOverride (admin.ts) نفسها: الملاحظة مقصوصة إلى 1000، والكاتب، والوقت الآن. إجراء غير معروف يرمي فلا يُكتب شيء.
-- 2) redeem_and_link_sponsor_code: الاستهلاك (redeem_sponsor_code كما هي) وربط المشارك بالجهة (organization_id وorg_via = 'link'
--    بشرط أنه بلا جهة) في معاملة واحدة: إن لم يُربط (صار مرتبطًا بجهة في الأثناء) رمت P0005 فأُلغي
--    الاستدعاء كله والاستهلاك معه، فلا يبقى استخدام معدود بلا ربط. تعيد org_id وreason: ok، أو سبب الرمز (unknown/stopped/expired/exhausted).
--    التسجيل الجديد (consumeAtSignup) يُنشئ الصف مربوطًا ثم يستهلك، وإن تعذّر الاستهلاك فك الربط: لا يُعدّ استخدام بلا ربط هناك أصلًا.
-- 3) cron_job_status: هل المهمة (leaders-expert-offers) موجودة ومفعّلة وحالة آخر تشغيل، لبطاقة «صحة المنصة» (admin.platform-health).
--    security definer لأن cron.job لا يقرؤه دور الخدمة؛ لا تعيد إلا هذه الحقول الأربعة لمهمة بالاسم، ولا نص أمرها. بلا امتداد pg_cron
--    تعيد «غير موجودة». قبل الترحيل تقرأ البطاقة الحالة «غير معروفة».
-- ثلاث دوال جديدة، لا جدول ولا صف قائم يتغير. آمن لإعادة التشغيل.

create or replace function leaders.apply_stage_move(p_participant uuid, p_program uuid, p_clears text[], p_writes jsonb, p_note text, p_by text)
returns integer language plpgsql as $$
declare
  w jsonb;
  n integer := 0;
begin
  if p_writes is not null and jsonb_typeof(p_writes) <> 'array' then
    raise exception 'apply_stage_move: writes must be an array' using errcode = '22023';
  end if;
  delete from leaders.participant_stage_overrides o
   where o.participant_id = p_participant and o.program_id = p_program and o.stage_key = any (coalesce(p_clears, '{}'::text[]));
  for w in select * from jsonb_array_elements(coalesce(p_writes, '[]'::jsonb)) loop
    if coalesce(w->>'action', '') not in ('open', 'complete', 'skip') or coalesce(w->>'stage_key', '') = '' then
      raise exception 'apply_stage_move: bad write %', w using errcode = '22023';
    end if;
    insert into leaders.participant_stage_overrides (participant_id, program_id, stage_key, action, note, by_email, created_at)
    values (p_participant, p_program, w->>'stage_key', w->>'action', nullif(left(coalesce(p_note, ''), 1000), ''), p_by, now())
    on conflict (participant_id, program_id, stage_key) do update
      set action = excluded.action, note = excluded.note, by_email = excluded.by_email, created_at = excluded.created_at;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function leaders.redeem_and_link_sponsor_code(p_code text, p_participant uuid, p_now timestamptz default now())
returns table (org_id uuid, reason text) language plpgsql as $$
declare
  r record;
begin
  select * into r from leaders.redeem_sponsor_code(p_code, p_participant, p_now) x limit 1;
  if r.reason is distinct from 'ok' then
    return query select null::uuid, coalesce(r.reason, 'unknown');
    return;
  end if;
  -- للمشارك جهة الآن: خطأ يلغي الاستدعاء كله، والاستهلاك قبله معه (الدالة عبارة واحدة في معاملة)
  update leaders.participants p set organization_id = r.org_id, org_via = 'link'
   where p.id = p_participant and p.organization_id is null;
  if not found then
    raise exception 'redeem_and_link_sponsor_code: participant already linked' using errcode = 'P0005';
  end if;
  return query select r.org_id, 'ok'::text;
end;
$$;

create or replace function leaders.cron_job_status(p_name text)
returns table (job_exists boolean, job_active boolean, last_status text, last_run timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  jid bigint;
  act boolean;
begin
  if to_regclass('cron.job') is null then
    return query select false, false, null::text, null::timestamptz;
    return;
  end if;
  execute 'select jobid, active from cron.job where jobname = $1 limit 1' into jid, act using p_name;
  if jid is null then
    return query select false, false, null::text, null::timestamptz;
    return;
  end if;
  if to_regclass('cron.job_run_details') is not null then
    return query execute 'select true, $2, d.status::text, coalesce(d.end_time, d.start_time) from cron.job_run_details d where d.jobid = $1 order by d.start_time desc nulls last limit 1' using jid, act;
    if found then
      return;
    end if;
  end if;
  return query select true, act, null::text, null::timestamptz;
end;
$$;

alter function leaders.apply_stage_move(uuid, uuid, text[], jsonb, text, text) set search_path = leaders, public;
alter function leaders.redeem_and_link_sponsor_code(text, uuid, timestamptz) set search_path = leaders, public;
revoke all on function leaders.apply_stage_move(uuid, uuid, text[], jsonb, text, text) from public, anon, authenticated;
revoke all on function leaders.redeem_and_link_sponsor_code(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function leaders.cron_job_status(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.apply_stage_move(uuid, uuid, text[], jsonb, text, text) to service_role;
    grant execute on function leaders.redeem_and_link_sponsor_code(text, uuid, timestamptz) to service_role;
    grant execute on function leaders.cron_job_status(text) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261128100000_leaders_atomic_and_health') on conflict do nothing;
