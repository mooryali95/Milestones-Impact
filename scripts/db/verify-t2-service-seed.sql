-- T2 «الخدمة» (docs/ops/2026-11-18-تصور-بناء-الرحلة-بالسحب-والورش-والحضور-v1.md ب5.2): ما يتغير لكل دفعة لو صارت مرحلة الاستشارة
-- (مرحلة البند C-MEET) خدمة بالإتاحة {lane:'service', mode:'on_demand', unlock:'stages', after:['approval']} وصار C-MEET غير إلزامي.
-- قراءة فقط: لا يكتب شيئًا، ويُشغَّل قبل التحويل من اللوحة، ولكل دفعة قبل ترقيتها إلى نسخة فيها الخدمة.
-- يُشغَّل بسير migrate.yml في الوضع verify (المسار: scripts/db/verify-t2-service-seed.sql)، أو يُلصق كل فحص في محرر SQL في Supabase.
-- الحساب يحاكي cohortPlan (stage-windows.js) كما في verify-t1-track-seed.sql: «الآن» الاستشارة مرحلة بنافذة متتابعة، و«بعد» تخرج من
-- السلسلة كلها فلا نافذة لها ولا أيام، فيتقدم ما بعدها بقدر مدتها. دفعة فيها تاريخ مثبت (start أو end) تُعلَّم «تقريبي».
-- الدفعة المفتوحة (is_default) بلا تواريخ: لا تتغير لها مواعيد، ويتغير لأعضائها الفتح والعد وحدهما (الفحص 3).
-- لتقصر الفحوص على دفعة واحدة: ضع اسمها مكان null في سطر «pick» من كل فحص.

-- 0) C-MEET كما هو اليوم في كل برنامج ونسخة: نوعه وإلزاميته وإعداده (الترحيل 20261024150000 حوّله إلى coaching بـ{sessions_required:1,
-- minutes:90})، ومرحلته وقاعدتها ومدتها، وما يمنع التحويل: القياس البعدي فيها، أو أنها بوابة قبول، أو مرحلة تُفتح بعدها أو تسير معها
with req as (
  select p.name as prog, 'البرنامج الحي' as which, r.program_id as pid, r.stage_key as k, r.kind, r.required, r.active, coalesce(r.config, '{}'::jsonb) as cfg
    from leaders.stage_requirements r join leaders.programs p on p.id = r.program_id where r.code = 'C-MEET'
  union all
  select p.name, 'النسخة ' || v.number, v.program_id, x->>'stage_key', x->>'kind', coalesce((x->>'required')::boolean, true), coalesce((x->>'active')::boolean, true), coalesce(x->'config', '{}'::jsonb)
    from leaders.program_versions v join leaders.programs p on p.id = v.program_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'requirements', '[]'::jsonb)) x
   where x->>'code' = 'C-MEET'
), stg as (
  select js.program_id as pid, js.key, js.duration_days, coalesce(js.rules, '{}'::jsonb) as rules from leaders.journey_stages js where js.active is not false
), per as (
  select req.*, s.duration_days as d, s.rules,
         exists (select 1 from leaders.stage_requirements e where e.program_id = req.pid and e.stage_key = req.k and e.code = 'E-POST' and e.active is not false) as post,
         req.k in ('profile', 'assessment', 'approval') as gate,
         (select string_agg(o.key, '، ') from stg o where o.pid = req.pid and o.key <> req.k
            and ((o.rules->>'unlock' = 'stages' and o.rules->'after' ? req.k) or (o.rules->>'unlock' = 'with' and o.rules->>'with' = req.k)
                 or o.rules->>'due_before' = req.k or o.rules->>'until' = 'stage:' || req.k)) as refs
    from req left join stg s on s.pid = req.pid and s.key = req.k
)
select not exists (select 1 from per where which = 'البرنامج الحي' and (post or gate or refs is not null)) as ok,
       coalesce(string_agg(prog || ' (' || which || '): C-MEET نوعه ' || coalesce(kind, '-') || (case when required then '، إلزامي' else '، غير إلزامي' end)
         || (case when not active then '، موقوف' else '' end) || '، إعداده ' || cfg::text || '، مرحلته ' || coalesce(k, '-')
         || (case when which = 'البرنامج الحي' then '، قاعدتها ' || coalesce(nullif(rules::text, '{}'), 'بعد ما قبلها') || '، مدتها بالأيام ' || coalesce(d::text, '-') else '' end)
         || (case when post then '، فيها القياس البعدي فلا تصير خدمة' else '' end)
         || (case when gate then '، بوابة قبول فلا تصير خدمة' else '' end)
         || (case when refs is not null then '، تشير إليها: ' || refs || ' (غيّرها أولًا)' else '' end), ' | ' order by prog, which), 'لا برنامج فيه C-MEET') as detail
  from per;

