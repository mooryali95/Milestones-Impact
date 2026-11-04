-- ════════════════════════════════════════════════════════════════
-- عملة الاستحقاق المثبَّت، وفهارس أعمدة الفلترة، والفرادة الجزئية (المرحلة هـ، 2026-11-05)
-- ════════════════════════════════════════════════════════════════
-- 1) القيمة المثبّتة لإعفاء الراعي كانت بلا عملة؛ تُسجَّل عملة الإعداد لحظة التثبيت.
-- 2) أعمدة تُفلتر عليها الاستعلامات الساخنة بلا فهرس.
-- 3) قياس جارٍ واحد لكل مشارك وأداة: كان بدء القياس select ثم insert بلا قيد (تسابق)،
--    فتُلغى النسخ الأقدم المكررة أولًا ثم يُفرض القيد. ومنسق واحد لكل بريد في الجهة.

alter table leaders.entitlements add column if not exists currency text;
update leaders.entitlements e set currency = coalesce((select currency from leaders.payment_settings limit 1), 'USD')
  where e.currency is null and e.value_cents is not null;

create index if not exists enrollments_cohort_idx          on leaders.enrollments (cohort_id);
create index if not exists expert_ratings_participant_idx  on leaders.expert_ratings (participant_id);
create index if not exists entitlements_organization_idx   on leaders.entitlements (organization_id) where organization_id is not null;
create index if not exists payments_email_idx              on leaders.payments (email);
create index if not exists reports_participant_idx         on leaders.reports (participant_id);
create index if not exists reports_organization_idx        on leaders.reports (organization_id);
create index if not exists model_submissions_status_idx    on leaders.model_submissions (status);
create index if not exists audit_log_created_idx           on leaders.audit_log (created_at desc);
create index if not exists audit_log_actor_idx             on leaders.audit_log (actor);
create index if not exists hall_presence_last_seen_idx     on leaders.hall_presence (last_seen);

-- قياس جارٍ واحد: الأقدم من أي نسخ مكررة يُلغى (void) ويبقى الأحدث
update leaders.assessments a set status = 'void'
  where a.status = 'in_progress'
    and exists (select 1 from leaders.assessments b
                where b.participant_id = a.participant_id and b.instrument_id = a.instrument_id
                  and b.status = 'in_progress' and b.started_at > a.started_at);
create unique index if not exists assessments_one_in_progress
  on leaders.assessments (participant_id, instrument_id) where status = 'in_progress';

create unique index if not exists org_coordinators_org_email_uniq
  on leaders.org_coordinators (organization_id, lower(email));

insert into leaders.schema_migrations (name) values ('20261105120000_leaders_entitlement_currency_indexes') on conflict do nothing;
