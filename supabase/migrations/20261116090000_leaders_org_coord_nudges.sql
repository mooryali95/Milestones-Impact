-- ════════════════════════════════════════════════════════════════
-- تذكير منسق الجهة لمشاركيها (المرحلة P4 من التذكير الموحد، قرار المالك 2026-11-16): مفعّل افتراضيًا، وللإدارة إيقافه لكل جهة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدوال تعدّه مفعّلًا إن غاب العمود (coord_nudges !== false)، ونموذج الجهة لا يرسله قبل وجوده في صفها
-- المنسق يذكّر بالمحرك نفسه وسجله وحده المشترك (nudges.ts)، بتوقيع اسم الجهة، وبحد يومي للجهة. هذا العمود يوقفه لجهة بعينها.
-- آمن لإعادة التشغيل.
alter table leaders.organizations add column if not exists coord_nudges boolean not null default true;
comment on column leaders.organizations.coord_nudges is 'السماح لمنسق الجهة بتذكير مشاركيها بالمحرك الموحد (nudges.ts). مفعّل افتراضيًا';

insert into leaders.schema_migrations (name) values ('20261116090000_leaders_org_coord_nudges') on conflict do nothing;
