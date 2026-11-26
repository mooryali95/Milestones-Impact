-- deploy-gate: tolerant الدوال الأقدم لا تقرأ العمود، والجديدة تطلبه فقط والصيغة القصيرة مفعلة (post_form.short في app_settings، مطفأ افتراضيًا)
-- ════════════════════════════════════════════════════════════════
-- تصور طول القياس البعدي، المرحلة 2: علم النواة على الفقرة
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-طول-القياس-البعدي-v1.md §4.3 و§6 (اعتمده المالك 2026-11-26، الخيار ج).
-- questions.core: الفقرة من نواة الصيغة القصيرة. مصدر واحد للتقديم (servedPost) والتحقق والتقارير، لا قائمة في الكود.
-- عمود جديد بقيمة افتراضية false: لا فقرة في النواة حتى ترحيل التعليم بعد اعتماد قائمة scripts/db/verify-post-core.sql،
-- فلا بيانات تتغير ولا نسخة احتياطية. آمن لإعادة التشغيل.

alter table leaders.questions add column if not exists core boolean not null default false;
create index if not exists questions_instrument_core_idx on leaders.questions (instrument_id, core);

insert into leaders.schema_migrations (name) values ('20261130010000_leaders_post_core') on conflict do nothing;
