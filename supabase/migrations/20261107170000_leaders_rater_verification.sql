-- ════════════════════════════════════════════════════════════════
-- التحقق من المقيّمين الخارجيين (D19 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- verification: org_domain (من نطاق جهة المشارك، يُرسل فورًا)، confirmed (أكده المستشار أو المنسق)،
-- pending (بريد عام أو نطاق آخر أو مشارك فردي: الدعوة awaiting لا تُرسل حتى يؤكده)، rejected (لم يُعتمد).
-- verification_flags سبب الانتظار، وverified_by وverified_at من أكد ومتى. ما قبله بلا علامة (null) غير محقق.
-- آمن لإعادة التشغيل.

alter table leaders.raters add column if not exists verification text;
alter table leaders.raters add column if not exists verification_flags text[] not null default '{}';
alter table leaders.raters add column if not exists verified_by text;
alter table leaders.raters add column if not exists verified_at timestamptz;

alter table leaders.raters drop constraint if exists raters_verification_check;
alter table leaders.raters add constraint raters_verification_check
  check (verification is null or verification = any (array['org_domain', 'confirmed', 'pending', 'rejected']));
alter table leaders.raters drop constraint if exists raters_verified_by_check;
alter table leaders.raters add constraint raters_verified_by_check check (verified_by is null or char_length(verified_by) <= 300);
alter table leaders.raters drop constraint if exists raters_status_check;
alter table leaders.raters add constraint raters_status_check
  check (status = any (array['awaiting', 'invited', 'submitted', 'revoked']));

create index if not exists raters_awaiting on leaders.raters (participant_id) where status = 'awaiting';

insert into leaders.schema_migrations (name) values ('20261107170000_leaders_rater_verification') on conflict do nothing;
