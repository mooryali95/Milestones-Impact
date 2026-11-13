-- ════════════════════════════════════════════════════════════════
-- مؤشر الجهد وطلب إعادة القياس على سجل القياس نفسه (تصور وسم المستعجلين، اعتمده المالك 2026-11-13)
-- ════════════════════════════════════════════════════════════════
-- المصدر الواحد: لا جدول تنبيهات. مؤشر الجهد يُحسب مرة عند التسليم ويُحفظ هنا (answer-review.js effortOf)، ومنه تقرأ
-- قائمة المشاركين وفلترها وبطاقة المستوى وملف الخبير. وطلب الإعادة (من طلبه ومتى ولماذا) يُحفظ على القياس الملغى نفسه،
-- ومنه تقرأ بطاقة المشارك في الموقع وبريده ومتابعة اللوحة. إضافي كله: الدالة القائمة لا تتأثر به قبل نشر الجديدة.
alter table leaders.assessments add column if not exists effort jsonb;
alter table leaders.assessments add column if not exists retake_requested_at timestamptz;
alter table leaders.assessments add column if not exists retake_requested_by text;
alter table leaders.assessments add column if not exists retake_reason text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assessments_retake_reason_chk') then
    alter table leaders.assessments add constraint assessments_retake_reason_chk check (retake_reason is null or retake_reason in ('effort', 'admin'));
  end if;
end $$;
comment on column leaders.assessments.effort is 'مؤشر الجهد عند التسليم: level (ok/watch/low) ونسبة الإجابات دون زمن القراءة. استشاري لا يدخل الدرجة';
comment on column leaders.assessments.retake_requested_at is 'متى طلبت الإدارة إعادة هذا القياس (وهو ملغى). تبقى بطاقة الطلب للمشارك حتى يسلّم قياسًا بعده';

-- زمن القياس المعلن للمشارك: 50 دقيقة تقدير وُضع قبل أي بيانات. وسيط الزمن الفعلي لمن أجابوا بتأنٍّ على baseline-v5
-- نحو 33 دقيقة (مراجعة 2026-11-13، خمسة مجيبين)، فيُعلن 35. عرض فقط: لا يمس سؤالًا ولا مفتاحًا ولا درجة.
update leaders.instruments set est_minutes = 35 where key = 'baseline-v5' and est_minutes = 50;

insert into leaders.schema_migrations (name) values ('20261113110000_leaders_assessment_effort_retake') on conflict do nothing;