-- 1) لكل دفعة مؤرخة: نافذة الاستشارة الآن (وبعد التحويل لا نافذة)، والمراحل التي تتقدم بخروجها من السلسلة، ونهاية المراحل الآن وبعده
with recursive pick as (select null::text as name), c as (
  select id, name, program_id, program_version_id, starts_on, ends_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false) and coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
), svc as (
  -- مرحلة الاستشارة في كل برنامج: مرحلة البند C-MEET في البرنامج الحي
  select distinct on (r.program_id) r.program_id, r.stage_key as k from leaders.stage_requirements r where r.code = 'C-MEET' order by r.program_id, r.active desc nulls last
), st as (
  select c.id as cid, s->>'key' as k, coalesce((s->>'sort')::numeric, 0) as srt, round(coalesce((s->>'duration_days')::numeric, 0)) as d0, coalesce(s->'rules', '{}'::jsonb) as rules
    from c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) s
   where coalesce((s->>'active')::boolean, true)
  union all
  select c.id, js.key, coalesce(js.sort, 0)::numeric, round(coalesce(js.duration_days, 0)::numeric), coalesce(js.rules, '{}'::jsonb)
    from c join leaders.journey_stages js on js.program_id = c.program_id and js.active is not false
   where c.program_version_id is null
), eff as (
  select st.cid, st.k, st.srt,
         coalesce(nullif(c.sch->st.k->>'days', '')::numeric, st.d0) as d,
         case when c.sch->st.k->'with' = 'false'::jsonb then null else coalesce(c.sch->st.k->>'with', case when st.rules->>'unlock' = 'with' then st.rules->>'with' end) end as w,
         coalesce(nullif(c.sch->st.k->>'offset', '')::numeric, case when c.sch->st.k ? 'with' then 0 else coalesce(nullif(st.rules->>'offset', '')::numeric, 0) end) as o
    from st join c on c.id = st.cid
   where coalesce(c.sch->st.k->>'off', '') <> 'true'
), sc as (
  select 'now' as sc, eff.* from eff
  union all
  select 'after', eff.* from eff join c on c.id = eff.cid where eff.k is distinct from (select k from svc where svc.program_id = c.program_id)
), ord as (
  select sc.*, row_number() over (partition by sc, cid order by srt, k) as rn from sc
), root(sc, cid, k, rn, r, lead) as (
  select o.sc, o.cid, o.k, o.rn, o.k, 0::numeric from ord o
   where not (o.w is not null and exists (select 1 from ord p where p.sc = o.sc and p.cid = o.cid and p.k = o.w and p.rn < o.rn))
  union all
  select o.sc, o.cid, o.k, o.rn, root.r, root.lead + least(o.o, (select p.d from ord p where p.sc = o.sc and p.cid = o.cid and p.k = o.w)) from ord o join root on root.sc = o.sc and root.cid = o.cid and root.k = o.w
   where o.w is not null and root.rn < o.rn
), grp as (
  select ro.sc, ro.cid, ro.r, min(ro.rn) as grn, max(ro.lead + o.d) as len from root ro join ord o on o.sc = ro.sc and o.cid = ro.cid and o.k = ro.k group by ro.sc, ro.cid, ro.r
), gs as (
  select grp.*, coalesce(sum(len) over (partition by sc, cid order by grn rows between unbounded preceding and 1 preceding), 0) as off from grp
), win as (
  select o.sc, o.cid, o.k, c.starts_on + (g.off + ro.lead)::int as wfrom,
         c.starts_on + (g.off + ro.lead + greatest(o.d - 1, 0))::int as wto
    from ord o join root ro on ro.sc = o.sc and ro.cid = o.cid and ro.k = o.k join gs g on g.sc = o.sc and g.cid = o.cid and g.r = ro.r join c on c.id = o.cid
), moved as (
  select a.cid, string_agg(a.k || ' ' || a.wfrom || '→' || b.wfrom, '، ' order by a.wfrom) as list, count(*) as n
    from win a join win b on b.cid = a.cid and b.k = a.k and b.sc = 'after'
   where a.sc = 'now' and (a.wfrom <> b.wfrom or a.wto <> b.wto) group by a.cid
), per as (
  select c.id, c.name, c.ends_on,
         exists (select 1 from jsonb_each(c.sch) e where e.value ? 'start' or e.value ? 'end') as approx,
         (select w.wfrom || ' إلى ' || w.wto from win w join svc on svc.program_id = c.program_id where w.sc = 'now' and w.cid = c.id and w.k = svc.k) as svc_now,
         (select max(wto) from win where sc = 'now' and cid = c.id) as end_now,
         (select max(wto) from win where sc = 'after' and cid = c.id) as end_after
    from c where exists (select 1 from svc where svc.program_id = c.program_id)
)
select true as ok,
       coalesce(string_agg(per.name || (case when approx then ' (تقريبي: تاريخ مثبت)' else '' end) || ': الاستشارة الآن ' || coalesce(svc_now, 'موقوفة') || '، وبعد التحويل بلا نافذة'
         || '. نهاية المراحل ' || end_now || ' ثم ' || end_after
         || (case when per.ends_on is null then '' when end_after < per.ends_on then '، قبل نهاية الدفعة (' || per.ends_on || ') بـ' || (per.ends_on - end_after) || ' يومًا: «اقترح مددًا» إن أردت أن تنتهي معها'
                  when end_after > per.ends_on then '، بعد نهاية الدفعة (' || per.ends_on || ') بـ' || (end_after - per.ends_on) || ' يومًا' else '، مع نهاية الدفعة' end)
         || coalesce('. تتقدم (' || m.n || '): ' || m.list, '. لا مرحلة تتحرك'), ' | ' order by per.name), 'لا دفعة مؤرخة فيها C-MEET') as detail
  from per left join moved m on m.cid = per.id;

