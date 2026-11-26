-- تصور طول القياس البعدي (docs/content/2026-11-26-تصور-طول-القياس-البعدي-v1.md)، المرحلة 1: إحصاء فقرات البعدي المرتبطة
-- بالقبلي من إجابات القبلي المسلمة، واقتراح نواة الصيغة القصيرة بأرقامها. قراءة فقط، ولا يغيّر شيئًا. أساس قرار المالك قبل
-- ترحيل تعليم النواة (20261130030000 في التصور §6). يُشغَّل بسير migrate.yml في الوضع verify وملفه scripts/db/verify-post-core.sql،
-- أو محليًا: SUPABASE_ACCESS_TOKEN=... node scripts/db/apply-migration.mjs --verify scripts/db/verify-post-core.sql
-- المصدر: الأداة البعدية النشطة (أعلى نسخة)، وقبليها pairs_with. الفقرة المرتبطة: لها anchor_code وليست فقرة مستوى ولا انتقال تعلم.
-- الطبقة هي tier (ممارسة behavior، مواقف skill، معرفة knowledge). الدرجة assessment_answers.score، و«لا ينطبق» (سالبة) خارجها.
-- الارتباط المصحح: ارتباط الفقرة بمجموع بقية فقرات بُعدها وطبقتها لدى الشخص نفسه. ألفا من متوسط التباين والتغاير الزوجي
-- (k متوسط التغاير على متوسط التباين ومجموع التغايرات)، لأن كل مشارك يجيب صيغة واحدة فلا إجابات كاملة لكل الفقرات.
-- الموضع (slot): الفقرة وأختها في الصيغة الأخرى (الرمز بلا B الأخير) والتوأم مع أصله، يُختار معًا فيبقى التكافؤ.
-- قواعد النواة (قرار المالك 2026-11-26): لكل بُعد المواضع بأعلى ارتباط مصحح حتى ميزانية 40 دقيقة (55 دقيقة لـ140 فقرة)
-- بعد بنود انتقال التعلم كلها، وأعلى موضع في كل طبقة دائمًا، و6 فقرات على الأقل لكل بُعد، وألفا 0.70 على الأقل، والنواة نفسها
-- لكل المستويات لأن فقرات المستوى خارجها. ✗ في الفحص 3 أو 4 = النواة المقترحة لا تبلغ الشرط، فلا تُعلَّم قبل مراجعتها.

-- 1) إحصاء كل فقرة مرتبطة من القبلي: العدد والمتوسط والارتباط المصحح داخل بُعدها وطبقتها
with post as (
  select i.id, i.pairs_with from leaders.instruments i where i.kind = 'post' and i.active order by i.version desc limit 1
), pre_i as (
  select b.id from leaders.instruments b join post on b.key = post.pairs_with
), linked as (
  select q.code, q.dimension, q.tier, q.anchor_code,
         case when q.form is not null then regexp_replace(q.anchor_code, 'B$', '') else q.anchor_code end as slot
    from leaders.questions q join post on q.instrument_id = post.id
   where q.active and q.anchor_code is not null and q.min_level is null and q.tier <> 'transfer'
), pq as (
  select q.id, q.code, q.dimension, q.tier from leaders.questions q join pre_i on q.instrument_id = pre_i.id
   where q.active and q.code in (select anchor_code from linked)
), sc as (
  select x.assessment_id as aid, pq.code, pq.dimension, pq.tier, x.score::float8 as s
    from leaders.assessment_answers x
    join leaders.assessments a on a.id = x.assessment_id and a.status = 'submitted'
    join pre_i on a.instrument_id = pre_i.id
    join pq on pq.id = x.question_id
   where x.score is not null and x.score >= 0
), tot as (
  select aid, dimension, tier, sum(s) as t from sc group by 1, 2, 3
), items as (
  select sc.code, sc.dimension, sc.tier, count(*) as n, avg(sc.s) as mean, corr(sc.s, tot.t - sc.s) as r
    from sc join tot using (aid, dimension, tier) group by 1, 2, 3
), slots as (
  select l.dimension, l.slot, min(l.tier) as tier, count(distinct l.code) as rows_n, avg(i.r) as r
    from linked l left join items i on i.code = l.anchor_code group by 1, 2
), ranked as (
  select s.*, row_number() over (partition by dimension, tier order by r desc nulls last, slot) as tier_rk,
         sum(rows_n) over (partition by dimension order by r desc nulls last, slot) as cum
    from slots s
), budget as (
  select greatest(6, floor((floor(40 * 140 / 55.0) - (select count(*) from leaders.questions q join post on q.instrument_id = post.id
                                                     where q.active and q.tier = 'transfer')) / 3)) as per_dim
), core as (
  select r.* from ranked r cross join budget b where r.cum <= b.per_dim or r.tier_rk = 1
), core_rows as (
  select l.* from linked l join core c on c.dimension = l.dimension and c.slot = l.slot
), cov as (
  select a.dimension, a.code as c1, b.code as c2, covar_samp(a.s, b.s) as v
    from sc a join sc b on a.aid = b.aid and a.dimension = b.dimension and a.code <= b.code
   where a.code in (select anchor_code from core_rows) and b.code in (select anchor_code from core_rows)
   group by 1, 2, 3
), alpha as (
  select c.dimension, count(*) as k,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 = c2) as var_avg,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 <> c2) as cov_avg
    from core c group by c.dimension
)
select true as ok,
       coalesce((select string_agg(dimension || '/' || tier || ' ' || code || ': ن ' || n || case when n < 5 then '، دون 5 فلا أرقام' else '، م ' || round(mean::numeric, 2)
                 || '، ر ' || coalesce(round(r::numeric, 2)::text, '؟') end, '؛ ' order by dimension, tier, r desc nulls last, code) from items),
                'لا إجابات قبلي مسلمة على فقرات مرتبطة') as detail;

