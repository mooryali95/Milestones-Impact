-- ════════════════════════════════════════════════════════════════
-- سعة يوم الورشة (W3): عمود capacity في workshop_sessions
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله تُخفى السعة في اللوحة ويُحفظ اليوم بلاها، والحفظ بالسعة يعيد المحاولة بدونها (activities.ts: capacityReady وworkshopSave)
-- تصور الرحلة بالسحب والورش والحضور (2026-11-18)، ب5.4: سعة القاعة لكل يوم أو ورشة، عرض وتنبيه فقط لا حجز مقاعد (أ8).
-- اختياري: فارغ يعني بلا سعة معلنة. عدد صحيح من 1 إلى 10000. الأعمدة والقيود القائمة كما هي. آمن لإعادة التشغيل.

alter table leaders.workshop_sessions add column if not exists capacity integer;
alter table leaders.workshop_sessions drop constraint if exists workshop_sessions_capacity_check;
alter table leaders.workshop_sessions add constraint workshop_sessions_capacity_check check (capacity is null or (capacity >= 1 and capacity <= 10000));

insert into leaders.schema_migrations (name) values ('20261118130000_leaders_workshop_capacity') on conflict do nothing;
