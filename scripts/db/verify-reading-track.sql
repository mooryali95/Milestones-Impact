-- تصور المرحلة 3، المرحلة 3.4 (قراءة فقط): ما يمسه الترحيل 20261129220000_leaders_reading_track، وطول القياس البعدي لكل مستوى
-- كل فحص يعيد صفًا واحدًا: ok، وdetail ما وجده
-- 1) بنود «قراءة الكتاب» T-HB الحية التي سيتحول نطاقها من all إلى track (بعد التطبيق: صفر)
select count(*) = 0 as ok, 'بنود T-HB بنطاق all الآن: ' || count(*) as detail
  from leaders.stage_requirements where code = 'T-HB' and kind = 'reading' and config = '{"scope": "all", "quiz": true}'::jsonb;
-- 2) نسخ البرامج المجمدة التي فيها T-HB بنطاق all (بعد التطبيق: صفر)
select count(*) = 0 as ok, 'نسخ برامج فيها T-HB بنطاق all: ' || count(*) as detail
  from leaders.program_versions v
 where jsonb_typeof(v.data->'requirements') = 'array' and exists (select 1 from jsonb_array_elements(v.data->'requirements') r
   where r->>'code' = 'T-HB' and r->>'kind' = 'reading' and r->'config' = '{"scope": "all", "quiz": true}'::jsonb);
-- 3) الدفعات الجارية التي تقرأ T-HB ومشاركوها النشطون: من يتغير إلزامه (لا ينقص محسوبه بقاعدة «لا فقد»)
select true as ok, 'دفعات جارية ' || count(distinct c.id) || '، ومشاركون مسجلون فيها ' || count(e.participant_id) as detail
  from leaders.cohorts c left join leaders.enrollments e on e.cohort_id = c.id and e.status = 'active'
 where c.status = 'running';
-- 4) القياس البعدي النشط: عدد الفقرات وتقدير الدقائق لمن مستواه واحد في الأطر الثلاثة (55 دقيقة لـ140 فقرة)، والقرار 7 سقفه 40
select coalesce(bool_and(m <= 40), true) as ok,
       coalesce(string_agg(lvl || ': ' || n || ' فقرة، نحو ' || m || ' دقيقة', '، ' order by r), 'لا أداة بعدية نشطة') as detail
  from (
    select l.lvl, l.r, count(q.id) as n, round(count(q.id) * 55.0 / 140) as m
      from (values ('beginner', 1), ('intermediate', 2), ('advanced', 3)) l(lvl, r)
      join leaders.instruments i on i.kind = 'post' and i.active
      join leaders.questions q on q.instrument_id = i.id and q.active
       and (q.min_level is null or (case q.min_level when 'beginner' then 1 when 'intermediate' then 2 else 3 end) <= l.r)
     group by l.lvl, l.r
  ) t;
-- 5) فقرات المعرفة في البعدي لكل مستوى (ما يُنقل إلى نسخة اختيارية إن تجاوز السقف، بلا فقرات السلوك والمرتبطة بالقبلي)
select true as ok, coalesce(string_agg(lvl || ': معرفة ' || k || '، منها بلا ارتباط بالقبلي ' || u, '، ' order by r), 'لا أداة') as detail
  from (
    select l.lvl, l.r, count(q.id) filter (where q.tier = 'knowledge') as k,
           count(q.id) filter (where q.tier = 'knowledge' and q.anchor_code is null) as u
      from (values ('beginner', 1), ('intermediate', 2), ('advanced', 3)) l(lvl, r)
      join leaders.instruments i on i.kind = 'post' and i.active
      join leaders.questions q on q.instrument_id = i.id and q.active
       and (q.min_level is null or (case q.min_level when 'beginner' then 1 when 'intermediate' then 2 else 3 end) <= l.r)
     group by l.lvl, l.r
  ) t;
