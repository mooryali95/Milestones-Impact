-- T1 «المسار المستمر» (docs/ops/2026-11-18-تصور-بناء-الرحلة-بالسحب-والورش-والحضور-v1.md ب5.1): ما يتغير لكل دفعة لو صار
-- «التوجيه على رأس العمل» مسارًا مستمرًا بالبذرة {lane:'track', unlock:'with', with:'training', offset:1, until:'journey_end',
-- due_before:'report'}. قراءة فقط: لا يكتب شيئًا، ويُشغَّل قبل ضبط البذرة من اللوحة، ولكل دفعة قبل ترقيتها إلى نسخة فيها البذرة.
-- يُشغَّل بسير migrate.yml في الوضع verify (المسار: scripts/db/verify-t1-track-seed.sql)، أو يُلصق كل فحص في محرر SQL في Supabase.
-- الحساب يحاكي cohortPlan (stage-windows.js) بالمدد وخطة الدفعة (days وoff وwith وoffset): المجموعة «تبدأ مع» تبدأ معًا،
-- وما بعدها في اليوم التالي لأطولها، والنافذة شاملة الطرفين. «الآن»: التوجيه مرحلة متتابعة كما هو. «بعد»: يخرج من السلسلة
-- ويبدأ بعد بداية التدريب بيوم وينتهي بنهاية الدفعة (ends_on). دفعة فيها تاريخ مثبت (start أو end) تُعلَّم «تقريبي».
-- الدفعة المفتوحة (is_default) بلا تواريخ: لا تتغير لها مواعيد، ويتغير لأعضائها الفتح وحده (الفحص 4).
-- لتقصر الفحوص على دفعة واحدة: ضع اسمها مكان null في سطر «pick» من كل فحص.

-- 0) المرحلة كما هي اليوم في كل برنامج ونسخة: قاعدتها ومدتها، وما يمنع البذرة (القياس البعدي فيها، أو لا تدريب)، وهل «التقرير النهائي» موجود
with src as (
  select p.name as prog, 'البرنامج الحي' as which, js.key, js.duration_days::text as d, coalesce(js.rules, '{}'::jsonb) as rules, js.program_id as pid
    from leaders.journey_stages js join leaders.programs p on p.id = js.program_id where js.active is not false
  union all
  select p.name, 'النسخة ' || v.number, s->>'key', s->>'duration_days', coalesce(s->'rules', '{}'::jsonb), v.program_id
    from leaders.program_versions v join leaders.programs p on p.id = v.program_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) s
   where coalesce((s->>'active')::boolean, true)
), per as (
  select prog, which, pid,
         max(case when key = 'ojt_coaching' then d end) as ojt_days,
         max(case when key = 'ojt_coaching' then rules::text end) as ojt_rules,
         bool_or(key = 'training') as has_training, bool_or(key = 'report') as has_report,
         string_agg(case when rules->>'unlock' = 'with' and rules->>'with' = 'ojt_coaching' then key end, '، ') as riders
    from src group by prog, which, pid
), post as (
  select distinct program_id as pid from leaders.stage_requirements where stage_key = 'ojt_coaching' and code = 'E-POST' and active is not false
)
select not exists (select 1 from per where ojt_rules is not null and (not has_training or pid in (select pid from post))) as ok,
       coalesce(string_agg(prog || ' (' || which || '): التوجيه مدته بالأيام ' || coalesce(ojt_days, '-') || '، قاعدته ' || coalesce(nullif(ojt_rules, '{}'), 'بعد ما قبله')
         || (case when not has_training then '، لا مرحلة «training» فلا تصح البذرة' else '' end)
         || (case when pid in (select pid from post) then '، فيه القياس البعدي فلا يصير مسارًا' else '' end)
         || (case when not has_report then '، لا «report» فلا تنتظره مرحلة' else '' end)
         || (case when riders is not null then '، يسير معه: ' || riders || ' (تصير بعد ما قبلها)' else '' end), ' | ' order by prog, which)
         filter (where ojt_rules is not null), 'لا برنامج فيه ojt_coaching') as detail
  from per;

