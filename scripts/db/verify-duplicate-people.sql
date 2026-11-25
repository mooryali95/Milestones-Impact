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
