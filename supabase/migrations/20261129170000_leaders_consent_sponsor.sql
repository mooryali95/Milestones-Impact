-- deploy-gate: tolerant قبله يرفض القيد نوع sponsor (23514) فيسجل logConsent الخطأ ولا يوقف قرار الراعي، كما كان قبل الإشعار
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 2، المرحلة 2.1: موافقة الراعي في سجل الموافقات
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-2-الحلقة-الأخيرة-وجودة-الاعتماد-v1.md §5.4 (اعتمده المالك 2026-11-26).
-- صفحتا الراعي (/sponsor و/outcome) تعرضان إشعار خصوصية بسطر واحد، والقبول بالإرسال يُسجَّل كما في صفحة المقيّم.
-- معرّف السطر معرّف ما قرر فيه الراعي (الوثيقة بمعرّف صاحبها، أو مراجعة الأثر بمعرّفها) لا بريده. لا بيانات تتغير،
-- فلا نسخة احتياطية. آمن لإعادة التشغيل.

alter table leaders.consent_events drop constraint if exists consent_events_subject_check;
alter table leaders.consent_events add constraint consent_events_subject_check
  check (subject in ('participant', 'coordinator', 'expert', 'rater', 'sponsor'));

insert into leaders.schema_migrations (name) values ('20261129170000_leaders_consent_sponsor') on conflict do nothing;
