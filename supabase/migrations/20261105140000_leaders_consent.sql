-- ════════════════════════════════════════════════════════════════
-- الموافقة على الخصوصية والشروط، وموافقة مشاركة المستويات مع الجهة (المرحلة و، 2026-11-05)
-- ════════════════════════════════════════════════════════════════
-- لم يكن في التسجيل إشعار ولا موافقة، ولا سجل لمن وافق على أي نسخة من السياسة؛ وكانت
-- المستويات تصل الجهة بصلاحية المنسق وحدها دون موافقة المشارك المسجلة.
-- consented_at/consent_version: لحظة الموافقة ونسخة السياسة (POLICY_VERSION في labels.js).
-- org_share_consented_at: موافقة المشارك على اطلاع جهته على مستوياته؛ بدونها لا تخرج المستويات
-- من الخادم للجهة ولو مُنح المنسق صلاحية الدرجات.

alter table leaders.participants add column if not exists consented_at timestamptz;
alter table leaders.participants add column if not exists consent_version text;
alter table leaders.participants add column if not exists org_share_consented_at timestamptz;

insert into leaders.schema_migrations (name) values ('20261105140000_leaders_consent') on conflict do nothing;
