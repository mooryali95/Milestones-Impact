-- ════════════════════════════════════════════════════════════════
-- الرمز الرقمي للحضور (W2): طريقة «code» في سجل الحضور
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يرفض القيد الطريقة code، فيُسجَّل الحضور بالأرقام الستة بطريقة qr ويحمل السجل {via:'code'} (activities.ts: workshopCheckin)
-- تصور الرحلة بالسحب والورش والحضور (2026-11-18)، ب5.5 البند 8: من تعذّر عليه المسح يكتب الأرقام الستة الظاهرة تحت
-- الرمز المتغير، وتُوثَّق طريقة حضوره «code» لا «qr»، فيعرف المدرب والإدارة كيف سُجّل. القيم القائمة كما هي
-- (الترحيل 20261110140000). آمن لإعادة التشغيل.

alter table leaders.workshop_attendance drop constraint if exists workshop_attendance_method_check;
alter table leaders.workshop_attendance add constraint workshop_attendance_method_check check (method = any (array['qr'::text, 'manual'::text, 'join'::text, 'hall'::text, 'remote'::text, 'code'::text]));

insert into leaders.schema_migrations (name) values ('20261118120000_leaders_workshop_code_method') on conflict do nothing;
