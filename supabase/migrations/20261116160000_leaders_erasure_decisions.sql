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
-- 6) erasure_purge: تنفيذ الطلب في معاملة واحدة (قرار المالك 1: الشهادة تُلغى وتُحذف عند تنفيذ طلبه):
--    أ) يُحجز الطلب أولًا بشرط أنه ما زال قائمًا ولصاحبه (for update): سحب المشارك أو رفض مدير آخر في اللحظة نفسها
--       إما يسبقه فلا يُحذف شيء (P0003)، وإما ينتظره فيجد الطلب مُغلقًا. ويُغلق done بمن نفذه وبصمة بريده، ويُمحى سببه
--       (نص حر من المشارك) فلا يبقى من الطلب إلا تاريخه وقراره ومن نفذه (erasure.js ERASE_KEPT.request).
--    ب) دفعة معلّقة (صفحة دفع مفتوحة) تمنع التنفيذ (P0004): لو اكتملت بعده لخُصم ماله بلا حساب ووصله إيصال على عنوانه.
--       تنتهي من تلقاء نفسها بعد 3 أيام (payments.ts expireAbandoned)، والمهلة 30 يومًا.
--    ج) سجل الدفع: المؤكد والمسترد يبقى للدفاتر التجارية بلا اسم ولا ملاحظات، وما لم يكتمل (فشل أو انتهى) يُحذف.
--    د) الشهادات ثم صف المشارك. قيد الشهادة on delete restrict كان يُفشل الحذف بعد أن تبدأ العملية، فهنا إما الكل وإما لا شيء.
--    حساب العرض لا يُحذف بها. لا يملكها إلا دور الخدمة.
-- آمن لإعادة التشغيل.

alter table leaders.erasure_requests add column if not exists ground text check (ground is null or ground in ('repeat', 'litigation', 'legal_retention', 'other'));
alter table leaders.erasure_requests add column if not exists withdrawn_via text check (withdrawn_via is null or withdrawn_via in ('email', 'phone', 'message'));
alter table leaders.erasure_requests add column if not exists notified_at timestamptz;
alter table leaders.erasure_requests add column if not exists reminder_stage smallint not null default 0;
alter table leaders.erasure_requests add column if not exists reminded_at timestamptz;
alter table leaders.erasure_requests add column if not exists email_hash text check (email_hash is null or char_length(email_hash) <= 128);

-- التوقيع القديم (معرّف المشارك وحده) يُسقط: لا يبقى طريق يحذف دون حجز الطلب
drop function if exists leaders.erasure_purge(uuid);
create or replace function leaders.erasure_purge(p_participant uuid, p_request uuid, p_by text, p_email_hash text)
returns integer language plpgsql security definer set search_path = leaders, pg_temp as $$
declare n integer;
begin
  perform 1 from leaders.erasure_requests where id = p_request and participant_id = p_participant and status = 'pending' for update;
  if not found then raise exception 'erasure_purge: request not pending' using errcode = 'P0003'; end if;
  if exists (select 1 from leaders.payments where participant_id = p_participant and status = 'pending') then
    raise exception 'erasure_purge: pending payment' using errcode = 'P0004';
  end if;
  update leaders.erasure_requests set status = 'done', decided_at = now(), decided_by = p_by, email_hash = p_email_hash, reason = null
    where id = p_request;
  delete from leaders.payments where participant_id = p_participant and status in ('failed', 'expired');
  update leaders.payments set customer_name = null, note = null, admin_note = null where participant_id = p_participant;
  delete from leaders.certificates where participant_id = p_participant;
  delete from leaders.participants where id = p_participant and coalesce(is_demo, false) = false;
  get diagnostics n = row_count;
  -- لا صف (حذف متزامن أو حساب العرض): يرجع كل ما سبق كما كان
  if n = 0 then raise exception 'erasure_purge: participant not found' using errcode = 'P0002'; end if;
  return n;
end $$;
revoke all on function leaders.erasure_purge(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function leaders.erasure_purge(uuid, uuid, text, text) to service_role;

insert into leaders.schema_migrations (name) values ('20261116160000_leaders_erasure_decisions') on conflict do nothing;
