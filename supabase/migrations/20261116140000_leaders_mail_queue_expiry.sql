-- طابور البريد بلا ترك أعمى: الرسالة المحجوبة بالحصة تنتظر يومًا بعد يوم حتى تُرسل، إلا المؤرخة (تذكير ورشة، دعوة
-- تقييم 360، عرض خدمة على خبير، الملخص الأسبوعي، اتصال فوري، تنبيه أمني، تذكير دفع) فتُترك حين يمضي موعدها ولا تخرج متأخرة.
-- حاجب للنشر (بلا وسم tolerant): الدالة الجديدة لا تُنشر قبله، فلا تُكتب في الطابور رسالة مؤرخة بلا موعدها فتنتظر بلا نهاية.
-- يُطبَّق بسير migrate.yml ثم يُعاد النشر فورًا: الدالة القديمة تترك الإشعار بعد يومين، فإن فرّغت الطابور بينهما أعادت ترك
-- ما أنقذه هذا الترحيل، ويُرسل حينها يدويًّا من صندوق «لم يُرسل».
-- 1) expires_at: موعد الرسالة المؤرخة، يكتبه مرسلها. الفارغ لا ينتهي.
-- 2) فهرس الانتظار بالنوع ثم الأقدم: الإشعار الفردي يخرج قبل الجماعي.
-- 3) ما بقي في الطابور لمشارك حُذف قبل هذا الترحيل يُحذف (عنوانه ومتنه): الحذف القديم لم يكن ينظف الطابور.
--    بمرجعه participant:<id> أو rater:<id> حين لا يوجد صاحبه.
-- 4) إنقاذ: الإشعار غير المؤرخ الذي تُرك بقاعدة اليومين القديمة في الأسبوع الأخير يعود إلى الانتظار، فيخرج آليًّا.
--    إلا ما لا معنى له متأخرًا (عرض خدمة على خبير، اتصال فوري، تنبيه أمني، تذكير دفع)، وإلا ما لم يعد صاحبه موجودًا.
-- آمن لإعادة التشغيل: الإنقاذ لا يمس ما أُرسل أو أُلغي أو تُرك قبل أسبوع.

alter table leaders.mail_queue add column if not exists expires_at timestamptz;
create index if not exists mail_queue_waiting_kind_idx on leaders.mail_queue (kind desc, created_at) where sent_at is null and gave_up_at is null;

delete from leaders.mail_queue q
 where (q.ref like 'participant:%' and not exists (select 1 from leaders.participants p where p.id::text = substr(q.ref, 13)))
    or (q.ref like 'rater:%' and not exists (select 1 from leaders.raters r where r.id::text = substr(q.ref, 7)));

update leaders.mail_queue q set gave_up_at = null, last_error = null
 where q.sent_at is null and q.last_error = 'stale' and q.kind = 'notify' and q.expires_at is null
   and q.gave_up_at >= now() - interval '7 days'
   and q.subject not like 'طلب خدمة:%' and q.subject not like 'اتصال فوري:%'
   and q.subject not in ('دخول جديد إلى حسابك', 'أُضيف مفتاح مرور إلى حسابك', 'مسارك المعتمد بانتظارك', 'دفعك لم يكتمل')
   and (q.ref is null or q.ref not like 'participant:%' or exists (select 1 from leaders.participants p where p.id::text = substr(q.ref, 13)))
   and (q.ref is null or q.ref not like 'rater:%' or exists (select 1 from leaders.raters r where r.id::text = substr(q.ref, 7)));

insert into leaders.schema_migrations (name) values ('20261116140000_leaders_mail_queue_expiry') on conflict do nothing;
