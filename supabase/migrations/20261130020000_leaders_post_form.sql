-- deploy-gate: tolerant الدوال تكتب العمودين في الصيغة القصيرة وحدها (مفتاح post_form.short مطفأ)، وتقرير الأثر يقرؤهما بإعادة بلاهما (missingColumn في impact.ts)
-- ════════════════════════════════════════════════════════════════
-- تصور طول القياس البعدي، المرحلة 2: صيغة البعدي وعدد ما قُدّم
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-طول-القياس-البعدي-v1.md §4.3 البند 5 و§6 (اعتمده المالك 2026-11-26).
-- assessments.post_form: short (النواة) أو full (كل ما يُقدم). served_count: عدد الفقرات التي حُسبت عليها النتيجة.
-- القياسات المسلمة سابقًا لا تُعلَّم full بتحديث: null يعني full في كل قارئ (postPool في logic.js)، وهو الأسلم لأن
-- لا صف يتغير ولا نسخة احتياطية تلزم ولا إرجاع، والحكم واحد في الكود. عمودان جديدان فارغان. آمن لإعادة التشغيل.

alter table leaders.assessments add column if not exists post_form text;
alter table leaders.assessments add column if not exists served_count integer;
do $$ begin
  alter table leaders.assessments add constraint assessments_post_form_check check (post_form is null or post_form in ('short', 'full')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table leaders.assessments add constraint assessments_served_count_check check (served_count is null or served_count >= 0) not valid;
exception when duplicate_object then null; end $$;

insert into leaders.schema_migrations (name) values ('20261130020000_leaders_post_form') on conflict do nothing;