-- 2) لكل دفعة مؤرخة: المعالم المرتبطة بالمراحل التي يتغير موعدها، ومعالم الاستشارة نفسها (تصير بلا موعد: لا نافذة للخدمة)،
-- وكم يصير متأخرًا بعد المهلة، وكم يبقى للبريد بعد حارس R0 (موعده من يوم الحارس فما بعد)
with recursive pick as (select null::text as name), cut as (select date '2026-11-18' as d), c as (
  select id, name, program_id, program_version_id, starts_on, ends_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false) and coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
), svc as (
  -- مرحلة الاستشارة في كل برنامج: مرحلة البند C-MEET في البرنامج الحي
  select distinct on (r.program_id) r.program_id, r.stage_key as k from leaders.stage_requirements r where r.code = 'C-MEET' order by r.program_id, r.active desc nulls last
), st as (
  select c.id as cid, s->>'key' as k, coalesce((s->>'sort')::numeric, 0) as srt, round(coalesce((s->>'duration_days')::numeric, 0)) as d0, coalesce(s->'rules', '{}'::jsonb) as rules
    from c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) s
   where coalesce((s->>'active')::boolean, true)
  union all
  select c.id, js.key, coalesce(js.sort, 0)::numeric, round(coalesce(js.duration_days, 0)::numeric), coalesce(js.rules, '{}'::jsonb)
    from c join leaders.journey_stages js on js.program_id = c.program_id and js.active is not false
   where c.program_version_id is null
), eff as (
  select st.cid, st.k, st.srt,
         coalesce(nullif(c.sch->st.k->>'days', '')::numeric, st.d0) as d,
         case when c.sch->st.k->'with' = 'false'::jsonb then null else coalesce(c.sch->st.k->>'with', case when st.rules->>'unlock' = 'with' then st.rules->>'with' end) end as w,
         coalesce(nullif(c.sch->st.k->>'offset', '')::numeric, case when c.sch->st.k ? 'with' then 0 else coalesce(nullif(st.rules->>'offset', '')::numeric, 0) end) as o
    from st join c on c.id = st.cid
   where coalesce(c.sch->st.k->>'off', '') <> 'true'
), sc as (
  select 'now' as sc, eff.* from eff
  union all
  select 'after', eff.* from eff join c on c.id = eff.cid where eff.k is distinct from (select k from svc where svc.program_id = c.program_id)
), ord as (
  select sc.*, row_number() over (partition by sc, cid order by srt, k) as rn from sc
), root(sc, cid, k, rn, r, lead) as (
  select o.sc, o.cid, o.k, o.rn, o.k, 0::numeric from ord o
   where not (o.w is not null and exists (select 1 from ord p where p.sc = o.sc and p.cid = o.cid and p.k = o.w and p.rn < o.rn))
  union all
  select o.sc, o.cid, o.k, o.rn, root.r, root.lead + least(o.o, (select p.d from ord p where p.sc = o.sc and p.cid = o.cid and p.k = o.w)) from ord o join root on root.sc = o.sc and root.cid = o.cid and root.k = o.w
   where o.w is not null and root.rn < o.rn
), grp as (
  select ro.sc, ro.cid, ro.r, min(ro.rn) as grn, max(ro.lead + o.d) as len from root ro join ord o on o.sc = ro.sc and o.cid = ro.cid and o.k = ro.k group by ro.sc, ro.cid, ro.r
), gs as (
  select grp.*, coalesce(sum(len) over (partition by sc, cid order by grn rows between unbounded preceding and 1 preceding), 0) as off from grp
), win as (
  select o.sc, o.cid, o.k, c.starts_on + (g.off + ro.lead)::int as wfrom,
         c.starts_on + (g.off + ro.lead + greatest(o.d - 1, 0))::int as wto
    from ord o join root ro on ro.sc = o.sc and ro.cid = o.cid and ro.k = o.k join gs g on g.sc = o.sc and g.cid = o.cid and g.r = ro.r join c on c.id = o.cid
), due as (
  select c.id as cid, m.id as mid, m.title_ar, m.stage_key, w.sc, (case when m.anchor = 'stage_end' then w.wto else w.wfrom end) + coalesce(m.offset_days, 0) as due
    from c join leaders.program_milestones m on m.program_id = c.program_id and m.active and m.anchor in ('stage_end', 'stage_start')
    join win w on w.cid = c.id and w.k = m.stage_key
   where nullif(c.sch->m.stage_key->>(case when m.anchor = 'stage_end' then 'end' else 'start' end), '') is null
), pair as (
  select a.cid, a.title_ar, a.due as before, b.due as after from due a join due b on b.cid = a.cid and b.mid = a.mid and b.sc = 'after'
   where a.sc = 'now' and a.due <> b.due
), lost as (
  select d.cid, string_agg(d.title_ar || ' ' || d.due, '، ' order by d.due) as list, count(*) as n from due d
    join c on c.id = d.cid join svc on svc.program_id = c.program_id and svc.k = d.stage_key where d.sc = 'now' group by d.cid
), per as (
  select cid, count(*) as moved, string_agg(title_ar || ' ' || before || '→' || after, '، ' order by after) as list,
         count(*) filter (where after < current_date - 3 and not before < current_date - 3) as late,
         count(*) filter (where after < current_date - 3 and not before < current_date - 3 and after >= (select d from cut)) as mailable
    from pair group by cid
)
select true as ok,
       coalesce(string_agg(c.name || ': ' || coalesce('المعالم التي يتغير موعدها (' || p.moved || '): ' || p.list || '. يصير منها متأخرًا بعد المهلة ' || p.late || '، وللبريد بعد الحارس ' || p.mailable, 'لا معلم يتغير موعده')
         || coalesce('. معالم الاستشارة تصير بلا موعد (' || l.n || '): ' || l.list, ''), ' | ' order by c.name)
         filter (where p.cid is not null or l.cid is not null), 'لا معلم يتغير موعده') as detail
  from c left join per p on p.cid = c.id left join lost l on l.cid = c.id;

