-- ════════════════════════════════════════════════════════════════
-- مؤقت الإجابة في القاعة: وقت نهاية المرحلة يملكه الخادم
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تقرأ hall_sessions بـ* وتكتب phase_ends_at بمحاولة ثانية بلا العمود (hall.ts: bump)، فتعمل قبله وبعده
-- لم يُطبَّق على الإنتاج بعد: يطبّقه المالك بسير migrate.yml باسمه (20261110130000_leaders_hall_timer).
-- تصور القاعة v2 §4.2: «الخادم وحده يملك الحالة والوقت». كل جهاز يعدّ إلى الوقت نفسه بفرق ساعته عن ساعة الخادم،
-- فلا يتوقف العدّ بانقطاع جهاز الخبير. قبل تطبيقه تعمل القاعة بلا مؤقت كما كانت.
alter table leaders.hall_sessions add column if not exists phase_ends_at timestamptz;

insert into leaders.schema_migrations (name) values ('20261110130000_leaders_hall_timer') on conflict do nothing;
