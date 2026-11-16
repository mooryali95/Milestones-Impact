-- ════════════════════════════════════════════════════════════════
-- الرحلة (J1): جلسة جماعية بلا موعد بعد. الموعد والرابط يُحددان لاحقًا
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تقبل الجلسة غير المؤرخة وتعرضها «يُحدد لاحقًا»، وقبله يرفض القيد حفظها برسالة الحفظ (activities.ts: workshopSave) وتبقى المؤرخة كما هي
-- المرحلة J1 من تصور «الرحلة» (اعتمده المالك 2026-11-16): «تدريب يومان عن بعد، الموعد والرابط لاحقًا».
-- starts_at وends_at يصيران اختياريين معًا: كلاهما فارغ (يُحدد لاحقًا) أو كلاهما محدد والانتهاء بعد البدء.
-- الجلسات المؤرخة القائمة لا تتغير. لا فهرس جديد، ولا تغيير على قيد mode ولا على قيد kind. آمن لإعادة التشغيل.
alter table leaders.workshop_sessions alter column starts_at drop not null, alter column ends_at drop not null;
alter table leaders.workshop_sessions drop constraint if exists workshop_sessions_check;
alter table leaders.workshop_sessions drop constraint if exists workshop_sessions_dates_check;
alter table leaders.workshop_sessions add constraint workshop_sessions_dates_check check (
  (starts_at is null and ends_at is null)
  or (starts_at is not null and ends_at is not null and ends_at > starts_at)
);
-- الرجوع: يُعاد NOT NULL والقيد القديم فقط بعد حذف الجلسات غير المؤرخة أو تأريخها

insert into leaders.schema_migrations (name) values ('20261116060000_leaders_journey_blocks') on conflict do nothing;
