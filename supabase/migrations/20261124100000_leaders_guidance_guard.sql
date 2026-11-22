-- تقوية المساعد، المرحلة ب (قرار المالك 2026-11-22): سبب حجب الرد قبل وصوله إلى المشارك.
-- المدقق يحجب رد «أجاب» غير المستند إلى المرجع أو المخالف فيصير «لم أتأكد»، وكشف التلاعب يرفض قبل النموذج.
-- العمود للمراقبة (المرحلة ج) والمراجعة الأسبوعية (المرحلة د)، ولا يُعرض للمشارك. فارغ = لم يُحجب.
alter table leaders.guidance_messages add column if not exists guard text;
alter table leaders.guidance_messages drop constraint if exists guidance_messages_guard_check;
alter table leaders.guidance_messages add constraint guidance_messages_guard_check
  check (guard is null or guard in ('ungrounded', 'quiz', 'write', 'grade', 'personal', 'offtopic', 'inject', 'verify_error'));

insert into leaders.schema_migrations (name) values ('20261124100000_leaders_guidance_guard') on conflict do nothing;
