-- ════════════════════════════════════════════════════════════════
-- مدرب الجلسة: عمود expert_id في workshop_sessions (تصور تشغيل الدفعة 2026-11-19، المرحلة 4)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبله يُخفى حقل المدرب في اللوحة، والحفظ بمدرب يعيد المحاولة بلاه ويقول إنه لم يُحفظ، والجلسة تُقرأ بلا مدرب في رحلة المشارك والدعوة وبوابة الخبير (activities.ts: trainerReady وworkshopSave وsessionTrainers)
-- المدرب المسمى للجلسة (اختياري): خبير من خبراء دفعتها (مستشار الدفعة أو عضو فريقها)، يتحقق منه الخادم عند الحفظ.
-- يراه المشارك «مع فلان» في رحلته وفي الدعوة، وتظهر الجلسة للمدرب في بوابته باسمه. صلاحية ورقة الحضور لا تتغير: تبقى
-- للمكلف بدفعة الجلسة (expertCohortIds)، والعمود لا يمنح صلاحية.
-- حذف الخبير يفرغ العمود ولا يحذف الجلسة. عمود فارغ بلا قيمة افتراضية على جدول قائم: لا إعادة كتابة للجدول، والدوال
-- قبله لا تقرؤه. آمن لإعادة التشغيل.

alter table leaders.workshop_sessions add column if not exists expert_id uuid references leaders.experts (id) on delete set null;
create index if not exists workshop_sessions_expert_idx on leaders.workshop_sessions (expert_id) where expert_id is not null;

insert into leaders.schema_migrations (name) values ('20261119130000_leaders_workshop_trainer') on conflict do nothing;