-- 1) لكل دفعة مؤرخة: نافذة التوجيه الآن وبعد البذرة، ونهاية المراحل المتتابعة الآن وبعدها، والفرق عن نهاية الدفعة (chain_end_mismatch)
with recursive pick as (select null::text as name), c as (
  select id, name, program_id, program_version_id, starts_on, ends_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false) and coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
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
  -- المدة وتسير مع وإزاحتها من خطة الدفعة فوق النسخة، والموقوفة خارجها
  select st.cid, st.k, st.srt,
         coalesce(nullif(c.sch->st.k->>'days', '')::numeric, st.d0) as d,
         case when c.sch->st.k->'with' = 'false'::jsonb then null else coalesce(c.sch->st.k->>'with', case when st.rules->>'unlock' = 'with' then st.rules->>'with' end) end as w,
         coalesce(nullif(c.sch->st.k->>'offset', '')::numeric, case when c.sch->st.k ? 'with' then 0 else coalesce(nullif(st.rules->>'offset', '')::numeric, 0) end) as o
    from st join c on c.id = st.cid
   where coalesce(c.sch->st.k->>'off', '') <> 'true'
), sc as (
  select 'now' as sc, eff.* from eff
  union all
  select 'after', eff.* from eff where k <> 'ojt_coaching'
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
), track as (
  select w.cid, w.wfrom + coalesce(nullif(c.sch->'ojt_coaching'->>'offset', '')::int, 1) as tfrom, coalesce(c.ends_on, (select max(x.wto) from win x where x.sc = 'after' and x.cid = w.cid)) as tto
    from win w join c on c.id = w.cid where w.sc = 'after' and w.k = 'training'
), per as (
  select c.name, c.ends_on,
         exists (select 1 from jsonb_each(c.sch) e where e.value ? 'start' or e.value ? 'end') as approx,
         (select wfrom || ' إلى ' || wto from win where sc = 'now' and cid = c.id and k = 'ojt_coaching') as ojt_now,
         (select tfrom || ' إلى ' || tto from track where cid = c.id) as ojt_after,
         (select max(wto) from win where sc = 'now' and cid = c.id) as end_now,
         (select max(wto) from win where sc = 'after' and cid = c.id) as end_after
    from c where exists (select 1 from st where st.cid = c.id and st.k = 'ojt_coaching')
)
select true as ok,
       coalesce(string_agg(name || (case when approx then ' (تقريبي: تاريخ مثبت)' else '' end) || ': التوجيه الآن ' || coalesce(ojt_now, 'موقوف') || '، وبعد البذرة ' || coalesce(ojt_after, 'بلا تدريب')
         || '. نهاية المراحل المتتابعة ' || end_now || ' ثم ' || end_after
         || (case when ends_on is null then '' when end_after < ends_on then '، قبل نهاية الدفعة (' || ends_on || ') بـ' || (ends_on - end_after) || ' يومًا: يظهر تنبيه واحد و«اقترح مددًا»'
                  when end_after > ends_on then '، بعد نهاية الدفعة (' || ends_on || ') بـ' || (end_after - ends_on) || ' يومًا' else '، مع نهاية الدفعة' end), ' | ' order by name), 'لا دفعة مؤرخة فيها التوجيه') as detail
  from per;

-- 2) لكل دفعة مؤرخة: المراحل التي تتحرك نافذتها بالبذرة (ما بعد التوجيه يتقدم بقدر مدته إن كان متتابعًا)
with recursive pick as (select null::text as name), c as (
  select id, name, program_id, program_version_id, starts_on, ends_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false) and coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
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
  select 'after', eff.* from eff where k <> 'ojt_coaching'
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
)
select true as ok,
       coalesce(string_agg(c.name || ': المراحل التي تتحرك (' || m.n || '): ' || m.list, ' | ' order by c.name), 'لا مرحلة تتحرك نافذتها') as detail
  from moved m join c on c.id = m.cid;

