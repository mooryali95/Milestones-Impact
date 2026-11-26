-- قاعدة E-360 الجديدة (تصور المرحلة 1، البند 6) على القاعدة الحية، قراءة فقط، قبل نشر الدالة وبعده
-- كل فحص يعيد صفًا واحدًا: ok صحيح إن اجتاز، وdetail ما وجده. لا ترحيل ولا كتابة: القاعدة تُحسب في الدالة عند كل قراءة
-- الحد min_others من app_settings (feedback360)، وافتراضيه 3 كما في settings.js
-- 1) مشاركون يعودون غير مكتملين في E-360: مقدَّم بعدي واحد على الأقل (القاعدة السابقة)، ودون الحد من غير المدير،
--    وما زال لهم مقيّم بعدي ينتظر أو مدعو برابط سارٍ، ولم يُعتمد تقييمهم الختامي (من اعتُمد يُحفظ اكتماله)
with lim as (
  select coalesce((select (value->>'min_others')::int from leaders.app_settings where key = 'feedback360'), 3) n
), per as (
  select r.participant_id,
         count(*) filter (where r.status = 'submitted') sub,
         count(*) filter (where r.status = 'submitted' and r.relation <> 'manager') others,
         bool_or(r.status = 'awaiting' or (r.status = 'invited' and (r.expires_at is null or r.expires_at > now()))) waiting
    from leaders.raters r where r.phase = 'post' and r.status <> 'revoked' group by r.participant_id
)
select count(*) = 0 as ok, 'يعودون غير مكتملين ' || count(*) || coalesce(': ' || string_agg(p.participant_id::text, '، ' order by p.participant_id), '') as detail
  from per p, lim
 where p.sub > 0 and p.others < lim.n and p.waiting
   and not exists (select 1 from leaders.final_evaluations f where f.participant_id = p.participant_id and f.status = 'approved');
-- 2) مكتملون بعدد أقل بعد إغلاق الحد (للعلم): يظهر لهم وسم «اكتمل بعدد أقل» عند المرشد والإدارة
with lim as (
  select coalesce((select (value->>'min_others')::int from leaders.app_settings where key = 'feedback360'), 3) n
), per as (
  select r.participant_id,
         count(*) filter (where r.status = 'submitted') sub,
         count(*) filter (where r.status = 'submitted' and r.relation <> 'manager') others,
         bool_or(r.status = 'awaiting' or (r.status = 'invited' and (r.expires_at is null or r.expires_at > now()))) waiting
    from leaders.raters r where r.phase = 'post' and r.status <> 'revoked' group by r.participant_id
)
select true as ok, 'بعدد أقل ' || count(*) as detail
  from per p, lim
 where p.sub > 0 and p.others < lim.n and not coalesce(p.waiting, false)
   and not exists (select 1 from leaders.final_evaluations f where f.participant_id = p.participant_id and f.status = 'approved');