-- 2) فقرات مرتبطة ارتباطها المصحح دون 0.20 أو بلا بيانات (مرشحة للبقاء خارج النواة)
with post as (
  select i.id, i.pairs_with from leaders.instruments i where i.kind = 'post' and i.active order by i.version desc limit 1
), pre_i as (
  select b.id from leaders.instruments b join post on b.key = post.pairs_with
), linked as (
  select q.code, q.dimension, q.tier, q.anchor_code,
         case when q.form is not null then regexp_replace(q.anchor_code, 'B$', '') else q.anchor_code end as slot
    from leaders.questions q join post on q.instrument_id = post.id
   where q.active and q.anchor_code is not null and q.min_level is null and q.tier <> 'transfer'
), pq as (
  select q.id, q.code, q.dimension, q.tier from leaders.questions q join pre_i on q.instrument_id = pre_i.id
   where q.active and q.code in (select anchor_code from linked)
), sc as (
  select x.assessment_id as aid, pq.code, pq.dimension, pq.tier, x.score::float8 as s
    from leaders.assessment_answers x
    join leaders.assessments a on a.id = x.assessment_id and a.status = 'submitted'
    join pre_i on a.instrument_id = pre_i.id
    join pq on pq.id = x.question_id
   where x.score is not null and x.score >= 0
), tot as (
  select aid, dimension, tier, sum(s) as t from sc group by 1, 2, 3
), items as (
  select sc.code, sc.dimension, sc.tier, count(*) as n, avg(sc.s) as mean, corr(sc.s, tot.t - sc.s) as r
    from sc join tot using (aid, dimension, tier) group by 1, 2, 3
), slots as (
  select l.dimension, l.slot, min(l.tier) as tier, count(distinct l.code) as rows_n, avg(i.r) as r
    from linked l left join items i on i.code = l.anchor_code group by 1, 2
), ranked as (
  select s.*, row_number() over (partition by dimension, tier order by r desc nulls last, slot) as tier_rk,
         sum(rows_n) over (partition by dimension order by r desc nulls last, slot) as cum
    from slots s
), budget as (
  select greatest(6, floor((floor(40 * 140 / 55.0) - (select count(*) from leaders.questions q join post on q.instrument_id = post.id
                                                     where q.active and q.tier = 'transfer')) / 3)) as per_dim
), core as (
  select r.* from ranked r cross join budget b where r.cum <= b.per_dim or r.tier_rk = 1
), core_rows as (
  select l.* from linked l join core c on c.dimension = l.dimension and c.slot = l.slot
), cov as (
  select a.dimension, a.code as c1, b.code as c2, covar_samp(a.s, b.s) as v
    from sc a join sc b on a.aid = b.aid and a.dimension = b.dimension and a.code <= b.code
   where a.code in (select anchor_code from core_rows) and b.code in (select anchor_code from core_rows)
   group by 1, 2, 3
), alpha as (
  select c.dimension, count(*) as k,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 = c2) as var_avg,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 <> c2) as cov_avg
    from core c group by c.dimension
)
select coalesce(bool_and(i.r is not null and i.r >= 0.2), true) and exists (select 1 from items) as ok,
       count(*) filter (where i.r is null or i.r < 0.2) || ' من ' || count(*) || ' فقرة مرتبطة'
         || coalesce(': ' || string_agg(l.anchor_code, '، ' order by l.anchor_code) filter (where i.r is null or i.r < 0.2), '') as detail
  from (select distinct anchor_code from linked) l left join items i on i.code = l.anchor_code;

