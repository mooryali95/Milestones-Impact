-- R0 «تاريخ واحد» (تصور محرر رحلة الدفعة، docs/ops/2026-11-17-تصور-محرر-رحلة-الدفعة-v1.md): ما يتغير على الإنتاج بعد النشر. قراءة فقط.
-- يُشغَّل بسير migrate.yml في الوضع verify (المسار: scripts/db/verify-r0-journey-dates.sql)، أو يُلصق كل فحص في محرر SQL في Supabase.
-- بعد R0 يُؤرَّخ كل معلم «بداية مرحلة» أو «نهاية مرحلة» لم يُكتب لمرحلته تاريخ في cohorts.schedule، بنافذة مرحلته المحسوبة من
-- starts_on ومدد مراحل نسخة الدفعة (stageWindows في stage-windows.js: المجموعة «تبدأ مع» تبدأ معًا، وما بعدها حين تنتهي أطولها).
-- الحساب هنا يحاكي stageWindows لدفعة بلا جدول مكتوب، ويُعلَّم «تقريبي» لدفعة لها جدول جزئي (التاريخ المكتوب يزيح ما بعده).
-- الأعداد على مستوى المعلم لا المشارك: «متأخر» يظهر لكل عضو لم ينجزه. والبريد لا يُرسل عن معلم موعده قبل 2026-11-17 (القرار 19).
-- والدفعة المفتوحة (is_default) لا تُؤرَّخ معالمها بالنافذة ولو كان لها starts_on (القرار 21)، فهي خارج الحساب ويسردها الفحص 0.
-- والمرحلة ببداية مكتوبة بلا نهاية: نهايتها البداية بمدتها (stageWindows بعد مراجعة R0)، وتدخل الدفعة في «تقريبي».

-- 0) الدفعة المفتوحة ولها starts_on: لا يتغير لها شيء بعد R0، ويُسرد للعلم وحده
select true as ok,
       coalesce(string_agg(name || ' (starts_on ' || starts_on || ')', ' | ' order by name), 'لا دفعة مفتوحة لها starts_on') as detail
  from leaders.cohorts where coalesce(is_default, false) and starts_on is not null;

-- 1) لكل دفعة: كم معلمًا يصير مؤرخًا، وكم منها يظهر متأخرًا الآن، وكم بعد مهلة الأيام الثلاثة، وكم يبقى للبريد (موعده من 2026-11-17)
with recursive c as (
  select id, name, program_id, program_version_id, starts_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false)
), st as (
  select c.id as cid, s->>'key' as k, coalesce((s->>'sort')::numeric, 0) as srt, round(coalesce((s->>'duration_days')::numeric, 0)) as d, coalesce(s->'rules', '{}'::jsonb) as rules
    from c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) s
   where coalesce((s->>'active')::boolean, true)
  union all
  select c.id, js.key, coalesce(js.sort, 0)::numeric, round(coalesce(js.duration_days, 0)::numeric), coalesce(js.rules, '{}'::jsonb)
    from c join leaders.journey_stages js on js.program_id = c.program_id and js.active is not false
   where c.program_version_id is null
), ord as (
  select st.*, row_number() over (partition by cid order by srt, k) as rn from st
), root(cid, k, rn, r) as (
  select o.cid, o.k, o.rn, o.k from ord o
   where not (o.rules->>'unlock' = 'with' and exists (select 1 from ord p where p.cid = o.cid and p.k = o.rules->>'with' and p.rn < o.rn))
  union all
  select o.cid, o.k, o.rn, root.r from ord o join root on root.cid = o.cid and root.k = o.rules->>'with'
   where o.rules->>'unlock' = 'with' and root.rn < o.rn
), grp as (
  select ro.cid, ro.r, min(ro.rn) as grn, max(o.d) as len from root ro join ord o on o.cid = ro.cid and o.k = ro.k group by ro.cid, ro.r
), gs as (
  select grp.*, coalesce(sum(len) over (partition by cid order by grn rows between unbounded preceding and 1 preceding), 0) as off from grp
), win as (
  select o.cid, o.k, c.starts_on + g.off::int as wfrom, c.starts_on + (g.off + o.d)::int as wto
    from ord o join root ro on ro.cid = o.cid and ro.k = o.k join gs g on g.cid = o.cid and g.r = ro.r join c on c.id = o.cid
), ms as (
  select c.id as cid, m.id as mid, m.anchor, m.stage_key, m.offset_days
    from c join leaders.program_milestones m on m.program_id = c.program_id and m.active and m.anchor in ('stage_end', 'stage_start')
   where nullif(c.sch->m.stage_key->>(case when m.anchor = 'stage_end' then 'end' else 'start' end), '') is null
), dated as (
  select ms.cid, (case when ms.anchor = 'stage_end' then w.wto else w.wfrom end) + ms.offset_days as due
    from ms join win w on w.cid = ms.cid and w.k = ms.stage_key
), per as (
  select c.name, c.sch <> '{}'::jsonb as partial, count(d.due) as dated,
         count(d.due) filter (where d.due < current_date) as late,
         count(d.due) filter (where d.due < current_date - 3) as late_grace,
         count(d.due) filter (where d.due >= date '2026-11-17') as mailable
    from c left join dated d on d.cid = c.id group by c.id, c.name, c.sch
)
select true as ok,
       coalesce(string_agg(name || (case when partial then ' (تقريبي: جدول جزئي)' else '' end) || ': يُؤرَّخ ' || dated || '، متأخر الآن ' || late
         || '، بعد المهلة ' || late_grace || '، يبقى للبريد ' || mailable, ' | ' order by name) filter (where dated > 0), 'لا معلم يصير مؤرخًا') as detail
  from per;

