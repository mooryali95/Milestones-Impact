-- ════════════════════════════════════════════════════════════════
-- سجل الموافقات التاريخي (D18 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- سطر لكل موافقة أو تجديد أو تغيير في موافقة المشاركة مع الجهة، لكل صاحب حساب (مشارك، منسق، خبير، مقيّم):
-- النسخة وبصمة نص الوثائق (policy-digest.js) والوقت. لا يُعدَّل ولا يُحذف سطر: التعديل والحذف والتفريغ مرفوضة
-- بمشغّل، فهو دليل الموافقة. لا اسم فيه ولا بريد: المعرّف وحده. لا يقرؤه إلا دور الخدمة. آمن لإعادة التشغيل.

create table if not exists leaders.consent_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  subject text not null check (subject in ('participant', 'coordinator', 'expert', 'rater')),
  subject_id text not null check (char_length(subject_id) <= 64),
  kind text not null check (kind in ('accept', 'renew', 'org_share_on', 'org_share_off')),
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  text_digest text check (text_digest ~ '^[0-9a-f]{64}$')
);
create index if not exists consent_events_subject on leaders.consent_events (subject, subject_id, created_at desc);
alter table leaders.consent_events enable row level security;

create or replace function leaders.consent_events_frozen() returns trigger language plpgsql as $$
begin
  raise exception 'سجل الموافقات لا يُعدَّل ولا يُحذف' using errcode = '42501';
end $$;
drop trigger if exists consent_events_frozen on leaders.consent_events;
create trigger consent_events_frozen before update or delete on leaders.consent_events
  for each row execute function leaders.consent_events_frozen();
drop trigger if exists consent_events_no_truncate on leaders.consent_events;
create trigger consent_events_no_truncate before truncate on leaders.consent_events
  for each statement execute function leaders.consent_events_frozen();

revoke all on leaders.consent_events from anon, authenticated;
revoke all on sequence leaders.consent_events_id_seq from anon, authenticated;
revoke all on function leaders.consent_events_frozen() from public;

insert into leaders.schema_migrations (name) values ('20261107160000_leaders_consent_events') on conflict do nothing;
