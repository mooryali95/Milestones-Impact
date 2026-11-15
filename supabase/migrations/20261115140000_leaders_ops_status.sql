-- ════════════════════════════════════════════════════════════════
-- حالة قنوات التشغيل: آخر نجاح وآخر خطأ لكل قناة (سلاك الآن)، لبطاقة «صحة البريد والتنبيه» في النظرة العامة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تتحمل غياب الجدول (_shared/slack.ts: recordSlack يكتب بلا انتظار ويتوقف عشر دقائق، وopsHealth يعرض حالة سلاك «غير مقروءة»)، فقبله تعمل البطاقة بلا آخر نشر
-- صف واحد لكل قناة (channel)، يُكتب بعد النشر ولا يُنتظر، ومرة في الدقيقة على الأكثر لكل نتيجة في النسخة.
-- error: رمز الخطأ كما يرده سلاك (invalid_auth وchannel_not_found وnot_in_channel)، لا نص رسالة ولا رمز ولا بريد.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.
create table if not exists leaders.ops_status (
  channel text primary key check (channel in ('slack')),
  ok_at timestamptz,
  error_at timestamptz,
  error text check (char_length(error) <= 80),
  updated_at timestamptz not null default now()
);
alter table leaders.ops_status enable row level security;
revoke all on leaders.ops_status from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261115140000_leaders_ops_status') on conflict do nothing;
