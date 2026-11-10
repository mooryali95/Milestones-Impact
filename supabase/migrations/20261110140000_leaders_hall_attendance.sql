-- ════════════════════════════════════════════════════════════════
-- حضور القاعة يُكتب في حضور الورشة، ودعوة الجلسة وتذكيرها
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تكتب workshop_session_id وطريقة hall وأعمدة الدعوة والتذكير بمحاولات تتحمل غيابها (hall.ts: open وclose، activities.ts: workshopInvite وworkshopReminders)، فتعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يطبّقه المالك بسير migrate.yml باسمه (20261110140000_leaders_hall_attendance).
-- تصور القاعة v2 §4.1: الحضور مصدره الوحيد workshop_attendance. جلسة القاعة تنتمي إلى جلسة ورشة، وعند إغلاقها
-- يُكتب حضور من شارك في 60% من الجولات المكشوفة بطريقة hall، فيكتمل بند الورشة في الرحلة بآليته القائمة.
-- قبل تطبيقه: القاعة تُفتح وتُغلق كما كانت، ولا يُكتب منها حضور، والدعوة والتذكير لا يُرسلان.
alter table leaders.hall_sessions add column if not exists workshop_session_id uuid references leaders.workshop_sessions(id) on delete set null;

alter table leaders.workshop_attendance drop constraint if exists workshop_attendance_method_check;
alter table leaders.workshop_attendance add constraint workshop_attendance_method_check check (method = any (array['qr'::text, 'manual'::text, 'join'::text, 'hall'::text, 'remote'::text]));

-- مرة واحدة لكل جلسة: الدعوة بيد المشرف، والتذكيران (قبل يوم وقبل ساعة) من المهمة الساعية
alter table leaders.workshop_sessions add column if not exists invited_at timestamptz;
alter table leaders.workshop_sessions add column if not exists reminded_day_at timestamptz;
alter table leaders.workshop_sessions add column if not exists reminded_hour_at timestamptz;

insert into leaders.schema_migrations (name) values ('20261110140000_leaders_hall_attendance') on conflict do nothing;
