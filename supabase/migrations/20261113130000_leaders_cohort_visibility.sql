-- ════════════════════════════════════════════════════════════════
-- استثناءات الرؤية لكل دفعة (تصور التحكم الديناميكي في الرؤية، اعتمده المالك 2026-11-13)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تقرأ العمود إن وُجد وتعمل بالافتراضي العام إن غاب (visibility.ts visibilityOf)، والحفظ قبل الترحيل يقول ذلك بدل أن يفشل
-- المصدر الواحد لمفاتيح الرؤية visibility.js. الافتراضي العام في app_settings (مجموعة visibility)، وهنا ما تستثنيه
-- الدفعة منه وحده: كائن بمفاتيح معروفة وقيم منطقية. الفارغ يعني «كما في الافتراضي العام».
alter table leaders.cohorts add column if not exists visibility jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cohorts_visibility_object_chk') then
    alter table leaders.cohorts add constraint cohorts_visibility_object_chk check (jsonb_typeof(visibility) = 'object');
  end if;
end $$;
comment on column leaders.cohorts.visibility is 'استثناءات الدفعة من مفاتيح الرؤية العامة (visibility.js): ما يراه مستشارها والخبير المسند';

insert into leaders.schema_migrations (name) values ('20261113130000_leaders_cohort_visibility') on conflict do nothing;
