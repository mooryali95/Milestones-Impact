-- قراءة فقط: حسابات يُرجَّح أنها للشخص نفسه (تحليل التكرار، بلاغ المالك 2026-11-25). لا يكتب شيئًا.
-- البريد فريد أصلًا (participants_email_uniq على lower(email))، فالتكرار يأتي من بريدين مختلفين للشخص نفسه.
-- الاسم يُطبَّع: حذف التشكيل والمسافات والهمزات، فـ«خضر إدريس درسا» و«خضرإدريس درسا» اسم واحد.
-- البريد يُطبَّع على طريقة Gmail: حذف النقاط وما بعد + في الجزء المحلي.

-- 1) مجموعات الاسم المطبَّع المتكرر بين الحسابات الحقيقية: الاسم، والبريد مقنَّعًا، والهاتف، والجهة، والإنشاء، والنشاط
with p as (
  select id, full_name, email, phone, organization_id, created_at, last_login_at, source,
         regexp_replace(translate(lower(full_name), 'أإآىةًٌٍَُِّْـ', 'اااه'), '\s+', '', 'g') as nkey
    from leaders.participants where coalesce(is_demo, false) = false),
g as (select nkey from p group by nkey having count(*) > 1)
select true as ok, coalesce(string_agg(
         p.full_name || ' · ' || left(split_part(p.email, '@', 1), 3) || '…@' || split_part(p.email, '@', 2)
         || ' · هاتف=' || coalesce(right(p.phone, 4), '-')
         || ' · أُنشئ=' || to_char(p.created_at, 'MM-DD HH24:MI')
         || ' · آخر دخول=' || coalesce(to_char(p.last_login_at, 'MM-DD'), 'لا')
         || ' · مصدر=' || coalesce(p.source, '-') || ' · تقدم=' || (select count(*) from leaders.participant_requirements r where r.participant_id = p.id)
         || ' · وثيقة=' || (select count(*) from leaders.capstones c where c.participant_id = p.id),
       ' | ' order by p.nkey, p.created_at), 'لا تكرار بالاسم') as detail
  from p join g using (nkey);

-- 2) بريد يتكرر بعد تطبيع Gmail (نقاط أو +وسم) لحسابات مختلفة
with p as (
  select id, lower(email) e from leaders.participants where coalesce(is_demo, false) = false),
n as (select id, regexp_replace(split_part(e, '@', 1), '\.|\+.*$', '', 'g') || '@' || replace(split_part(e, '@', 2), 'googlemail.com', 'gmail.com') as ne
        from p where split_part(e, '@', 2) in ('gmail.com', 'googlemail.com'))
select true as ok, 'مجموعات=' || count(*) || ' · حسابات=' || coalesce(sum(c), 0) as detail
  from (select ne, count(*) c from n group by ne having count(*) > 1) s;

-- 3) هاتف واحد لأكثر من حساب
select true as ok, 'مجموعات=' || count(*) || ' · حسابات=' || coalesce(sum(c), 0) as detail
  from (select regexp_replace(phone, '\D', '', 'g') ph, count(*) c from leaders.participants
         where coalesce(is_demo, false) = false and length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 8
         group by 1 having count(*) > 1) s;

-- 4) هل person_id يربط الحسابات (الشخص الواحد بأكثر من حساب) وكم يستعمل
select true as ok, 'مرتبط بشخص=' || count(*) filter (where person_id is not null) || ' من ' || count(*)
       || ' · أشخاص بأكثر من حساب=' || (select count(*) from (select person_id from leaders.participants where person_id is not null group by 1 having count(*) > 1) x) as detail
  from leaders.participants where coalesce(is_demo, false) = false;

-- 5) قبل 20261128190000: لكل حساب مكرر بالهاتف (حقيقي قائم، غير الأحدث دخولًا في مجموعته) الجداول التي فيها صفوف له وعددها، وما
--    في الحساب الباقي من الجداول نفسها (تعارض محتمل). الجداول من كل مفتاح أجنبي إلى المشارك (pg_constraint) كما يقرؤها الدمج،
--    فلا يُنسى جدول. معرّفات مختصرة بلا أسماء ولا بريد. بعد الدمج: «لا مكرر قائم بالهاتف».
with p as (
  select id, k, row_number() over (partition by k order by last_login_at desc nulls last, created_at desc, id) rn
    from (select id, last_login_at, created_at,
                 case when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2) when d ~ '^5[0-9]{8}$' then '966' || d else d end k
            from (select id, last_login_at, created_at,
                         regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') d
                    from leaders.participants where not is_demo and not is_test and status not in ('suspended', 'withdrawn')) x) y
   where length(k) >= 8),
pairs as (select d.id dup, kp.id kept from p d join p kp on kp.k = d.k and kp.rn = 1 where d.rn > 1),
fks as (
  select format('%I.%I', n.nspname, c.relname) t, c.relname, a.attname col
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.contype = 'f' and k.confrelid = 'leaders.participants'::regclass and cardinality(k.conkey) = 1),
counts as (
  select pr.dup, pr.kept, f.relname,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) n from %s where %I = %L', f.t, f.col, pr.dup), false, true, '')))[1]::text::int nd,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) n from %s where %I = %L', f.t, f.col, pr.kept), false, true, '')))[1]::text::int nk
    from pairs pr cross join fks f),
per as (
  select dup, kept, string_agg(relname || '=' || nd || case when nk > 0 then '/الباقي ' || nk else '' end, '، ' order by relname) filter (where nd > 0) t
    from counts group by dup, kept)
select true as ok, coalesce(string_agg('مكرر ' || left(dup::text, 8) || ' ← باقٍ ' || left(kept::text, 8) || ': ' || coalesce(t, 'لا صفوف'), ' | ' order by kept, dup), 'لا مكرر قائم بالهاتف') as detail
  from per;
