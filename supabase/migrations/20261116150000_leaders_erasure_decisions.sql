-- ════════════════════════════════════════════════════════════════
-- قرار طلب حذف البيانات من ملف المشارك (المراحل 1 إلى 3 من تصور معالجة الطلب، 2026-11-16)
-- ════════════════════════════════════════════════════════════════
-- حاجب للنشر (بلا وسم tolerant): مسارات القرار والتذكير تكتب هذه الأعمدة، والتذكير بلا reminder_stage يتكرر كل ساعة.
-- يُطبَّق بسير migrate.yml قبل نشر الدالة. الجدول نفسه (20261110150000) يبقى مقروءًا بتسامح كما كان.
-- لا حالة جديدة: الرفض هو rejected القائمة، والسحب عن طريق المدير cancelled ويتميز بأن decided_by بريد المدير لا participant.
-- 1) ground: أساس الرفض من قائمة مغلقة (erasure.js ERASE_GROUNDS)، ومعه note نصًّا حرًّا.
-- 2) withdrawn_via: كيف أبلغ المشارك المدير بسحب طلبه (بريد، اتصال، رسالة).
-- 3) notified_at: وقت إبلاغ المشارك بالنتيجة (التنفيذ أو الرفض أو السحب).
-- 4) reminder_stage وreminded_at: آخر تذكير للمالك (قبل 10 أيام، وقبل 3، ويوم المهلة، ثم يوميًا بعد التأخر)، فلا يتكرر.
-- 5) email_hash: بصمة بريد صاحب الطلب عند التنفيذ، تربط الطلب بسطر الحذف في سجل التدقيق بلا بريد صريح.
-- 6) erasure_purge: حذف شهادات المشارك وصفه في معاملة واحدة (قرار المالك 1: الشهادة تُلغى وتُحذف عند تنفيذ طلبه).
--    قيد الشهادة on delete restrict كان يُفشل الحذف بعد أن تبدأ العملية، فهنا إما يُحذف الاثنان وإما لا شيء.
--    حساب العرض لا يُحذف بها. لا يملكها إلا دور الخدمة.
-- آمن لإعادة التشغيل.

alter table leaders.erasure_requests add column if not exists ground text check (ground is null or ground in ('repeat', 'litigation', 'legal_retention', 'other'));
alter table leaders.erasure_requests add column if not exists withdrawn_via text check (withdrawn_via is null or withdrawn_via in ('email', 'phone', 'message'));
alter table leaders.erasure_requests add column if not exists notified_at timestamptz;
alter table leaders.erasure_requests add column if not exists reminder_stage smallint not null default 0;
alter table leaders.erasure_requests add column if not exists reminded_at timestamptz;
alter table leaders.erasure_requests add column if not exists email_hash text check (email_hash is null or char_length(email_hash) <= 128);

create or replace function leaders.erasure_purge(p_participant uuid)
returns integer language plpgsql security definer set search_path = leaders, pg_temp as $$
declare n integer;
begin
  delete from leaders.certificates where participant_id = p_participant;
  delete from leaders.participants where id = p_participant and coalesce(is_demo, false) = false;
  get diagnostics n = row_count;
  -- لا صف (حذف متزامن أو حساب العرض): ترجع الشهادات كما كانت
  if n = 0 then raise exception 'erasure_purge: participant not found' using errcode = 'P0002'; end if;
  return n;
end $$;
revoke all on function leaders.erasure_purge(uuid) from public, anon, authenticated;
grant execute on function leaders.erasure_purge(uuid) to service_role;

insert into leaders.schema_migrations (name) values ('20261116150000_leaders_erasure_decisions') on conflict do nothing;