-- 3) لكل دفعة (والمفتوحة منها): من في منتصف الاستشارة (جلسة محجوزة أو مطلوبة لم تنعقد بعد)، ومن حضرها، ومن لم يحجزها بعد
-- (اليوم ينتظرها ما بعدها إن كانت إلزامية، وبعد التحويل لا ينتظرها شيء)، وكم عضوًا. وحد الجلسات المقترح 2 (أ7.3): من تجاوزه اليوم
-- العضوية تقريبية كما في verify-t1-track-seed.sql (إلحاق غير منسحب، أو جهة الدفعة)
with pick as (select null::text as name), c as (
  select id, name, program_id, organization_id, coalesce(is_default, false) as open from leaders.cohorts where coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
), req as (
  select r.program_id, r.id, r.stage_key, r.required from leaders.stage_requirements r where r.code = 'C-MEET'
), mem as (
  select distinct c.id as cid, c.program_id, p.id as pid
    from c join leaders.participants p on not p.is_demo and not coalesce(p.is_test, false) and p.status not in ('withdrawn', 'suspended')
   where exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.cohort_id = c.id and e.status <> 'withdrawn')
      or (c.organization_id is not null and p.organization_id = c.organization_id
          and not exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.status <> 'withdrawn'))
), ses as (
  select mem.cid, mem.pid,
         count(*) filter (where s.status in ('booked', 'requested')) as open_n,
         count(*) filter (where s.status = 'attended') as attended_n,
         count(*) filter (where s.status not in ('cancelled', 'no_show')) as used_n
    from mem join req on req.program_id = mem.program_id
    left join leaders.coaching_sessions s on s.participant_id = mem.pid and s.requirement_id = req.id
   group by mem.cid, mem.pid
), done as (
  select mem.cid, mem.pid from mem join req on req.program_id = mem.program_id
    join leaders.participant_requirements pr on pr.participant_id = mem.pid and pr.requirement_id = req.id and pr.status = 'done'
), per as (
  select c.name, c.open, (select bool_or(required) from req where req.program_id = c.program_id) as required,
         (select count(*) from mem where mem.cid = c.id) as members,
         (select count(*) from ses where ses.cid = c.id and open_n > 0) as mid,
         (select count(*) from ses where ses.cid = c.id and (attended_n > 0 or exists (select 1 from done d where d.cid = ses.cid and d.pid = ses.pid))) as used,
         (select count(*) from ses where ses.cid = c.id and used_n = 0 and not exists (select 1 from done d where d.cid = ses.cid and d.pid = ses.pid)) as never,
         (select count(*) from ses where ses.cid = c.id and used_n > 2) as over2
    from c where exists (select 1 from req where req.program_id = c.program_id)
)
select true as ok,
       coalesce(string_agg(name || (case when open then ' (المفتوحة)' else '' end) || ': الأعضاء ' || members || '. في منتصف الاستشارة (جلسة محجوزة لم تنعقد) ' || mid
         || '، استفاد منها ' || used || '، لم يحجزها ' || never
         || (case when required then ' (اليوم ينتظرها ما بعدها، وبعد التحويل لا ينتظرها شيء)' else '' end)
         || (case when over2 > 0 then '، وتجاوز جلستين ' || over2 || ' (يبقى ما حجزه، ويُخفى زره)' else '' end), ' | ' order by name), 'لا دفعة فيها C-MEET') as detail
  from per;
