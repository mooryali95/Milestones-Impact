-- ════════════════════════════════════════════════════════════════
-- مرفقات صغيرة في طابور البريد: عمود attachments في mail_queue (مراجعة التحقق 2026-11-20، بريد دعوة الورشة وتغيير موعدها)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله تبقى الرسالة ذات المرفق خارج الطابور كما كانت: تُحسب «تعذّرت» عند امتلاء الحصة (core.ts: enqueueMail يرفض المرفق إن رُفض العمود، وdrainMailQueue يقرأ بلاه)
-- دعوة الورشة وإشعار تغيير موعدها يحملان دعوة تقويم (.ics)، وsendMail كان لا يُدخل الطابور رسالة بمرفق، فمن لم تتسع له
-- حصة اليوم من أعضاء الدفعة لم يصله شيء، وإعادة الحفظ لا تعيد إشعار التغيير. الآن يُحفظ المرفق الصغير مع رسالته فتخرج
-- كاملة حين تتسع الحصة أو يرسلها المدير من «لم يُرسل». مصفوفة {filename, content (base64), content_type} كما يأخذها المزوّد،
-- وبحد يفرضه الخادم (QUEUE_ATTACH_MAX). الرسائل بلا مرفق تبقى فارغة العمود.
-- عمود فارغ بلا قيمة افتراضية على جدول قائم: لا إعادة كتابة للجدول، والدوال قبله لا تقرؤه. آمن لإعادة التشغيل.

alter table leaders.mail_queue add column if not exists attachments jsonb;
alter table leaders.mail_queue drop constraint if exists mail_queue_attachments_check;
alter table leaders.mail_queue add constraint mail_queue_attachments_check check (attachments is null or jsonb_typeof(attachments) = 'array') not valid;
alter table leaders.mail_queue validate constraint mail_queue_attachments_check;

insert into leaders.schema_migrations (name) values ('20261120100000_leaders_mail_queue_attachments') on conflict do nothing;
