-- ════════════════════════════════════════════════════════════════
-- «التوجيه والإرشاد»: إصلاح تقييم الدقة 2026-11-18، الحالة كما صُححت بها مع كل نتيجة
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبل العمود تُحفظ النتيجة بلاه كما كانت، وتُقرأ النتائج بحالات المجموعة الحالية (guide-eval.ts)
-- - guidance_eval_results.case_snapshot: سؤال الحالة ونوعها وما يجب أن يرد وما يُمنع والإجابة المرجعية وقت التشغيل،
--   فنتائج تشغيل قديم تُقرأ بحالاتها هي لا بما صارت إليه بعد تعديل المجموعة. أسئلة مصطنعة من الكتاب، لا بيانات مشارك فيها.
-- - التشغيل التشخيصي (أعد الحالات الفاشلة فقط) لا يحتاج عمودًا: بصمته تبدأ بـ diag| فلا تطابق بصمة البوابة أبدًا.
-- لا يقرؤها إلا دور الخدمة (كما في 20261116140000 و20261116170000). آمن لإعادة التشغيل.

alter table leaders.guidance_eval_results add column if not exists case_snapshot jsonb;
do $$
begin
  alter table leaders.guidance_eval_results add constraint guidance_eval_results_case_snapshot_check
    check (case_snapshot is null or (jsonb_typeof(case_snapshot) = 'object' and pg_column_size(case_snapshot) <= 16384));
exception when duplicate_object then null;
end;
$$;
comment on column leaders.guidance_eval_results.case_snapshot is 'الحالة كما صُححت بها النتيجة وقت التشغيل (السؤال والنوع والأنماط والإجابة المرجعية)';

alter table leaders.guidance_eval_results enable row level security;
revoke all on leaders.guidance_eval_results from anon, authenticated;

insert into leaders.schema_migrations (name) values ('20261118100000_leaders_guidance_eval_case_snapshot') on conflict do nothing;
