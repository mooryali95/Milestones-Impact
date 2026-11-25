-- deploy-gate: tolerant الدوال تتحقق من الهاتف قبل الكتابة بلا الفهرس (phone-guard.ts يقرأ الحسابات بصيغ الرقم)، والفهرس سند
-- أخير: تعارضه (23505 على participants_phone_key_uniq) تترجمه الدوال إلى «حساب قائم» لا خطأ خادم، وقبله لا يقع.
-- ════════════════════════════════════════════════════════════════
-- هاتف واحد لحساب قائم واحد (تحليل التكرار، اعتمده المالك 2026-11-25)
-- ════════════════════════════════════════════════════════════════
-- 1) مفتاح الهاتف المطبَّع، وهو ما يفعله phoneKey في phone-key.js (المصدر الواحد في الدوال): الأرقام الهندية والفارسية إلى لاتينية،
--    ثم الأرقام وحدها، ثم حذف 00 الدولية، ثم 05XXXXXXXX و5XXXXXXXX السعودي إلى 9665XXXXXXXX (قاعدة normalizePhone في logic.js)،
--    فالصيغ الدولية بـ+ وبـ00 والمحلية مفتاح واحد. مكتوب في الفهرس نفسه لا في دالة: اللقطة (baseline.sql) ترتب الفهارس قبل الدوال.
-- 2) participants_phone_key_uniq: فهرس فريد جزئي على المفتاح للحسابات الحقيقية القائمة: غير التجريبية، والمفتاح 8 أرقام فأكثر،
--    والحال ليست موقوفة ولا منسحبة (فالمؤرشف في 20261128170000 لا يحجز هاتفه).
--    الجدول صغير (مئات الصفوف)، فالفهرس العادي يُبنى في أجزاء من الثانية داخل معاملة الترحيل ومعه الحارس (استثناء الفاحص باسمه).
-- 3) قبل الفهرس: إن بقي هاتف مكرر يفشل الترحيل برسالة تسمي عدد المجموعات (scripts/db/verify-duplicate-people.sql الفحص 3 يسميها).
-- آمن لإعادة التشغيل.

do $$
declare n int;
begin
  select count(*) into n from (
    select k from (
      select case when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2) when d ~ '^5[0-9]{8}$' then '966' || d else d end as k
        from (select regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') as d
                from leaders.participants where not is_demo and status not in ('suspended', 'withdrawn')) x) y
     where length(k) >= 8 group by k having count(*) > 1) z;
  if n > 0 then
    raise exception 'phone_unique: % phone number(s) still shared by more than one active account; archive the duplicates first (20261128170000, scripts/db/verify-duplicate-people.sql)', n;
  end if;
end $$;

create unique index if not exists participants_phone_key_uniq on leaders.participants ((
  case when regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') ~ '^05[0-9]{8}$'
         then '966' || substr(regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', ''), 2)
       when regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') ~ '^5[0-9]{8}$'
         then '966' || regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '')
       else regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') end))
  where not is_demo and status not in ('suspended', 'withdrawn')
    and length(regexp_replace(regexp_replace(translate(coalesce(phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '')) >= 8;

insert into leaders.schema_migrations (name) values ('20261128180000_leaders_phone_unique') on conflict do nothing;