-- 2) القرار 8: مراحل البرنامج الافتراضي كما هي (المدة ونص المدة وقاعدة الفتح)، لحسم «التدريب كم يوم» و«تبدأ مع»
select true as ok,
       coalesce(string_agg(js.key || ' «' || js.title_ar || '» ' || coalesce(js.duration_days::text, '-') || ' يوم، النص «' || coalesce(js.duration_label, '-') || '»، '
         || coalesce(nullif(js.rules::text, '{}'), 'بلا قاعدة') || (case when js.active is false then '، موقوفة' else '' end), ' | ' order by js.sort), 'لا مراحل') as detail
  from leaders.journey_stages js join leaders.programs p on p.id = js.program_id and p.is_default;

-- 3) التقييم الختامي الحي (final.js: يُخصم نصف معلم عن كل «متأخر» أو «أُنجز بعد موعده» فوق المهلة): لكل دفعة، كم مشاركًا
-- لم يُرفع تقييمه بعد (لا صف أو draft أو returned؛ المرفوع مجمّد في snapshot) يزيد عنده عدد المتأخر بعد R0، وأقصى زيادة.
-- العضوية تقريبية: إلحاق غير منسحب بالدفعة، أو جهة الدفعة لمن لا إلحاق له. والمعلم المكتمل بإتمام مرحلته (complete = 'stage')
-- لا يُعرف إتمامه من هنا، فيُعد متأخرًا إن لم يكن له done_at: الرقم حد أعلى
with recursive c as (
  select id, name, program_id, program_version_id, organization_id, starts_on, coalesce(schedule, '{}'::jsonb) as sch
    from leaders.cohorts where starts_on is not null and not coalesce(is_default, false)
), st as (
  select c.id as cid, s->>'key' as k, coalesce((s->>'sort')::numeric, 0) as srt, round(coalesce((s->>'duration_days')::numeric, 0)) as d, coalesce(s->'rules', '{}'::jsonb) as rules
    from c join leaders.program_versions v on v.id = c.program_version_id
    cross join lateral jsonb_array_elements(coalesce(v.data->'stages', '[]'::jsonb)) s
   where coalesce((s->>'active')::boolean, true)
  union all
  select c.id, js.key, coalesce(js.sort, 0)::numeric, round(coalesce(js.duration_days, 0)::numeric), coalesce(js.rules, '{}'::jsonb)
    from c join leaders.journey_stages js on js.program_id = c.program_id and js.active is not false
   where c.program_version_id is null
), ord as (
  select st.*, row_number() over (partition by cid order by srt, k) as rn from st
), root(cid, k, rn, r) as (
  select o.cid, o.k, o.rn, o.k from ord o
   where not (o.rules->>'unlock' = 'with' and exists (select 1 from ord p where p.cid = o.cid and p.k = o.rules->>'with' and p.rn < o.rn))
  union all
  select o.cid, o.k, o.rn, root.r from ord o join root on root.cid = o.cid and root.k = o.rules->>'with'
   where o.rules->>'unlock' = 'with' and root.rn < o.rn
), grp as (
  select ro.cid, ro.r, min(ro.rn) as grn, max(o.d) as len from root ro join ord o on o.cid = ro.cid and o.k = ro.k group by ro.cid, ro.r
), gs as (
  select grp.*, coalesce(sum(len) over (partition by cid order by grn rows between unbounded preceding and 1 preceding), 0) as off from grp
), win as (
  select o.cid, o.k, c.starts_on + g.off::int as wfrom, c.starts_on + (g.off + o.d)::int as wto
    from ord o join root ro on ro.cid = o.cid and ro.k = o.k join gs g on g.cid = o.cid and g.r = ro.r join c on c.id = o.cid
), dated as (
  select c.id as cid, m.id as mid, (case when m.anchor = 'stage_end' then w.wto else w.wfrom end) + m.offset_days as due
    from c join leaders.program_milestones m on m.program_id = c.program_id and m.active and m.anchor in ('stage_end', 'stage_start')
    join win w on w.cid = c.id and w.k = m.stage_key
   where nullif(c.sch->m.stage_key->>(case when m.anchor = 'stage_end' then 'end' else 'start' end), '') is null
), mem as (
  select distinct c.id as cid, c.program_id, p.id as pid
    from c join leaders.participants p on not p.is_demo and not coalesce(p.is_test, false)
   where exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.cohort_id = c.id and e.status <> 'withdrawn')
      or (c.organization_id is not null and p.organization_id = c.organization_id
          and not exists (select 1 from leaders.enrollments e where e.participant_id = p.id and e.status <> 'withdrawn'))
), hit as (
  select mem.cid, mem.pid, count(*) as added
    from mem join dated d on d.cid = mem.cid
    left join leaders.participant_milestones pm on pm.participant_id = mem.pid and pm.milestone_id = d.mid
    left join leaders.final_evaluations f on f.participant_id = mem.pid and f.program_id = mem.program_id
   where coalesce(f.status, 'draft') in ('draft', 'returned') and pm.due_override is null
     and ((pm.done_at is null and d.due < current_date - 3) or (pm.done_at is not null and pm.done_at::date > d.due + 3))
   group by mem.cid, mem.pid
)
select true as ok,
       coalesce(string_agg(c.name || ': ' || x.people || ' مشاركًا تقييمهم لم يُرفع يزيد متأخرهم، أقصاه ' || x.most || ' معالم (نصف معلم من مكوّن المعالم لكل واحد)', ' | ' order by c.name), 'لا مشارك يتغير تقييمه الختامي الحي') as detail
  from (select cid, count(*) as people, max(added) as most from hit group by cid) x join c on c.id = x.cid;
