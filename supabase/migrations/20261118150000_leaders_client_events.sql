-- ════════════════════════════════════════════════════════════════
-- أحداث الإخفاق من جهة العميل (تصور «تحديث المنصة بلا أثر على المستخدمين»، المرحلة 4)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرد client.event بـnot_migrated فيُسقط العميل طابوره بصمت، ولا يتغير شيء للمستخدم (client-events.ts)
-- العميل يسجّل كل إخفاق يراه ولا يراه الخادم (انقطاع، رد بوابة بلا CORS، مهلة، مشغول، 5xx، ملف قسم غائب، خطأ صفحة) ويرسله
-- بعد عودة الاتصال إلى الفعل المفتوح client.event. الحقول وحدها: النوع والفعل وعدد المحاولات والبناء ووقت الجهاز، ونص قصير
-- منقّى لأخطاء الصفحة. لا رمز ولا معرّف مستخدم ولا بريد ولا رابط باستعلام. ip_hash بصمة الشبكة بفلفل الخادم لحد المعدل
-- وعدّ الأجهزة في التنبيه، لا العنوان نفسه. يُحذف بعد 30 يومًا: pg_cron يوميًا أدناه، وpurge الأسبوعي في system.ts احتياطًا.
-- التغيير في السياسة غير جوهري (قرار المالك 2026-11-18)، مسجّل في POLICY_CHANGES بنسخة 2026-11-24.
-- لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.client_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('offline', 'TypeError', 'timeout', 'busy', '5xx', 'chunk', 'error', 'rejection', 'render')),
  act text not null default '' check (act ~ '^[a-z0-9._-]{0,60}$'),
  tries smallint not null default 1 check (tries between 1 and 50),
  build text check (build is null or build ~ '^[A-Za-z0-9_-]{1,40}$'),
  message text check (message is null or char_length(message) <= 160),
  at timestamptz not null,
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists client_events_created_idx on leaders.client_events (created_at);
create index if not exists client_events_ip_idx on leaders.client_events (ip_hash, created_at);
create index if not exists client_events_act_idx on leaders.client_events (act, created_at);

alter table leaders.client_events enable row level security;
revoke all on leaders.client_events from anon, authenticated;

-- كل يوم عند 03:23 بالتوقيت العالمي: حذف ما مضى عليه 30 يومًا. cron.schedule بالاسم نفسه يحدّث المهمة، فإعادة التشغيل آمنة.
-- وبلا pg_cron يبقى purge الأسبوعي (system.ts).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('leaders-client-events-purge', '23 3 * * *', $q$delete from leaders.client_events where created_at < now() - interval '30 days'$q$);
  else
    raise notice 'pg_cron غير مفعل: leaders-client-events-purge لم تُجدول';
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261118150000_leaders_client_events') on conflict do nothing;
