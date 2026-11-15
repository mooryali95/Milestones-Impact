-- ════════════════════════════════════════════════════════════════
-- سلاسل سلاك اليومية: رسالة أم واحدة لكل فئة في يوم الرياض، والأحداث ردود فيها
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (_shared/slack.ts: findOrCreate ينشر بلا سلاسل، وslackHello لا يرسل)، فقبله يعمل سلاك بلا تجميع
-- ts معرّف رسالة الأم في القناة (chat.postMessage)، ولا شيء غيره: لا نص ولا بريد ولا رمز.
-- category: alerts وcodes وmail، وhello صف واحد علامةً لرسالة الربط فلا تُعاد.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.slack_threads (
  day date not null,
  category text not null check (category in ('alerts', 'codes', 'mail', 'hello')),
  ts text not null default '',
  created_at timestamptz not null default now(),
  primary key (day, category)
);
alter table leaders.slack_threads enable row level security;
revoke all on leaders.slack_threads from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261115130000_leaders_slack_threads') on conflict do nothing;