-- 3) لكل دفعة مؤرخة: المعالم المرتبطة بالمراحل التي يتغير موعدها، وكم منها يصير متأخرًا الآن، وكم يبقى للبريد بعد حارس R0
-- (موعده من يوم الحارس فما بعد). ضبط MILESTONE_R0_CUTOFF على يوم ضبط البذرة قبلها يحجب بريد ما صار متأخرًا بها
with recursive pick as (select null::text as name), cut as (select date '2026-11-17' as d), c as (
  select id, name, program_id, program_version_id, starts_on, ends_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false) and coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
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
  select 'after', eff.* from eff where k <> 'ojt_coaching'
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
), win0 as (
  select o.sc, o.cid, o.k, c.starts_on + (g.off + ro.lead)::int as wfrom,
         c.starts_on + (g.off + ro.lead + greatest(o.d - 1, 0))::int as wto
    from ord o join root ro on ro.sc = o.sc and ro.cid = o.cid and ro.k = o.k join gs g on g.sc = o.sc and g.cid = o.cid and g.r = ro.r join c on c.id = o.cid
), win as (
  select * from win0
  union all
  select 'after', w.cid, 'ojt_coaching', w.wfrom + coalesce(nullif(c.sch->'ojt_coaching'->>'offset', '')::int, 1), coalesce(c.ends_on, (select max(x.wto) from win0 x where x.sc = 'after' and x.cid = w.cid))
    from win0 w join c on c.id = w.cid where w.sc = 'after' and w.k = 'training'
), due as (
  select c.id as cid, m.id as mid, m.title_ar, w.sc, (case when m.anchor = 'stage_end' then w.wto else w.wfrom end) + coalesce(m.offset_days, 0) as due
    from c join leaders.program_milestones m on m.program_id = c.program_id and m.active and m.anchor in ('stage_end', 'stage_start')
    join win w on w.cid = c.id and w.k = m.stage_key
   where nullif(c.sch->m.stage_key->>(case when m.anchor = 'stage_end' then 'end' else 'start' end), '') is null
), pair as (
  select a.cid, a.title_ar, a.due as before, b.due as after from due a join due b on b.cid = a.cid and b.mid = a.mid and b.sc = 'after'
   where a.sc = 'now' and a.due <> b.due
), per as (
  select cid, count(*) as moved, string_agg(title_ar || ' ' || before || '→' || after, '، ' order by after) as list,
         count(*) filter (where after < current_date - 3 and not before < current_date - 3) as late,
         count(*) filter (where after < current_date - 3 and not before < current_date - 3 and after >= (select d from cut)) as mailable
    from pair group by cid
)
select true as ok,
       coalesce(string_agg(c.name || ': المعالم التي يتغير موعدها (' || p.moved || '): ' || p.list || '. يصير منها متأخرًا بعد المهلة ' || p.late || '، وللبريد بعد الحارس ' || p.mailable, ' | ' order by c.name), 'لا معلم يتغير موعده') as detail
  from per p join c on c.id = p.cid;

-- 4) لكل دفعة (والمفتوحة منها): كم عضوًا لم يكمل بنود التوجيه الإلزامية. بعد البذرة لا ينتظره الدعم ولا التقييم ولا ما بعدهما،
-- ويبقى «التقرير النهائي» وحده ينتظره. العضوية تقريبية كما في verify-r0-journey-dates.sql (إلحاق غير منسحب، أو جهة الدفعة)
with pick as (select null::text as name), c as (
  select id, name, program_id, organization_id, coalesce(is_default, false) as open from leaders.cohorts where coalesce(status, '') <> 'closed'
     and ((select name from pick) is null or name = (select name from pick))
), req as (
  select r.program_id, r.id from leaders.stage_requirements r where r.stage_key = 'ojt_coaching' and r.required is not false and r.active is not false
), mem as (
  select distinct c.id as cid, c.program_id, p.id as pid
    from c join leaders.participants p on not p.is_demo and not coalesce(p.is_test, false) and p.status not in ('withdrawn', 'suspended')
   where exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.cohort_id = c.id and e.status <> 'withdrawn')
      or (c.organization_id is not null and p.organization_id = c.organization_id
          and not exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.status <> 'withdrawn'))
), open_items as (
  select mem.cid, mem.pid from mem join req on req.program_id = mem.program_id
    left join leaders.participant_requirements pr on pr.participant_id = mem.pid and pr.requirement_id = req.id
   where coalesce(pr.status, 'pending') <> 'done' group by mem.cid, mem.pid
), per as (
  select c.name, c.open, (select count(*) from mem where mem.cid = c.id) as members, (select count(*) from open_items o where o.cid = c.id) as waiting
    from c where exists (select 1 from req where req.program_id = c.program_id)
)
select true as ok,
       coalesce(string_agg(name || (case when open then ' (المفتوحة)' else '' end) || ': ' || 'لم يكمل بنود التوجيه الإلزامية ' || waiting || ' من ' || members, ' | ' order by name), 'لا دفعة فيها بنود التوجيه') as detail
  from per;
