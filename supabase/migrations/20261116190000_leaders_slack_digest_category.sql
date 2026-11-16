-- ════════════════════════════════════════════════════════════════
-- سلسلة «الملخص اليومي» في سلاك: فئة رابعة في leaders.slack_threads (تصور مركز الإشعارات، 6.3)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرفض القيد حجز سلسلة الملخص، فينشر slack.ts الملخص رسالة مستقلة بلا سلسلة ويبقى يعمل
-- يوسع قيد category من (alerts, codes, mail, hello) إلى digest معها. الصف كغيره: معرّف رسالة الأم وحده، بلا نص ولا بريد ولا رمز.
-- آمن لإعادة التشغيل، ولا يمس الصفوف القائمة.
alter table if exists leaders.slack_threads drop constraint if exists slack_threads_category_check;
alter table if exists leaders.slack_threads add constraint slack_threads_category_check
  check (category in ('alerts', 'codes', 'mail', 'hello', 'digest'));

insert into leaders.schema_migrations (name) values ('20261116190000_leaders_slack_digest_category') on conflict do nothing;
