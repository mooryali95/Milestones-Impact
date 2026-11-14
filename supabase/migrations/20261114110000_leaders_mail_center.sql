-- deploy-gate: tolerant
-- مركز البريد: «لماذا لم يصل البريد» وصندوق «لم يُرسل».
-- 1) mail_events: بصمة العنوان (to_hash) وعنوان الرسالة (subject). لا عنوان بريد ولا متن ولا رمز يُحفظ هنا (D15)؛
--    البصمة SHA-256 مملّحة بسر المنصة، فيُبحث بها عن بريد يكتبه المدير ولا يُستخرج منها عنوان.
-- 2) mail_queue: الإشعار المحجوب بالسقف يدخل الطابور (kind=notify مسموح أصلًا) بدل أن يضيع، ومعه سبب الحجز ومن ألغاه.
-- الخادم يعمل قبل هذا الترحيل: الكتابة بالأعمدة الجديدة تُعاد بدونها إن رُفضت.

alter table leaders.mail_events add column if not exists to_hash text;
alter table leaders.mail_events add column if not exists subject text;
do $$ begin
  alter table leaders.mail_events add constraint mail_events_to_hash_check check (char_length(to_hash) <= 64);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table leaders.mail_events add constraint mail_events_subject_check check (char_length(subject) <= 300);
exception when duplicate_object then null; end $$;
create index if not exists mail_events_to_hash_idx on leaders.mail_events (to_hash, created_at desc) where to_hash is not null;

alter table leaders.mail_queue add column if not exists reason text;
alter table leaders.mail_queue add column if not exists cancelled_by text;
do $$ begin
  alter table leaders.mail_queue add constraint mail_queue_reason_check check (char_length(reason) <= 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table leaders.mail_queue add constraint mail_queue_cancelled_by_check check (char_length(cancelled_by) <= 254);
exception when duplicate_object then null; end $$;
create index if not exists mail_queue_pending_idx on leaders.mail_queue (created_at) where sent_at is null and gave_up_at is null;

insert into leaders.schema_migrations (name) values ('20261114110000_leaders_mail_center') on conflict do nothing;
