-- deploy-gate: tolerant قبله يُحفظ التأمل وحده ويُحتسب بلا إضافة «أين ستطبقه؟» (handbookComplete يعيد الحفظ بدون العمود)
-- ════════════════════════════════════════════════════════════════
-- تصور المرحلة 3، المرحلة 3.1: إعادة وزن النقاط وسؤال التأمل الموجه
-- ════════════════════════════════════════════════════════════════
-- التصور: docs/content/2026-11-26-تصور-المرحلة-3-رفع-الفائدة-الحقيقية-v1.md §5.3 (اعتمده المالك 2026-11-26).
-- جواب السؤال الموجه «أين ستطبقه؟» بجانب التأمل. الأوزان في logic.js (POINTS) والنقاط تُخزن عند الكسب، فالمكتسب
-- قبل الإطلاق لا يتغير. عمود جديد فارغ: لا بيانات تتغير فلا نسخة احتياطية. آمن لإعادة التشغيل.

alter table leaders.handbook_progress add column if not exists reflection_apply text;
do $$ begin
  alter table leaders.handbook_progress add constraint handbook_progress_reflection_apply_check
    check (reflection_apply is null or char_length(reflection_apply) <= 1000);
exception when duplicate_object then null; end $$;

insert into leaders.schema_migrations (name) values ('20261129190000_leaders_reflection_apply') on conflict do nothing;
