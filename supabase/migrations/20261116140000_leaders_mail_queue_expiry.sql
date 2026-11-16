-- deploy-gate: tolerant الدالة تقرأ expires_at إن وُجد العمود، وإن غاب تعامل كل رسالة في الطابور بلا موعد فتنتظر حتى تُرسل (core.ts: drainMailQueue وenqueueMail)
-- طابور البريد بلا ترك أعمى: الرسالة المحجوبة بالحصة تنتظر يومًا بعد يوم حتى تُرسل، إلا المؤرخة (تذكير ورشة، دعوة
-- تقييم 360، عرض خدمة على خبير، الملخص الأسبوعي) فتُترك حين يمضي موعدها ولا تخرج متأخرة.
-- 1) expires_at: موعد الرسالة المؤرخة، يكتبه مرسلها. الفارغ لا ينتهي.
-- 2) فهرس الانتظار بالنوع ثم الأقدم: الإشعار الفردي يخرج قبل الجماعي.
-- 3) إنقاذ: الإشعار غير المؤرخ الذي تُرك بقاعدة اليومين القديمة في الأسبوع الأخير يعود إلى الانتظار، فيخرج آليًّا.
--    عروض الخدمة على الخبراء (عنوانها «طلب خدمة:») تبقى متروكة: مهلتها مضت وانتقل الطلب إلى غيره.
-- آمن لإعادة التشغيل: الإنقاذ لا يمس ما أُرسل أو أُلغي أو تُرك قبل أسبوع.

alter table leaders.mail_queue add column if not exists expires_at timestamptz;
create index if not exists mail_queue_waiting_kind_idx on leaders.mail_queue (kind desc, created_at) where sent_at is null and gave_up_at is null;

update leaders.mail_queue set gave_up_at = null, last_error = null
 where sent_at is null and last_error = 'stale' and kind = 'notify' and expires_at is null
   and gave_up_at >= now() - interval '7 days' and subject not like 'طلب خدمة:%';

insert into leaders.schema_migrations (name) values ('20261116140000_leaders_mail_queue_expiry') on conflict do nothing;