-- 3) النواة المقترحة لكل بُعد: مواضعها وفقراتها وثبات ألفا (6 فقرات على الأقل وألفا 0.70)
with post as (
  select i.id, i.pairs_with from leaders.instruments i where i.kind = 'post' and i.active order by i.version desc limit 1
), pre_i as (
  select b.id from leaders.instruments b join post on b.key = post.pairs_with
), linked as (
  select q.code, q.dimension, q.tier, q.anchor_code,
         case when q.form is not null then regexp_replace(q.anchor_code, 'B$', '') else q.anchor_code end as slot
    from leaders.questions q join post on q.instrument_id = post.id
   where q.active and q.anchor_code is not null and q.min_level is null and q.tier <> 'transfer'
), pq as (
  select q.id, q.code, q.dimension, q.tier from leaders.questions q join pre_i on q.instrument_id = pre_i.id
   where q.active and q.code in (select anchor_code from linked)
), sc as (
  select x.assessment_id as aid, pq.code, pq.dimension, pq.tier, x.score::float8 as s
    from leaders.assessment_answers x
    join leaders.assessments a on a.id = x.assessment_id and a.status = 'submitted'
    join pre_i on a.instrument_id = pre_i.id
    join pq on pq.id = x.question_id
   where x.score is not null and x.score >= 0
), tot as (
  select aid, dimension, tier, sum(s) as t from sc group by 1, 2, 3
), items as (
  select sc.code, sc.dimension, sc.tier, count(*) as n, avg(sc.s) as mean, corr(sc.s, tot.t - sc.s) as r
    from sc join tot using (aid, dimension, tier) group by 1, 2, 3
), slots as (
  select l.dimension, l.slot, min(l.tier) as tier, count(distinct l.code) as rows_n, avg(i.r) as r
    from linked l left join items i on i.code = l.anchor_code group by 1, 2
), ranked as (
  select s.*, row_number() over (partition by dimension, tier order by r desc nulls last, slot) as tier_rk,
         sum(rows_n) over (partition by dimension order by r desc nulls last, slot) as cum
    from slots s
), budget as (
  select greatest(6, floor((floor(40 * 140 / 55.0) - (select count(*) from leaders.questions q join post on q.instrument_id = post.id
                                                     where q.active and q.tier = 'transfer')) / 3)) as per_dim
), core as (
  select r.* from ranked r cross join budget b where r.cum <= b.per_dim or r.tier_rk = 1
), core_rows as (
  select l.* from linked l join core c on c.dimension = l.dimension and c.slot = l.slot
), cov as (
  select a.dimension, a.code as c1, b.code as c2, covar_samp(a.s, b.s) as v
    from sc a join sc b on a.aid = b.aid and a.dimension = b.dimension and a.code <= b.code
   where a.code in (select anchor_code from core_rows) and b.code in (select anchor_code from core_rows)
   group by 1, 2, 3
), alpha as (
  select c.dimension, count(*) as k,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 = c2) as var_avg,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 <> c2) as cov_avg
    from core c group by c.dimension
)
select coalesce(bool_and(rows_n >= 6 and a.alpha >= 0.70), false) as ok,
       coalesce(string_agg(d.dimension || ': ' || d.slots || ' موضعًا، ' || d.rows_n || ' فقرة، ألفا '
         || coalesce(round(a.alpha::numeric, 2)::text, '؟') || ' (' || d.codes || ')', '؛ ' order by d.dimension), 'لا أداة بعدية نشطة مرتبطة') as detail
  from (select c.dimension, count(distinct c.slot) as slots, count(*) as rows_n, string_agg(c.code, '، ' order by c.code) as codes
          from core_rows c group by c.dimension) d
  left join (select dimension, case when var_avg is null or cov_avg is null or k < 2 then null
                                    else k * cov_avg / nullif(var_avg + (k - 1) * cov_avg, 0) end as alpha from alpha) a using (dimension);

