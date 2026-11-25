-- بعد ترحيل 20261128170000_leaders_duplicates_and_cohort_backfill: هل أُرشف المكرر وأُلحق كل من بقي. قراءة فقط: لا يكتب شيئًا.
-- يُشغَّل بسير migrate.yml في الوضع verify. كل فحص يرجع صفًا واحدًا (ok، detail) كما يقرؤه scripts/db/apply-migration.mjs --verify.
-- بصمات أسماء حسابات الاختبار الخمسة هي نفسها في الترحيل (md5 بعد حذف كل فراغ طرفي)، فلا تُكتب الأسماء هنا.

-- 1) من لا دفعة له من غير التجريبيين، بسببه. ok = لا باقٍ غير مستثنى
with lone as (
  select pa.*, md5(regexp_replace(coalesce(pa.full_name, ''), '^[\s ]+|[\s ]+$', '', 'g')) in ('fabd495fc8a7654531ea1b20e4260a4a', '95f8958a8fbcda02de1a8a5cf8f4f3a9', '34bba4869d4a4a9b23ca3d3b021ffa9b',
                                                          '406c5913519e5427b9a6717e29cf2f12', 'a3b0d8be3bc69a1c348a6f2ec974a3eb') as named_test,
         exists (select 1 from leaders.audit_log l where l.action = 'participant.duplicate_archived' and l.entity_id = pa.id::text) as archived
    from leaders.participants pa
   where not pa.is_demo
     and not exists (select 1 from leaders.enrollments e where e.participant_id = pa.id and e.status <> 'withdrawn')),
r as (
  select case when is_test or named_test then 'test' when archived then 'archived' when status in ('suspended', 'withdrawn') then 'out' else 'remaining' end as why
    from lone)
select count(*) filter (where why = 'remaining') = 0 as ok,
       'اختبار مستثنى=' || count(*) filter (where why = 'test') || ' · مؤرشف مكرر=' || count(*) filter (where why = 'archived')
       || ' · موقوف أو منسحب=' || count(*) filter (where why = 'out') || ' · باقٍ بلا دفعة=' || count(*) filter (where why = 'remaining') as detail
  from r;

-- 2) إلحاقات الترحيل بالدفعة المستهدفة ونتيجتها (معلومة)
select true as ok, coalesce(string_agg(x.name || ' (' || x.outcome || ')=' || x.n, ' | ' order by x.n desc, x.name), 'لا إلحاق من الترحيل') || ' · المجموع=' || coalesce(sum(x.n), 0) as detail
  from (select coalesce(c.name, 'بلا دفعة') as name, cp.outcome, count(*) as n
          from leaders.cohort_placements cp left join leaders.cohorts c on c.id = cp.cohort_id
         where cp.actor = 'migration:20261128170000' group by 1, 2) x;

-- 3) الأزواج المؤرشفة: المكرر موقوف والباقي قائم، ولا هاتف مكرر بين القائمين بعد. البريد مقنَّع
with a as (
  select l.entity_id::uuid as dup_id, (l.after->>'kept_id')::uuid as kept_id from leaders.audit_log l where l.action = 'participant.duplicate_archived'),
mask as (select id, status, left(split_part(email, '@', 1), 3) || '…@' || split_part(email, '@', 2) as m from leaders.participants),
left_dups as (
  select count(*) as n from (
    select regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') as d
      from leaders.participants where not is_demo and status not in ('suspended', 'withdrawn')) p
   where length(d) >= 8
   group by case when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2) when d ~ '^5[0-9]{8}$' then '966' || d else d end having count(*) > 1)
select coalesce(bool_and(d.status = 'suspended' and k.status not in ('suspended', 'withdrawn')), true) and (select count(*) from left_dups) = 0 as ok,
       coalesce(string_agg(d.m || ' (' || d.status || ') ← بقي ' || k.m || ' (' || k.status || ')', ' | '), 'لا زوج مؤرشف')
       || ' · هواتف مكررة بين القائمين=' || (select count(*) from left_dups) as detail
  from a join mask d on d.id = a.dup_id join mask k on k.id = a.kept_id;

-- 4) لا مشارك في دفعتين. ok = صفر
select count(*) = 0 as ok, 'مشاركون بأكثر من إلحاق قائم=' || count(*) as detail
  from (select e.participant_id from leaders.enrollments e where e.status <> 'withdrawn' group by e.participant_id having count(*) > 1) x;
