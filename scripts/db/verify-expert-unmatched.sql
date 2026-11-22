-- قراءة فقط: لماذا انتهت طلبات الخبراء إلى «لا خبير مطابق» والخبراء النشطون متاحون. لا يكتب شيئًا.
-- 0) كل طلب بحالة unmatched: دوره وبُعده ومن جُرِّب (tried) ومتى
select true as ok, coalesce(string_agg(
  r.id::text || ' · ' || r.role || ' · ' || coalesce(r.dimension, '-') || ' · tried=' || coalesce(array_length(r.tried, 1), 0)::text
  || ' [' || coalesce(array_to_string(r.tried, ','), '') || '] · ' || to_char(r.updated_at, 'YYYY-MM-DD HH24:MI'), ' | '), 'لا طلبات') as detail
from leaders.expert_requests r where r.status = 'unmatched';
-- 1) كل خبير: حالته وأدواره وأبعاده وساعاته، وهل جُرِّب في طلب unmatched، وهل بريده بريد المشارك
select true as ok, coalesce(string_agg(
  e.id::text || ' · ' || e.status || ' · roles=' || array_to_string(e.roles, ',') || ' · dims=' || coalesce(array_to_string(e.dimensions, ','), '-')
  || ' · weekly=' || coalesce(e.weekly_hours::text, 'null')
  || ' · tried_in_unmatched=' || (exists (select 1 from leaders.expert_requests r where r.status = 'unmatched' and e.id = any(r.tried)))::text
  || ' · same_email_as_participant=' || (exists (select 1 from leaders.expert_requests r join leaders.participants p on p.id = r.participant_id
        where r.status = 'unmatched' and lower(p.email) = lower(e.email)))::text, ' | '), 'لا خبراء') as detail
from leaders.experts e;
-- 2) سجل الطلب: ما الذي جرى عليه (عرض، اعتذار، انتهاء، unmatched، retry) بالترتيب
select true as ok, coalesce(string_agg(to_char(a.created_at, 'MM-DD HH24:MI') || ' ' || a.action || ' ' || coalesce(a.after::text, ''), ' | ' order by a.created_at), 'لا سجل') as detail
from leaders.audit_log a where a.entity = 'expert_requests' and a.entity_id in (select id::text from leaders.expert_requests where status = 'unmatched');