-- 4) الزمن التقديري للصيغة القصيرة لكل مستوى (النواة وبنود انتقال التعلم، 55 دقيقة لـ140 فقرة)، والسقف 40
with post as (
  select i.id, i.pairs_with from leaders.instruments i where i.kind = 'post' and i.active order by i.version desc limit 1
), pre_i as (
  select b.id from leaders.instruments b join post on b.key = post.pairs_with
), linked as (
  select q.code, q.dimension, q.tier, q.anchor_code,
         case when q.form is not null then regexp_replace(q.anchor_code, 'B$', '') else q.anchor_code end as slot
    from leaders.questions q join post on q.instrument_id = post.id
   where q.active and q.anchor_code is not null and q.min_level is null and q.tier <> 'transfer'
), pq as (
  select q.id, q.code, q.dimension, q.tier from leaders.questions q join pre_i on q.instrument_id = pre_i.id
   where q.active and q.code in (select anchor_code from linked)
), sc as (
  select x.assessment_id as aid, pq.code, pq.dimension, pq.tier, x.score::float8 as s
    from leaders.assessment_answers x
    join leaders.assessments a on a.id = x.assessment_id and a.status = 'submitted'
    join pre_i on a.instrument_id = pre_i.id
    join pq on pq.id = x.question_id
   where x.score is not null and x.score >= 0
), tot as (
  select aid, dimension, tier, sum(s) as t from sc group by 1, 2, 3
), items as (
  select sc.code, sc.dimension, sc.tier, count(*) as n, avg(sc.s) as mean, corr(sc.s, tot.t - sc.s) as r
    from sc join tot using (aid, dimension, tier) group by 1, 2, 3
), slots as (
  select l.dimension, l.slot, min(l.tier) as tier, count(distinct l.code) as rows_n, avg(i.r) as r
    from linked l left join items i on i.code = l.anchor_code group by 1, 2
), ranked as (
  select s.*, row_number() over (partition by dimension, tier order by r desc nulls last, slot) as tier_rk,
         sum(rows_n) over (partition by dimension order by r desc nulls last, slot) as cum
    from slots s
), budget as (
  select greatest(6, floor((floor(40 * 140 / 55.0) - (select count(*) from leaders.questions q join post on q.instrument_id = post.id
                                                     where q.active and q.tier = 'transfer')) / 3)) as per_dim
), core as (
  select r.* from ranked r cross join budget b where r.cum <= b.per_dim or r.tier_rk = 1
), core_rows as (
  select l.* from linked l join core c on c.dimension = l.dimension and c.slot = l.slot
), cov as (
  select a.dimension, a.code as c1, b.code as c2, covar_samp(a.s, b.s) as v
    from sc a join sc b on a.aid = b.aid and a.dimension = b.dimension and a.code <= b.code
   where a.code in (select anchor_code from core_rows) and b.code in (select anchor_code from core_rows)
   group by 1, 2, 3
), alpha as (
  select c.dimension, count(*) as k,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 = c2) as var_avg,
         (select avg(v) from cov where cov.dimension = c.dimension and c1 <> c2) as cov_avg
    from core c group by c.dimension
)
select coalesce(bool_and(m <= 40), true) as ok, string_agg(lvl || ': ' || n || ' فقرة، نحو ' || m || ' دقيقة', '، ' order by r) as detail
  from (select l.lvl, l.r, t.n, round(t.n * 55.0 / 140) as m
          from (values ('مبتدئ', 1), ('متوسط', 2), ('متقدم', 3)) l(lvl, r)
          cross join (select (select count(*) from core_rows)
                           + (select count(*) from leaders.questions q join post on q.instrument_id = post.id where q.active and q.tier = 'transfer') as n) t) x;
